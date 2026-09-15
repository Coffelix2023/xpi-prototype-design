/**
 * migration — 迁移闭环的评审层。
 *
 * 底层的只读扫描与文件搬运在 `product-map.ts`（`scanMigrationSource` /
 * `executeMigration`）；本模块只补三件底层不该管的事：
 *
 *   1. **不替用户猜**：扫描只给建议（`suggestedPageId`），pageId /
 *      implementation / fidelity / target 必须由调用方从用户那里拿到决策才填；
 *      缺哪一项就进 unresolved 列表，而不是填个默认值往下走。
 *   2. **确认后才动盘**：`runMigration` 在 unresolved 非空时直接抛错，不写任何文件。
 *   3. **迁移完要能证明**：链接校验 + 最小渲染检查 + 迁移报告落到
 *      `<product>/migration/`；有任何一项没过，`complete` 就是 false。
 *
 * ponytail: 覆盖判断用「目标文件是否已存在」而不是内容比较——迁移是新建，
 * 目标已存在即视为冲突并跳过，绝不覆盖。真要合并是另一个功能。
 */

import { constants } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { formatStamp, type Kind } from "./contracts.js";
import {
  executeMigration,
  type Fidelity,
  type Implementation,
  isFidelity,
  isImplementation,
  isPageId,
  type MigrationFinding,
  type MigrationPlan,
  PRODUCT_MAP_FILE,
  type ProductMap,
  readProductMap,
  scanMigrationSource,
  validateProductMap,
  writeProductMap,
} from "./product-map.js";

/** 迁移报告目录，相对 `<product>/`；与页面产物分开，报告不是设计产物。 */
export const MIGRATION_REPORT_DIR = "migration";

const REFERENCE_PATTERN = /\b(?:href|src)="([^"]+)"/g;
const HTML_TAG_PATTERN = /<html|<body/i;

/**
 * 用户的映射决策。`exclude` 与 `pageId/target` 互斥：
 * 非 HTML 资源要么归属到某个页面（出现在该页面的 `assets` 里），要么带理由排除。
 */
export interface MigrationDecision {
  /** 归属到本页面的资源来源，搬运到 `current/assets/`。 */
  assets?: string[];
  /** 带理由排除该来源（不搬运、不登记）。 */
  exclude?: boolean;
  fidelity?: Fidelity;
  implementation?: Implementation;
  /** 产品地图里的显示名；缺省用 pageId。 */
  name?: string;
  pageId?: string;
  reason?: string;
  /** 本次扫描到的相对路径。 */
  source: string;
  /** 目标阶段目录，形如 `<product>/pages/<pageId>/<kind>`，相对 `.pi/prototype-design`。 */
  target?: string;
}

export interface MigrationUnresolved {
  field: string;
  message: string;
  source: string;
}

export interface MigrationReview {
  findings: MigrationFinding[];
  /** 每个 HTML 来源里读到的引用（href/src），供用户决定是否改写为稳定 page ID。 */
  links: Record<string, string[]>;
  plan: MigrationPlan;
  ready: boolean;
  unresolved: MigrationUnresolved[];
}

export interface MigrationCheck {
  message: string;
  ok: boolean;
  subject: string;
}

export interface MigrationOutcome {
  checks: MigrationCheck[];
  complete: boolean;
  conflicts: string[];
  copied: string[];
  copiedFiles: string[];
  pageIds: string[];
  recoveryCommand: string | null;
  reportPath: string | null;
  review: MigrationReview;
}

function artifactRoot(projectRoot: string): string {
  return resolve(projectRoot, ".pi", "prototype-design");
}

