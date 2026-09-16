/**
 * tools — 暴露给模型的五个工具。
 *
 * 只读与变更严格分离（见 AGENTS.md §4）：
 *   prototype_setup     变更，幂等：建目录骨架、补 THEMES.md
 *   prototype_snapshot  变更：存版本 + 写 CHANGELOG
 *   prototype_preview   变更：用系统默认浏览器打开产物
 *   prototype_status    只读：绝不写盘
 *
 * 第五个 prototype_gate 与 tool_call 门禁在 gate.ts；它复用本模块的 kind/project schema。
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
import {
  type ArtifactState,
  gateLabel,
  KINDS,
  type Kind,
  PROJECT_SLUG_PATTERN,
  type TaskProgress,
} from "./contracts.js";
import {
  type MigrationDecision,
  renderMigrationReview,
  runMigration,
  scanForMigration,
} from "./migration.js";
import {
  findPagePreviewTarget,
  readPageArtifactState,
  setupPageArtifacts,
  snapshotPageArtifact,
} from "./page-artifacts.js";
import { openInSystemBrowser } from "./preview.js";
import {
  assertCompletePageScope,
  FIDELITIES,
  IMPLEMENTATIONS,
  pageImpact,
  productMapStatus,
  readProductMap,
  resolvePageLink,
} from "./product-map.js";
import {
  createEmptySemanticMap,
  incrementSemanticMapVersion,
} from "./semantic-ui-map.js";

/** 工具输出上限；超出截断，保证回灌上下文有界。 */
const MAX_OUTPUT = 2_000;

/** 阶段 schema；gate.ts 复用同一份，避免两处漂移。 */
export const kindSchema = Type.Enum(KINDS, {
  description: "设计阶段：wireframe（线框）或 hifi（高保真）。",
});

/**
 * 项目 slug。schema 层先挡一道，`artifacts.ts` 再挡一道——它是信任边界。
 * pattern 与 `PROJECT_SLUG_PATTERN` 同源，避免两处规则漂移。
 */
export const projectSchema = Type.String({
  description:
    "项目 slug，小写 kebab-case，例如 subscription-page。同一设计项目的 wireframe 与 hifi 必须用同一个 slug。",
  pattern: PROJECT_SLUG_PATTERN.source,
});

/**
 * 迁移决策。`pageId` / `implementation` / `fidelity` / `target` 必须来自用户确认，
 * 缺项由 `scanForMigration` 记进待决项——工具不会替用户填默认值。
 */
const migrationDecisionSchema = Type.Object({
  assets: Type.Optional(
    Type.Array(Type.String(), {
      description: "归属本页面的资源来源（相对项目根），搬到 current/assets/。",
    }),
  ),
  exclude: Type.Optional(
    Type.Boolean({
      description: "带理由排除该来源：不搬运、不登记。",
    }),
  ),
  fidelity: Type.Optional(
    Type.Enum(FIDELITIES, {
      description: "目标保真度：none / wireframe / prototype / hifi。",
    }),
  ),
  implementation: Type.Optional(
    Type.Enum(IMPLEMENTATIONS, {
      description: "实现来源：production / prototype / external / placeholder。",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description: "产品地图里的显示名；缺省用 pageId。",
    }),
  ),
  pageId: Type.Optional(
    Type.String({
      description: "稳定 page ID；可用扫描建议值，但必须由用户确认。",
    }),
  ),
  reason: Type.Optional(
    Type.String({
      description: "排除理由；exclude 为 true 时必填。",
    }),
  ),
  source: Type.String({
    description: "本次扫描到的来源相对路径。",
  }),
  target: Type.Optional(
    Type.String({
      description:
        "目标阶段目录 <product>/pages/<pageId>/<kind>，相对 .pi/prototype-design。",
    }),
  ),
});

function line(text: string): string {
  return text.slice(0, MAX_OUTPUT);
}

