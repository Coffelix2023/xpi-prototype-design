import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { type AutocompleteItem, fuzzyFilter } from "@earendil-works/pi-tui";
import { archiveProject, listProjects, type ProjectStage } from "./artifacts.js";
import {
  choiceLabels,
  hasOutput,
  hasPlan,
  MODES,
  type Mode,
  parseCommandArgs,
  pickChoice,
  toChoices,
} from "./contracts.js";
import { promptRequirement, requirementTitle } from "./requirement-editor.js";
import { registerPrototypeTools } from "./tools.js";

const VERSION = "0.1.0";

/**
 * 参数补全：六个模式，用 pi-tui 的 fuzzyFilter。
 *
 * 与宿主内置命令（`/model`、`/thinking`、`/login`）同一个匹配器，
 * 因此首字母与子序列都能命中。
 *
 * 空 prefix（只有命令名，或命令名加空格）返回全表：敲完
 * `/xpi-prototype-design ` 就列出可选子命令，Tab 选、回车发，
 * 不再有「回车弹面板」这一层。fuzzyFilter 对空串原样返回入参，
 * 所以这里不必特判。
 */
function completions(prefix: string): AutocompleteItem[] | null {
  const items: AutocompleteItem[] = MODES.map((mode) => ({
    label: mode,
    value: mode,
  }));
  const filtered = fuzzyFilter(items, prefix, (item) => item.value);
  return filtered.length > 0 ? filtered : null;
}

/**
 * 单行 kickoff。交给 Pi 展开 `/skill:`，于是"该调哪些原型设计技能、按什么顺序"
 * 由包内 SKILL.md 单一维护，而不是散在代码里。
 *
 * `target` 是模式串，可以是 `hifi`，也可以是带子参数的 `hifi --based-on <project>`。
 */
function kickoff(target: string, rest: string): string {
  return `/skill:xpi-prototype-design ${target}${rest ? ` ${rest}` : ""}`;
}

/**
 * 四个模式的选项表。
 *
 * `ctx.ui.select` 只接受字符串数组、没有独立的 description 字段，
 * 所以说明文字必须并进 label；这也让回退提示与面板显示完全一致。
 */
const MODE_CHOICES = toChoices(
  [
    {
      description: "创建线框原型设计",
      mode: "wireframe",
    },
    {
      description: "创建高保真原型设计（可选基于已有线框）",
      mode: "hifi",
    },
    {
      description: "按已保存的任务清单继续产出",
      mode: "execute",
    },
    {
      description: "修改已有的原型设计项目",
      mode: "update",
    },
    {
      description: "归档已完成的原型设计项目",
      mode: "archive",
    },
    {
      description: "打印用法与全部模式的说明",
      mode: "help",
    },
  ] as {
    description: string;
    mode: Mode;
  }[],
  (item) => `${item.mode} — ${item.description}`,
);

function usageText(): string {
  return [
    "用法：/xpi-prototype-design <模式> [需求]",
    ...MODE_CHOICES.map((choice) => `  ${choice.label}`),
  ].join("\n");
}

/**
 * 无模式（或显式 `help`）时打印用法。
 *
 * 这里不再弹 `ctx.ui.select` 选模式：可选项改由输入框补全列表给出（见 completions），
 * 回车即执行。输出走 `notify`，在 TUI / RPC 与无对话框模式（print / json）下都一样。
 */
function printUsage(ctx: ExtensionCommandContext): void {
  ctx.ui.notify(usageText());
}

/** hifi 的双入口：继承某个已完成的线框，或从零开始。 */
interface HifiEntry {
  kind: "based-on" | "fresh";
  label: string;
  project?: string;
}

/**
 * 选 hifi 的基础。返回 `null` 表示用户取消。
 *
 * 三种情况分开处理，不互相冒充：
 *   - 一个线框都没有 → 不弹空面板，直接「从零开始」并提示推荐先做线框；
 *   - 无对话框能力的模式（json / print）→ 同样「从零开始」，但在通知里说明原因；
 *   - 有线框 → 让用户在「继承某个项目」与「从零开始」之间明确选一个。
 */
