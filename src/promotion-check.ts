/**
 * promotion-check — 只读核对：字典声称已推进生产的元素，成品源码里到底有没有。
 *
 * 为什么需要它：`semantic_ui_map_annotate` 只处理原型 HTML，够不到成品源码；
 * `semantic_ui_map_validate` 的契约是**不碰文件系统**（`impl.path` 只查格式），
 * 并进它就等于推翻那条契约。所以核对单独成一个模块。
 *
 * 为什么和 `semantic-tools.ts` 分文件：这个模块引入了那个模块没有的权限面——
 * **读任意源码文件**。「这个模块只读 YAML」是评审时最需要一眼看出的属性，
 * 混进同一个文件就没了。本模块仍然一个字节都不写，因此不碰闸门。
 *
 * 事实来源纪律：元素条目 `impl` 的有无就是搬运进度，不维护第二份清单。
 * 字典里没有 `impl` 的元素**不参与核对**——否则整个字典都会红。
 */
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readProjectMap } from "./semantic-tools.js";
import {
  pagePrefix,
  type SemanticElement,
  type SemanticMap,
  withinPage,
} from "./semantic-ui-map.js";
import { projectSchema } from "./tools.js";

/** 工具输出上限；与 tools.ts 同一条纪律：回灌上下文必须有界。 */
const MAX_OUTPUT = 2_000;

/**
 * 每类结果的展示上限。
 *
 * 四类**分开**计数、分开封顶，不合并成一个总数：合并会让「只搬了容器没搬子项」
 * 这种需要立刻处理的信号，淹没在一堆刚起步时的未登记条目里。
 */
const MAX_ITEMS = 10;

/**
 * 源码侧的 `data-semantic-id` 属性。
 *
 * 值刻意排除引号与尖括号，使正则不会跨属性啃到下一个标签；单双引号都认。
 * 属性顺序不影响匹配，因为这里不解析 JSX——待匹配的是一个手写的字面属性。
 *
 * 已知边界：注释或字符串里出现同样的字面量也会被算作命中。误判方向是
 * 「漏报缺失」，属可接受的保守失败；`promotion-check.test.ts` 把这条断言下来了。
 */
