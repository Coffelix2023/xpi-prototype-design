import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupArtifacts } from "./artifacts.js";
import { describeOverview, describeState } from "./tools.js";

let root = "";

function ctx(): ExtensionContext {
  return {
    cwd: root,
  } as unknown as ExtensionContext;
}

async function produce(
  project: string,
  kind: "hifi" | "wireframe",
  content: string,
): Promise<void> {
  await setupArtifacts(root, project, kind);
  await writeFile(
    join(root, ".pi/prototype-design", project, kind, "current/index.html"),
    content,
    "utf8",
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-prototype-design-tools-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("describeOverview", () => {
  it("says so when there is nothing yet", async () => {
    expect(await describeOverview(ctx())).toEqual([
      "（暂无原型设计项目）",
    ]);
  });

  it("emits one line per live stage, empties excluded", async () => {
    await setupArtifacts(root, "subscription-page", "wireframe"); // 空壳
    await produce("subscription-page", "hifi", "<h1/>");
    await produce("settings-flow", "wireframe", "<svg/>");

    const lines = await describeOverview(ctx());
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("settings-flow / wireframe");
    expect(lines[1]).toContain("subscription-page / hifi");
    expect(lines[1]).toContain("1 文件");
  });

  it("filters by kind", async () => {
    await produce("subscription-page", "hifi", "<h1/>");
    await produce("subscription-page", "wireframe", "<svg/>");
    const lines = await describeOverview(ctx(), "hifi");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("subscription-page / hifi");
  });

  it("hints at the legacy layout without touching it", async () => {
    await mkdir(join(root, ".pi/prototype-design/wireframe"), {
      recursive: true,
    });
    const joined = (await describeOverview(ctx())).join("\n");
    expect(joined).toContain("检测到旧布局");
    expect(joined).toContain("不自动迁移");
    await expect(
      stat(join(root, ".pi/prototype-design/wireframe")),
    ).resolves.toBeTruthy();
  });
});

describe("describeState", () => {
  it("names the project-scoped directory, so the line is self-describing", async () => {
    await setupArtifacts(root, "subscription-page", "hifi");
    expect(await describeState(ctx(), "subscription-page", "hifi")).toContain(
      ".pi/prototype-design/subscription-page/hifi",
    );
  });
});
