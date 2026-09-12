/**
 * tools — 暴露给模型的四个工具。
 *
 * 只读与变更严格分离（见 AGENTS.md §4）：
 *   prototype_setup     变更，幂等：建目录骨架、补 THEMES.md
 *   prototype_snapshot  变更：存版本 + 写 CHANGELOG
 *   prototype_preview   变更：用系统默认浏览器打开产物
 *   prototype_status    只读：绝不写盘
 *
 * 产物根固定为 ctx.cwd，模型无法指定任意文件系统根目录；
 * `project` 是信任边界，schema 与 artifacts.ts 各校验一次。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  detectLegacyLayout,
  findPreviewTarget,
  listProjects,
  readArtifactState,
  setupArtifacts,
  snapshotArtifact,
} from "./artifacts.js";
import { KINDS, type Kind, PROJECT_SLUG_PATTERN } from "./contracts.js";
import { openInSystemBrowser } from "./preview.js";

/** 工具输出上限；超出截断，保证回灌上下文有界。 */
const MAX_OUTPUT = 2_000;

const kindSchema = Type.Enum(KINDS, {
  description: "设计阶段：wireframe（线框）或 hifi（高保真）。",
});

/**
 * 项目 slug。schema 层先挡一道，`artifacts.ts` 再挡一道——它是信任边界。
 * pattern 与 `PROJECT_SLUG_PATTERN` 同源，避免两处规则漂移。
 */
const projectSchema = Type.String({
  description:
    "项目 slug，小写 kebab-case，例如 subscription-page。同一设计项目的 wireframe 与 hifi 必须用同一个 slug。",
  pattern: PROJECT_SLUG_PATTERN.source,
});

function line(text: string): string {
  return text.slice(0, MAX_OUTPUT);
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "（无）" : values.join("、");
}

/** 单条状态块。首行是相对路径，本身已含 project 与 kind。 */
export async function describeState(
  ctx: ExtensionContext,
  project: string,
  kind: Kind,
): Promise<string> {
  const state = await readArtifactState(ctx.cwd, project, kind);
  const versions =
    state.versions.length === 0 ? "无" : state.versions.map((v) => `v${v}`).join(" ");
  return [
    `${state.directory}`,
    `  版本: ${versions}`,
    `  当前产出文件: ${state.currentFileCount}`,
    `  最新记录: ${state.latestEntry ?? "无"}`,
    `  THEMES.md: ${state.themesPresent ? "已就位" : "缺失（调用 prototype_setup 补齐）"}`,
  ].join("\n");
}

/**
 * 不指定项目时的总览：每个活跃阶段一行，外加一条旧布局提示。
 *
 * 旧布局只提示不迁移（理由见 detectLegacyLayout 的注释）。
 */
export async function describeOverview(
  ctx: ExtensionContext,
  kind?: Kind,
): Promise<string[]> {
  const stages = (await listProjects(ctx.cwd)).filter(
    (stage) => !kind || stage.kind === kind,
  );
  const lines = stages.map((stage) => {
    const versions =
      stage.versions.length === 0 ? "无" : stage.versions.map((v) => `v${v}`).join(" ");
    return `${stage.project} / ${stage.kind} · ${versions} · ${stage.currentFileCount} 文件 · ${stage.latestEntry ?? "无记录"}`;
  });
  if (lines.length === 0) lines.push("（暂无原型设计项目）");

  const legacy = await detectLegacyLayout(ctx.cwd);
  if (legacy.length > 0) {
    lines.push(
      "",
      `⚠ 检测到旧布局（顶层 ${legacy.join("、")}）。本扩展不自动迁移；如需继续使用，请手动整理为 <project>/<kind>/。`,
    );
  }
  return lines;
}

