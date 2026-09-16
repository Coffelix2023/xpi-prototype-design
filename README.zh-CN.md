# xpi-prototype-design

[English](./README.md) · **简体中文**

**PI扩展: 一个斜杠命令把设计讨论落成可版本化、可评审的原型产物。**

**[Pi-Extension] One-Commander turns design discussions into versioned, reviewable prototype artifacts.**

<!-- TODO: 补一个 LICENSE 文件(MIT),下面的徽章指向它 -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

```text
> /xpi-prototype-design
```

## 为什么

设计讨论留在会话里没问题,可一旦对话结束,就没人说得清哪一版才是被拍板的那一版。线框评审通过了,高保真阶段却悄悄漏掉一个 CTA,唯一的记录只剩滚动历史。本扩展把整条回路落在磁盘上、留在项目里、并且版本化:产品地图持有稳定 page ID,结构化深挖的结论写进该页面的 `plan.md`,产出落进它的 `current/` 工作副本,每轮都存成 `vN/` 快照,并把回滚命令记进唯一一份倒序 `CHANGELOG.md`。主题色来自 `THEMES.md`——由扩展创建一次,此后绝不覆写。

本仓库里的每个扩展都从同样四条规则出发:

- **没有构建步骤。** Pi 直接加载 `./src/index.ts`,没有 `dist/`、没有打包器、不提交编译产物。
- **Pi 原生 UI。** 渲染走 `ctx.ui.*` 与 `@earendil-works/pi-tui`,绝不劫持终端,也不引入竞争性的终端框架。
- **没有重度运行时依赖。** 只用宿主提供的 API 加严格类型;工具 Schema 用 `typebox`,其余依赖都要先证明自己值得。
- **门禁严格,没有例外。** TypeScript strict、Biome、Vitest 三条全绿才能提交。

它也不越界:扩展是被 Pi 主进程加载的插件,不是独立服务。确实需要进程边界时,先写一份 ADR 说明理由,再动手。

## 语义元素字典（Semantic UI Map）

**vibe-coding 的零歧义元素定位。**

修改原型时，模糊描述（"把那个折叠按钮改一下"）迫使 Agent 猜测或反复确认。**semantic-ui-map** 系统为每个可修改元素分配稳定的双码标识：

- **短码**（用户友好，页面内唯一）：`P1-2-B3`
- **全路径**（机器友好，全局唯一）：`chat.composer.send-btn`

每个原型项目维护一份跨页面、跨保真度（wireframe → hifi）共享的字典：`.pi/prototype-design/<project>/semantic-ui-map.yaml`。HTML 里的元素角标显示短码，右上角按钮可整页开关。用户说「改 P1-2-B3」，Agent 直接定位——无需截图，无需反复确认。

**核心特性：**

- **双码映射**：短码供口语，全路径保证精确
- **可视化徽标**：可切换浮层，状态颜色区分（proposed/confirmed/locked）
- **跨保真度脊柱**：wireframe 到 hifi 阶段 ID 不变
- **状态机**：proposed → confirmed → locked
- **解析器与校验器**：解析短码、别名、全路径；检测冲突和循环引用
- **零依赖**：纯 Node.js + TypeScript，无外部运行时
- **优雅降级**：无字典时原型仍可正常预览

字典记录元素元数据（类型、状态、props 契约、父子关系、fidelities 锚点），支持 SPA（客户端路由如 `#/chat`）和多页面模式。校验器检查六类问题：必填字段、ID/短码冲突、alias 重复、循环引用、状态机合法性、fidelities 路径格式。解析器接受短码、全路径或中文别名，返回唯一匹配、候选列表或未注册状态——绝不静默猜测。

**怎么用（五步）：**

1. `prototype_setup` 建出空字典骨架，Agent 深挖后把页面与元素填进去（字段说明见 [`docs/semantic-ui-map-schema.md`](./docs/semantic-ui-map-schema.md)）。
2. 产出前调 `semantic_ui_map_validate { project }`，有问题码先修完。`valid` 才算干净；`missing` 表示字典还没建，**不是**通过。
3. HTML 里每个可修改元素的 `id` 写成它的短码或全路径。
4. 产出后调一次 `semantic_ui_map_annotate { project, pageId, kind }`：给 id 命中的元素补 `data-semantic-badge` / `data-status`，并注入徽标系统（CSS + 右上角开关按钮）。幂等，可重复调。
5. 用户用口语指元素时调 `semantic_ui_map_parse { project, input: "折叠按钮", page: "chat" }`：返回元素、或封顶 10 条候选加总数（此时必须问用户，不得自己挑）、或「未登记」。