async function chooseHifiEntry(
  ctx: ExtensionCommandContext,
): Promise<HifiEntry | null> {
  const fresh: HifiEntry = {
    kind: "fresh",
    label: "直接开始新的高保真（建议先完成线框设计）",
  };
  const wireframes = (await listProjects(ctx.cwd)).filter(
    (stage) => stage.kind === "wireframe" && hasOutput(stage),
  );

  if (wireframes.length === 0) {
    ctx.ui.notify(
      "没有找到已完成的线框设计，将从零开始高保真。建议先跑 /xpi-prototype-design wireframe。",
    );
    return fresh;
  }

  // 用 hasUI 而不是 mode === "tui"：rpc 模式同样能弹 select，只有 json / print 不能。
  if (!ctx.hasUI) {
    ctx.ui.notify("当前模式没有可用的选择面板，将从零开始高保真。");
    return fresh;
  }

  const choices = toChoices<HifiEntry>(
    [
      ...wireframes.map((stage) => ({
        kind: "based-on" as const,
        label: `基于 ${stage.project} 的线框做高保真`,
        project: stage.project,
      })),
      fresh,
    ],
    (item) => item.label,
  );

  const chosen = await ctx.ui.select(
    "xpi-prototype-design：高保真的基础",
    choiceLabels(choices),
  );
  const picked = pickChoice(choices, chosen);
  if (picked) return picked;
  // 用户取消：不猜，直接放弃。
  return null;
}

/** 阶段选项文本。execute / update / archive 共用同一份列表，避免多处格式漂移。 */
function stageLabel(stage: ProjectStage): string {
  const versions =
    stage.versions.length === 0
      ? "无版本"
      : stage.versions.map((v) => `v${v}`).join(" ");
  const tasks = stage.tasks
    ? `任务 ${stage.tasks.done}/${stage.tasks.total}`
    : "无任务";
  return `${stage.project} / ${stage.kind} · ${versions} · ${stage.currentFileCount} 文件 · ${tasks}`;
}

/** 阶段候选的过滤与文案；三种入口各给一句能照着做的下一步。 */
interface StagePicker {
  empty: string;
  /** update / archive 只看有产出的阶段，execute 只看有计划任务的阶段。 */
  keep: (stage: ProjectStage) => boolean;
  title: string;
}

/**
 * 让用户挑一个活跃阶段。
 *
 * 返回 `null` 表示无法继续——没有候选、没有面板、或用户取消，三种情况都在
 * 这里给出可读通知，调用方只需 return，不必再分辨原因。
 */
async function pickStage(
  ctx: ExtensionCommandContext,
  picker: StagePicker,
): Promise<ProjectStage | null> {
  const stages = (await listProjects(ctx.cwd)).filter(picker.keep);
  if (stages.length === 0) {
    ctx.ui.notify(picker.empty);
    return null;
  }
  // 与 hifi 同一条判据：rpc 模式能弹面板，只有 json / print 不能。
  if (!ctx.hasUI) {
    ctx.ui.notify("当前模式没有可用的选择面板。");
    return null;
  }
  const choices = toChoices(stages, stageLabel);
  const chosen = await ctx.ui.select(picker.title, choiceLabels(choices));
  return pickChoice(choices, chosen) ?? null;
}

/**
 * 通知 + kick off。
 *
 * 需求没写在命令里时（`rest` 为空）不空发消息，先弹一个多行编辑器收需求。
 * 需求框走 `promptRequirement`（见 requirement-editor.ts），不是 `ctx.ui.editor`：
 * 后者的内部组件把按键原样转发给 pi-tui `Editor`，而那里换行判定排在提交判定之前，
 * 还把老式终端的 alt+enter（ESC CR）硬编码成换行，于是「提交/换行跟随用户设置」在
 * 非 kitty 终端（Zed、Alacritty、Terminal.app）上只剩换行、发不出去。我们自己先判提交，
 * 用的还是 `ctx.ui.custom()` 注入的那份用户 keybindings。
 * Esc 取消即放弃整轮，留空提交允许——无需求也能起一轮，只是 agent 会自己深挖。
 * 无对话框能力的模式（print / json）弹不出来，退化成直接发送。
 * `askRequirement=false` 时连编辑器都不弹：execute 续跑的是已经落盘的 tasks.md，
 * 再问一次「需求」只会让人以为要重开一轮。
 *
 * 刻意不在这里建骨架：项目 slug 由 agent 深挖后决定（见 SKILL.md），
 * 命令层只负责选模式与触发，避免猜错项目名后留下空目录。
 */
