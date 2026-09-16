---
name: xpi-prototype-design
description: Produce, revise, or archive wireframe and high-fidelity prototype designs inside the current project, saved as versioned artifacts under .pi/prototype-design/<project>/<kind>/. Use when the user asks for a wireframe, 线框, low-fi layout, high-fidelity mockup, 高保真原型, hifi mockup, a prototype revision, an update to an existing prototype, or to archive a finished one. Skip it for production component code and for non-design tasks.
license: MIT
---

# xpi-prototype-design

统一入口只有 `/xpi-prototype-design [需求]`。裸入口启动本编排 Skill；用户不需要输入 `wireframe`、`hifi`、`execute`、`update`、`archive` 或任何 `--*` 参数。旧模式仅作为内部兼容分派，不作为用户流程。

## 1. 统一编排流程

Agent 按以下顺序使用结构化问题，已从产品地图或仓库读到的信息不重复询问：

1. **目标**：创建、继续、推进、评审、归档或**迁移已有原型/线框**。选到「迁移」就改用 `xpi-prototype-migration`，不要走本 Skill 的设计流程。
2. **产品**：读取 `prototype_status`，选择或确认产品项目；产品地图是稳定页面身份的事实来源。
3. **页面范围**（可选）：选择一个或多个 page ID，显示名称、实现来源、保真度、路由和直接影响页面；未登记页面不能成为写入目标。单页面产品或阶段兼容视图可跳过此步。
4. **动作**：读取、创建、修改、推进、预览或回滚。
5. **保真度变化**：明确 none / wireframe / prototype / hifi 的当前状态与目标状态；改变保真度不能改变 page ID 或稳定链接。
6. **范围摘要**：展示当前状态、计划变更、受影响页面和排除项；共享导航或链接契约变化必须确认完整受影响集合。
7. **闸门**：取消不写盘；保存、执行、补充和 resume 语义遵循第 5.1 节，写入必须绑定确认的页面范围。

产品地图最小布局：

```text
<cwd>/.pi/prototype-design/<product>/product-map.json
<cwd>/.pi/prototype-design/<product>/pages/<page-id>/<kind>/current/
```

| 维度 | 可用值 |
| :--- | :--- |
| implementation | production / prototype / external / placeholder |
| fidelity | none / wireframe / prototype / hifi |

页面预览必须传稳定 page ID 或产品流入口。多页面产品禁止按 HTML 文件名排序选择默认页面。

### 1.1 迁移（独立动作，与页面设计互斥）

迁移把用户明确指定的旧原型/线框搬进页面模型。来源只读，目标只允许 `.pi/prototype-design/`
下，已存在的目标绝不覆盖；用户明确给出来源之前不扫描任何目录。

| 顺序 | 工具 | 说明 |
| :--- | :--- | :--- |
| 1 | `prototype_migration_scan { sources }` | 只读扫描，产出页面/链接/资源/实现来源/保真度计划与全部待决项 |
| 2 | 用户逐项决定 | 待决项（pageId / implementation / fidelity / target / 资源归属）必须由用户确认 |
| 3 | `prototype_migration_execute { project, sources, decisions, confirm: true }` | 执行、登记产品地图、跑链接与最小渲染校验、写迁移报告 |

- `ready: false` 或 `confirm` 不为 `true` 时**不写盘**；不要用别的工具绕过去写那些目标路径。
- 只有零待决项、零冲突、校验全通过才能说「迁移完成」；否则报未完成，并给出报告路径与回滚命令。
- 扫描只列出 HTML 里的 href/src，**不改写**；引用改成稳定 page ID 是迁移后的人工动作。
- 迁移不深挖需求、不调设计技能——那正是它区别于普通页面设计的地方。

## 2. 硬规则（先读，别跳过）

1. **写 `current/` 前必须有一份「本轮」的放行记录**：先在聊天里展示结论 → 调 `prototype_gate` 让用户点一次 → 只有拿到放行答案才能写 `current/`。**没有本轮的放行记录就写 `<stage>/current/`，会被 `tool_call` 钩子直接 block**；`plan.md` / `tasks.md` 的**真实内容**也只在用户确认之后才写（`prototype_setup` 只会放不含任务行的空骨架）。被挡住时不要争辩、不要换路径绕，先补调 `prototype_gate`。详见 §5.1。

   这条规则对 `wireframe` / `hifi` / `update` 一视同仁，原因是许可只覆盖**一轮**：首轮那张卡批准的是「这个计划可以产出」，它推不出「下一句自由文本可以展开成多大的改动」。凡是你准备改 `current/`，先确认本轮的记录在不在。收到 §1 里说的 `--scope quick` 就是命令层替你问过了，不必重复弹卡。
