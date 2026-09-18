// biome-ignore-all lint/security/noSecrets: 夹具里的 YAML / 源码片段都是固定字符串。
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARTIFACT_ROOT } from "./contracts.js";
import { registerPromotionTools } from "./promotion-check.js";
import {
  checkPromotion,
  findUnpromotedChildren,
  hasDynamicAttribute,
} from "./promotion-core.js";
import { parseSemanticMap } from "./semantic-ui-map.js";

type Handler = (
  toolCallId: string,
  params: Record<string, unknown>,
  signal: unknown,
  onUpdate: unknown,
  ctx: ExtensionContext,
) => Promise<unknown>;

const PROJECT = "checkout";
const PAGE = "chat";
const MAP_REL = `${ARTIFACT_ROOT}/${PROJECT}/semantic-ui-map.yaml`;
const SRC = "src/composer.tsx";

interface ElSpec {
  children?: string[];
  id: string;
  impl?: string;
  parent?: string;
  short: string;
  status?: string;
}

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "promotion-check-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

async function write(relative: string, content: string): Promise<void> {
  const target = join(root, relative);
  await mkdir(dirname(target), {
    recursive: true,
  });
  await writeFile(target, content, "utf8");
}

/** 一个元素块。字段顺序固定，不靠缩进猜结构。 */
function elementBlock(spec: ElSpec): string {
  const lines = [
    `  ${spec.id}:`,
    `    short: "${spec.short}"`,
    `    label: "${spec.id}"`,
    "    type: button",
    `    status: ${spec.status ?? "locked"}`,
    "    stage_created: wireframe",
    "    fidelities:",
    `      wireframe: "wireframe/current/index.html#${spec.short}"`,
    "      hifi: null",
  ];
  if (spec.parent) lines.push(`    parent: ${spec.parent}`);
  if (spec.children?.length) {
    lines.push(`    children: [${spec.children.join(", ")}]`);
  }
  if (spec.impl) lines.push("    impl:", `      path: ${spec.impl}`);
  return `${lines.join("\n")}\n`;
}

function dictionary(elements: ElSpec[]): string {
  return [
    "meta:",
    "  version: 1",
    `  project: ${PROJECT}`,
    "  type: spa",
    '  updated: "2026-01-16"',
    "  annotate_default: on",
    "pages:",
    "  P1:",
    `    id: ${PAGE}`,
    '    label: "对话"',
    '    route: "/chat"',
    "    status: confirmed",
    "elements:",
    ...elements.map(elementBlock),
  ].join("\n");
}

/** 造一个只有 `data-semantic-id` 的源码文件，够本模块的字面量匹配用。 */
function source(...ids: string[]): string {
  return ids.map((id) => `<div data-semantic-id="${id}" />`).join("\n");
}

async function setup(
  yaml: string | null,
  files: Record<string, string> = {},
): Promise<void> {
  if (yaml !== null) await write(MAP_REL, yaml);
  for (const [relative, content] of Object.entries(files)) {
    await write(relative, content);
  }
}

/** 走真实注册路径拿 handler，顺带验证工具确实挂上去了。 */
function handlers(): Map<string, Handler> {
  const registered = new Map<string, Handler>();
  const pi = {
    registerTool: (tool: { execute: Handler; name: string }) => {
      registered.set(tool.name, tool.execute);
    },
  } as unknown as ExtensionAPI;
  registerPromotionTools(pi);
  return registered;
}

async function toolText(params: Record<string, unknown>): Promise<string> {
  const handler = handlers().get("prototype_promotion_check");
  if (!handler) throw new Error("prototype_promotion_check 未注册");
  const result = (await handler("call", params, undefined, undefined, {
    cwd: root,
  } as unknown as ExtensionContext)) as {
    content: {
      text: string;
    }[];
  };
  return result.content[0].text;
}

