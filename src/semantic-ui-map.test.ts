// biome-ignore-all lint/security/noSecrets: fixture strings are intentionally synthetic.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkUniqueness,
  loadSemanticMap,
  type ParseContext,
  parseInput,
  parseSemanticMap,
  SEMANTIC_MAP_FILE,
  type SemanticElement,
  type SemanticMap,
  validateFullPath,
  validateSemanticMap,
  validateShortCode,
} from "./semantic-ui-map.js";
import { parseYaml } from "./semantic-ui-map-yaml.js";

/** 一份贴近真实产物的字典：两页、跨页元素、props、aliases、未到的 hifi 锚点。 */
const MAP_SOURCE = `
meta:
  version: 3
  project: agentic-system
  type: spa
  updated: "2026-01-16"
  annotate_default: on

pages:
  P1:
    id: chat
    label: "对话"
    route: "#/chat"
    status: confirmed
  P2:
    id: agents
    label: "Agent 库"
    route: "#/agents"
    status: confirmed

elements:
  "chat.composer":
    short: "P1-2"
    label: "输入区"
    type: panel
    status: confirmed
    stage_created: wireframe
    parent: chat
    order: 2
    fidelities:
      wireframe: "wireframe/current/index.html#P1-2"
      hifi: "hifi/current/index.html#P1-2"
    children: [input, send-btn]
  "chat.composer.input":
    short: "P1-2-I1"
    label: "消息输入框"
    type: input
    status: confirmed
    stage_created: wireframe
    parent: chat.composer
    props:
      placeholder:
        type: string
        current: "输入消息..."
      multiline:
        type: boolean
        current: true
    fidelities:
      wireframe: "wireframe/current/index.html#P1-2-I1"
      hifi:
  "chat.composer.send-btn":
    short: "P1-2-B1"
    label: "发送按钮"
    type: button
    status: confirmed
    stage_created: wireframe
    parent: chat.composer
    aliases: [发送, 提交按钮]
    behavior:
      current: submit-message
    fidelities:
      wireframe: "wireframe/current/index.html#P1-2-B1"
      hifi: "hifi/current/index.html#P1-2-B1"
  "chat.composer.attach-btn":
    short: "P1-2-B2"
    label: "附件按钮"
    type: button
    status: proposed
    stage_created: wireframe
    parent: chat.composer
    fidelities:
      wireframe: "wireframe/current/index.html#P1-2-B2"
      hifi:
  "agents.grid":
    short: "P2-1"
    label: "Agent 卡片网格"
    type: panel
    status: confirmed
    stage_created: wireframe
    parent: agents
    fidelities:
      wireframe: "wireframe/current/index.html#P2-1"
      hifi:
  "agents.grid.create-btn":
    short: "P2-1-B1"
    label: "创建 Agent 按钮"
    type: button
    status: proposed
    stage_created: wireframe
    parent: agents.grid
    fidelities:
      wireframe: "wireframe/current/index.html#P2-1-B1"
      hifi:
`;

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "semantic-ui-map-"));
  tempRoots.push(root);
  return root;
}