2. **产物只落在** `<cwd>/.pi/prototype-design/<project>/<kind>/`。工作副本永远是 `current/`，你直接改它。
3. **每轮产出后必须调 `prototype_snapshot`**，否则版本链断裂、无法回滚。
4. **每个阶段各一份 `plan.md` 与 `tasks.md`**，每轮深挖后一起覆写，不新建副本。`plan.md` 只写需求事实，任务清单与进度只写在 `tasks.md`。
5. **主题只来自 `<项目根>/THEMES.md`**（shadcn oklch token）。不硬编码 hex、不自造 token。文件缺失由 `prototype_setup` 从包内模板补齐。
6. **默认暗色 + 默认简体中文界面**，两者都要在页内可切换。
7. **无构建**。hifi 是单文件自包含 HTML，不引 React、不引 Tailwind CDN、不产出 `node_modules`。
8. **项目 slug 是信任边界**。它会被拼进文件系统路径，两层校验（工具 schema + `artifacts.ts`）都按 `/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/` 拒绝非法值。别试图绕过。

## 3. 项目 slug 怎么定

`project` 是**一个设计项目**的名字，不是页面名，也不是阶段名。

| 规则 | 例 |
| :--- | :--- |
| 小写 kebab-case，只含字母数字与连字符 | `subscription-page` ✔ · `Subscription_Page` ✘ |
| 2–4 个词，概括设计对象 | `settings-flow` ✔ · `hifi` ✘ · `page1` ✘ |
| 必须能在同一项目下容纳多个阶段 | `checkout`（下挂 wireframe + hifi）✔ |
| **同一设计项目的 wireframe 与 hifi 必须用同一个 slug** | 否则 hifi 找不到要继承的线框 |

**生成时机**：深挖（§5）之后、调 `prototype_setup` 之前。从 `plan.md` 要写的那个主题里提炼。

**必须告知用户**：在第一次产出前用一句话说明「本项目 slug 定为 `<slug>`」。改名不在本流程范围内——真要改，等于把目录搬一次，先问用户。

`--based-on <project>` 出现时不要另定 slug，就用给定的那个。

## 4. 起手

```text
prototype_status                          # 总览所有活跃项目（不传 project）
prototype_status { project, kind }        # 某个阶段的具体版本与日志
prototype_setup  { project, kind }        # 幂等；建目录骨架 + 补 THEMES.md
prototype_gate   { project, kind }        # 首次产出前的三选一闸门；卡由扩展弹
```

顺序：先不带参数跑 `prototype_status` 看清已有项目（这一步不要求 slug），再定 slug，最后 `prototype_setup`。

若 `prototype_status` 显示已有版本，先读 `current/` 与 `CHANGELOG.md` 顶部几条，再决定是**迭代**（§9）还是**新开一号**。

**`update` 模式**：项目与阶段已经在参数里给定了，跳过 slug 决策，直接从 §4 的 `prototype_status --project <P> --kind <K>` 开始，读完现状后只改用户指出的部分。命令层已经替你问过「本轮改动有多大」，并按 `--scope` 给了放行状态：

- `--scope quick`（用户选「直接改」）：`current/` 已放行。**不要**再弹闸门卡、**不要**先写计划，读完现状就动手，改完照 §8 快照。
- `--scope plan`（用户选「先给改动清单」）：`current/` 仍被挡着。先写 `plan.md` / `tasks.md`，在聊天里给出**改动清单与影响面**（要改哪些块、哪些文件、边界在哪），然后停手。用户说「开始执行」时用 `prototype_gate { project, kind, mode: "resume" }` 放行。
- 没有 `--scope`（命令层弹不出面板）：按 §5.1 走，自己调 `prototype_gate` 让用户点一次。

**`execute` 模式**：同理，直接读该阶段的 `plan.md` 与 `tasks.md`，进 §5.2 执行腿——**不重新深挖**。

## 5. 深挖需求（3 轮 × 3 问）

