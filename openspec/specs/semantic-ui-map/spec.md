## Purpose

为原型设计的 vibe-coding 流程提供语义元素字典，通过稳定的双码标识（短码 + 全路径）和可视化徽标让 Agent 精准定位修改目标，消除描述歧义，支持跨保真度 ID 不变和状态机治理。

## Requirements

### Requirement: 双码标识系统

系统 SHALL 为每个可修改元素分配稳定的双码标识：短码（页面内唯一，格式 `P{页码}-{面板}-{元素}`，分隔符用 `-`）和全路径（全局唯一，格式 `{page}.{panel}.{element}`，分隔符用 `.`）。短码供用户口语引用，全路径供机器处理。

#### Scenario: 短码格式校验

- **WHEN** 系统生成或校验短码
- **THEN** 短码 MUST 匹配正则 `^P\d+(-\d+)*(-[A-Z]\d+)?$`（例：`P1-2-B3`）

#### Scenario: 全路径格式校验

- **WHEN** 系统生成或校验全路径
- **THEN** 全路径 MUST 匹配正则 `^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$`（kebab-case，用 `.` 分层）

#### Scenario: 双码映射唯一性

- **WHEN** 字典加载完成
- **THEN** 任意一个短码或全路径 MUST 对应唯一元素，不允许重复

### Requirement: 语义字典存储

系统 SHALL 在项目根的 `.pi/prototype-design/<project>/semantic-ui-map.yaml` 维护一个跨保真度共享的 YAML 字典，包含元数据（version、project、type、updated、annotate_default）、页面索引（pages）和元素注册表（elements）。

#### Scenario: 字典文件位置

- **WHEN** 原型项目初始化（`prototype_setup`）
- **THEN** 系统 MUST 在 `<project>/semantic-ui-map.yaml` 创建空骨架或保留现有文件

#### Scenario: 跨 kind 共享

- **WHEN** 同一元素在 wireframe 和 hifi 阶段
- **THEN** 其 `id` 和 `short` 字段 MUST 不变，只有 `fidelities.wireframe` 和 `fidelities.hifi` 指向不同产物

#### Scenario: 版本递增

- **WHEN** 调用 `prototype_snapshot` 创建快照
- **THEN** 系统 MUST 递增 `meta.version` 并更新 `meta.updated` 时间戳

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

### Requirement: 中文别名匹配

系统 SHALL 支持通过 `label` 和 `aliases` 数组中的中文名称查找元素，返回匹配的元素列表（唯一匹配 / 多个候选 / 未匹配）。

#### Scenario: 唯一匹配

- **WHEN** 用户输入 "发送按钮" 且字典中只有一个元素的 label 或 aliases 包含该文本
- **THEN** 解析器 MUST 返回该元素的完整信息（id、short、status、type、fidelities）

#### Scenario: 多候选匹配

- **WHEN** 用户输入 "折叠按钮" 且字典中有多个元素匹配
- **THEN** 解析器 MUST 返回候选列表并要求用户用短码或上下文消歧

#### Scenario: 未匹配

- **WHEN** 用户输入的文本在字典中无任何匹配
- **THEN** 解析器 MUST 返回 `unregistered` 状态，不得静默猜测

### Requirement: HTML 徽标渲染系统

生成的 HTML 原型 SHALL 嵌入徽标渲染系统：每个注册元素添加 `data-semantic-badge` 和 `data-status` 属性，通过 `::before` 伪元素显示短码徽标，用 CSS 变量 `--badge-display` 控制显示/隐藏，提供开关按钮切换。

#### Scenario: 徽标属性嵌入

- **WHEN** 系统生成 HTML 元素（如 `<button id="P1-2-B1">`）
- **THEN** 元素 MUST 包含 `data-semantic-badge="P1-2-B1"` 和 `data-status="confirmed"`

#### Scenario: 徽标显示开关

- **WHEN** 用户点击右上角 "🏷️ 语义标注 ON" 按钮
- **THEN** 系统 MUST 切换 `--badge-display` 变量为 `none`，徽标消失；再次点击恢复 `block`

