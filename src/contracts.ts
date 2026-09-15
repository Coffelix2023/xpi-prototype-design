export {
  affectedPages,
  assertCompletePageScope,
  assertPageId,
  executeMigration,
  FIDELITIES,
  type Fidelity,
  IMPLEMENTATIONS,
  type Implementation,
  isFidelity,
  isImplementation,
  isPageId,
  type MapIssue,
  type MigrationFinding,
  type MigrationPlan,
  type MigrationScanEntry,
  PAGE_ID_PATTERN,
  type PageImpactReport,
  type PageLink,
  PRODUCT_MAP_FILE,
  type ProductMap,
  type ProductMapStatus,
  type ProductMapValidation,
  type ProductPage,
  pageImpact,
  parseProductMap,
  productMapStatus,
  readProductMap,
  resolvePageLink,
  scanMigrationSource,
  validateProductMap,
  writeProductMap,
} from "./product-map.js";

/** 两个子命令即两个阶段。闭集，工具入参由此枚举校验，不额外做路径消毒。 */
export const KINDS = [
  "wireframe",
  "hifi",
] as const;
export type Kind = (typeof KINDS)[number];

/**
 * 命令模式闭集。
 *
 * 前三项与 KINDS 有关联：wireframe / hifi 既是「模式」也是「阶段」，
 * execute 是执行腿的入口（读已落盘的 tasks.md 续跑），不对应新目录；
 * 后三项 update / archive / help 是纯命令模式，同样不进 KINDS；
 * help 只打印用法，不碰文件系统、也不唤起 agent。
 */
export const MODES = [
  "wireframe",
  "hifi",
  "execute",
  "update",
  "archive",
  "help",
] as const;
export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

/**
 * 项目 slug —— 信任边界。
 *
 * `project` 由模型给出，会直接拼进文件系统路径，因此必须按闭集式规则校验：
 * 小写字母或数字开头结尾，中间可含连字符，总长 1–64。
 * 这条规则同时排除了 `..`、路径分隔符、前导点与绝对路径。
 */
export const PROJECT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function isValidProjectSlug(value: unknown): value is string {
  return typeof value === "string" && PROJECT_SLUG_PATTERN.test(value);
}

/** 校验失败即抛错；调用方不得先拼路径再校验。 */
export function assertProjectSlug(value: unknown): string {
  if (!isValidProjectSlug(value)) {
    throw new Error(
      `Invalid project slug: ${JSON.stringify(value)}. Expected lowercase kebab-case, e.g. subscription-page.`,
    );
  }
  return value;
}

/** 产物根目录，相对目标项目 cwd。可选前缀 `.pi/` 使其可被 gitignore。 */
export const ARTIFACT_ROOT = ".pi/prototype-design";

/** 归档区。单层目录，因此 listProjects 天然不会把它当成活跃项目。 */
export const ARCHIVE_DIR = "archive";

/** 主题文件固定放在项目根，便于人肉查看与用户自行覆写。 */
export const THEMES_FILE = "THEMES.md";

/** 工作副本目录名；agent 直接改这里，快照按 vN 递增。 */
export const CURRENT_DIR = "current";

export const VERSION_DIR_PATTERN = /^v(\d+)$/;

/** CHANGELOG 中插入新条目的锚点：新条目永远贴在它下方（倒序）。 */
export const CHANGELOG_MARKER = "<!-- ENTRIES -->";

export const CHANGELOG_FILE = "CHANGELOG.md";

/** 任务清单文件名。规划腿的产物，也是执行腿唯一的进度事实来源。 */
export const TASKS_FILE = "tasks.md";

/**
 * 计划闸门的落盘文件：`<stage>/gate.json`。
 *
 * 它记录的是**用户**的选择，不是模型的自述：答案由 `prototype_gate` 弹卡采集后写入，
 * `current/` 的写入许可读的也是它。放在阶段根而非 `current/` 内，因此不会被快照进 `vN/`。
 */
export const GATE_FILE = "gate.json";

/** 闸门答案闭集。`execute` 是唯一放行 `current/` 写入的值。 */
export const GATE_ANSWERS = [
  "save",
  "execute",
  "more",
] as const;
export type GateAnswer = (typeof GATE_ANSWERS)[number];

export function isGateAnswer(value: unknown): value is GateAnswer {
  return (
    typeof value === "string" && (GATE_ANSWERS as readonly string[]).includes(value)
  );
}

export interface GateState {
  answer: GateAnswer;
  /** 采集时间，`formatStamp` 的固定宽度格式。 */
  at: string;
  /**
   * 弹卡那一刻的版本数。许可是**一轮**的，不是一个阶段的：
   * 阶段每多一次快照，这份记录就自动过期，下一轮要用户重新点一次。
   *
   * 由 `writeGateState` 自己量，调用方没有机会写错。
   */
  baseline: number;
}