/**
 * 闸门状态那一行。
 *
 * 有版本就不再拦（钩子按同一条判据放行），所以这里写「不再拦」而不是留个空答案，
 * 免得读者以为阶段还卡在闸门上。
 */
function gateLine(state: ArtifactState): string {
  if (state.versions.length > 0) return "不再拦（阶段已产出）";
  return state.gate
    ? gateLabel(state.gate.answer)
    : "未确认（写 current/ 会被挡，先调 prototype_gate）";
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "（无）" : values.join("、");
}

/** 任务进度：`2/7`；null 表示计划还没落盘，与「0 项待办」区分开。 */
function taskLabel(tasks: TaskProgress | null): string {
  return tasks ? `${tasks.done}/${tasks.total}` : "无";
}

/** 单条状态块。首行是相对路径，本身已含 project、pageId 与 kind。 */
export async function describeState(
  ctx: ExtensionContext,
  project: string,
  kind: Kind,
  pageId?: string,
): Promise<string> {
  const state = pageId
    ? await readPageArtifactState(ctx.cwd, project, pageId, kind)
    : await readArtifactState(ctx.cwd, project, kind);
  const versions =
    state.versions.length === 0 ? "无" : state.versions.map((v) => `v${v}`).join(" ");
  const map = productMapStatus(
    ctx.cwd,
    project,
    await readProductMap(ctx.cwd, project),
  );
  return [
    `${state.directory}`,
    `  页面范围: ${pageId ?? "阶段兼容视图"}`,
    `  版本: ${versions}`,
    `  当前产出文件: ${state.currentFileCount}`,
    `  任务: ${taskLabel(state.tasks)}`,
    `  闸门: ${gateLine(state)}`,
    `  最新记录: ${state.latestEntry ?? "无"}`,
    `  THEMES.md: ${state.themesPresent ? "已就位" : "缺失（调用 prototype_setup 补齐）"}`,
    `  产品地图: ${map.pages.length} 页 · ${map.valid ? "链接有效" : `无效（${map.issues.length} 个问题）`}`,
    ...map.pages.map(
      (page) =>
        `    页面 ${page.id}: ${page.name} · ${page.implementation}/${page.fidelity} · ${page.linkValid ? "链接有效" : "链接待修复"}`,
    ),
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
    return `${stage.project} / ${stage.kind} · ${versions} · ${stage.currentFileCount} 文件 · 任务 ${taskLabel(stage.tasks)} · ${stage.latestEntry ?? "无记录"}`;
  });
  if (lines.length === 0) lines.push("（暂无原型设计项目）");

  const legacy = await detectLegacyLayout(ctx.cwd);
  if (legacy.length > 0) {
    lines.push(
      "",
      `⚠ 检测到旧布局（顶层 ${legacy.join("、")}）。这些目录只被读取，不会被自动搬动或删除。`,
      "如需纳入页面模型，从 /xpi-prototype-design 的「迁移已有原型或线框」进入：先 prototype_migration_scan 只读扫描并列出待决项，用户确认后才由 prototype_migration_execute 复制。",
    );
  }
  return lines;
}
async function assertSharedPageScope(
  ctx: ExtensionContext,
  project: string,
  pageId: string | undefined,
  sharedContract: boolean | undefined,
  affectedPageIds: string[] | undefined,
): Promise<void> {
  if (!sharedContract) return;
  const map = await readProductMap(ctx.cwd, project);
  if (!map)
    throw new Error(`Shared page scope requires a valid product map: ${project}`);
  if (!pageId)
    throw new Error("Shared contract changes require pageId and affectedPageIds.");
  assertCompletePageScope(
    map,
    [
      pageId,
    ],
    true,
    affectedPageIds ?? [
      pageId,
    ],
  );
}
export function registerPrototypeTools(pi: ExtensionAPI): void {
  pi.registerTool({
    description:
      "为指定项目初始化 prototype-design 产物骨架（.pi/prototype-design/<project>/<kind>/），建空语义字典骨架（<project>/semantic-ui-map.yaml），并在缺失时把包内 THEMES.md 模板复制到项目根。幂等：已存在的文档与字典都不会被覆盖。",
    label: "初始化原型设计目录",
    name: "prototype_setup",
    parameters: Type.Object({
      affectedPageIds: Type.Optional(
        Type.Array(Type.String(), {
          description: "共享契约变更的完整受影响页面 ID 集合。",
        }),
      ),
      kind: kindSchema,
      pageId: Type.Optional(
        Type.String({
          description: "产品地图中的稳定页面 ID；提供后只操作该页面阶段。",
        }),
      ),
      project: projectSchema,
      sharedContract: Type.Optional(
        Type.Boolean({
          description: "是否修改共享导航或链接契约。",
        }),
      ),
    }),
    promptSnippet: "Initialize prototype-design scaffolding and THEMES.md.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      await assertSharedPageScope(
        ctx,
        params.project,
        params.pageId,
        params.sharedContract,
        params.affectedPageIds,
      );
      const result = params.pageId
        ? await setupPageArtifacts(ctx.cwd, params.project, params.pageId, params.kind)
        : await setupArtifacts(ctx.cwd, params.project, params.kind);
      const semanticMap = await createEmptySemanticMap(ctx.cwd, params.project);
      const text = line(
        [
          `已就绪：${result.directory}`,
          `本次新建文档：${list(result.createdDocs)}`,
          `${result.themesPath}：${result.themesStatus === "created" ? "已从扩展模板创建" : "已存在，未改动"}`,
          `语义字典：${semanticMap.path}（${semanticMap.status === "created" ? "已建空骨架" : "已存在，未改动"}）`,
          "下一步：按 skills/xpi-prototype-design/SKILL.md 深挖需求，先在聊天里展示结论；确认后才写 plan.md 与 tasks.md。写盘前必须调 prototype_gate 让用户做三选一确认——没选「保存后立即执行」之前，写 current/ 会被 tool_call 钩子挡回。",
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
      affectedPageIds: Type.Optional(
        Type.Array(Type.String(), {
          description: "共享契约变更的完整受影响页面 ID 集合。",
        }),
      ),
      change: Type.String({
        description: "本轮做了什么，一句话。例：hero 改上下堆叠。",
      }),
      files: Type.Optional(
        Type.Array(Type.String(), {
          description: "本轮改动的文件，相对当前阶段目录。",
        }),
      ),
      kind: kindSchema,
      pageId: Type.Optional(
        Type.String({
          description: "产品地图中的稳定页面 ID；提供后只快照该页面。",
        }),
      ),
      project: projectSchema,
      reason: Type.Optional(
        Type.String({
          description: "为什么这样改。例：移动端优先。",
        }),
      ),
      sharedContract: Type.Optional(
        Type.Boolean({
          description: "是否修改共享导航或链接契约。",
        }),
      ),
    }),
    promptSnippet:
      "Snapshot the current prototype as v<N> and append a CHANGELOG entry.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      await assertSharedPageScope(
        ctx,
        params.project,
        params.pageId,
        params.sharedContract,
        params.affectedPageIds,
      );
      const result = params.pageId
        ? await snapshotPageArtifact(
            ctx.cwd,
            params.project,
            params.pageId,
            params.kind,
            {
              change: params.change,
              files: params.files,
              reason: params.reason,
            },
          )
        : await snapshotArtifact(ctx.cwd, params.project, params.kind, {
            change: params.change,
            files: params.files,
            reason: params.reason,
          });
      const semanticMap = await incrementSemanticMapVersion(ctx.cwd, params.project);
      const text = line(
        [
          `已存 v${result.version}：${result.versionPath}`,
          `记录：${result.changelogPath}`,
          semanticMap
            ? `语义字典：${semanticMap.path} → v${semanticMap.version}（${semanticMap.updated}）`
            : "语义字典：未启用语义标注，未递增版本",
          result.rollbackCommand
            ? `回滚上一版：${result.rollbackCommand}`
            : "首个版本，无可回滚目标",
          // 裁剪过旧版本时把归档目录一并报出来，否则用户不知道版本链为什么变短了。
          ...(result.versionArchiveDir !== null && result.archivedVersions.length > 0
            ? [
                `旧版本归档：${result.archivedVersions.map((version) => `v${version}`).join(" ")} 已移动到 ${result.versionArchiveDir}/`,
              ]
            : []),
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
      pageId: Type.Optional(
        Type.String({
          description: "产品地图中的稳定页面 ID；提供后只读取该页面阶段。",
        }),
      ),
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
            ).map((kind) =>
              describeState(ctx, params.project as string, kind, params.pageId),
            ),
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
      "只读：计算页面或共享导航/链接契约变更的受影响页面，并报告缺失的范围确认。不写盘。",
    label: "检查页面影响范围",
    name: "prototype_page_impact",
    parameters: Type.Object({
      affectedPageIds: Type.Optional(
        Type.Array(Type.String(), {
          description: "用户已确认的完整页面范围，用于检查是否遗漏。",
        }),
      ),
      pageIds: Type.Array(Type.String(), {
        description: "直接变更的页面 ID。",
        minItems: 1,
      }),
      project: projectSchema,
      sharedContract: Type.Optional(
        Type.Boolean({
          description: "共享导航或链接契约变更将影响产品地图中的全部页面。",
        }),
      ),
    }),
    promptSnippet:
      "Report affected pages before a shared navigation or link contract change.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const map = await readProductMap(ctx.cwd, params.project);
      if (!map) throw new Error(`Product map is missing or invalid: ${params.project}`);
      const report = pageImpact(
        map,
        params.pageIds,
        params.sharedContract,
        params.affectedPageIds,
      );
      const text = line(
        [
          `直接页面: ${report.requested.join(", ")}`,
          `受影响页面: ${report.affected.join(", ")}`,
          `范围确认: ${report.complete ? "完整" : `缺少 ${report.missing.join(", ")}`}`,
        ].join("\n"),
      );
      return {
        details: report,
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
      "用用户的系统默认浏览器打开某阶段的产物（默认 current/index.html，否则 current/ 下排序第一个 html）。这是预览，不是像素评审；需要真实渲染像素与圈选反馈时改用 xpi-visualoop。",
    label: "在系统浏览器中预览原型",
    name: "prototype_preview",
    parameters: Type.Object({
      file: Type.Optional(
        Type.String({
          description: "相对当前阶段 current/ 的文件路径。越界会被拒绝。",
        }),
      ),
      flow: Type.Optional(
        Type.String({
          description: "产品流入口，解析为产品地图中的页面 ID。",
        }),
      ),
      kind: kindSchema,
      pageId: Type.Optional(
        Type.String({
          description: "产品地图中的稳定页面 ID。多页面产品预览时必填。",
        }),
      ),
      project: projectSchema,
    }),
    promptSnippet: "Open the latest prototype output in the user's default browser.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const map = await readProductMap(ctx.cwd, params.project);
      const selectedPageId = params.pageId ?? params.flow;
      if (map && map.pages.length > 1 && !selectedPageId) {
        throw new Error(
          "Multi-page products require pageId or flow for preview; refusing arbitrary HTML selection.",
        );
      }
      const mappedPage =
        map && selectedPageId ? resolvePageLink(map, selectedPageId) : undefined;
      if (selectedPageId && !mappedPage)
        throw new Error(`Unknown product page: ${selectedPageId}`);
      const target = mappedPage
        ? await findPagePreviewTarget(
            ctx.cwd,
            params.project,
            mappedPage,
            mappedPage.fidelity === "hifi" ? "hifi" : "wireframe",
            params.file,
          )
        : await findPreviewTarget(ctx.cwd, params.project, params.kind, params.file);
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

  /**
   * 迁移三工具里的前两个：扫描（只读）与执行（写入）。
   * 写入不走 write/edit，因此 tool_call 闸门看不到它——放行靠用户确认过的
   * decisions 与 confirm，见 skills/xpi-prototype-migration/SKILL.md。
   */
  pi.registerTool({
    description:
      "只读：扫描用户明确指定的旧原型/线框来源，产出页面、链接、资源、实现来源与保真度的映射计划，并列出全部待决项。来源只读，越界路径被拒绝，不写盘。",
    label: "扫描待迁移原型",
    name: "prototype_migration_scan",
    parameters: Type.Object({
      decisions: Type.Optional(Type.Array(migrationDecisionSchema)),
      sources: Type.Array(Type.String(), {
        description: "当前项目根内的来源文件或目录，相对路径。",
        minItems: 1,
      }),
    }),
    promptSnippet:
      "Scan explicitly selected legacy prototype sources and report the migration mapping plan.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const review = await scanForMigration(
        ctx.cwd,
        params.sources,
        (params.decisions ?? []) as MigrationDecision[],
      );
      return {
        content: [
          {
            text: line(renderMigrationReview(review)),
            type: "text" as const,
          },
        ],
        details: {
          ready: review.ready,
          unresolved: review.unresolved.length,
        },
      };
    },
  });

  pi.registerTool({
    description:
      "迁移执行：把用户已确认的映射搬进 .pi/prototype-design/<product>/pages/，登记产品地图，跑链接与最小渲染校验并写迁移报告。目标已存在即视为冲突跳过，绝不覆盖；confirm 为 false 或计划仍有待决项时不写盘。",
    label: "执行原型迁移",
    name: "prototype_migration_execute",
    parameters: Type.Object({
      confirm: Type.Boolean({
        description:
          "只有用户已确认映射与目标后才置 true；false 时只回评审结果，不写盘。",
      }),
      decisions: Type.Array(migrationDecisionSchema, {
        minItems: 1,
      }),
      project: projectSchema,
      sources: Type.Array(Type.String(), {
        description: "与扫描时一致的来源列表。",
        minItems: 1,
      }),
    }),
    promptSnippet:
      "Execute the confirmed legacy migration plan, then report link and render checks.",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const decisions = params.decisions as MigrationDecision[];
      const review = await scanForMigration(ctx.cwd, params.sources, decisions);
      if (!review.ready || !params.confirm) {
        return {
          content: [
            {
              text: line(
                [
                  renderMigrationReview(review),
                  review.ready
                    ? "计划可执行，但 confirm 仍是 false：拿到用户确认后再调一次。"
                    : "计划仍有待决项：不写盘，先让用户逐项决定。",
                ].join("\n\n"),
              ),
              type: "text" as const,
            },
          ],
          details: {
            ready: review.ready,
            wrote: false,
          },
        };
      }
      const outcome = await runMigration(ctx.cwd, params.project, review, decisions);
      const text = line(
        [
          `结论: ${outcome.complete ? "完成" : "未完成"}`,
          `新建: ${outcome.copiedFiles.join("、") || "无"}`,
          `冲突跳过: ${outcome.conflicts.join("、") || "无"}`,
          `报告: ${outcome.reportPath ?? "未写"}`,
          `回滚: ${outcome.recoveryCommand ?? "无"}`,
          ...outcome.checks.map(
            (check) => `- [${check.ok ? "x" : " "}] ${check.message}`,
          ),
        ].join("\n"),
      );
      return {
        content: [
          {
            text,
            type: "text" as const,
          },
        ],
        details: {
          complete: outcome.complete,
          reportPath: outcome.reportPath,
          wrote: true,
        },
      };
    },
  });
}
