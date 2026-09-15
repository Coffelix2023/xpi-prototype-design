import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type MigrationDecision,
  runMigration,
  scanForMigration,
  verifyMigration,
} from "./migration.js";
import { writeProductMap } from "./product-map.js";

let root = "";
const target = "checkout/pages/home/wireframe";
const RECOVERY_COMMAND = /^rm -f /;
const UNRESOLVED_ITEMS = /unresolved/;

function decisions(): MigrationDecision[] {
  return [
    {
      fidelity: "wireframe",
      implementation: "prototype",
      pageId: "home",
      source: "legacy/index.html",
      assets: [
        "legacy/logo.png",
      ],
      target,
    },
  ];
}

async function seedLegacy(): Promise<void> {
  await mkdir(join(root, "legacy"), {
    recursive: true,
  });
  await writeFile(
    join(root, "legacy/index.html"),
    '<html><body><a href="done.html">继续</a></body></html>',
    "utf8",
  );
  await writeFile(join(root, "legacy/logo.png"), "png-bytes", "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "xpi-migration-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

describe("migration review", () => {
  it("reports uncertain mappings instead of guessing, and edits nothing", async () => {
    await seedLegacy();
    const before = await readFile(join(root, "legacy/index.html"), "utf8");

    const review = await scanForMigration(root, [
      "legacy",
    ]);

    expect(review.ready).toBe(false);
    expect(review.unresolved.map((item) => item.field)).toEqual(
      expect.arrayContaining([
        "mapping",
        "assets",
      ]),
    );
    // 链接只被读出，不被改写。
    expect(review.links["legacy/index.html"]).toContain("done.html");
    expect(await readFile(join(root, "legacy/index.html"), "utf8")).toBe(before);
    // 评审阶段不建任何产物目录。
    await expect(stat(join(root, ".pi"))).rejects.toThrow();
  });

  it("rejects traversal and refuses to execute unresolved plans", async () => {
    await expect(
      scanForMigration(root, [
        "../outside",
      ]),
    ).rejects.toThrow();

    await seedLegacy();
    const review = await scanForMigration(root, [
      "legacy",
    ]);
    await expect(runMigration(root, "checkout", review, [])).rejects.toThrow(
      UNRESOLVED_ITEMS,
    );
    await expect(stat(join(root, ".pi"))).rejects.toThrow();
  });

  it("accepts a fully decided plan", async () => {
    await seedLegacy();
    const review = await scanForMigration(
      root,
      [
        "legacy",
      ],
      decisions(),
    );
    expect(review.unresolved).toEqual([]);
    expect(review.ready).toBe(true);
  });
});

describe("migration execution", () => {
  it("copies, registers the product map, and verifies the result", async () => {
    await seedLegacy();
    const review = await scanForMigration(
      root,
      [
        "legacy",
      ],
      decisions(),
    );

    const outcome = await runMigration(root, "checkout", review, decisions());

    expect(outcome.complete).toBe(true);
    expect(outcome.conflicts).toEqual([]);
    expect(outcome.copiedFiles).toEqual(
      expect.arrayContaining([
        ".pi/prototype-design/checkout/pages/home/wireframe/current/home.html",
        ".pi/prototype-design/checkout/pages/home/wireframe/current/assets/logo.png",
      ]),
    );
    const map = await readFile(
      join(root, ".pi/prototype-design/checkout/product-map.json"),
      "utf8",
    );
    expect(map).toContain('"home"');
    expect(outcome.checks.every((check) => check.ok)).toBe(true);
    expect(outcome.reportPath).toContain("migration/");
    expect(outcome.recoveryCommand).toMatch(RECOVERY_COMMAND);
  });

  it("skips existing targets, reports conflicts, and stays recoverable", async () => {
    await seedLegacy();
    const review = await scanForMigration(
      root,
      [
        "legacy",
      ],
      decisions(),
    );
    await runMigration(root, "checkout", review, decisions());

    const again = await runMigration(root, "checkout", review, decisions());

    expect(again.complete).toBe(false);
    expect(again.conflicts).toContain(target);
    expect(again.recoveryCommand).toBeNull();
    const report = await readFile(join(root, again.reportPath ?? ""), "utf8");
    expect(report).toContain("未完成");
    expect(report).toContain("## 校验");
  });
});

describe("migration verification", () => {
  const targets = [
    {
      kind: "wireframe" as const,
      pageId: "home",
    },
  ];

  it("fails when the product map is missing", async () => {
    const checks = await verifyMigration(root, "checkout", targets);
    expect(
      checks.some((check) => !check.ok && check.message.includes("缺失或无效")),
    ).toBe(true);
  });

  it("fails when a migrated page is not registered", async () => {
    await writeProductMap(root, "checkout", {
      product: "checkout",
      version: 1,
      pages: [
        {
          fidelity: "none",
          id: "other",
          implementation: "prototype",
          name: "其他",
        },
      ],
    });

    const checks = await verifyMigration(root, "checkout", targets);

    expect(checks.some((check) => !check.ok && check.message.includes("未登记"))).toBe(
      true,
    );
  });

  it("fails the render check when the artifact is not HTML", async () => {
    await writeProductMap(root, "checkout", {
      product: "checkout",
      version: 1,
      pages: [
        {
          fidelity: "wireframe",
          id: "home",
          implementation: "prototype",
          name: "首页",
          prototypeEntry: "home.html",
        },
      ],
    });
    await mkdir(
      join(root, ".pi/prototype-design/checkout/pages/home/wireframe/current"),
      {
        recursive: true,
      },
    );
    await writeFile(
      join(
        root,
        ".pi/prototype-design/checkout/pages/home/wireframe/current/home.html",
      ),
      "   ",
      "utf8",
    );

    const checks = await verifyMigration(root, "checkout", targets);

    expect(checks.some((check) => !check.ok && check.subject === "render")).toBe(true);
  });
});
