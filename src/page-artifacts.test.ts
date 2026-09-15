import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findPagePreviewTarget,
  readPageArtifactState,
  setupPageArtifacts,
  snapshotPageArtifact,
  writePageGateState,
} from "./page-artifacts.js";
import { type ProductMap, pageImpact } from "./product-map.js";

const map: ProductMap = {
  product: "checkout",
  version: 1,
  pages: [
    {
      fidelity: "wireframe",
      id: "home",
      implementation: "prototype",
      name: "首页",
      prototypeEntry: "home.html",
      links: [
        {
          target: "checkout",
        },
      ],
    },
    {
      fidelity: "hifi",
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
      implementation: "production",
      name: "完成",
    },
  ],
};

let root = "";

afterEach(async () => {
  if (root)
    await rm(root, {
      force: true,
      recursive: true,
    });
});

describe("page-scoped artifacts", () => {
  it("keeps sibling pages independently addressable", async () => {
    root = await mkdtemp(join(tmpdir(), "xpi-pages-"));
    await setupPageArtifacts(root, "checkout", "home", "wireframe");
    await setupPageArtifacts(root, "checkout", "checkout", "hifi");
    await writeFile(
      join(
        root,
        ".pi/prototype-design/checkout/pages/home/wireframe/current/home.html",
      ),
      "home",
      "utf8",
    );
    await writeFile(
      join(
        root,
        ".pi/prototype-design/checkout/pages/checkout/hifi/current/checkout.html",
      ),
      "checkout",
      "utf8",
    );

    const home = await readPageArtifactState(root, "checkout", "home", "wireframe");
    const checkout = await readPageArtifactState(root, "checkout", "checkout", "hifi");
    expect(home.currentFileCount).toBe(1);
    expect(checkout.currentFileCount).toBe(1);
    expect(home.directory).not.toBe(checkout.directory);
  });

  it("binds gate and snapshot records to one page", async () => {
    root = await mkdtemp(join(tmpdir(), "xpi-pages-"));
    await setupPageArtifacts(root, "checkout", "home", "wireframe");
    await writePageGateState(root, "checkout", "home", "wireframe", "execute");
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
      "home",
      "utf8",
    );

    const snapshot = await snapshotPageArtifact(root, "checkout", "home", "wireframe", {
      change: "建立首页",
    });
    expect(snapshot.version).toBe(1);
    expect(
      await readFile(
        join(root, ".pi/prototype-design/checkout/pages/home/wireframe/v1/home.html"),
        "utf8",
      ),
    ).toBe("home");
    await expect(
      readPageArtifactState(root, "checkout", "checkout", "wireframe"),
    ).resolves.toMatchObject({
      versions: [],
    });
  });

  it("resolves preview from the stable page entry", async () => {
    root = await mkdtemp(join(tmpdir(), "xpi-pages-"));
    await setupPageArtifacts(root, "checkout", "home", "wireframe");
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
      "home",
      "utf8",
    );

    await expect(
      findPagePreviewTarget(root, "checkout", map.pages[0], "wireframe"),
    ).resolves.toMatchObject({
      pageId: "home",
      relative: ".pi/prototype-design/checkout/pages/home/wireframe/current/home.html",
    });
  });

  it("rolls a page back through its own version chain", async () => {
    root = await mkdtemp(join(tmpdir(), "xpi-pages-"));
    await setupPageArtifacts(root, "checkout", "home", "wireframe");
    const current = join(
      root,
      ".pi/prototype-design/checkout/pages/home/wireframe/current",
    );
    await mkdir(current, {
      recursive: true,
    });
    await writeFile(join(current, "home.html"), "v1", "utf8");
    const first = await snapshotPageArtifact(root, "checkout", "home", "wireframe", {
      change: "首版",
    });
    expect(first.rollbackCommand).toBeNull();

    await writeFile(join(current, "home.html"), "v2", "utf8");
    const second = await snapshotPageArtifact(root, "checkout", "home", "wireframe", {
      change: "第二版",
    });

    expect(second.version).toBe(2);
    // 回滚目标是本页的上一版，不是别的页面也不是项目级阶段。
    expect(second.rollbackCommand).toContain("pages/home/wireframe/v1");
  });
});

describe("shared page impact", () => {
  it("reports transitive referrers and requires the complete shared set", () => {
    expect(
      pageImpact(map, [
        "done",
      ]),
    ).toMatchObject({
      complete: false,
      affected: [
        "checkout",
        "done",
        "home",
      ],
      missing: [
        "checkout",
        "home",
      ],
    });
    expect(
      pageImpact(
        map,
        [
          "done",
        ],
        true,
        [
          "home",
          "checkout",
          "done",
        ],
      ),
    ).toMatchObject({
      complete: true,
      missing: [],
      affected: [
        "checkout",
        "done",
        "home",
      ],
    });
  });
});
