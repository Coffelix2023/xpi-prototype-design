import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { registerSemanticTools } from "./semantic-annotate.js";
import { loadSemanticMap, parseInput } from "./semantic-ui-map.js";
import { registerPrototypeTools } from "./tools.js";

const root = "/tmp/xpi-semantic-test-project";
type Handler = (
  id: string,
  params: Record<string, unknown>,
  signal: unknown,
  update: unknown,
  ctx: ExtensionContext,
) => Promise<unknown>;

function handlers(): Map<string, Handler> {
  const registered = new Map<string, Handler>();
  const pi = {
    registerTool: (tool: { name: string; execute: Handler }) =>
      registered.set(tool.name, tool.execute),
  } as unknown as ExtensionAPI;
  registerPrototypeTools(pi);
  registerSemanticTools(pi);
  return registered;
}

it("manual acceptance: setup, annotate, parse", async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
  const tools = handlers();
  const ctx = {
    cwd: root,
  } as unknown as ExtensionContext;
  await tools.get("prototype_setup")?.(
    "manual",
    {
      kind: "wireframe",
      pageId: "home",
      project: "test-project",
    },
    undefined,
    undefined,
    ctx,
  );

  const product = join(root, ".pi/prototype-design/test-project");
  const mapPath = join(product, "semantic-ui-map.yaml");
  const htmlPath = join(product, "pages/home/wireframe/current/index.html");
  await writeFile(
    mapPath,
    [
      "meta:",
      "  project: test-project",
      "  version: 1",
      "  type: multi-page",
      '  updated: "2026-01-01 00:00"',
      "  annotate_default: true",
      "pages:",
      "  P1:",
      "    id: home",
      "    label: 首页",
      "    route: pages/home/wireframe/current/index.html",
      "    status: confirmed",
      "elements:",
      "  home.primary-button:",
      "    short: P1-1-B1",
      "    label: 主按钮",
      "    type: button",
      "    status: confirmed",
      "    stage_created: wireframe",
      "    fidelities:",
      "      wireframe: pages/home/wireframe/current/index.html#P1-1-B1",
      "",
    ].join("\n"),
    "utf8",
  );
  await mkdir(join(product, "pages/home/wireframe/current"), {
    recursive: true,
  });
  await writeFile(
    htmlPath,
    '<!doctype html><html><head><title>test-project</title></head><body><button id="P1-1-B1">主按钮</button></body></html>',
    "utf8",
  );
  await tools.get("semantic_ui_map_annotate")?.(
    "manual",
    {
      kind: "wireframe",
      pageId: "home",
      project: "test-project",
    },
    undefined,
    undefined,
    ctx,
  );
  await readFile(htmlPath, "utf8");
  const map = await loadSemanticMap(root, "test-project");
  if (!map) throw new Error("semantic map not loaded");
  const inputs = [
    "P1-1-B1",
    "home.primary-button",
    "主按钮",
  ];
  for (const input of inputs) {
    const parsed = parseInput(input, map);
    expect(parsed.matched && parsed.element.id).toBe("home.primary-button");
  }
  const snapshot = tools.get("prototype_snapshot");
  await snapshot?.(
    "manual",
    {
      change: "手动快照",
      kind: "wireframe",
      pageId: "home",
      project: "test-project",
    },
    undefined,
    undefined,
    ctx,
  );
  const versionedHtml = await readFile(
    join(product, "pages/home/wireframe/v1/index.html"),
    "utf8",
  );
  const changelog = await readFile(
    join(product, "pages/home/wireframe/CHANGELOG.md"),
    "utf8",
  );
  expect(versionedHtml).toContain('data-semantic-badge="P1-1-B1"');
  expect(changelog).toContain("手动快照");
  expect((await loadSemanticMap(root, "test-project"))?.meta.version).toBe(2);
  console.log(`MANUAL_PROJECT_ROOT=${root}`);
  console.log(`MANUAL_HTML=${htmlPath}`);
});
