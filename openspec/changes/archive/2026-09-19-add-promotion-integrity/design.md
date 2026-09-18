## Context

动机见 `proposal.md` §Why，行为契约见 `openspec/changes/add-promotion-integrity/specs/semantic-ui-map/spec.md`。本节只记录塑造实现方案的现状约束。

既有三条约束决定了本设计的形状：

1. **工具按「碰什么盘」分文件。** `src/semantic-tools.ts`（387 行）放只读工具，两者都只读 YAML 一个文件；`src/semantic-annotate.ts`（233 行）放写盘工具。评审时「这个模块碰不碰盘」要能一眼看出。
2. **`semantic_ui_map_validate` 的契约是「不碰文件系统」。** `impl.path` 只查格式（`validateImplPaths` 只做正则，不 `stat`），理由是「草稿阶段允许实现后于登记」。核对工具必须读源码，**不能并进 validate**。
3. **工具输出有界。** `MAX_OUTPUT = 2_000`，且两个既有只读工具的文案都报「共 N 条，已显示 M 条」式计数，避免截断被当成完整结果。

`impl.path` 的口径是「相对项目根」。扩展运行在目标项目 `ctx.cwd` 里，所以项目根 = `ctx.cwd`，源码路径直接可达，**没有跨仓问题**。

## Goals / Non-Goals

**Goals:**

- 让「线框里登记过、成品里没搬」变成一条机械可判定的报告，而不是靠人回想。
- 让「容器搬了、子项没搬」这个具体形态有专门的判定类别，而不是淹没在普通的缺失里。
- 保持只读：任何情况下不改字典、不改源码、不动写盘许可。

**Non-Goals:**

- 不做实时拦截、不挂钩子、不参与闸门（见 `proposal.md` §Impact 的明确不做）。
- 不做 JSX AST 解析。源码侧的定位靠字典已给出的 `impl.path` + `data-semantic-id` 字面量。
- 不做跨仓核对。`impl.path` 指到项目根以外时按不可读处理，不尝试解析仓库边界。
- 不判定字典是否失效。`unregistered_in_map` 只是报告，字典维护仍归 Agent。

## Decisions

### D1 新文件 `src/promotion-check.ts`，不并进 `semantic-tools.ts`

核对工具引入了 `semantic-tools.ts` 没有的权限面：**读任意源码文件**。并进去会让「这个模块只读 YAML」这条便于评审的属性失效；且 `semantic-tools.ts` 已 387 行，再涨会逼近 `AGENTS.md` §4 的 500 行红线。

只读工具的定位不变——新文件仍是只读侧，不 import `gate.ts`。

### D2 源码侧匹配用字面量，且只在 `impl.path` 指到的文件里找

`impl.path` 已经把「去哪个文件找这个元素」定死了。因此不需要全仓扫描，也不需要 AST：

- 单文件内按 `data-semantic-id="<全路径 id>"` 做字面量匹配，单双引号都认。
- 属性顺序无关，所以用属性级正则而不是解析 JSX。

否决的替代方案：

| 替代 | 否决理由 |
| :--- | :--- |
| 解析 JSX AST | 要引入 TS 解析器，与「不新增依赖」冲突；而待匹配的是一个手写的字面属性，解析能力用不上 |
| 全仓 grep 每个 id | `impl.path` 已给出落点；全仓扫描会让「这个 id 恰好在别的文件里出现」变成假 `matched`，把真缺失盖住 |
| 复用 `anchor_grep` 工具 | 那是给 Agent 用的会话工具，扩展内部函数不能调；且逐个元素起一次搜索在元素数量上不可接受 |

### D3 扫描范围由字典自己界定

收集字典里所有 `impl.path`（去重）得到**待扫描文件集合**，然后在这些文件上双向比对：

- 应有而未出现 → `missing_in_source`
- 出现而字典未登记 → `unregistered_in_map`

这样不需要决定「扫 `src/**` 下哪些扩展名、排除哪些目录」，也不会扫出大量与原型无关的 id。**字典没登记的文件本来就没进清单，不必扫。**

### D4 `unpromoted_child` 是字典内判定，但与其他三类一起输出

它完全不依赖源码（依据 `children` + `status: locked` + `impl` 有无），实现上做成独立的纯函数，便于将来搬迁。

仍然放进核对工具而不是 `semantic_ui_map_validate`：**四类结果一次给全**，用户跑一次就拿到完整答案；而并进 validate 会因读源码而破坏它的契约（见 Context 第 2 条）。

### D5 输出沿用既有有界与计数纪律

沿用 `MAX_OUTPUT = 2_000`。`unregistered_in_map` 在首次使用时可能很长（生产组件普遍写了 id 而字典还没补登记），必须封顶并报「共 N 条，已显示 M 条」。四类分别计数，不合并成一个总数——合并会让「只搬了容器没搬子项」这种需要立刻处理的信号，淹没在一堆无关条目里。

### D6 入参 `{ project, pageId? }`

`pageId` 可选：不传时核对字典里全部页面。核对的输入是跨页面的源码树，不像 `semantic_ui_map_annotate` 那样作用在单一阶段的 `current/` 目录上，因此必填没有依据。传了就按既有页面隔离纪律收窄。

### D7 不挂钩子、不挂快照

`tool_call` 钩子判不出「这一轮是在搬运」——成品代码常在另一个 session 里写，硬拦会侵入用户的正常开发流。挂 `prototype_snapshot` 则时机不对（快照是原型侧动作），而且既有集成模式是「失败静默降级」，核对静默降级会变成假绿灯。

第一版只做：工具 + SKILL.md 时机纪律 + §11 自检卡点。等实际观察到「用户不跑它」再加自动化——见 `docs/notes/od-borrow-report.md` §4.3 的同一条纪律。

## Risks / Trade-offs

- **[字面量匹配被注释或字符串里的 id 骗到假 `matched`]** → 只匹配 `data-semantic-id=` 紧跟引号的形式，并在报告里带出命中所在文件，便于人工复核。误判方向是「漏报缺失」，属可接受的保守失败。
- **[`unregistered_in_map` 首次使用时刷屏]** → 封顶 + 总数 + 文案明说「字典维护由 Agent 负责，本工具不判定字典失效」，避免用户误以为字典坏了。
- **[假绿灯：工具存在但没人跑]** → 这是本设计最大的残余风险，无法靠工具自身消除。缓解手段在文档侧：SKILL.md 补核对时机、§11 改成卡点措辞。**如实记录为残余风险，不假装解决。**
- **[与 `docs/prototype-to-production.md` §7 的 bash 脚本口径漂移]** → 该脚本降级为「本扩展核对工具的替代实现」，并把口径（全路径 id）在文档两处写死，使两边不会各说各话。
- **[`impl.path` 指向项目根以外]** → 报为不可读的 `missing_in_source`，不静默跳过；不尝试解析仓库边界。
