import { describe, expect, it } from "vitest";
import {
  archiveDirName,
  archivePath,
  assertProjectSlug,
  CHANGELOG_MARKER,
  choiceLabels,
  formatStamp,
  hasOutput,
  hasPlan,
  highestVersion,
  insertChangelogEntry,
  isMode,
  isValidProjectSlug,
  KINDS,
  latestEntryTitle,
  MODES,
  parseCommandArgs,
  parseTaskProgress,
  pickChoice,
  renderArchiveEntry,
  renderChangelogEntry,
  rollbackCommand,
  toChoices,
} from "./contracts.js";
import { docTemplate } from "./templates.js";

describe("MODES", () => {
  it("declares exactly the five command modes", () => {
    expect([
      ...MODES,
    ]).toEqual([
      "wireframe",
      "hifi",
      "execute",
      "update",
      "archive",
    ]);
  });

  it("shares wireframe and hifi with KINDS", () => {
    for (const kind of KINDS) expect(MODES).toContain(kind);
  });

  it("guards with isMode", () => {
    expect(isMode("execute")).toBe(true);
    expect(isMode("update")).toBe(true);
    expect(isMode("archive")).toBe(true);
    expect(isMode("Upload")).toBe(false);
    expect(isMode("")).toBe(false);
    expect(isMode(undefined)).toBe(false);
  });
});

describe("isValidProjectSlug", () => {
  it("accepts lowercase kebab-case", () => {
    for (const slug of [
      "a",
      "a1",
      "settings-flow",
      "subscription-page",
      "x-1-y",
    ]) {
      expect(isValidProjectSlug(slug)).toBe(true);
    }
  });

  it("rejects traversal, separators and casing drift", () => {
    for (const slug of [
      "",
      ".",
      "..",
      "../etc",
      "a/b",
      "a\\b",
      "/abs",
      "-x",
      "x-",
      "Upper",
      "a b",
      "a_b",
    ]) {
      expect(isValidProjectSlug(slug)).toBe(false);
    }
  });

  it("enforces the 64-character ceiling", () => {
    expect(isValidProjectSlug("a".repeat(64))).toBe(true);
    expect(isValidProjectSlug("a".repeat(65))).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidProjectSlug(undefined)).toBe(false);
    expect(isValidProjectSlug(42)).toBe(false);
  });

  it("assertProjectSlug throws with the offending value", () => {
    expect(assertProjectSlug("ok-slug")).toBe("ok-slug");
    expect(() => assertProjectSlug("..")).toThrow(/Invalid project slug/);
  });
});

describe("parseCommandArgs", () => {
  it("splits the mode token from the requirement text", () => {
    expect(parseCommandArgs("hifi 做一个订阅页")).toEqual({
      mode: "hifi",
      rest: "做一个订阅页",
    });
  });

  it("recognises the command-only modes", () => {
    expect(parseCommandArgs("update")).toEqual({
      mode: "update",
      rest: "",
    });
    expect(parseCommandArgs("archive")).toEqual({
      mode: "archive",
      rest: "",
    });
    expect(parseCommandArgs("update 订阅页")).toEqual({
      mode: "update",
      rest: "订阅页",
    });
  });

  it("returns no mode when the first token is not a mode", () => {
    expect(parseCommandArgs("随便写点什么")).toEqual({
      mode: undefined,
      rest: "随便写点什么",
    });
  });

  it("tolerates an empty argument string", () => {
    expect(parseCommandArgs("   ")).toEqual({
      rest: "",
    });
  });
});

