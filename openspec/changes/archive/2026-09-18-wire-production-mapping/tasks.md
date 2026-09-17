## 1. 加载层：不再静默丢键

- [x] 1.1 `src/semantic-ui-map.ts` 新增 `SemanticUnknownKey { where, key }` 与 `SemanticMap.unknownKeys?`；`toMeta` / `toPages` / `toElement` / `toFidelities` 在归一化时收集闭集外的键，`where` 写成 `meta`、`pages.P1`、`elements.<id>`、`elements.<id>.fidelities`（design D6）。验收：单测断言一份含 `fidelities.production` 与一个拼错键的字典解析后 `unknownKeys` 精确匹配；既有夹具字典的 `unknownKeys` 为 `undefined`
- [x] 1.2 `src/contracts.ts` 的 semantic-ui-map 出口补 `SemanticUnknownKey`（`AGENTS.md` §6 四处同步之一）。验收：`pnpm typecheck` 通过

## 2. 元素层：impl 字段

- [x] 2.1 `src/semantic-ui-map.ts` 新增 `ImplMapping { path, export?, promoted_at? }` 与 `SemanticElement.impl?`；`toElement` 按 design D5 归一化（非映射的 `impl` 收敛为 `path: ""`；非字符串的 `export` / `promoted_at` 视为未提供）。验收：单测覆盖完整 `impl`、缺 `path`、`impl` 写成裸字符串、完全没有 `impl` 四种输入
- [x] 2.2 `src/contracts.ts` 出口补 `ImplMapping`。验收：`pnpm typecheck` 通过

## 3. 校验层：两个新问题码

- [x] 3.1 `ValidationErrorCode` 闭集补 `unknown-key`；`validateSemanticMap` 接入一条把 `map.unknownKeys` 转成 `unknown-key` 的检查，键为 `fidelities.production` 时消息附带「生产实现写在 `impl` 段」的迁移提示（design D2 / D7）。验收：单测断言含 `fidelities.production` 的字典返回 `unknown-key`、`path` 指向元素、消息含迁移提示；无未知键的字典不产生该码
- [x] 3.2 `ValidationErrorCode` 闭集补 `invalid-impl-path`，并新增 `impl` 路径校验：`path` 为空、以 `/` 开头、含 `..` 段、含 `#` 各报一条；`impl` 缺失不报（design D4 / D5）。验收：单测逐条覆盖四种违规与「无 `impl` 不报」
- [x] 3.3 校验器回归：既有六类问题码的用例保持通过，「共 N 条，已显示 M 条」的截断用例仍成立。验收：`pnpm test src/semantic-ui-map.test.ts src/semantic-tools.test.ts` 通过

## 4. 工具层：解析结果带出生产落点

- [x] 4.1 `src/semantic-tools.ts` 的 `ElementSummary` 增加 `impl: ImplMapping | null`，`summarize` 做映射；解析文案在命中且已推进时打印生产落点，未推进时明说「未登记生产落点」（design D8）。验收：单测断言 `details.element.impl` 与工具文案，已推进 / 未推进各一例
- [x] 4.2 只读契约不破：两个工具调用前后字典与当前阶段 `current/**/*.html` 逐字节相同。验收：既有逐字节比对用例通过

## 5. 文档同步

- [x] 5.1 `docs/semantic-ui-map-schema.md`：§5 字段表补 `impl`、§6 补「生产实现不写在这里」、新增 `impl` 小节（字段规则 + D5 约束 + 不查文件存在）、§9 问题码表补 `unknown-key` 与 `invalid-impl-path`、§10 补解析工具返回 `impl`。验收：文档与 `src/semantic-ui-map.ts` 的类型逐字段对得上
- [x] 5.2 `skills/xpi-prototype-design/SKILL.md` §8.5 补生产映射纪律（生产组件用全路径写 `data-semantic-id`；`impl` 缺失 = 未推进生产；`status: locked` 才推进；推进不得改 `id` / `short`）与定位两步法（先 `anchor_grep` 语义 ID，未命中再读 `impl.path` 指向的文件）。§11 完成前自检补一条
- [x] 5.3 `README.md` / `README.zh-CN.md`：工具表与「五步用法」反映解析结果带出生产落点，语义字典一节补 `impl` 的一句话说明
- [x] 5.4 `AGENTS.md` §6 决策表补一行：为什么生产映射独立成 `impl` 而非扩 `fidelities`，以及为什么闭集外的键必须报错

## 6. 最终验证

- [x] 6.1 `pnpm typecheck` 通过
- [x] 6.2 `pnpm -w run lint` 通过
- [x] 6.3 `pnpm test` 通过；`pnpm coverage` 不跌破 `vitest.config.ts` 的四模块下限
- [x] 6.4 `openspec validate --changes wire-production-mapping` 通过
- [x] 6.5 验收样本（只读，不在本 change 内改该仓）：对 `power-dream-harness` 的真实字典跑 `semantic_ui_map_validate`，确认得到 13 条 `unknown-key`（对应它现有的 `fidelities.production`）而不是 `valid`；再对一份迁移后的字典副本确认 `valid`，且 `semantic_ui_map_parse` 命中时返回 `impl`。若不便直接对目标仓运行，用一份等价的字典副本作为夹具完成同一断言
