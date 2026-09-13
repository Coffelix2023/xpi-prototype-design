/**
 * gate — 计划闸门的机械层。
 *
 * 为什么需要这一层：闸门原先只写在 `skills/xpi-prototype-design/SKILL.md` §5.1 里。
 * 深挖要跑三轮问卷，等走到闸门时，那条规则已经离开模型的注意力窗口，于是它直接
 * 开始勾 `tasks.md`——同一处改过两次都没有生效。
 *
 * 现在拆成两半：
 *   1. `prototype_gate` 由**扩展**弹三选一卡（`ctx.ui.select`），把用户的选择写进
 *      `<stage>/gate.json`。答案是用户给的，不是模型自述的。
 *   2. `tool_call` 钩子在写入 `current/` 前读这份记录，没放行就直接 block，
 *      并把原因回灌给模型——因此模型的纠错回路发生在**违规的那一刻**，而不是靠它
 *      记得十几轮之前读过的一段话。
 *
 * 与 xpi-fast-fix 同一条思路（禁止句绑在具体路径上、确认排在写盘之前），只是这里
 * 把「必须询问」从提示词约定升级成了可执行的门禁。
 */

import { relative, resolve, sep } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readArtifactState, writeGateState } from "./artifacts.js";
import {
  ARTIFACT_ROOT,
  CURRENT_DIR,
  GATE_CHOICES,
  type GateAnswer,
  type GateState,
  gateLabel,
  isKind,
  isValidProjectSlug,
  type Kind,
} from "./contracts.js";
import { kindSchema, projectSchema } from "./tools.js";

/** 答案对应的下一步。写给模型看，逐句可执行。 */
const AFTER_ANSWER: Record<GateAnswer, string> = {
  execute:
    "用户选择「保存后立即执行」：先写 plan.md 与 tasks.md，随后按 SKILL.md §5.2 执行腿产出——`current/` 已放行。",
  more: "用户选择「还有需要补充的」：不要写盘、不要产出，直接追问缺哪一块；补完再调一次 prototype_gate。",
  save: "用户选择「仅保存」：写 plan.md 与 tasks.md（`current/` 仍禁止写入），然后本轮到此结束，明确告诉用户「等你发话再产出」。",
};

/** 卡面文本。抽出来是为了让提示词与面板说同一句话。 */
export function gateTitle(project: string, kind: Kind): string {
  return `xpi-prototype-design：${project} / ${kind} 的计划已就绪，要现在产出吗`;
}

/**
 * 是否挡下这次 `current/` 写入。
 *
 * 只挡**首次**产出：阶段一旦有过快照，说明用户早就放行过，之后的 update 与迭代
 * 不该再被同一道门挡第二次。
 */
export function gateBlocksWrite(state: {
  gate: GateState | null;
  versions: readonly number[];
}): boolean {
  return state.versions.length === 0 && state.gate?.answer !== "execute";
}

const ARTIFACT_ROOT_PARTS = ARTIFACT_ROOT.split("/");
const CURRENT_INDEX = ARTIFACT_ROOT_PARTS.length + 2;

/**
 * 从写入目标反查 `(project, kind)`。
 *
 * 只认 `<cwd>/.pi/prototype-design/<project>/<kind>/current/` 之下：`plan.md`、`tasks.md`
 * 这些台账必须在闸门放行**之后**才写，所以不能连它们一起挡。
 */
export function stageOfCurrentPath(
  cwd: string,
  target: string,
): {
  kind: Kind;
  project: string;
} | null {
  const relativePath = relative(resolve(cwd), resolve(target));
  if (relativePath.length === 0 || relativePath.startsWith("..")) return null;
  const parts = relativePath.split(sep);
  if (parts.length <= CURRENT_INDEX) return null;
  for (const [index, part] of ARTIFACT_ROOT_PARTS.entries()) {
    if (parts[index] !== part) return null;
  }
  const project = parts[ARTIFACT_ROOT_PARTS.length];
  const kind = parts[ARTIFACT_ROOT_PARTS.length + 1];
  if (!isValidProjectSlug(project) || !isKind(kind)) return null;
  if (parts[CURRENT_INDEX] !== CURRENT_DIR) return null;
  return {
    kind,
    project,
  };
}

/**
 * 写出目标文件的绝对路径；只认会落盘的 write / edit。
 *
 * ponytail: bash 里用 heredoc 写文件绕不过去（判断写操作只能靠启发式，误报会连 `ls`
 * 一起挡）。改用 `write` / `edit` 才受门禁保护。真被绕开再考虑解析 bash 的重定向。
 */
function writtenPath(event: ToolCallEvent): string | null {
  if (isToolCallEventType("write", event)) return event.input.path;
  if (isToolCallEventType("edit", event)) return event.input.path;
  return null;
}

function blockReason(project: string, kind: Kind, gate: GateState | null): string {
  const seen = gate
    ? `用户上次的选择是「${gateLabel(gate.answer)}」`
    : "还没有用户的闸门答复";
  return [
    `⛔ 计划闸门未通过：${project}/${kind} 尚无版本快照，${seen}。`,
    `先调 prototype_gate({ project: "${project}", kind: "${kind}" }) 让用户做三选一确认。`,
    '只有「保存后立即执行」才放行 current/；用户已在聊天里说「开始执行」时用 mode: "resume"。',
  ].join(" ");
}

