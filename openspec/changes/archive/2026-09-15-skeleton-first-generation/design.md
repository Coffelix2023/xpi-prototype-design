## Context

当前 xpi-prototype-design 生成原型 HTML 时，Agent 倾向于一次性生成完整文件。问题根源：

1. **LLM 注意力衰减**：生成超过 500 行时，Agent 在中段失去对开头定义的变量名、结构的认知
2. **工具输出限制**：Pi 的 `write` 工具对单次输出有上限，超长生成会中断
3. **Diff 匹配失败**：后续修改时，`replace` 在长文件中难以找到唯一锚点，导致修改失败
4. **上下文挤压**：回读长文件严重消耗 token，影响业务逻辑推理

现有约束：
- 最终产物必须为单文件自包含 HTML（§2.7 无构建规则）
- 必须维护 `current/` 工作副本与 `vN/` 快照版本链（§2.3）
- 已有闸门机制（§5.1 `prototype_gate`）控制写入授权
- 已有任务清单机制（`tasks.md`）驱动执行腿（§5.2）

See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- 定义骨架优先 + 增量构建的生成策略，控制单次工具调用输出 ≤ 200 行
- 建立骨架完整性标准与分块填充规则
- 明确工具选择约束（`write` vs `replace` vs `insert`）
- 保持最终产物仍为单文件自包含 HTML

**Non-Goals:**
- 不改变用户侧命令入口（仍为 `/xpi-prototype-design`）
- 不改变闸门确认机制（§5.1）
- 不引入构建步骤或外部依赖
- 不改变快照与版本回滚机制（§8）

## Decisions

### Decision 1: 任务拆分从"按页面/屏幕"改为"按构建阶段"

**选择**：`tasks.md` 任务序列按骨架 → CSS tokens → 语义区块 → 交互脚本的阶段拆分，而非按页面拆分。

**理由**：
- 骨架先行建立全局认知地图，Agent 后续填充时始终知道整体结构
- 每个阶段的产出有明确边界（一个 `<style>` 标签、一个 `<header>` 区块），验收标准可观察
- 失败时只需重跑单个阶段，而非重新生成整个页面

**Alternatives considered**:
- **按页面拆分**（现状）：每个任务 "生成首页完整 HTML"，单次输出过大，容易失控
- **按技术层拆分**（HTML / CSS / JS 分离）：违反"单文件自包含"约束，且引入拼装复杂度

**Trade-off**：任务清单变长（从 3-5 个任务变为 8-12 个），但每个任务更小、更清晰，验证更容易。

### Decision 2: 骨架阶段用 `write`，填充阶段用 `replace`/`insert`

**选择**：
- 骨架创建：`write` 创建包含完整 HTML 结构、空 `<style>`/`<script>` 标签、语义区块占位符的文件
- 内容填充：`replace` 精准替换占位符内容，禁止为小改动而 `read` + `write` 整文件

**理由**：
- `write` 语义清晰（创建新文件），适合初始化
- `replace` 避免全文件读写，减少上下文消耗，且锚点匹配更精准
- 已有工具能力支持（Pi 原生 `write`/`replace`/`insert`）

**Alternatives considered**:
- **全程用 `write`**：每次重写整文件，上下文消耗大，且容易因内容漂移导致后续 `replace` 失败
- **引入模板引擎或拼装脚本**：增加复杂度，违反"无构建"约束

### Decision 3: 骨架完整性标准

**选择**：骨架阶段必须产出：
1. 合法的 `<!DOCTYPE html>` + 完整 `<head>` + 闭合 `<body>`
2. 空 `<style>/* tokens */</style>` 与 `<script>// interactions</script>` 标签
3. 所有目标语义区块（`<header>`, `<main>`, `<footer>`）的占位标签，带 `data-block` 属性

**理由**：
- 提供足够的锚点供后续 `replace` 精准匹配
- 验证骨架合法性（HTML 能被浏览器正常解析）
- Agent 在填充时有明确的全局结构认知

**Alternatives considered**:
- **最小骨架**（只有 `<html><head></head><body></body></html>`）：后续填充时缺乏结构指引，Agent 仍可能失忆
- **详细骨架**（包含所有子元素占位符）：骨架阶段本身可能超 200 行，违反复杂度控制目标

### Decision 4: 复杂度豁免规则

