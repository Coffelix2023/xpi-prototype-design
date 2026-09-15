/**
 * semantic-ui-map — 语义元素字典：双码标识、YAML 加载、输入解析。
 *
 * 布局：`<cwd>/<ARTIFACT_ROOT>/<project>/semantic-ui-map.yaml`，跨 kind 共享，
 * 因此 wireframe 与 hifi 的天花板是同一个 ID（脊柱模型）。
 *
 * 双码分工：短码（`P1-2-B1`）给人念，全路径（`chat.composer.send-btn`）给机器认。
 * 两者用不同分隔符，格式上互斥，解析器不需要猜输入的是哪一种。
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { ARTIFACT_ROOT, assertProjectSlug, formatStamp } from "./contracts.js";
import type { YamlValue } from "./semantic-ui-map-yaml.js";
import {
  parseYaml,
  yamlMapping,
  yamlNumber,
  yamlOneOf,
  yamlString,
  yamlStringList,
} from "./semantic-ui-map-yaml.js";

/** 字典文件名。与 `product-map.json` 同层，都在项目目录下。 */
export const SEMANTIC_MAP_FILE = "semantic-ui-map.yaml";

/** 元素类型闭集，取自 spec.md「类型枚举」。 */
export const ELEMENT_TYPES = [
  "page",
  "panel",
  "section",
  "button",
  "input",
  "select",
  "toggle",
  "link",
  "text",
  "image",
  "table",
  "list",
  "component",
  "modal",
  "drawer",
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

/** 状态机闭集。转换单向：proposed → confirmed → locked。 */
export const STATUSES = [
  "proposed",
  "confirmed",
  "locked",
] as const;
export type Status = (typeof STATUSES)[number];

/** 原型模式。决定 `fidelities` 是 `#/route` 锚点还是独立 HTML 文件路径。 */
export const MAP_TYPES = [
  "spa",
  "multi-page",
] as const;
export type MapType = (typeof MAP_TYPES)[number];

/** 元素诞生的保真度阶段。原型止于 hifi，不含 code。 */
export const STAGES = [
  "wireframe",
  "hifi",
] as const;
export type Stage = (typeof STAGES)[number];

/** props 契约的类型闭集。 */
export const PROP_TYPES = [
  "string",
  "number",
  "boolean",
  "enum",
  "array",
  "asset",
] as const;
export type PropType = (typeof PROP_TYPES)[number];

export interface PropDefinition {
  /** 当前值。改 props 只改这里，不重写 HTML 结构。 */
  current: unknown;
  type: PropType;
  /** 仅 `enum` 类型需要；合法取值闭集。 */
  values?: readonly (string | number)[];
}

/** 跨保真度锚点。未到的阶段为 null，不是缺字段。 */
export interface Fidelities {
  hifi: string | null;
  wireframe: string | null;
}

export interface SemanticPage {
  /** 全路径页码，例如 `chat`。元素的 id 以它开头。 */
  id: string;
  label: string;
  route: string;
  /** YAML `pages` 的键，例如 `P1`。 */
  short: string;
  status: Status;
}

export interface SemanticElement {
  /** 中文口语别名，与 `label` 一起参与模糊匹配。 */
  aliases?: string[];
  behavior?: {
    current: string;
  };
  children?: string[];
  fidelities: Fidelities;
  i18n_key?: string;
  /** 全路径，全局唯一。 */
  id: string;
  label: string;
  order?: number;
  parent?: string;
  props?: Record<string, PropDefinition>;
  /** 短码，页面内唯一。 */
  short: string;
  stage_created: Stage;
  status: Status;
  type: ElementType;
}

export interface SemanticMapMeta {
  annotate_default: boolean;
  project: string;
  type: MapType;
  updated: string;
  version: number;
}

export interface SemanticMap {
  elements: SemanticElement[];
  meta: SemanticMapMeta;
  pages: SemanticPage[];
}

/** 校验问题码。4.x 扩展：循环引用、状态机非法、alias 冲突、fidelities 路径格式。 */
export type ValidationErrorCode =
  | "duplicate-id"
  | "duplicate-short"
  | "missing-field"
  | "cycle-reference"
  | "invalid-status-transition"
  | "duplicate-alias"
  | "invalid-fidelity-path";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  /** 出问题的元素全路径。 */
  path?: string;
}

