import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODES } from "./contracts.js";
import register from "./index.js";

interface RegisteredCommand {
  description: string;
  getArgumentCompletions?: (prefix: string) =>
    | {
        value: string;
      }[]
    | null;
  handler: (args: string, ctx: unknown) => Promise<void>;
}

interface Harness {
  commands: Map<string, RegisteredCommand>;
  pi: ExtensionAPI;
  sendUserMessage: ReturnType<typeof vi.fn>;
  tools: RegisteredTool[];
}

interface RegisteredTool {
  name: string;
  parameters: TSchema;
}

function harness(): Harness {
  const commands = new Map<string, RegisteredCommand>();
  const tools: RegisteredTool[] = [];
  const sendUserMessage = vi.fn();
  const pi = {
    registerCommand: (name: string, command: RegisteredCommand) => {
      commands.set(name, command);
    },
    registerTool: (tool: RegisteredTool) => {
      tools.push(tool);
    },
    sendUserMessage,
  } as unknown as ExtensionAPI;
  register(pi);
  return {
    commands,
    pi,
    sendUserMessage,
    tools,
  };
}

let root = "";
let notify: ReturnType<typeof vi.fn>;

function commandContext(): unknown {
  return {
    cwd: root,
    ui: {
      notify,
    },
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-prototype-design-cmd-"));
  notify = vi.fn();
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("extension registration", () => {
  it("exposes one command with the two stages plus four tools", () => {
    const { commands, tools } = harness();
    const command = commands.get("xpi-prototype-design");
    expect(command).toBeDefined();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "prototype_preview",
      "prototype_setup",
      "prototype_snapshot",
      "prototype_status",
    ]);
    expect(command?.getArgumentCompletions?.("")).toEqual([
      {
        label: "wireframe",
        value: "wireframe",
      },
      {
        label: "hifi",
        value: "hifi",
      },
    ]);
    expect(command?.getArgumentCompletions?.("hid")).toBeNull();
  });
});

describe("bare invocation", () => {
  it("reports status and usage instead of kicking off a turn", async () => {
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("", commandContext());
    expect(sendUserMessage).not.toHaveBeenCalled();
    const usage = String(notify.mock.calls[0]?.[0]);
    expect(usage).toContain("用法：/xpi-prototype-design <模式>");
    for (const mode of MODES) expect(usage).toContain(mode);
  });
});

describe("stage invocation", () => {
  it("dispatches the skill command with the requirement and creates nothing itself", async () => {
    const { commands, sendUserMessage } = harness();
    await commands
      .get("xpi-prototype-design")
      ?.handler("hifi 做一个订阅页", commandContext());

    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design hifi 做一个订阅页",
      {
        expandPromptTemplates: true,
      },
    );
    // 项目 slug 由 agent 深挖后决定，命令层不得抢先建目录或补 THEMES.md。
    await expect(stat(join(root, ".pi"))).rejects.toThrow();
    await expect(stat(join(root, "THEMES.md"))).rejects.toThrow();
  });

  it("works without a requirement string", async () => {
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("wireframe", commandContext());
    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design wireframe",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("never touches the filesystem even when .pi is occupied by a file", async () => {
    const { commands, sendUserMessage } = harness();
    await writeFile(join(root, ".pi"), "not a directory", "utf8");
    await commands.get("xpi-prototype-design")?.handler("hifi", commandContext());

    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[1]).toBeUndefined();
  });
});

describe("tool schemas", () => {
  /**
   * 工具名 → 除 project 外还需要的最低必填项。
   * `required: true` 表示该工具必须带 project（status 不在此列：它支持总览）。
   */
  const extras: Record<
    string,
    {
      extra: Record<string, unknown>;
      required: boolean;
    }
  > = {
    prototype_preview: {
      extra: {},
      required: true,
    },
    prototype_setup: {
      extra: {},
      required: true,
    },
    prototype_snapshot: {
      required: true,
      extra: {
        change: "首版",
      },
    },
    prototype_status: {
      extra: {},
      required: false,
    },
  };

  const BAD_SLUGS = [
    "..",
    "a/b",
    "/abs",
    ".hidden",
    "Upper",
  ];

  it("registers exactly the four tools", () => {
    const { tools } = harness();
    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.keys(extras).sort());
  });

  it("accepts a valid slug, rejects a missing one where it is required, and rejects bad slugs everywhere", () => {
    const { tools } = harness();
    for (const tool of tools) {
      const { extra, required } = extras[tool.name];
      const base = {
        kind: "hifi",
        project: "subscription-page",
        ...extra,
      };
      expect(Value.Check(tool.parameters, base)).toBe(true);
      if (required) {
        expect(
          Value.Check(tool.parameters, {
            ...base,
            project: undefined,
          }),
        ).toBe(false);
      }
      for (const project of BAD_SLUGS) {
        expect(
          Value.Check(tool.parameters, {
            ...base,
            project,
          }),
        ).toBe(false);
      }
    }
  });

  it("lets prototype_status run as an overview with no project at all", () => {
    const { tools } = harness();
    const status = tools.find((tool) => tool.name === "prototype_status");
    expect(status).toBeDefined();
    expect(Value.Check(status?.parameters as TSchema, {})).toBe(true);
    expect(
      Value.Check(status?.parameters as TSchema, {
        kind: "hifi",
      }),
    ).toBe(true);
  });
});