#### Scenario: 状态颜色区分

- **WHEN** 徽标渲染
- **THEN** 系统 MUST 根据 `data-status` 应用颜色：`proposed` 橙色、`confirmed` 蓝色、`locked` 灰色

#### Scenario: 类型颜色可选

- **WHEN** 元素有 `data-type="panel"` 属性
- **THEN** 徽标 MAY 使用紫色覆盖默认颜色（面板类型特殊标识）

### Requirement: SPA 和多页面模式支持

系统 SHALL 支持两种原型模式：SPA（单 HTML 文件，客户端路由，pages.route 格式 `#/chat`）和多页面（多 HTML 文件，pages.route 格式 `pricing.html`）。模式在 `meta.type` 声明（`spa | multi-page`）。

#### Scenario: SPA 模式元素定位

- **WHEN** `meta.type: spa` 且用户切换到 `#/agents` 路由
- **THEN** 只有 `parent` 为 `agents` 的元素徽标 MUST 可见，其他页面元素隐藏

#### Scenario: 多页面模式锚点

- **WHEN** `meta.type: multi-page` 且元素 fidelities 为 `wireframe/current/pricing.html#P2-1`
- **THEN** 预览 pricing.html 时该元素锚点 MUST 可跳转

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
### Requirement: props 契约

元素的 `props` 字段 SHALL 明确声明可修改属性（type、values、current），Agent 修改前 MUST 检查是否在契约内。契约内修改只改属性，契约外修改需说明 "将改动组件结构"。

#### Scenario: 契约内修改

- **WHEN** 元素 `props.disabled: { type: boolean, current: false }` 且 Agent 修改为 `true`
- **THEN** 系统 MUST 更新 `current` 值且不重写 HTML 结构

#### Scenario: 契约外修改警告

- **WHEN** Agent 尝试修改未在 `props` 声明的属性（如添加新 class）
- **THEN** 系统 MUST 提示 "该修改超出契约范围，将改动组件结构"

### Requirement: 优雅降级

系统 SHALL 在缺少 `semantic-ui-map.yaml` 时仍可正常预览 HTML，徽标系统不渲染但不报错。已有快照（`vN/`）不受影响。

#### Scenario: 无字典文件降级

- **WHEN** 项目目录缺少 `semantic-ui-map.yaml`
- **THEN** HTML 预览 MUST 正常显示，徽标开关按钮不出现或显示 "无字典"

#### Scenario: 历史快照兼容

- **WHEN** 已存在的 `vN/` 快照没有嵌入 `data-semantic-badge`
- **THEN** 预览 MUST 正常显示原内容，不尝试注入徽标

### Requirement: 工具集成

系统 SHALL 扩展 `prototype_setup` 在初始化时创建空字典骨架，扩展 `prototype_snapshot` 在快照时递增 `meta.version`。

#### Scenario: 初始化创建骨架

- **WHEN** 调用 `prototype_setup({ project: 'my-app', kind: 'wireframe' })`
- **THEN** 系统 MUST 创建 `my-app/semantic-ui-map.yaml` 包含 `meta.version: 1` 和空 `pages`/`elements`

#### Scenario: 快照更新版本

- **WHEN** 调用 `prototype_snapshot` 且当前 `meta.version: 3`
- **THEN** 快照完成后 `meta.version` MUST 递增为 `4`，`meta.updated` MUST 更新为当前时间戳

### Requirement: 不引入重型依赖

系统 SHALL 使用纯 Node.js 实现，不引入 Semantica runtime、Python 依赖、Knowledge Graph、OWL/RDF、向量检索或独立语义索引服务。

#### Scenario: 依赖检查

- **WHEN** 运行 `pnpm list` 检查依赖树
- **THEN** `semantic-ui-map` 相关代码 MUST 不引入 package.json 之外的新依赖

#### Scenario: YAML 解析

- **WHEN** 系统加载 `semantic-ui-map.yaml`
- **THEN** MUST 使用 Node.js 内置或现有 peerDependencies 的 YAML 解析器（无新增依赖）

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