/**
 * 解析 `gate.json`。文件缺失、JSON 损坏、答案不在闭集里，一律返回 null。
 *
 * fail-closed：读不懂就是「用户还没确认」，于是 `current/` 写入被挡下。
 */
export function parseGateState(raw: string): GateState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { answer, at, baseline } = parsed as Record<string, unknown>;
    if (!isGateAnswer(answer)) return null;
    return {
      answer,
      at: typeof at === "string" ? at : "",
      // fail-closed：老记录（升级前写的）读不到 baseline，回落 0，于是只对
      // 「还没有任何快照」的阶段有效；已产出过的阶段会被要求重新确认一次。
      baseline:
        typeof baseline === "number" && Number.isInteger(baseline) && baseline >= 0
          ? baseline
          : 0,
    };
  } catch {
    return null;
  }
}

/**
 * 卡面选项。顺序即刹车优先：`save` 在第一格。
 *
 * 这段文案是用户、模型、文档三方的共同锚点：改一处就要同步 SKILL.md §5.1 的表。
 * 放在 contracts 而非 gate.ts，是为了让状态面板也能引用同一份标签而不反向依赖工具层。
 */
export const GATE_CHOICES = [
  {
    answer: "save",
    label: "仅保存计划，稍后执行",
  },
  {
    answer: "execute",
    label: "保存后立即执行",
  },
  {
    answer: "more",
    label: "还有需要补充的",
  },
] as const satisfies readonly {
  answer: GateAnswer;
  label: string;
}[];

export function gateLabel(answer: GateAnswer): string {
  return GATE_CHOICES.find((choice) => choice.answer === answer)?.label ?? answer;
}

/**
 * 迭代轮的卡面。
 *
 * 闸门不再只对首次产出出现：阶段已有 vN 时，用户仍要为**本轮的改动范围**点一次头。
 * 首轮那张卡问的是「要不要现在产出这个计划」，它批准的是计划，推不出这一轮的范围，
 * 所以迭代轮把选项收敛成「现在就改 / 先给改动清单」两格。
 */
export const ITERATION_CHOICES = [
  {
    answer: "execute",
    label: "现在就开始改",
  },
  {
    answer: "save",
    label: "先给改动清单，等我确认",
  },
] as const satisfies readonly {
  answer: GateAnswer;
  label: string;
}[];

export function iterationGateLabel(answer: GateAnswer): string {
  return (
    ITERATION_CHOICES.find((choice) => choice.answer === answer)?.label ??
    gateLabel(answer)
  );
}

/**
 * 迭代轮的范围声明（命令层面板）。
 *
 * `quick` 落 `execute`：用户已经在没花 token 之前就说了「直接改」。
 * `plan` 落 `save`：先出改动清单，`current/` 继续挡着，等用户说「开始执行」再 `resume`。
 *
 * 答案由面板采集后写进 `gate.json`，与 `prototype_gate` 走同一条记录——
 * 于是快路径只点一次，绕过命令层直接聊天时仍有闸门兜底。
 */
export type UpdateScope = "quick" | "plan";

export const UPDATE_SCOPE_TITLE = "xpi-prototype-design：本轮改动有多大";

export const UPDATE_SCOPE_CHOICES = [
  {
    answer: "execute",
    label: "直接改（小改动，不用先出计划）",
    scope: "quick",
  },
  {
    answer: "save",
    label: "先给改动清单，等我确认（大改动）",
    scope: "plan",
  },
] as const satisfies readonly {
  answer: GateAnswer;
  label: string;
  scope: UpdateScope;
}[];

/** 每个阶段需要保证存在的文档骨架。 */
export const DOC_FILES = {
  hifi: [
    "plan.md",
    TASKS_FILE,
    "principles.md",
    "DELTA.md",
    CHANGELOG_FILE,
  ],
  wireframe: [
    "plan.md",
    TASKS_FILE,
    "principles.md",
    CHANGELOG_FILE,
  ],
} as const satisfies Record<Kind, readonly string[]>;

/** 参数切分与 CHANGELOG 插入用到的正则；提到模块顶层避免重复编译。 */
const WHITESPACE_PATTERN = /\s+/;
const LEADING_NEWLINES_PATTERN = /^\n+/;

export type ThemesStatus = "present" | "created";

/**
 * 任务清单进度：`tasks.md` 里已声明 / 已勾选的任务条数。
 *
 * 只数 checkbox，不解析任务正文——执行腿读全文，状态面板只报进度。
 */
export interface TaskProgress {
  done: number;
  total: number;
}

