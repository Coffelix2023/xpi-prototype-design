## Why

原型元素推进到生产代码后，字典里没有任何字段能被扩展读懂：`power-dream-harness` 已按 `docs/prototype-to-production.md` §3 手写 13 条 `fidelities.production` 映射，但 `toFidelities` 只读 `wireframe` / `hifi` 两个键，该值被静默丢弃；`validateFidelityPaths` 只遍历这两态，于是 `semantic_ui_map_validate` 返回 `valid`——**字典说得出生产实现，工具却看不见**。结果是「原型 → 成品」这座桥的扩展侧三个环节（加载 / 校验 / 解析返回）全断，`valid` 变成假绿灯。

## What Changes

- 元素条目新增可选 `impl` 段，承载「该元素的生产实现落在哪」：`path`（必需）、`export`（可选）、`promoted_at`（可选）。
- **BREAKING**：`fidelities` 出现闭集外的键时，由当前静默丢弃改为报校验问题码。`power-dream-harness` 现有 13 条 `fidelities.production` 会因此从 `valid` 变为 `invalid`，需迁移到 `impl` 段。这是刻意的：静默丢弃让「字典已登记生产映射」与「字典没有生产映射」在工具输出里长得一样。
- `semantic_ui_map_parse` 的元素摘要带出 `impl`，使 `parse` → `anchor_grep` → `replace` 这条定位链路能真的走到生产源码，而不是停在元素身份。
- `semantic_ui_map_validate` 增加 `impl` 路径格式校验；`impl.path` 缺失或格式非法时报问题码。不做文件存在性检查（与 `fidelities` 同一条纪律：草稿阶段允许实现后于登记）。
- SKILL §8.5 补生产映射纪律：生产组件用全路径写 `data-semantic-id`；`impl` 缺失等于「还没推进生产」；只有 `status: locked` 才推进；推进不得改 `id` / `short`。
- `docs/semantic-ui-map-schema.md` 补 `impl` 字段真相与新问题码。

## Capabilities

### New Capabilities

无。本次不引入新能力，只扩既有字典能力的一个维度。

### Modified Capabilities

- `semantic-ui-map`：三处 requirement 变更——「元素字段结构」新增 `impl`；「字典校验工具」新增 `impl` 格式校验与未知键报错；「解析器工具」要求返回生产落点。文档 §2.1 的 `data-semantic-id` 契约与 §3 的三条纪律作为行为约束写入 SKILL，不新增代码路径。

## Impact

- **代码**：`src/semantic-ui-map.ts`（`SemanticElement` 类型、`toElement`、`toFidelities` 未知键处理、`ValidationErrorCode` 闭集、`validateFidelityPaths` 与新校验函数）、`src/semantic-tools.ts`（`ElementSummary` 与文案）。
- **文档（`AGENTS.md` §6 四处同步纪律）**：`docs/semantic-ui-map-schema.md`（§5 字段表、§6 fidelities、§9 问题码、新 `impl` 一节）、`skills/xpi-prototype-design/SKILL.md` §8.5、`README.md` / `README.zh-CN.md` 的工具表与三步用法、`AGENTS.md` §6 决策表。
- **消费方（本仓外）**：`power-dream-harness` 的 13 条 `fidelities.production` 需迁移为 `impl`；其生产源码需按 §2.1 给元素补 `data-semantic-id` 才能从文件级定位提升到行级。本 change 不含该仓的改动。
- **不新增依赖**；`src/gate.ts` 不变（新校验仍在只读路径，不写盘）。
- **明确不做**：`impl` 数组（一个元素多处实现尚未出现真实用例）；`impl.anchor` 选择器字段（会把已存在的脆弱定位手法固化进 schema）；`next.config` 的 `reactRemoveProperties`、一致性 check 脚本、Git 约定（均属目标项目，见 `docs/prototype-to-production.md` §2.2 / §4 / §7）。
