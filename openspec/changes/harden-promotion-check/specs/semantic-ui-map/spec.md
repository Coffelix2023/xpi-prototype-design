## MODIFIED Requirements

### Requirement: 核对工具比对字典与生产源码

系统 SHALL 提供一个只读工具，把字典里已登记生产落点的元素与生产源码中的 `data-semantic-id` 比对，并把结果分为五类回报。

源码侧的匹配 MUST 依据 `data-semantic-id` 的**全路径**值（例如 `chat.composer.send-btn`），MUST NOT 依据短码——短码只在页面内唯一，源码是全局的。匹配 MUST 要求**属性形态**（`data-semantic-id="<值>"`），MUST NOT 放宽为「该值在文件里出现过」——后者会把常量表、映射表命中也算通过，正是假通过的来源。

五类结果：

| 结果 | 判定 |
| :--- | :--- |
| `matched` | 元素有 `impl`，且 `impl.path` 指向的文件里存在该元素全路径的 `data-semantic-id` 属性 |
| `missing_in_source` | 元素有 `impl`，该文件里找不到它的 `data-semantic-id` 属性，且该文件里**没有**任何 `data-semantic-id={` 形式的动态表达式 |
| `dynamic_attribute` | 元素有 `impl`，该文件里找不到它的 `data-semantic-id` 属性，但该文件里**存在**至少一处 `data-semantic-id={` 动态表达式 |
| `unpromoted_child` | 元素有 `impl`，但它的 `children` 里有 `status: locked` 而缺 `impl` 的子元素 |
| `unregistered_in_map` | 源码里有 `data-semantic-id`，而字典里没有对应的 `id` |

`missing_in_source` 与 `dynamic_attribute` 的分野是刻意的：两者的修法完全不同——前者要去写源码，后者要先确认渲染点是否真带该属性，然后决定改成字面量或接受「静态核对看不到」。把两者混成一类会让报告无法据以行动。

#### Scenario: 已推进且源码就位

- **WHEN** 某个元素有 `impl.path`，且该文件里存在 `data-semantic-id="<该元素全路径>"`
- **THEN** 该元素 MUST 被报为 `matched`

#### Scenario: 已推进但源码里没有

- **WHEN** 某个元素有 `impl.path`，该文件里找不到它的 `data-semantic-id` 属性，且该文件里没有任何 `data-semantic-id={` 形式的动态表达式
- **THEN** 该元素 MUST 被报为 `missing_in_source`，并带出 `impl.path`
- **THEN** 报告 SHALL NOT 把它与其他各类混在一起计数

#### Scenario: 属性写成动态表达式

- **WHEN** 某个元素有 `impl.path`，该文件里找不到它的 `data-semantic-id` 属性，但该文件里存在 `data-semantic-id={NAV_SEMANTIC_ID[view.id]}` 这类动态表达式
- **THEN** 该元素 MUST 被报为 `dynamic_attribute`，MUST NOT 被报为 `missing_in_source`
- **THEN** 报告 SHALL 说明静态核对看不到动态表达式，并提示先确认渲染点是否真带该属性

#### Scenario: 动态表达式不影响其余元素

- **WHEN** 同一文件里既有写成字面量的元素，也有写成动态表达式的元素
- **THEN** 写成字面量的元素 MUST 仍被报为 `matched`

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

## ADDED Requirements

### Requirement: 核对判定可在 Pi 会话之外被调用

核对判定 SHALL 与 Pi 工具注册分层：纯判定逻辑 MUST 放在不依赖 `typebox`、也不依赖 `@earendil-works/pi-coding-agent` 运行时的模块里，使它在没有 Pi 会话的环境（CI、脚本）中可被导入并跑通。

系统 SHALL 提供一个命令入口，接收 `project` 与可选的 `pageId`，输出与工具同源的核对结果，并以退出码区分「核对通过」与「有未命中项」。

命令入口 MUST 是只读的：MUST NOT 写盘、MUST NOT 参与写盘许可判定。

这条纪律的理由是消除**判定副本**：只要客户端无法调用同一个判定，它就会（也必须）自己复写一份，而两份实现必然漂移——一份报通过、另一份报未命中，同一份源码得出相反结论。

#### Scenario: 无 Pi 运行时也能跑

- **WHEN** 在没有 Pi 会话的进程里直接导入纯判定模块
- **THEN** 导入 MUST 不因缺少 `typebox` 或 Pi 运行时而失败
- **THEN** 判定 MUST 返回与工具调用完全相同的结果

#### Scenario: 命令入口的退出码

- **WHEN** 命令入口的结果 `status` 为 `clean`
- **THEN** 退出码 MUST 为零

#### Scenario: 有未命中项时非零

- **WHEN** 结果里 `missing_in_source` / `dynamic_attribute` / `unpromoted_child` / `unregistered_in_map` 任一非空
- **THEN** 退出码 MUST 非零，使 CI 能据以失败

#### Scenario: 没核对也不许绿

- **WHEN** 命令入口的结果 `status` 为 `missing`（没有字典）或 `unreadable`（字典读不出来）
- **THEN** 退出码 MUST 非零
- **THEN** 它 MUST 明说「未做核对」，MUST NOT 让 CI 在什么都没核对的情况下变绿

#### Scenario: 命令入口不写盘

- **WHEN** 命令入口执行前后比较字典与生产源码
- **THEN** 两侧内容 MUST 逐字节相同
