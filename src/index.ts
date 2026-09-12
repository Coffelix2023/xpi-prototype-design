import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { KINDS, type Kind, parseCommandArgs } from "./contracts.js";
import { registerPrototypeTools } from "./tools.js";

const VERSION = "0.1.0";

function completions(prefix: string): AutocompleteItem[] | null {
  const items: AutocompleteItem[] = KINDS.map((kind) => ({
    label: kind,
    value: kind,
  }));
  const filtered = items.filter((item) => item.value.startsWith(prefix));
  return filtered.length > 0 ? filtered : null;
}

/**
 * 单行 kickoff。交给 Pi 展开 `/skill:`，于是"该调哪些原型设计技能、按什么顺序"
 * 由包内 SKILL.md 单一维护，而不是散在代码里。
 */
function kickoff(kind: Kind, rest: string): string {
  return `/skill:xpi-prototype-design ${kind}${rest ? ` ${rest}` : ""}`;
}

/**
 * 无模式时只列用法。
 *
 * 这里刻意不读产物状态：项目 slug 尚未确定，读状态的接口现在要求 project。
 * 任务 4.2 会把它换成四模式选择面板。
 */
function showStatus(ctx: ExtensionCommandContext): void {
  ctx.ui.notify(
    [
      "用法：/xpi-prototype-design <模式> [需求]",
      "  wireframe  创建线框原型设计",
      "  hifi       创建高保真原型设计（可选基于已有线框）",
      "  update     修改已有的原型设计项目",
      "  archive    归档已完成的原型设计项目",
    ].join("\n"),
  );
}

export default function xpiPrototypeDesign(pi: ExtensionAPI): void {
  registerPrototypeTools(pi);

  pi.registerCommand("xpi-prototype-design", {
    description: "启动原型设计流程：wireframe（线框）或 hifi（高保真）",
    getArgumentCompletions: completions,
    handler: async (args, ctx) => {
      const { mode, rest } = parseCommandArgs(args);
      // update / archive 分支在任务 4.4 / 4.5 接入。
      if (mode !== "wireframe" && mode !== "hifi") {
        showStatus(ctx);
        return;
      }

      // 刻意不在这里建骨架：项目 slug 由 agent 深挖后决定（见 SKILL.md），
      // 命令层只负责选模式与 kick off，避免猜错项目名后留下空目录。
      ctx.ui.notify(`xpi-prototype-design ${VERSION} · ${mode}`);
      pi.sendUserMessage(kickoff(mode, rest), {
        expandPromptTemplates: true,
      });
    },
  });
}
