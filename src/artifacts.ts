/**
 * artifacts — 产物目录的文件系统操作。
 *
 * 布局：`<cwd>/.pi/prototype-design/<project>/<kind>/`。
 * 三个动作互不重叠：setup 建骨架（幂等）、snapshot 存版本并记账、state 只读。
 * 所有返回值里的路径都相对项目根，避免把用户绝对路径写进工具输出与日志。
 */

import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHIVE_DIR,
  ARTIFACT_ROOT,
  type ArtifactState,
  archiveDirName,
  archiveRestoreCommand,
  assertProjectSlug,
  CHANGELOG_FILE,
  CHANGELOG_MARKER,
  CURRENT_DIR,
  DOC_FILES,
  formatStamp,
  GATE_FILE,
  type GateAnswer,
  type GateState,
  hasOutput,
  highestVersion,
  insertChangelogEntry,
  isValidProjectSlug,
  KINDS,
  type Kind,
  latestEntryTitle,
  parseGateState,
  parseTaskProgress,
  renderArchiveEntry,
  renderChangelogEntry,
  renderEntryTitle,
  rollbackCommand,
  type SetupResult,
  type SnapshotResult,
  TASKS_FILE,
  type TaskProgress,
  THEMES_FILE,
  VERSION_DIR_PATTERN,
} from "./contracts.js";
import { docTemplate } from "./templates.js";

/** 包内随附的 THEMES.md 模板；`src/` 的上一级即包根。 */
const BUNDLED_THEMES = fileURLToPath(new URL("../THEMES.md", import.meta.url));

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析阶段目录的绝对路径。
 *
 * 两道校验缺一不可：
 *   1. slug 是信任边界，`project` 由模型给出，必须先按闭集规则拒绝 `..`、路径分隔符等；
 *   2. 纵深防御，解析结果必须仍落在 `<cwd>/.pi/prototype-design/` 之内。
 */
function artifactDirectory(projectRoot: string, project: string, kind: Kind): string {
  const root = resolve(projectRoot);
  assertProjectSlug(project);
  const target = resolve(root, ARTIFACT_ROOT, project, kind);
  if (!target.startsWith(`${root}${sep}${ARTIFACT_ROOT}${sep}`)) {
    throw new Error(`Refusing to operate outside ${ARTIFACT_ROOT}: ${target}`);
  }
  return target;
}

function toPattern(projectRoot: string, absolute: string): string {
  return relative(resolve(projectRoot), absolute).split(sep).join("/");
}

async function countFiles(directory: string): Promise<number> {
  if (!(await exists(directory))) return 0;
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries.filter((entry) => entry.isFile()).length;
}

async function listVersions(directory: string): Promise<number[]> {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const versions: number[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = VERSION_DIR_PATTERN.exec(entry.name);
    if (match) versions.push(Number(match[1]));
  }
  return versions.sort((a, b) => a - b);
}

/**
 * 保证目标项目根存在 THEMES.md。
 * 已存在则完全不改动——用户的主题是事实来源，扩展不覆写。
 */
export async function ensureThemesFile(projectRoot: string): Promise<{
  path: string;
  status: "present" | "created";
}> {
  const target = join(resolve(projectRoot), THEMES_FILE);
  if (await exists(target))
    return {
      path: THEMES_FILE,
      status: "present",
    };
  const bundled = await readFile(BUNDLED_THEMES, "utf8");
  await writeFile(target, bundled, "utf8");
  return {
    path: THEMES_FILE,
    status: "created",
  };
}

/** 建目录骨架 + 缺什么补什么。已有文档一律不覆盖。 */
export async function setupArtifacts(
  projectRoot: string,
  project: string,
  kind: Kind,
): Promise<SetupResult> {
  const directory = artifactDirectory(projectRoot, project, kind);
  await mkdir(join(directory, CURRENT_DIR), {
    recursive: true,
  });

  const createdDocs: string[] = [];
  for (const file of DOC_FILES[kind]) {
    const target = join(directory, file);
    if (await exists(target)) continue;
    await writeFile(target, docTemplate(kind, file) ?? "", "utf8");
    createdDocs.push(file);
  }

  const themes = await ensureThemesFile(projectRoot);
  return {
    createdDocs,
    directory: toPattern(projectRoot, directory),
    kind,
    project,
    themesPath: themes.path,
    themesStatus: themes.status,
  };
}