**选择**：
- 纯声明式 HTML 模板（表单、数据表格）结构平坦时，可单次生成超 200 行
- CSS 嵌套 > 3 层、JS 函数 > 50 行，即使总行数未超 200 也必须拆分
- SVG 图标定义不计入复杂度红线，但需放在独立 `<defs>` 区块

**理由**：
- 长但平坦的声明式内容不增加认知负载，Agent 不易失忆
- 深层嵌套与长函数是结构性复杂度，易导致括号不闭合、逻辑错乱

**Alternatives considered**:
- **硬性物理行数限制**（架构师警告的反模式）：会导致 Agent 为满足行数而写出晦涩的"高尔夫代码"
- **无豁免规则**：过度拆分导致"微服务地狱"，项目结构碎片化

### Decision 5: 在 SKILL.md §7 产出章节增加"生成策略"小节

**选择**：在 `skills/xpi-prototype-design/SKILL.md` 的 §7 产出章节新增"生成策略"小节，明确骨架优先原则、复杂度红线、工具选择规则。

**理由**：
- §7 是产出规范的自然位置，Agent 在生成前会参考这一节
- 与 §5.2 执行腿的任务拆分示例形成呼应

**Alternatives considered**:
- **写进 §2 硬规则**：规则章节已有 8 条，再加生成策略会过长
- **独立创建 §10 章节**：割裂了产出规范的连贯性

### Decision 6: 更新 §5.2 执行腿的任务拆分示例

**选择**：在 §5.2 中补充一个完整的"按构建阶段拆分"任务序列示例，取代现有的"一屏一任务"示例。

**理由**：
- 执行腿是 Agent 读 `tasks.md` 并产出的关键流程，示例直接影响行为
- 明确的示例比抽象规则更有指导性

### Decision 7: 不修改 `src/templates.ts` 的 `tasksTemplate` 函数

**选择**：不在本 change 中修改 `tasksTemplate`，保持其为空模板，由 Agent 根据 SKILL.md 指引生成具体任务。

**理由**：
- `tasksTemplate` 只提供骨架（任务行格式），不预填具体任务
- 真实任务内容由 Agent 根据 `plan.md` 与设计技能输出决定，硬编码模板会限制灵活性
- 若未来需要预填示例任务，可在后续 change 中单独处理

**Trade-off**：初期 Agent 可能需要几轮才能形成稳定的任务拆分模式，但这比硬编码模板更灵活。

## Risks / Trade-offs

### Risk 1: 任务清单变长，用户感知"步骤变多"
- **Mitigation**: 每个任务有明确验收标准与产出路径，用户能清晰看到进展；且每个任务更小，失败时定位更容易

### Risk 2: Agent 误判"骨架完整性"，产出不合法的骨架
- **Mitigation**: 在 spec 与 SKILL.md 中明确骨架验收标准（`<!DOCTYPE>`、闭合标签、语义区块占位符）；执行腿第一步验证骨架合法性

### Risk 3: 纯声明式内容的"豁免"判断不一致
- **Mitigation**: 在 SKILL.md 中给出具体示例（表单、数据表格属于豁免，深层嵌套 CSS/长函数不豁免），并在 spec 的 scenario 中明确测试条件

### Risk 4: 现有项目的 `tasks.md` 仍按旧模式（按页面拆分）
- **Mitigation**: 本 change 只影响新生成的任务清单；现有项目执行时，Agent 按已有 `tasks.md` 推进，不强制重写；迭代时 Agent 会应用新策略

### Risk 5: `replace` 锚点在复杂 HTML 中仍可能匹配失败
- **Mitigation**: 骨架阶段为每个区块添加 `data-block` 属性作为唯一标识；SKILL.md 强调"精准锚点"原则（包含足够上下文确保唯一性）

## Migration Plan

1. **部署**：合并到 main 分支后，下一次用户调用 `/xpi-prototype-design` 时 Agent 自动读取新版 SKILL.md
2. **向后兼容**：现有项目的 `tasks.md` 不受影响，Agent 按已有任务推进；只有新生成的任务清单会应用新策略
3. **验证**：在测试项目中运行 wireframe 与 hifi 流程，观察任务拆分是否符合预期，单次输出是否控制在 200 行以内
4. **Rollback**：若新策略导致生成失败率上升，可通过 git revert 回退 SKILL.md 改动

**No data migration needed** - 这是生成策略改进，不涉及已有产物的数据结构变更。