describe("四类结果", () => {
  /**
   * 一张卡片菜单的形态：触发器搬了、子项没搬；同文件里另一个元素整个没搬；
   * 再加一个源码里有而字典没登记的值。
   */
  const ELEMENTS: ElSpec[] = [
    {
      id: "chat.composer.send-btn",
      impl: SRC,
      short: "P1-1",
      status: "locked",
    },
    {
      id: "chat.composer.attach-btn",
      impl: SRC,
      short: "P1-2",
      status: "locked",
    },
    {
      id: "chat.composer.card-menu",
      impl: SRC,
      short: "P1-3",
      status: "locked",
      children: [
        "chat.composer.card-menu.delete",
      ],
    },
    {
      id: "chat.composer.card-menu.delete",
      parent: "chat.composer.card-menu",
      short: "P1-3-B1",
      status: "locked",
    },
  ];

  const FILES = {
    [SRC]: source(
      "chat.composer.send-btn",
      "chat.composer.card-menu",
      "chat.ghost.thing",
    ),
  };

  it("matched：有 impl 且源码里能找到", async () => {
    await setup(dictionary(ELEMENTS), FILES);
    const result = await checkPromotion(root, PROJECT);
    expect(result.matched).toBe(2);
    expect(result.promoted).toBe(3);
  });

  it("missing_in_source：有 impl 但源码里没有", async () => {
    await setup(dictionary(ELEMENTS), FILES);
    const result = await checkPromotion(root, PROJECT);
    expect(result.missing).toEqual([
      {
        id: "chat.composer.attach-btn",
        path: SRC,
        reason: null,
      },
    ]);
    expect(result.missingTotal).toBe(1);
  });

  it("unpromoted_child：容器搬了、locked 子项没搬", async () => {
    await setup(dictionary(ELEMENTS), FILES);
    const result = await checkPromotion(root, PROJECT);
    expect(result.unpromoted).toEqual([
      {
        parent: "chat.composer.card-menu",
        children: [
          "chat.composer.card-menu.delete",
        ],
      },
    ]);
  });

  it("unregistered_in_map：源码有而字典没登记", async () => {
    await setup(dictionary(ELEMENTS), FILES);
    const result = await checkPromotion(root, PROJECT);
    expect(result.unregistered).toEqual([
      "chat.ghost.thing",
    ]);
    expect(result.status).toBe("issues");
  });
});

describe("降噪：没推进的元素不参与核对", () => {
  it("没有 impl 的元素不出现在任何一类问题里", async () => {
    await setup(
      dictionary([
        {
          id: "chat.composer.send-btn",
          short: "P1-1",
          status: "locked",
        },
        {
          id: "chat.composer.attach-btn",
          short: "P1-2",
          status: "proposed",
        },
      ]),
      {},
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.promoted).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.missing).toEqual([]);
    expect(result.unpromoted).toEqual([]);
    expect(result.unregistered).toEqual([]);
    expect(result.status).toBe("clean");
  });

  it("未 locked 的子元素不算漏", () => {
    const map = parseSemanticMap(
      dictionary([
        {
          id: "chat.composer.card-menu",
          impl: SRC,
          short: "P1-1",
          children: [
            "chat.composer.card-menu.delete",
            "chat.composer.card-menu.hide",
          ],
        },
        {
          id: "chat.composer.card-menu.delete",
          parent: "chat.composer.card-menu",
          short: "P1-1-B1",
          status: "locked",
        },
        {
          id: "chat.composer.card-menu.hide",
          parent: "chat.composer.card-menu",
          short: "P1-1-B2",
          status: "confirmed",
        },
      ]),
    );
    if (!map) throw new Error("夹具字典没解析出来");
    expect(findUnpromotedChildren(map)).toEqual([
      {
        parent: "chat.composer.card-menu",
        children: [
          "chat.composer.card-menu.delete",
        ],
      },
    ]);
  });
});