export interface SnapshotInput {
  change: string;
  files?: readonly string[];
  reason?: string;
}

/**
 * 把 `current/` 存为下一个 `vN/`，并在 CHANGELOG 顶部记账。
 *
 * 语义：vN 是**第 N 次产出**。回滚到上一版即 `cp -R v(N-1)/. current/`。
 * `current/` 为空时拒绝——空快照会让版本号失去意义。
 */
export async function snapshotArtifact(
  projectRoot: string,
  project: string,
  kind: Kind,
  input: SnapshotInput,
): Promise<SnapshotResult> {
  const directory = artifactDirectory(projectRoot, project, kind);
  const currentPath = join(directory, CURRENT_DIR);
  const fileCount = await countFiles(currentPath);
  if (fileCount === 0) {
    throw new Error(
      `No output to snapshot: ${toPattern(projectRoot, currentPath)} is empty. Produce the ${kind} files first.`,
    );
  }

  const version = highestVersion(await listVersions(directory)) + 1;
  const versionPath = join(directory, `v${version}`);
  await cp(currentPath, versionPath, {
    recursive: true,
  });

  const stamp = formatStamp(new Date());
  const entry = renderChangelogEntry({
    change: input.change,
    files: input.files,
    kind,
    project,
    reason: input.reason,
    rollbackFrom: version > 1 ? version - 1 : null,
    stamp,
    version,
  });

  const changelogPath = join(directory, CHANGELOG_FILE);
  const existing = (await exists(changelogPath))
    ? await readFile(changelogPath, "utf8")
    : `# CHANGELOG — ${project}/${kind}\n\n${CHANGELOG_MARKER}\n`;
  await writeFile(changelogPath, insertChangelogEntry(existing, entry), "utf8");

  return {
    changelogPath: toPattern(projectRoot, changelogPath),
    entry: renderEntryTitle({
      change: input.change,
      kind,
      project,
      stamp,
      rollbackFrom: null,
      version,
    }),
    kind,
    project,
    rollbackCommand: version > 1 ? rollbackCommand(project, kind, version - 1) : null,
    version,
    versionPath: toPattern(projectRoot, versionPath),
  };
}

/** `gate.json` 的绝对路径。 */
function gatePath(projectRoot: string, project: string, kind: Kind): string {
  return join(artifactDirectory(projectRoot, project, kind), GATE_FILE);
}

/**
 * 只读计划闸门状态。文件缺失、JSON 损坏、答案不在闭集里，一律返回 null。
 *
 * 与 `parseGateState` 同一条 fail-closed 策略：读不懂就等于「用户还没确认」，
 * 于是 `current/` 的写入继续被挡。
 */
export async function readGateState(
  projectRoot: string,
  project: string,
  kind: Kind,
): Promise<GateState | null> {
  const path = gatePath(projectRoot, project, kind);
  return (await exists(path)) ? parseGateState(await readFile(path, "utf8")) : null;
}

/**
 * 落盘**用户**的选择。
 *
 * 调用方有两处，答案都来自用户点的面板：`prototype_gate` 的卡，和 `update` 命令的
 * 范围声明——不是模型自述。
 *
 * `baseline` 由这里自己量：许可属于「弹卡那一刻的那一轮」，让调用方传就有写错的机会。
 */
