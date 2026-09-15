// biome-ignore-all lint/security/noSecrets: 夹具里的 HTML / YAML 片段都是固定字符串。
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerSemanticTools } from "./semantic-annotate.js";
import {
  loadSemanticMap,
  parseInput,
  parseSemanticMap,
  SEMANTIC_MAP_FILE,
  validateSemanticMap,
} from "./semantic-ui-map.js";
import { registerPrototypeTools } from "./tools.js";

/**
 * 端到端流程：初始化 → 填字典 → 产出 HTML → 标注 → 校验 → 快照 → 版本递增。
 *
 * 单测各自盯一个函数，这里只盯**串起来是否还说同一件事**：字典里的短码、
 * HTML 里的 id、快照里的字节、CHANGELOG 里的版本号，四者必须互相对得上。
 */

type Handler = (
  toolCallId: string,
  params: Record<string, unknown>,
  signal: unknown,
  onUpdate: unknown,
  ctx: ExtensionContext,
) => Promise<unknown>;

const PROJECT = "checkout";
const PAGE = "chat";
const KIND = "wireframe";

let root = "";

function ctx(): ExtensionContext {
  return {
    cwd: root,
  } as unknown as ExtensionContext;
}

function handlers(): Map<string, Handler> {
  const registered = new Map<string, Handler>();
  const pi = {
    registerTool: (tool: { execute: Handler; name: string }) => {
      registered.set(tool.name, tool.execute);
    },
  } as unknown as ExtensionAPI;
  registerPrototypeTools(pi);
  registerSemanticTools(pi);
  return registered;
}

function productRoot(): string {
  return join(root, ".pi/prototype-design", PROJECT);
}

function stageCurrent(): string {
  return join(productRoot(), "pages", PAGE, KIND, "current");
}

function mapPath(): string {
  return join(productRoot(), SEMANTIC_MAP_FILE);
}

function elementBlock(
  id: string,
  short: string,
  label: string,
  status: string,
): string {
  return [
    `  ${id}:`,
    `    short: ${short}`,
    `    label: ${label}`,
    `    type: button`,
    `    status: ${status}`,
    `    stage_created: wireframe`,
    `    fidelities:`,
    `      wireframe: pages/${PAGE}/${KIND}/current/index.html#${short}`,
    "",
  ].join("\n");
}

function dictionary(): string {
  return [
    "meta:",
    `  project: ${PROJECT}`,
    "  version: 1",
    "  type: multi-page",
    "  updated: 2026-01-01 00:00",
    "  annotate_default: true",
    "pages:",
    "  P1:",
    `    id: ${PAGE}`,
    "    label: 对话",
    "    route: pages/chat/wireframe/current/index.html",
    "    status: confirmed",
    "elements:",
    elementBlock("chat.composer.send-btn", "P1-2-B1", "发送按钮", "confirmed"),
  ].join("\n");
}

