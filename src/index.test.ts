import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupArtifacts } from "./artifacts.js";
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
let select: ReturnType<typeof vi.fn>;

function commandContext(overrides: Record<string, unknown> = {}): unknown {
  return {
    cwd: root,
    hasUI: true,
    mode: "tui",
    ui: {
      notify,
      select,
    },
    ...overrides,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-prototype-design-cmd-"));
  notify = vi.fn();
  // 默认模拟非 TUI 模式：select 不可用，永远返回 undefined。
  select = vi.fn().mockResolvedValue(undefined);
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("extension registration", () => {
  it("exposes one command with the four modes plus four tools", () => {
    const { commands, tools } = harness();
    const command = commands.get("xpi-prototype-design");
    expect(command).toBeDefined();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "prototype_preview",
      "prototype_setup",
      "prototype_snapshot",
      "prototype_status",
    ]);
    // 空 prefix 不补全：敲完命令再按空格不该弹出模式列表，回车走 select 面板。
    expect(command?.getArgumentCompletions?.("")).toBeNull();
    expect(command?.getArgumentCompletions?.("   ")).toBeNull();
    expect(
      command?.getArgumentCompletions?.("hifi")?.map((item) => item.value),
    ).toEqual([
      "hifi",
    ]);
  });

  it("filters modes fuzzy, so a first letter is enough", () => {
    const { commands } = harness();
    const complete = commands.get("xpi-prototype-design")?.getArgumentCompletions;

    // 子序列匹配：`w` 只命中 wireframe，`up` 只命中 update。
    expect(complete?.("w")?.map((item) => item.value)).toEqual([
      "wireframe",
    ]);
    expect(complete?.("up")?.map((item) => item.value)).toEqual([
      "update",
    ]);
    expect(complete?.("ar")?.map((item) => item.value)).toEqual([
      "archive",
    ]);
    // 无命中时返回 null，补全层据此不渲染列表。
    expect(complete?.("zzz")).toBeNull();
  });
});

describe("mode picker", () => {
  it("offers all four modes when none was typed, and acts on the pick", async () => {
    select.mockResolvedValue("hifi — 创建高保真原型设计（可选基于已有线框）");
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("", commandContext());

    const options = select.mock.calls[0]?.[1] as string[];
    expect(options).toHaveLength(4);
    for (const mode of MODES)
      expect(options.some((o) => o.startsWith(mode))).toBe(true);
    expect(sendUserMessage).toHaveBeenCalledWith("/skill:xpi-prototype-design hifi", {
      expandPromptTemplates: true,
    });
  });

  it("falls back to the usage notice when the picker is unavailable", async () => {
    // 非 TUI 模式（RPC / print）与用户取消都走这条路径。
    select.mockResolvedValue(undefined);
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("", commandContext());

    expect(sendUserMessage).not.toHaveBeenCalled();
    const usage = String(notify.mock.calls[0]?.[0]);
    expect(usage).toContain("用法：/xpi-prototype-design <模式>");
    for (const mode of MODES) expect(usage).toContain(mode);
  });

  it("acts on a typed mode without opening the mode picker", async () => {
    const { commands, sendUserMessage } = harness();
    await commands
      .get("xpi-prototype-design")
      ?.handler("wireframe 一个落地页", commandContext());

    // 模式已经打在命令里，不该再弹「选择模式」面板。
    expect(select).not.toHaveBeenCalled();
    expect(sendUserMessage).toHaveBeenCalledTimes(1);
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
    // `.pi` 被占成一个普通文件：任何建目录尝试都会失败。
    await writeFile(join(root, ".pi"), "not a directory", "utf8");

    await expect(
      commands.get("xpi-prototype-design")?.handler("hifi", commandContext()),
    ).resolves.toBeUndefined();

    expect(sendUserMessage).toHaveBeenCalledTimes(1);
    await expect(stat(join(root, "THEMES.md"))).rejects.toThrow();
  });
});

/** 造一个「有产出」的阶段，供 update / archive / hifi 的列表型分支使用。 */
async function produceStage(
  project: string,
  kind: "hifi" | "wireframe",
): Promise<void> {
  await setupArtifacts(root, project, kind);
  await writeFile(
    join(root, ".pi/prototype-design", project, kind, "current/index.html"),
    "<svg/>",
    "utf8",
  );
}

