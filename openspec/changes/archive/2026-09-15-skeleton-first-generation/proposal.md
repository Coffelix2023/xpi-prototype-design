## Why

当前 xpi-prototype-design 在生成原型 HTML 时，Agent 倾向于一次性输出完整文件（可能 500-1000+ 行）。这导致三个问题：

1. **工具调用超限**：单次 `write` 输出过长触发 Pi 工具限制，生成中断
2. **AI 失忆与幻觉**：写到中段时失去对开头定义的变量名、结构的认知，产生语法错误、标签不闭合
3. **难以修改**：后续迭代时，Agent 需要回读整个长文件才能定位修改点，严重挤压上下文预算

业界最佳实践（Devin、SWE-agent）证明：骨架优先 (Skeleton First) + 增量构建 (Incremental Build) 是解决 LLM 长代码生成失控的核心策略。

## What Changes

- 在 `skills/xpi-prototype-design/SKILL.md` §7 产出章节新增"生成策略"小节，规定骨架优先原则与复杂度红线
- 更新 §5.2 执行腿的任务拆分示例，从"按页面/屏幕拆"改为"按构建阶段拆"（骨架 → CSS tokens → 区块填充 → 交互脚本）
- 增加工具选择规则：骨架用 `write`，填充用 `replace`/`insert`，禁止为小改动而重写整文件
- 增加豁免说明：纯声明式 HTML 模板不强制拆分，但 CSS 嵌套 > 3 层、JS 函数 > 50 行仍需拆分

最终产物仍为单文件自包含 HTML，只是生成过程变为增量构建。

## Capabilities

### New Capabilities
<!-- 这是对现有流程的改进，不引入新能力 -->

### Modified Capabilities
- `prototype-generation-strategy`: 修改原型生成的任务拆分与工具使用策略，从"单步完整输出"改为"骨架优先 + 分块填充"

## Impact

**受影响文件**：
- `skills/xpi-prototype-design/SKILL.md`（主要改动）
- `src/templates.ts` 的 `tasksTemplate` 函数（可能需要更新默认任务模板，视 design 决定）

**受益**：
- Agent 每次生成单元 ≤ 200 行，避免工具调用超限
- 骨架先行建立全局认知地图，消除失忆与幻觉
- 增量修改提高精准度，降低错位风险
- 生成失败时只需重跑单个任务，不必从头再来

**风险**：
- 任务清单变长（但每个任务更清晰、更小）
- Agent 需要理解"骨架"的最小完整标准（design 阶段明确定义）

**不影响**：
- 用户侧的命令入口（`/xpi-prototype-design`）
- 最终产物形态（仍为单文件自包含 HTML）
- 深挖需求流程（§5 三轮提问）
- 闸门确认机制（§5.1 `prototype_gate`）
