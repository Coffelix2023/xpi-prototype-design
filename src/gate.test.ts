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
import { GATE_CHOICES } from "./contracts.js";
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
  it("blocks every answer except execute, and only while the stage has no snapshot", () => {
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
          versions: [],
          gate: {
            answer,
            at: "2026-09-13 10:22",
          },
        }),
      ).toBe(true);
    }
    expect(
      gateBlocksWrite({
        versions: [],
        gate: {
          answer: "execute",
          at: "2026-09-13 10:22",
        },
      }),
    ).toBe(false);
    // 已产出过的阶段不该被同一道门挡第二次。
    expect(
      gateBlocksWrite({
        gate: {
          answer: "save",
          at: "2026-09-13 10:22",
        },
        versions: [
          1,
        ],
      }),
    ).toBe(false);
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
