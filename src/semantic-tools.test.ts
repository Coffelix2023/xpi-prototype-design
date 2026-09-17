// biome-ignore-all lint/security/noSecrets: 夹具里的 HTML / YAML 片段都是固定字符串。
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ParseToolResult,
  registerSemanticReadTools,
  type ValidateToolResult,
  validateProjectMap,
} from "./semantic-tools.js";
import { SEMANTIC_MAP_FILE } from "./semantic-ui-map.js";

/**
 * 两个只读工具的验收面：三态 + 不写盘 + 解析的四种结果 + page 消歧 + 注册名。
 *
 * 夹具刻意用**跨页面共享别名**（两个页面都有「按钮」）：那正是解析器最容易被写坏的
 * 地方——一个 `includes` 收窄失败就会串页，而串页的表现在工具输出里看不出来。
 */

type ToolResult = {
  content: {
    text: string;
    type: string;
  }[];
  details: unknown;
};
type Handler = (
  toolCallId: string,
  params: Record<string, unknown>,
  signal: unknown,
  onUpdate: unknown,
  ctx: ExtensionContext,
) => Promise<ToolResult>;

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
  registerSemanticReadTools(pi);
  return registered;
}

function handler(name: string): Handler {
  const found = handlers().get(name);
  if (!found) throw new Error(`${name} was not registered`);
  return found;
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

/** 整棵目录树的「相对路径 → 字节」。只读断言就靠它前后比对。 */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const snapshotTree: Record<string, string> = {};
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath, entry.name);
    snapshotTree[absolute.slice(root.length + 1)] = await readFile(absolute, "utf8");
  }
  return snapshotTree;
}

const CLEAN_MAP = `meta:
  project: checkout
  version: 3
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
    status: confirmed
elements:
  chat.composer.send-btn:
    short: P1-2-B1
    label: 发送按钮
    aliases: [发送]
    type: button
    status: confirmed
    stage_created: wireframe
    fidelities:
      wireframe: pages/chat/wireframe/current/index.html#P1-2-B1
`;

/**
 * 同一份字典，但那个元素已推进生产——只多一个 `impl` 段。
 * 直接拼在末尾是对的：`impl` 与 `fidelities` 同为 4 空格缩进的兄弟键。
 */
const PROMOTED_MAP =
  CLEAN_MAP +
  "    impl:\n      path: components/chat/composer.tsx\n      export: Composer\n      promoted_at: 2026-03-01\n";

/** 两页共享同一个别名「按钮」——消歧的靶子。 */
const SHARED_ALIAS_MAP = `meta:
  project: checkout
  version: 2
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
    status: confirmed
elements:
  chat.composer.send-btn:
    short: P1-2-B1
    label: 发送按钮
    aliases: [按钮]
    type: button
    status: confirmed
    stage_created: wireframe
    fidelities:
      wireframe: pages/chat/wireframe/current/index.html#P1-2-B1
  pricing.cta.buy:
    short: P2-1-B1
    label: 购买按钮
    aliases: [按钮]
    type: button
    status: proposed
    stage_created: wireframe
    fidelities:
      wireframe: pages/pricing/wireframe/current/pricing.html#P2-1-B1
`;

/** 短码冲突：第二个元素的短码与第一个相同。 */
const DUPLICATE_SHORT_MAP = `meta:
  project: checkout
  version: 1
  type: multi-page
  updated: 2026-01-01 00:00
  annotate_default: true
pages: {}
elements:
  chat.composer.send-btn:
    short: P1-2-B1
    label: 发送按钮
    type: button
    status: confirmed
    stage_created: wireframe
    fidelities:
      wireframe: pages/chat/wireframe/current/index.html#P1-2-B1
  chat.composer.attach-btn:
    short: P1-2-B1
    label: 附件按钮
    type: button
    status: confirmed
    stage_created: wireframe
    fidelities:
      wireframe: pages/chat/wireframe/current/index.html#P1-2-B2
`;

/** 问题码多于上限的字典：6 个元素各缺 `short` 与 `label`，必然超过 10 条。 */
function manyProblemsMap(): string {
  const elements = Array.from(
    {
      length: 6,
    },
    (_unused, index) => `  chat.item.n${index + 1}:\n    type: button`,
  ).join("\n");
  return `meta:
  project: checkout
  version: 1
  type: spa
  updated: 2026-01-01 00:00
  annotate_default: true
pages: {}
elements:
${elements}
`;
}

