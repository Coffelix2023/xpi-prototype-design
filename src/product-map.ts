import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const PRODUCT_MAP_FILE = "product-map.json";
export const PAGE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const IMPLEMENTATIONS = [
  "production",
  "prototype",
  "external",
  "placeholder",
] as const;
export const FIDELITIES = [
  "none",
  "wireframe",
  "prototype",
  "hifi",
] as const;
export type Implementation = (typeof IMPLEMENTATIONS)[number];
export type Fidelity = (typeof FIDELITIES)[number];

export interface PageLink {
  label?: string;
  target: string;
}

export interface ProductPage {
  fidelity: Fidelity;
  id: string;
  implementation: Implementation;
  links?: PageLink[];
  name: string;
  prototypeEntry?: string;
  route?: string;
}

export interface ProductMap {
  flow?: string[];
  pages: ProductPage[];
  product: string;
  version: 1;
}

export interface MapIssue {
  code:
    | "invalid-map"
    | "duplicate-id"
    | "unsafe-id"
    | "unresolved-link"
    | "invalid-page";
  message: string;
  pageId?: string;
  target?: string;
}

export interface ProductMapValidation {
  issues: MapIssue[];
  reverseReferences: Record<string, string[]>;
  valid: boolean;
}

export function isPageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    PAGE_ID_PATTERN.test(value) &&
    !value.includes("..") &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

export function assertPageId(value: unknown): string {
  if (!isPageId(value)) throw new Error(`Invalid page id: ${JSON.stringify(value)}`);
  return value;
}

export function isImplementation(value: unknown): value is Implementation {
  return (
    typeof value === "string" && (IMPLEMENTATIONS as readonly string[]).includes(value)
  );
}

export function isFidelity(value: unknown): value is Fidelity {
  return typeof value === "string" && (FIDELITIES as readonly string[]).includes(value);
}

export function validateProductMap(input: unknown): ProductMapValidation {
  const issues: MapIssue[] = [];
  const reverseReferences: Record<string, string[]> = {};
  if (typeof input !== "object" || input === null) {
    return {
      valid: false,
      issues: [
        {
          code: "invalid-map",
          message: "Product map must be an object.",
        },
      ],
      reverseReferences,
    };
  }
  const value = input as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.product !== "string" ||
    !Array.isArray(value.pages)
  ) {
    return {
      valid: false,
      issues: [
        {
          code: "invalid-map",
          message: "Product map requires version 1, product, and pages.",
        },
      ],
      reverseReferences,
    };
  }

  const ids = new Set<string>();
  for (const raw of value.pages) {
    if (typeof raw !== "object" || raw === null) {
      issues.push({
        code: "invalid-page",
        message: "Every page must be an object.",
      });
      continue;
    }
    const page = raw as Record<string, unknown>;
    const pageId = typeof page.id === "string" ? page.id : undefined;
    if (!isPageId(page.id)) {
      issues.push({
        code: "unsafe-id",
        pageId,
        message: `Unsafe page id: ${JSON.stringify(page.id)}`,
      });
    } else if (ids.has(page.id)) {
      issues.push({
        code: "duplicate-id",
        message: `Duplicate page id: ${page.id}`,
        pageId: page.id,
      });
    } else {
      ids.add(page.id);
      reverseReferences[page.id] = [];
    }
    if (
      typeof page.name !== "string" ||
      !isImplementation(page.implementation) ||
      !isFidelity(page.fidelity)
    ) {
      issues.push({
        code: "invalid-page",
        pageId,
        message: `Invalid page contract for ${pageId ?? "unknown page"}.`,
      });
    }
    if (page.route !== undefined && typeof page.route !== "string") {
      issues.push({
        code: "invalid-page",
        pageId,
        message: `Invalid route for ${pageId ?? "unknown page"}.`,
      });
    }
    if (page.prototypeEntry !== undefined && typeof page.prototypeEntry !== "string") {
      issues.push({
        code: "invalid-page",
        pageId,
        message: `Invalid prototype entry for ${pageId ?? "unknown page"}.`,
      });
    }
    if (
      page.links !== undefined &&
      (!Array.isArray(page.links) ||
        page.links.some(
          (link) =>
            typeof link !== "object" ||
            link === null ||
            typeof (link as Record<string, unknown>).target !== "string",
        ))
    ) {
      issues.push({
        code: "invalid-page",
        pageId,
        message: `Invalid links for ${pageId ?? "unknown page"}.`,
      });
    }
  }

  for (const raw of value.pages) {
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof (raw as Record<string, unknown>).id !== "string"
    )
      continue;
    const page = raw as ProductPage;
    for (const link of page.links ?? []) {
      if (!ids.has(link.target)) {
        issues.push({
          code: "unresolved-link",
          message: `${page.id} links to unregistered page ${link.target}.`,
          pageId: page.id,
          target: link.target,
        });
      } else {
        reverseReferences[link.target]?.push(page.id);
      }
    }
  }
  return {
    valid: issues.length === 0,
    issues,
    reverseReferences,
  };
}