async function fire(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  target: string,
  rest: string,
  askRequirement = true,
): Promise<void> {
  let prompt = kickoff(target, rest);
  if (askRequirement && rest === "" && ctx.hasUI) {
    const entered = await promptRequirement(ctx, requirementTitle(target));
    // 取消：不猜，整轮放弃。
    if (entered === undefined) return;
    prompt = kickoff(target, entered.trim());
  }
  ctx.ui.notify(`xpi-prototype-design ${VERSION} · ${target}`);
  pi.sendUserMessage(prompt, {
    expandPromptTemplates: true,
  });
}

export default function xpiPrototypeDesign(pi: ExtensionAPI): void {
  registerPrototypeTools(pi);

  pi.registerCommand("xpi-prototype-design", {
    description: "原型设计流程：wireframe / hifi / execute / update / archive",
    getArgumentCompletions: completions,
    handler: async (args, ctx) => {
      const parsed = parseCommandArgs(args);
      // 不写子命令等于 help：没有面板可弹，也不该静默什么都不做。
      const mode = parsed.mode ?? "help";

      if (mode === "help") {
        printUsage(ctx);
        return;
      }

      if (mode === "wireframe") {
        await fire(pi, ctx, "wireframe", parsed.rest);
        return;
      }

      if (mode === "hifi") {
        const entry = await chooseHifiEntry(ctx);
        if (!entry) return;
        const target =
          entry.kind === "based-on" ? `hifi --based-on ${entry.project}` : "hifi";
        await fire(pi, ctx, target, parsed.rest);
        return;
      }

      if (mode === "execute") {
        const stage = await pickStage(ctx, {
          empty:
            "没有任何已保存的任务清单。先跑 wireframe 或 hifi，把计划落到 tasks.md。",
          keep: hasPlan,
          title: "xpi-prototype-design：要执行哪个计划",
        });
        if (!stage) return;
        // 末位 false = 不弹需求框：续跑已有计划，不是重开一轮。
        await fire(
          pi,
          ctx,
          `execute --project ${stage.project} --kind ${stage.kind}`,
          parsed.rest,
          false,
        );
        return;
      }

      if (mode === "update") {
        const stage = await pickStage(ctx, {
          empty: "还没有任何原型设计项目。先用 wireframe 或 hifi 创建一个。",
          keep: hasOutput,
          title: "xpi-prototype-design：要修改哪个项目",
        });
        if (!stage) return;
        await fire(
          pi,
          ctx,
          `update --project ${stage.project} --kind ${stage.kind}`,
          parsed.rest,
        );
        return;
      }

      if (mode === "archive") {
        const stage = await pickStage(ctx, {
          empty: "还没有任何原型设计项目。先用 wireframe 或 hifi 创建一个。",
          keep: hasOutput,
          title: "xpi-prototype-design：要归档哪个项目",
        });
        if (!stage) return;
        // 归档是纯文件操作，不需要 agent 参与，因此不发 skill 消息。
        try {
          const result = await archiveProject(ctx.cwd, stage.project, stage.kind);
          ctx.ui.notify(
            [
              `已归档：${result.archiveDir}`,
              `记录：${result.logPath}`,
              `恢复：${result.restoreCommand}`,
            ].join("\n"),
          );
        } catch (error) {
          ctx.ui.notify(`归档失败：${(error as Error).message}`, "error");
        }
        return;
      }

      // 六个模式都已接线；给 Mode 加成员时这里会先出现未覆盖分支。
      printUsage(ctx);
    },
  });
}