function insideRoot(projectRoot: string, path: string): string {
  const root = artifactRoot(projectRoot);
  const target = resolve(path);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Migration target escapes .pi/prototype-design: ${path}`);
  }
  return target;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** 只读提取 HTML 里的 href/src，绝不改写来源文件。 */
async function referencesIn(path: string): Promise<string[]> {
  const html = await readFile(path, "utf8");
  const found = new Set<string>();
  for (const match of html.matchAll(REFERENCE_PATTERN)) {
    const value = match[1];
    if (value && !value.startsWith("#")) found.add(value);
  }
  return [
    ...found,
  ].sort();
}

function targetFields(decision: MigrationDecision): MigrationUnresolved[] {
  const issues: MigrationUnresolved[] = [];
  const push = (field: string, message: string) =>
    issues.push({
      field,
      message,
      source: decision.source,
    });
  if (decision.pageId === undefined)
    push("pageId", "缺少稳定 page ID（可用扫描建议值，但必须由用户确认）。");
  else if (!isPageId(decision.pageId))
    push("pageId", `非法 page ID：${JSON.stringify(decision.pageId)}`);
  if (decision.implementation === undefined)
    push(
      "implementation",
      "缺少实现来源（production / prototype / external / placeholder）。",
    );
  else if (!isImplementation(decision.implementation))
    push(
      "implementation",
      `非法 implementation：${JSON.stringify(decision.implementation)}`,
    );
  if (decision.fidelity === undefined)
    push("fidelity", "缺少保真度（none / wireframe / prototype / hifi）。");
  else if (!isFidelity(decision.fidelity))
    push("fidelity", `非法 fidelity：${JSON.stringify(decision.fidelity)}`);
  if (decision.target === undefined)
    push("target", "缺少目标阶段目录 <product>/pages/<pageId>/<kind>。");
  else {
    const parts = decision.target.split("/");
    const shapeOk =
      parts.length === 4 &&
      parts[1] === "pages" &&
      (parts[3] === "wireframe" || parts[3] === "hifi") &&
      isPageId(parts[0]) &&
      isPageId(parts[2]);
    if (!shapeOk)
      push(
        "target",
        `非法目标路径：${JSON.stringify(decision.target)}（期望 <product>/pages/<pageId>/<kind>）`,
      );
    else if (decision.pageId !== undefined && parts[2] !== decision.pageId)
      push(
        "target",
        `目标路径里的 pageId（${parts[2]}）与决策的 pageId（${decision.pageId}）不一致。`,
      );
  }
  return issues;
}

/**
 * 只读评审：合并扫描结果与用户决策，产出可复核的映射计划。
 * 不写盘——`ready` 为 false 时调用方必须把 unresolved 交给用户决定。
 */
export async function scanForMigration(
  projectRoot: string,
  sources: readonly string[],
  decisions: readonly MigrationDecision[] = [],
): Promise<MigrationReview> {
  const plans: MigrationPlan[] = [];
  for (const source of sources)
    plans.push(await scanMigrationSource(projectRoot, source));

  const entries = plans.flatMap((plan) => plan.entries);
  const findings = plans.flatMap((plan) => plan.findings);
  const scanned = new Set(entries.map((entry) => entry.path));
  const bySource = new Map(
    decisions.map((decision) => [
      decision.source,
      decision,
    ]),
  );
  const unresolved: MigrationUnresolved[] = [];
  const mappings: MigrationPlan["mappings"] = [];
  const assetsCovered = new Set<string>();

  for (const decision of decisions) {
    if (!scanned.has(decision.source))
      unresolved.push({
        field: "source",
        message: "决策引用了本次未扫描到的来源。",
        source: decision.source,
      });
    if (decision.exclude && !decision.reason)
      unresolved.push({
        field: "exclude",
        message: "排除来源必须给出理由。",
        source: decision.source,
      });
    for (const asset of decision.assets ?? []) {
      if (!scanned.has(asset))
        unresolved.push({
          field: "assets",
          message: "资源来源不在本次扫描范围内。",
          source: asset,
        });
      assetsCovered.add(asset);
    }
  }

  for (const entry of entries.filter((item) => item.html)) {
    const decision = bySource.get(entry.path);
    if (!decision || decision.exclude) {
      unresolved.push({
        field: "mapping",
        message: "页面尚未确认映射（pageId / implementation / fidelity / target）。",
        source: entry.path,
      });
      continue;
    }
    const issues = targetFields(decision);
    unresolved.push(...issues);
    if (issues.length > 0) continue;
    mappings.push({
      fidelity: decision.fidelity,
      implementation: decision.implementation,
      pageId: decision.pageId,
      source: entry.path,
      target: decision.target,
    });
  }

  for (const entry of entries.filter((item) => !item.html && item.kind === "file")) {
    if (assetsCovered.has(entry.path)) continue;
    if (bySource.get(entry.path)?.exclude) continue;
    unresolved.push({
      field: "assets",
      message: "资源未归属：列入某个页面的 assets，或带理由显式排除。",
      source: entry.path,
    });
  }

  const links: Record<string, string[]> = {};
  for (const entry of entries.filter((item) => item.html))
    links[entry.path] = await referencesIn(resolve(projectRoot, entry.path));

  return {
    findings,
    links,
    ready: unresolved.length === 0 && mappings.length > 0,
    plan: {
      entries,
      findings,
      mappings,
      sourceRoot: sources.join(" | "),
    },
    unresolved,
  };
}

/** 计划的人读文本。给用户复核用的就是这一段，别在工具里另拼一份。 */
export function renderMigrationReview(review: MigrationReview): string {
  const lines: string[] = [
    `来源: ${review.plan.sourceRoot}`,
    `页面映射（${review.plan.mappings.length}）:`,
  ];
  for (const mapping of review.plan.mappings) {
    lines.push(
      `  ${mapping.source} → ${mapping.target} · ${mapping.pageId} · ${mapping.implementation}/${mapping.fidelity}`,
    );
    const refs = review.links[mapping.source] ?? [];
    if (refs.length > 0)
      lines.push(`    引用: ${refs.join("、")}（需改为稳定 page ID）`);
  }
  const nonHtml = review.plan.entries.filter((entry) => !entry.html);
  if (nonHtml.length > 0)
    lines.push(
      `资源（${nonHtml.length}）: ${nonHtml.map((entry) => entry.path).join("、")}`,
    );
  if (review.findings.length > 0)
    lines.push(
      `扫描发现: ${review.findings.map((finding) => `${finding.severity} ${finding.path} — ${finding.message}`).join("；")}`,
    );
  if (review.unresolved.length > 0) {
    lines.push(`待决项（${review.unresolved.length}）:`);
    for (const item of review.unresolved)
      lines.push(`  [${item.field}] ${item.source} — ${item.message}`);
  }
  lines.push(
    review.ready
      ? "计划可执行：等待用户确认后调用 prototype_migration_execute。"
      : "计划不可执行：先让用户决定上面每一项，不要猜测。",
  );
  return lines.join("\n");
}

/** 迁移后的校验：链接（产品地图）与最小渲染（文件存在、非空、像 HTML）。 */
export async function verifyMigration(
  projectRoot: string,
  product: string,
  targets: ReadonlyArray<{
    kind: Kind;
    pageId: string;
  }>,
): Promise<MigrationCheck[]> {
  const checks: MigrationCheck[] = [];
  const map = await readProductMap(projectRoot, product);
  const mapPath = join(".pi", "prototype-design", product, PRODUCT_MAP_FILE);
  if (!map) {
    checks.push({
      message: `${mapPath} 缺失或无效：链接无法校验，迁移不能算完成。`,
      ok: false,
      subject: "links",
    });
  } else {
    const validation = validateProductMap(map);
    for (const issue of validation.issues)
      checks.push({
        message: `链接无效：${issue.message}`,
        ok: false,
        subject: "links",
      });
    for (const target of targets)
      if (!map.pages.some((page) => page.id === target.pageId))
        checks.push({
          message: `页面 ${target.pageId} 未登记进产品地图。`,
          ok: false,
          subject: "links",
        });
    if (validation.valid && checks.length === 0)
      checks.push({
        message: `产品地图链接有效（${map.pages.length} 页）。`,
        ok: true,
        subject: "links",
      });
  }

  for (const target of targets) {
    const file = join(
      artifactRoot(projectRoot),
      product,
      "pages",
      target.pageId,
      target.kind,
      "current",
      `${target.pageId}.html`,
    );
    const label = relative(artifactRoot(projectRoot), file).split(sep).join("/");
    if (!(await exists(file))) {
      checks.push({
        message: `${label} 不存在。`,
        ok: false,
        subject: "render",
      });
      continue;
    }
    const html = await readFile(file, "utf8");
    const renderOk = html.trim().length > 0 && HTML_TAG_PATTERN.test(html);
    checks.push({
      message: renderOk
        ? `${label} 最小渲染检查通过。`
        : `${label} 不是可渲染的 HTML（空文件或缺 <html>/<body>）。`,
      ok: renderOk,
      subject: "render",
    });
  }
  return checks;
}

/**
 * 确认后执行：搬运 → 登记产品地图 → 校验 → 落报告。
 * unresolved 非空时抛错，一个字节都不写。
 */
export async function runMigration(
  projectRoot: string,
  product: string,
  review: MigrationReview,
  decisions: readonly MigrationDecision[],
): Promise<MigrationOutcome> {
  if (!review.ready)
    throw new Error(
      `Migration plan still has unresolved items: ${review.unresolved
        .map((item) => `${item.source}[${item.field}]`)
        .join(", ")}`,
    );

  const result = await executeMigration(
    projectRoot,
    review.plan,
    ".pi/prototype-design",
  );
  const copiedFiles = [
    ...result.copiedFiles,
  ];
  const conflicts = [
    ...result.conflicts,
  ];

  const nameOf = (pageId: string) =>
    decisions.find((decision) => decision.pageId === pageId)?.name ?? pageId;

  for (const decision of decisions) {
    if (!decision.assets || decision.assets.length === 0 || !decision.target) continue;
    for (const asset of decision.assets) {
      const from = resolve(projectRoot, asset);
      const to = insideRoot(
        projectRoot,
        join(
          artifactRoot(projectRoot),
          decision.target,
          "current",
          "assets",
          basename(asset),
        ),
      );
      const label = relative(resolve(projectRoot), to).split(sep).join("/");
      if (await exists(to)) {
        conflicts.push(label);
        continue;
      }
      await mkdir(dirname(to), {
        recursive: true,
      });
      await copyFile(from, to, constants.COPYFILE_EXCL);
      copiedFiles.push(label);
    }
  }

  const copiedPageIds = new Set(
    review.plan.mappings
      .filter((mapping) => mapping.target && result.copied.includes(mapping.target))
      .map((mapping) => mapping.pageId)
      .filter((pageId): pageId is string => typeof pageId === "string"),
  );
  const mapPath = join(artifactRoot(projectRoot), product, PRODUCT_MAP_FILE);
  const existing = await readProductMap(projectRoot, product);
  // 地图存在但读不回来 = 内容非法。覆盖它等于毁掉用户已有的契约，所以直接拒绝。
  if (!existing && (await exists(mapPath)))
    throw new Error(
      `Product map exists but is invalid; fix it before migrating: ${mapPath}`,
    );

  const map: ProductMap = existing ?? {
    pages: [],
    product,
    version: 1,
  };
  for (const mapping of review.plan.mappings) {
    if (!mapping.pageId || !copiedPageIds.has(mapping.pageId)) continue;
    if (map.pages.some((page) => page.id === mapping.pageId)) continue;
    map.pages.push({
      fidelity: mapping.fidelity ?? "prototype",
      id: mapping.pageId,
      implementation: mapping.implementation ?? "prototype",
      name: nameOf(mapping.pageId),
      prototypeEntry: `${mapping.pageId}.html`,
    });
  }
  if (copiedPageIds.size > 0) await writeProductMap(projectRoot, product, map);

  const targets: Array<{
    kind: Kind;
    pageId: string;
  }> = review.plan.mappings
    .filter(
      (mapping) =>
        mapping.pageId && mapping.target && result.copied.includes(mapping.target),
    )
    .map((mapping) => ({
      kind: (mapping.target?.split("/").pop() === "hifi"
        ? "hifi"
        : "wireframe") as Kind,
      pageId: mapping.pageId as string,
    }));
  const checks = await verifyMigration(projectRoot, product, targets);

  const stamp = formatStamp(new Date());
  const reportPath = join(
    artifactRoot(projectRoot),
    product,
    MIGRATION_REPORT_DIR,
    `${stamp.replace(/[: ]/g, "-")}-migration-report.md`,
  );
  await mkdir(dirname(reportPath), {
    recursive: true,
  });
  const complete =
    copiedFiles.length > 0 &&
    conflicts.length === 0 &&
    review.unresolved.length === 0 &&
    checks.every((check) => check.ok);
  const recoveryCommand =
    copiedFiles.length === 0 ? null : `rm -f ${copiedFiles.join(" ")}`;
  await writeFile(
    reportPath,
    renderMigrationReport({
      checks,
      complete,
      conflicts,
      copied: result.copied,
      copiedFiles,
      product,
      recoveryCommand,
      review,
      stamp,
    }),
    "utf8",
  );

  return {
    checks,
    complete,
    conflicts,
    copied: result.copied,
    copiedFiles,
    pageIds: [
      ...copiedPageIds,
    ],
    recoveryCommand,
    reportPath: relative(resolve(projectRoot), reportPath).split(sep).join("/"),
    review,
  };
}

export interface MigrationReportInput {
  checks: MigrationCheck[];
  complete: boolean;
  conflicts: string[];
  copied: string[];
  copiedFiles: string[];
  product: string;
  recoveryCommand: string | null;
  review: MigrationReview;
  stamp: string;
}

export function renderMigrationReport(input: MigrationReportInput): string {
  const lines: string[] = [
    `# 迁移报告 — ${input.product}`,
    "",
    `- 时间: ${input.stamp}`,
    `- 来源: ${input.review.plan.sourceRoot}`,
    `- 结论: ${input.complete ? "完成" : "未完成（见下方未通过项）"}`,
    `- 新建文件（${input.copiedFiles.length}）: ${input.copiedFiles.join("、") || "无"}`,
    `- 冲突跳过（${input.conflicts.length}）: ${input.conflicts.join("、") || "无"}`,
    `- 待决项（${input.review.unresolved.length}）: ${
      input.review.unresolved
        .map((item) => `${item.source}[${item.field}]`)
        .join("、") || "无"
    }`,
    `- 回滚: ${input.recoveryCommand ?? "无（本次未新建文件）"}`,
    "",
    "## 校验",
    ...input.checks.map((check) => `- [${check.ok ? "x" : " "}] ${check.message}`),
    "",
    "## 映射",
    ...input.review.plan.mappings.map(
      (mapping) =>
        `- ${mapping.source} → ${mapping.target} · ${mapping.pageId} · ${mapping.implementation}/${mapping.fidelity}`,
    ),
    "",
    "## 引用（需人工改为稳定 page ID）",
    ...Object.entries(input.review.links).flatMap(([source, refs]) =>
      refs.length === 0
        ? []
        : [
            `- ${source}: ${refs.join("、")}`,
          ],
    ),
  ];
  return `${lines.join("\n")}\n`;
}