/** 无对话框模式（print / json）下的回退文案：卡弹不出来，但答案仍要走同一条记录。 */
function noUiText(project: string, kind: Kind): string {
  return [
    `当前模式没有可用的选择面板，闸门卡弹不出来。`,
    `请用 ask_user_question 发同一张卡（标题「${gateTitle(project, kind)}」，三个选项：${GATE_CHOICES.map((choice) => choice.label).join(" / ")}），`,
    `拿到答复后再调 prototype_gate({ project: "${project}", kind: "${kind}", answer: "<选项>" }) 记录。`,
    "在记录为 execute 之前，不要写 current/。",
  ].join("\n");
}

async function askGate(
  ctx: ExtensionContext,
  project: string,
  kind: Kind,
  fallbackAnswer: GateAnswer | undefined,
): Promise<string> {
  const state = await readArtifactState(ctx.cwd, project, kind);
  if (state.versions.length > 0) {
    return `${project}/${kind} 已有版本快照，闸门只对首次产出生效，直接进执行腿。`;
  }

  // 无面板模式：面板弹不出来，只能把同一张卡交给 ask_user_question，再回收答案。
  if (!ctx.hasUI) {
    if (fallbackAnswer === undefined) return noUiText(project, kind);
    await writeGateState(ctx.cwd, project, kind, fallbackAnswer);
    return `${gateLabel(fallbackAnswer)}（已记录 → gate.json）\n${AFTER_ANSWER[fallbackAnswer]}`;
  }

  // 有面板时只认用户在面板里的选择；模型传进来的 answer 不采信，否则闸门可以自答。
  const chosen = await ctx.ui.select(
    gateTitle(project, kind),
    GATE_CHOICES.map((choice) => choice.label),
  );
  const picked = GATE_CHOICES.find((choice) => choice.label === chosen);
  if (picked === undefined) {
    return "用户取消了闸门卡：停在这里。不要写 current/，也不要开始写 plan.md / tasks.md，等用户发话。";
  }
  const written = await writeGateState(ctx.cwd, project, kind, picked.answer);
  return `${picked.label}（已记录 → gate.json，${written.at}）\n${AFTER_ANSWER[picked.answer]}`;
}

/**
 * 续跑：用户在聊天里明确说了「开始执行 / 继续」。
 *
 * 只在已有 `save` 记录时放行——没确认过的阶段不许用 resume 跳过闸门。
 */
async function resumeGate(
  ctx: ExtensionContext,
  project: string,
  kind: Kind,
): Promise<string> {
  const state = await readArtifactState(ctx.cwd, project, kind);
  if (state.versions.length > 0) {
    return `${project}/${kind} 已有版本快照，闸门只对首次产出生效，直接进执行腿。`;
  }
  if (state.gate?.answer !== "save") {
    return `没有可续跑的「仅保存」记录：当前 gate.json 为 ${state.gate ? `「${gateLabel(state.gate.answer)}」` : "缺失"}。先调 prototype_gate 让用户确认，再续跑。`;
  }
  await writeGateState(ctx.cwd, project, kind, "execute");
  return `已按用户的续跑指令放行 ${project}/${kind} 的 current/：从 tasks.md 第一个未完成任务接着做，不重新深挖。`;
}

export function registerPrototypeGate(pi: ExtensionAPI): void {
  pi.registerTool({
    description:
      "首次产出前的计划闸门：由扩展自己弹三选一卡（仅保存 / 保存后立即执行 / 还有需要补充的），把用户的选择写进 <stage>/gate.json。用户没选「保存后立即执行」之前，任何写入 <stage>/current/ 的调用都会被 tool_call 钩子硬阻断。mode=resume 用于用户在聊天里明确说「开始执行」之后的续跑；无对话框模式（print / json）用 answer 回填用户答复。",
    label: "计划闸门确认",
    name: "prototype_gate",
    parameters: Type.Object({
      answer: Type.Optional(
        Type.Enum(
          [
            "save",
            "execute",
            "more",
          ] as const,
          {
            description:
              "仅无对话框模式需要：把 ask_user_question 收到的答复回填进来记录。有面板时忽略此参数，以用户在面板里的真实选择为准。",
          },
        ),
      ),
      kind: kindSchema,
      mode: Type.Optional(
        Type.Enum(
          [
            "ask",
            "resume",
          ] as const,
          {
            description:
              "ask（默认）弹闸门卡；resume 表示用户已在聊天里说「开始执行」，仅在已有 save 记录时放行。",
          },
        ),
      ),
      project: projectSchema,
    }),
    promptSnippet:
      "Ask the user to approve first production (plan gate) and record the answer.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const text =
        params.mode === "resume"
          ? await resumeGate(ctx, params.project, params.kind)
          : await askGate(ctx, params.project, params.kind, params.answer);
      return {
        content: [
          {
            text: text.slice(0, 2_000),
            type: "text",
          },
        ],
        details: {
          kind: params.kind,
          mode: params.mode ?? "ask",
          project: params.project,
        },
      };
    },
  });

  pi.on("tool_call", async (event, ctx): Promise<ToolCallEventResult | undefined> => {
    const target = writtenPath(event);
    if (target === null) return undefined;
    const stage = stageOfCurrentPath(ctx.cwd, target);
    if (stage === null) return undefined;
    const state = await readArtifactState(ctx.cwd, stage.project, stage.kind);
    if (!gateBlocksWrite(state)) return undefined;
    return {
      block: true,
      reason: blockReason(stage.project, stage.kind, state.gate),
    };
  });
}