function page(content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>对话</title></head>
<body>
  <main id="P1-1">
    ${content}
  </main>
</body>
</html>
`;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-semantic-flow-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("semantic-ui-map 端到端", () => {
  it("从初始化走到第二次快照：字典、HTML、快照、版本号始终对得上", async () => {
    const tools = handlers();
    const setup = tools.get("prototype_setup");
    const annotate = tools.get("semantic_ui_map_annotate");
    const snapshot = tools.get("prototype_snapshot");
    expect(setup && annotate && snapshot).toBeTruthy();

    // 1. 初始化：阶段骨架 + 空字典骨架。
    await setup?.(
      "call",
      {
        kind: KIND,
        pageId: PAGE,
        project: PROJECT,
      },
      undefined,
      undefined,
      ctx(),
    );
    expect((await loadSemanticMap(root, PROJECT))?.meta.version).toBe(1);

    // 2. agent 填字典（setup 只建骨架，页面与元素由深挖后登记）。
    await writeFile(mapPath(), dictionary(), "utf8");

    // 3. agent 产出 HTML：元素 id 写短码。
    const indexHtml = join(stageCurrent(), "index.html");
    await writeFile(
      indexHtml,
      page('<button type="button" id="P1-2-B1">发送</button>'),
      "utf8",
    );

    // 4. 标注：补徽标属性 + 注入徽标系统。
    await annotate?.(
      "call",
      {
        kind: KIND,
        pageId: PAGE,
        project: PROJECT,
      },
      undefined,
      undefined,
      ctx(),
    );
    const annotated = await readFile(indexHtml, "utf8");
    expect(annotated).toContain('data-semantic-badge="P1-2-B1"');
    expect(annotated).toContain('data-status="confirmed"');
    expect(annotated).toContain("<style data-badge-system>");
    expect(annotated).toContain('id="badge-toggle-btn"');

    // 5. 校验字典本身没毛病。
    const map = await loadSemanticMap(root, PROJECT);
    expect(map).not.toBeNull();
    expect(validateSemanticMap(map!).errors).toEqual([]);

    // 6. 三种输入都能解析回同一个元素——这是用户念短码的落点。
    for (const input of [
      "P1-2-B1",
      "chat.composer.send-btn",
      "发送按钮",
    ]) {
      const parsed = parseInput(input, map!);
      expect(parsed.matched).toBe(true);
      expect(parsed.matched && parsed.element.id).toBe("chat.composer.send-btn");
    }

    // 7. 快照：v1 里应当带着徽标，字典版本跟着走。
    await snapshot?.(
      "call",
      {
        change: "首版",
        kind: KIND,
        pageId: PAGE,
        project: PROJECT,
      },
      undefined,
      undefined,
      ctx(),
    );
    const v1 = await readFile(
      join(productRoot(), "pages", PAGE, KIND, "v1", "index.html"),
      "utf8",
    );
    expect(v1).toContain('data-semantic-badge="P1-2-B1"');
    expect(
      await readFile(join(productRoot(), "pages", PAGE, KIND, "CHANGELOG.md"), "utf8"),
    ).toContain("首版");
    expect((await loadSemanticMap(root, PROJECT))?.meta.version).toBe(2);

    // 8. 第二轮：新增元素 + 改 HTML + 再标注。
    await writeFile(
      mapPath(),
      `${await readFile(mapPath(), "utf8")}${elementBlock(
        "chat.composer.attach-btn",
        "P1-2-B2",
        "附件按钮",
        "proposed",
      )}`,
      "utf8",
    );
    await writeFile(
      indexHtml,
      annotated.replace(
        "</main>",
        '  <button type="button" id="P1-2-B2">附件</button>\n  </main>',
      ),
      "utf8",
    );
    await annotate?.(
      "call",
      {
        kind: KIND,
        pageId: PAGE,
        project: PROJECT,
      },
      undefined,
      undefined,
      ctx(),
    );
    const second = await readFile(indexHtml, "utf8");
    expect(second).toContain('data-semantic-badge="P1-2-B2"');
    expect(second).toContain('data-status="proposed"');
    expect(second.match(/id="badge-toggle-btn"/g)).toHaveLength(1);

    // 9. 第二次快照：版本递增，且 v1 是不可变历史——不该出现第二轮的元素。
    await snapshot?.(
      "call",
      {
        change: "加附件按钮",
        kind: KIND,
        pageId: PAGE,
        project: PROJECT,
      },
      undefined,
      undefined,
      ctx(),
    );
    const v2 = await readFile(
      join(productRoot(), "pages", PAGE, KIND, "v2", "index.html"),
      "utf8",
    );
    expect(v2).toContain('data-semantic-badge="P1-2-B2"');
    expect(v1).not.toContain("P1-2-B2");
    expect((await loadSemanticMap(root, PROJECT))?.meta.version).toBe(3);
  });

  it("字典缺失时标注不写盘，流程仍然可预览", async () => {
    const tools = handlers();
    await tools.get("prototype_setup")?.(
      "call",
      {
        kind: KIND,
        pageId: PAGE,
        project: PROJECT,
      },
      undefined,
      undefined,
      ctx(),
    );
    const indexHtml = join(stageCurrent(), "index.html");
    const before = page('<button type="button" id="P1-2-B1">发送</button>');
    await writeFile(indexHtml, before, "utf8");
    await rm(mapPath());

    const result = (await tools.get("semantic_ui_map_annotate")?.(
      "call",
      {
        kind: KIND,
        pageId: PAGE,
        project: PROJECT,
      },
      undefined,
      undefined,
      ctx(),
    )) as {
      details: {
        mapPath: string | null;
      };
    };

    expect(result.details.mapPath).toBeNull();
    expect(await readFile(indexHtml, "utf8")).toBe(before);
  });
});

/**
 * 官方示例是可运行文档，不是陈列品：它必须始终能被本包的解析器读懂、被校验器判为
 * 合格，且带着开关徽标所需的全部零件。这样示例腐烂会在 `pnpm test` 里当场暴露。
 */
describe("官方示例 examples/semantic-ui-map", () => {
  function examplePath(name: string): string {
    return fileURLToPath(
      new URL(`../examples/semantic-ui-map/${name}`, import.meta.url),
    );
  }

  it("字典能被解析，且校验零问题", async () => {
    const map = parseSemanticMap(
      await readFile(examplePath("semantic-ui-map.yaml"), "utf8"),
    );
    expect(map).not.toBeNull();
    if (!map) throw new Error("unreachable");
    expect(map.meta.type).toBe("spa");
    expect(map.meta.annotate_default).toBe(true);
    expect(map.pages.map((item) => item.id)).toEqual([
      "chat",
      "agents",
      "settings",
    ]);
    expect(validateSemanticMap(map).errors).toEqual([]);
  });

  it("HTML 带着徽标系统、开关按钮与客户端路由", async () => {
    const html = await readFile(examplePath("index.html"), "utf8");
    expect(html).toContain("--badge-display");
    expect(html).toContain("::before");
    expect(html).toContain('id="badge-toggle-btn"');
    expect(html).toContain('data-semantic-badge="P1-2-B1"');
    expect(html).toContain("hashchange");
  });
});