用 `ask_user_question`，**一轮一次调用、每轮恰好 3 问**。每轮结束再发一次单问确认卡：`继续深挖` / `结束深挖`。用户选后者即刻停止提问，然后**必须**先过 §5.1 的计划闸门——停止提问 ≠ 开始产出。

| 轮次 | 三个问题问什么 |
| :--- | :--- |
| 轮 1 | 目的（这个原型回答什么问题）· 主要用户是谁 · 范围（包含/不包含） |
| 轮 2 | 硬约束（平台、时间、已有设计系统）· 内容与信息层级（先看什么、主 CTA 是什么）· 成功标准（怎么算做对了） |
| 轮 3 | 边界与异常（空/错误/无权限）· 关键交互与状态切换 · 偏好与禁忌（讨厌什么风格） |

提问纪律：

- 一次最多 3 问，选项 2–4 个，选项标签 ≤ 5 个词，把权衡写进 description。
- 能从已有 `plan.md`、仓库代码、用户原话里读到的，**不要再问**。
- 用户的自由文本回答**原样引用**，不要硬塞进你给的选项。

### 5.1 计划与任务编排（规划腿的终点）

顺序是硬性的，与 `xpi-fast-fix` 同构：**先在聊天里展示，再问，最后才落盘**。

1. **展示**：在聊天里给出完整的 `plan.md` 内容与 `tasks.md` 任务清单（编号 + 验收 + 产出）。这一步只发消息，不写任何文件。
2. **提问**：调 `prototype_gate { project, kind }`。扩展会自己弹出三选一卡，并把用户的选择写进 `<stage>/gate.json`。**不要用 `ask_user_question` 代替它**——那个答案不会被记录，`current/` 也放不出来。
3. **按答案落盘**：
   - 「仅保存计划，稍后执行」→ 写 `plan.md` 与 `tasks.md`，**本轮到此结束**：回报两个路径 + 任务条数与编号摘要，并明确说「等你发话再产出」。`current/` 仍然禁止写入。
   - 「保存后立即执行」→ 写两份文件，接着按 §5.2 执行腿产出（§7 的产出要求照旧），收尾照 §8 快照 + 预览。
   - 「还有需要补充的」→ **不写盘、不产出**，直接追问缺哪一块；补完回到第 1 步再问一次。最多再补 2 轮。
   - 用户取消卡片 → 停手，等用户发话。
4. **被钩子挡回时**：`<stage>/current/` 的写入会被 `tool_call` 钩子 block 并回一段原因。照做即可——补调 `prototype_gate`，或用户已说「开始执行」时改用 `mode: "resume"`。不要换路径，也不要用 bash 绕。

| 文件 | 写什么 | 不写什么 |
| :--- | :--- | :--- |
| `plan.md` | 需求事实来源：目的、受众、范围（含/不含）、页面清单、交付形态、主题与语言、成功标准、未决问题；任务编排节只写**切分理由** | 不重复维护任务列表 |
| `tasks.md` | 任务清单与进度：一行一个任务，按产出顺序编号 | 不重复写需求背景 |

`tasks.md` 的任务行格式（`(验收:…)` 与 `(产出:…)` 必须带）：

```markdown
- [ ] 1.1 <任务标题> (验收:<可观察结果>;产出:current/screens/01-home.html)
- [ ] 1.2 <任务标题> ⏳ in_progress
- [x] 1.3 <任务标题>
  验证: <怎么看出来的> · <时间>
```

编号顺序即产出顺序；只有非线性依赖才在行尾补 `(依赖: 1.2)`。

提问纪律：

- 卡的选项由 `prototype_gate` 给出，不许另起一张卡、不许合并、不许省掉「仅保存计划，稍后执行」——那是用户在产出之前唯一的刹车。
- 命令层已经问过 `--scope` 时**不要**再弹一次同样的卡：那是同一个问题问两遍。
- **用户没选「保存后立即执行」就写 `current/`，等于跳过了整个闸门**；而且写不进去。被挡回时按提示补调闸门，别把文件挪到别的路径。
- 卡面分两种：首轮（阶段还没有 `vN`）三选一；**迭代轮**（已有 `vN`）二选一——「现在就开始改」/「先给改动清单，等我确认」。两张卡的语义都是「批准**本轮**」，所以别把首轮的答复当成后续每一轮的通行证。
- 许可带基线：`gate.json` 里的 `baseline` 是弹卡那一刻的版本数。你每做一次 `prototype_snapshot`，这份许可就自动过期，下一轮要用户重新点一次。写 `current/` 被挡下且理由是「许可已过期」时，说明**这一轮**还没确认过，补调闸门，别去改 `gate.json`。
- 用户在「仅保存」之后说「开始执行 / 继续」时，改用 `prototype_gate { project, kind, mode: "resume" }` 放行。没有 `save` 记录时 resume 会被拒绝——那正说明闸门还没过，别绕过它。