async function writeMap(root: string, project: string, source: string): Promise<void> {
  const directory = join(root, ".pi", "prototype-design", project);
  await mkdir(directory, {
    recursive: true,
  });
  await writeFile(join(directory, SEMANTIC_MAP_FILE), source, "utf8");
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

/** 直接取一份解析好的字典，供解析器与校验用例共用。 */
function fixtureMap(): NonNullable<ReturnType<typeof parseSemanticMap>> {
  const map = parseSemanticMap(MAP_SOURCE);
  if (!map) throw new Error("fixture must parse");
  return map;
}

describe("parseYaml — 标量", () => {
  it("识别字符串、数字与布尔", () => {
    expect(
      parseYaml(
        [
          "text: hello",
          'quoted: "a: b"',
          "count: 12",
          "ratio: -1.5",
          "flag: true",
          "off_flag: off",
          "yes_flag: yes",
        ].join("\n"),
      ),
    ).toEqual({
      count: 12,
      flag: true,
      off_flag: false,
      quoted: "a: b",
      ratio: -1.5,
      text: "hello",
      yes_flag: true,
    });
  });

  it("把 null / ~ / 空值都读成 null，且不把日期当数字", () => {
    expect(
      parseYaml(
        [
          "a: null",
          "b: ~",
          "c:",
          "d: 2026-01-16",
        ].join("\n"),
      ),
    ).toEqual({
      a: null,
      b: null,
      c: null,
      d: "2026-01-16",
    });
  });

  it("单引号里的 '' 是转义的单引号，双引号支持 \\n 与 \\\"", () => {
    expect(parseYaml('a: \'it\'\'s\'\nb: "x\\ny"\nc: "say \\"hi\\""')).toEqual({
      a: "it's",
      b: "x\ny",
      c: 'say "hi"',
    });
  });

  it("`#` 只在空白之后才开始注释，`#/chat` 保持完整", () => {
    expect(parseYaml('route: "#/chat" # 客户端路由\nname: chat')).toEqual({
      name: "chat",
      route: "#/chat",
    });
  });
});

describe("parseYaml — 结构", () => {
  it("嵌套映射按缩进分层", () => {
    expect(
      parseYaml("meta:\n  version: 1\n  type: spa\npages:\n  P1:\n    id: chat"),
    ).toEqual({
      meta: {
        type: "spa",
        version: 1,
      },
      pages: {
        P1: {
          id: "chat",
        },
      },
    });
  });

  it("块序列与序列内映射", () => {
    expect(
      parseYaml(
        [
          "children:",
          "  - alpha",
          "  - beta",
          "items:",
          "  - id: one",
          "    label: 第一个",
          "  - id: two",
        ].join("\n"),
      ),
    ).toEqual({
      children: [
        "alpha",
        "beta",
      ],
      items: [
        {
          id: "one",
          label: "第一个",
        },
        {
          id: "two",
        },
      ],
    });
  });

  it("行内序列与行内映射", () => {
    expect(
      parseYaml(
        [
          "children: [message-card, send-btn]",
          'props: { type: asset, current: "chevron-down" }',
          "nested: [[1, 2], [3]]",
          "empty: []",
        ].join("\n"),
      ),
    ).toEqual({
      empty: [],
      children: [
        "message-card",
        "send-btn",
      ],
      nested: [
        [
          1,
          2,
        ],
        [
          3,
        ],
      ],
      props: {
        current: "chevron-down",
        type: "asset",
      },
    });
  });

  it("引号里的键名与含点的键名都可用", () => {
    expect(
      parseYaml('elements:\n  "chat.composer.send-btn":\n    short: P1-2-B1'),
    ).toEqual({
      elements: {
        "chat.composer.send-btn": {
          short: "P1-2-B1",
        },
      },
    });
  });

  it("忽略 BOM、空行、整行注释与文档标记", () => {
    expect(parseYaml("\uFEFF---\n\n# 注释\nversion: 1\n...\n")).toEqual({
      version: 1,
    });
  });

  it("空文档返回 null", () => {
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("\n# 只有注释\n")).toBeNull();
  });
});

describe("parseYaml — 健壮性", () => {
  it("重复键抛错", () => {
    expect(() => parseYaml("a: 1\na: 2")).toThrow("duplicate key");
  });

  it("Tab 缩进抛错", () => {
    expect(() => parseYaml("a:\n\tb: 1")).toThrow("tabs are not allowed");
  });

  it("未闭合引号与括号抛错", () => {
    expect(() => parseYaml('a: "unterminated')).toThrow("unterminated string");
    expect(() => parseYaml("a: [1, 2")).toThrow("unterminated sequence");
    expect(() => parseYaml("a: {b: 1")).toThrow("unterminated mapping");
  });

  it("缺冒号的行抛错", () => {
    expect(() => parseYaml("a: 1\nnonsense")).toThrow('expected "key: value"');
  });
});

