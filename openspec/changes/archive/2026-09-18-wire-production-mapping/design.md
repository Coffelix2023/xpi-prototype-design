## Context

现状与约束（动机见 proposal.md - Why）：

- `Fidelities` 是闭集 `{ hifi, wireframe }`。`toFidelities`（`src/semantic-ui-map.ts:196`）逐键读取，闭集外的键**在加载阶段就消失**。
- `validateFidelityPaths` 只遍历 `[wireframe, hifi]`，因此永不报告这件事；`semantic_ui_map_validate` 返回 `valid`。
- `ElementSummary`（`src/semantic-tools.ts:52`）只有 `id / short / type / status / fidelities`，解析工具无法把 Agent 带到生产源码。
- 真实数据形状：`power-dream-harness` 13 条生产映射中，**9 条带 `#` 片段**（6 个导航入口共用一个 `app-rail.tsx`、`#h1`、`#page=overview`、`#page=episodes`），4 条是纯文件路径。
- 三条既有纪律约束本设计：无新增运行时依赖（spec「不引入重型依赖」）；只读工具不碰 `src/gate.ts`；字段变更须同步四处文档（`AGENTS.md` §6）。

关键约束：**`validateSemanticMap(map)` 收到的是已归一化的 `SemanticMap`，没有 YAML 原文**。未知键若在加载层被丢弃，校验层就无法补报告——这决定了本 change 唯一的结构性改动。

## Goals / Non-Goals

**Goals:**

- 生产映射成为可加载、可校验、可由 `semantic_ui_map_parse` 直接取得的一等字段。
- 加载阶段丢弃的键不再静默消失：工具的绿灯只在字典里写下的每一项都被读过并判定过时给出。
- 保持只读路径不写盘，`src/gate.ts` 的拦截面不变。

**Non-Goals:**

- 不做 `impl.path` 的文件存在性检查（与 `fidelities` 同纪律，见 D4）。
- 不做 `impl` 数组（一个元素多处生产实现尚无真实用例）。
- 不把选择器写进字典（见 D3）。
- 不改目标仓的源码、`next.config`、Git 约定或一致性 check 脚本。

## Decisions

### D1. `impl` 是独立段，不扩展 `fidelities`

文档 §3 定义的 `impl: { path, export, promoted_at }` 照搬进 schema。

替代方案是把 `production` 加进 `Fidelities` 闭集——好处是 `power-dream-harness` 现有 13 条**零迁移**。否决理由有两条，都是格式层面的：

1. `fidelities` 的校验规则是 `FIDELITY_HTML_PATTERN`，要求值以 `.html` 结尾；`src/components/x.tsx` 过不了。要么放宽模式（削弱既有校验），要么给它开特例（那就不如独立字段）。
2. `fidelities` 的键语义是**保真度阶段**（同一原型的两种完成度），生产实现是另一个物种。混在一起后，`Fidelities` 这个名字不再准确。

代价是 13 条需要迁移。这是本 change 唯一的外部成本，写进 Migration Plan。

### D2. `fidelities` 闭集外的键报错，且这是 BREAKING

静默丢弃让「字典已登记生产映射」与「字典没有生产映射」在工具输出里长得完全一样——这正是桥断掉却没人发现的原因。候选方案是发警告而非错误；否决理由：警告会淹没在输出里，而 spec 要求「绿灯只在每一项都被判定过时给出」。

落地影响：`power-dream-harness` 的字典会从 `valid` 变成 `invalid`。这是**正确结果**，不是回归。

### D3. `impl` 严格取文档 §3 的字段集，不加 `anchor`

文档 §2.3 的精细定位靠 `anchor_grep` **源码里已写下的语义 ID**，不靠字典里的选择器。加 `anchor` 会让扩展同时认可两套定位语言，而现存乱象（`#a[aria-label="项目库"]` 与 `#page=overview` 并存于同一字段）正是缺少统一契约的产物。

**必须写清的代价**：在目标仓的元素拿到 `data-semantic-id` 之前，桥只能走到**文件级**。`app-rail.tsx` 一个文件承载 7 个语义元素（`sidebar` + 六个 `nav-*`），仅凭 `impl.path` 分不出谁是谁。升级路径就是文档 §2 本身：源码补属性后，`impl.path` 给文件、全路径语义 ID 给行。

为让这道门关得住，`impl.path` 的格式规则显式拒绝 `#`（见 D5）。

### D4. `impl` 只查格式，不查文件存在

沿用上一个 change 对 `fidelities` 确立的判据（边界试探）：推进既可能「先登记后实现」也可能「先实现后登记」，规则不该假设顺序。若查存在性，刚登记的映射会被判红，Agent 会去删映射而不是去写实现。

### D5. `impl` 的格式规则

- `path` 必需且为非空字符串，相对项目根；
- 不得以 `/` 开头（绝对路径）、不得含 `..` 路径段（越界防御，与 project slug 同一纪律）；
- 不得含 `#`（选择器不是本字段的职责，见 D3）；
- `export` / `promoted_at` 可选，只做类型检查；非字符串视为未提供（与 `behavior.current` / `i18n_key` 同样的归一化宽严度）；
- `impl` 存在但不是映射（例如写成 `impl: "src/x.tsx"`）时收敛为 `path: ""`，交由 `invalid-impl-path` 报出，不静默丢弃；
- 不检查文件是否存在。

