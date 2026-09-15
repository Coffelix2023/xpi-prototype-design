import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupArtifacts } from "./artifacts.js";
import { writeProductMap } from "./product-map.js";
import { describeOverview, describeState, registerPrototypeTools } from "./tools.js";

const MULTI_PAGE_REFUSAL = /Multi-page products require pageId or flow/;
const UNKNOWN_PAGE = /Unknown product page/;
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
    expect(joined).toContain("只被读取");
    expect(joined).toContain("prototype_migration_scan");
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

/**
 * 预览的拒绝路径。只测会抛错的分支：真的放行会去调系统浏览器，测试里不能碰。
 */
describe("prototype_preview guards", () => {
  type PreviewHandler = (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: unknown,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<unknown>;

  function previewTool(): PreviewHandler {
    let handler: PreviewHandler | undefined;
    registerPrototypeTools({
      registerTool: (tool: { execute: PreviewHandler; name: string }) => {
        if (tool.name === "prototype_preview") handler = tool.execute;
      },
    } as unknown as ExtensionAPI);
    if (!handler) throw new Error("prototype_preview was not registered");
    return handler;
  }

  const twoPages = {
    product: "checkout",
    version: 1 as const,
    pages: [
      {
        fidelity: "wireframe" as const,
        id: "home",
        implementation: "prototype" as const,
        name: "首页",
      },
      {
        fidelity: "hifi" as const,
        id: "done",
        implementation: "prototype" as const,
        name: "完成",
      },
    ],
  };

  it("refuses to guess a page in a multi-page product", async () => {
    await writeProductMap(root, "checkout", twoPages);
    const preview = previewTool();

    await expect(
      preview(
        "call",
        {
          kind: "wireframe",
          project: "checkout",
        },
        undefined,
        undefined,
        ctx(),
      ),
    ).rejects.toThrow(MULTI_PAGE_REFUSAL);
  });

  it("rejects an unknown page id instead of falling back to a file", async () => {
    await writeProductMap(root, "checkout", twoPages);
    const preview = previewTool();

    await expect(
      preview(
        "call",
        {
          kind: "wireframe",
          pageId: "nope",
          project: "checkout",
        },
        undefined,
        undefined,
        ctx(),
      ),
    ).rejects.toThrow(UNKNOWN_PAGE);
  });
});
