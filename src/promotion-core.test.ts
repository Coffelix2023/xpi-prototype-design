// biome-ignore-all lint/security/noSecrets: 夹具里的 YAML / 源码片段都是固定字符串。
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ARTIFACT_ROOT } from "./contracts.js";
import { checkPromotion, promotionText } from "./promotion-core.js";

/**
 * 这个文件只干两件事：
 *
 * 1. **把分层约束钉住**：核对核心必须能在没有 Pi 运行时的环境里被导入并跑通。
 *    只要客户端调不到同一个判定，它就会自己复写一份，而两份实现必然漂移
 *    （实测过：脚本报 OK 16 个、工具报命中 10 缺 6）。
 * 2. **真跑一次会话外入口**：`bin/check-promotion.mjs` 走子进程，验证它在裸 node
 *    下能加载 `.ts`、输出与工具同源、退出码 fail-closed。
 */

const PROJECT = "demo";
const SRC = "src/a.tsx";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "promotion-core-"));
});

afterEach(async () => {
  await rm(root, {
    force: true,
    recursive: true,
  });
});

async function write(relative: string, content: string): Promise<void> {
  const target = join(root, relative);
  await mkdir(dirname(target), {
    recursive: true,
  });
  await writeFile(target, content, "utf8");
}

function elementBlock(id: string, short: string, impl: string): string {
  return [
    `  ${id}:`,
    `    short: "${short}"`,
    `    label: "${id}"`,
    "    type: button",
    "    status: locked",
    "    stage_created: wireframe",
    "    fidelities:",
    `      wireframe: "wireframe/current/index.html#${short}"`,
    "      hifi: null",
    "    impl:",
    `      path: ${impl}`,
    "",
  ].join("\n");
}

function dictionary(
  elements: Array<
    [
      string,
      string,
      string,
    ]
  >,
): string {
  return [
    "meta:",
    "  version: 1",
    `  project: ${PROJECT}`,
    "  type: spa",
    '  updated: "2026-01-16"',
    "  annotate_default: on",
    "pages:",
    "  P1:",
    "    id: chat",
    '    label: "对话"',
    '    route: "/chat"',
    "    status: confirmed",
    "elements:",
    ...elements.map(([id, short, impl]) => elementBlock(id, short, impl)),
  ].join("\n");
}

const CLI = fileURLToPath(new URL("../bin/check-promotion.mjs", import.meta.url));