export async function writeGateState(
  projectRoot: string,
  project: string,
  kind: Kind,
  answer: GateAnswer,
): Promise<GateState> {
  const { versions } = await readArtifactState(projectRoot, project, kind);
  const state: GateState = {
    answer,
    at: formatStamp(new Date()),
    baseline: versions.length,
  };
  await writeFile(
    gatePath(projectRoot, project, kind),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
  return state;
}
/** 只读状态：版本列表、当前产出文件数、任务进度、最新日志标题、主题与闸门状态。 */
export async function readArtifactState(
  projectRoot: string,
  project: string,
  kind: Kind,
): Promise<ArtifactState> {
  const directory = artifactDirectory(projectRoot, project, kind);
  const changelogPath = join(directory, CHANGELOG_FILE);
  const changelog = (await exists(changelogPath))
    ? await readFile(changelogPath, "utf8")
    : "";
  const tasksPath = join(directory, TASKS_FILE);
  const tasks = (await exists(tasksPath))
    ? parseTaskProgress(await readFile(tasksPath, "utf8"))
    : null;
  return {
    currentFileCount: await countFiles(join(directory, CURRENT_DIR)),
    directory: toPattern(projectRoot, directory),
    gate: await readGateState(projectRoot, project, kind),
    kind,
    latestEntry: latestEntryTitle(changelog) ?? null,
    project,
    tasks,
    themesPresent: await exists(join(resolve(projectRoot), THEMES_FILE)),
    versions: await listVersions(directory),
  };
}

/** 递归收集 `current/` 下的 html，按路径排序，保证默认预览目标可复现。 */
export async function listHtmlFiles(directory: string): Promise<string[]> {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

export interface PreviewTarget {
  absolute: string;
  relative: string;
}

/**
 * 解析预览目标。
 *
 * `file` 来自模型，属于信任边界：必须落在本阶段 `current/` 内，越界直接拒绝。
 * 不传时优先 `current/index.html`，否则取排序后的第一个 html。
 */
export async function findPreviewTarget(
  projectRoot: string,
  project: string,
  kind: Kind,
  file?: string,
): Promise<PreviewTarget | null> {
  const currentPath = join(artifactDirectory(projectRoot, project, kind), CURRENT_DIR);
  if (file) {
    const target = resolve(currentPath, file);
    if (!target.startsWith(`${currentPath}${sep}`) || !(await exists(target))) {
      throw new Error(
        `Preview target must be inside ${toPattern(projectRoot, currentPath)}: ${file}`,
      );
    }
    return {
      absolute: target,
      relative: toPattern(projectRoot, target),
    };
  }
  const candidates = await listHtmlFiles(currentPath);
  if (candidates.length === 0) return null;
  const index = join(currentPath, "index.html");
  const chosen = candidates.includes(index) ? index : candidates[0];
  return {
    absolute: chosen,
    relative: toPattern(projectRoot, chosen),
  };
}

/** 一个活跃的 (project, kind) 组合，供 execute / update / archive 的候选列表使用。 */
export interface ProjectStage {
  currentFileCount: number;
  kind: Kind;
  latestEntry: string | null;
  project: string;
  /** tasks.md 的任务进度；null 表示计划还没落盘。 */
  tasks: TaskProgress | null;
  versions: number[];
}

/**
 * 列出所有活跃阶段。
 *
 * `archive/` 必须显式跳过：它在 slug 规则下是个合法名字，只能靠名字排除，
 * 不能指望「单层目录」这种结构性推断——那是一条会被未来布局变更推翻的假设。
 * 空壳阶段跳过：没有产出、没有版本、也没有任务清单的，列出来只是噪音。
 * 反过来，**有计划但还没产出的阶段必须保留**——那正是 execute 要接着做的东西。
 */
export async function listProjects(projectRoot: string): Promise<ProjectStage[]> {
  const root = join(resolve(projectRoot), ARTIFACT_ROOT);
  if (!(await exists(root))) return [];
  const entries = await readdir(root, {
    withFileTypes: true,
  });

  const stages: ProjectStage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ARCHIVE_DIR || !isValidProjectSlug(entry.name)) continue;
    for (const kind of KINDS) {
      const state = await readArtifactState(projectRoot, entry.name, kind);
      if (!hasOutput(state) && state.tasks === null) continue;
      stages.push({
        currentFileCount: state.currentFileCount,
        kind,
        latestEntry: state.latestEntry,
        project: entry.name,
        tasks: state.tasks,
        versions: state.versions,
      });
    }
  }

  return stages.sort((a, b) =>
    a.project === b.project
      ? a.kind.localeCompare(b.kind)
      : a.project.localeCompare(b.project),
  );
}