export interface ParseContext {
  /** 消歧范围：页面短码（`P1`）或页面全路径（`chat`）。 */
  page?: string;
}

export type ParseResult =
  | {
      element: SemanticElement;
      matched: true;
    }
  | {
      candidates: SemanticElement[];
      matched: false;
      status: "ambiguous" | "unregistered";
    };

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** 字典文件的绝对路径。slug 是信任边界，越界直接抛错。 */
function semanticMapPath(projectRoot: string, project: string): string {
  const root = resolve(projectRoot);
  assertProjectSlug(project);
  const target = resolve(root, ARTIFACT_ROOT, project, SEMANTIC_MAP_FILE);
  if (!target.startsWith(`${root}${sep}${ARTIFACT_ROOT}${sep}`)) {
    throw new Error(`Refusing to operate outside ${ARTIFACT_ROOT}: ${target}`);
  }
  return target;
}

/** 相对项目根的字典路径，供工具输出使用。 */
export function semanticMapPattern(projectRoot: string, project: string): string {
  return relative(resolve(projectRoot), semanticMapPath(projectRoot, project))
    .split(sep)
    .join("/");
}

/**
 * 归一化跨阶段锚点。空串与 `~` 一样视为「还没到那个阶段」，读成 null。
 * 这样 `hifi:` 后面留空和写 `null` 不会产生两种语义。
 */
function toFidelities(raw: YamlValue | undefined): Fidelities {
  const mapping = yamlMapping(raw) ?? {};
  const anchor = (value: YamlValue | undefined): string | null => {
    const text = yamlString(value);
    return text && text.length > 0 ? text : null;
  };
  return {
    hifi: anchor(mapping.hifi),
    wireframe: anchor(mapping.wireframe),
  };
}

function toProps(
  raw: YamlValue | undefined,
): Record<string, PropDefinition> | undefined {
  const mapping = yamlMapping(raw);
  if (!mapping) return undefined;
  const props: Record<string, PropDefinition> = {};
  for (const [name, value] of Object.entries(mapping)) {
    const source = yamlMapping(value);
    if (!source) continue;
    const definition: PropDefinition = {
      current: source.current ?? null,
      type: yamlOneOf(PROP_TYPES, source.type) ? source.type : "string",
    };
    if (Array.isArray(source.values)) {
      const values = source.values.filter(
        (item): item is string | number =>
          typeof item === "string" || typeof item === "number",
      );
      if (values.length > 0) definition.values = values;
    }
    props[name] = definition;
  }
  return Object.keys(props).length > 0 ? props : undefined;
}

function toMeta(raw: YamlValue | undefined): SemanticMapMeta {
  const mapping = yamlMapping(raw) ?? {};
  return {
    annotate_default:
      typeof mapping.annotate_default === "boolean" ? mapping.annotate_default : true,
    project: yamlString(mapping.project) ?? "",
    type: yamlOneOf(MAP_TYPES, mapping.type) ? mapping.type : "spa",
    updated: yamlString(mapping.updated) ?? "",
    version: yamlNumber(mapping.version) ?? 1,
  };
}

function toPages(raw: YamlValue | undefined): SemanticPage[] {
  const mapping = yamlMapping(raw);
  if (!mapping) return [];
  const pages: SemanticPage[] = [];
  for (const [short, value] of Object.entries(mapping)) {
    const source = yamlMapping(value);
    if (!source) continue;
    pages.push({
      id: yamlString(source.id) ?? "",
      label: yamlString(source.label) ?? "",
      route: yamlString(source.route) ?? "",
      short,
      status: yamlOneOf(STATUSES, source.status) ? source.status : "proposed",
    });
  }
  return pages;
}

