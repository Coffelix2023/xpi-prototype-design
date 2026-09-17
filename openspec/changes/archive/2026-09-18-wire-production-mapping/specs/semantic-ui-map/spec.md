## MODIFIED Requirements

### Requirement: 元素字段结构

每个元素条目 SHALL 包含 `id`（全路径）、`short`（短码）、`label`（中文名）、`type`（类型枚举）、`status`（状态机枚举）、`stage_created`（诞生阶段）、`parent`（父级 id）、`fidelities`（锚点映射）、可选的 `props`（可修改契约）、`behavior`（当前行为）、`i18n_key`、`children`（子元素列表），以及可选的 `impl`（生产实现映射）。

`impl` 回答「这个原型元素推进到生产代码后落在哪」，只在元素**已推进生产**时存在：缺失表示尚未推进，不是一个待补的空字段。它 MUST 包含 `path`（生产源码路径，相对项目根解析），并 MAY 包含 `export`（导出的组件或函数名）与 `promoted_at`（推进日期）。写入 `impl` MUST NOT 改变元素的 `id` 与 `short`——它们是跨阶段、跨实现的稳定身份。

`fidelities` 的键仍然是闭集 `wireframe | hifi`，生产实现不写在这里。

#### Scenario: 必填字段校验

- **WHEN** 系统校验元素条目
- **THEN** 条目 MUST 包含 `id`、`short`、`label`、`type`、`status`、`stage_created`、`fidelities`

#### Scenario: 类型枚举

- **WHEN** 元素 `type` 字段赋值
- **THEN** 值 MUST 属于枚举：`page | panel | section | button | input | select | toggle | link | text | image | table | list | component | modal | drawer`

#### Scenario: 状态机枚举

- **WHEN** 元素 `status` 字段赋值
- **THEN** 值 MUST 属于枚举：`proposed | confirmed | locked`，且状态转换 MUST 单向（proposed → confirmed → locked）

#### Scenario: 未推进生产的元素不报错

- **WHEN** 某个元素条目没有 `impl` 段
- **THEN** 校验 MUST 不因此报错——缺失表示该元素尚未推进生产，是正常状态

#### Scenario: 推进生产不改变元素身份

- **WHEN** 一个元素被写入 `impl` 表示已推进生产
- **THEN** 它的 `id` 与 `short` MUST 与推进前完全一致，使用户此前用短码说的「改 `P1-2-B3`」继续有效

### Requirement: 字典校验工具

系统 SHALL 提供校验工具 `semantic_ui_map_validate(project)`，检查 ID 冲突、alias 重复、引用完整性（parent/children 循环）、状态机合法性、`fidelities` 路径格式合法性、`fidelities` 键闭集合法性，以及 `impl` 路径格式合法性。该工具 MUST 注册为 Agent 可在运行时直接调用的工具，返回结构化的问题码列表（`code` + 元素路径 + 说明），使 Agent 不必自行读取和解析 YAML 原文。

校验 MUST NOT 因为某个字段不是工具认识的字段就静默通过：任何在加载阶段被丢弃的键，MUST 变成一条问题码。工具的绿灯只在「字典里写下的每一项都被读过并判定过」时给出。

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

#### Scenario: fidelities 出现闭集外的键必须报错

- **WHEN** 元素的 `fidelities` 里出现 `wireframe` / `hifi` 之外的键（例如 `production`）
- **THEN** 校验 MUST 失败并指出该键与其元素路径，提示生产实现写在 `impl` 段；校验 MUST NOT 静默丢弃该键后报告通过

#### Scenario: impl 路径格式校验

- **WHEN** 元素的 `impl` 缺少 `path`，或 `path` 不是相对项目根的源码路径（例如是绝对路径或含 `..` 越界）
- **THEN** 校验 MUST 失败并指出该元素，使写错的登记不会留在字典里

#### Scenario: impl 只查格式不查文件存在

- **WHEN** 元素的 `impl.path` 指向一个尚未创建或不存在的源码文件
- **THEN** 校验 MUST 不因此报错——与 `fidelities` 同一条纪律：允许实现路径先于文件登记

#### Scenario: 字典缺失时校验工具的行为

- **WHEN** 项目目录没有 `semantic-ui-map.yaml`
- **THEN** 工具 MUST 报告字典缺失并显式说明「未做校验」，不得返回空问题码列表冒充校验通过

### Requirement: 解析器工具

系统 SHALL 提供解析器工具 `semantic_ui_map_parse`，接受 `project`、`input`（短码、全路径或中文别名）以及可选的页面上下文，返回 `{ matched: true, element }`、`{ matched: false, candidates: [...] }` 或 `{ matched: false, status: 'unregistered' }` 三者之一。该工具 MUST 注册为 Agent 可在运行时直接调用的工具。元素若已登记 `impl`，命中时返回的信息 MUST 包含它，使 Agent 能从元素身份直接走到生产源码位置，而不必另行读取字典原文。

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

#### Scenario: 已推进生产的元素返回生产落点

- **WHEN** 命中的元素登记了 `impl`
- **THEN** 返回的元素信息 MUST 包含 `impl`（至少含 `path`），使 Agent 能据此定位生产源码

#### Scenario: 未推进生产的元素不伪造落点

- **WHEN** 命中的元素没有 `impl`
- **THEN** 返回的元素信息 MUST 表明它没有生产落点，MUST NOT 用一个猜测的路径或空串顶上
