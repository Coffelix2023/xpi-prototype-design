/**
 * semantic-annotate — 把语义字典落到**已经产出**的 HTML 上。
 *
 * 分工：HTML 由 agent 写，扩展不生成 HTML。这里只做后处理——给 id 已经写对的元素补
 * `data-semantic-badge` / `data-status`，再注入徽标系统（CSS + 开关按钮）。于是它天然
 * 幂等，而且标注不出来时不静默：返回值里的每个计数都是可核对的结果。
 *
 * 范围过滤按 `meta.type` 分叉：
 *   - `spa`：整站一个文件，锚点是路由（`#/chat`），按文件过滤没有意义，交给 id 命中；
 *   - `multi-page`：只标注 `fidelities[stage]` 指向本文件的元素，跨页面条目不串台。
 *
 * 没有字典（文件不存在）时**一个字节都不写**，只报告跳过——字典是增强功能，
 * 不该成为预览阻塞项。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listHtmlFiles } from "./artifacts.js";
import { addBadgeAttributes, BADGE_ATTR, injectBadgeSystem } from "./badge-template.js";
import { ARTIFACT_ROOT, CURRENT_DIR, type Kind } from "./contracts.js";
import { absoluteStage, pageStagePath } from "./page-artifacts.js";
import {
  loadSemanticMap,
  type SemanticElement,
  type SemanticMap,
  type Stage,
} from "./semantic-ui-map.js";
import { kindSchema, projectSchema } from "./tools.js";

/** 工具输出上限；与 tools.ts 同一条纪律：回灌上下文必须有界。 */
const MAX_OUTPUT = 2_000;

const BADGE_ATTR_PATTERN = new RegExp(`${BADGE_ATTR}="`, "g");

function countBadges(html: string): number {
  return html.match(BADGE_ATTR_PATTERN)?.length ?? 0;
}

function toPattern(projectRoot: string, absolute: string): string {
  return relative(resolve(projectRoot), absolute).split(sep).join("/");
}

const LEADING_DOT_SLASH_PATTERN = /^\.\//;

/**
 * 跨阶段锚点是否落在本文件上。
 *
 * 字典里三种写法都得认：相对项目根的 `pages/p/wireframe/current/index.html#P1`、
 * 相对阶段目录的 `index.html#P1`、以及常见的 `./index.html`。纯锚点（`#P1`）在
 * multi-page 下无法判断归属，**不猜**——交给校验器报 `invalid-fidelity-path`。
 */
function anchorsToFile(
  anchor: string | null,
  target: string,
  basename: string,
): boolean {
  if (anchor === null) return false;
  const path = anchor.split("#")[0].replace(LEADING_DOT_SLASH_PATTERN, "");
  if (path.length === 0) return false;
  if (path === target) return true;
  if (target.endsWith(`/${path}`)) return true;
  return path === basename || path.endsWith(`/${basename}`);
}

/**
 * 本阶段参与匹配的元素。
 *
 * SPA 全量上（id 命中是最后一道筛子）；multi-page 先按「这个阶段有没有锚点」粗筛，
 * 具体落到哪个文件由 `anchorsToFile` 逐文件判断。
 */
function candidatesForStage(map: SemanticMap, stage: Stage): SemanticElement[] {
  const registered = map.elements.filter((element) => element.short.length > 0);
  if (map.meta.type === "spa") return registered;
  return registered.filter((element) => element.fidelities[stage] !== null);
}

export interface AnnotatedFile {
  /** 本次补上徽标属性的标签数（含此前已标注的）。 */
  badges: number;
  /** 相对项目根。 */
  file: string;
}

export interface AnnotateResult {
  /** `meta.annotate_default`：决定注入的徽标初始是显示还是隐藏。 */
  annotateDefault: boolean;
  /** 本阶段参与匹配的元素数。 */
  candidates: number;
  files: AnnotatedFile[];
  /** 字典路径，相对项目根；没有字典时为 null。 */
  mapPath: string | null;
  /** 已标注的文件，相对项目根。 */
  skipped: string[];
  stage: string;
}

export interface AnnotateInput {
  kind: Kind;
  pageId: string;
  project: string;
}

const EMPTY_RESULT = (stage: string): AnnotateResult => ({
  annotateDefault: true,
  candidates: 0,
  files: [],
  mapPath: null,
  skipped: [],
  stage,
});

