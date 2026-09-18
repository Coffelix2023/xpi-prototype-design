## Why

本仓库是 `xpi-prototype-design` 的 Pi package 工具仓库。用户在**自己的 web-app 仓库**里装上它，扩展就在那个仓库的 `ctx.cwd` 里运行——字典、线框 HTML、成品源码、`impl.path` 相对的那个项目根**全在同一个 cwd 下**。

用户的实际流程是「线框 → 成品」，hifi 权重已降低。用户的经验是线框阶段已经解决大部分设计问题，所以线框是**设计的唯一决策场**。由此必然存在一条不变量：

> 线框里登记的元素集合（含包含边）SHALL 等于成品源码里 `data-semantic-id` 的集合。

现在的实际后果是这条不变量被破坏而**没有任何东西会失败**。搬运（把线框元素搬进成品 `src/**/*.tsx`）是「生成一个页面」这个动作的一部分，不是「对清单逐项执行」——生成时按当前目标优化，不在目标里的交互细节最先被丢。典型形态：卡片 `⋯` 菜单的触发器搬过去了，`children` 里的「重命名 / 移动 / 删除 / 隐藏」四项没搬。

既有的缺口有两处：

1. **进度载体已存在，但没有任何一致性要求。** 元素条目的 `impl` 段（`src/semantic-ui-map.ts:123`）缺失即未推进、存在即已推进，它天然就是搬运进度表，且是唯一不会被别的机制覆写的事实来源。但 spec 只规定了「未推进不报错」「推进不改 id」——**没有一条要求推进对包含边保持完整**，于是「容器搬了、子项没搬」在字典里完全合法。
2. **没有任何机械核对。** `semantic_ui_map_annotate` 只处理原型 HTML（`<stage>/current/*.html`），够不到成品源码；`semantic_ui_map_validate` 的契约明确是**不碰文件系统**（`impl.path` 只查格式，`validateImplPaths` 不 `stat`）。`docs/prototype-to-production.md` §7 写了一段 bash 核对脚本，但它不在本扩展里，且靠 `awk` 缩进配对，该文档自己承认「字典结构变了会静默漏检」。

顺带一处既有文档错误：`docs/prototype-to-production.md` §8 把「目标 web app 仓库与本扩展的关系：同仓、monorepo、还是完全分离」列为未决问题。按运行时契约这不是三选一——扩展永远在目标项目 `cwd` 内运行，同仓是唯一答案。

## What Changes

- **定纪律**：搬运进度的唯一事实来源是字典的 `impl` 段，不建第二份清单；推进一个元素时，它的 `children` 中每个 `status: locked` 的子元素 MUST 同轮一并推进。零新字段——用既有的 `status: locked` 表达「这个子项该进生产」，未 locked 的子项自然不算漏。
- **加核对**：新增只读工具 `prototype_promotion_check`，把字典里已登记 `impl` 的元素与生产源码里的 `data-semantic-id` 比对，报四类结果：`matched` / `missing_in_source` / `unpromoted_child` / `unregistered_in_map`。
- **明确降噪**：没有 `impl` 的元素 MUST NOT 参与核对，否则整个字典都会变红。
- **修正文档**：关闭 `docs/prototype-to-production.md` §8 的伪未决问题；§3 补第四条纪律（包含边完整）；§7 的 bash 脚本标注为「本扩展核对工具的降级替代，非唯一实现」。
- **不新增 stage kind**：`wireframe | hifi` 闭集不动，不引入 `production`。搬运进度不寄生在 `tasks.md` 里（见 §Capabilities 的说明）。
- 不新增依赖；不碰 `src/gate.ts`；新工具是只读的，闸门射程不变。

## Capabilities

### New Capabilities

无。推进纪律与核对工具都落在既有的 `semantic-ui-map` 能力里：`impl` 是它的字段，`validate` / `parse` 是它的工具族，核对工具是同一族的第三个。

### Modified Capabilities

- `semantic-ui-map`：新增三条 requirement，既有 13 条全部不变。
  1. **搬运进度以 `impl` 为唯一事实来源**，且推进对包含边保持完整（依据 `children` + `status: locked`）。
  2. **只读核对工具**的输出契约：四类结果、不写盘、不阻断。
  3. **核对降噪**：未登记 `impl` 的元素不参与核对。

### 为什么搬运进度不寄生在 `wireframe/tasks.md`

初版设计打算把搬运清单写进 `wireframe` 阶段的 `tasks.md`。读代码后否决，四处冲突：

| # | 冲突 | 依据 |
| :--- | :--- | :--- |
| 1 | `tasks.md` 每轮深挖后**被覆写**，跨轮 / 跨 session 的搬运进度会被冲掉 | `src/templates.ts:194` 的模板说明；SKILL.md §5.1 第 3 步 |
| 2 | `execute` 候选 = 有任务行的阶段。搬运可能长期挂着，会让 `wireframe` 阶段永远显示未完成 | SKILL.md §5.2 触发条件 |
| 3 | `parseTaskProgress` 用 `TASK_LINE_PATTERN` 全量计数（含嵌套子项），搬运任务会混进阶段进度 | `src/contracts.ts:361` |
| 4 | 同一个文件里两种授权：原型任务受 `prototype_gate` 管，搬运任务写的是用户仓库 `src/**`，闸门不管 | `src/gate.ts` |

字典的 `impl` 段四冲突全不占：不被覆写、不被计数、不与闸门授权混。**所以清单不新建，就是字典。**

## Impact

- **代码**：新增一个只读工具模块（或并入既有只读工具侧，不 import `gate.ts`）；`src/index.ts` 接线一条 `register*` 调用；配套测试。
- **文档**：`skills/xpi-prototype-design/SKILL.md` 补搬运纪律与核对时机；`docs/prototype-to-production.md` §3 / §7 / §8；`README.md` / `README.zh-CN.md` 工具表；按 `AGENTS.md` §6 的四处同步纪律核对 `docs/semantic-ui-map-schema.md` 与 `src/contracts.ts`。
- **消费方（本仓外）**：目标 web-app 仓库需按 `docs/prototype-to-production.md` §2.1 给生产组件写 `data-semantic-id`（全路径），核对才成立；`next.config.ts` 的 `reactRemoveProperties` 只需在生产构建剥离即可，源码侧不受影响。
- **不新增依赖**；不新增 stage kind；不改闸门。
- **明确不做**：
  - 不做「搬运实时拦截」（在用户写成品源码时用 `tool_call` 钩子阻断）。成品代码常在另一个 session 里写，钩子判不出「这一轮是在搬运」，硬拦会侵入用户的正常开发流。
  - 不把核对挂进 `prototype_snapshot`。快照是原型侧动作、搬运是成品侧动作，时机不对；而且既有集成模式是「失败静默降级」，核对静默降级会变成假绿灯。
  - 不做 `impl` 数组（一个元素多处实现尚无真实用例）。
  - 不做「生成搬运清单文件」——清单就是字典，第二份清单必然与字典漂移。
