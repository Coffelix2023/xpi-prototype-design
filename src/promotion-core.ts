/**
 * promotion-core — 核对判定与它的文本渲染，**刻意不碰 `typebox`，也不碰 Pi 运行时**。
 *
 * 为什么必须这样分：判定只要不能被 Pi 会话之外的东西调用，客户端就会（也必须）
 * 自己复写一份 —— 于是 `rg -q --fixed-strings "\"$id\""` 那种宽松口径会出现，
 * 同一份源码得出「脚本 OK / 工具缺 6 个」两个相反结论。把纯逻辑放在这里，
 * 客户端 CI 就能调**同一个**判定，而不是抄一份。
 *
 * 因此本模块的 import 只允许 `node:*` 与 `./semantic-map-io.js`、`./semantic-ui-map.js`。
 * `promotion-core.test.ts` 把这条约束断言下来了。
 *
 * 事实来源纪律：元素条目 `impl` 的有无就是搬运进度，不维护第二份清单。
 * 字典里没有 `impl` 的元素**不参与核对**——否则整个字典都会红。
 */
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { readProjectMap } from "./semantic-map-io.js";
import {
  pagePrefix,
  type SemanticElement,
  type SemanticMap,
  withinPage,
} from "./semantic-ui-map.js";

/** 工具输出上限；与 tools.ts 同一条纪律：回灌上下文必须有界。 */
const MAX_OUTPUT = 2_000;

/**
 * 每类结果的展示上限。
 *
 * 各类**分开**计数、分开封顶，不合并成一个总数：合并会让「只搬了容器没搬子项」
 * 这种需要立刻处理的信息，淹没在一堆刚起步时的未登记条目里。
 */
const MAX_ITEMS = 10;

/**
 * 源码侧的字面量 `data-semantic-id` 属性。
 *
 * 值刻意排除引号与尖括号，使正则不会跨属性啃到下一个标签；单双引号都认。
 * 属性顺序不影响匹配，因为这里不解析 JSX——待匹配的是一个手写的字面属性。
 *
 * 已知边界：注释或字符串里出现同样的字面量也会被算作命中。误判方向是
 * 「漏报缺失」，属可接受的保守失败；测试把这条断言下来了。
 */
const ID_ATTR_PATTERN = /\bdata-semantic-id\s*=\s*(["'])([^"'<>]+)\1/g;

/**
 * 动态属性形态：`data-semantic-id={...}`。
 *
 * 这是**文件级**信号，不是元素级：一个文件里只要有任意一处动态表达式，
 * 该文件里所有未命中的元素都归 `dynamic_attribute`。刻意的粗粒度——
 * 元素级归因要解析 JSX，而那会引入 TS 解析器依赖；而两个桶都往
 * `dynamic_attribute` 倾斜是安全的：把真缺失说成「可能动态」会促使人去看那个
 * 文件（顺路就发现真相），反过来则送人去写已经存在的代码。
 */
const DYNAMIC_ATTR_PATTERN = /\bdata-semantic-id\s*=\s*\{/;

export type PromotionStatus =
  /** 有字典，各类问题都为 0。 */
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
  /**
   * 该元素没有字面量属性，而所在文件里有 `data-semantic-id={...}` 动态表达式。
   * 静态核对看不到它，需要人先确认渲染点是否真带该属性。
   */
  dynamic: string[];
  dynamicTotal: number;
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

/** 该源码里是否存在 `data-semantic-id={...}` 动态表达式。 */
export function hasDynamicAttribute(source: string): boolean {
  return DYNAMIC_ATTR_PATTERN.test(source);
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
    dynamic: [],
    dynamicTotal: 0,
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
  const dynamic: string[] = [];
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
    // 文件级动态信号：决定本文件里未命中的元素该进哪个桶。
    const hasDynamic = hasDynamicAttribute(source);
    for (const element of elements) {
      if (present.has(element.id)) matched += 1;
      else if (hasDynamic) dynamic.push(element.id);
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
  const dynamicList = [
    ...dynamic,
  ].sort();
  const status: PromotionStatus =
    missing.length > 0 ||
    unpromoted.length > 0 ||
    unregisteredList.length > 0 ||
    dynamicList.length > 0
      ? "issues"
      : "clean";

  return {
    mapPath: loaded.mapPath,
    matched,
    dynamic: dynamicList.slice(0, MAX_ITEMS),
    dynamicTotal: dynamicList.length,
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

/**
 * 命令入口与 CI 用的退出码，**fail-closed**：
 *
 * 只有 `clean` 给 0。`missing`（没字典）与 `unreadable`（字典坏）也返回非零——
 * 那两类下各问题列表**都是空的**，若按「列表为空即通过」判定，CI 会在什么都没
 * 核对的情况下变绿，正是本仓反复要消除的假绿灯。
 *
 * 用法错误（参数缺失、`--project` 非法）不走这里，由入口自己返回 2。
 */
export function exitCodeFor(result: PromotionCheckResult): number {
  return result.status === "clean" ? 0 : 1;
}

export function truncate(text: string): string {
  return text.slice(0, MAX_OUTPUT);
}

/** 一类结果的标题行：带总数与已显示数，避免截断被当成完整结果。 */
function section(title: string, total: number, shown: number): string[] {
  return [
    `${title}（共 ${total} 条，已显示 ${shown} 条）：`,
  ];
}

/**
 * 把结果渲染成给人和给 CI 看的同一段文本。
 *
 * 工具与命令入口**共用这一个函数**：两份文案会和两份判定一样漂移。
 */
export function promotionText(result: PromotionCheckResult, project: string): string {
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
    lines.push("四类差异均为 0：字典声称已推进的元素，源码里都能找到。");
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

  if (result.dynamicTotal > 0) {
    lines.push(
      ...section(
        "◐ 属性写成动态表达式，静态核对看不到",
        result.dynamicTotal,
        result.dynamic.length,
      ),
    );
    for (const id of result.dynamic) lines.push(`  ${id}`);
    lines.push(
      "  这些元素所在文件的渲染点是 `data-semantic-id={...}` 动态表达式，本核对看不到它们是否真的带上了该属性。",
      "  先确认渲染点：确实带就接受「静态核对看不到」，或用全路径字面量重写，使本核对与源码 grep 都能命中。",
    );
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
