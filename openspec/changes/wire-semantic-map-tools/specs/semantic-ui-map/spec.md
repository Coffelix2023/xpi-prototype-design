## MODIFIED Requirements

### Requirement: 字典校验工具

系统 SHALL 提供校验工具 `semantic_ui_map_validate(project)`，检查 ID 冲突、alias 重复、引用完整性（parent/children 循环）、状态机合法性与 `fidelities` 路径格式合法性。该工具 MUST 注册为 Agent 可在运行时直接调用的工具，返回结构化的问题码列表（`code` + 元素路径 + 说明），使 Agent 不必自行读取和解析 YAML 原文。

#### Scenario: 运行时调用

- **WHEN** Agent 需要确认字典是否自洽
- **THEN** 它 MUST 能直接调用该工具并得到问题码列表，调用不写盘、不改动字典

#### Scenario: ID 冲突检测

- **WHEN** 字典中两个元素的 `id` 或 `short` 相同
- **THEN** 校验 MUST 失败并报告冲突的元素路径

#### Scenario: 循环引用检测

- **WHEN** 元素 A 的 `parent` 为 B，B 的 `parent` 为 A
- **THEN** 校验 MUST 失败并报告循环引用

#### Scenario: 状态转换合法性

- **WHEN** 元素状态从 `confirmed` 回退到 `proposed`
- **THEN** 校验 MUST 失败并报告非法状态转换

#### Scenario: fidelities 只查格式不查文件存在

- **WHEN** 元素的 `fidelities` 指向一个尚未产出的 HTML 路径
- **THEN** 校验 MUST 不因此报错——草稿阶段允许锚点先于文件存在，只校验路径格式与 `meta.type` 是否相符

#### Scenario: 字典缺失时校验工具的行为

- **WHEN** 项目目录没有 `semantic-ui-map.yaml`
- **THEN** 工具 MUST 报告字典缺失并显式说明「未做校验」，不得返回空问题码列表冒充校验通过

### Requirement: 解析器工具

系统 SHALL 提供解析器工具 `semantic_ui_map_parse`，接受 `project`、`input`（短码、全路径或中文别名）以及可选的页面上下文，返回 `{ matched: true, element }`、`{ matched: false, candidates: [...] }` 或 `{ matched: false, status: 'unregistered' }` 三者之一。该工具 MUST 注册为 Agent 可在运行时直接调用的工具。

#### Scenario: 短码直接解析

- **WHEN** 输入为 `P1-2-B1`
- **THEN** 解析器 MUST 返回该短码对应的完整元素信息（`id`、`short`、`status`、`type`、`fidelities`）

#### Scenario: 全路径解析

- **WHEN** 输入为 `chat.composer.send-btn`
- **THEN** 解析器 MUST 返回该全路径对应的完整元素信息

#### Scenario: 上下文消歧

- **WHEN** 输入为 "按钮" 且提供页面上下文 `chat`
- **THEN** 解析器 MUST 只在 `chat` 页面内搜索匹配

#### Scenario: 多候选不得静默选一个

- **WHEN** 输入匹配到多个元素且没有提供上下文
- **THEN** 解析器 MUST 返回候选列表并要求用户用短码或上下文消歧，不得自行挑一个返回

## ADDED Requirements

### Requirement: 字典维护责任与标注时机

字典的 `elements` 由 Agent 维护：`prototype_setup` 只建空骨架，`prototype_snapshot` 只递增 `meta.version`，两者都不登记元素。Agent 在需求深挖完成后 MUST 按 schema 登记页面与元素，并在产出 HTML 之后、交付之前调用标注工具，使字典与实际产物一致。

#### Scenario: 深挖后登记元素

- **WHEN** 需求深挖完成、开始产出
- **THEN** Agent MUST 已在 `semantic-ui-map.yaml` 里登记本次涉及的页面（`pages`）与可修改元素（`elements`），每个元素带 `id`、`short`、`label`、`type`、`status`、`stage_created`、`fidelities`

#### Scenario: 交付时给出短码

- **WHEN** Agent 完成一轮产出并向用户交付
- **THEN** Agent MUST 把本轮可修改元素的短码一并告知用户，使用户可以用「改 `P1-2-B3`」这类口语引用元素

#### Scenario: id 必须能被标注工具命中

- **WHEN** Agent 为某个已登记元素写 HTML
- **THEN** 该元素的 HTML `id` MUST 等于它在字典里的短码或全路径，否则标注工具不会为它加上徽标

#### Scenario: id 与短码跨保真度不变

- **WHEN** 同一元素从 wireframe 推进到 hifi
- **THEN** 它的 `id` 与 `short` MUST 保持不变，只有 `fidelities.wireframe` 与 `fidelities.hifi` 指向不同产物

#### Scenario: props 契约的遵守与越界声明

- **WHEN** Agent 需要修改元素的某个属性
- **THEN** 若该属性在 `props` 里声明，Agent MUST 只改其 `current` 值且不重写 HTML 结构；若不在契约内（例如新增 class），Agent MUST 先向用户声明「该修改超出契约范围，将改动组件结构」再动手