/** 单个元素条目。`id` 来自映射键或条目字段，两条路径共用这一处归一化。 */
function toElement(id: string, raw: YamlValue): SemanticElement | null {
  const source = yamlMapping(raw);
  if (!source) return null;
  const element: SemanticElement = {
    fidelities: toFidelities(source.fidelities),
    id,
    label: yamlString(source.label) ?? "",
    short: yamlString(source.short) ?? "",
    stage_created: yamlOneOf(STAGES, source.stage_created)
      ? source.stage_created
      : "wireframe",
    status: yamlOneOf(STATUSES, source.status) ? source.status : "proposed",
    type: yamlOneOf(ELEMENT_TYPES, source.type) ? source.type : "component",
  };
  const aliases = yamlStringList(source.aliases);
  if (aliases) element.aliases = aliases;
  const behavior = yamlString(yamlMapping(source.behavior)?.current);
  if (behavior)
    element.behavior = {
      current: behavior,
    };
  const children = yamlStringList(source.children);
  if (children) element.children = children;
  const i18nKey = yamlString(source.i18n_key);
  if (i18nKey) element.i18n_key = i18nKey;
  const order = yamlNumber(source.order);
  if (order !== undefined) element.order = order;
  const parent = yamlString(source.parent);
  if (parent) element.parent = parent;
  const props = toProps(source.props);
  if (props) element.props = props;
  return element;
}

/**
 * 归一化元素注册表，两种写法都接受：
 *
 *   elements:                      # 映射式，键就是 id
 *     "chat.composer": { ... }
 *   elements:                      # 序列式，id 写在条目里
 *     - id: "chat.composer"
 *
 * 映射式的重复键在 YAML 层就被拒绝；序列式才可能在 id 上撞车，
 * 那正是 `checkUniqueness` 要报的错。
 */
function toElements(raw: YamlValue | undefined): SemanticElement[] {
  const elements: SemanticElement[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = yamlString(yamlMapping(item)?.id);
      if (id === undefined) continue;
      const element = toElement(id, item);
      if (element) elements.push(element);
    }
    return elements;
  }
  const mapping = yamlMapping(raw);
  if (!mapping) return [];
  for (const [id, value] of Object.entries(mapping)) {
    const element = toElement(id, value);
    if (element) elements.push(element);
  }
  return elements;
}

/**
 * 把字典源码解析成 `SemanticMap`。
 *
 * 返回 null 只有一种含义：**这不是一份字典**——顶层不是映射，或缺少 `meta`。
 * 字段级的问题（缺 label、枚举越界）不在这里拦，留给校验器报告，
 * 这样「加载」和「体检」是两件互不阻塞的事。
 */
export function parseSemanticMap(source: string): SemanticMap | null {
  const top = yamlMapping(parseYaml(source));
  if (!top || !yamlMapping(top.meta)) return null;
  return {
    elements: toElements(top.elements),
    meta: toMeta(top.meta),
    pages: toPages(top.pages),
  };
}

/**
 * 读取项目字典。文件不存在返回 null（优雅降级），解析失败则抛错。
 *
 * 缺文件是「这个项目还没启用语义标注」，属于正常状态；读得懂却读不对是配置损坏，
 * 静默当成没有会让用户拿着一个坏字典继续改。
 */
export async function loadSemanticMap(
  projectRoot: string,
  project: string,
): Promise<SemanticMap | null> {
  const path = semanticMapPath(projectRoot, project);
  if (!(await exists(path))) return null;
  return parseSemanticMap(await readFile(path, "utf8"));
}

/** 建骨架与递增版本的结果。`path` 一律相对项目根，可直接进工具输出。 */
export interface SemanticMapFileResult {
  path: string;
  status: "created" | "present";
}

export interface SemanticMapVersionResult {
  path: string;
  updated: string;
  version: number;
}

/**
 * 空字典骨架。`pages` / `elements` 用流式空映射：解析器认，人工补条目也顺手。
 *
 * `meta` 之外的字段刻意留空——骨架只保证「这是一份字典」，页面与元素由 agent
 * 在深挖后登记；`prototype_snapshot` 之后 version 从这里往上走。
 */
function emptySemanticMapTemplate(project: string, stamp: string): string {
  return `# semantic-ui-map — ${project}
#
# 双码分工：短码 P1-2-B1 给人念，全路径 chat.composer.send-btn 给机器认。
# 本文件跨保真度共享：同一元素在 wireframe 与 hifi 阶段的 id / short 不变，
# 只有 fidelities 各指一处。字段说明见 docs/semantic-ui-map-schema.md。
meta:
  project: ${project}
  version: 1
  type: spa
  updated: ${stamp}
  annotate_default: true
pages: {}
elements: {}
`;
}