const ID_ATTR_PATTERN = /\bdata-semantic-id\s*=\s*(["'])([^"'<>]+)\1/g;

export type PromotionStatus =
  /** 有字典，三类问题都为 0。 */
  | "clean"
  /** 有字典，且有未命中项。 */
  | "issues"
  /** 没有字典：没做核对，这不是「通过」。 */
  | "missing"
  /** 字典在、但读不出来。 */
  | "unreadable";

/** 有 `impl`、但源码里找不到的元素。 */
export interface MissingEntry {
  id: string;
  /** `impl.path` 原文，相对项目根。 */
  path: string;
  /** 文件不可读时的原因；文件读出来了、只是没有这个 id 时为 null。 */
  reason: string | null;
}

/** 已推进的父元素，与它下面 `status: locked` 却还没推进的子元素。 */
export interface UnpromotedEntry {
  children: string[];
  parent: string;
}

export interface PromotionCheckResult {
  mapPath: string | null;
  /** 有 `impl` 且源码里命中的元素数。 */
  matched: number;
  missing: MissingEntry[];
  /** 截断前的条数；`missing.length` 才是已显示的。 */
  missingTotal: number;
  problem: string | null;
  /** 参与比对的元素数：有 `impl` 的那些。 */
  promoted: number;
  status: PromotionStatus;
  unpromoted: UnpromotedEntry[];
  unpromotedTotal: number;
  unregistered: string[];
  unregisteredTotal: number;
}

/**
 * 已推进元素的子元素里，`status: locked` 却还没推进的那些。
 *
 * 这是「`⋯` 菜单触发器搬了、菜单项没搬」的机械可判定形态。
 *
 * 包含边在字典里有两个方向（父写 `children`、子写 `parent`，schema 里是同一个边的
 * 两个方向），这里取并集：只读一个方向会让另一种写法的字典漏报，而漏报正是本工具
 * 要消除的东西。
 *
 * 未 `locked` 的子元素不算漏——不把它置为 `locked`，就是「这个子项本就不打算进生产」
 * 的合法表达，不需要额外字段。
 */
export function findUnpromotedChildren(map: SemanticMap): UnpromotedEntry[] {
  const byId = new Map(
    map.elements.map((element) => [
      element.id,
      element,
    ]),
  );
  const childrenOf = new Map<string, Set<string>>();

  const link = (parent: string, child: string): void => {
    const existing = childrenOf.get(parent);
    if (existing) existing.add(child);
    else
      childrenOf.set(
        parent,
        new Set([
          child,
        ]),
      );
  };

  for (const element of map.elements) {
    if (element.parent) link(element.parent, element.id);
    for (const child of element.children ?? []) link(element.id, child);
  }

  const result: UnpromotedEntry[] = [];
  for (const element of map.elements) {
    if (!element.impl) continue;
    const children = childrenOf.get(element.id);
    if (!children || children.size === 0) continue;
    const pending = [
      ...children,
    ].filter((id) => {
      const child = byId.get(id);
      return child !== undefined && child.status === "locked" && !child.impl;
    });
    if (pending.length > 0)
      result.push({
        children: pending,
        parent: element.id,
      });
  }
  return result;
}

/** 源码里出现的全部 `data-semantic-id` 值。短码也会被收进来，于是它会被报成未登记。 */
export function collectSemanticIds(source: string): string[] {
  const ids: string[] = [];
  for (const match of source.matchAll(ID_ATTR_PATTERN)) ids.push(match[2]);
  return ids;
}

/**
 * `target` 是否落在 `root` 之内。
 *
 * `impl.path` 的口径是「相对项目根」，但字典可能写出 `../../etc/passwd` 这种值。
 * 越界按不可读处理并说明，**不尝试解析仓库边界**——那会把一个信任边界变成猜谜。
 */
function isInside(root: string, target: string): boolean {
  const base = resolve(root);
  const prefix = base.endsWith(sep) ? base : base + sep;
  return target === base || target.startsWith(prefix);
}

function blank(
  status: PromotionStatus,
  mapPath: string | null,
  problem: string | null,
): PromotionCheckResult {
  return {
    mapPath,
    matched: 0,
    missing: [],
    missingTotal: 0,
    problem,
    promoted: 0,
    status,
    unpromoted: [],
    unpromotedTotal: 0,
    unregistered: [],
    unregisteredTotal: 0,
  };
}

/**
 * 核对一个项目里已推进的元素是否真的落在各自的 `impl.path` 指向的源码里。
 *
 * 扫描范围由字典自己界定：只扫 `impl.path` 去重后的文件集合。这样不必决定
 * 「`src/` 下扫哪些扩展名、排除哪些目录」，也不会扫出大量与原型无关的 id。
 */
export async function checkPromotion(
  projectRoot: string,
  project: string,
  pageId?: string,
): Promise<PromotionCheckResult> {
  const loaded = await readProjectMap(projectRoot, project);
  if (loaded.unreadable) return blank("unreadable", loaded.mapPath, loaded.unreadable);
  if (!loaded.map) return blank("missing", null, null);

  const map = loaded.map;
  const prefix = pageId ? pagePrefix(map, pageId) : null;
  const scoped = prefix
    ? map.elements.filter((element) => withinPage(prefix, element))
    : map.elements;
  const scopedIds = new Set(scoped.map((element) => element.id));

  // 没有 impl 的元素不进比对：它们只是「还没推进」，不是「漏了」。
  const byPath = new Map<string, SemanticElement[]>();
  for (const element of scoped) {
    const path = element.impl?.path;
    if (!path) continue;
    const bucket = byPath.get(path);
    if (bucket) bucket.push(element);
    else
      byPath.set(path, [
        element,
      ]);
  }

  const known = new Set(map.elements.map((element) => element.id));
  const missing: MissingEntry[] = [];
  const unregistered = new Set<string>();
  let matched = 0;
  let promoted = 0;

  for (const [path, elements] of byPath) {
    promoted += elements.length;
    const absolute = resolve(projectRoot, path);
    if (!isInside(projectRoot, absolute)) {
      const reason = "impl.path 落在项目根之外，不予读取";
      for (const element of elements)
        missing.push({
          id: element.id,
          path,
          reason,
        });
      continue;
    }

    let source: string;
    try {
      source = await readFile(absolute, "utf8");
    } catch (error) {
      // 读不出来不等于「没问题」：逐个报，理由带上，不静默跳过。
      const reason = `文件不可读：${(error as Error).message}`;
      for (const element of elements)
        missing.push({
          id: element.id,
          path,
          reason,
        });
      continue;
    }

    const present = new Set(collectSemanticIds(source));
    for (const element of elements) {
      if (present.has(element.id)) matched += 1;
      else
        missing.push({
          id: element.id,
          path,
          reason: null,
        });
    }
    // 同一个值可能在多个文件里出现，收进集合去重。
    for (const id of present) if (!known.has(id)) unregistered.add(id);
  }

  // 子元素判定跑全量字典，再按页面收窄父元素：只跑 scoped 会让
  // 「子元素在 scope 外、父在 scope 内」的边解析不出来。
  const unpromoted = findUnpromotedChildren(map).filter((entry) =>
    scopedIds.has(entry.parent),
  );

  const unregisteredList = [
    ...unregistered,
  ].sort();
  const status: PromotionStatus =
    missing.length > 0 || unpromoted.length > 0 || unregisteredList.length > 0
      ? "issues"
      : "clean";

  return {
    mapPath: loaded.mapPath,
    matched,
    missing: missing.slice(0, MAX_ITEMS),
    missingTotal: missing.length,
    problem: null,
    promoted,
    status,
    unpromoted: unpromoted.slice(0, MAX_ITEMS),
    unpromotedTotal: unpromoted.length,
    unregistered: unregisteredList.slice(0, MAX_ITEMS),
    unregisteredTotal: unregisteredList.length,
  };
}

function truncate(text: string): string {
  return text.slice(0, MAX_OUTPUT);
}

/** 一类结果的标题行：带总数与已显示数，避免截断被当成完整结果。 */
function section(title: string, total: number, shown: number): string[] {
  return [
    `${title}（共 ${total} 条，已显示 ${shown} 条）：`,
  ];
}

function promotionText(result: PromotionCheckResult, project: string): string {
  if (result.status === "missing") {
    return [
      `.pi/prototype-design/${project}/semantic-ui-map.yaml 不存在：本次未做核对（这不是「通过」）。`,
      "字典缺失时没有任何可核对的清单；先跑 prototype_setup 建骨架，并登记 elements 与 impl。",
    ].join("\n");
  }
  if (result.status === "unreadable") {
    return [
      `${result.mapPath} 读不出来：${result.problem}`,
      "本次未做核对（这不是「通过」）；先修好 YAML 再重跑。",
    ].join("\n");
  }

  const lines = [
    `${result.mapPath}：已推进元素 ${result.promoted} 个，源码命中 ${result.matched} 个。`,
  ];
  if (result.promoted === 0) {
    lines.push("字典里还没有登记任何生产落点（impl），本次没有可比对的东西。");
    return lines.join("\n");
  }

  if (result.status === "clean") {
    lines.push("三类差异均为 0：字典声称已推进的元素，源码里都能找到。");
    return lines.join("\n");
  }

  if (result.missingTotal > 0) {
    lines.push(
      ...section("✗ 已推进但源码里找不到", result.missingTotal, result.missing.length),
    );
    for (const entry of result.missing) {
      const reason = entry.reason ? `（${entry.reason}）` : "";
      lines.push(`  ${entry.id} → ${entry.path}${reason}`);
    }
  }

  if (result.unpromotedTotal > 0) {
    lines.push(
      ...section(
        "⊘ 容器搬了、子项没搬",
        result.unpromotedTotal,
        result.unpromoted.length,
      ),
    );
    for (const entry of result.unpromoted) {
      lines.push(`  ${entry.parent} 下未推进：${entry.children.join("、")}`);
    }
    lines.push("  这些子元素是 locked，表示它们本就该进生产；搬完再重跑本核对。");
  }

  if (result.unregisteredTotal > 0) {
    lines.push(
      ...section(
        "＋ 源码有、字典没登记",
        result.unregisteredTotal,
        result.unregistered.length,
      ),
    );
    for (const id of result.unregistered) lines.push(`  ${id}`);
  }

  lines.push(
    "字典维护由 Agent 负责：本工具只报告差异，不判定字典失效，也不阻断任何写入。",
  );
  return lines.join("\n");
}

export function registerPromotionTools(pi: ExtensionAPI): void {
  pi.registerTool({
    description:
      "只读核对：字典里已登记生产落点（impl）的元素，是否真的出现在成品源码里。按 impl.path 定位文件，匹配 data-semantic-id 的全路径值。四类结果分开计数：已推进但源码找不到、容器搬了子项没搬、源码有而字典没登记、命中。字典缺失或读不出来时明说「未做核对」，不返回空结果冒充通过。不写盘、不阻断、不参与写盘许可。",
    label: "核对原型元素的生产落点",
    name: "prototype_promotion_check",
    parameters: Type.Object({
      pageId: Type.Optional(
        Type.String({
          description:
            "只核对某个页面（页面短码 P1 或全路径 chat）；不传则核对字典里的全部页面。",
        }),
      ),
      project: projectSchema,
    }),
    promptSnippet:
      "Check promoted semantic-ui-map elements against production source via data-semantic-id (read-only).",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await checkPromotion(ctx.cwd, params.project, params.pageId);
      return {
        details: result,
        content: [
          {
            text: truncate(promotionText(result, params.project)),
            type: "text" as const,
          },
        ],
      };
    },
  });
}