function runCli(args: string[]): {
  code: number | null;
  stderr: string;
  stdout: string;
} {
  const result = spawnSync(
    process.execPath,
    [
      CLI,
      ...args,
    ],
    {
      encoding: "utf8",
    },
  );
  return {
    code: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

describe("分层约束：核心不依赖 Pi 运行时", () => {
  /**
   * 剥注释再扫 import。
   *
   * 必须剥：`promotion-core.ts` 的文档注释里就写着 `from "typebox"` 这串字面量
   * （用来说明为什么要分层），不剥会把注释当成真依赖，测试立刻变成假红。
   */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  function importedFrom(source: string): string[] {
    return [
      ...stripComments(source).matchAll(/\bfrom\s+"([^"]+)"/g),
    ].map((match) => match[1]);
  }

  it("从 promotion-core 出发的本地 import 闭包里，没有 typebox 与 @earendil-works/*", async () => {
    const seen = new Set<string>();
    const external = new Set<string>();
    const stack = [
      "promotion-core.ts",
    ];

    while (stack.length > 0) {
      const file = stack.pop();
      if (file === undefined || seen.has(file)) continue;
      seen.add(file);
      const source = await readFile(
        resolve(fileURLToPath(new URL("../src/", import.meta.url)), file),
        "utf8",
      );
      for (const specifier of importedFrom(source)) {
        if (specifier.startsWith(".")) {
          const next = `${specifier.slice(2, -3)}.ts`;
          stack.push(next);
          continue;
        }
        if (!specifier.startsWith("node:")) external.add(specifier);
      }
    }

    // 闭包真的被走过了，不是空跑。
    expect(seen.size).toBeGreaterThan(3);
    expect([
      ...external,
    ]).toEqual([]);
  });

  it("核心能直接导入并跑通（不经过任何 Pi 工具注册）", async () => {
    await write(
      `${ARTIFACT_ROOT}/${PROJECT}/semantic-ui-map.yaml`,
      dictionary([
        [
          "chat.a",
          "P1-1",
          SRC,
        ],
      ]),
    );
    await write(SRC, '<div data-semantic-id="chat.a" />');
    const result = await checkPromotion(root, PROJECT);
    expect(result.status).toBe("clean");
    expect(result.matched).toBe(1);
  });
});

describe("会话外入口 bin/check-promotion.mjs", () => {
  it("全命中：输出与工具同源，退出码 0", async () => {
    await write(
      `${ARTIFACT_ROOT}/${PROJECT}/semantic-ui-map.yaml`,
      dictionary([
        [
          "chat.a",
          "P1-1",
          SRC,
        ],
      ]),
    );
    await write(SRC, '<div data-semantic-id="chat.a" />');

    const run = runCli([
      "--project",
      PROJECT,
      "--cwd",
      root,
    ]);
    expect(run.code).toBe(0);

    const result = await checkPromotion(root, PROJECT);
    expect(run.stdout.trimEnd()).toBe(promotionText(result, PROJECT));
  });

  it("有未命中：退出码 1", async () => {
    await write(
      `${ARTIFACT_ROOT}/${PROJECT}/semantic-ui-map.yaml`,
      dictionary([
        [
          "chat.a",
          "P1-1",
          SRC,
        ],
      ]),
    );
    await write(SRC, "<div />");
    const run = runCli([
      "--project",
      PROJECT,
      "--cwd",
      root,
    ]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("已推进但源码里找不到");
  });

  it("字典缺失：退出码 1 且明说未做核对，不得假绿", async () => {
    const run = runCli([
      "--project",
      PROJECT,
      "--cwd",
      root,
    ]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("本次未做核对");
  });

  it("字典读不出来：退出码 1", async () => {
    await write(`${ARTIFACT_ROOT}/${PROJECT}/semantic-ui-map.yaml`, "elements: {}\n");
    const run = runCli([
      "--project",
      PROJECT,
      "--cwd",
      root,
    ]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("本次未做核对");
  });

  it("用法错误与非法 slug：退出码 2", () => {
    expect(runCli([]).code).toBe(2);
    expect(
      runCli([
        "--project",
        PROJECT,
        "--bogus",
        "x",
      ]).code,
    ).toBe(2);
    expect(
      runCli([
        "--project",
        PROJECT,
        "--page",
      ]).code,
    ).toBe(2);
    expect(
      runCli([
        "--project",
        "../escape",
      ]).code,
    ).toBe(2);
  });

  it("--help：退出码 0", () => {
    const run = runCli([
      "--help",
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("--project");
  });

  it("只读：跑前跑后字典与源码逐字节相同", async () => {
    await write(
      `${ARTIFACT_ROOT}/${PROJECT}/semantic-ui-map.yaml`,
      dictionary([
        [
          "chat.a",
          "P1-1",
          SRC,
        ],
        [
          "chat.b",
          "P1-2",
          SRC,
        ],
      ]),
    );
    await write(
      SRC,
      '<div data-semantic-id="chat.a" />\n<Link data-semantic-id={T[v]} />',
    );

    const mapPath = join(root, ARTIFACT_ROOT, PROJECT, "semantic-ui-map.yaml");
    const sourcePath = join(root, SRC);
    const beforeMap = await readFile(mapPath, "utf8");
    const beforeSource = await readFile(sourcePath, "utf8");

    expect(
      runCli([
        "--project",
        PROJECT,
        "--cwd",
        root,
      ]).code,
    ).toBe(1);

    expect(await readFile(mapPath, "utf8")).toBe(beforeMap);
    expect(await readFile(sourcePath, "utf8")).toBe(beforeSource);
  });
});