describe("源码侧匹配", () => {
  it("单双引号都认，短码值不算命中", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
        {
          id: "chat.b",
          impl: SRC,
          short: "P1-2",
        },
      ]),
      {
        [SRC]: `${source("chat.a")}\n<div data-semantic-id='chat.b' />`,
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.matched).toBe(2);
    expect(result.missing).toEqual([]);
  });

  it("源码写的是短码：元素判为未命中，短码本身报为未登记", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
      ]),
      {
        [SRC]: source("P1-1"),
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.missing).toEqual([
      {
        id: "chat.a",
        path: SRC,
        reason: null,
      },
    ]);
    expect(result.unregistered).toEqual([
      "P1-1",
    ]);
  });

  it("已知边界：注释里的字面量也算命中（误判方向是漏报缺失）", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
      ]),
      {
        [SRC]: `// 待搬：${source("chat.a")}`,
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.matched).toBe(1);
  });
});

describe("属性写成动态表达式", () => {
  it("动态信号只认 data-semantic-id={…}，字面量不算", () => {
    expect(hasDynamicAttribute("<div data-semantic-id={NAV[view.id]} />")).toBe(true);
    expect(hasDynamicAttribute('<div data-semantic-id="chat.a" />')).toBe(false);
    expect(
      hasDynamicAttribute(
        '<div data-semantic-id="chat.a" />\n<div data-semantic-id={m[v]} />',
      ),
    ).toBe(true);
  });

  it("未命中且文件里有动态表达式 ⇒ dynamic_attribute，不是 missing_in_source", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
        {
          id: "chat.b",
          impl: SRC,
          short: "P1-2",
        },
      ]),
      {
        [SRC]: `${source("chat.a")}\n<Link data-semantic-id={NAV_SEMANTIC_ID[view.id]} />`,
      },
    );
    const result = await checkPromotion(root, PROJECT);
    // 字面量写成的那一个照常命中，动态那一个进新桶。
    expect(result.matched).toBe(1);
    expect(result.dynamic).toEqual([
      "chat.b",
    ]);
    expect(result.dynamicTotal).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.missingTotal).toBe(0);
  });

  it("没有动态表达式时仍报 missing_in_source", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
      ]),
      {
        [SRC]: source("chat.other"),
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.missing).toEqual([
      {
        id: "chat.a",
        path: SRC,
        reason: null,
      },
    ]);
    expect(result.dynamic).toEqual([]);
  });

  it("只有动态未命中时也算 issues，不得静默通过", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
      ]),
      {
        [SRC]: "<Link data-semantic-id={T[view.id]} />",
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.status).toBe("issues");
  });

  it("报告说明静态核对看不到，并给出两条出路", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
      ]),
      {
        [SRC]: "<Link data-semantic-id={T[view.id]} />",
      },
    );
    const text = await toolText({
      project: PROJECT,
    });
    expect(text).toContain("静态核对看不到");
    expect(text).toContain("动态表达式");
    expect(text).toContain("全路径字面量重写");
  });
});
describe("文件不可读", () => {
  it("文件不存在：报 missing_in_source 并带上原因", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: "src/nope.tsx",
          short: "P1-1",
        },
      ]),
      {},
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].id).toBe("chat.a");
    expect(result.missing[0].reason).toContain("文件不可读");
  });

  it("impl.path 越出项目根：不读，报原因", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: "../outside.tsx",
          short: "P1-1",
        },
      ]),
      {
        "../outside.tsx": source("chat.a"),
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.missing).toEqual([
      {
        id: "chat.a",
        path: "../outside.tsx",
        reason: "impl.path 落在项目根之外，不予读取",
      },
    ]);
  });
});

describe("同一 impl.path 的元素一起处理", () => {
  it("结果不因路径重复而改变", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
        {
          id: "chat.b",
          impl: SRC,
          short: "P1-2",
        },
      ]),
      {
        [SRC]: source("chat.a"),
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.promoted).toBe(2);
    expect(result.matched).toBe(1);
    expect(result.missing).toEqual([
      {
        id: "chat.b",
        path: SRC,
        reason: null,
      },
    ]);
  });
});

describe("三类问题全空时 matched 等于已推进总数", () => {
  it("全部命中", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
        {
          id: "chat.b",
          impl: SRC,
          short: "P1-2",
        },
      ]),
      {
        [SRC]: source("chat.a", "chat.b"),
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.status).toBe("clean");
    expect(result.matched).toBe(result.promoted);
  });
});