describe("parseSemanticMap", () => {
  it("归一化 meta / pages / elements", () => {
    const map = parseSemanticMap(MAP_SOURCE);
    expect(map?.meta).toEqual({
      annotate_default: true,
      project: "agentic-system",
      type: "spa",
      updated: "2026-01-16",
      version: 3,
    });
    expect(map?.pages).toEqual([
      {
        id: "chat",
        label: "对话",
        route: "#/chat",
        short: "P1",
        status: "confirmed",
      },
      {
        id: "agents",
        label: "Agent 库",
        route: "#/agents",
        short: "P2",
        status: "confirmed",
      },
    ]);
    expect(map?.elements).toHaveLength(6);
  });

  it("保留 props 契约、aliases、behavior，并把空锚点读成 null", () => {
    const map = fixtureMap();
    const send = map.elements.find((item) => item.id === "chat.composer.send-btn");
    expect(send).toMatchObject({
      short: "P1-2-B1",
      type: "button",
      aliases: [
        "发送",
        "提交按钮",
      ],
      behavior: {
        current: "submit-message",
      },
    });
    expect(send?.fidelities).toEqual({
      hifi: "hifi/current/index.html#P1-2-B1",
      wireframe: "wireframe/current/index.html#P1-2-B1",
    });

    const input = map.elements.find((item) => item.id === "chat.composer.input");
    expect(input?.props).toEqual({
      multiline: {
        current: true,
        type: "boolean",
      },
      placeholder: {
        current: "输入消息...",
        type: "string",
      },
    });
    expect(input?.fidelities.hifi).toBeNull();
  });

  it("接受序列式 elements，id 写在条目里", () => {
    const map = parseSemanticMap(
      [
        "meta:",
        "  project: demo",
        "elements:",
        "  - id: chat.composer",
        "    short: P1-2",
        "    label: 输入区",
        "    type: panel",
        "    status: confirmed",
        "    stage_created: wireframe",
        '    fidelities: { wireframe: "a.html#P1-2", hifi: null }',
      ].join("\n"),
    );
    expect(map?.elements).toEqual([
      {
        id: "chat.composer",
        label: "输入区",
        short: "P1-2",
        stage_created: "wireframe",
        status: "confirmed",
        type: "panel",
        fidelities: {
          hifi: null,
          wireframe: "a.html#P1-2",
        },
      },
    ]);
  });

  it("非字典文件返回 null", () => {
    expect(parseSemanticMap("foo: bar")).toBeNull();
    expect(parseSemanticMap("- a\n- b")).toBeNull();
    expect(parseSemanticMap("")).toBeNull();
  });
});

describe("parseSemanticMap — 生产映射与未知键", () => {
  const META_LINES = [
    "meta:",
    "  project: demo",
    "  version: 1",
    "  type: spa",
    "  updated: 2026-01-01 00:00",
    "  annotate_default: true",
  ];

  function parseLines(lines: string[]): SemanticMap {
    const map = parseSemanticMap(lines.join("\n"));
    if (!map) throw new Error("fixture must parse");
    return map;
  }

  it("闭集外的键收进 unknownKeys，位置写成 meta / pages.P1 / elements.<id> / ….fidelities", () => {
    const map = parseLines([
      ...META_LINES,
      "  owner: 张三",
      "pages:",
      "  P1:",
      "    id: chat",
      "    label: 对话",
      '    route: "#/chat"',
      "    status: confirmed",
      "    notes: 随手加的",
      "elements:",
      "  chat.composer:",
      "    short: P1-2",
      "    label: 输入区",
      "    type: panel",
      "    status: confirmed",
      "    stage_created: wireframe",
      "    shrot: P1-9",
      '    fidelities: { wireframe: "#P1-2", hifi: null, production: "src/components/chat.tsx" }',
    ]);

    expect(map.unknownKeys).toEqual([
      {
        key: "owner",
        where: "meta",
      },
      {
        key: "notes",
        where: "pages.P1",
      },
      {
        key: "shrot",
        where: "elements.chat.composer",
      },
      {
        key: "production",
        where: "elements.chat.composer.fidelities",
      },
    ]);
  });

  it("没有未知键时 unknownKeys 为 undefined，既有断言不受影响", () => {
    expect(fixtureMap().unknownKeys).toBeUndefined();
  });

  it("归一化 impl：完整 / 缺 path / 裸字符串 / 完全没有", () => {
    const map = parseLines([
      ...META_LINES,
      "pages: {}",
      "elements:",
      "  chat.composer.send-btn:",
      "    short: P1-2-B1",
      "    label: 发送按钮",
      "    type: button",
      "    status: locked",
      "    stage_created: wireframe",
      '    fidelities: { wireframe: "#P1-2-B1", hifi: null }',
      "    impl:",
      "      path: components/chat/composer.tsx",
      "      export: Composer",
      "      promoted_at: 2026-03-01",
      "  chat.composer.input:",
      "    short: P1-2-I1",
      "    label: 消息输入框",
      "    type: input",
      "    status: locked",
      "    stage_created: wireframe",
      '    fidelities: { wireframe: "#P1-2-I1", hifi: null }',
      "    impl:",
      "      export: Input",
      "  chat.composer.attach-btn:",
      "    short: P1-2-B2",
      "    label: 附件按钮",
      "    type: button",
      "    status: locked",
      "    stage_created: wireframe",
      '    fidelities: { wireframe: "#P1-2-B2", hifi: null }',
      '    impl: "components/chat/attach.tsx"',
      "  chat.composer.mic-btn:",
      "    short: P1-2-B3",
      "    label: 语音按钮",
      "    type: button",
      "    status: proposed",
      "    stage_created: wireframe",
      '    fidelities: { wireframe: "#P1-2-B3", hifi: null }',
    ]);

    const implOf = (id: string): unknown =>
      map.elements.find((item) => item.id === id)?.impl;

    expect(implOf("chat.composer.send-btn")).toEqual({
      export: "Composer",
      path: "components/chat/composer.tsx",
      promoted_at: "2026-03-01",
    });
    expect(implOf("chat.composer.input")).toEqual({
      export: "Input",
      path: "",
    });
    expect(implOf("chat.composer.attach-btn")).toEqual({
      path: "",
    });
    expect(implOf("chat.composer.mic-btn")).toBeUndefined();
  });
});