/**
 * 把页面的字典标注写进该阶段 `current/` 下的每个 HTML。
 *
 * 页面阶段是唯一入口：语义字典的产品级 `pages` 与页面 ID 是一套坐标，默认层
 * （没有 pageId 的旧布局）不在语义标注的射程内。
 */
export async function annotateStage(
  projectRoot: string,
  input: AnnotateInput,
): Promise<AnnotateResult> {
  const stage = pageStagePath(input.project, input.pageId, input.kind);
  const map = await loadSemanticMap(projectRoot, input.project);
  if (!map) return EMPTY_RESULT(stage);

  const candidates = candidatesForStage(map, input.kind);
  const productRoot = resolve(projectRoot, ARTIFACT_ROOT, input.project);
  const current = join(
    absoluteStage(projectRoot, input.project, input.pageId, input.kind),
    CURRENT_DIR,
  );

  const files: AnnotatedFile[] = [];
  const skipped: string[] = [];
  for (const absolute of await listHtmlFiles(current)) {
    const target = relative(productRoot, absolute).split(sep).join("/");
    const basename = absolute.slice(absolute.lastIndexOf(sep) + 1);
    // SPA 一个文件承载全部路由，锚点（`#/chat`）不是文件名：这里不做文件级过滤，
    // 交给 `addBadgeAttributes` 按 id 命中。
    const selected =
      map.meta.type === "spa"
        ? candidates
        : candidates.filter((element) =>
            anchorsToFile(element.fidelities[input.kind], target, basename),
          );

    const source = await readFile(absolute, "utf8");
    const annotated = addBadgeAttributes(source, selected);
    const badges = countBadges(annotated);
    // 一个元素都没命中：不打按钮也不写盘，计数本身就是「锚点没接上」的证据。
    if (badges === 0) {
      skipped.push(toPattern(projectRoot, absolute));
      continue;
    }
    const next = injectBadgeSystem(annotated, map.meta.annotate_default);
    if (next !== source) await writeFile(absolute, next, "utf8");
    files.push({
      badges,
      file: toPattern(projectRoot, absolute),
    });
  }

  return {
    annotateDefault: map.meta.annotate_default,
    candidates: candidates.length,
    files,
    mapPath: toPattern(projectRoot, join(productRoot, "semantic-ui-map.yaml")),
    skipped,
    stage,
  };
}

function truncate(text: string): string {
  return text.slice(0, MAX_OUTPUT);
}

export function registerSemanticTools(pi: ExtensionAPI): void {
  pi.registerTool({
    description:
      "把 semantic-ui-map.yaml 的语义徽标落到该页面阶段 current/ 下的 HTML：给 id 已写对的元素补 data-semantic-badge / data-status，并注入徽标系统（CSS + 开关按钮）。幂等，可重复调用；multi-page 模式只处理 fidelities 指向本文件的元素。字典不存在时不做任何改动，只报告跳过。",
    label: "注入语义徽标",
    name: "semantic_ui_map_annotate",
    parameters: Type.Object({
      kind: kindSchema,
      pageId: Type.String({
        description: "产品地图中的稳定页面 ID；标注只在该页面阶段内进行。",
      }),
      project: projectSchema,
    }),
    promptSnippet:
      "Annotate a page stage's HTML with semantic-ui-map badges (idempotent).",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await annotateStage(ctx.cwd, params);
      if (!result.mapPath) {
        return {
          details: result,
          content: [
            {
              text: truncate(
                [
                  `${result.stage}：未找到 semantic-ui-map.yaml，跳过徽标注入（优雅降级），HTML 未改动。`,
                  "字典就绪后从「初始化/快照」路径重建骨架，再重新调用本工具。",
                ].join("\n"),
              ),
              type: "text" as const,
            },
          ],
        };
      }
      const lines = [
        `${result.stage} ← ${result.mapPath}（annotate_default: ${result.annotateDefault}）`,
        `参与匹配的元素 ${result.candidates} 个；已标注 ${result.files.length} 个文件`,
      ];
      for (const file of result.files) lines.push(`  ${file.file} — ${file.badges} 处`);
      if (result.skipped.length > 0) {
        lines.push(
          `未标注（没有本阶段元素命中，锚点可能没写对）：${result.skipped.join("、")}`,
        );
      }
      lines.push("徽标开关在预览页右上角；非活动页面随页面容器一起隐藏。");
      return {
        details: result,
        content: [
          {
            text: truncate(lines.join("\n")),
            type: "text" as const,
          },
        ],
      };
    },
  });
}
