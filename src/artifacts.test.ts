import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  archiveProject,
  detectLegacyLayout,
  findPreviewTarget,
  listProjects,
  readArtifactState,
  setupArtifacts,
  snapshotArtifact,
} from "./artifacts.js";

const PROJECT = "subscription-page";
const OTHER_PROJECT = "settings-flow";

let root = "";

/** 阶段目录的相对路径，测试里反复用到。 */
function stage(project: string, kind: "hifi" | "wireframe"): string {
  return join(root, ".pi/prototype-design", project, kind);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-prototype-design-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("setupArtifacts", () => {
  it("creates the project-scoped stage tree, doc skeletons and THEMES.md", async () => {
    const result = await setupArtifacts(root, PROJECT, "wireframe");
    expect(result.directory).toBe(".pi/prototype-design/subscription-page/wireframe");
    expect(result.project).toBe(PROJECT);
    expect(result.themesStatus).toBe("created");
    expect(result.createdDocs).toEqual([
      "plan.md",
      "tasks.md",
      "principles.md",
      "CHANGELOG.md",
    ]);

    const state = await readArtifactState(root, PROJECT, "wireframe");
    expect(state.themesPresent).toBe(true);
    expect(state.versions).toEqual([]);
    expect(state.project).toBe(PROJECT);
    // 骨架里的 tasks.md 没有任务行，所以「只建了目录」不算有计划。
    expect(state.tasks).toBeNull();
  });

  it("adds DELTA.md only for hifi", async () => {
    const result = await setupArtifacts(root, PROJECT, "hifi");
    expect(result.createdDocs).toContain("DELTA.md");
  });

  it("never overwrites an existing document or the user's THEMES.md", async () => {
    await setupArtifacts(root, PROJECT, "hifi");
    await writeFile(join(root, "THEMES.md"), "USER THEME", "utf8");
    await writeFile(join(stage(PROJECT, "hifi"), "plan.md"), "USER PLAN", "utf8");

    const second = await setupArtifacts(root, PROJECT, "hifi");
    expect(second.createdDocs).toEqual([]);
    expect(second.themesStatus).toBe("present");
    expect(await readFile(join(root, "THEMES.md"), "utf8")).toBe("USER THEME");
    expect(await readFile(join(stage(PROJECT, "hifi"), "plan.md"), "utf8")).toBe(
      "USER PLAN",
    );
  });

  it("keeps two projects apart under one artifact root", async () => {
    await setupArtifacts(root, PROJECT, "wireframe");
    await setupArtifacts(root, OTHER_PROJECT, "wireframe");
    const entries = await readdir(join(root, ".pi/prototype-design"), {
      withFileTypes: true,
    });
    expect(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual([
      OTHER_PROJECT,
      PROJECT,
    ]);
  });
});

describe("project slug is a trust boundary", () => {
  it("rejects traversal and separators before touching the filesystem", async () => {
    for (const project of [
      "..",
      "../etc",
      "a/b",
      "/abs",
      ".hidden",
      "Upper",
    ]) {
      await expect(setupArtifacts(root, project, "wireframe")).rejects.toThrow(
        /Invalid project slug/,
      );
    }
    await expect(readdir(join(root, ".pi"))).rejects.toThrow();
  });

  it("the same guard covers snapshot, state and preview", async () => {
    await expect(
      snapshotArtifact(root, "..", "hifi", {
        change: "x",
      }),
    ).rejects.toThrow(/Invalid project slug/);
    await expect(readArtifactState(root, "a/b", "wireframe")).rejects.toThrow(
      /Invalid project slug/,
    );
    await expect(findPreviewTarget(root, "a/b", "wireframe")).rejects.toThrow(
      /Invalid project slug/,
    );
  });
});

describe("snapshotArtifact", () => {
  async function produce(
    project: string,
    kind: "hifi" | "wireframe",
    content: string,
  ): Promise<void> {
    await setupArtifacts(root, project, kind);
    await writeFile(join(stage(project, kind), "current/index.html"), content, "utf8");
  }

  it("refuses an empty current/ so version numbers keep meaning", async () => {
    await setupArtifacts(root, PROJECT, "wireframe");
    await expect(
      snapshotArtifact(root, PROJECT, "wireframe", {
        change: "空跑",
      }),
    ).rejects.toThrow(/is empty/);
  });

  it("increments the version and stores the files verbatim", async () => {
    await produce(PROJECT, "hifi", "<h1>v1</h1>");
    const first = await snapshotArtifact(root, PROJECT, "hifi", {
      change: "首版",
    });
    expect(first.version).toBe(1);
    expect(first.rollbackCommand).toBeNull();

    await writeFile(
      join(stage(PROJECT, "hifi"), "current/index.html"),
      "<h1>v2</h1>",
      "utf8",
    );
    const second = await snapshotArtifact(root, PROJECT, "hifi", {
      change: "改 hero",
      reason: "移动端",
    });
    expect(second.version).toBe(2);
    expect(second.rollbackCommand).toContain(
      ".pi/prototype-design/subscription-page/hifi/v1",
    );

    expect(await readFile(join(stage(PROJECT, "hifi"), "v1/index.html"), "utf8")).toBe(
      "<h1>v1</h1>",
    );
    expect(await readArtifactState(root, PROJECT, "hifi")).toMatchObject({
      versions: [
        1,
        2,
      ],
    });
  });

  it("numbers versions per stage, not per project", async () => {
    await produce(PROJECT, "wireframe", "<svg/>");
    await snapshotArtifact(root, PROJECT, "wireframe", {
      change: "线框首版",
    });
    await produce(PROJECT, "hifi", "<h1/>");
    const hifi = await snapshotArtifact(root, PROJECT, "hifi", {
      change: "高保真首版",
    });
    expect(hifi.version).toBe(1);
  });

  it("keeps the changelog newest-first", async () => {
    await produce(PROJECT, "wireframe", "<svg/>");
    await snapshotArtifact(root, PROJECT, "wireframe", {
      change: "第一版",
    });
    await snapshotArtifact(root, PROJECT, "wireframe", {
      change: "第二版",
    });

    const changelog = await readFile(
      join(stage(PROJECT, "wireframe"), "CHANGELOG.md"),
      "utf8",
    );
    expect(changelog.indexOf("第二版")).toBeLessThan(changelog.indexOf("第一版"));
    expect((await readArtifactState(root, PROJECT, "wireframe")).latestEntry).toContain(
      "· v2",
    );
  });
});

describe("findPreviewTarget", () => {
  it("returns null when nothing was produced yet", async () => {
    await setupArtifacts(root, PROJECT, "wireframe");
    expect(await findPreviewTarget(root, PROJECT, "wireframe")).toBeNull();
  });

  it("prefers index.html, then the first html by path", async () => {
    await setupArtifacts(root, PROJECT, "hifi");
    const current = join(stage(PROJECT, "hifi"), "current");
    await writeFile(join(current, "zz.html"), "", "utf8");
    await writeFile(join(current, "index.html"), "", "utf8");
    expect((await findPreviewTarget(root, PROJECT, "hifi"))?.relative).toBe(
      ".pi/prototype-design/subscription-page/hifi/current/index.html",
    );

    await rm(join(current, "index.html"));
    expect((await findPreviewTarget(root, PROJECT, "hifi"))?.relative).toBe(
      ".pi/prototype-design/subscription-page/hifi/current/zz.html",
    );
  });

  it("rejects a path that escapes current/", async () => {
    await setupArtifacts(root, PROJECT, "hifi");
    await expect(
      findPreviewTarget(root, PROJECT, "hifi", "../../plan.md"),
    ).rejects.toThrow(/must be inside/);
  });
});

async function produce(project: string, kind: "hifi" | "wireframe", content: string) {
  await setupArtifacts(root, project, kind);
  await writeFile(join(stage(project, kind), "current/index.html"), content, "utf8");
}

describe("listProjects", () => {
  it("returns one row per stage that actually has output", async () => {
    await setupArtifacts(root, PROJECT, "wireframe"); // 空壳，应被跳过
    await produce(PROJECT, "hifi", "<h1/>");
    await produce(OTHER_PROJECT, "wireframe", "<svg/>");

    const stages = await listProjects(root);
    expect(stages.map((entry) => `${entry.project}/${entry.kind}`)).toEqual([
      "settings-flow/wireframe",
      "subscription-page/hifi",
    ]);
    expect(stages[1]).toMatchObject({
      currentFileCount: 1,
      project: PROJECT,
      versions: [],
    });
  });

  it("carries versions and the changelog head", async () => {
    await produce(PROJECT, "hifi", "<h1/>");
    await snapshotArtifact(root, PROJECT, "hifi", {
      change: "首版",
    });
    const [first] = await listProjects(root);
    expect(first).toMatchObject({
      currentFileCount: 1,
      versions: [
        1,
      ],
    });
    expect(first.latestEntry).toContain("· v1");
  });

  it("returns nothing when there is no artifact root", async () => {
    expect(await listProjects(root)).toEqual([]);
  });

  it("never mistakes the archive directory for a project", async () => {
    await produce(PROJECT, "hifi", "<h1/>");
    await snapshotArtifact(root, PROJECT, "hifi", {
      change: "首版",
    });
    await archiveProject(root, PROJECT, "hifi");
    expect(await listProjects(root)).toEqual([]);
  });
});

describe("archiveProject", () => {
  it("moves the stage, logs a recoverable entry, and clears the empty project dir", async () => {
    await produce(PROJECT, "hifi", "<h1/>");
    await snapshotArtifact(root, PROJECT, "hifi", {
      change: "首版",
    });

    const result = await archiveProject(root, PROJECT, "hifi");
    expect(result.archiveDir).toMatch(
      /^\.pi\/prototype-design\/archive\/\d{4}-\d{2}-\d{2}-subscription-page-hifi$/u,
    );
    expect(result.versions).toEqual([
      1,
    ]);
    expect(result.removedEmptyProjectDir).toBe(true);
    await expect(stat(join(root, ".pi/prototype-design", PROJECT))).rejects.toThrow();

    const log = await readFile(join(root, result.logPath), "utf8");
    expect(log).toContain("· subscription-page / hifi");
    expect(log).toContain("v1");
    expect(log).toContain(result.restoreCommand);
    await expect(
      stat(join(root, result.archiveDir, "v1/index.html")),
    ).resolves.toBeTruthy();
  });

  it("keeps the project directory while a sibling stage is still live", async () => {
    await produce(PROJECT, "wireframe", "<svg/>");
    await produce(PROJECT, "hifi", "<h1/>");
    const result = await archiveProject(root, PROJECT, "hifi");
    expect(result.removedEmptyProjectDir).toBe(false);
    await expect(
      stat(join(stage(PROJECT, "wireframe"), "CHANGELOG.md")),
    ).resolves.toBeTruthy();
  });

  it("suffixes instead of overwriting a same-day archive of the same stage", async () => {
    await produce(PROJECT, "hifi", "<h1/>");
    const first = await archiveProject(root, PROJECT, "hifi");
    await produce(PROJECT, "hifi", "<h1>again</h1>");
    const second = await archiveProject(root, PROJECT, "hifi");
    expect(second.archiveDir).toBe(`${first.archiveDir}-2`);
    await expect(stat(join(root, first.archiveDir))).resolves.toBeTruthy();
  });

  it("refuses a stage that does not exist and leaves no trace", async () => {
    await expect(archiveProject(root, PROJECT, "hifi")).rejects.toThrow(
      /Nothing to archive/,
    );
    await expect(stat(join(root, ".pi"))).rejects.toThrow();
  });
});

describe("stage-based compatibility", () => {
  it("keeps project-level snapshots readable once a product map appears", async () => {
    await produce(PROJECT, "wireframe", "<svg>v1</svg>");
    const snap = await snapshotArtifact(root, PROJECT, "wireframe", {
      change: "首版",
    });
    await writeFile(
      join(root, ".pi/prototype-design", PROJECT, "product-map.json"),
      JSON.stringify({
        pages: [],
        product: PROJECT,
        version: 1,
      }),
      "utf8",
    );

    // 旧阶段仍被 status/list 读到，历史 v1 一字未改。
    expect((await readArtifactState(root, PROJECT, "wireframe")).versions).toEqual([
      1,
    ]);
    expect(
      await readFile(join(stage(PROJECT, "wireframe"), "v1/index.html"), "utf8"),
    ).toBe("<svg>v1</svg>");
    expect(
      (await listProjects(root)).some(
        (item) => item.project === PROJECT && item.kind === "wireframe",
      ),
    ).toBe(true);
    await expect(stat(join(root, snap.versionPath))).resolves.toBeTruthy();
  });
});

describe("detectLegacyLayout", () => {
  it("reports the old top-level stage directories without moving them", async () => {
    await mkdir(join(root, ".pi/prototype-design/wireframe"), {
      recursive: true,
    });
    expect(await detectLegacyLayout(root)).toEqual([
      "wireframe",
    ]);
    await expect(
      stat(join(root, ".pi/prototype-design/wireframe")),
    ).resolves.toBeTruthy();
  });

  it("returns nothing once the layout is project-scoped", async () => {
    await setupArtifacts(root, PROJECT, "wireframe");
    expect(await detectLegacyLayout(root)).toEqual([]);
  });

  it("returns nothing when there is no artifact root", async () => {
    expect(await detectLegacyLayout(root)).toEqual([]);
  });
});

describe("task progress", () => {
  async function waitForPlan(
    project: string,
    kind: "hifi" | "wireframe",
    body: string,
  ): Promise<void> {
    await setupArtifacts(root, project, kind);
    await writeFile(join(stage(project, kind), "tasks.md"), body, "utf8");
  }

  it("counts done and pending tasks straight off disk", async () => {
    await waitForPlan(
      PROJECT,
      "wireframe",
      [
        "## 任务",
        "- [x] 1.1 首页结构",
        "  验证: 打开 screens/01-home.html 通过",
        "- [ ] 1.2 空 / 加载 / 错误态",
      ].join("\n"),
    );
    expect((await readArtifactState(root, PROJECT, "wireframe")).tasks).toEqual({
      done: 1,
      total: 2,
    });
  });

  it("keeps a plan-only stage in the list — that is the execute target", async () => {
    // 纯骨架仍在列表外：它没有产出，也没有任务行。
    await setupArtifacts(root, OTHER_PROJECT, "hifi");
    expect(await listProjects(root)).toEqual([]);

    await waitForPlan(OTHER_PROJECT, "hifi", "- [ ] 1.1 高保真骨架");
    const stages = await listProjects(root);
    expect(stages.map((entry) => `${entry.project}/${entry.kind}`)).toEqual([
      "settings-flow/hifi",
    ]);
    expect(stages[0]).toMatchObject({
      currentFileCount: 0,
      versions: [],
      tasks: {
        done: 0,
        total: 1,
      },
    });
  });
});