describe("页面范围", () => {
  it("传 pageId 只统计该页面元素", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
        {
          id: "other.b",
          impl: SRC,
          short: "P2-1",
        },
      ]),
      {
        [SRC]: source("chat.a"),
      },
    );
    const scoped = await checkPromotion(root, PROJECT, PAGE);
    expect(scoped.promoted).toBe(1);
    expect(scoped.matched).toBe(1);
    expect(scoped.missing).toEqual([]);

    const all = await checkPromotion(root, PROJECT);
    expect(all.promoted).toBe(2);
    expect(all.missing).toHaveLength(1);
  });
});

describe("字典缺失或读不出来", () => {
  it("没有字典：报「未做核对」，不是通过", async () => {
    await setup(null, {});
    const result = await checkPromotion(root, PROJECT);
    expect(result.status).toBe("missing");
    expect(
      await toolText({
        project: PROJECT,
      }),
    ).toContain("本次未做核对");
  });

  it("字典在但读不出来：报 unreadable，不返回空结果冒充通过", async () => {
    // 缺 meta：文件在、却读不出字典。这正是 readProjectMap 补 stat 要区分的那个 case，
    // 它若被报成「缺失」，agent 会去重建骨架，而骨架是幂等的（不覆写）——于是卡在看不见的原因上。
    await setup("elements: {}\n", {});
    const result = await checkPromotion(root, PROJECT);
    expect(result.status).toBe("unreadable");
    expect(
      await toolText({
        project: PROJECT,
      }),
    ).toContain("本次未做核对");
  });
});

describe("输出", () => {
  it("未登记条目超上限时报总数与已显示数", async () => {
    const ghosts = Array.from(
      {
        length: 30,
      },
      (_, index) => `ghost.${index}`,
    );
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
      ]),
      {
        [SRC]: source("chat.a", ...ghosts),
      },
    );
    const result = await checkPromotion(root, PROJECT);
    expect(result.unregisteredTotal).toBe(30);
    expect(result.unregistered).toHaveLength(10);

    const text = await toolText({
      project: PROJECT,
    });
    expect(text).toContain("共 30 条，已显示 10 条");
  });

  it("有未登记条目时说明字典维护归 Agent，不判定字典失效", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
      ]),
      {
        [SRC]: source("chat.a", "chat.ghost.thing"),
      },
    );
    const text = await toolText({
      project: PROJECT,
    });
    expect(text).toContain("字典维护由 Agent 负责");
  });
});

describe("只读", () => {
  it("调用前后字典与源码逐字节相同", async () => {
    await setup(
      dictionary([
        {
          id: "chat.a",
          impl: SRC,
          short: "P1-1",
        },
        {
          id: "chat.a.child",
          short: "P1-2",
          status: "locked",
          children: [
            "chat.a.child",
          ],
        },
      ]),
      {
        [SRC]: source("chat.a", "chat.ghost.thing"),
      },
    );
    const beforeMap = await readFile(join(root, MAP_REL), "utf8");
    const beforeSrc = await readFile(join(root, SRC), "utf8");

    await checkPromotion(root, PROJECT);
    await toolText({
      project: PROJECT,
    });

    expect(await readFile(join(root, MAP_REL), "utf8")).toBe(beforeMap);
    expect(await readFile(join(root, SRC), "utf8")).toBe(beforeSrc);
  });
});

describe("官方示例 examples/semantic-ui-map", () => {
  it("示例字典零 impl：四类计数全为 0，且不报错", async () => {
    const example = fileURLToPath(
      new URL("../examples/semantic-ui-map/semantic-ui-map.yaml", import.meta.url),
    );
    await setup(await readFile(example, "utf8"), {});
    const result = await checkPromotion(root, PROJECT);
    expect(result.promoted).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.missingTotal).toBe(0);
    expect(result.unpromotedTotal).toBe(0);
    expect(result.unregisteredTotal).toBe(0);
    expect(result.status).toBe("clean");
    expect(
      await toolText({
        project: PROJECT,
      }),
    ).toContain("还没有登记任何生产落点");
  });
});