describe("pickChoice", () => {
  const choices = toChoices(
    [
      {
        kind: "wireframe",
        project: "subscription-page",
      },
      {
        kind: "hifi",
        project: "settings-flow",
      },
    ],
    (item) => `${item.project} / ${item.kind}`,
  );

  it("round-trips a label back to its item", () => {
    expect(choiceLabels(choices)).toEqual([
      "subscription-page / wireframe",
      "settings-flow / hifi",
    ]);
    expect(pickChoice(choices, "settings-flow / hifi")).toEqual({
      kind: "hifi",
      project: "settings-flow",
    });
  });

  it("returns undefined on cancellation instead of guessing", () => {
    expect(pickChoice(choices, undefined)).toBeUndefined();
  });

  it("returns undefined for an unknown label", () => {
    expect(pickChoice(choices, "nope / hifi")).toBeUndefined();
  });
});

describe("formatStamp", () => {
  it("produces a fixed-width, lexicographically sortable stamp", () => {
    expect(formatStamp(new Date("2026-09-13T10:22:31.123Z"))).toBe("2026-09-13 10:22");
  });
});

describe("highestVersion", () => {
  it("returns 0 for no versions so the first snapshot is v1", () => {
    expect(highestVersion([])).toBe(0);
  });

  it("returns the maximum", () => {
    expect(
      highestVersion([
        1,
        7,
        3,
      ]),
    ).toBe(7);
  });
});

describe("insertChangelogEntry", () => {
  const skeleton = `# CHANGELOG — hifi\n\n> intro\n\n${CHANGELOG_MARKER}\n`;

  it("puts the newest entry directly under the marker", () => {
    const once = insertChangelogEntry(
      skeleton,
      "## 2026-09-13 10:00 · v1\n- 变更：首版",
    );
    const twice = insertChangelogEntry(
      once,
      "## 2026-09-13 11:00 · v2\n- 变更：改 hero",
    );
    const order = twice.indexOf("v2") < twice.indexOf("v1");
    expect(order).toBe(true);
    expect(twice.indexOf(CHANGELOG_MARKER) < twice.indexOf("v2")).toBe(true);
  });

  it("appends when the marker was removed by a human", () => {
    const result = insertChangelogEntry(
      "# CHANGELOG\n\n手写内容\n",
      "## 2026-09-13 10:00 · v1",
    );
    expect(result).toContain("手写内容");
    expect(result).toContain("v1");
  });

  it("stays idempotent for repeated insertion of the same entry", () => {
    const entry = "## 2026-09-13 10:00 · v1\n- 变更：首版";
    const once = insertChangelogEntry(skeleton, entry);
    const twice = insertChangelogEntry(once, entry);
    expect(twice.match(/· v1/g)).toHaveLength(2);
  });
});

describe("latestEntryTitle", () => {
  it("returns the first heading, which is the newest entry", () => {
    const text =
      "# CHANGELOG\n\n## 2026-09-13 11:00 · v2\n\n## 2026-09-13 10:00 · v1\n";
    expect(latestEntryTitle(text)).toBe("2026-09-13 11:00 · v2");
  });

  it("returns null for an empty changelog", () => {
    expect(latestEntryTitle("")).toBeNull();
  });
});

describe("renderChangelogEntry", () => {
  it("omits the rollback line for v1 and includes it afterwards", () => {
    const base = {
      change: "首版",
      kind: "wireframe" as const,
      project: "subscription-page",
      stamp: "2026-09-13 10:00",
      version: 1,
    };
    expect(
      renderChangelogEntry({
        ...base,
        rollbackFrom: null,
      }),
    ).not.toContain("回滚到");
    expect(
      renderChangelogEntry({
        ...base,
        rollbackFrom: 1,
        version: 2,
      }),
    ).toContain(rollbackCommand("subscription-page", "wireframe", 1));
    expect(
      renderChangelogEntry({
        ...base,
        rollbackFrom: 1,
        version: 2,
      }),
    ).toContain(".pi/prototype-design/subscription-page/wireframe/v1");
  });

  it("records reason and files when supplied", () => {
    const entry = renderChangelogEntry({
      change: "hero 改上下堆叠",
      kind: "hifi",
      project: "subscription-page",
      reason: "移动端优先",
      rollbackFrom: null,
      stamp: "2026-09-13 10:00",
      version: 1,
      files: [
        "index.html",
      ],
    });
    expect(entry).toContain("- 原因：移动端优先");
    expect(entry).toContain("`index.html`");
  });
});

