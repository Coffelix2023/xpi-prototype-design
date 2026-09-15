import { defineConfig } from "vitest/config";

/**
 * semantic-ui-map 四个模块的行/分支覆盖率下限。
 *
 * 计划里写了「覆盖率 >80%」这条验收，把它落成配置才有可重复的判据：数字摆在这里，
 * `pnpm coverage` 会自己判。阈值只加在这四个模块上——全仓库门槛会被 preview.ts
 * 这类「只在真机上才跑得到」的文件拖成假红。
 */
const SEMANTIC_COVERAGE_FLOOR = {
  branches: 80,
  functions: 80,
  lines: 80,
  statements: 80,
};

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "src/**/*.test.ts",
      ],
      include: [
        "src/**/*.ts",
      ],
      reporter: [
        "text",
      ],
      thresholds: {
        "src/badge-template.ts": SEMANTIC_COVERAGE_FLOOR,
        "src/semantic-annotate.ts": SEMANTIC_COVERAGE_FLOOR,
        "src/semantic-ui-map-yaml.ts": SEMANTIC_COVERAGE_FLOOR,
        "src/semantic-ui-map.ts": SEMANTIC_COVERAGE_FLOOR,
      },
    },
    // 只测本包源码。`docs/` 下是参考资料（含 vendored 的第三方仓库），它们的测试
    // 依赖 jsdom / React，不在本包 devDependencies 里；收进来只会让 `pnpm test`
    // 永远失败，把真正的回归淹没在噪声里。
    include: [
      "src/**/*.test.ts",
    ],
  },
});
