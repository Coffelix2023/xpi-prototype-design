# prototype-generation-strategy Specification

## Purpose

定义原型 HTML 文件的生成策略，通过骨架优先与增量构建控制单次输出复杂度，避免工具调用超限和 AI 失忆。

## Requirements

### Requirement: Skeleton-first generation
生成任何预计超过 200 行的 HTML 文件时，系统 SHALL 首先输出完整骨架（结构 + 占位符），然后分块填充内容。

#### Scenario: Large file generation
- **WHEN** Agent 需要生成一个预计 500+ 行的高保真页面
- **THEN** 系统 SHALL 先用 `write` 创建包含完整 HTML 结构、空 `<style>`/`<script>` 标签和语义区块占位符的骨架文件
- **THEN** 系统 SHALL 随后用 `replace` 或 `insert` 逐块填充 CSS tokens、各区块内容和交互脚本

#### Scenario: Skeleton completeness validation
- **WHEN** 骨架阶段完成
- **THEN** 文件 SHALL 包含合法的 `<!DOCTYPE html>`、完整的 `<head>`、闭合的 `<body>`，以及所有目标语义区块（如 `<header>`、`<main>`、`<footer>`）的占位标签

### Requirement: Chunked content filling
骨架完成后的内容填充 SHALL 按构建阶段拆分为独立任务，每个任务的单次输出不得超过 200 行。

#### Scenario: CSS tokens filling
- **WHEN** 填充 CSS tokens 与全局样式
- **THEN** 系统 SHALL 用 `replace` 工具替换 `<style>` 标签内容，单次输出不超过 200 行
- **THEN** 若 CSS 内容预计超过 200 行，SHALL 拆分为多个 `replace` 调用（如先填充 tokens，再填充组件样式）

#### Scenario: Semantic block filling
- **WHEN** 填充单个语义区块（如 `<header>`）的 HTML 内容
- **THEN** 系统 SHALL 用 `replace` 工具替换该区块的占位内容，单次输出不超过 200 行
- **THEN** 若单个区块预计超过 200 行，SHALL 进一步拆分为子区块任务

#### Scenario: Script filling
- **WHEN** 填充交互脚本
- **THEN** 系统 SHALL 用 `replace` 工具替换 `<script>` 标签内容，单次输出不超过 200 行
- **THEN** 若脚本预计超过 200 行，SHALL 按功能模块拆分（如主题切换、语言切换、状态持久化）

### Requirement: Tool selection constraints
系统 SHALL 根据操作类型选择正确的文件工具，避免不必要的全文件读写。

#### Scenario: Skeleton creation
- **WHEN** 创建骨架文件
- **THEN** 系统 SHALL 使用 `write` 工具创建新文件

#### Scenario: Content filling
- **WHEN** 填充骨架中的占位符或空标签
- **THEN** 系统 SHALL 使用 `replace` 工具进行精准替换，而非用 `write` 重写整个文件

#### Scenario: Incremental addition
- **WHEN** 在已有内容后追加新内容（如在 `<style>` 后追加组件样式）
- **THEN** 系统 SHALL 使用 `insert` 工具，指定精确的锚点

#### Scenario: Small modification forbidden full rewrite
- **WHEN** 需要修改文件中的一个小区块（≤ 50 行）
- **THEN** 系统 SHALL NOT 用 `read` 回读整个文件后用 `write` 重写
- **THEN** 系统 SHALL 使用 `replace` 工具仅替换目标区块

### Requirement: Complexity exemptions
系统 SHALL 对纯声明式内容与结构性复杂度进行区分豁免判定。

#### Scenario: Declarative HTML template exemption
- **WHEN** HTML 模板因表单字段多、数据表格长而超过 200 行，但结构平坦、无嵌套逻辑
- **THEN** 系统 MAY 允许单次生成，无需强制拆分

#### Scenario: Complex CSS/JS enforcement
- **WHEN** CSS 选择器嵌套深度 > 3 层，或单个 JavaScript 函数 > 50 行
- **THEN** 系统 SHALL 要求拆分，即使总行数未超 200

#### Scenario: SVG icon definitions exemption
- **WHEN** 文件包含大量 SVG 图标定义（在 `<defs>` 或 `<symbol>` 中）
- **THEN** 这些定义 SHALL NOT 计入复杂度红线，但 SHALL 放置在独立的 `<defs>` 区块便于维护

### Requirement: Task planning reflects generation strategy
tasks.md 中的任务拆分 SHALL 按构建阶段组织，而非按页面/屏幕组织。

#### Scenario: Task sequence for one page
- **WHEN** 为一个高保真页面生成 tasks.md
- **THEN** 任务序列 SHALL 包含：
  1. 生成页面骨架（产出：带占位符的完整 HTML 结构）
  2. 填充 CSS tokens 与全局样式（产出：完整的 `<style>` 内容）
  3. 实现各语义区块（每个区块一个任务，产出：填充后的 `<header>`/`<main>`/`<footer>` 等）
  4. 实现交互脚本（产出：完整的 `<script>` 内容）

#### Scenario: Acceptance criteria per task
- **WHEN** 定义任务的验收标准
- **THEN** 每个任务 SHALL 有明确的可验证产出（如"导航可点击"、"主题切换持久化"），而非模糊描述（如"页面完成"）
