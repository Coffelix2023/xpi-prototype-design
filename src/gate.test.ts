/**
 * gate.test.ts — 计划闸门的两道检查：判据本身，以及写盘门禁。
 *
 * 这里不放提示词断言（SKILL.md 的措辞由人读），只锁住两件会真正坏掉的行为：
 * `gateBlocksWrite` 的放行条件，和 `tool_call` 钩子在 `current/` 上的阻断/放行。
 */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupArtifacts, writeGateState } from "./artifacts.js";
import { GATE_CHOICES, type GateAnswer, ITERATION_CHOICES } from "./contracts.js";
import { gateBlocksWrite, registerPrototypeGate, stageOfCurrentPath } from "./gate.js";

type Hook = (
  event: ToolCallEvent,
  ctx: ExtensionContext,
) => Promise<ToolCallEventResult | undefined>;

interface GateTool {
  execute: (
    toolCallId: string,
    params: {
      answer?: "execute" | "more" | "save";
      kind: "hifi" | "wireframe";
      mode?: "ask" | "resume";
      project: string;
    },
    signal: undefined,
    onUpdate: undefined,
    ctx: ExtensionContext,
  ) => Promise<{
    content: {
      text: string;
    }[];
  }>;
  name: string;
}

function harness(): {
  hook: Hook;
  tool: GateTool;
} {
  const pi = {
    on: (_event: string, handler: Hook) => {
      hook = handler;
    },
    registerTool: (tool: GateTool) => {
      registered = tool;
    },
  } as unknown as ExtensionAPI;
  let hook!: Hook;
  let registered!: GateTool;
  registerPrototypeGate(pi);
  return {
    hook,
    tool: registered,
  };
}

function ctx(hasUI: boolean, select = vi.fn()): ExtensionContext {
  return {
    cwd: root,
    hasUI,
    mode: hasUI ? "tui" : "print",
    ui: {
      select,
    },
  } as unknown as ExtensionContext;
}

async function call(
  params: Parameters<GateTool["execute"]>[1],
  context: ExtensionContext,
): Promise<string> {
  const result = await harness().tool.execute(
    "call-1",
    params,
    undefined,
    undefined,
    context,
  );
  return result.content[0].text;
}