### 5.2 执行腿

触发方式只有两种，**都要求用户明确发话**：

- `/xpi-prototype-design execute`（命令层列出有计划的阶段，你收到 `execute --project <P> --kind <K>`）；
- 用户在「仅保存」之后说「开始执行 / 继续」。

执行腿的动作：

1. 先确认放行：看 `<stage>/gate.json`（`prototype_status` 会带出闸门状态）。答案是 `save` 时先调 `prototype_gate { project, kind, mode: "resume" }`；记录缺失时说明闸门还没过，先回 §5.1。
2. 读 `plan.md` 与 `tasks.md` 全文。**不要重新深挖，也不要再问一遍需求**——答复已经在两份文件里。
3. 取第一个未完成任务（`- [ ]` 且无 `⏳`），先把行尾标上 `⏳ in_progress`，再只做这一项。
4. **骨架优先策略**：若任务要创建新 HTML 文件且预估超 200 行，必须拆成两步：
   - 第一步：用 `write` 生成骨架（完整 HTML 结构 + 空 `<style>`/`<script>` + 语义区块占位符就位，wireframe 阶段带 `data-wireframe-block`），标记任务 `[x]` 并验证骨架完整性
   - 第二步：用 `replace` 或 `insert` 逐块填充内容（CSS tokens → 各语义区块 → 交互脚本），每次修改 ≤ 200 行，填充完毕后标记 `[x]` 并验证
   - 若任务已是小改动（≤ 200 行），直接用 `replace`/`insert`，禁止 `read` + `write` 整文件
5. 产出后**立刻**把 `- [ ]` 改成 `- [x]` 并紧跟一条验证子行（验证了什么、怎么看出来的、时间）。一次只推进一项，不批量补勾。
6. 再进下一项，直到全部完成，然后按 §8 快照 + 预览。
7. `tasks.md` 不存在、或一条任务行都没有时**不要凭空开工**：停下来告诉用户「计划未落盘」，让他先过 §5.1。

**按构建阶段拆分示例**：

```markdown
- [ ] 1.1 生成首页骨架 (验收:HTML 结构完整、所有 section 占位符就位、style/script 空标签存在;产出:current/index.html)
- [ ] 1.2 填充 CSS tokens 与全局样式 (验收:THEMES.md 的 oklch 变量已定义、dark/light 类就绪;产出:current/index.html)
- [ ] 1.3 实现 header 区块 (验收:导航可点击、主题切换按钮功能正常;产出:current/index.html)
- [ ] 1.4 实现 main 内容区 (验收:主要信息层级正确、CTA 按钮就位;产出:current/index.html)
- [ ] 1.5 实现交互脚本 (验收:主题/语言切换持久化、无控制台错误;产出:current/index.html)
```

除 1.1（骨架用 `write`）外，每个任务用 `replace` 或 `insert`，而不是 `write` 重写整个文件。
状态只有三态，跳过必须在行上留痕：

| 状态 | 表达 |
| :--- | :--- |
| 待执行 | `- [ ] N.M 标题 (验收:…;产出:…)` |
| 进行中 | 同上 + 行尾 `⏳ in_progress` |
| 完成 | `- [x] N.M 标题` + 紧跟一条验证子行 |
| 跳过 | `- [ ]` + 行尾 `⏭ skipped: <原因>`（仍算未完成，不许删行） |

暂停条件（遇到就停，报告现场，不猜、不悄悄降级）：任务描述与代码/产物现状冲突、验证不通过、需要改动 `plan.md` 里已定的信息层级或 CTA、出现计划外的新增范围。

## 6. 技能编排表（照表调用，不要凭感觉选）