export function registerPrototypeTools(pi: ExtensionAPI): void {
  pi.registerTool({
    description:
      "为指定项目初始化 prototype-design 产物骨架（.pi/prototype-design/<project>/<kind>/），并在缺失时把包内 THEMES.md 模板复制到项目根。幂等：已存在的文档不会被覆盖。",
    label: "初始化原型设计目录",
    name: "prototype_setup",
    parameters: Type.Object({
      kind: kindSchema,
      project: projectSchema,
    }),
    promptSnippet: "Initialize prototype-design scaffolding and THEMES.md.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await setupArtifacts(ctx.cwd, params.project, params.kind);
      const text = line(
        [
          `已就绪：${result.directory}`,
          `本次新建文档：${list(result.createdDocs)}`,
          `${result.themesPath}：${result.themesStatus === "created" ? "已从扩展模板创建" : "已存在，未改动"}`,
          "下一步：按 skills/xpi-prototype-design/SKILL.md 的流程深挖需求后写入 plan.md，再产出文件到 current/。",
        ].join("\n"),
      );
      return {
        details: result,
        content: [
          {
            text,
            type: "text",
          },
        ],
      };
    },
  });

  pi.registerTool({
    description:
      "把 .pi/prototype-design/<project>/<kind>/current/ 存为一个递增版本 vN，并在 CHANGELOG.md 顶部追加一条记录（含回滚命令）。每完成一轮产出后调用一次；current/ 为空时拒绝执行。",
    label: "保存原型版本快照",
    name: "prototype_snapshot",
    parameters: Type.Object({
      change: Type.String({
        description: "本轮做了什么，一句话。例：hero 改上下堆叠。",
      }),
      files: Type.Optional(
        Type.Array(Type.String(), {
          description: "本轮改动的文件，相对当前阶段目录。",
        }),
      ),
      kind: kindSchema,
      project: projectSchema,
      reason: Type.Optional(
        Type.String({
          description: "为什么这样改。例：移动端优先。",
        }),
      ),
    }),
    promptSnippet:
      "Snapshot the current prototype as v<N> and append a CHANGELOG entry.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await snapshotArtifact(ctx.cwd, params.project, params.kind, {
        change: params.change,
        files: params.files,
        reason: params.reason,
      });
      const text = line(
        [
          `已存 v${result.version}：${result.versionPath}`,
          `记录：${result.changelogPath}`,
          result.rollbackCommand
            ? `回滚上一版：${result.rollbackCommand}`
            : "首个版本，无可回滚目标",
        ].join("\n"),
      );
      return {
        details: result,
        content: [
          {
            text,
            type: "text",
          },
        ],
      };
    },
  });

  pi.registerTool({
    description:
      "只读：报告 prototype-design 的版本列表、当前产出文件数、CHANGELOG 最新记录标题与 THEMES.md 状态。给定 project 时看单个阶段；不给定则汇总全部活跃阶段。不写盘。",
    label: "查看原型设计状态",
    name: "prototype_status",
    parameters: Type.Object({
      kind: Type.Optional(kindSchema),
      project: Type.Optional(projectSchema),
    }),
    promptSnippet:
      "Read prototype-design versions, current output, and CHANGELOG head.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const blocks = params.project
        ? await Promise.all(
            (params.kind
              ? [
                  params.kind,
                ]
              : KINDS
            ).map((kind) => describeState(ctx, params.project as string, kind)),
          )
        : await describeOverview(ctx, params.kind);
      const text = line(blocks.join("\n\n"));
      return {
        content: [
          {
            text,
            type: "text",
          },
        ],
        details: {
          kind: params.kind,
          project: params.project,
        },
      };
    },
  });

  pi.registerTool({
    description:
      "用用户的系统默认浏览器打开某阶段的产物（默认 current/index.html，否则 current/ 下排序第一个 html）。这是预览，不是像素评审；需要真实渲染像素与圈选反馈时改用 xpi-visualoop。",
    label: "在系统浏览器中预览原型",
    name: "prototype_preview",
    parameters: Type.Object({
      file: Type.Optional(
        Type.String({
          description: "相对当前阶段 current/ 的文件路径。越界会被拒绝。",
        }),
      ),
      kind: kindSchema,
      project: projectSchema,
    }),
    promptSnippet: "Open the latest prototype output in the user's default browser.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const target = await findPreviewTarget(
        ctx.cwd,
        params.project,
        params.kind,
        params.file,
      );
      if (!target) {
        throw new Error(
          `No html output found under ${params.project}/${params.kind} current/ directory.`,
        );
      }
      const result = await openInSystemBrowser(target.absolute);
      const text = line(
        result.status === "opened"
          ? `已在系统默认浏览器打开：${target.relative}`
          : `打开失败（${result.status}）：${result.diagnostic ?? "未知原因"}`,
      );
      return {
        content: [
          {
            text,
            type: "text",
          },
        ],
        details: {
          path: target.relative,
          status: result.status,
        },
      };
    },
  });
}