/**
 * 初始化时建空字典。已存在则完全不改动——字典是人工维护的资产，扩展不覆写。
 */
export async function createEmptySemanticMap(
  projectRoot: string,
  project: string,
  now: Date = new Date(),
): Promise<SemanticMapFileResult> {
  const target = semanticMapPath(projectRoot, project);
  const path = semanticMapPattern(projectRoot, project);
  if (await exists(target))
    return {
      path,
      status: "present",
    };
  await mkdir(dirname(target), {
    recursive: true,
  });
  await writeFile(target, emptySemanticMapTemplate(project, formatStamp(now)), "utf8");
  return {
    path,
    status: "created",
  };
}

const META_LINE_PATTERN = /^meta:[ \t]*$/;
const INDENTED_LINE_PATTERN = /^[ \t]/;
const INDENT_PATTERN = /^[ \t]+/;

/**
 * 只改写 `meta` 块里的 `version` / `updated` 两行，其余字节原样保留。
 *
 * 不重新序列化整份字典：人工写的注释、字段顺序、映射/序列两种写法都得活下去，
 * 为了一次加一而重排全文件是拿用户的资产冒险。找不到 `meta` 块就返回 null。
 */
function bumpMetaLines(
  source: string,
  version: number,
  updated: string,
): string | null {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => META_LINE_PATTERN.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0) continue;
    if (!INDENTED_LINE_PATTERN.test(line)) {
      end = index;
      break;
    }
  }
  const block = lines.slice(start + 1, end);
  const indent =
    block
      .find((line) => INDENTED_LINE_PATTERN.test(line))
      ?.match(INDENT_PATTERN)?.[0] ?? "  ";
  const write = (key: string, value: string): void => {
    const next = `${indent}${key}: ${value}`;
    const at = block.findIndex((line) => line.trimStart().startsWith(`${key}:`));
    if (at >= 0) block[at] = next;
    else block.push(next);
  };
  write("version", String(version));
  write("updated", updated);
  return [
    ...lines.slice(0, start + 1),
    ...block,
    ...lines.slice(end),
  ].join("\n");
}

/**
 * 快照后递增字典版本：version 加一、updated 换成当前时间，写回原文件。
 *
 * 返回 null 有四种情况，一律**不写盘**、不改动：没启用语义标注（文件不存在）、
 * 文件读不懂（YAML 非法、顶层不是映射或缺 meta）、meta 块找不到。降级要静默且无损——
 * 递增版本失败不该让一次成功的快照看起来像失败了。
 */
export async function incrementSemanticMapVersion(
  projectRoot: string,
  project: string,
  now: Date = new Date(),
): Promise<SemanticMapVersionResult | null> {
  const target = semanticMapPath(projectRoot, project);
  if (!(await exists(target))) return null;
  const source = await readFile(target, "utf8");
  let meta: SemanticMapMeta | undefined;
  try {
    meta = parseSemanticMap(source)?.meta;
  } catch {
    // 损坏的字典不该让一次已经成功的快照看起来失败：不动文件，由调用方报告未递增。
    return null;
  }
  if (!meta) return null;
  const version = meta.version + 1;
  const updated = formatStamp(now);
  const next = bumpMetaLines(source, version, updated);
  if (next === null) return null;
  await writeFile(target, next, "utf8");
  return {
    path: semanticMapPattern(projectRoot, project),
    updated,
    version,
  };
}
const SHORT_CODE_PATTERN = /^P\d+(-\d+)*(-[A-Z]\d+)?$/;

/**
 * 短码格式：`P{页}-{面板}-{元素}`，分隔符固定为 `-`。
 *
 * 用 `-` 而不是 `.` 是有意的：`.` 留给全路径，两种码在格式上互斥，
 * 解析器不必猜输入的是哪一种；`-` 也是合法的 HTML id 字符，`#P1-2-B1` 可直接选中。
 */