`prototype_snapshot` 会在存快照之后自动递增 `meta.version`；`meta.annotate_default: false` 让徽标初始隐藏（按钮显示 `OFF`）。没有字典时标注工具一个字节都不写，预览照常——字典是增强，不是阻塞项。完整可运行示例见 [`examples/semantic-ui-map/`](./examples/semantic-ui-map/)。

## 技术栈

- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/),版本锁定在 [`mise.toml`](./mise.toml)
- [Pi Coding Agent](https://github.com/earendil-works/pi) —— 宿主本体、扩展 API 与 `@earendil-works/pi-tui`
- TypeScript strict(`target: ES2024`,`module: NodeNext`)
- [Biome](https://biomejs.dev/) 负责 lint 与格式化
- [Vitest](https://vitest.dev/) 作为测试运行器

## 安装

前置条件:一个可用的 Pi 安装。本包直接从源码加载,安装前不需要任何构建。

```bash
pi install git:github.com/Coffelix2023/xpi-prototype-design
```

`pi install` 写入 `~/.pi/agent/settings.json`;加 `-l` 写入项目设置,项目被信任后 Pi 会自动安装。固定的 git ref 不会被 `pi update` 移动。

```bash
pi list                              # 已安装的包
pi update --extensions               # 更新包并校对固定的 ref
pi remove git:github.com/<owner>/xpi-prototype-design
```

包级调试刻意只走 npm / git 远程源:本地路径安装只是在 settings 里留一条指向工作目录的引用,一旦忘记 `pi remove`,残留的脏路径就会和正式安装双份并存。

## 用法

| 命令 | 说明 |
| --- | --- |
| `/xpi-prototype-design [<需求>]` | 唯一入口：启动编排 Skill，按目标 → 产品 → 页面范围 → 动作 → 保真度 → 范围摘要 → 闸门逐步走 |
| `/xpi-prototype-design help` | 打印用法表（与裸回车同款输出） |
| `/xpi-prototype-design wireframe <需求>` | 内部模式，保留兼容：直接开始线框设计 |
| `/xpi-prototype-design hifi [<需求>]` | 内部模式：基于某个已有线框，或从零开始 |
| `/xpi-prototype-design execute` | 内部模式：挑一个已落盘的 `tasks.md`，从第一个未完成任务继续产出 |
| `/xpi-prototype-design update` | 内部模式：修改已有项目 —— 命令层会再问一次「本轮改动有多大」（直接改 / 先给改动清单） |
| `/xpi-prototype-design archive` | 内部模式：选一个已完成项目归档 |

只有裸入口是面向用户的。上表里的模式是**内部兼容层**：引导流程不会要求你输入 `wireframe`、`hifi`、`execute`、`update`、`archive` 或任何 `--*` 参数。迁移旧资产也是编排器给出的目标之一，它会交给 `xpi-prototype-migration` Skill，而不是走设计流程。

补全是模糊匹配，打首字母就够（`w` → `wireframe`）；输入命令后跟一个空格会列出全部六个内部模式，Tab 选中即可。**没有模式菜单**：裸回车只打印用法表。

### 统一入口

裸命令启动编排 Skill，每一步问一个有结构的选项，永远不需要你输入内部模式或 `--*` 参数：

1. **目标** —— 创建、继续、推进、评审、归档，或迁移已有原型。
2. **产品** —— 读 `prototype_status`，选择或确认产品项目；产品地图是页面身份的事实来源。
3. **页面范围**（可选）—— 选一个或多个 page ID，并显示名称、实现来源、保真度、路由和直接受影响页面。未登记的页面不能成为写入目标；单页面产品或旧的项目级阶段跳过这一步。
4. **动作** —— 读取、创建、修改、推进、预览或回滚。
5. **保真度变化** —— 说明当前与目标 `none` / `wireframe` / `prototype` / `hifi`。改变保真度绝不改变 page ID 或已声明的链接。
6. **范围摘要** —— 当前状态、计划变更、受影响页面与排除项。共享导航或链接契约变更必须确认完整的受影响集合。
7. **闸门** —— 取消不写盘；保存 / 执行 / 补充 / resume 按下面的规则走，且每次写入都绑定已确认的页面范围。

在第 1 步选「迁移」会改走迁移 Skill，见 [迁移](#迁移)。

### 产品与页面模型

产品项目是容器，**页面**才是真正被操作的对象。每个产品在 `<cwd>/.pi/prototype-design/<product>/product-map.json` 维护一张产品地图。

| 维度 | 可用值 |
| --- | --- |
| `implementation` | `production` / `prototype` / `external` / `placeholder` |
| `fidelity` | `none` / `wireframe` / `prototype` / `hifi` |

- 每个页面带稳定 `id`（小写 kebab-case）、显示名、可选的生产 `route`、原型入口文件和声明的链接。链接按稳定 `id` 指向别的页面，所以把某页从线框推进到高保真不会弄断任何东西。
- 成熟度**天然混合**：生产页面、线框、高保真、外部页面与占位页面共存于同一张地图。阶段目录不再代表整个产品的状态。
- 页面产物落在 `<product>/pages/<page-id>/<kind>/`，`plan.md` / `tasks.md` / `gate.json` / `current/` / `vN/` 布局与项目级阶段一致。规划、闸门、快照、CHANGELOG 条目和回滚目标都以单个页面为范围；单页面操作不能悄悄放行它的兄弟页面。
- 预览按 page ID（或产品流入口）解析。多页面产品不会再退化到「按文件名排序取第一个 HTML」。
- 改共享导航或链接契约时必须先列出全部受影响页面：`prototype_page_impact` 算出那个集合，范围不完整就报缺，而不是猜。

| 操作 | 范围 |
| --- | --- |
| `plan.md` / `tasks.md` | 单个页面阶段 |
| `prototype_gate` + `gate.json` | 单个页面阶段；尚无产品地图时是项目级阶段 |
| `prototype_snapshot` + `vN/` + `CHANGELOG.md` + 回滚 | 单个页面阶段 |
| `prototype_preview` | 单个页面 —— 多页面产品必须给 `pageId` 或 `flow` |
| 共享导航 / 链接契约变更 | `prototype_page_impact` 算出的全部受影响页面 |

### 阶段式旧产物

既有阶段式产物（`<product>/<kind>/`）保持可读：`prototype_status` 照旧汇报它们，历史 `vN/` 快照一字不动，也不会被自动迁移或删除。迁移是唯一搬动旧资产的路径，且对来源只读。

### 渐进式：规划腿与执行腿

原型不是「问完就开做」。顺序是硬的，与 `xpi-fast-fix` 同构：**先在聊天里展示，再问，最后才落盘**。

1. 深挖（3 轮 × 3 问）结束后，agent 在聊天里给出完整的 `plan.md` 内容与 `tasks.md` 任务清单——这一步只发消息，不写任何文件；
2. 调 `prototype_gate`，由**扩展**（不是模型）弹卡并把你的选择写进阶段根的 `gate.json`：首轮三选一，迭代轮二选一（现在就开始改 / 先给改动清单）；
3. 按选择落盘：

| 选项 | 结果 |
| --- | --- |
| 仅保存计划，稍后执行（默认首选） | 写 `plan.md` + `tasks.md`，规划腿到此结束，不产出任何 `current/` 文件 |
| 保存后立即执行 | 写完两份文件后接着按任务清单产出 |
| 还有需要补充的 | 不写盘、不产出，agent 追问缺的那一块，补完再问一次 |

在 `gate.json` 里出现**本轮**的 `execute` 之前，任何写入某阶段 `current/` 的调用 —— 项目级 `<product>/<kind>/` 或页面级 `<product>/pages/<page-id>/<kind>/` —— 都会被 `tool_call` 钩子**直接挡回**并附上原因。许可是按轮算的：记录里的 `baseline` 是弹卡那一刻的版本数，你每做一次 `prototype_snapshot`，这份许可就自动过期，下一轮要重新点一次——首轮那张卡批准的是计划，推不出下一句自由文本能展开成多大的改动。闸门不是「提醒模型记得问」，而是一道可执行的门禁——这是它与此前两次只改提示词的差别。卡片弹不出来时（print / json 模式）退化同一条记录：agent 用 `ask_user_question` 问同一张卡，再把答复回填给 `prototype_gate`。
选择「仅保存」之后，随时可以用 `/xpi-prototype-design execute` 回到这条腿上：候选列表只显示**有计划任务**的阶段，并带上进度（如 `subscription-page / wireframe · v1 · 3 文件 · 任务 2/7`），选中后 agent 从第一个未完成任务接着做，不会重新深挖、也不再问一遍需求。

`tasks.md` 的任务行是可核对的进度账本：`- [ ] 1.2 空态 (验收:…;产出:…)`、进行中加 `⏳ in_progress`、完成后打勾并紧跟一条验证子行。`prototype_status` 会把同一份进度汇总成 `任务 2/7`，并单列一行闸门状态（`gate.json` 的答案，或「还没有版本快照、未确认」）。

不写需求时会弹一个多行需求对话框：填了就随命令一起发出，留空提交等于「无需求」照常启动，Esc 取消则整轮放弃。提交与换行跟随你自己的 `tui.input.submit` / `tui.input.newLine`，包括在发不出独立按键序列的终端上把提交设成 `alt+enter`（Zed、Alacritty、Terminal.app）——用 Pi 自带的扩展编辑器时这种配置只会变成换行。只有没有对话框的运行模式（print / json）才会跳过这一步直接发送。`execute` 例外：它续跑已经落盘的计划，**不弹需求对话框**。完整推导见 [`docs/memo-terminal-keybindings.md`](./docs/memo-terminal-keybindings.md)。

命令层**从不建目录**：项目 slug 由 agent 深挖后决定，猜错也不会留下空文件夹。`archive` 完全在命令层完成，不会唤起 agent；`execute` 只列有 `tasks.md` 任务行的阶段；`update` 会在需求之后、把消息交给 agent **之前**多问一次「本轮改动有多大」，直接把答案写进 `gate.json`——所以「直接改」这条路只点一次，且这一刻还没烧掉任何 token。无面板的模式（print / json）不问也不写，由 agent 调 `prototype_gate` 兜底。

### 工具

| 工具 | 读什么 | 改什么 | 拒绝什么 |
| --- | --- | --- | --- |
| `prototype_setup` | 项目级阶段，或带 `pageId` 的单个页面阶段；外加 `<cwd>/THEMES.md` | 补建缺失的目录与文档骨架；建空语义字典骨架（`<project>/semantic-ui-map.yaml`）；`THEMES.md` 缺失时复制包内模板 | 绝不覆写已存在的文档、字典或 `THEMES.md`；共享契约变更必须给全受影响集合（`sharedContract` + `affectedPageIds`） |
| `prototype_snapshot` | 所选阶段的 `current/`：项目级，或单个 `pageId` | 写出 `v<N>/` 并在 `CHANGELOG.md` 顶部插入一条记录；递增字典 `meta.version` / `meta.updated`；返回的回滚命令指向该页面自己的上一版 `vN` | `current/` 为空时拒绝执行；共享契约变更的受影响页面集合不全时拒绝执行 |
| `prototype_status` | 某个 `(project, kind)`，或带 `pageId` 的单个页面阶段；省略 `project` 时汇总全部活跃项 | 不修改任何东西 | 绝不写盘 |
| `prototype_preview` | 所选阶段或页面的 `current/` | 用系统默认浏览器打开该文件 | 拒绝任何越出 `current/` 的路径；多页面产品拒绝猜页面，必须给 `pageId` 或 `flow` |
| `prototype_gate` | 阶段根的 `gate.json`（带 `pageId` 时是页面阶段） | 弹卡（首轮三选一 / 迭代轮二选一）并记录选择、`baseline`，摘要里带上页面范围；`mode: "resume"` 放行「仅保存 / 先给改动清单」之后的续跑 | 有面板时忽略模型传入的 `answer`；没有本轮的 `save` 记录时拒绝 resume |

| `prototype_page_impact` | 产品地图与它的反向链接引用 | 不改任何东西（只读） | 共享契约变更的范围不完整时**报出缺失页面**，而不是接受一个残缺的集合 |
| `prototype_migration_scan` | 用户明确指定的、位于项目根**内**的旧文件或目录 | 不改任何东西（只读）；`href` / `src` 只被读出，绝不被改写 | 拒绝项目根之外的来源，以及任何路径穿越 |
| `prototype_migration_execute` | 同一批来源，加用户确认过的 `decisions` | 复制进 `<product>/pages/<page-id>/<kind>/current/`，把页面登记进产品地图，写迁移报告 | 计划还有待决项、或 `confirm` 不为 true 时**一个字节都不写**；绝不覆盖已存在的目标 |
| `semantic_ui_map_annotate` | 所选页面阶段的 `current/**/*.html` 与产品级语义字典 | 给 `id` 与短码/全路径命中的元素补 `data-semantic-badge` / `data-status`，注入徽标系统（CSS + 开关按钮） | 幂等，重复调用不叠加；字典不存在时一个字节都不写，只报告跳过；`multi-page` 下不标注锚点指向别的文件的元素 |
| `semantic_ui_map_validate` | 产品级语义字典（`<project>/semantic-ui-map.yaml`） | 不改任何东西（只读） | 绝不写盘；字典缺失时返回 `status: "missing"` 并明说「未做校验」，绝不把空问题码列表伪装成通过 |
| `semantic_ui_map_parse` | 同一份字典 | 不改任何东西（只读） | 绝不写盘，也绝不替用户挑候选：别名多候选时返回最多 10 条加总数，要求给短码或 `page` 上下文 |
写盘门禁在 `gate.ts` 里注册一个 `tool_call` 钩子：`write` / `edit` 目标是某阶段的 `current/**`（项目级或页面级），且 `gate.json` 里没有**本轮**的 `execute`（答案不是 `execute`，或 `baseline` 与当前版本数不一致）时直接 block，并把原因回灌给模型。`plan.md` / `tasks.md` 这些台账不在门禁范围——它们的真实内容正好要在用户确认之后才写（`prototype_setup` 只放空骨架）。
`project` 是信任边界：必须匹配 `/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/`，两层校验（工具 schema 与 `artifacts.ts`）。所有路径都由 `ctx.cwd` 推导，任何工具都不接受模型传入的任意文件系统根目录。工具输出上限 2000 字符。

### 产物结构

```text
<cwd>/
├── THEMES.md                          # shadcn oklch token —— 主题的事实来源
└── .pi/prototype-design/
    ├── <product>/
    │   ├── product-map.json           # 稳定 page ID、实现来源、保真度、路由与链接
    │   ├── pages/<page-id>/<kind>/    # 页面级产物，布局与下面的阶段一致
    │   │   ├── plan.md                # 需求；每轮深挖后覆写
    │   │   ├── tasks.md               # 任务清单与进度；执行腿唯一的事实来源
    │   │   ├── gate.json              # 计划闸门的用户选择；不是 execute 就写不进 current/
    │   │   ├── principles.md          # 本页面阶段的硬约束
    │   │   ├── DELTA.md               # 仅 hifi：相对线框的结构偏离
    │   │   ├── CHANGELOG.md           # 倒序，最新在最上方
    │   │   ├── current/               # 工作副本 —— 改这里
    │   │   └── v1/ v2/ ...            # 页面级不可变快照
    │   ├── <kind>/                    # 旧的项目级阶段 —— 仍可读，但已不是模型
    │   └── migration/                 # 迁移报告，一次运行一个文件
    └── archive/
        ├── CHANGELOG.md               # 归档日志，含恢复命令
        └── 2026-09-13-subscription-page-hifi/
```

版本号按**页面阶段**递增，不按产品：同一页面下的 `wireframe` 与 `hifi` 各数各的 `vN`，旧的项目级 `<product>/<kind>/` 阶段也照旧自己数。归档把整个 `<kind>/` 目录移进 `archive/`，可凭日志里记录的命令恢复。一个阶段最多保留 **10 个活跃版本**：第 11 次快照时最旧的 5 个被移进该阶段的 `archive/`（移走，不是删除），所以 `prototype_status` 只列留在链上的版本，而那条 `CHANGELOG.md` 记录里带着归档目录与把版本搬回来的 `mv` 命令。

### 迁移

迁移把用户明确指定的旧原型或线框搬进页面模型。它是独立的 Skill（`xpi-prototype-migration`）加独立的一对工具：不深挖需求，也不调任何设计技能。

1. `prototype_migration_scan { sources }` —— 只读。产出映射计划（页面、链接、资源、实现来源、保真度）与全部**待决项**。
2. 你逐项决定待决项：page ID、实现来源、保真度、目标 `<product>/pages/<page-id>/<kind>`，以及每个非 HTML 资源归谁 —— 或者说明为什么排除它。
3. `prototype_migration_execute { project, sources, decisions, confirm: true }` —— 复制、把页面登记进产品地图、跑链接校验与最小渲染检查，报告写到 `<product>/migration/<时间>-migration-report.md`。

来源文件永远不改。目标已存在只记为冲突，绝不覆盖。只有零待决项、零冲突、校验全通过，迁移才会报**完成**；否则如实报未完成，并给出一条 `rm -f` 命令，只删本次运行新建的文件。

## 开发

```bash
mise install                         # 安装锁定版本的 Node.js 与 pnpm
pnpm install
```

| 门禁 | 命令 |
| --- | --- |
| 类型 | `pnpm typecheck` —— `tsc --noEmit` |
| Lint 与格式 | `pnpm -w run lint` —— Biome 全仓检查 |
| 测试 | `pnpm test` —— Vitest(`vitest run --passWithNoTests`) |

提交前三条必须全绿。Lint 请在 workspace root 显式运行 `pnpm -w run lint`;包装层偶发会把裸写的 `pnpm run lint` 误判为未知递归命令。

开发期运行扩展有两种方式:

```bash
pi -e ./src/index.ts                 # 冒烟:只加载一次,仅本次运行,不写配置
```

```bash
ln -s "$(pwd)" ~/.pi/agent/extensions/xpi-prototype-design   # 日常回路:在 Pi 内用 /reload 热载
```

`pi -e` 不写任何设置;软链由扩展目录自动发现,`rm` 掉软链即干净。

## 目录结构

```text
.
├── mise.toml / package.json / biome.jsonc / tsconfig.json / pnpm-workspace.yaml
├── AGENTS.md / CONTEXT.md / DESIGN.md
├── THEMES.md                  # 包内 shadcn token 模板,会被复制进目标项目
├── docs/                      # Git 工作流、仓库约束、语义字典 schema
├── examples/semantic-ui-map/  # 可运行示例:SPA + 徽标开关(字典/HTML/说明)
├── skills/
│   ├── xpi-prototype-design/SKILL.md       # 统一编排流程 + 该调用哪些设计技能
│   └── xpi-prototype-migration/SKILL.md    # 扫描 → 确认 → 执行 → 校验,不调设计技能
└── src/
    ├── index.ts               # 扩展入口(register)+ 命令接线
    ├── contracts.ts           # Kind/Mode 闭集、目录布局、CHANGELOG 格式
    ├── templates.ts           # plan / principles / DELTA / CHANGELOG 骨架
    ├── artifacts.ts           # 文件系统:项目级阶段的 setup、snapshot、state、预览目标
    ├── page-artifacts.ts      # 同一批操作,按单个 page ID 生效
    ├── product-map.ts         # 产品地图、page ID、链接、旧布局扫描/复制原语
    ├── migration.ts           # 迁移评审计划、执行、校验、报告
    ├── preview.ts             # 系统默认浏览器启动器
    ├── requirement-editor.ts  # 需求对话框:提交键优先于换行判定
    ├── semantic-ui-map.ts     # 语义字典:双码、加载、解析、六类校验、版本递增
    ├── semantic-ui-map-yaml.ts # 最小 YAML 解析器(本 schema 子集)
    ├── badge-template.ts      # 徽标 CSS/JS 模板与 HTML 注入
    ├── semantic-annotate.ts   # semantic_ui_map_annotate:把字典落到 current/ 的 HTML
    ├── semantic-tools.ts      # semantic_ui_map_validate / semantic_ui_map_parse:只读
    ├── tools.ts               # 注册的读写工具
    ├── gate.ts                # 计划闸门工具 + current/ 写入门禁
```

## 设计规范

本项目遵循 [Google Labs DESIGN.md 规范](https://github.com/google-labs-code/design.md),并专门为终端 TUI 场景定制。详见 [`DESIGN.md`](./DESIGN.md) 查看设计 Token(颜色、等宽字阶、间距网格与组件定义)。

## 约定与约束

- **术语表**:[`CONTEXT.md`](./CONTEXT.md) 定义了本仓库的统一语言,代码、文档与提交中禁止术语漂移。
- **Git 纪律**:提交或推送前先读 [`docs/GIT-WORKFLOW.md`](./docs/GIT-WORKFLOW.md) 与 [`docs/GITHUB-GUARD.md`](./docs/GITHUB-GUARD.md)。默认回路是**不建分支**、直接在 `main` 上提交与推送:先过 Git 卫生检查点(见 §3),再用小粒度 Conventional Commits。分支、PR 与发布只在用户显式提出时才走。
- **Token 安全**:密钥与 Token 绝不写入代码、日志、示例或文档。
- **Agent 契约**:[`AGENTS.md`](./AGENTS.md) 是本仓库的唯一事实来源。口头约定、历史代码或本 README 与它冲突时,以 `AGENTS.md` 为准。

## 致谢

- [Pi Coding Agent](https://github.com/earendil-works/pi) —— 由 [earendil-works](https://github.com/earendil-works) 开发。本扩展寄宿其中:扩展 API、`ctx.ui` 契约和包清单规范都来自该项目。
<!-- TODO: 采用或移植过的第三方仓库都要在这里致谢:项目名、作者、链接、许可证,以及你取了什么。 -->

## 许可

MIT