describe("loadSemanticMap", () => {
  it("从 <project>/semantic-ui-map.yaml 读取", async () => {
    const root = await tempRoot();
    await writeMap(root, "agentic-system", MAP_SOURCE);
    const map = await loadSemanticMap(root, "agentic-system");
    expect(map?.meta.project).toBe("agentic-system");
    expect(map?.elements).toHaveLength(6);
  });

  it("文件不存在时返回 null，而不是抛错", async () => {
    const root = await tempRoot();
    await expect(loadSemanticMap(root, "agentic-system")).resolves.toBeNull();
  });

  it("project slug 越界直接拒绝", async () => {
    const root = await tempRoot();
    await expect(loadSemanticMap(root, "../escape")).rejects.toThrow(
      "Invalid project slug",
    );
  });

  it("字典损坏时抛错，而不是当成没有字典", async () => {
    const root = await tempRoot();
    await writeMap(root, "broken", "meta: [unterminated");
    await expect(loadSemanticMap(root, "broken")).rejects.toThrow(
      "unterminated sequence",
    );
  });
});

describe("validateShortCode", () => {
  it("接受合法短码", () => {
    for (const short of [
      "P1",
      "P1-2",
      "P1-2-B3",
      "P12-3-I1",
      "P1-2-3",
    ]) {
      expect(validateShortCode(short), short).toBe(true);
    }
  });

  it("拒绝非法短码", () => {
    for (const short of [
      "",
      "P",
      "p1",
      "P-1",
      "P1.2",
      "P1-2-b3",
      "P1-2-B",
      "P1-2-B1 ",
      "chat.composer",
    ]) {
      expect(validateShortCode(short), short).toBe(false);
    }
  });
});

describe("validateFullPath", () => {
  it("接受合法全路径", () => {
    for (const id of [
      "chat",
      "chat.composer",
      "chat.composer.send-btn",
      "a1.b2-c3.d4",
    ]) {
      expect(validateFullPath(id), id).toBe(true);
    }
  });

  it("拒绝非法全路径", () => {
    for (const id of [
      "",
      "Chat",
      "-chat",
      "chat.",
      ".chat",
      "chat..composer",
      "chat.composer.send_btn",
      "P1-2-B1",
    ]) {
      expect(validateFullPath(id), id).toBe(false);
    }
  });
});

/** 序列式写法才能在 id 上撞车；映射式的重复键在 YAML 层就被拒了。 */
const DUPLICATE_SOURCE = `
meta:
  project: demo
elements:
  - id: chat.composer
    short: P1-2
    label: 输入区
    type: panel
    status: confirmed
    stage_created: wireframe
    fidelities: { wireframe: a.html#P1-2, hifi: null }
  - id: chat.composer
    short: P1-3
    label: 输入区副本
    type: panel
    status: confirmed
    stage_created: wireframe
    fidelities: { wireframe: a.html#P1-3, hifi: null }
  - id: chat.thread
    short: P1-2
    label: 消息列表
    type: panel
    status: confirmed
    stage_created: wireframe
    fidelities: { wireframe: a.html#P1-2, hifi: null }
`;