describe("hifi dual entry", () => {
  it("offers every wireframe-backed project plus a from-scratch entry", async () => {
    await produceStage("subscription-page", "wireframe");
    select.mockResolvedValue("基于 subscription-page 的线框做高保真");
    const { commands, sendUserMessage } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("hifi 改个 hero", commandContext());

    const options = select.mock.calls[0]?.[1] as string[];
    expect(options).toContain("基于 subscription-page 的线框做高保真");
    const fresh = options.find((option) => option.includes("直接开始"));
    expect(fresh).toBeDefined();
    // 友情提示：从零开始是允许的，但要推荐优先做线框。
    expect(fresh).toContain("建议先完成线框设计");

    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design hifi --based-on subscription-page 改个 hero",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("skips the picker and recommends wireframe first when none exists", async () => {
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("hifi", commandContext());

    expect(select).not.toHaveBeenCalled();
    expect(String(notify.mock.calls[0]?.[0])).toContain(
      "建议先跑 /xpi-prototype-design wireframe",
    );
    expect(sendUserMessage).toHaveBeenCalledWith("/skill:xpi-prototype-design hifi", {
      expandPromptTemplates: true,
    });
  });

  it("goes from scratch when the run mode has no dialog UI", async () => {
    await produceStage("subscription-page", "wireframe");
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler(
      "hifi",
      commandContext({
        hasUI: false,
        mode: "print",
      }),
    );

    expect(select).not.toHaveBeenCalled();
    expect(String(notify.mock.calls[0]?.[0])).toContain("没有可用的选择面板");
    expect(sendUserMessage).toHaveBeenCalledWith("/skill:xpi-prototype-design hifi", {
      expandPromptTemplates: true,
    });
  });

  it("abandons the kickoff when the user cancels the picker", async () => {
    await produceStage("subscription-page", "wireframe");
    select.mockResolvedValue(undefined);
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("hifi", commandContext());

    expect(select).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).not.toHaveBeenCalled();
  });
});

describe("update branch", () => {
  it("lists exactly the live stages and carries project + kind in the kickoff", async () => {
    await produceStage("subscription-page", "wireframe");
    await produceStage("settings-flow", "hifi");
    select.mockImplementation(async (_title: unknown, options: unknown) =>
      (options as string[]).find((option) => option.startsWith("settings-flow / hifi")),
    );
    const { commands, sendUserMessage } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("update 调整侧栏", commandContext());

    const options = select.mock.calls[0]?.[1] as string[];
    expect(options).toHaveLength(2);
    expect(
      options.filter((o) => o.startsWith("subscription-page / wireframe")),
    ).toHaveLength(1);
    expect(options.filter((o) => o.startsWith("settings-flow / hifi"))).toHaveLength(1);

    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design update --project settings-flow --kind hifi 调整侧栏",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("says there is nothing to update when no stage has output", async () => {
    // 空壳阶段（只有骨架、没有产出）不是可修改的项目。
    await setupArtifacts(root, "empty-project", "wireframe");
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("update", commandContext());

    expect(select).not.toHaveBeenCalled();
    expect(String(notify.mock.calls[0]?.[0])).toContain("还没有任何原型设计项目");
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not kick off when the user cancels the picker", async () => {
    await produceStage("subscription-page", "wireframe");
    select.mockResolvedValue(undefined);
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("update", commandContext());

    expect(select).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).not.toHaveBeenCalled();
  });
});

describe("archive branch", () => {
  it("archives the picked stage, logs it, and never sends a skill message", async () => {
    await produceStage("subscription-page", "hifi");
    select.mockImplementation(async (_title: unknown, options: unknown) =>
      (options as string[]).find((option) =>
        option.startsWith("subscription-page / hifi"),
      ),
    );
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("archive", commandContext());

    // 归档是纯文件操作，不经过 agent，因此绝不应产生 skill 消息。
    expect(sendUserMessage).not.toHaveBeenCalled();
    await expect(
      stat(join(root, ".pi/prototype-design/subscription-page/hifi")),
    ).rejects.toThrow();

    const archived = await readdir(join(root, ".pi/prototype-design/archive"));
    expect(archived.some((name) => name.endsWith("-subscription-page-hifi"))).toBe(
      true,
    );

    const notice = String(notify.mock.calls[0]?.[0]);
    expect(notice).toContain("已归档");
    expect(notice).toContain("恢复：");
  });

  it("does not archive when the user cancels", async () => {
    await produceStage("subscription-page", "hifi");
    select.mockResolvedValue(undefined);
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("archive", commandContext());

    expect(sendUserMessage).not.toHaveBeenCalled();
    await expect(
      stat(join(root, ".pi/prototype-design/subscription-page/hifi")),
    ).resolves.toBeTruthy();
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
