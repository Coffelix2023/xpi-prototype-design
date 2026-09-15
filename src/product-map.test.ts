import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeMigration,
  type ProductMap,
  scanMigrationSource,
  validateProductMap,
} from "./product-map.js";

const maps: ProductMap = {
  product: "checkout",
  version: 1,
  pages: [
    {
      fidelity: "none",
      id: "home",
      implementation: "production",
      name: "首页",
      route: "/",
    },
    {
      fidelity: "wireframe",
      id: "checkout",
      implementation: "prototype",
      name: "结算",
      prototypeEntry: "checkout.html",
      links: [
        {
          target: "done",
        },
      ],
    },
    {
      fidelity: "hifi",
      id: "done",
      implementation: "prototype",
      name: "完成",
      prototypeEntry: "done.html",
    },
  ],
};

describe("product map", () => {
  it("represents mixed maturity and reverse links", () => {
    const result = validateProductMap(maps);
    expect(result.valid).toBe(true);
    expect(result.reverseReferences.done).toEqual([
      "checkout",
    ]);
  });

  it("rejects duplicate, unsafe, and unresolved IDs", () => {
    const result = validateProductMap({
      ...maps,
      pages: [
        ...maps.pages,
        {
          ...maps.pages[0],
          id: "../secret",
        },
        {
          ...maps.pages[1],
          id: "home",
        },
        {
          ...maps.pages[1],
          id: "broken",
          links: [
            {
              target: "missing",
            },
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "unsafe-id",
        "duplicate-id",
        "unresolved-link",
      ]),
    );
  });
});

describe("migration safety", () => {
  let root = "";
  afterEach(async () => {
    if (root)
      await import("node:fs/promises").then(({ rm }) =>
        rm(root, {
          force: true,
          recursive: true,
        }),
      );
  });

  it("scans read-only and rejects traversal", async () => {
    root = await mkdtemp(join(tmpdir(), "xpi-map-"));
    await writeFile(join(root, "screen.html"), "<html></html>");
    const plan = await scanMigrationSource(root, "screen.html");
    expect(plan.entries.some((entry) => entry.html)).toBe(true);
    await expect(scanMigrationSource(root, "../outside")).rejects.toThrow();
    expect(await readFile(join(root, "screen.html"), "utf8")).toContain("html");
  });

  it("reports conflicts instead of overwriting targets", async () => {
    root = await mkdtemp(join(tmpdir(), "xpi-map-"));
    await writeFile(join(root, "screen.html"), "<html></html>");
    const result = await executeMigration(root, {
      entries: [],
      findings: [],
      sourceRoot: "screen.html",
      mappings: [
        {
          pageId: "screen",
          source: "screen.html",
          target: "checkout/pages/screen/wireframe",
        },
      ],
    });
    expect(result.copied).toHaveLength(1);
    const again = await executeMigration(root, {
      entries: [],
      findings: [],
      sourceRoot: "screen.html",
      mappings: [
        {
          pageId: "screen",
          source: "screen.html",
          target: "checkout/pages/screen/wireframe",
        },
      ],
    });
    expect(again.conflicts).toEqual([
      "checkout/pages/screen/wireframe",
    ]);
  });
});