export function parseProductMap(raw: string): ProductMap | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return validateProductMap(parsed).valid ? (parsed as ProductMap) : null;
  } catch {
    return null;
  }
}

export async function readProductMap(
  projectRoot: string,
  project: string,
): Promise<ProductMap | null> {
  const path = join(
    resolve(projectRoot),
    ".pi",
    "prototype-design",
    project,
    PRODUCT_MAP_FILE,
  );
  try {
    return parseProductMap(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function writeProductMap(
  projectRoot: string,
  project: string,
  map: ProductMap,
): Promise<void> {
  const validation = validateProductMap(map);
  if (!validation.valid)
    throw new Error(
      `Invalid product map: ${validation.issues.map((issue) => issue.message).join(" ")}`,
    );
  const directory = join(resolve(projectRoot), ".pi", "prototype-design", project);
  await mkdir(directory, {
    recursive: true,
  });
  await writeFile(
    join(directory, PRODUCT_MAP_FILE),
    `${JSON.stringify(map, null, 2)}\n`,
    "utf8",
  );
}

export function resolvePageLink(map: ProductMap, pageId: string): ProductPage | null {
  return map.pages.find((page) => page.id === pageId) ?? null;
}

export function affectedPages(map: ProductMap, pageIds: readonly string[]): string[] {
  const validation = validateProductMap(map);
  const affected = new Set(pageIds);
  const pending = [
    ...pageIds,
  ];
  while (pending.length > 0) {
    const pageId = pending.pop();
    if (!pageId) continue;
    for (const referrer of validation.reverseReferences[pageId] ?? []) {
      if (affected.has(referrer)) continue;
      affected.add(referrer);
      pending.push(referrer);
    }
  }
  return [
    ...affected,
  ].sort();
}

export interface PageImpactReport {
  affected: string[];
  complete: boolean;
  missing: string[];
  requested: string[];
  sharedContract: boolean;
}

export function pageImpact(
  map: ProductMap,
  pageIds: readonly string[],
  sharedContract = false,
  affectedPageIds: readonly string[] = pageIds,
): PageImpactReport {
  const requested = [
    ...new Set(pageIds),
  ].sort();
  const affected = sharedContract
    ? map.pages.map((page) => page.id).sort()
    : affectedPages(map, requested);
  const selected = new Set(affectedPageIds);
  const missing = affected.filter((pageId) => !selected.has(pageId));
  return {
    affected,
    complete: missing.length === 0,
    missing,
    requested,
    sharedContract,
  };
}

export function assertCompletePageScope(
  map: ProductMap,
  pageIds: readonly string[],
  sharedContract = false,
  affectedPageIds: readonly string[] = pageIds,
): PageImpactReport {
  const report = pageImpact(map, pageIds, sharedContract, affectedPageIds);
  if (!report.complete) {
    throw new Error(
      `Page scope is incomplete; include affected pages: ${report.missing.join(", ")}`,
    );
  }
  return report;
}

export interface ProductMapStatus {
  issues: MapIssue[];
  mapPath: string;
  pages: Array<
    ProductPage & {
      linkValid: boolean;
      reverseReferences: string[];
    }
  >;
  product: string;
  valid: boolean;
}

export function productMapStatus(
  _projectRoot: string,
  project: string,
  map: ProductMap | null,
): ProductMapStatus {
  const validation = map
    ? validateProductMap(map)
    : {
        reverseReferences: {},
        valid: false,
        issues: [
          {
            code: "invalid-map" as const,
            message: "Product map is missing or invalid.",
          },
        ],
      };
  return {
    issues: validation.issues,
    mapPath: join(".pi", "prototype-design", project, PRODUCT_MAP_FILE),
    pages:
      map?.pages.map((page) => ({
        ...page,
        linkValid: !validation.issues.some(
          (issue) => issue.pageId === page.id && issue.code === "unresolved-link",
        ),
        reverseReferences: validation.reverseReferences[page.id] ?? [],
      })) ?? [],
    product: project,
    valid: validation.valid,
  };
}

export interface MigrationScanEntry {
  html: boolean;
  kind: "file" | "directory";
  path: string;
  suggestedPageId?: string;
}

export interface MigrationFinding {
  message: string;
  path: string;
  severity: "warning" | "error";
}

export interface MigrationPlan {
  entries: MigrationScanEntry[];
  findings: MigrationFinding[];
  mappings: Array<{
    source: string;
    pageId?: string;
    implementation?: Implementation;
    fidelity?: Fidelity;
    target?: string;
  }>;
  sourceRoot: string;
}

function safeSourcePath(projectRoot: string, source: string): string {
  const root = resolve(projectRoot);
  const target = resolve(root, source);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Migration source must stay inside project root: ${source}`);
  }
  return target;
}

function suggestedId(path: string): string | undefined {
  const base = path
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base && isPageId(base) ? base : undefined;
}

export async function scanMigrationSource(
  projectRoot: string,
  source: string,
): Promise<MigrationPlan> {
  const absolute = safeSourcePath(projectRoot, source);
  const entries: MigrationScanEntry[] = [];
  const findings: MigrationFinding[] = [];
  async function visit(path: string): Promise<void> {
    const info = await stat(path);
    const pathFromRoot = relative(resolve(projectRoot), path).split(sep).join("/");
    if (info.isDirectory()) {
      entries.push({
        html: false,
        kind: "directory",
        path: pathFromRoot,
      });
      for (const child of await readdir(path)) await visit(join(path, child));
      return;
    }
    const html = path.toLowerCase().endsWith(".html");
    entries.push({
      kind: "file",
      path: pathFromRoot,
      html,
      suggestedPageId: html ? suggestedId(path) : undefined,
    });
    if (!html)
      findings.push({
        message: "Non-HTML asset requires explicit mapping.",
        path: pathFromRoot,
        severity: "warning",
      });
  }
  await visit(absolute);
  if (!entries.some((entry) => entry.html)) {
    findings.push({
      message: "No HTML page was found.",
      path: source,
      severity: "error",
    });
  }
  return {
    sourceRoot: relative(resolve(projectRoot), absolute).split(sep).join("/"),
    entries,
    findings,
    mappings: entries
      .filter((entry) => entry.html)
      // 只声明来源，不替用户猜 pageId / fidelity / implementation：
      // 推断值留在 entry.suggestedPageId 里，等用户确认后由 migration.ts 合并。
      .map((entry) => ({
        source: entry.path,
      })),
  };
}

export async function executeMigration(
  projectRoot: string,
  plan: MigrationPlan,
  targetRoot = ".pi/prototype-design",
): Promise<{
  copied: string[];
  /** 本次新建的目标文件（相对项目根），用于精确回滚。 */
  copiedFiles: string[];
  conflicts: string[];
  report: string;
}> {
  const root = resolve(projectRoot);
  const target = resolve(root, targetRoot);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Migration target must stay inside project root: ${targetRoot}`);
  }
  const copied: string[] = [];
  const copiedFiles: string[] = [];
  const conflicts: string[] = [];
  for (const mapping of plan.mappings) {
    if (!mapping.pageId || !mapping.target) continue;
    const source = safeSourcePath(projectRoot, mapping.source);
    const destination = resolve(target, mapping.target);
    if (!destination.startsWith(`${target}${sep}`)) {
      throw new Error(`Migration target escapes target root: ${mapping.target}`);
    }
    try {
      await stat(destination);
      conflicts.push(mapping.target);
      continue;
    } catch {
      // The destination is new.
    }
    const file = join(destination, "current", `${mapping.pageId}.html`);
    await mkdir(join(destination, "current"), {
      recursive: true,
    });
    await cp(source, file);
    copied.push(mapping.target);
    copiedFiles.push(relative(root, file).split(sep).join("/"));
  }
  return {
    copied,
    copiedFiles,
    conflicts,
    report: `copied=${copied.length}; conflicts=${conflicts.length}`,
  };
}