/** 任务行：未勾选（含进行中的 ⏳ 行）与已勾选两种形态。 */
const TASK_LINE_PATTERN = /^[ \t]*[-*][ \t]*\[([ xX])\]/gm;

/**
 * 数出任务进度。
 *
 * 一条都解析不出时返回 null，与「0 项待办」区分开：前者是计划还没落盘，
 * 后者是任务全部完成。
 */
export function parseTaskProgress(markdown: string): TaskProgress | null {
  let done = 0;
  let total = 0;
  for (const match of markdown.matchAll(TASK_LINE_PATTERN)) {
    total += 1;
    if (match[1].toLowerCase() === "x") done += 1;
  }
  return total === 0
    ? null
    : {
        done,
        total,
      };
}

export interface ArtifactState {
  /** `current/` 内的文件数；0 表示尚未产出。 */
  currentFileCount: number;
  /** 相对项目根的目录，例如 `.pi/prototype-design/subscription-page/wireframe`。 */
  directory: string;
  /** 计划闸门状态；null 表示用户还没确认过。 */
  gate: GateState | null;
  kind: Kind;
  /** CHANGELOG 顶部最近的条目标题，例如 `2026-09-13 10:22 · v3`。 */
  latestEntry: string | null;
  /** 项目 slug。 */
  project: string;
  /** tasks.md 的任务进度；null 表示计划还没落盘。 */
  tasks: TaskProgress | null;
  /** 项目根是否已有 THEMES.md。只读状态不做补齐。 */
  themesPresent: boolean;
  /** 已存在的版本号，升序。 */
  versions: number[];
}

/** 阶段是否已有产出（版本或 current/ 文件）。update / archive 只在有产出的阶段里选。 */
export function hasOutput(value: {
  currentFileCount: number;
  versions: readonly number[];
}): boolean {
  return value.versions.length > 0 || value.currentFileCount > 0;
}

/** 阶段是否已有可执行的任务清单。execute 只列这类阶段。 */
export function hasPlan(value: { tasks: TaskProgress | null }): boolean {
  return value.tasks !== null;
}

export interface SetupResult {
  /** 本次新建的文档（已存在的不动）。 */
  createdDocs: string[];
  directory: string;
  kind: Kind;
  project: string;
  themesPath: string;
  themesStatus: ThemesStatus;
}

export interface SnapshotResult {
  changelogPath: string;
  entry: string;
  kind: Kind;
  project: string;
  /** 回滚到上一版的命令；v1 时为 null。 */
  rollbackCommand: string | null;
  version: number;
  versionPath: string;
}

export function isKind(value: unknown): value is Kind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

export interface ParsedCommand {
  mode?: Mode;
  rest: string;
}

/** 解析子命令参数；只认第一个 token，剩余部分视为需求描述。 */
export function parseCommandArgs(args: string): ParsedCommand {
  const trimmed = args.trim();
  if (trimmed.length === 0)
    return {
      rest: "",
    };
  const [head, ...tail] = trimmed.split(WHITESPACE_PATTERN);
  if (!isMode(head))
    return {
      rest: trimmed,
    };
  return {
    mode: head,
    rest: tail.join(" "),
  };
}

/** 面板选项：把一个结构体和它的显示文本绑在一起，避免两者失配。 */
export interface Choice<T> {
  item: T;
  label: string;
}

export function toChoices<T>(
  items: readonly T[],
  label: (item: T) => string,
): Choice<T>[] {
  return items.map((item) => ({
    item,
    label: label(item),
  }));
}

/** 供 `ctx.ui.select(title, labels)` 使用；顺序与 choices 一致。 */
export function choiceLabels<T>(choices: readonly Choice<T>[]): string[] {
  return choices.map((choice) => choice.label);
}

/**
 * 把 `ctx.ui.select` 回传的文本反查回结构体。
 *
 * 用 `indexOf` 在 labels 上定位、再取同下标的 item——**绝不**从文本反解路径：
 * 标签里含版本号与日期，格式一变就会静默选错项目、动错数据。
 * 返回 `undefined` 表示用户取消（非 TUI 模式亦返回 undefined）或文本不匹配。
 */
export function pickChoice<T>(
  choices: readonly Choice<T>[],
  chosen: string | undefined,
): T | undefined {
  if (chosen === undefined) return undefined;
  const index = choiceLabels(choices).indexOf(chosen);
  return index === -1 ? undefined : choices[index].item;
}

/** `2026-09-13 10:22`——固定宽度，字典序即时间序，便于倒序阅读。 */
export function formatStamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function highestVersion(versions: readonly number[]): number {
  return versions.length === 0 ? 0 : Math.max(...versions);
}

