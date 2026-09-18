/**
 * semantic-tools — 两个**只读**语义工具：校验与解析。
 *
 * 与 `semantic-annotate.ts` 分文件是刻意的：那个模块写盘（徽标后处理），这个模块
 * 一个字节都不写，也就完全不碰计划闸门（`gate.ts` 只拦 `write` / `edit`）。
 * 「这个模块碰不碰盘」是评审时最需要一眼看出的属性，混进同一个文件就没了。
 *
 * 这里只把既有库函数包成运行时入口——`loadSemanticMap` / `validateSemanticMap` /
 * `parseInput`；类型真相仍在 `semantic-ui-map.ts`，本模块不复制类型。
 *
 * 无字典、字典读不出来、字典有问题，是**三种**不同的事，分别报：
 * 「没校验」绝不能渲染成「校验通过」。
 */
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  type ElementType,
  type Fidelities,
  type ImplMapping,
  loadSemanticMap,
  parseInput,
  type SemanticElement,
  type SemanticMap,
  type Status,
  semanticMapPattern,
  type ValidationError,
  validateSemanticMap,
} from "./semantic-ui-map.js";
import { projectSchema } from "./tools.js";

/** 工具输出上限；与 tools.ts 同一条纪律：回灌上下文必须有界。 */
const MAX_OUTPUT = 2_000;

/**
 * 列表类输出的条数上限。
 *
 * 别名匹配是 `includes`，中文单字（「按钮」）可能命中几十个元素；问题码同理，
 * 修完前 10 条再重跑比一次看 80 条有用。超出的报总数，让 Agent 知道列表被截过。
 */
const MAX_ITEMS = 10;

function truncate(text: string): string {
  return text.slice(0, MAX_OUTPUT);
}

/** 元素摘要。解析工具只需要 Agent 能接着往下走的最小字段集。 */
export interface ElementSummary {
  fidelities: Fidelities;
  id: string;
  /** 生产落点；还没推进生产时为 null，不是缺字段。 */
  impl: ImplMapping | null;
  short: string;
  status: Status;
  type: ElementType;
}

function summarize(element: SemanticElement): ElementSummary {
  return {
    fidelities: element.fidelities,
    id: element.id,
    impl: element.impl ?? null,
    short: element.short,
    status: element.status,
    type: element.type,
  };
}

export type ValidateStatus = "invalid" | "missing" | "unreadable" | "valid";

export interface ValidateToolResult {
  /** 已截断的问题码列表；`total` 才是真实条数。 */
  errors: ValidationError[];
  /** 字典路径，相对项目根；没有字典时为 null。 */
  mapPath: string | null;
  /** 文件在、但读不出来时的原因；其余情况为 null。 */
  problem: string | null;
  shown: number;
  status: ValidateStatus;
  total: number;
  version: number | null;
}

export type ParseStatus =
  | "ambiguous"
  | "matched"
  | "missing"
  | "unreadable"
  | "unregistered";

export interface ParseToolResult {
  /** 已按 `MAX_ITEMS` 截断的候选；`total` 才是真实条数。 */
  candidates: ElementSummary[];
  element: ElementSummary | null;
  mapPath: string | null;
  problem: string | null;
  shown: number;
  status: ParseStatus;
  total: number;
}

export interface LoadedMap {
  map: SemanticMap | null;
  mapPath: string;
  /** 文件在、但读不出来（YAML 坏了，或没有 `meta`）——与「文件不存在」不同。 */
  unreadable: string | null;
}

/**
 * 读字典，把「没有字典」与「字典坏了」分开。
 *
 * `loadSemanticMap` 对不存在的文件返回 null、对坏 YAML 抛错，但「文件在、却没有
 * `meta`」也走 null 那条路。后者若报成「缺失」，Agent 会去重新建骨架，而骨架又是
 * 幂等的（不覆写）——于是它会卡在一个看不见的原因上。所以这里补一次 `stat` 区分。
 */