`brainstorming` 与 `grilling` 属于探索方法，其余属于设计方法。**只调用与本轮目标匹配的**，不要为了"用满技能"而调用。

### 入口（两个阶段共用，先过这一关）

| 时机 | 技能 | 目的 |
| :--- | :--- | :--- |
| 入口 | `prototype-strategy` | 定**保真度与方法**：先线框后高保真，还是直接高保真；这一版要回答到什么程度。命令层的 hifi 双入口问的就是这件事 |
| 入口·迁移 | `xpi-prototype-migration` | 用户选了「迁移已有原型或线框」：只走扫描 → 确认 → 执行 → 校验，不调任何设计技能 |

`--based-on` 已给定时，这个决策已经被用户做过一次，不要重复问；直接进对应阶段。

### wireframe 阶段

| 时机 | 技能 | 目的 |
| :--- | :--- | :--- |
| 深挖 | `brainstorming`、`grilling` | 探清意图、压力测试假设 |
| 收敛 | `design-brief` | 把散落回答收敛成问题/受众/成功标准 |
| 结构 | `information-architecture` | 页面层级与分组 |
| 结构 | `navigation-patterns` | 导航选型（tabs / sidebar / hub） |
| 结构 | `content-strategy` | 内容清单与归属（多页时） |
| 页内 | `wireframe-spec` | 内容优先级、块边界与标注 |
| 页内 | `layout-grid` | 栅格与断点 |
| 页内 | `spacing-system` | 8pt 间距节奏 |
| 收尾 | `design-qa-checklist` | 线框是否覆盖需求清单 |

### hifi 阶段

| 时机 | 技能 | 目的 |
| :--- | :--- | :--- |
| 视觉基础 | `design-token` | 消费 `THEMES.md`，不改写它 |
| 视觉基础 | `typography-scale` | 字阶与行高 |
| 视觉基础 | `spacing-system` | 间距节奏 |
| 视觉基础 | `dark-mode-design` | 亮/暗双模的层级再平衡 |
| 视觉基础 | `icon-system` | 图标规格与尺寸 |
| 视觉基础 | `color-system` | **仅当**确需扩展语义色时；默认不扩展 |
| 组件 | `component-spec` | sidebar、分栏面板等组件规格 |
| 组件 | `state-machine` | 多状态交互的穷举 |
| 组件 | `micro-interaction-spec` | 拖拽 resize、hover、focus 反馈 |
| 状态屏 | `loading-states` | 加载与骨架屏 |
| 状态屏 | `error-handling-ux` | 错误态与恢复路径 |
| 状态屏 | `ux-writing` | 界面文案 |
| 质感 | `design-taste-frontend`、`high-end-visual-design`、`minimalist-ui` | 可选；对抗模板味 |
| 按需 | `responsive-design` | 只有 `plan.md` 勾了 mobile 才用 |
| 验收 | `design-qa-checklist`、`handoff-spec` | 对照设计稿验收 / 交付说明 |

> 这些技能**不在本包内**，来自你环境里已装的全局技能。缺哪个就跳过并在回复里说明，不要假装调用过。

### 两个阶段都可用的旁路

| 技能 | 何时用 |
| :--- | :--- |
| `xpi-visualoop` | 需要看真实渲染像素、或让用户圈选区域提意见 |
| `visual-explainer` | 要解释一个页面/流程的整体结构 |
| `excalidraw-diagram` | 要手绘风流程图（不是界面稿） |
| `diagram-design` | 要架构/流程/状态机图 |

## 7. 产出

### 生成策略（控制单次输出复杂度）

**骨架优先原则**：禁止一次性生成完整 HTML。必须按以下顺序增量构建：

1. **骨架阶段**（用 `write` 创建文件）
   - HTML 结构：`<!DOCTYPE>` + `<head>` + `<body>` 的完整树形
   - 空标签占位：`<style>/* tokens */</style>` `<script>// interactions</script>`
   - 语义区块：`<header>`, `<main>`, `<footer>` 占位；wireframe 阶段按「### wireframe」带 `data-wireframe-block` 与 `data-priority`

2. **填充阶段**（用 `replace` 或 `insert` 增量修改）
   - CSS tokens（一次）
   - 每个区块的内容（逐块）
   - 交互脚本（最后）

**复杂度红线**：