export function validateShortCode(short: string): boolean {
  return SHORT_CODE_PATTERN.test(short);
}

const FULL_PATH_PATTERN =
  /^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$/;

const FIDELITY_ANCHOR_PATTERN = /^#[^\s#]+$/;
const FIDELITY_HTML_PATTERN =
  /^(?:\.\.\/|\.\/)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.html(?:#[^\s#]+)?$/;
/** 全路径格式：小写 kebab-case，用 `.` 分层。段数不限，深度由页面结构决定。 */
export function validateFullPath(id: string): boolean {
  return FULL_PATH_PATTERN.test(id);
}

/**
 * 双码唯一性：任意短码或全路径只能指向一个元素。
 *
 * 映射式 `elements` 的重复键在 YAML 层就被拒了，这里主要拦序列式写法，
 * 以及复制粘贴出来的短码撞车。报错带上元素路径，用户才知道该改哪一条。
 */
export function checkUniqueness(map: SemanticMap): ValidationError[] {
  const errors: ValidationError[] = [];
  const byId = new Map<string, SemanticElement>();
  const byShort = new Map<string, SemanticElement>();
  for (const element of map.elements) {
    const sameId = byId.get(element.id);
    if (sameId) {
      errors.push({
        code: "duplicate-id",
        message: `元素 ID 冲突：「${element.id}」被重复注册`,
        path: element.id,
      });
    } else {
      byId.set(element.id, element);
    }
    const sameShort = byShort.get(element.short);
    if (sameShort) {
      errors.push({
        code: "duplicate-short",
        message: `短码冲突：「${element.short}」同时指向「${sameShort.id}」和「${element.id}」`,
        path: element.id,
      });
    } else {
      byShort.set(element.short, element);
    }
  }
  return errors;
}

interface SemanticIndex {
  byId: Map<string, SemanticElement>;
  byShort: Map<string, SemanticElement>;
}

/**
 * 索引按 `SemanticMap` 对象身份缓存：同一份字典只建一次，之后每次查找都是 O(1)。
 * 用 WeakMap 是为了不给 `SemanticMap` 塞私有字段——它同时是要序列化回 YAML 的数据。
 */
const INDEX_CACHE = new WeakMap<SemanticMap, SemanticIndex>();

function indexOf(map: SemanticMap): SemanticIndex {
  const cached = INDEX_CACHE.get(map);
  if (cached) return cached;
  const index: SemanticIndex = {
    byId: new Map(),
    byShort: new Map(),
  };
  for (const element of map.elements) {
    if (!index.byId.has(element.id)) index.byId.set(element.id, element);
    if (!index.byShort.has(element.short)) {
      index.byShort.set(element.short, element);
    }
  }
  INDEX_CACHE.set(map, index);
  return index;
}

/**
 * 把 `context.page` 解析成 id 前缀。短码（`P1`）和全路径（`chat`）都接受，
 * 因为用户两种都可能说。
 *
 * 页面没登记时退一步按原文当前缀：草稿阶段的字典常常只有元素、`pages` 还是空的，
 * 此时 `chat.composer` 仍应能按 `chat` 收窄。
 */
function pagePrefix(map: SemanticMap, page: string): string | null {
  const needle = page.trim();
  if (needle.length === 0) return null;
  const matched = map.pages.find((item) => item.short === needle || item.id === needle);
  return matched ? matched.id : needle;
}

function withinPage(prefix: string, element: SemanticElement): boolean {
  return element.id === prefix || element.id.startsWith(`${prefix}.`);
}

/** 中文别名模糊匹配：`label` 与 `aliases` 一起当候选文本，大小写不敏感。 */
function matchByLabel(
  map: SemanticMap,
  needle: string,
  context: ParseContext | undefined,
): SemanticElement[] {
  const prefix = context?.page ? pagePrefix(map, context.page) : null;
  const lower = needle.toLowerCase();
  return map.elements.filter((element) => {
    if (prefix && !withinPage(prefix, element)) return false;
    const texts = [
      element.label,
      ...(element.aliases ?? []),
    ];
    return texts.some((text) => text.toLowerCase().includes(lower));
  });
}

function unregistered(): ParseResult {
  return {
    candidates: [],
    matched: false,
    status: "unregistered",
  };
}

/**
 * 把用户的一句话解析成唯一元素。
 *
 * 三条路径按可靠性排序，先到先得：短码 → 全路径 → 中文别名。前两条是精确查找，
 * 命中即唯一、未命中即 `unregistered`，绝不退化成模糊匹配——把 `P1-2-B1` 猜成别的元素
 * 比说一句「没登记」代价高得多。只有别名这一步可能返回多候选，交给用户消歧。
 */
export function parseInput(
  input: string,
  map: SemanticMap,
  context?: ParseContext,
): ParseResult {
  const needle = input.trim();
  if (needle.length === 0) return unregistered();
  const index = indexOf(map);

  if (validateShortCode(needle)) {
    const element = index.byShort.get(needle);
    return element
      ? {
          element,
          matched: true,
        }
      : unregistered();
  }
  if (validateFullPath(needle)) {
    const element = index.byId.get(needle);
    return element
      ? {
          element,
          matched: true,
        }
      : unregistered();
  }

  const candidates = matchByLabel(map, needle, context);
  if (candidates.length === 1) {
    return {
      element: candidates[0],
      matched: true,
    };
  }
  if (candidates.length === 0) return unregistered();
  return {
    candidates,
    matched: false,
    status: "ambiguous",
  };
}

/** 4.x 校验结果。 */
export interface ValidationResult {
  errors: ValidationError[];
  valid: boolean;
}

/**
 * 4.1 validateSemanticMap — 集成六类检查。
 *
 * 按顺序执行：必填字段 → ID/短码唯一性 → 循环引用 → 状态机 → alias 重复
 * → fidelities 路径格式。
 */
export function validateSemanticMap(map: SemanticMap): ValidationResult {
  const errors: ValidationError[] = [];
  errors.push(...detectMissingFields(map));
  errors.push(...checkUniqueness(map));
  errors.push(...detectCycles(map));
  errors.push(...validateStatusTransitions(map));
  errors.push(...detectDuplicateAliases(map));
  errors.push(...validateFidelityPaths(map));
  return {
    errors,
    valid: errors.length === 0,
  };
}

/**
 * 必填字段校验。
 *
 * 可判别的是 `id` / `short` / `label` 三项：加载器对缺失字段回落默认值，回落结果就是
 * 空串，因此「写漏了」和「写成空」在这里是同一件事，也都是错的。`type` / `status` /
 * `stage_created` / `fidelities` 有合法默认值，回落之后与显式赋值无法区分，不在这里判。
 *
 * 这条检查的收益很具体：`short` 为空的条目在标注时会被跳过（没有可念的短码），
 * 不报出来的话用户只会看到「这个元素没有徽标」而不知道原因。
 */
function detectMissingFields(map: SemanticMap): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const element of map.elements) {
    for (const field of [
      "id",
      "short",
      "label",
    ] as const) {
      if (element[field].length > 0) continue;
      const where = element.id.length > 0 ? `「${element.id}」` : "（id 也为空）";
      const error: ValidationError = {
        code: "missing-field",
        message: `元素 ${where} 缺少必填字段 ${field}`,
      };
      if (element.id.length > 0) error.path = element.id;
      errors.push(error);
    }
  }
  return errors;
}