async function gateFile(project = "subscription-page", kind = "hifi") {
  return readFile(
    join(root, ".pi/prototype-design", project, kind, "gate.json"),
    "utf8",
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-prototype-design-gate-"));
  await setupArtifacts(root, "subscription-page", "hifi");
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("gateBlocksWrite", () => {
  const record = (answer: GateAnswer, baseline: number) => ({
    answer,
    at: "2026-09-13 10:22",
    baseline,
  });

  it("blocks every answer except execute", () => {
    expect(
      gateBlocksWrite({
        gate: null,
        versions: [],
      }),
    ).toBe(true);
    for (const answer of [
      "save",
      "more",
    ] as const) {
      expect(
        gateBlocksWrite({
          gate: record(answer, 0),
          versions: [],
        }),
      ).toBe(true);
    }
    expect(
      gateBlocksWrite({
        gate: record("execute", 0),
        versions: [],
      }),
    ).toBe(false);
  });

  it("只在许可覆盖本轮基线时放行", () => {
    // 阶段已有 v1，但许可是在还没有任何快照时给的：属于上一轮，必须重新确认。
    expect(
      gateBlocksWrite({
        gate: record("execute", 0),
        versions: [
          1,
        ],
      }),
    ).toBe(true);
    expect(
      gateBlocksWrite({
        gate: record("execute", 1),
        versions: [
          1,
        ],
      }),
    ).toBe(false);
    // 又多了一次快照，旧的放行立刻过期。
    expect(
      gateBlocksWrite({
        gate: record("execute", 1),
        versions: [
          1,
          2,
        ],
      }),
    ).toBe(true);
    expect(
      gateBlocksWrite({
        gate: record("execute", 2),
        versions: [
          1,
          2,
        ],
      }),
    ).toBe(false);
    // save 永远不放行，基线对不对都一样。
    expect(
      gateBlocksWrite({
        gate: record("save", 2),
        versions: [
          1,
          2,
        ],
      }),
    ).toBe(true);
  });
});

describe("stageOfCurrentPath", () => {
  it("only matches files under <project>/<kind>/current/", () => {
    const current = join(root, ".pi/prototype-design/subscription-page/hifi/current");
    expect(stageOfCurrentPath(root, join(current, "index.html"))).toEqual({
      kind: "hifi",
      project: "subscription-page",
    });
    // 台账不是门禁对象：plan.md / tasks.md 必须在闸门放行之后才写。
    expect(
      stageOfCurrentPath(
        root,
        join(root, ".pi/prototype-design/subscription-page/hifi/tasks.md"),
      ),
    ).toBeNull();
    expect(stageOfCurrentPath(root, join(root, "index.html"))).toBeNull();
    expect(
      stageOfCurrentPath(root, join(current, "..", "..", "..", "..", "escape.html")),
    ).toBeNull();
  });
});

describe("prototype_gate", () => {
  it("hands the card to ask_user_question when no panel is available", async () => {
    const text = await call(
      {
        kind: "hifi",
        project: "subscription-page",
      },
      ctx(false),
    );
    expect(text).toContain("ask_user_question");
    expect(text).toContain(GATE_CHOICES[0].label);
    await expect(gateFile()).rejects.toThrow();
  });

  it("records the answer collected through ask_user_question in no-panel modes", async () => {
    const text = await call(
      {
        answer: "save",
        kind: "hifi",
        project: "subscription-page",
      },
      ctx(false),
    );
    expect(text).toContain("仅保存");
    expect(JSON.parse(await gateFile()).answer).toBe("save");
  });

  it("reads the answer off the panel, not off the model's arguments", async () => {
    const select = vi.fn().mockResolvedValue(GATE_CHOICES[1].label);
    const text = await call(
      {
        answer: "save",
        kind: "hifi",
        project: "subscription-page",
      },
      ctx(true, select),
    );
    expect(text).toContain(GATE_CHOICES[1].label);
    expect(JSON.parse(await gateFile()).answer).toBe("execute");
  });

  it("阶段已有 vN 时改问迭代卡，并把基线一起记下来", async () => {
    await mkdir(join(root, ".pi/prototype-design/subscription-page/hifi/v1"), {
      recursive: true,
    });
    const select = vi.fn().mockResolvedValue(ITERATION_CHOICES[1].label);
    const text = await call(
      {
        kind: "hifi",
        project: "subscription-page",
      },
      ctx(true, select),
    );
    // 迭代轮只有两格：现在改 / 先给改动清单，不能再出「还有需要补充的」。
    expect(select.mock.calls[0]?.[1]).toEqual(
      ITERATION_CHOICES.map((choice) => choice.label),
    );
    expect(text).toContain(ITERATION_CHOICES[1].label);
    const written = JSON.parse(await gateFile());
    expect(written.answer).toBe("save");
    expect(written.baseline).toBe(1);
  });

  it("无面板时把迭代卡交给 ask_user_question，而不是直接放行", async () => {
    await mkdir(join(root, ".pi/prototype-design/subscription-page/hifi/v1"), {
      recursive: true,
    });
    const text = await call(
      {
        kind: "hifi",
        project: "subscription-page",
      },
      ctx(false),
    );
    expect(text).toContain("ask_user_question");
    expect(text).toContain(ITERATION_CHOICES[1].label);
    await expect(gateFile()).rejects.toThrow();
  });

  it("writes nothing when the user cancels the card", async () => {
    const text = await call(
      {
        kind: "hifi",
        project: "subscription-page",
      },
      ctx(true, vi.fn().mockResolvedValue(undefined)),
    );
    expect(text).toContain("取消");
    await expect(gateFile()).rejects.toThrow();
  });

  it("only resumes a stage that has a save record", async () => {
    const refused = await call(
      {
        kind: "hifi",
        mode: "resume",
        project: "subscription-page",
      },
      ctx(true),
    );
    expect(refused).toContain("没有可续跑");

    await writeGateState(root, "subscription-page", "hifi", "save");
    const resumed = await call(
      {
        kind: "hifi",
        mode: "resume",
        project: "subscription-page",
      },
      ctx(true),
    );
    expect(resumed).toContain("放行");
    expect(JSON.parse(await gateFile()).answer).toBe("execute");
  });

  it("拒绝续跑上一轮遗留的 save：基线对不上就说明中间又产出过一版", async () => {
    // 记录是在还没有任何快照时留的。
    await writeGateState(root, "subscription-page", "hifi", "save");
    await mkdir(join(root, ".pi/prototype-design/subscription-page/hifi/v1"), {
      recursive: true,
    });
    const refused = await call(
      {
        kind: "hifi",
        mode: "resume",
        project: "subscription-page",
      },
      ctx(true),
    );
    expect(refused).toContain("本轮的范围还没确认过");
    expect(JSON.parse(await gateFile()).answer).toBe("save");
  });
});

describe("tool_call hook", () => {
  const writeEvent = (path: string): ToolCallEvent =>
    ({
      toolCallId: "call-1",
      toolName: "write",
      type: "tool_call",
      input: {
        path,
      },
    }) as unknown as ToolCallEvent;

  it("blocks writes into current/ until the user approved execution", async () => {
    const { hook } = harness();
    const target = join(
      root,
      ".pi/prototype-design/subscription-page/hifi/current/index.html",
    );
    const blocked = await hook(writeEvent(target), ctx(true));
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("prototype_gate");

    await writeGateState(root, "subscription-page", "hifi", "execute");
    expect(await hook(writeEvent(target), ctx(true))).toBeUndefined();
  });

  it("快照一出来，上一轮的放行就过期：同一道门要为新一轮再拦一次", async () => {
    const { hook } = harness();
    const target = join(
      root,
      ".pi/prototype-design/subscription-page/hifi/current/index.html",
    );
    await writeGateState(root, "subscription-page", "hifi", "execute");
    expect(await hook(writeEvent(target), ctx(true))).toBeUndefined();

    await mkdir(join(root, ".pi/prototype-design/subscription-page/hifi/v1"), {
      recursive: true,
    });
    const blocked = await hook(writeEvent(target), ctx(true));
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("许可已过期");
  });
  it("leaves the stage ledger and everything outside current/ alone", async () => {
    const { hook } = harness();
    const base = join(root, ".pi/prototype-design/subscription-page/hifi");
    expect(await hook(writeEvent(join(base, "plan.md")), ctx(true))).toBeUndefined();
    expect(
      await hook(writeEvent(join(root, "app", "page.tsx")), ctx(true)),
    ).toBeUndefined();
  });

  it("covers edit as well as write", async () => {
    const { hook } = harness();
    const target = join(
      root,
      ".pi/prototype-design/subscription-page/hifi/current/index.html",
    );
    await mkdir(join(root, ".pi/prototype-design/subscription-page/hifi/current"), {
      recursive: true,
    });
    await writeFile(target, "<html/>", "utf8");
    const event = {
      ...writeEvent(target),
      toolName: "edit",
    } as unknown as ToolCallEvent;
    expect((await hook(event, ctx(true)))?.block).toBe(true);
    expect(await exists(target)).toBe(true);
  });
});