- 单次 `replace` 的新内容 ≤ 200 行
- 单个函数/样式块 ≤ 50 行
- 若某区块预估超 200 行，拆成子任务

**工具选择**：

- 创建骨架 → `write`
- 填充/修改 → `replace`（精准锚点）或 `insert`
- 禁止为了修改 10 行而 `read` + `write` 整个 800 行文件

**复杂度豁免**：

- 纯声明式 HTML 模板（表单、数据表格）结构平坦时，可单次生成超 200 行
- CSS 选择器嵌套深度 > 3 层、单个 JavaScript 函数 > 50 行，即使总行数未超 200 也必须拆分
- SVG 图标定义（在 `<defs>` 或 `<symbol>` 中）不计入复杂度红线，但需放在独立 `<defs>` 区块

### wireframe

- 一屏一文件：`current/screens/<ID>.html`，<ID> 形如 `01-home`。
- 灰阶 + 内联 SVG；只用 `background / foreground / border / muted` 四个基础 token。
- 每个块带 `data-wireframe-block="<id>"` 与 `data-priority="P0|P1|P2"`。
- **为可修改元素分配语义 ID**：交互控件、导航项、内容区块等用户可能要求修改的元素，其 HTML `id` 属性必须等于字典里的短码（`P1-2-B1`）或全路径（`chat.header.nav-btn`）。
- 占位文案贴近真实长度（中文 12–20 字），禁止 lorem ipsum。
- 状态覆盖：正常 / 空 / 加载 / 错误，各自独立文件或独立视图。

### hifi

- 单文件自包含 HTML：`current/index.html`（多屏可拆 `current/screens/<ID>.html`）。
- 内联 CSS/JS，零外部请求。
- `<html class="dark" lang="zh-CN">`；主题与语言切换按钮写 `localStorage`，并在首帧前应用以免闪烁。
- 文案走 `window.__i18n`，`zh-CN` / `en` 两份，切换即时生效。
- sidebar 与分栏面板复刻 shadcn 外观；分栏可拖拽 resize，并且键盘可达。
- 色值全部来自 `THEMES.md`；`--radius`、border、muted 层级与 shadcn 一致。
- 无障碍底线：语义标签、`aria-label`、正文对比度 ≥ 4.5:1、焦点可见、尊重 `prefers-reduced-motion`。
- **为可修改元素分配语义 ID**：交互控件、导航项、内容区块等用户可能要求修改的元素，其 HTML `id` 属性必须等于字典里的短码（`P1-2-B1`）或全路径（`settings.theme.toggle-btn`）。
- 状态覆盖同 wireframe。

### hifi 的继承纪律

结构继承 `wireframe/current/`，视觉自由。每一条偏离线框的布局决策，**必须**登记进 `hifi/DELTA.md`：

```markdown
| 日期 | 线框决策 | hifi 改动 | 原因 | 批准 |
| :--- | :--- | :--- | :--- | :--- |
| 2026-09-13 | hero 左文右图 | 改上下堆叠 | 移动端优先 | 用户已确认 |
```

信息层级（哪些内容在前、有哪些 CTA）**不可擅自变更**。真要改，先问。

`hifi` 未带 `--based-on` 且同项目没有 wireframe 产出时，`DELTA.md` 里登记「无上游线框，本版直接起稿」即可，不要伪造一条继承关系。

## 8. 收尾：快照 + 预览

**标注徽标**（快照前必做）：

```text
semantic_ui_map_annotate { project, pageId, kind }
```

给 `id` 写对的元素补 `data-semantic-badge` / `data-status`，并注入徽标系统（CSS + 右上角开关按钮）。幂等，改完 HTML 可以再调。字典缺失时不写徽标，只报告跳过。

**快照**：

```text
prototype_snapshot { project, kind, change: "本轮做了什么", reason: "为什么", files: [...] }
```

- `vN` 表示**第 N 次产出**；回滚目标即 `v(N-1)`，命令会随快照一起返回。
- 版本号按**阶段**递增，不是按项目：同一项目下 `wireframe` 与 `hifi` 各数各的。
- `CHANGELOG.md` 倒序，最新在最上方，由工具写入，不要手工改格式。
然后让用户看到结果：

```text
prototype_preview { project, kind }                          # 默认 current/index.html
prototype_preview { project, kind, file: "screens/01-home.html" }
```

