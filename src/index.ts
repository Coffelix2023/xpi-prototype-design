import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { type AutocompleteItem, fuzzyFilter } from "@earendil-works/pi-tui";
import { archiveProject, listProjects, type ProjectStage } from "./artifacts.js";
import {
  choiceLabels,
  MODES,
  type Mode,
  parseCommandArgs,
  pickChoice,
  toChoices,
} from "./contracts.js";
import { registerPrototypeTools } from "./tools.js";

const VERSION = "0.1.0";

/**
 * 参数补全：四个模式，用 pi-tui 的 fuzzyFilter。
 *
 * 与宿主内置命令（`/model`、`/thinking`、`/login`）同一个匹配器，
 * 因此首字母与子序列都能命中。
 *
 * prefix 为空时返回 null：`/xpi-prototype-design` 后面刚敲下空格的那一刻不弹列表，
 * 选项改由回车触发 handler 里的 `ctx.ui.select` 面板给出（见 promptForMode）。
 */
function completions(prefix: string): AutocompleteItem[] | null {
  // 空 prefix 覆盖两种情形：只有命令名，或命令名加空格。都不弹。
  if (prefix.trim() === "") return null;
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
      description: "修改已有的原型设计项目",
      mode: "update",
    },
    {
      description: "归档已完成的原型设计项目",
      mode: "archive",
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
 * 无模式时列出四个模式让用户挑。
 *
 * `ctx.ui.select` 在非 TUI 模式（RPC / print）与用户取消时都返回 `undefined`。
 * 前者不能抛错，因此两种情况统一回退到用法提示。
 */
async function promptForMode(ctx: ExtensionCommandContext): Promise<Mode | undefined> {
  const chosen = await ctx.ui.select(
    "xpi-prototype-design：选择模式",
    choiceLabels(MODE_CHOICES),
  );
  const picked = pickChoice(MODE_CHOICES, chosen);
  if (picked) return picked.mode;
  ctx.ui.notify(usageText());
  return undefined;
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
    (stage) => stage.kind === "wireframe",
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

/** 阶段选项文本。update 与 archive 共用同一份列表，避免两处格式漂移。 */
function stageLabel(stage: ProjectStage): string {
  const versions =
    stage.versions.length === 0
      ? "无版本"
      : stage.versions.map((v) => `v${v}`).join(" ");
  return `${stage.project} / ${stage.kind} · ${versions} · ${stage.currentFileCount} 文件`;
}

/**
 * 让用户挑一个活跃阶段。
 *
 * 返回 `null` 表示无法继续——没有项目、没有面板、或用户取消，三种情况都在
 * 这里给出可读通知，调用方只需 return，不必再分辨原因。
 */
async function pickStage(
  ctx: ExtensionCommandContext,
  title: string,
): Promise<ProjectStage | null> {
  const stages = await listProjects(ctx.cwd);
  if (stages.length === 0) {
    ctx.ui.notify("还没有任何原型设计项目。先用 wireframe 或 hifi 创建一个。");
    return null;
  }
  // 与 hifi 同一条判据：rpc 模式能弹面板，只有 json / print 不能。
  if (!ctx.hasUI) {
    ctx.ui.notify("当前模式没有可用的选择面板。");
    return null;
  }
  const choices = toChoices(stages, stageLabel);
  const chosen = await ctx.ui.select(title, choiceLabels(choices));
  return pickChoice(choices, chosen) ?? null;
}

/**
 * 通知 + kick off。
 *
 * 刻意不在这里建骨架：项目 slug 由 agent 深挖后决定（见 SKILL.md），
 * 命令层只负责选模式与触发，避免猜错项目名后留下空目录。
 */
function fire(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  target: string,
  rest: string,
): void {
  ctx.ui.notify(`xpi-prototype-design ${VERSION} · ${target}`);
  pi.sendUserMessage(kickoff(target, rest), {
    expandPromptTemplates: true,
  });
}

export default function xpiPrototypeDesign(pi: ExtensionAPI): void {
  registerPrototypeTools(pi);

  pi.registerCommand("xpi-prototype-design", {
    description: "原型设计流程：wireframe / hifi / update / archive",
    getArgumentCompletions: completions,
    handler: async (args, ctx) => {
      const parsed = parseCommandArgs(args);
      const mode = parsed.mode ?? (await promptForMode(ctx));
      if (!mode) return;

      if (mode === "wireframe") {
        fire(pi, ctx, "wireframe", parsed.rest);
        return;
      }

      if (mode === "hifi") {
        const entry = await chooseHifiEntry(ctx);
        if (!entry) return;
        const target =
          entry.kind === "based-on" ? `hifi --based-on ${entry.project}` : "hifi";
        fire(pi, ctx, target, parsed.rest);
        return;
      }

      if (mode === "update") {
        const stage = await pickStage(ctx, "xpi-prototype-design：要修改哪个项目");
        if (!stage) return;
        fire(
          pi,
          ctx,
          `update --project ${stage.project} --kind ${stage.kind}`,
          parsed.rest,
        );
        return;
      }

      if (mode === "archive") {
        const stage = await pickStage(ctx, "xpi-prototype-design：要归档哪个项目");
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

      // 四个模式都已接线；给 Mode 加成员时这里会先出现未覆盖分支。
      ctx.ui.notify(usageText());
    },
  });
}
