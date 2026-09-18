## ADDED Requirements

### Requirement: 搬运进度以 impl 为唯一事实来源

元素条目 `impl` 段的存在与否 SHALL 是「该元素是否已推进生产」的唯一事实来源：缺失表示尚未推进，存在表示已推进。系统 MUST NOT 维护第二份搬运清单、进度文件或在别处复制这一状态。

推进 SHALL 对包含边保持完整：当一个元素的 `impl` 存在时，它的 `children` 中每个 `status: locked` 的子元素 MUST 同时拥有 `impl`。子元素不推进的合法表达是**不把它置为 `locked`**，而不是给它一个新增的豁免字段。

#### Scenario: 未推进的元素不是错误

- **WHEN** 一个元素条目没有 `impl` 段
- **THEN** 核对 MUST NOT 把它报为缺失，也不得要求补一个空 `impl`

#### Scenario: 容器推进而应推进的子元素没推进

- **WHEN** 元素的 `impl` 存在，且它的 `children` 中某个子元素为 `status: locked` 但没有 `impl`
- **THEN** 系统 SHALL 报告该子元素为未推进
- **THEN** 报告 SHALL 指明它属于哪个已推进的父元素

#### Scenario: 未冻结的子元素不算漏

- **WHEN** 已推进元素的某个 `children` 条目为 `proposed` 或 `confirmed`
- **THEN** 系统 MUST NOT 把它报为未推进——未 `locked` 表示该子项本就不打算进生产

#### Scenario: 不新增第二份清单

- **WHEN** 需要知道某个页面还有哪些元素没搬进生产
- **THEN** 该信息 MUST 从元素条目的 `impl` 有无得出，MUST NOT 从新建的清单文件、`tasks.md` 任务行或阶段 kind 得出

### Requirement: 核对工具比对字典与生产源码

系统 SHALL 提供一个只读工具，把字典里已登记生产落点的元素与生产源码中的 `data-semantic-id` 比对，并把结果分为四类回报。

源码侧的匹配 MUST 依据 `data-semantic-id` 的**全路径**值（例如 `chat.composer.send-btn`），MUST NOT 依据短码——短码只在页面内唯一，源码是全局的。

四类结果：

| 结果 | 判定 |
| :--- | :--- |
| `matched` | 元素有 `impl`，且 `impl.path` 指向的文件里存在该元素全路径的 `data-semantic-id` |
| `missing_in_source` | 元素有 `impl`，但该文件里找不到它的 `data-semantic-id` |
| `unpromoted_child` | 元素有 `impl`，但它的 `children` 里有 `status: locked` 而缺 `impl` 的子元素 |
| `unregistered_in_map` | 源码里有 `data-semantic-id`，而字典里没有对应的 `id` |

#### Scenario: 已推进且源码就位

- **WHEN** 某个元素有 `impl.path`，且该文件里存在 `data-semantic-id="<该元素全路径>"`
- **THEN** 该元素 MUST 被报为 `matched`

#### Scenario: 已推进但源码里没有

- **WHEN** 某个元素有 `impl.path`，而该文件里找不到它的 `data-semantic-id`
- **THEN** 该元素 MUST 被报为 `missing_in_source`，并带出 `impl.path`
- **THEN** 报告 SHALL NOT 把它与其他三类混在一起计数

#### Scenario: 只搬了容器没搬子项

- **WHEN** 元素的 `impl` 存在，且它的 `children` 里有 `status: locked` 却缺 `impl` 的子元素
- **THEN** 该元素 MUST 被报为 `unpromoted_child`，并逐个列出未推进的子元素 `id`
- **THEN** 这是「`⋯` 菜单触发器搬了、菜单项没搬」的机械可判定形态

#### Scenario: 字典落后于源码

- **WHEN** 生产源码里存在某个 `data-semantic-id`，而字典里没有对应的 `id`
- **THEN** 该值 MUST 被报为 `unregistered_in_map`
- **THEN** 系统 SHALL NOT 因此判定字典失效——它只报告，字典维护仍由 Agent 负责

#### Scenario: 一个页面范围内的核对

- **WHEN** 调用核对工具时指定了页面
- **THEN** 参与比对的元素 MUST 限定为该页面登记的元素，MUST NOT 把其他页面的元素算进本次结果

### Requirement: 核对是只读且不阻断的

核对工具 MUST NOT 写盘、MUST NOT 修改字典、MUST NOT 修改生产源码、MUST NOT 阻断任何原型写入。它 MUST NOT 参与写盘许可判定，因此其存在 MUST NOT 改变闸门的射程。

工具 MUST 在无法完成核对时明说原因，MUST NOT 把「没核对」渲染成「核对通过」。

#### Scenario: 核对不写盘

- **WHEN** 调用核对工具前后比较字典与生产源码
- **THEN** 两侧内容 MUST 逐字节相同

#### Scenario: 核对不阻断原型写入

- **WHEN** 核对报告了未命中项
- **THEN** 写入 `<stage>/current/` 的许可判定 MUST 与本轮 `gate.json` 记录一致，MUST NOT 因核对结果而改变

#### Scenario: impl 指向的文件不存在

- **WHEN** 某个元素的 `impl.path` 指向不存在的文件
- **THEN** 该元素 MUST 被报为 `missing_in_source` 并说明文件不可读
- **THEN** 系统 MUST NOT 静默跳过它

#### Scenario: 字典缺失

- **WHEN** 项目里没有 `semantic-ui-map.yaml`
- **THEN** 工具 MUST 报「未做核对」并说明字典缺失
- **THEN** 它 MUST NOT 返回空结果集冒充核对通过
