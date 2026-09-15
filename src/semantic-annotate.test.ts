// biome-ignore-all lint/security/noSecrets: 夹具里的 HTML / YAML 片段都是固定字符串。
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { annotateStage } from "./semantic-annotate.js";
import {
  createEmptySemanticMap,
  incrementSemanticMapVersion,
  parseSemanticMap,
  SEMANTIC_MAP_FILE,
} from "./semantic-ui-map.js";
import { registerPrototypeTools } from "./tools.js";

let root = "";

function ctx(): ExtensionContext {
  return {
    cwd: root,
  } as unknown as ExtensionContext;
}

function productRoot(project: string): string {
  return join(root, ".pi/prototype-design", project);
}

async function writeMap(project: string, source: string): Promise<void> {
  const directory = productRoot(project);
  await mkdir(directory, {
    recursive: true,
  });
  await writeFile(join(directory, SEMANTIC_MAP_FILE), source, "utf8");
}

async function writeHtml(
  project: string,
  pageId: string,
  kind: string,
  html: string,
  name = "index.html",
): Promise<string> {
  const directory = join(productRoot(project), "pages", pageId, kind, "current");
  await mkdir(directory, {
    recursive: true,
  });
  const file = join(directory, name);
  await writeFile(file, html, "utf8");
  return file;
}

async function readMap(project: string): Promise<string> {
  return readFile(join(productRoot(project), SEMANTIC_MAP_FILE), "utf8");
}

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>t</title></head>
<body><button type="button" id="P1-2-B1">发送</button></body>
</html>
`;

/** 两页、跨页元素的字典：多页面模式下每个文件只能拿到指向自己的那条。 */
const MULTI_PAGE_MAP = `meta:
  project: checkout
  version: 4
  type: multi-page
  updated: 2026-01-01 00:00
  annotate_default: true
pages:
  P1:
    id: chat
    label: 对话
    route: pages/chat/wireframe/current/index.html
    status: confirmed
  P2:
    id: pricing
    label: 定价
    route: pages/pricing/wireframe/current/pricing.html
    status: proposed
elements:
  chat.composer.send-btn:
    short: P1-2-B1
    label: 发送按钮
    type: button
    status: confirmed
    stage_created: wireframe
    fidelities:
      wireframe: pages/chat/wireframe/current/index.html#P1-2-B1
  pricing.cta.buy:
    short: P2-1-B1
    label: 购买按钮
    type: button
    status: proposed
    stage_created: wireframe
    fidelities:
      wireframe: pages/pricing/wireframe/current/pricing.html#P2-1-B1
`;

const SPA_MAP = `meta:
  project: chat-app
  version: 1
  type: spa
  updated: 2026-01-01 00:00
  annotate_default: false
pages:
  P1:
    id: chat
    label: 对话
    route: "#/chat"
    status: confirmed
elements:
  chat.composer.send-btn:
    short: P1-2-B1
    label: 发送按钮
    type: button
    status: proposed
    stage_created: wireframe
    fidelities:
      wireframe: "#/chat"
