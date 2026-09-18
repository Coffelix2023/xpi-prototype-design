import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { Value } from "typebox/value";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupArtifacts } from "./artifacts.js";
import {
  MODES,
  UPDATE_SCOPE_CHOICES,
  UPDATE_SCOPE_TITLE,
  UPDATE_VERSION_BUMP_CHOICES,
  UPDATE_VERSION_BUMP_TITLE,
} from "./contracts.js";
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
    // 闸门注册了 tool_call 钩子；这里只要它存在，钩子行为由 gate.test.ts 覆盖。
    on: vi.fn(),
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
let custom: ReturnType<typeof vi.fn>;

function commandContext(overrides: Record<string, unknown> = {}): unknown {
  return {
    cwd: root,
    hasUI: true,
    mode: "tui",
    ui: {
      notify,
      select,
      custom,
    },
    ...overrides,
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-prototype-design-cmd-"));
  notify = vi.fn();
  // 默认模拟非 TUI 模式：select 不可用，永远返回 undefined。
  select = vi.fn().mockResolvedValue(undefined);
  // 默认模拟用户在需求对话框里直接提交：留空也算合法输入，照发裸 kickoff。
  custom = vi.fn().mockResolvedValue("");
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("extension registration", () => {
  it("exposes one command with the six modes plus twelve tools", () => {
    const { commands, tools } = harness();
    const command = commands.get("xpi-prototype-design");
    expect(command).toBeDefined();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "prototype_gate",
      "prototype_migration_execute",
      "prototype_migration_scan",
      "prototype_page_impact",
      "prototype_preview",
      "prototype_promotion_check",
      "prototype_setup",
      "prototype_snapshot",
      "prototype_status",
      "semantic_ui_map_annotate",
      "semantic_ui_map_parse",
      "semantic_ui_map_validate",
    ]);
    // 空 prefix 也补全：敲完命令加空格就列出全部子命令，Tab 选、回车发。
    const all = [
      ...MODES,
    ];
    expect(command?.getArgumentCompletions?.("")?.map((item) => item.value)).toEqual(
      all,
    );
    expect(command?.getArgumentCompletions?.("   ")?.map((item) => item.value)).toEqual(
      all,
    );
    expect(
      command?.getArgumentCompletions?.("hifi")?.map((item) => item.value),
    ).toEqual([
      "hifi",
    ]);
    // `ex` 只命中 execute：其余模式都没有 x，子序列匹配不会误伤。
    expect(command?.getArgumentCompletions?.("ex")?.map((item) => item.value)).toEqual([
      "execute",
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
    // `l` 只命中 help：其余模式都没有 l。
    expect(complete?.("l")?.map((item) => item.value)).toEqual([
      "help",
    ]);
    // 无命中时返回 null，补全层据此不渲染列表。
    expect(complete?.("zzz")).toBeNull();
  });
});

describe("mode dispatch", () => {
  it("starts the unified orchestrator when no mode was typed", async () => {
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("", commandContext());

    expect(select).not.toHaveBeenCalled();
    expect(custom).toHaveBeenCalled();
    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("/skill:xpi-prototype-design orchestrate"),
      expect.objectContaining({
        expandPromptTemplates: true,
      }),
    );
  });

  it("treats an explicit help as the same usage notice", async () => {
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("help", commandContext());

    expect(select).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();
    for (const mode of MODES) expect(String(notify.mock.calls[0]?.[0])).toContain(mode);
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

  it("asks for the requirement and sends it when no requirement was typed", async () => {
    custom.mockResolvedValue("  一个订阅页  ");
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("wireframe", commandContext());

    // 需求对话框被弹过一次；标题文案由 requirementTitle 自己保证（见其单测）。
    expect(custom).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design wireframe 一个订阅页",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("abandons the round when the requirement dialog is cancelled", async () => {
    custom.mockResolvedValue(undefined);
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler("wireframe", commandContext());

    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("skips the requirement dialog when the run mode has none", async () => {
    // print / json 没有对话框，弹不出来也问不到需求，只能照发。
    const { commands, sendUserMessage } = harness();
    await commands.get("xpi-prototype-design")?.handler(
      "wireframe",
      commandContext({
        hasUI: false,
        mode: "print",
      }),
    );

    expect(custom).not.toHaveBeenCalled();
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

    expect(custom).toHaveBeenCalledTimes(1);
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

/**
 * 造一个「计划已落盘」的阶段：`tasks.md` 里有 total 条任务、其中 done 条已勾选。
 * 只在 tasks.md 有真实任务行时才算有计划，所以这里必须覆盖模板骨架。
 */
async function savePlan(
  project: string,
  kind: "hifi" | "wireframe",
  done: number,
  total: number,
): Promise<void> {
  await setupArtifacts(root, project, kind);
  const tasks = Array.from(
    {
      length: total,
    },
    (_, index) => `- [${index < done ? "x" : " "}] 1.${index + 1} 任务${index + 1}`,
  );
  await writeFile(
    join(root, ".pi/prototype-design", project, kind, "tasks.md"),
    [
      "## 任务",
      ...tasks,
    ].join("\n"),
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
  /** 面板只会回列表里的值：把它传给 `answerPanels` 表示用户对那一问按了 Esc。 */
  const CANCEL_PANEL = "（取消）";
  /**
   * 面板会问三次：挑项目、声明本轮范围、再定要不要升级版本号。
   * 按标题分流，避免三次调用互相顶掉。`bumpLabel` 缺省是「升级」。
   */
  function answerPanels(
    stage: string,
    scopeLabel: string | undefined,
    bumpLabel: string | undefined = UPDATE_VERSION_BUMP_CHOICES[0].label,
  ): void {
    select.mockImplementation(async (title: unknown, options: unknown) => {
      const list = options as string[];
      const name = String(title);
      if (name.includes("要修改哪个项目")) {
        return list.find((option) => option.startsWith(stage));
      }
      // 面板只会回列表里的值：传 CANCEL_PANEL 即「这一问按了 Esc」。
      if (name.includes("版本号")) return list.find((option) => option === bumpLabel);
      return scopeLabel;
    });
  }

  async function gateRecord(
    project: string,
    kind: string,
  ): Promise<{
    answer: string;
    baseline: number;
  } | null> {
    try {
      return JSON.parse(
        await readFile(
          join(root, ".pi/prototype-design", project, kind, "gate.json"),
          "utf8",
        ),
      );
    } catch {
      return null;
    }
  }

  it("lists exactly the live stages and carries project + kind in the kickoff", async () => {
    await produceStage("subscription-page", "wireframe");
    await produceStage("settings-flow", "hifi");
    answerPanels("settings-flow / hifi", UPDATE_SCOPE_CHOICES[0].label);
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

    // 范围声明也进 kickoff，agent 才知道这轮走哪条路。
    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design update --project settings-flow --kind hifi --scope quick --version-bump yes 调整侧栏",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("范围声明在 agent 启动前就落盘，于是「直接改」只点一次", async () => {
    await produceStage("subscription-page", "wireframe");
    answerPanels("subscription-page / wireframe", UPDATE_SCOPE_CHOICES[0].label);
    const { commands, sendUserMessage } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("update 改一行文案", commandContext());

    // 挑项目 + 声明范围 + 版本号 = 三次点击，之后 current/ 就放行，不再有第四张卡。
    expect(select).toHaveBeenCalledTimes(3);
    const record = await gateRecord("subscription-page", "wireframe");
    expect(record?.answer).toBe("execute");
    // 阶段还没有快照，本轮基线是 0。
    expect(record?.baseline).toBe(0);
    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design update --project subscription-page --kind wireframe --scope quick --version-bump yes 改一行文案",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("版本号第二问：选「不升级」时 kickoff 带 --version-bump no", async () => {
    await produceStage("subscription-page", "wireframe");
    answerPanels(
      "subscription-page / wireframe",
      UPDATE_SCOPE_CHOICES[0].label,
      UPDATE_VERSION_BUMP_CHOICES[1].label,
    );
    const { commands, sendUserMessage } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("update 只改一行文案", commandContext());

    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design update --project subscription-page --kind wireframe --scope quick --version-bump no 只改一行文案",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("面板顺序：先声明范围，再定版本号", async () => {
    await produceStage("subscription-page", "wireframe");
    answerPanels("subscription-page / wireframe", UPDATE_SCOPE_CHOICES[0].label);
    const { commands } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("update 改一行文案", commandContext());

    // 第 0 次是挑项目。
    expect(select.mock.calls[1]?.[0]).toBe(UPDATE_SCOPE_TITLE);
    expect(select.mock.calls[2]?.[0]).toBe(UPDATE_VERSION_BUMP_TITLE);
  });

  it("取消版本号第二问就整轮放弃：不发消息，也不留记录", async () => {
    await produceStage("subscription-page", "wireframe");
    answerPanels(
      "subscription-page / wireframe",
      UPDATE_SCOPE_CHOICES[0].label,
      CANCEL_PANEL,
    );
    const { commands, sendUserMessage } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("update 改一行文案", commandContext());

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(await gateRecord("subscription-page", "wireframe")).toBeNull();
  });

  it("选「先给改动清单」时只留 save 记录，current/ 继续挡着", async () => {
    await produceStage("subscription-page", "wireframe");
    answerPanels("subscription-page / wireframe", UPDATE_SCOPE_CHOICES[1].label);
    const { commands, sendUserMessage } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("update 重写笔记面板", commandContext());

    expect((await gateRecord("subscription-page", "wireframe"))?.answer).toBe("save");
    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design update --project subscription-page --kind wireframe --scope plan --version-bump yes 重写笔记面板",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("取消范围声明就整轮放弃：不发消息，也不留记录", async () => {
    await produceStage("subscription-page", "wireframe");
    answerPanels("subscription-page / wireframe", undefined);
    const { commands, sendUserMessage } = harness();

    await commands
      .get("xpi-prototype-design")
      ?.handler("update 改一行文案", commandContext());

    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(await gateRecord("subscription-page", "wireframe")).toBeNull();
  });

  it("取消需求框时连范围声明都不问，也不留记录", async () => {
    await produceStage("subscription-page", "wireframe");
    custom.mockResolvedValue(undefined);
    answerPanels("subscription-page / wireframe", UPDATE_SCOPE_CHOICES[0].label);
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("update", commandContext());

    // 只问了项目：需求都没描述，判断不了这一轮有多大。
    expect(custom).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(sendUserMessage).not.toHaveBeenCalled();
    expect(await gateRecord("subscription-page", "wireframe")).toBeNull();
  });

  it("无面板的模式停在阶段选择上，不会顺手写一份没人点过的记录", async () => {
    await produceStage("subscription-page", "wireframe");
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler(
      "update 改一行文案",
      commandContext({
        hasUI: false,
        mode: "print",
      }),
    );

    expect(select).not.toHaveBeenCalled();
    // 没有用户点过的答案，就不该有 gate.json——否则等于替用户放行。
    expect(await gateRecord("subscription-page", "wireframe")).toBeNull();
    expect(sendUserMessage).not.toHaveBeenCalled();
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

describe("execute branch", () => {
  it("lists only stages with a saved task list, and never asks for a requirement again", async () => {
    await produceStage("subscription-page", "wireframe"); // 有产出，但没有计划
    await savePlan("settings-flow", "hifi", 1, 3);
    select.mockImplementation(async (_title: unknown, options: unknown) =>
      (options as string[]).find((option) => option.startsWith("settings-flow / hifi")),
    );
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("execute", commandContext());

    const options = select.mock.calls[0]?.[1] as string[];
    expect(options).toHaveLength(1);
    // 项目名后面直接跟任务进度，用户能看出这个计划还剩几项。
    expect(options[0]).toContain("任务 1/3");
    // execute 续跑的是已落盘的 tasks.md，再弹一次「需求」框只会让人以为要重开一轮。
    expect(custom).not.toHaveBeenCalled();
    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design execute --project settings-flow --kind hifi",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("carries text typed after the mode into the kickoff", async () => {
    await savePlan("subscription-page", "wireframe", 0, 2);
    // 只有一个候选时也走面板：选中它，模式后面的文字原样带进 kickoff。
    select.mockImplementation(
      async (_title: unknown, options: unknown) => (options as string[])[0],
    );
    const { commands, sendUserMessage } = harness();
    await commands
      .get("xpi-prototype-design")
      ?.handler("execute 先做首页", commandContext());

    expect(custom).not.toHaveBeenCalled();
    expect(sendUserMessage).toHaveBeenCalledWith(
      "/skill:xpi-prototype-design execute --project subscription-page --kind wireframe 先做首页",
      {
        expandPromptTemplates: true,
      },
    );
  });

  it("says there is nothing to execute when no task list was saved", async () => {
    // 只有骨架、没有任务行的阶段不算有计划。
    await produceStage("subscription-page", "wireframe");
    await setupArtifacts(root, "fresh-project", "hifi");
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("execute", commandContext());

    expect(select).not.toHaveBeenCalled();
    expect(String(notify.mock.calls[0]?.[0])).toContain("没有任何已保存的任务清单");
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not kick off when the user cancels the picker", async () => {
    await savePlan("subscription-page", "wireframe", 0, 2);
    select.mockResolvedValue(undefined);
    const { commands, sendUserMessage } = harness();

    await commands.get("xpi-prototype-design")?.handler("execute", commandContext());

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
    prototype_gate: {
      extra: {},
      required: true,
    },
    prototype_migration_execute: {
      required: true,
      extra: {
        confirm: true,
        decisions: [
          {
            fidelity: "wireframe",
            implementation: "prototype",
            pageId: "home",
            source: "legacy/index.html",
            target: "checkout/pages/home/wireframe",
          },
        ],
        sources: [
          "legacy",
        ],
      },
    },
    prototype_migration_scan: {
      required: false,
      extra: {
        sources: [
          "legacy",
        ],
      },
    },
    prototype_page_impact: {
      required: true,
      extra: {
        pageIds: [
          "home",
        ],
      },
    },
    prototype_preview: {
      extra: {},
      required: true,
    },
    prototype_promotion_check: {
      extra: {},
      required: false,
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
    semantic_ui_map_annotate: {
      required: true,
      extra: {
        pageId: "chat",
      },
    },
    semantic_ui_map_parse: {
      required: true,
      extra: {
        input: "按钮",
      },
    },
    semantic_ui_map_validate: {
      extra: {},
      required: true,
    },
  };

  const BAD_SLUGS = [
    "..",
    "a/b",
    "/abs",
    ".hidden",
    "Upper",
  ];

  it("registers exactly the twelve tools", () => {
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
      // prototype_migration_scan 不收 project（只读扫描来源），所以坏 slug 无从注入。
      const declared = (
        tool.parameters as {
          properties?: Record<string, unknown>;
        }
      ).properties;
      if (!declared || !("project" in declared)) continue;
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
