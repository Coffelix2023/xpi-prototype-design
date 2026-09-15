## Context

`add-semantic-ui-map` 交付了字典的数据层与一个写盘工具 `semantic_ui_map_annotate`。spec 里另外两个工具（校验、解析）落成了库函数 + 单元测试，运行时不可达。本 change 的形态因此是**接线**，不是新功能设计：把已有函数包成工具、把 Agent 侧契约从 README 搬回 SKILL。

约束（沿用本仓既有纪律）：

- 两个工具都**只读**：不写盘，因此不碰 `src/gate.ts`（`stageOfCurrentPath` 只认 `<project>/<kind>/current/` 与 `<project>/pages/<pageId>/<kind>/current/`，且只拦 `write`/`edit`）。
- 工具输出必须有界，沿用 `MAX_OUTPUT = 2_000` 与 `tools.ts` 的截断纪律——回灌上下文不能无上限。
- 无新增依赖；类型真相以 `src/semantic-ui-map.ts` 为准，不在工具层复制类型。

## Goals / Non-Goals

**Goals**

- Agent 在运行时能直接校验字典、直接把用户口语解析成元素。
- SKILL.md 与 README 对「谁维护 `elements`」的说法一致，且 SKILL 能自己走到 schema 字段真相。
- spec 与实现的两处偏差回填到 spec，不再只存在于 schema 文档里。

**Non-Goals**

- 不改字典格式、不改双码规则、不改标注工具行为。
- 不为 `props` 新增写盘工具（见「未决问题」）。
- 不修 `prototype_preview` 的页面布局解析问题（见「范围外发现」）。

## Decisions

### D1. 两个工具放在 `src/semantic-tools.ts`，只读与写盘分开

`src/semantic-annotate.ts` 已经承担 `semantic_ui_map_annotate`，它是**写盘**工具。把两个只读工具塞进同一文件会让「这个模块碰不碰盘」这个判断失效——这正是评审时最需要一眼看出的属性。新建 `src/semantic-tools.ts` 只放只读工具，`src/index.ts` 与 `registerSemanticTools` 并列接线。

### D2. 校验工具返回结构化问题码，缺字典时**显式区分**于「通过」

`validateSemanticMap(map)` 返回 `{ valid, errors }`，但「字典不存在」不是 `valid`——把缺失渲染成「无问题码」会让 Agent 把「没校验」当成「校验通过」。工具层需要第三种状态：

| 情况 | 工具输出 |
| :--- | :--- |
| 字典缺失 | `status: "missing"`，文案明说「未做校验」 |
| 有问题码 | `status: "invalid"` + 问题码列表 |
| 无问题码 | `status: "valid"` |

这是**工具层**的补充，不改 `validateSemanticMap` 的返回类型（库函数收的是 map，本来就没有「缺失」这一态）。

### D3. 解析工具返回候选列表时封顶，并给出总数

别名模糊匹配是 `includes` 匹配，中文单字（如「按钮」）可能命中几十个元素。工具输出按 10 条封顶 + 报总数，超出的让 Agent 用 `page` 上下文重来。理由同 `MAX_OUTPUT`：候选列表是给 Agent 看的，不是给人翻的。

### D4. `fidelities` 校验：改 spec 去对齐实现，不是改实现去对齐 spec

原 spec 写「检查 fidelities 路径**存在性**」，实现只查**格式**。判据是边界试探：草稿阶段的锚点天然先于文件存在，若查存在性，刚写好的字典会被判红，Agent 会去删锚点而不是产出 HTML——这条规则会把流程推向错误方向。schema 文档 §6 已经写明「只查格式」，只有 spec 没回填。因此本 change 修改 spec 表述，并在 spec 里补一条场景把这个取舍钉住。

### D5. `props` 写入：本 change 只写纪律，不加工具

spec 的 `props` 两条要求性质不同：契约内改 `current` 是执行纪律；契约外（新增 class）要「提示将改动组件结构」——**这个例子不可静态检测**，因为「Agent 给 HTML 加了个 class」不在字典里。可检测的部分又被解析期销毁：`toProps`（`src/semantic-ui-map.ts:218`）把非法 `type` 静默回落成 `"string"`、跳过非映射条目、过滤非标量 `values`，于是写错与写对的字典解析后一模一样（与校验器只报 `id`/`short`/`label` 为空是同一个理由，代码注释已写明「其余字段会回落合法默认值，无法判别」）。

所以本 change 的结论是：**props 纪律写进 spec 与 SKILL（行为约束），不加检测代码**。

### D6. 未决问题：解析器宽容度

要让 props 变得可校验，前提是 `toProps` 不再静默回落——那是一次解析器语义变更，会让既有字典从「能过」变「报错」，需要单独评估影响面（含 `src/semantic-ui-map.test.ts` 里针对回落的断言）。三档与代价：

| 档位 | 代码改动 | 能抓到 | 代价 |
| :--- | :--- | :--- | :--- |
| ① 只写纪律（本 change 取此档） | 0 | 无强制 | 纪律会腐烂 |
| ② 解析器不再吞错 + 校验器加问题码 | `toProps` 语义 + 3～4 个问题码，约 40 行 | 非法 `type`、缺 `current`、`values` 用错类型、`current` 不在 `values` 内 | 旧字典宽容度下降，需复核既有用例 |
| ③ props 写盘工具 + 字典纳入闸门 | 工具 + 闸门路径判定扩到 `<project>/semantic-ui-map.yaml` | `current` 变更也受本轮许可约束 | 最大；仍盖不住「加 class」；闸门例外需重新设计 |

②③ 都需要独立 change。**本 change 不预设其中任何一档为下一步**，等有真实需求（用户实际要求改 props，而非假设）再评估。

### D7. 范围外发现：页面布局预览缺产品地图

11.7 的手动验收暴露：`prototype_preview` 走页面布局时必须已有 `product-map.json`，否则传 `pageId` 报 `Unknown product page`、不传则回落旧布局报 `No html output found`；拿到 `mappedPage` 后还要求 `page.prototypeEntry` 或显式 `file`，否则 `findPagePreviewTarget` 返回 `null`。而产品地图目前**只有迁移会写**（`writeProductMap` 唯一非测试调用点在 `src/migration.ts:482`）。于是「只用 `prototype_setup` 建页面产物」的项目预览不了自身产物。

属编排那一轮的遗留，与本 change 无关，记录于此以免丢失；需要独立 change。

## Risks

- **两个工具名与既有库函数名混淆**：`validateSemanticMap` / `parseInput` 继续作为库函数导出，工具名另起（`semantic_ui_map_validate` / `semantic_ui_map_parse`）。spec 的旧文本用 JS 签名描述解析器，本 change 一并改为工具入参，避免第三个名字。
- **工具输出截断可能吞掉关键问题码**：问题码按出现顺序返回，`missing-field` 排在最前，被截断的只可能是后段的 alias/fidelity 问题。这是可接受的取舍，但工具文案必须报「共 N 条，已显示 M 条」。

## Migration

无代码迁移。新增入口，既有工具与字典格式不变。

**归档顺序约束**：本 change 的 delta 对 `semantic-ui-map` 用 MODIFIED，而该 capability 目前还只存在于**未归档**的 `add-semantic-ui-map` 里（`openspec/specs/semantic-ui-map/` 尚不存在）。`openspec validate` 会给出 `Archive would refuse this delta: target spec does not exist` 的 INFO。所以必须**先归档 `add-semantic-ui-map`**（它已 46/46 完成并校验通过），让 capability 落进 `openspec/specs/`，本 change 才能归档。反序执行会被 CLI 拒绝。