export async function readProjectMap(
  projectRoot: string,
  project: string,
): Promise<LoadedMap> {
  const mapPath = semanticMapPattern(projectRoot, project);
  try {
    const map = await loadSemanticMap(projectRoot, project);
    if (map)
      return {
        map,
        mapPath,
        unreadable: null,
      };
  } catch (error) {
    return {
      map: null,
      mapPath,
      unreadable: (error as Error).message,
    };
  }
  try {
    await stat(resolve(projectRoot, mapPath));
  } catch {
    return {
      map: null,
      mapPath,
      unreadable: null,
    };
  }
  return {
    map: null,
    mapPath,
    unreadable: "字典文件存在，但顶层不是映射或缺 meta，读不出字典",
  };
}

/** 校验项目字典。三态 + 「文件在但读不出来」，都不写盘。 */
export async function validateProjectMap(
  projectRoot: string,
  project: string,
): Promise<ValidateToolResult> {
  const loaded = await readProjectMap(projectRoot, project);
  if (loaded.unreadable) {
    return {
      errors: [],
      mapPath: loaded.mapPath,
      problem: loaded.unreadable,
      shown: 0,
      status: "unreadable",
      total: 0,
      version: null,
    };
  }
  if (!loaded.map) {
    return {
      errors: [],
      mapPath: null,
      problem: null,
      shown: 0,
      status: "missing",
      total: 0,
      version: null,
    };
  }
  const result = validateSemanticMap(loaded.map);
  return {
    errors: result.errors.slice(0, MAX_ITEMS),
    mapPath: loaded.mapPath,
    problem: null,
    shown: Math.min(result.errors.length, MAX_ITEMS),
    status: result.valid ? "valid" : "invalid",
    total: result.errors.length,
    version: loaded.map.meta.version,
  };
}

/**
 * 把用户的一句话解析成元素。
 *
 * 短码与全路径是精确查找，未命中即 `unregistered`；别名匹配可能多候选，多候选择
 * **不替用户挑**，原样返回列表（封顶 `MAX_ITEMS` 条 + 总数）。
 */
export async function parseProjectInput(
  projectRoot: string,
  project: string,
  input: string,
  page?: string,
): Promise<ParseToolResult> {
  const loaded = await readProjectMap(projectRoot, project);
  const base = {
    candidates: [] as ElementSummary[],
    element: null,
    mapPath: loaded.mapPath,
    problem: null,
    shown: 0,
    total: 0,
  };
  if (loaded.unreadable) {
    return {
      ...base,
      problem: loaded.unreadable,
      status: "unreadable",
    };
  }
  if (!loaded.map)
    return {
      ...base,
      mapPath: null,
      status: "missing",
    };

  const parsed = parseInput(
    input,
    loaded.map,
    page
      ? {
          page,
        }
      : undefined,
  );
  if (parsed.matched) {
    return {
      ...base,
      element: summarize(parsed.element),
      status: "matched",
    };
  }
  const total = parsed.candidates.length;
  return {
    ...base,
    candidates: parsed.candidates.slice(0, MAX_ITEMS).map(summarize),
    shown: Math.min(total, MAX_ITEMS),
    status: parsed.status,
    total,
  };
}

function fidelityLine(element: ElementSummary): string {
  const { wireframe, hifi } = element.fidelities;
  return `fidelities: wireframe=${wireframe ?? "—"} · hifi=${hifi ?? "—"}`;
}

/** 生产落点。没登记就说没登记，不伪造路径顶上。 */
function implLine(element: ElementSummary): string {
  const impl = element.impl;
  if (!impl) return "impl: 未登记生产落点（该元素尚未推进生产）";
  const exported = impl.export ? ` · export ${impl.export}` : "";
  return `impl: ${impl.path}${exported}`;
}

function elementLine(element: ElementSummary): string {
  return `  ${element.id} — short ${element.short} · ${element.type} · ${element.status}`;
}