### D6. 未知键的发现归加载层，报告归校验层（本 change 唯一的结构性改动）

`validateSemanticMap` 收的是 `SemanticMap` 对象，没有 YAML 原文，所以在校验层重新检查未知键做不到。解决方案是在归一化结果上保留这条信息：

```ts
export interface SemanticMap {
  elements: SemanticElement[];
  meta: SemanticMapMeta;
  pages: SemanticPage[];
  /** 加载时被丢弃的未知键；没有时为 undefined（不影响既有比较与序列化）。 */
  unknownKeys?: SemanticUnknownKey[];
}

export interface SemanticUnknownKey {
  /** 出现位置，例如 `meta` / `pages.P1` / `elements.chat.composer` / `elements.chat.composer.fidelities`。 */
  where: string;
  key: string;
}
```

选它而不是替代方案的理由：

- **给 `SemanticElement` 加内部字段**：`SemanticElement` 是要序列化回 YAML 的数据，污染它比污染 `SemanticMap` 更糟。
- **让 `parseSemanticMap` 改返回 `{ map, diagnostics }`**：会波及 `loadSemanticMap`、`incrementSemanticMapVersion` 与全部测试调用点，收益相同。
- **只给 `fidelities` 开特例**：`toElement` / `toMeta` / `toPages` 同样在丢键（一个拼错的 `shrot` 现在也没人报），一处统一处理比三处特例更小。

`SemanticMap` 本来就不是 YAML 的字面镜像——`pages[].short` 存的是 YAML 的**键**而非字段。`unknownKeys` 可选且仅在有问题时存在，既有断言不受影响。

### D7. 两个新问题码，不扩旧码

- `unknown-key`：位置由 `where` 描述；消息在键为 `fidelities.production` 时附带迁移提示（生产实现改写 `impl` 段）。这一条提示是本 change 的主要迁移抓手，值得硬写。
- `invalid-impl-path`：`impl` 存在但 `path` 缺失或违反 D5。

不复用 `missing-field`：`impl` 缺失不是错误。不复用 `invalid-fidelity-path`：字段不同，混用会让「哪一处写错了」变模糊。

### D8. `ElementSummary` 增加 `impl`，未推进时为 `null`

`impl: ImplMapping | null`。用 `null` 而非省略字段，与 `fidelities.hifi` 的「未到阶段写 null，不是缺字段」保持一致，也让工具文案能明确说「未登记生产落点」而不是静默留白。

## Risks / Trade-offs

- **迁移成本落在外部仓** → `power-dream-harness` 需把 13 条 `fidelities.production` 改写为 `impl.path`，并给 9 个需要行级定位的元素补 `data-semantic-id`。缓解：问题码给出具体迁移动作；design 提供机械改写映射（值原样搬，去掉 `#` 片段）。
- **回滚会连带要求回滚字典** → 撤销本 change 的读取逻辑后，已迁移的 `impl` 会变成 `unknown-key` 报错。缓解：Migration Plan 写明回滚需同时把 `impl` 改回 `fidelities.production`，或保留 `unknownKeys` 的宽松分支。
- **文件级定位不足** → 见 D3，9/13 条真实映射只能定位到文件。缓解：这是刻意的过渡状态，升级路径在文档 §2；SKILL 写明「先 `anchor_grep` 语义 ID，未命中再读 `impl.path` 指向的文件」。
- **`SemanticMap` 形状变化波及既有断言** → `unknownKeys` 可选、仅在有问题时存在；既有测试字典没有未知键，`toEqual` 不受影响。
- **未知键检测可能报出用户有意留下的自定义键** → 这是刻意的（D2）。缓解：schema 文档列出允许的键全集，让「能不能自定义」有明确答案。

## Migration Plan

1. **本仓**：无数据迁移。`impl` 为可选字段，既有字典照常加载；只有含闭集外 `fidelities` 键的字典会由 `valid` 转 `invalid`。
2. **外部仓（不在本 change 内，作为验收样本）**：`power-dream-harness` 的 13 条
   `fidelities: { ..., production: "src/x.tsx#frag" }` → `impl: { path: "src/x.tsx" }`，
   `#frag` 片段按 D3 丢弃，改由源码里的 `data-semantic-id` 承担行级定位。
3. **回滚**：撤销读取与校验逻辑，并把字典里的 `impl` 改回 `fidelities.production`（否则 `unknown-key` 会报错）。
4. **验证顺序**：本仓三绿（`pnpm typecheck` / `pnpm -w run lint` / `pnpm test`）→ `openspec validate` → 拿 `power-dream-harness` 迁移后的字典跑一次 `semantic_ui_map_validate` 与 `semantic_ui_map_parse`，确认 `impl` 出现在解析结果里。

## Open Questions

- 目标仓何时迁移字典：属于外部节奏，不改变本 change 的 spec、方案与任务分解。
- 一个元素对应多处生产实现（响应式拆成 mobile / desktop 两个组件）的形状：尚无真实用例，等出现再评估；届时是 `impl` 数组还是拆元素 ID 需要单独判断。
