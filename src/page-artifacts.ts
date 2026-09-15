import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { ensureThemesFile } from "./artifacts.js";
import {
  type ArtifactState,
  assertProjectSlug,
  CHANGELOG_FILE,
  CURRENT_DIR,
  DOC_FILES,
  formatStamp,
  GATE_FILE,
  highestVersion,
  insertChangelogEntry,
  type Kind,
  parseGateState,
  parseTaskProgress,
  renderChangelogEntry,
  renderEntryTitle,
  rollbackCommand,
  type SnapshotResult,
  TASKS_FILE,
  VERSION_DIR_PATTERN,
} from "./contracts.js";
import { assertPageId, type ProductPage } from "./product-map.js";
import { docTemplate } from "./templates.js";

const CHANGELOG_TITLE_PATTERN = /^## (.+)$/m;

export function pageStagePath(project: string, pageId: string, kind: Kind): string {
  assertProjectSlug(project);
  assertPageId(pageId);
  return `.pi/prototype-design/${project}/pages/${pageId}/${kind}`;
}

/** 阶段目录的绝对路径。含 `..` 越界检查，标注、快照、预览共用同一道闸。 */
export function absoluteStage(
  projectRoot: string,
  project: string,
  pageId: string,
  kind: Kind,
): string {
  const root = resolve(projectRoot);
  const stage = resolve(root, pageStagePath(project, pageId, kind));
  if (!stage.startsWith(`${root}${sep}.pi${sep}prototype-design${sep}`)) {
    throw new Error(`Refusing to operate outside .pi/prototype-design: ${stage}`);
  }
  return stage;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function countFiles(path: string): Promise<number> {
  if (!(await exists(path))) return 0;
  const entries = await readdir(path, {
    recursive: true,
    withFileTypes: true,
  });
  return entries.filter((entry) => entry.isFile()).length;
}

async function versions(path: string): Promise<number[]> {
  if (!(await exists(path))) return [];
  const entries = await readdir(path, {
    withFileTypes: true,
  });
  return entries
    .flatMap((entry) => {
      const match = entry.isDirectory() ? VERSION_DIR_PATTERN.exec(entry.name) : null;
      return match
        ? [
            Number(match[1]),
          ]
        : [];
    })
    .sort((a, b) => a - b);
}

export async function setupPageArtifacts(
  projectRoot: string,
  project: string,
  pageId: string,
  kind: Kind,
): Promise<import("./contracts.js").SetupResult> {
  const directory = absoluteStage(projectRoot, project, pageId, kind);
  await mkdir(join(directory, CURRENT_DIR), {
    recursive: true,
  });
  const createdDocs = (
    await Promise.all(
      DOC_FILES[kind].map(async (file) => {
        const path = join(directory, file);
        if (await exists(path)) return null;
        await writeFile(path, docTemplate(kind, file) ?? "", "utf8");
        return file;
      }),
    )
  ).filter((file) => file !== null) as string[];
  const themes = await ensureThemesFile(projectRoot);
  return {
    createdDocs,
    directory: pageStagePath(project, pageId, kind),
    kind,
    project,
    themesPath: themes.path,
    themesStatus: themes.status,
  };
}

export async function readPageArtifactState(
  projectRoot: string,
  project: string,
  pageId: string,
  kind: Kind,
): Promise<
  ArtifactState & {
    pageId: string;
  }
> {
  const directory = absoluteStage(projectRoot, project, pageId, kind);
  const changelogPath = join(directory, CHANGELOG_FILE);
  const tasksPath = join(directory, TASKS_FILE);
  const changelog = (await exists(changelogPath))
    ? await readFile(changelogPath, "utf8")
    : "";
  const tasks = (await exists(tasksPath))
    ? parseTaskProgress(await readFile(tasksPath, "utf8"))
    : null;
  const gatePath = join(directory, GATE_FILE);
  return {
    currentFileCount: await countFiles(join(directory, CURRENT_DIR)),
    directory: pageStagePath(project, pageId, kind),
    gate: (await exists(gatePath))
      ? parseGateState(await readFile(gatePath, "utf8"))
      : null,
    kind,
    latestEntry: changelog.match(CHANGELOG_TITLE_PATTERN)?.[1] ?? null,
    project,
    tasks,
    themesPresent: await exists(join(resolve(projectRoot), "THEMES.md")),
    versions: await versions(directory),
    pageId,
  };
}

export interface PagePreviewTarget {
  absolute: string;
  pageId: string;
  relative: string;
}

export async function findPagePreviewTarget(
  projectRoot: string,
  project: string,
  page: ProductPage,
  kind: Kind,
  file?: string,
): Promise<PagePreviewTarget | null> {
  const current = join(absoluteStage(projectRoot, project, page.id, kind), CURRENT_DIR);
  const requested = file ?? page.prototypeEntry;
  if (!requested) return null;
  const target = resolve(current, requested);
  if (!target.startsWith(`${current}${sep}`) || !(await exists(target))) {
    throw new Error(
      `Preview target must be inside ${pageStagePath(project, page.id, kind)}/current: ${requested}`,
    );
  }
  return {
    absolute: target,
    pageId: page.id,
    relative: relative(resolve(projectRoot), target).split(sep).join("/"),
  };
}

export async function snapshotPageArtifact(
  projectRoot: string,
  project: string,
  pageId: string,
  kind: Kind,
  input: {
    change: string;
    files?: readonly string[];
    reason?: string;
  },
): Promise<SnapshotResult> {
  const directory = absoluteStage(projectRoot, project, pageId, kind);
  const current = join(directory, CURRENT_DIR);
  if ((await countFiles(current)) === 0) {
    throw new Error(
      `No output to snapshot: ${pageStagePath(project, pageId, kind)}/current is empty.`,
    );
  }
  const version = highestVersion(await versions(directory)) + 1;
  const versionPath = join(directory, `v${version}`);
  await cp(current, versionPath, {
    recursive: true,
  });
  const changelogPath = join(directory, CHANGELOG_FILE);
  const existing = (await exists(changelogPath))
    ? await readFile(changelogPath, "utf8")
    : `# CHANGELOG — ${project}/${pageId}/${kind}\n\n<!-- ENTRIES -->\n`;
  const stamp = formatStamp(new Date());
  const entry = renderChangelogEntry({
    change: input.change,
    files: input.files,
    kind,
    project: `${project}/${pageId}`,
    reason: input.reason,
    rollbackFrom: version > 1 ? version - 1 : null,
    stamp,
    version,
  });
  await writeFile(changelogPath, insertChangelogEntry(existing, entry), "utf8");
  return {
    changelogPath: relative(resolve(projectRoot), changelogPath).split(sep).join("/"),
    entry: renderEntryTitle({
      change: input.change,
      kind,
      project,
      rollbackFrom: null,
      stamp,
      version,
    }),
    kind,
    project,
    rollbackCommand:
      version > 1
        ? rollbackCommand(`${project}/pages/${pageId}`, kind, version - 1)
        : null,
    version,
    versionPath: relative(resolve(projectRoot), versionPath).split(sep).join("/"),
  };
}

export async function writePageGateState(
  projectRoot: string,
  project: string,
  pageId: string,
  kind: Kind,
  answer: import("./contracts.js").GateAnswer,
): Promise<import("./contracts.js").GateState> {
  const directory = absoluteStage(projectRoot, project, pageId, kind);
  const state = await readPageArtifactState(projectRoot, project, pageId, kind);
  const gate = {
    answer,
    at: formatStamp(new Date()),
    baseline: state.versions.length,
  };
  await mkdir(directory, {
    recursive: true,
  });
  await writeFile(
    join(directory, GATE_FILE),
    `${JSON.stringify(gate, null, 2)}\n`,
    "utf8",
  );
  return gate;
}