function validateText(result: ValidateToolResult, project: string): string {
  if (result.status === "missing") {
    return [
      `.pi/prototype-design/${project}/semantic-ui-map.yaml 不存在：本次未做校验（这不是「通过」）。`,
      "先跑 prototype_setup 建骨架，再按 docs/semantic-ui-map-schema.md 登记 pages / elements。",
    ].join("\n");
  }
  if (result.status === "unreadable") {
    return [
      `${result.mapPath} 读不出来：${result.problem}`,
      "本次未做校验（这不是「通过」）；先修好 YAML 再重跑。",
    ].join("\n");
  }
  if (result.status === "valid") {
    return `${result.mapPath}（version ${result.version}）：共 0 条问题码，校验通过，可以往下产出。`;
  }
  const lines = [
    `${result.mapPath}（version ${result.version}）：共 ${result.total} 条问题码，已显示 ${result.shown} 条。`,
  ];
  for (const error of result.errors) {
    const where = error.path ? `${error.path} — ` : "";
    lines.push(`  [${error.code}] ${where}${error.message}`);
  }
  if (result.total > result.shown) {
    lines.push("（其余问题码未显示；先修上面这些再重跑。）");
  }
  return lines.join("\n");
}

function parseText(result: ParseToolResult, project: string, input: string): string {
  if (result.status === "missing") {
    return `.pi/prototype-design/${project}/semantic-ui-map.yaml 不存在，无法解析「${input}」；先建字典。`;
  }
  if (result.status === "unreadable") {
    return `${result.mapPath} 读不出来：${result.problem}；无法解析「${input}」。`;
  }
  if (result.status === "matched" && result.element) {
    return [
      `「${input}」→ ${result.element.id}（short ${result.element.short} · ${result.element.type} · ${result.element.status}）`,
      fidelityLine(result.element),
      implLine(result.element),
    ].join("\n");
  }
  if (result.status === "ambiguous") {
    const lines = [
      `「${input}」匹配到 ${result.total} 个元素，已显示 ${result.shown} 个：不替你挑。`,
      "请让用户用短码指定，或带 page 上下文再问一次。",
    ];
    for (const candidate of result.candidates) lines.push(elementLine(candidate));
    return lines.join("\n");
  }
  return `「${input}」在字典里没有登记：不猜。确认短码/全路径，或先把该元素登记进字典。`;
}

export function registerSemanticReadTools(pi: ExtensionAPI): void {
  pi.registerTool({
    description:
      "只读校验项目的 semantic-ui-map.yaml：ID / 短码冲突、循环引用、非法状态转换、alias 重复、fidelities 路径格式、闭集外的键（unknown-key）、impl 路径格式。返回三态 status（valid / invalid / missing）与问题码列表（code + 元素路径 + 说明），不写盘。字典缺失时明说「未做校验」，不返回空列表冒充通过。",
    label: "校验语义字典",
    name: "semantic_ui_map_validate",
    parameters: Type.Object({
      project: projectSchema,
    }),
    promptSnippet:
      "Validate a project's semantic-ui-map.yaml (read-only, no plan gate).",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await validateProjectMap(ctx.cwd, params.project);
      return {
        details: result,
        content: [
          {
            text: truncate(validateText(result, params.project)),
            type: "text" as const,
          },
        ],
      };
    },
  });

  pi.registerTool({
    description:
      "只读解析用户的口语引用：短码（P1-2-B1）、全路径（chat.composer.send-btn）或中文别名 → 元素。命中返回元素摘要（id / short / status / type / fidelities / impl）；别名多候选时返回封顶 10 条候选 + 总数，要求消歧而不自行挑一个；没登记就报「没登记」。可选 page 参数把搜索收窄到某个页面（页面短码 P1 或全路径 chat）。不写盘。",
    label: "解析语义元素引用",
    name: "semantic_ui_map_parse",
    parameters: Type.Object({
      input: Type.String({
        description: "用户说的那个东西：短码、全路径，或中文别名（如「折叠按钮」）。",
      }),
      page: Type.Optional(
        Type.String({
          description:
            "消歧范围：页面短码（P1）或页面全路径（chat）。多候选时用它收窄。",
        }),
      ),
      project: projectSchema,
    }),
    promptSnippet:
      "Resolve a short code, full path, or Chinese alias to a semantic-ui-map element (read-only).",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await parseProjectInput(
        ctx.cwd,
        params.project,
        params.input,
        params.page,
      );
      return {
        details: result,
        content: [
          {
            text: truncate(parseText(result, params.project, params.input)),
            type: "text" as const,
          },
        ],
      };
    },
  });
}
