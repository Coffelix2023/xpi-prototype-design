# semantic-ui-map.yaml — Schema

> 本文与 `src/semantic-ui-map.ts` 的类型定义一一对应。**改字段就改这里**，两处不一致时以代码为准并立刻回填本文。

## 1. 位置与生命周期

```
<cwd>/.pi/prototype-design/<project>/semantic-ui-map.yaml
```

- **产品级**，不是阶段级：同一份字典覆盖该产品的全部页面（`pages` 里的 `P1`/`P2`）与全部保真度（`wireframe`/`hifi`）。
- `prototype_setup` 建空骨架（已存在则完全不改动）。
- `prototype_snapshot` 之后 `meta.version` 加一、`meta.updated` 换成当前时间；只改写这两行，其余字节原样保留（人工写的注释、字段顺序不会被打乱）。
- 文件不存在时一律优雅降级：`semantic_ui_map_annotate` 不写任何字节，预览照常。

## 2. 顶层结构

```yaml
meta: { ... }      # 必填，缺了就不算一份字典
pages: { ... }     # 页面索引，键是短码页码 P1
elements: { ... }  # 元素注册表，键是元素全路径
```

`parseSemanticMap` 只在**顶层不是映射**或**缺 `meta`** 时判定「这不是一份字典」（返回 `null`）。字段级问题一律交给校验器，加载与体检互不阻塞。

## 3. meta

| 字段 | 类型 | 必填 | 默认 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `project` | string | 是 | `""` | 项目 slug，与父目录同名 |
| `version` | number | 是 | `1` | 快照后由扩展递增 |
| `type` | enum | 是 | `spa` | `spa` \| `multi-page`，决定 `fidelities` 是路由锚点还是文件路径 |
| `updated` | string | 是 | `""` | `YYYY-MM-DD HH:mm`（UTC），由 `formatStamp` 写入 |
| `annotate_default` | boolean | 是 | `true` | 徽标注入后初始是否显示；`false` 时按钮初始为 `OFF` |

## 4. pages

键是短码页码（`P1`），值是页面条目。

| 字段 | 类型 | 必填 | 默认 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | string | 是 | `""` | 页面全路径（kebab-case），元素 `id` 以它开头 |
| `label` | string | 是 | `""` | 中文名 |
| `route` | string | 是 | `""` | `spa` 用 `#/chat`；`multi-page` 用 `pricing.html` |
| `status` | enum | 是 | `proposed` | 同 `STATUSES` |

## 5. elements

键是元素全路径（`chat.composer.send-btn`）；也接受序列写法（`- id: ...`），此时 `id` 写在条目里。两种写法可混用。

| 字段 | 类型 | 必填 | 默认 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | string | 是 | 键名 | 全路径，全局唯一，格式见 §7 |
| `short` | string | 是 | `""` | 短码，页面内唯一，格式见 §7 |
| `label` | string | 是 | `""` | 中文名，参与别名模糊匹配 |
| `type` | enum | 是 | `component` | `ELEMENT_TYPES`：`page \| panel \| section \| button \| input \| select \| toggle \| link \| text \| image \| table \| list \| component \| modal \| drawer` |
| `status` | enum | 是 | `proposed` | `proposed \| confirmed \| locked`，单向：`proposed → confirmed → locked` |
| `stage_created` | enum | 是 | `wireframe` | `wireframe \| hifi`，元素诞生的保真度 |
| `fidelities` | mapping | 是 | `{wireframe: null, hifi: null}` | 跨阶段锚点，见 §6 |
| `aliases` | string[] | 否 | — | 口语别名，与 `label` 一起参与模糊匹配 |
| `behavior` | `{ current: string }` | 否 | — | 当前行为的一句话描述 |
| `children` | string[] | 否 | — | 子元素全路径；与子元素的 `parent` 表达同一条包含边 |
| `parent` | string | 否 | — | 父元素全路径 |
| `i18n_key` | string | 否 | — | 文案键 |
| `order` | number | 否 | — | 同级排序 |
| `props` | mapping | 否 | — | 可修改契约，见 §8 |

## 6. fidelities

```yaml
fidelities:
  wireframe: pages/chat/wireframe/current/index.html#P1-2-B1
  hifi: null
```

- 未到的阶段写 `null` 或留空，**不是缺字段**。
- `spa`：允许纯锚点 `#/chat`、`#P1-2-B1`，也允许 `相对.html#anchor`。
- `multi-page`：必须是相对 HTML 路径（可带锚点），不允许纯锚点。
- 校验只查**格式**，不查文件是否存在——草稿阶段允许锚点先于文件存在。
- `semantic_ui_map_annotate` 在 `multi-page` 下按这里的路径决定「哪个元素属于哪个文件」；纯锚点无法判断归属，因此不会被标注。

## 7. 双码格式

| 码 | 正则 | 例 | 唯一范围 |
| :--- | :--- | :--- | :--- |
| 短码 | `^P\d+(-\d+)*(-[A-Z]\d+)?$` | `P1-2-B1` | 页面内 |
| 全路径 | `^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$` | `chat.composer.send-btn` | 全局 |