export interface ArchiveResult {
  /** 归档目录，相对项目根。 */
  archiveDir: string;
  kind: Kind;
  /** 归档日志路径，相对项目根。 */
  logPath: string;
  project: string;
  /** 项目目录被清空后已删除时为 true。 */
  removedEmptyProjectDir: boolean;
  restoreCommand: string;
  versions: number[];
}

/**
 * 把一条活跃阶段移进 `archive/`，并写一条带恢复命令的日志。
 *
 * `rename` 在同文件系统内是原子的：要么整体成功、要么毫无副作用，
 * 因此不需要回滚逻辑；跨设备（EXDEV）时直接抛真实错误，不静默降级成 cp + rm。
 */
export async function archiveProject(
  projectRoot: string,
  project: string,
  kind: Kind,
): Promise<ArchiveResult> {
  const stage = artifactDirectory(projectRoot, project, kind);
  if (!(await exists(stage))) {
    throw new Error(
      `Nothing to archive: ${toPattern(projectRoot, stage)} does not exist.`,
    );
  }

  const versions = await listVersions(stage);
  const now = new Date();
  const archiveRoot = join(resolve(projectRoot), ARTIFACT_ROOT, ARCHIVE_DIR);
  await mkdir(archiveRoot, {
    recursive: true,
  });

  const baseName = archiveDirName(project, kind, now);
  let target = join(archiveRoot, baseName);
  for (let suffix = 2; await exists(target); suffix += 1) {
    target = join(archiveRoot, `${baseName}-${suffix}`);
  }
  await rename(stage, target);

  const projectDir = join(resolve(projectRoot), ARTIFACT_ROOT, project);
  let removedEmptyProjectDir = false;
  if ((await readdir(projectDir)).length === 0) {
    await rm(projectDir, {
      force: true,
      recursive: true,
    });
    removedEmptyProjectDir = true;
  }

  const archiveDir = toPattern(projectRoot, target);
  const logPath = join(archiveRoot, CHANGELOG_FILE);
  const existing = (await exists(logPath))
    ? await readFile(logPath, "utf8")
    : `# CHANGELOG — archive\n\n${CHANGELOG_MARKER}\n`;
  const entry = renderArchiveEntry({
    archiveDir,
    kind,
    project,
    stamp: formatStamp(now),
    versions,
  });
  await writeFile(logPath, insertChangelogEntry(existing, entry), "utf8");

  return {
    archiveDir,
    kind,
    logPath: toPattern(projectRoot, logPath),
    project,
    removedEmptyProjectDir,
    restoreCommand: archiveRestoreCommand(project, kind, archiveDir),
    versions,
  };
}

/**
 * 只读探测旧布局：`<cwd>/.pi/prototype-design/<kind>/`（没有项目层）。
 *
 * 只报告，绝不搬迁——搬迁是破坏性操作，只有用户明确指定的来源才会被读取。
 * 需要纳入页面模型时走 `xpi-prototype-migration`：先 `prototype_migration_scan` 只读扫描，
 * 用户逐项确认待决项后才 `prototype_migration_execute` 复制。
 * 注意 `wireframe` / `hifi` 在新布局下也是合法项目名，因此这里只是提示，不是判定。
 */
export async function detectLegacyLayout(projectRoot: string): Promise<Kind[]> {
  const root = join(resolve(projectRoot), ARTIFACT_ROOT);
  if (!(await exists(root))) return [];
  const entries = await readdir(root, {
    withFileTypes: true,
  });
  const directories = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );
  return KINDS.filter((kind) => directories.has(kind));
}