export interface ChangelogEntryInput {
  change: string;
  files?: readonly string[];
  kind: Kind;
  /** 阶段所属项目 slug；拼回滚路径时必须带上它。 */
  project: string;
  reason?: string;
  /** 回滚基准版本；v1 传 null。 */
  rollbackFrom: number | null;
  stamp: string;
  version: number;
}

export function renderEntryTitle(input: ChangelogEntryInput): string {
  return `${input.stamp} · v${input.version}`;
}

/** 渲染一条 CHANGELOG 条目。字段顺序固定，便于人读与 diff。 */
export function renderChangelogEntry(input: ChangelogEntryInput): string {
  const lines = [
    `## ${renderEntryTitle(input)}`,
    `- 变更：${input.change}`,
  ];
  if (input.reason) lines.push(`- 原因：${input.reason}`);
  if (input.files && input.files.length > 0) {
    lines.push(`- 文件：${input.files.map((file) => `\`${file}\``).join(", ")}`);
  }
  if (input.rollbackFrom !== null) {
    lines.push(
      `- 回滚到 v${input.rollbackFrom}：${rollbackCommand(input.project, input.kind, input.rollbackFrom)}`,
    );
  }
  return lines.join("\n");
}

/** 单个阶段的回滚命令：把 vN 的内容覆盖回 current/。 */
export function rollbackCommand(project: string, kind: Kind, version: number): string {
  const base = `${ARTIFACT_ROOT}/${project}/${kind}`;
  return `cp -R ${base}/v${version}/. ${base}/${CURRENT_DIR}/`;
}

/** 阶段目录，相对项目根。回滚、归档、预览都从这里派生。 */
export function stagePath(project: string, kind: Kind): string {
  return `${ARTIFACT_ROOT}/${project}/${kind}`;
}

/**
 * 归档目录名：`<YYYY-MM-DD>-<project>-<kind>`，日期在前，字典序即时间序。
 *
 * 与 `formatStamp` 同用 UTC：同一次操作产出的日志日期与目录日期必须一致，
 * 否则跨零点会出现日志写 09-13、目录写 09-12 的分裂。
 */
export function archiveDirName(project: string, kind: Kind, date: Date): string {
  return `${date.toISOString().slice(0, 10)}-${project}-${kind}`;
}

/** 归档目录路径，相对项目根。 */
export function archivePath(name: string): string {
  return `${ARTIFACT_ROOT}/${ARCHIVE_DIR}/${name}`;
}

/** 恢复命令：先补出被清理掉的项目目录，再把归档目录移回原名。 */
export function archiveRestoreCommand(
  project: string,
  kind: Kind,
  archivePathValue: string,
): string {
  return `mkdir -p ${ARTIFACT_ROOT}/${project} && mv ${archivePathValue} ${stagePath(project, kind)}`;
}

export interface ArchiveEntryInput {
  /** 归档目录，相对项目根。 */
  archiveDir: string;
  kind: Kind;
  project: string;
  stamp: string;
  versions: readonly number[];
}

/** 归档日志条目。与 CHANGELOG 条目同构，因而复用同一套插入逻辑。 */
export function renderArchiveEntry(input: ArchiveEntryInput): string {
  const versions =
    input.versions.length === 0 ? "无" : input.versions.map((v) => `v${v}`).join(" ");
  return [
    `## ${input.stamp} · ${input.project} / ${input.kind}`,
    `- 版本：${versions}`,
    `- 原路径：${stagePath(input.project, input.kind)}`,
    `- 归档到：${input.archiveDir}`,
    `- 恢复：${archiveRestoreCommand(input.project, input.kind, input.archiveDir)}`,
  ].join("\n");
}

/**
 * 把新条目插到 marker 正下方（即最上方）。
 * 文件缺少 marker 时追加到末尾，读不出内容时不报错、由调用方兜底。
 */
export function insertChangelogEntry(existing: string, entry: string): string {
  if (!existing.includes(CHANGELOG_MARKER)) {
    const base = existing.trimEnd();
    return base.length === 0 ? `${entry}\n` : `${base}\n\n${entry}\n`;
  }
  const markerIndex = existing.indexOf(CHANGELOG_MARKER);
  const head = existing.slice(0, markerIndex + CHANGELOG_MARKER.length);
  const tail = existing
    .slice(markerIndex + CHANGELOG_MARKER.length)
    .replace(LEADING_NEWLINES_PATTERN, "");
  return `${head}\n\n${entry}\n\n${tail}`.trimEnd().concat("\n");
}

/** 读取 CHANGELOG 顶部第一条 `## ` 标题，用作状态摘要。 */
export function latestEntryTitle(changelog: string): string | null {
  for (const line of changelog.split("\n")) {
    if (line.startsWith("## ")) return line.slice(3).trim();
  }
  return null;
}