describe("archive", () => {
  it("names the archive directory from date, project and kind", () => {
    expect(
      archiveDirName("subscription-page", "hifi", new Date("2026-09-13T10:22:31Z")),
    ).toBe("2026-09-13-subscription-page-hifi");
  });

  it("keeps the log date and the directory date on the same clock", () => {
    const at = new Date("2026-09-13T23:59:00Z");
    expect(
      archiveDirName("a1", "wireframe", at).startsWith(formatStamp(at).slice(0, 10)),
    ).toBe(true);
  });

  it("renders an entry carrying a runnable restore command", () => {
    const name = "2026-09-13-subscription-page-hifi";
    const entry = renderArchiveEntry({
      archiveDir: archivePath(name),
      kind: "hifi",
      project: "subscription-page",
      stamp: "2026-09-13 10:22",
      versions: [
        1,
        2,
        3,
      ],
    });
    expect(entry).toContain("## 2026-09-13 10:22 · subscription-page / hifi");
    expect(entry).toContain("- 版本：v1 v2 v3");
    expect(entry).toContain("- 原路径：.pi/prototype-design/subscription-page/hifi");
    expect(entry).toContain(`- 归档到：.pi/prototype-design/archive/${name}`);
    expect(entry).toContain(
      `mkdir -p .pi/prototype-design/subscription-page && mv .pi/prototype-design/archive/${name} .pi/prototype-design/subscription-page/hifi`,
    );
  });

  it("says 无 when a stage was archived with no snapshot at all", () => {
    const entry = renderArchiveEntry({
      archiveDir: archivePath("2026-09-13-a1-wireframe"),
      kind: "wireframe",
      project: "a1",
      stamp: "2026-09-13 10:22",
      versions: [],
    });
    expect(entry).toContain("- 版本：无");
  });
});

describe("parseTaskProgress", () => {
  it("counts checkboxes and treats ⏳ in_progress as unfinished", () => {
    expect(
      parseTaskProgress(
        [
          "## 任务",
          "- [x] 1.1 首页结构",
          "- [ ] 1.2 空态 ⏳ in_progress",
          "- [X] 1.3 错误态",
        ].join("\n"),
      ),
    ).toEqual({
      done: 2,
      total: 3,
    });
  });

  it("returns null for prose-only content, so a skeleton is not a plan", () => {
    expect(parseTaskProgress("## 任务\n\n还没写任务\n")).toBeNull();
  });

  it("never counts a checkbox inside an indented note away from column start", () => {
    // 验证子行不是任务行：它不带方框，所以只数真正的任务。
    expect(parseTaskProgress("- [x] 1.1 骨架\n  验证: 打开页面通过\n")).toEqual({
      done: 1,
      total: 1,
    });
  });

  it("a fresh tasks.md skeleton parses to null, so setup alone never looks like a plan", () => {
    expect(parseTaskProgress(docTemplate("wireframe", "tasks.md") ?? "")).toBeNull();
    expect(parseTaskProgress(docTemplate("hifi", "tasks.md") ?? "")).toBeNull();
  });
});

describe("stage predicates", () => {
  it("hasOutput is about produced files or versions", () => {
    expect(
      hasOutput({
        currentFileCount: 0,
        versions: [],
      }),
    ).toBe(false);
    expect(
      hasOutput({
        currentFileCount: 1,
        versions: [],
      }),
    ).toBe(true);
    expect(
      hasOutput({
        currentFileCount: 0,
        versions: [
          1,
        ],
      }),
    ).toBe(true);
  });

  it("hasPlan is about a parsed task list", () => {
    expect(
      hasPlan({
        tasks: null,
      }),
    ).toBe(false);
    expect(
      hasPlan({
        tasks: {
          done: 0,
          total: 2,
        },
      }),
    ).toBe(true);
  });
});