分隔符刻意不同（短码 `-`，全路径 `.`）：两种码在格式上互斥，解析器不必猜输入的是哪一种；`-` 也是合法的 HTML `id` 字符，`#P1-2-B1` 可直接用作 CSS 选择器。

HTML 元素的 `id` 应当写成短码或全路径之一——`semantic_ui_map_annotate` 按 `id` 匹配元素。

## 8. props 契约

```yaml
props:
  disabled:
    type: boolean
    current: false
  size:
    type: enum
    values: [sm, md, lg]
    current: md
```

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `type` | enum | 是 | `string \| number \| boolean \| enum \| array \| asset`，越界回落 `string` |
| `current` | any | 是 | 当前值；改 props 只改这里，不重写 HTML 结构 |
| `values` | (string \| number)[] | 否 | 仅 `enum` 需要；非字符串/数字的项会被过滤 |

契约内修改只动 `current`；契约外修改（新增 class 等）必须说明「将改动组件结构」。

## 9. 校验问题码

`validateSemanticMap` 报六类，`code` 取值：

| code | 触发条件 |
| :--- | :--- |
| `missing-field` | `id` / `short` / `label` 为空（写漏与写成空串等价；其余字段会回落合法默认值，无法判别） |
| `duplicate-id` | 两个元素 `id` 相同（序列写法才会发生，映射写法的重复键在 YAML 层就被拒） |
| `duplicate-short` | 两个元素 `short` 相同 |
| `cycle-reference` | `parent`/`children` 图里有环 |
| `invalid-status-transition` | 子元素状态高于父元素（如父 `proposed`、子 `confirmed`） |
| `duplicate-alias` | `label` 或 `aliases` 在跨元素间重复（大小写不敏感） |
| `invalid-fidelity-path` | `fidelities` 路径格式与 `meta.type` 不符 |

## 10. 工具调用契约

字典的读写入口都是**工具**，不让 Agent 直接改 YAML。分工：**库函数**（`src/semantic-ui-map.ts`）只做纯计算，类型真相在那里；**工具**（`src/semantic-tools.ts` 只读、`src/semantic-annotate.ts` 写盘）负责路径解析、输出整形与截断。

| 工具 | 入参 | 返回 | 写盘 |
| :--- | :--- | :--- | :--- |
| `semantic_ui_map_validate` | `{ project }` | `status`：`valid` / `invalid` / `missing` / `unreadable`；`errors[]`（`code` + `path` + `message`，封顶 10 条）；`total` / `shown` 计数；`version` | 否 |
| `semantic_ui_map_parse` | `{ project, input, page? }` | `status`：`matched` / `ambiguous` / `unregistered` / `missing` / `unreadable`；命中给元素摘要（`id` / `short` / `type` / `status` / `fidelities`），多候选给封顶 10 条 + `total` | 否 |
| `semantic_ui_map_annotate` | `{ project, pageId, kind }` | 标注了哪些文件、各补了几处徽标、哪些文件没命中 | 是（只写该页面阶段 `current/`） |

分工与边界：

- **校验**走 `loadSemanticMap` → `validateSemanticMap`；**解析**走 `loadSemanticMap` → `parseInput`。工具不复制这两者的类型与规则——改规则只改库，工具跟着走。
- `missing`（文件不存在）与 `unreadable`（文件在、但 YAML 坏或缺 `meta`）是两回事，而且都**不是「通过」**：没校验就说没校验。`validateSemanticMap` 收的是已解析的 map，本来就没有「缺失」这一态，所以这两态在工具层补。
- 输出上限 2000 字符，列表类另按 10 条封顶，并一律报「共 N 条，已显示 M 条」——截断不能被当成完整结果。
- 前两个工具**只读**，因此不经过计划闸门（`src/gate.ts` 只拦 `current/**` 的 `write` / `edit`）。分文件的理由也在这里：一个模块碰不碰盘，看文件名就该知道。

## 11. 支持的 YAML 子集

解析器（`src/semantic-ui-map-yaml.ts`）手写实现，只覆盖本 schema 用得到的部分。**支持**：

- 块式映射与序列、流式映射与序列（`{a: 1}` / `[1, 2]`）及嵌套
- 单/双引号字符串（`\n` `\t` `\"` `\\` 转义；`''` 表示单引号）、数字、布尔、`null` / `~`
- 行内注释（`#` 前须是空白），文档标记 `---` / `...`，BOM 与 CRLF
- YAML 1.1 的 `yes/no/on/off` 也当布尔

**不支持**（用法会被当成普通字符串，或直接报错）：

- 锚点 `&a`、别名 `*a`、合并键 `<<` —— 当作字符串，不展开
- 块标量 `|` / `>` —— `|` 就是字符串，其后的缩进内容会被判为非法缩进
- tab 缩进 —— 直接拒绝
- 多文档语义：`---` / `...` 只被跳过，不当文档边界（多份文档的内容会并进同一棵树）

结构性错误一律抛 `Invalid YAML: ...`，不静默吞掉：重复键、未闭合引号/括号、缺冒号、空 key、缩进回退到中间层级、末尾残留内容。