这是**用系统默认浏览器**打开，不建受控浏览器会话。

需要像素级评审或让用户圈选区域时，转 `xpi-visualoop`（`visual_prepare` → `visual_capture` → `visual_feedback`）。注意：`xpi-visualoop` 走 CDP，只能驱动它自己启动的 Chromium 系浏览器与独立 profile，**无法接管用户日常浏览器窗口**。

## 8.5 语义字典与徽标（semantic-ui-map）

字典在**产品级**：`.pi/prototype-design/<project>/semantic-ui-map.yaml`，跨页面、跨阶段共享。字段真相在 `docs/semantic-ui-map-schema.md`——改字典前先看它，别凭记忆写字段。

**谁维护 `elements`**：只有你。`prototype_setup` 建空骨架，`prototype_snapshot` 只递增 `meta.version`——两者都**不登记**页面与元素。空骨架意味着标注一个徽标也落不下，所以需求深挖完成后、开始产出 HTML 之前，你必须把本轮的 `pages` 与 `elements` 按 schema 写进字典；每个元素带 `id`、`short`、`label`、`type`、`status`、`stage_created`、`fidelities`。同一元素从 wireframe 推进到 hifi 时 `id` / `short` 不变，只有 `fidelities` 各指一处。

**三个工具的时机与形态**：

1. 产出前 —— 校验，无问题码再往下走：

```text
semantic_ui_map_validate { project }
```

`status: valid` 才能继续；`invalid` 先修问题码；`missing` 表示字典还没建（**不是**校验通过）。

2. 写 HTML 时 —— 写对 `id`：每个可修改元素的 HTML `id` 必须等于它在字典里的短码（`P1-2-B1`）或全路径（`chat.composer.send-btn`）。

3. 产出后 —— 标注：

```text
semantic_ui_map_annotate { project, pageId, kind }
```

它给 id 写对的元素补 `data-semantic-badge` / `data-status`，并注入徽标系统（CSS + 右上角开关按钮）。幂等，改完 HTML 可以再调。

用户用口语指元素时（「把那个折叠按钮改一下」）——解析，不要靠猜：

```text
semantic_ui_map_parse { project, input: "折叠按钮", page: "chat" }
```

- `matched`：直接按返回的元素干活。
- `ambiguous`：把候选列表报给用户让他选，**不得自己挑一个**；也可以带 `page` 上下文再解析一次收窄。
- `unregistered`：字典里没登记这个元素——先登记，或问用户要短码。

**props 契约纪律**（改元素属性时）：

- 该属性已在 `props` 里声明 → 只改它的 `current` 值，**不重写 HTML 结构**。
- 不在契约内（例如给它新增一个 class、换掉组件结构）→ 先向用户声明「该修改超出契约范围，将改动组件结构」，得到许可再动手。

**交付时把短码给用户**：本轮可修改元素的短码要一并报出来，否则用户没法用「改 `P1-2-B3`」这种口语引用它。

**范围规则**（决定了哪些元素会被标注）：

- `meta.type: multi-page`：只标注 `fidelities.<kind>` 指向本文件的元素；同一文件里出现别页元素的 id 也不会被标上。
- `meta.type: spa`：不按文件过滤，单文件承载全部路由，按 id 命中。
- 返回里的「未标注」文件表示该文件里没有元素命中——先查锚点和 `id` 是否写对，别猜。

**SPA 路由契约**（扩展不接管路由，原型自己负责）：

- 路由写作 `#/<page.route>`，非活动页面容器必须 `display: none`；徽标是元素的 `::before`，容器一隐藏徽标随之消失，这条契约就是「只显示当前页徽标」的全部实现。
- 不要用 `visibility`/`opacity`/`transform` 隐藏非活动页面：那样徽标会残留在页面上。

**降级**：没有 `semantic-ui-map.yaml` 时标注工具不写任何字节，只报告跳过；预览照常。历史 `vN/` 快照没有徽标属性，也不会被补——那是不变历史。

## 9. 迭代与回滚