describe("checkUniqueness", () => {
  it("干净字典没有问题", () => {
    expect(checkUniqueness(fixtureMap())).toEqual([]);
  });

  it("报告 ID 冲突与短码冲突，并带上元素路径", () => {
    const map = parseSemanticMap(DUPLICATE_SOURCE);
    if (!map) throw new Error("fixture must parse");
    const errors = checkUniqueness(map);
    expect(errors.map((error) => error.code)).toEqual([
      "duplicate-id",
      "duplicate-short",
    ]);
    expect(errors.every((error) => error.path !== undefined)).toBe(true);
    expect(errors[0].message).toContain("chat.composer");
    expect(errors[1].message).toContain("P1-2");
  });
});

/** 断言解析出唯一元素，返回它供进一步检查。 */
function expectMatch(
  input: string,
  map: ReturnType<typeof fixtureMap>,
  context?: ParseContext,
): SemanticElement {
  const result = parseInput(input, map, context);
  if (!result.matched) throw new Error(`expected a match for ${input}`);
  return result.element;
}

describe("parseInput — 双码", () => {
  it("短码直接命中", () => {
    expect(expectMatch("P1-2-B1", fixtureMap()).id).toBe("chat.composer.send-btn");
  });

  it("全路径直接命中，嵌套深度不限", () => {
    const map = fixtureMap();
    expect(expectMatch("chat.composer.input", map).short).toBe("P1-2-I1");
    expect(expectMatch("chat.composer", map).short).toBe("P1-2");
  });

  it("未登记的码返回 unregistered，不退化成模糊匹配", () => {
    const map = fixtureMap();
    expect(parseInput("P1-9-B9", map)).toEqual({
      candidates: [],
      matched: false,
      status: "unregistered",
    });
    expect(parseInput("chat.nope", map)).toEqual({
      candidates: [],
      matched: false,
      status: "unregistered",
    });
  });

  it("短码精确命中不受 context.page 影响", () => {
    const element = expectMatch("P2-1-B1", fixtureMap(), {
      page: "chat",
    });
    expect(element.id).toBe("agents.grid.create-btn");
  });
});

describe("parseInput — 中文别名", () => {
  it("label 唯一匹配", () => {
    expect(expectMatch("消息输入框", fixtureMap()).short).toBe("P1-2-I1");
  });

  it("aliases 数组参与匹配", () => {
    expect(expectMatch("提交按钮", fixtureMap()).short).toBe("P1-2-B1");
  });

  it("多候选返回列表，不猜", () => {
    const result = parseInput("按钮", fixtureMap());
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("unreachable");
    expect(result.status).toBe("ambiguous");
    expect(result.candidates.map((item) => item.short)).toEqual([
      "P1-2-B1",
      "P1-2-B2",
      "P2-1-B1",
    ]);
  });

  it("无候选返回 unregistered", () => {
    expect(parseInput("侧边栏", fixtureMap())).toEqual({
      candidates: [],
      matched: false,
      status: "unregistered",
    });
  });

  it("空白输入返回 unregistered", () => {
    expect(parseInput("   ", fixtureMap())).toEqual({
      candidates: [],
      matched: false,
      status: "unregistered",
    });
  });
});

describe("parseInput — 上下文消歧", () => {
  it("page 用短码收窄候选", () => {
    const result = parseInput("按钮", fixtureMap(), {
      page: "P1",
    });
    expect(result.matched).toBe(false);
    if (result.matched) throw new Error("unreachable");
    expect(result.candidates.map((item) => item.short)).toEqual([
      "P1-2-B1",
      "P1-2-B2",
    ]);
  });

  it("page 用全路径收窄，且收窄后可能变成唯一匹配", () => {
    expect(
      expectMatch("按钮", fixtureMap(), {
        page: "agents",
      }).short,
    ).toBe("P2-1-B1");
  });

  it("范围外的元素不再命中", () => {
    expect(
      parseInput("附件按钮", fixtureMap(), {
        page: "agents",
      }),
    ).toEqual({
      candidates: [],
      matched: false,
      status: "unregistered",
    });
  });
});