`;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-semantic-annotate-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("createEmptySemanticMap", () => {
  it("建出可解析的空骨架：meta.version 1，pages / elements 为空", async () => {
    const result = await createEmptySemanticMap(root, "checkout");
    expect(result.status).toBe("created");
    expect(result.path).toBe(`.pi/prototype-design/checkout/${SEMANTIC_MAP_FILE}`);

    const map = parseSemanticMap(await readMap("checkout"));
    expect(map?.meta.version).toBe(1);
    expect(map?.meta.project).toBe("checkout");
    expect(map?.meta.annotate_default).toBe(true);
    expect(map?.pages).toEqual([]);
    expect(map?.elements).toEqual([]);
  });

  it("已存在时完全不改动", async () => {
    await writeMap("checkout", "# 人工写的字典\nmeta:\n  version: 7\n");
    const result = await createEmptySemanticMap(root, "checkout");
    expect(result.status).toBe("present");
    expect(await readMap("checkout")).toBe("# 人工写的字典\nmeta:\n  version: 7\n");
  });
});

describe("incrementSemanticMapVersion", () => {
  it("version 加一、updated 换新，其余字节原样保留", async () => {
    await writeMap("checkout", MULTI_PAGE_MAP);
    const result = await incrementSemanticMapVersion(
      root,
      "checkout",
      new Date("2026-02-03T04:05:06Z"),
    );
    expect(result).toEqual({
      path: `.pi/prototype-design/checkout/${SEMANTIC_MAP_FILE}`,
      updated: "2026-02-03 04:05",
      version: 5,
    });

    const source = await readMap("checkout");
    expect(source).toContain("  version: 5");
    expect(source).toContain("  updated: 2026-02-03 04:05");
    // 注释、页面与元素都没被重排或丢掉。
    expect(source).toContain("  P2:");
    expect(source).toContain("  pricing.cta.buy:");
    expect(source).toContain(
      "      wireframe: pages/pricing/wireframe/current/pricing.html#P2-1-B1",
    );
    expect(parseSemanticMap(source)?.elements).toHaveLength(2);
  });

  it("字典不存在时返回 null，不建文件", async () => {
    expect(await incrementSemanticMapVersion(root, "checkout")).toBeNull();
    await expect(readMap("checkout")).rejects.toThrow();
  });

  it("读不懂的字典不动它", async () => {
    await writeMap("checkout", "这不是字典\n");
    expect(await incrementSemanticMapVersion(root, "checkout")).toBeNull();
    expect(await readMap("checkout")).toBe("这不是字典\n");
  });
});

describe("annotateStage", () => {
  it("没有字典时一个字节都不写", async () => {
    const file = await writeHtml("checkout", "chat", "wireframe", PAGE);
    const result = await annotateStage(root, {
      kind: "wireframe",
      pageId: "chat",
      project: "checkout",
    });

    expect(result.mapPath).toBeNull();
    expect(result.files).toEqual([]);
    expect(await readFile(file, "utf8")).toBe(PAGE);
  });

  it("multi-page：只标注 fidelities 指向本文件的元素", async () => {
    await writeMap("checkout", MULTI_PAGE_MAP);
    // 本页文件里刻意也放了另一页的元素 id：它不该被标上。
    const file = await writeHtml(
      "checkout",
      "chat",
      "wireframe",
      '<div id="P1-2-B1">发送</div><div id="P2-1-B1">购买</div>',
    );

    const result = await annotateStage(root, {
      kind: "wireframe",
      pageId: "chat",
      project: "checkout",
    });
    expect(result.candidates).toBe(2);
    expect(result.files).toEqual([
      {
        badges: 1,
        file: ".pi/prototype-design/checkout/pages/chat/wireframe/current/index.html",
      },
    ]);

    const html = await readFile(file, "utf8");
    expect(html).toContain(
      'id="P1-2-B1" data-semantic-badge="P1-2-B1" data-status="confirmed"',
    );
    expect(html).toContain('<div id="P2-1-B1">购买</div>');
    expect(html).toContain("<style data-badge-system>");
    expect(html).toContain('id="badge-toggle-btn"');
  });

  it("multi-page：换一个文件就换一批元素", async () => {
    await writeMap("checkout", MULTI_PAGE_MAP);
    const file = await writeHtml(
      "checkout",
      "pricing",
      "wireframe",
      '<div id="P2-1-B1">购买</div>',
      "pricing.html",
    );
    const result = await annotateStage(root, {
      kind: "wireframe",
      pageId: "pricing",
      project: "checkout",
    });
    expect(result.files[0]?.badges).toBe(1);
    expect(await readFile(file, "utf8")).toContain('data-semantic-badge="P2-1-B1"');
  });

  it("spa：不按文件过滤，按 id 命中，并跟随 annotate_default 初始隐藏", async () => {
    await writeMap("checkout", SPA_MAP);
    const file = await writeHtml("checkout", "chat", "wireframe", PAGE);
    const result = await annotateStage(root, {
      kind: "wireframe",
      pageId: "chat",
      project: "checkout",
    });

    expect(result.annotateDefault).toBe(false);
    const html = await readFile(file, "utf8");
    expect(html).toContain("--badge-display: none");
    expect(html).toContain(">OFF</button>");
  });

  it("幂等：第二次调用不再改动文件", async () => {
    await writeMap("checkout", MULTI_PAGE_MAP);
    const file = await writeHtml("checkout", "chat", "wireframe", PAGE);
    const input = {
      kind: "wireframe",
      pageId: "chat",
      project: "checkout",
    } as const;

    await annotateStage(root, input);
    const once = await readFile(file, "utf8");
    await annotateStage(root, input);
    expect(await readFile(file, "utf8")).toBe(once);
  });

  it("id 没写对时不注入，并把文件报进 skipped", async () => {
    await writeMap("checkout", MULTI_PAGE_MAP);
    const file = await writeHtml(
      "checkout",
      "chat",
      "wireframe",
      '<div id="send-btn">发送</div>',
    );
    const result = await annotateStage(root, {
      kind: "wireframe",
      pageId: "chat",
      project: "checkout",
    });

    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([
      ".pi/prototype-design/checkout/pages/chat/wireframe/current/index.html",
    ]);
    const html = await readFile(file, "utf8");
    expect(html).toBe('<div id="send-btn">发送</div>');
  });
});

/** 6.1 / 6.3 的接线：扩展自己在 setup / snapshot 里维护字典元数据。 */
describe("setup 与 snapshot 的字典接线", () => {
  type Handler = (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: unknown,
    onUpdate: unknown,
    ctx: ExtensionContext,
  ) => Promise<unknown>;

  function handler(name: string): Handler {
    let found: Handler | undefined;
    registerPrototypeTools({
      registerTool: (tool: { execute: Handler; name: string }) => {
        if (tool.name === name) found = tool.execute;
      },
    } as unknown as ExtensionAPI);
    if (!found) throw new Error(`${name} was not registered`);
    return found;
  }

  it("prototype_setup 建出空字典骨架", async () => {
    await handler("prototype_setup")(
      "call",
      {
        kind: "wireframe",
        pageId: "chat",
        project: "checkout",
      },
      undefined,
      undefined,
      ctx(),
    );
    expect(parseSemanticMap(await readMap("checkout"))?.meta.version).toBe(1);
  });

  it("prototype_snapshot 在 vN 之后递增字典版本", async () => {
    await writeMap("checkout", MULTI_PAGE_MAP);
    await writeHtml("checkout", "chat", "wireframe", PAGE);

    await handler("prototype_snapshot")(
      "call",
      {
        change: "首版",
        kind: "wireframe",
        pageId: "chat",
        project: "checkout",
      },
      undefined,
      undefined,
      ctx(),
    );

    const map = parseSemanticMap(await readMap("checkout"));
    expect(map?.meta.version).toBe(5);
    expect(map?.meta.updated).not.toBe("2026-01-01 00:00");
  });
});
