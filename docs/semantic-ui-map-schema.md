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
| `id` | string | 是 | 键名 | 全路径，全局唯一，格式见 §8 |
| `short` | string | 是 | `""` | 短码，页面内唯一，格式见 §8 |
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
| `props` | mapping | 否 | — | 可修改契约，见 §9 |
| `impl` | mapping `{ path, export?, promoted_at? }` | 否 | — | 生产实现落点，见 §7 |

**允许的键全集就是本文各表列出的字段。** 落在这些字段之外的键会在加载阶段被丢弃、记进 `SemanticMap.unknownKeys`，再由校验器报 `unknown-key`——绿灯只在「字典里写下的每一项都被读过并判定过」时给出。`impl` 段内部不做这层检查。
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

- 生产实现不写在这里：`fidelities` 的键是闭集 `wireframe | hifi`，生产落点写在 `impl`（见 §7）。
## 7. impl

```yaml
impl:
  path: components/chat/composer.tsx
  export: Composer
  promoted_at: 2026-03-01
```

回答「这个原型元素推进到生产代码后落在哪」。**缺失 = 还没推进生产**，不是缺字段、也不是一个待补的空位——与 `fidelities` 里的 `null` 同理。

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `path` | string | 是 | 生产源码路径，相对项目根 |
| `export` | string | 否 | 导出的组件或函数名 |
| `promoted_at` | string | 否 | 推进日期 |

`path` 的格式规则（违反即 `invalid-impl-path`）：

- 非空字符串，相对项目根；
- 不以 `/` 开头（绝对路径）；
- 不含 `..` 路径段（越界防御，与 project slug 同一纪律）；
- 不含 `#`——选择器不是本字段的职责。行级定位靠生产源码里写下的 `data-semantic-id`（全路径），`impl.path` 只给到文件。

`export` / `promoted_at` 只做类型检查，非字符串视为未提供。`impl` 写成非映射（例如 `impl: "src/x.tsx"`）时收敛为 `path: ""`，由 `invalid-impl-path` 报出，不静默丢弃。

**只查格式，不查文件是否存在**：推进既可能「先登记后实现」也可能「先实现后登记」，规则不该假设顺序——查存在性会把刚登记的映射判红，Agent 就会去删映射而不是去写实现。

四条纪律：

- `impl` 缺失 = 还没推进生产；
- 只有 `status: locked` 才推进：`proposed` 的元素结构还会变，推进等于给自己挖返工坑；
- **推进对包含边完整**：推进一个元素时，它的 `children` 里每个 `status: locked` 的子元素必须同轮一并推进。不想推进某个子项就别把它置为 `locked`——「本就不打算进生产」的合法表达是状态，不是新增豁免字段；
- 推进不得改 `id` / `short`：改了就是砍断脊柱，用户的口语引用全部失效。

**搬运进度就是 `impl` 本身**，没有第二份清单：缺失即未推进、存在即已推进。不另建进度文件、不寄生在 `tasks.md`——那个文件每轮深挖后被覆写，而且里面的任务行受计划闸门管，而搬运写的是成品源码，闸门不管。

**核对**：字典说搬了、源码里到底有没有，由 `prototype_promotion_check` 回答（见 §11）。它把已登记 `impl` 的元素与生产源码里的 `data-semantic-id` 比对，四类分开报。**只报告，不写盘、不阻断**。

## 8. 双码格式

| 码 | 正则 | 例 | 唯一范围 |
| :--- | :--- | :--- | :--- |
| 短码 | `^P\d+(-\d+)*(-[A-Z]\d+)?$` | `P1-2-B1` | 页面内 |
| 全路径 | `^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$` | `chat.composer.send-btn` | 全局 |

分隔符刻意不同（短码 `-`，全路径 `.`）：两种码在格式上互斥，解析器不必猜输入的是哪一种；`-` 也是合法的 HTML `id` 字符，`#P1-2-B1` 可直接用作 CSS 选择器。

HTML 元素的 `id` 应当写成短码或全路径之一——`semantic_ui_map_annotate` 按 `id` 匹配元素。

## 9. props 契约

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

## 10. 校验问题码

`validateSemanticMap` 报八类，`code` 取值：