/**
 * 4.2 循环引用检测 — parent/children 图遍历。
 *
 * 用 DFS 找环：A→B→A 或 A→B→C→A。
 */
function detectCycles(map: SemanticMap): ValidationError[] {
  const errors: ValidationError[] = [];
  const byId = new Map(
    map.elements.map((element) => [
      element.id,
      element,
    ]),
  );
  const edges = new Map<string, Set<string>>();
  const addEdge = (from: string, to: string): void => {
    if (!byId.has(from) || !byId.has(to)) return;
    const targets = edges.get(from) ?? new Set<string>();
    targets.add(to);
    edges.set(from, targets);
  };

  // parent and children describe the same containment edge in opposite
  // directions. Normalize both forms to parent -> child before traversing,
  // otherwise every valid parent/child pair looks like a two-node cycle.
  for (const element of map.elements) {
    if (element.parent) addEdge(element.parent, element.id);
    for (const child of element.children ?? []) addEdge(element.id, child);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string, path: string[]): void {
    if (visiting.has(id)) {
      const cycle = [
        ...path,
        id,
      ].join(" → ");
      errors.push({
        code: "cycle-reference",
        message: `检测到循环引用：${cycle}`,
        path: id,
      });
      return;
    }
    if (visited.has(id)) return;

    visiting.add(id);
    for (const child of edges.get(id) ?? []) {
      visit(child, [
        ...path,
        id,
      ]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const element of map.elements) visit(element.id, []);
  return errors;
}

/**
 * 4.3 状态机转换校验 — proposed → confirmed → locked 单向。
 *
 * 检查 parent 的状态不低于 child（confirmed 的 parent 不能是 proposed）。
 */
function validateStatusTransitions(map: SemanticMap): ValidationError[] {
  const errors: ValidationError[] = [];
  const statusOrder: Record<Status, number> = {
    confirmed: 1,
    locked: 2,
    proposed: 0,
  };
  const byId = new Map(
    map.elements.map((el) => [
      el.id,
      el,
    ]),
  );

  for (const element of map.elements) {
    if (element.parent) {
      const parent = byId.get(element.parent);
      if (parent && statusOrder[parent.status] < statusOrder[element.status]) {
        errors.push({
          code: "invalid-status-transition",
          message: `元素「${element.id}」状态为 ${element.status}，但其父元素「${parent.id}」状态为 ${parent.status}（状态回退非法）`,
          path: element.id,
        });
      }
    }
  }
  return errors;
}

/**
 * 4.4 alias 重复检测 — 跨元素的 label 和 aliases 交叉检查。
 *
 * 任意两个元素的 label 或 aliases 不能重叠。
 */
function detectDuplicateAliases(map: SemanticMap): ValidationError[] {
  const errors: ValidationError[] = [];
  const aliasMap = new Map<string, string>();
  for (const element of map.elements) {
    const seenInElement = new Set<string>();
    for (const alias of [
      element.label,
      ...(element.aliases ?? []),
    ]) {
      const key = alias.trim().toLocaleLowerCase();
      if (key.length === 0 || seenInElement.has(key)) continue;
      seenInElement.add(key);
      const existing = aliasMap.get(key);
      if (existing && existing !== element.id) {
        errors.push({
          code: "duplicate-alias",
          message: `别名「${alias}」同时被「${existing}」和「${element.id}」使用`,
          path: element.id,
        });
      } else if (!existing) {
        aliasMap.set(key, element.id);
      }
    }
  }
  return errors;
}

/**
 * 4.5 fidelities 路径格式校验 — 不强制文件存在，仅校验格式。
 *
 * SPA 支持 `#anchor`、`#/route` 与 `relative.html#anchor`；multi-page
 * 支持相对 `.html` 路径及其锚点。
 */
function validateFidelityPaths(map: SemanticMap): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const element of map.elements) {
    const { wireframe, hifi } = element.fidelities;
    for (const [stage, path] of [
      [
        "wireframe",
        wireframe,
      ],
      [
        "hifi",
        hifi,
      ],
    ] as const) {
      if (!path) continue;
      const valid =
        map.meta.type === "spa"
          ? FIDELITY_ANCHOR_PATTERN.test(path) ||
            (FIDELITY_HTML_PATTERN.test(path) && path.includes("#"))
          : FIDELITY_HTML_PATTERN.test(path);
      if (!valid) {
        let message: string;
        if (map.meta.type === "spa") {
          message = `SPA 模式下「${element.id}」的 ${stage} 路径「${path}」必须以 # 开头，或使用带锚点的 HTML 路径`;
        } else if (path.startsWith("#")) {
          message = `multi-page 模式下「${element.id}」的 ${stage} 路径「${path}」不应为锚点`;
        } else {
          message = `multi-page 模式下「${element.id}」的 ${stage} 路径「${path}」格式非法，应为相对 HTML 路径`;
        }
        errors.push({
          code: "invalid-fidelity-path",
          message,
          path: element.id,
        });
      }
    }
  }
  return errors;
}