- **迭代**（`update` 模式走这条）：先确认本轮放行记录在（`--scope quick` 已带，或自己调过一次闸门）→ 直接改 `current/` → 在 `plan.md` 里同步更新受影响的章节；受影响的 `tasks.md` 条目一并更新。快照本身会把这一轮的许可作废，所以下一轮会重新问一次——那是设计，不是 bug。
- **版本号由用户定**：`update` 命令的 kickoff 末尾带 `--version-bump yes|no`，那是用户在面板里点的，不是你的判断：
  - `yes`（或没有这个标记）：改完照旧 `prototype_snapshot`。
  - `no`：**不要调 `prototype_snapshot`**，只改 `current/`；交付时说清「本轮未存版本，需要回滚就找上一版 `vN`」。
  - 用户在聊天里直接提修改意见（没有这个标记）时**先问一句**「这轮要升级版本号（存档为 `vN`）吗」，按用户答复走；不要替用户判断改动大不大。用户没答就按不存版本处理，并且不要把「没问过」写成「已确认不升级」。
- **回滚**：跑快照返回的 `cp -R .../v(N-1)/. .../current/` 命令，然后再快照一次记录这次回滚。
- 版本号只增不减；不要在 `v*/` 目录里就地改文件——那些是不可变历史。
- **版本链有上限**：一个阶段的活跃版本最多 10 个。第 11 次快照时最旧的 5 个会被自动移进 `<stage>/archive/`（移走，不删除），`prototype_status` 因此只列留在链上的版本；`CHANGELOG.md` 那条记录里带着归档目录与 `mv` 取回命令，要找回被归档的版本就照它搬回来，别去改 `v*/`。

## 10. 归档（命令层做的，你只需知道它意味着什么）

`archive` 会把 `.pi/prototype-design/<project>/<kind>/` 整个 `rename` 到：

```text
.pi/prototype-design/archive/<YYYY-MM-DD>-<project>-<kind>/
```

并在 `.pi/prototype-design/archive/CHANGELOG.md` 顶部记一条含恢复命令的条目。代价与边界：

- 归档后该 `(project, kind)` 不再出现在 `prototype_status` 总览里，也不再是可 `update` 的目标。
- 同项目另一个阶段如果还在，项目目录保留；两个都归档后空目录被清理。
- 恢复即按日志里的命令 `mkdir -p` + `mv` 移回去。
- **归档不等于完成度判定**——扩展不判断"做完了没有"，那是用户在面板里决定的。所以别主动建议归档，除非用户说做完了。

## 11. 完成前自检

- [ ] 项目 slug 已告知用户，且与同项目另一阶段一致
- [ ] `plan.md` 反映了最新的 9 个（或提前退出时的实际）回答
- [ ] `tasks.md` 的任务行自带 `(验收:…)` 与 `(产出:…)`，编号顺序即产出顺序
- [ ] 写 `current/` 前有**本轮**的 `gate.json` 记录（`answer: "execute"` 且 `baseline` 等于当前版本数，或来自 `--scope quick`）；没有记录就一个字都没写
- [ ] 执行腿里每完成一项就立刻勾选并写验证子行，没有批量补勾
- [ ] 跳过或重排的任务在 `tasks.md` 里如实留痕，没有为了凑完成而删行
- [ ] 无硬编码色值；所有颜色可在 `THEMES.md` 找到出处
- [ ] 暗色为默认；亮/暗与中/英切换都可用且不闪烁
- [ ] `current/` 没有任何外部网络请求
- [ ] hifi 的每条偏离都在 `DELTA.md` 有记录
- [ ] 语义字典已登记本轮的 `pages` 与 `elements`（`prototype_setup` 只建空骨架，不会替你登记）
- [ ] `meta.type` 与原型形态一致：单文件 SPA 写 `spa`，多文件写 `multi-page`
- [ ] 可修改元素已分配语义 ID（HTML `id` 属性 = 字典短码/全路径）
- [ ] `semantic_ui_map_validate` 返回 `valid`（`missing` 不算通过）
- [ ] `semantic_ui_map_annotate` 已执行，徽标系统注入完成（字典缺失时跳过）
- [ ] 交付时把本轮可修改元素的短码报给了用户
- [ ] `prototype_snapshot` 已执行，`CHANGELOG.md` 顶部是本轮（本轮 `--version-bump no` 时跳过，并在交付里说明「本轮未存版本」）
- [ ] 迁移任务：待决项全部由用户确认、`confirm` 为 true，且只有 `complete` 为 true 才报「迁移完成」
- [ ] 只调用了本表里真实存在且本轮用得上的技能；缺失的已如实说明