| code | 触发条件 |
| :--- | :--- |
| `missing-field` | `id` / `short` / `label` 为空（写漏与写成空串等价；其余字段会回落合法默认值，无法判别） |
| `duplicate-id` | 两个元素 `id` 相同（序列写法才会发生，映射写法的重复键在 YAML 层就被拒） |
| `duplicate-short` | 两个元素 `short` 相同 |
| `cycle-reference` | `parent`/`children` 图里有环 |
| `invalid-status-transition` | 子元素状态高于父元素（如父 `proposed`、子 `confirmed`） |
| `duplicate-alias` | `label` 或 `aliases` 在跨元素间重复（大小写不敏感） |
| `invalid-fidelity-path` | `fidelities` 路径格式与 `meta.type` 不符 |
| `unknown-key` | 字典里出现闭集外的键（加载阶段被丢弃）。键为 `fidelities.production` 时消息附带「生产实现写在 `impl` 段」的迁移提示 |
| `invalid-impl-path` | `impl` 存在但 `path` 为空、是绝对路径、含 `..` 段或含 `#` |

## 11. 工具调用契约

字典的读写入口都是**工具**，不让 Agent 直接改 YAML。分工：**库函数**（`src/semantic-ui-map.ts`）只做纯计算，类型真相在那里；**工具**（`src/semantic-tools.ts` 与 `src/promotion-check.ts` 只读、`src/semantic-annotate.ts` 写盘）负责路径解析、输出整形与截断。

| 工具 | 入参 | 返回 | 写盘 |
| :--- | :--- | :--- | :--- |
| `semantic_ui_map_validate` | `{ project }` | `status`：`valid` / `invalid` / `missing` / `unreadable`；`errors[]`（`code` + `path` + `message`，封顶 10 条）；`total` / `shown` 计数；`version` | 否 |
| `semantic_ui_map_parse` | `{ project, input, page? }` | `status`：`matched` / `ambiguous` / `unregistered` / `missing` / `unreadable`；命中给元素摘要（`id` / `short` / `type` / `status` / `fidelities` / `impl`，未推进生产时 `impl` 为 `null`），多候选给封顶 10 条 + `total` | 否 |
| `semantic_ui_map_annotate` | `{ project, pageId, kind }` | 标注了哪些文件、各补了几处徽标、哪些文件没命中 | 是（只写该页面阶段 `current/`） |
| `prototype_promotion_check` | `{ project, pageId? }` | 五类分开报：已推进但源码找不到（带 `impl.path`）、属性写成动态表达式（该文件里有 `data-semantic-id={...}` 而该元素不是字面量）、容器搬了子项没搬（列出未推进的子元素）、源码有而字典没登记、命中计数；各类分别封顶并报总数 | 否（读成品源码） |
| `check-promotion`（命令入口） | `--project <slug>` `[--page <pageId>]` `[--cwd <dir>]` | 与上一条**同源**：同一个判定函数、同一个渲染函数。退出码 fail-closed：`clean` → 0；`issues` / `missing` / `unreadable` → 1；用法或环境错误 → 2 | 否 |

分工与边界：

- **校验**走 `loadSemanticMap` → `validateSemanticMap`；**解析**走 `loadSemanticMap` → `parseInput`。工具不复制这两者的类型与规则——改规则只改库，工具跟着走。
- **未知键由加载层带出来**：`validateSemanticMap` 收的是已归一化的 `SemanticMap`，没有 YAML 原文，所以加载阶段丢弃的键记在 `SemanticMap.unknownKeys` 上，再由校验器报 `unknown-key`。这是「不静默通过」这条纪律唯一的实现路径。
- `missing`（文件不存在）与 `unreadable`（文件在、但 YAML 坏或缺 `meta`）是两回事，而且都**不是「通过」**：没校验就说没校验。`validateSemanticMap` 收的是已解析的 map，本来就没有「缺失」这一态，所以这两态在工具层补。
- 输出上限 2000 字符，列表类另按 10 条封顶，并一律报「共 N 条，已显示 M 条」——截断不能被当成完整结果。
- 三个只读工具（`validate` / `parse` / `promotion_check`）都不经过计划闸门（`src/gate.ts` 只拦 `current/**` 的 `write` / `edit`），也不改变它的射程。
- 分文件的理由也在这里：一个模块碰不碰盘、碰哪一种盘，看文件名就该知道。`semantic-tools.ts` 只读 YAML；`bin/check-promotion.mjs` 要读**任意成品源码**，所以判定被单独拆到不依赖 `typebox`、也不依赖 Pi 运行时的 `promotion-core.ts`——判定只要不能被会话外调用，客户端就会自己复写一份，而两份实现必然漂移。读字典那一层在 `semantic-map-io.ts`，同样零依赖声明。
- `docs/notes/` 里那段 bash 核对脚本是**降级替代**：只在装不了本包时才用，口径必须与命令入口一致（只匹配 `data-semantic-id` 的全路径值）。

## 12. 支持的 YAML 子集

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