/** 14 个元素共享别名「按钮」——用来验候选封顶与总数。 */
function wideMap(): string {
  const elements = Array.from(
    {
      length: 14,
    },
    (_unused, index) => `  chat.item.n${index + 1}:
    short: P1-2-B${index + 1}
    label: 按钮${index + 1}
    aliases: [按钮]
    type: button
    status: proposed
    stage_created: wireframe
    fidelities:
      wireframe: "#/chat"`,
  ).join("\n");
  return `meta:
  project: wide
  version: 1
  type: spa
  updated: 2026-01-01 00:00
  annotate_default: true
pages:
  P1:
    id: chat
    label: 对话
    route: "#/chat"
    status: confirmed
elements:
${elements}
`;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-semantic-tools-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("semantic_ui_map_validate", () => {
  async function validate(project: string): Promise<{
    details: ValidateToolResult;
    text: string;
  }> {
    const result = await handler("semantic_ui_map_validate")(
      "call",
      {
        project,
      },
      undefined,
      undefined,
      ctx(),
    );
    return {
      details: result.details as ValidateToolResult,
      text: result.content[0].text,
    };
  }

  it("干净字典 → valid，且明说 0 条问题码", async () => {
    await writeMap("checkout", CLEAN_MAP);
    const { details, text } = await validate("checkout");

    expect(details.status).toBe("valid");
    expect(details.total).toBe(0);
    expect(details.errors).toEqual([]);
    expect(details.version).toBe(3);
    expect(details.mapPath).toBe(`.pi/prototype-design/checkout/${SEMANTIC_MAP_FILE}`);
    expect(text).toContain("校验通过");
  });

  it("有问题码 → invalid，并给出冲突元素的路径", async () => {
    await writeMap("checkout", DUPLICATE_SHORT_MAP);
    const { details, text } = await validate("checkout");

    expect(details.status).toBe("invalid");
    expect(details.errors).toContainEqual({
      code: "duplicate-short",
      message:
        "短码冲突：「P1-2-B1」同时指向「chat.composer.send-btn」和「chat.composer.attach-btn」",
      path: "chat.composer.attach-btn",
    });
    expect(text).toContain("chat.composer.attach-btn");
    expect(text).toContain("duplicate-short");
  });

  it("字典缺失 → missing，文案明说未做校验", async () => {
    const { details, text } = await validate("checkout");

    expect(details.status).toBe("missing");
    expect(details.mapPath).toBeNull();
    expect(details.errors).toEqual([]);
    expect(text).toContain("未做校验");
  });

  it("字典文件在但读不出来 → unreadable，不当成缺失也不当成通过", async () => {
    await writeMap("checkout", "这不是字典\n");
    const { details, text } = await validate("checkout");

    expect(details.status).toBe("unreadable");
    expect(details.mapPath).toBe(`.pi/prototype-design/checkout/${SEMANTIC_MAP_FILE}`);
    expect(details.problem).toBeTruthy();
    expect(text).toContain("未做校验");
  });

  it("问题码超过上限时报「共 N 条，已显示 M 条」", async () => {
    await writeMap("checkout", manyProblemsMap());
    const { details, text } = await validate("checkout");

    expect(details.status).toBe("invalid");
    expect(details.errors).toHaveLength(10);
    expect(details.shown).toBe(10);
    expect(details.total).toBeGreaterThan(10);
    expect(text).toContain(`共 ${details.total} 条问题码，已显示 10 条`);
  });
});

describe("semantic_ui_map_parse", () => {
  async function parse(params: Record<string, unknown>): Promise<{
    details: ParseToolResult;
    text: string;
  }> {
    const result = await handler("semantic_ui_map_parse")(
      "call",
      params,
      undefined,
      undefined,
      ctx(),
    );
    return {
      details: result.details as ParseToolResult,
      text: result.content[0].text,
    };
  }

  it("短码直接命中，返回元素摘要", async () => {
    await writeMap("checkout", CLEAN_MAP);
    const { details, text } = await parse({
      input: "P1-2-B1",
      project: "checkout",
    });

    expect(details.status).toBe("matched");
    expect(details.element).toEqual({
      id: "chat.composer.send-btn",
      impl: null,
      short: "P1-2-B1",
      status: "confirmed",
      type: "button",
      fidelities: {
        hifi: null,
        wireframe: "pages/chat/wireframe/current/index.html#P1-2-B1",
      },
    });
    expect(text).toContain("chat.composer.send-btn");
  });

  it("未推进生产的元素明说没有落点，不用空串顶上", async () => {
    await writeMap("checkout", CLEAN_MAP);
    const { details, text } = await parse({
      input: "P1-2-B1",
      project: "checkout",
    });

    expect(details.element?.impl).toBeNull();
    expect(text).toContain("未登记生产落点");
  });

  it("已推进生产的元素带出 impl，文案给出生产落点", async () => {
    await writeMap("checkout", PROMOTED_MAP);
    const { details, text } = await parse({
      input: "P1-2-B1",
      project: "checkout",
    });

    expect(details.element?.impl).toEqual({
      export: "Composer",
      path: "components/chat/composer.tsx",
      promoted_at: "2026-03-01",
    });
    expect(text).toContain("impl: components/chat/composer.tsx · export Composer");
  });

  it("全路径直接命中", async () => {
    await writeMap("checkout", CLEAN_MAP);
    const { details } = await parse({
      input: "chat.composer.send-btn",
      project: "checkout",
    });

    expect(details.status).toBe("matched");
    expect(details.element?.short).toBe("P1-2-B1");
  });

  it("唯一别名命中", async () => {
    await writeMap("checkout", CLEAN_MAP);
    const { details } = await parse({
      input: "发送",
      project: "checkout",
    });

    expect(details.status).toBe("matched");
    expect(details.element?.id).toBe("chat.composer.send-btn");
  });

  it("多候选时封顶 10 条并报总数，不替用户挑", async () => {
    await writeMap("wide", wideMap());
    const { details, text } = await parse({
      input: "按钮",
      project: "wide",
    });

    expect(details.status).toBe("ambiguous");
    expect(details.element).toBeNull();
    expect(details.candidates).toHaveLength(10);
    expect(details.shown).toBe(10);
    expect(details.total).toBe(14);
    expect(text).toContain("已显示 10 个");
    expect(text).toContain("14 个元素");
  });

  it("没登记就报 unregistered，不退化成模糊匹配", async () => {
    await writeMap("checkout", CLEAN_MAP);
    const missing = await parse({
      input: "P9-9-B9",
      project: "checkout",
    });
    expect(missing.details.status).toBe("unregistered");
    expect(missing.details.candidates).toEqual([]);
    expect(missing.text).toContain("没有登记");

    const nonsense = await parse({
      input: "宇宙飞船",
      project: "checkout",
    });
    expect(nonsense.details.status).toBe("unregistered");
  });

  it("page 上下文只在该页内搜索，不串台", async () => {
    await writeMap("checkout", SHARED_ALIAS_MAP);

    const worldwide = await parse({
      input: "按钮",
      project: "checkout",
    });
    expect(worldwide.details.status).toBe("ambiguous");
    expect(worldwide.details.total).toBe(2);

    const chat = await parse({
      input: "按钮",
      page: "chat",
      project: "checkout",
    });
    expect(chat.details.status).toBe("matched");
    expect(chat.details.element?.id).toBe("chat.composer.send-btn");

    // 页面短码同样接受，且落到另一页。
    const pricing = await parse({
      input: "按钮",
      page: "P2",
      project: "checkout",
    });
    expect(pricing.details.status).toBe("matched");
    expect(pricing.details.element?.id).toBe("pricing.cta.buy");
  });

  it("字典缺失时明确报缺失，不返回候选", async () => {
    const { details, text } = await parse({
      input: "按钮",
      project: "checkout",
    });

    expect(details.status).toBe("missing");
    expect(details.candidates).toEqual([]);
    expect(text).toContain("不存在");
  });
});

describe("两个工具都是只读的", () => {
  it("调用前后字典与 current/**/*.html 逐字节相同", async () => {
    await writeMap("checkout", SHARED_ALIAS_MAP);
    const page = join(productRoot("checkout"), "pages", "chat", "wireframe", "current");
    await mkdir(page, {
      recursive: true,
    });
    await writeFile(
      join(page, "index.html"),
      '<!DOCTYPE html><html><body><button id="P1-2-B1">发送</button></body></html>',
      "utf8",
    );

    const before = await snapshot(root);
    await handler("semantic_ui_map_validate")(
      "call",
      {
        project: "checkout",
      },
      undefined,
      undefined,
      ctx(),
    );
    await handler("semantic_ui_map_parse")(
      "call",
      {
        input: "按钮",
        project: "checkout",
      },
      undefined,
      undefined,
      ctx(),
    );
    expect(await snapshot(root)).toEqual(before);
  });

  it("直接调库函数同样不写盘", async () => {
    await writeMap("checkout", SHARED_ALIAS_MAP);
    const before = await snapshot(root);
    await validateProjectMap(root, "checkout");
    expect(await snapshot(root)).toEqual(before);
  });
});

describe("工具注册", () => {
  it("恰好注册两个只读工具名，防改名漂移", () => {
    expect(
      [
        ...handlers().keys(),
      ].sort(),
    ).toEqual([
      "semantic_ui_map_parse",
      "semantic_ui_map_validate",
    ]);
  });
});