describe("parseInput — 性能", () => {
  it("索引只建一次：1000 次短码查找 < 10ms", () => {
    const map = fixtureMap();
    parseInput("P1-2-B1", map);
    const started = performance.now();
    for (let index = 0; index < 1000; index += 1) {
      parseInput("P1-2-B1", map);
    }
    expect(performance.now() - started).toBeLessThan(10);
  });
});

describe("validateSemanticMap — Phase 4.x", () => {
  it("4.1 集成五类检查，空字典返回 valid: true", async () => {
    const source = `
meta:
  project: test
  type: spa
  version: 1
  updated: "2025-01-01"
  annotate_default: true
pages: {}
elements: []
`;
    const map = parseSemanticMap(source);
    expect(map).not.toBeNull();
    if (!map) throw new Error("unreachable");
    const result = validateSemanticMap(map);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("4.2 循环引用：A→B→A", () => {
    const source = `
meta:
  project: test
  type: spa
  version: 1
  updated: "2025-01-01"
  annotate_default: true
pages:
  P1:
    id: page
    label: 页面
    route: /
    status: confirmed
elements:
  - id: a
    short: P1-A1
    label: A
    type: component
    stage_created: wireframe
    status: confirmed
    parent: b
    fidelities:
      wireframe: "#a"
      hifi: null
  - id: b
    short: P1-B1
    label: B
    type: component
    stage_created: wireframe
    status: confirmed
    parent: a
    fidelities:
      wireframe: "#b"
      hifi: null
`;
    const map = parseSemanticMap(source);
    expect(map).not.toBeNull();
    if (!map) throw new Error("unreachable");
    const result = validateSemanticMap(map);
    expect(result.valid).toBe(false);
    const cycleErrors = result.errors.filter((e) => e.code === "cycle-reference");
    expect(cycleErrors.length).toBeGreaterThan(0);
    expect(cycleErrors[0].message).toContain("循环引用");
  });

  it("4.2 循环引用：A→B→C→A", () => {
    const map = fixtureMap();
    const first = map.elements.find((element) => element.id === "chat.composer");
    const second = map.elements.find((element) => element.id === "chat.composer.input");
    const third = map.elements.find(
      (element) => element.id === "chat.composer.send-btn",
    );
    if (!first || !second || !third)
      throw new Error("fixture must contain cycle nodes");
    first.parent = second.id;
    second.parent = third.id;
    third.parent = first.id;

    const cycleErrors = validateSemanticMap(map).errors.filter(
      (error) => error.code === "cycle-reference",
    );
    expect(cycleErrors).toHaveLength(1);
    expect(cycleErrors[0].message).toContain("chat.composer");
  });

  it("4.3 状态机非法：child confirmed 但 parent proposed", () => {
    const source = `
meta:
  project: test
  type: spa
  version: 1
  updated: "2025-01-01"
  annotate_default: true
pages:
  P1:
    id: page
    label: 页面
    route: /
    status: confirmed
elements:
  - id: parent
    short: P1-1
    label: 父
    type: section
    stage_created: wireframe
    status: proposed
    fidelities:
      wireframe: "#parent"
      hifi: null
  - id: child
    short: P1-2
    label: 子
    type: button
    stage_created: wireframe
    status: confirmed
    parent: parent
    fidelities:
      wireframe: "#child"
      hifi: null
`;
    const map = parseSemanticMap(source);
    expect(map).not.toBeNull();
    if (!map) throw new Error("unreachable");
    const result = validateSemanticMap(map);
    expect(result.valid).toBe(false);
    const statusErrors = result.errors.filter(
      (e) => e.code === "invalid-status-transition",
    );
    expect(statusErrors.length).toBe(1);
    expect(statusErrors[0].message).toContain("状态回退非法");
  });

  it("4.4 alias 重复：两个元素用同一个 label", () => {
    const source = `
meta:
  project: test
  type: spa
  version: 1
  updated: "2025-01-01"
  annotate_default: true
pages:
  P1:
    id: page
    label: 页面
    route: /
    status: confirmed
elements:
  - id: btn-a
    short: P1-A1
    label: 按钮
    type: button
    stage_created: wireframe
    status: confirmed
    fidelities:
      wireframe: "#a"
      hifi: null
  - id: btn-b
    short: P1-B1
    label: 按钮
    type: button
    stage_created: wireframe
    status: confirmed
    fidelities:
      wireframe: "#b"
      hifi: null
`;
    const map = parseSemanticMap(source);
    expect(map).not.toBeNull();
    if (!map) throw new Error("unreachable");
    const result = validateSemanticMap(map);
    expect(result.valid).toBe(false);
    const aliasErrors = result.errors.filter((e) => e.code === "duplicate-alias");
    expect(aliasErrors.length).toBe(1);
    expect(aliasErrors[0].message).toContain("别名");
  });

  it("4.5 fidelity 路径格式：SPA 模式下不以 # 开头", () => {
    const source = `
meta:
  project: test
  type: spa
  version: 1
  updated: "2025-01-01"
  annotate_default: true
pages:
  P1:
    id: page
    label: 页面
    route: /
    status: confirmed
elements:
  - id: btn
    short: P1-1
    label: 按钮
    type: button
    stage_created: wireframe
    status: confirmed
    fidelities:
      wireframe: "page.html"
      hifi: null
`;
    const map = parseSemanticMap(source);
    expect(map).not.toBeNull();
    if (!map) throw new Error("unreachable");
    const result = validateSemanticMap(map);
    expect(result.valid).toBe(false);
    const pathErrors = result.errors.filter((e) => e.code === "invalid-fidelity-path");
    expect(pathErrors.length).toBe(1);
    expect(pathErrors[0].message).toContain("# 开头");
  });

  it("4.5 fidelity 路径格式：multi-page 模式下不应为锚点", () => {
    const source = `
meta:
  project: test
  type: multi-page
  version: 1
  updated: "2025-01-01"
  annotate_default: true
pages:
  P1:
    id: page
    label: 页面
    route: /
    status: confirmed
elements:
  - id: btn
    short: P1-1
    label: 按钮
    type: button
    stage_created: wireframe
    status: confirmed
    fidelities:
      wireframe: "#anchor"
      hifi: null
`;
    const map = parseSemanticMap(source);
    expect(map).not.toBeNull();
    if (!map) throw new Error("unreachable");
    const result = validateSemanticMap(map);
    expect(result.valid).toBe(false);
    const pathErrors = result.errors.filter((e) => e.code === "invalid-fidelity-path");
    expect(pathErrors.length).toBe(1);
    expect(pathErrors[0].message).toContain("不应为锚点");
  });
  it("4.5 接受 SPA 与多页面的相对 HTML 锚点路径", () => {
    expect(validateSemanticMap(fixtureMap()).errors).toEqual([]);
    const multiPageMap = fixtureMap();
    multiPageMap.meta.type = "multi-page";
    multiPageMap.elements[0].fidelities.wireframe = "pricing.html#P1-1";
    expect(validateSemanticMap(multiPageMap).errors).toEqual([]);
  });
});

/**
 * 必填字段校验：补上 spec「元素字段结构 / 必填字段校验」那条场景。
 *
 * 只能判 `id` / `short` / `label`——其余字段加载器会回落合法默认值，回落之后与
 * 显式赋值无法区分。用例按「写漏」和「写成空串」两种写法各来一次。
 */
describe("必填字段校验", () => {
  function mapWith(lines: string[]): SemanticMap {
    const source = [
      "meta:",
      "  project: chat",
      "  version: 1",
      "  type: spa",
      "  updated: 2026-01-01 00:00",
      "  annotate_default: true",
      "pages: {}",
      "elements:",
      "  -",
      ...lines.map((line) => `    ${line}`),
      "",
    ].join("\n");
    const map = parseSemanticMap(source);
    if (!map) throw new Error("unreachable");
    return map;
  }

  it("短码或中文名写漏时报 missing-field，并带上元素路径", () => {
    const missingShort = validateSemanticMap(
      mapWith([
        "id: chat.composer",
        "label: 输入区",
      ]),
    );
    expect(missingShort.valid).toBe(false);
    expect(missingShort.errors).toEqual([
      {
        code: "missing-field",
        message: "元素 「chat.composer」 缺少必填字段 short",
        path: "chat.composer",
      },
    ]);

    const missingLabel = validateSemanticMap(
      mapWith([
        "id: chat.composer",
        "short: P1-1",
      ]),
    );
    expect(missingLabel.errors.map((error) => error.message)).toEqual([
      "元素 「chat.composer」 缺少必填字段 label",
    ]);
  });

  it("写成空串与写漏等价，id 为空时不编造路径", () => {
    const emptyId = validateSemanticMap(
      mapWith([
        'id: ""',
        "short: P1-1",
        "label: 输入区",
      ]),
    );
    expect(emptyId.errors).toEqual([
      {
        code: "missing-field",
        message: "元素 （id 也为空） 缺少必填字段 id",
      },
    ]);

    const emptyShort = validateSemanticMap(
      mapWith([
        "id: chat.composer",
        'short: ""',
        "label: 输入区",
      ]),
    );
    expect(emptyShort.errors[0]?.code).toBe("missing-field");
  });

  it("字段齐全时这条检查不出声", () => {
    const map = mapWith([
      "id: chat.composer",
      "short: P1-1",
      "label: 输入区",
    ]);
    expect(validateSemanticMap(map).errors).toEqual([]);
  });
});

describe("validateSemanticMap — 生产映射", () => {
  const META = [
    "meta:",
    "  project: demo",
    "  version: 1",
    "  type: spa",
    "  updated: 2026-01-01 00:00",
    "  annotate_default: true",
  ];
  const FIDELITIES = '    fidelities: { wireframe: "#P1-2-B1", hifi: null }';

  /** 条目自带 id / short / label，其余字段由调用方按用例给。 */
  function entry(id: string, short: string, lines: string[]): string[] {
    return [
      `  ${id}:`,
      `    short: ${short}`,
      `    label: ${id}`,
      "    type: button",
      "    status: confirmed",
      "    stage_created: wireframe",
      ...lines,
    ];
  }

  function errorsOf(elementLines: string[]) {
    const map = parseSemanticMap(
      [
        ...META,
        "pages: {}",
        "elements:",
        ...elementLines,
      ].join("\n"),
    );
    if (!map) throw new Error("fixture must parse");
    return validateSemanticMap(map).errors;
  }

  function implErrors(implLines: string[]) {
    return errorsOf(
      entry("chat.composer.send-btn", "P1-2-B1", [
        FIDELITIES,
        ...implLines,
      ]),
    );
  }

  it("fidelities 出现 production 报 unknown-key：带元素路径与迁移提示", () => {
    const errors = errorsOf(
      entry("chat.composer.send-btn", "P1-2-B1", [
        '    fidelities: { wireframe: "#P1-2-B1", hifi: null, production: "src/components/chat.tsx" }',
      ]),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("unknown-key");
    expect(errors[0].path).toBe("chat.composer.send-btn");
    expect(errors[0].message).toContain("production");
    expect(errors[0].message).toContain("impl 段");
  });

  it("没有未知键的字典不产生 unknown-key", () => {
    expect(
      errorsOf(
        entry("chat.composer.send-btn", "P1-2-B1", [
          FIDELITIES,
        ]),
      ),
    ).toEqual([]);
  });

  it("impl 缺失不报错：没推进生产是正常状态", () => {
    expect(implErrors([])).toEqual([]);
  });

  it("格式合法的 impl 不报错", () => {
    expect(
      implErrors([
        "    impl:",
        "      path: components/chat/composer.tsx",
        "      export: Composer",
        "      promoted_at: 2026-03-01",
      ]),
    ).toEqual([]);
  });

  it("impl.path 为空 / 绝对路径 / 含 .. / 含 # 各报一条", () => {
    const cases: [
      string,
      string[],
    ][] = [
      [
        "为空",
        [
          "    impl:",
          "      export: Composer",
        ],
      ],
      [
        "是绝对路径",
        [
          "    impl:",
          '      path: "/etc/passwd"',
        ],
      ],
      [
        "含 .. 路径段",
        [
          "    impl:",
          '      path: "../outside/comp.tsx"',
        ],
      ],
      [
        "含 # 片段",
        [
          "    impl:",
          '      path: "app-rail.tsx#h1"',
        ],
      ],
    ];

    for (const [expected, lines] of cases) {
      const errors = implErrors(lines);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("invalid-impl-path");
      expect(errors[0].path).toBe("chat.composer.send-btn");
      expect(errors[0].message).toContain(expected);
    }
  });

  it("裸字符串 impl 收敛为 path 为空，走同一问题码而不是静默丢弃", () => {
    const errors = implErrors([
      '    impl: "components/chat/composer.tsx"',
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("invalid-impl-path");
  });
});
