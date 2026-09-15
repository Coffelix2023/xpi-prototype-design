## Why

`add-semantic-ui-map` 把字典的数据层做齐了（加载、双码、六类校验、标注后处理），但**没有把它接到 Agent 手里**：spec 要求的 `semantic_ui_map_validate` 与 `semantic_ui_map_parse` 只作为库函数存在（`src/semantic-ui-map.ts:647` / `:702`），`pi.registerTool` 全仓只注册了 `semantic_ui_map_annotate`。运行时 Agent 既无法校验字典，也无法把用户说的「折叠按钮」解析成元素——而双码制的全部价值恰好落在这两个动作上。

同时 SKILL.md 把维护责任写反了：§8.5 说「你只负责两件事：写对 `id`、产出后调一次标注」，README 第 54 行却说「Agent 深挖后把页面与元素填进去」。Agent 运行时只读 SKILL，于是字典永远停在 `prototype_setup` 建的空骨架，标注每次都报「未标注」——而 §8.5 又把这种情况归因于「锚点可能没写对」，等于把人指向错误方向。

结果：语义字典目前是一条**只有库、没有入口**的链路。

## What Changes

- 注册两个运行时工具：`semantic_ui_map_validate`（只读，返回结构化问题码）与 `semantic_ui_map_parse`（只读，把短码/全路径/中文别名解析成元素或候选列表）。两者都不写盘，不经过计划闸门。
- 更新 SKILL.md 将 semantic-ui-map 集成进主工作流：
  - §7 产出：wireframe 和 hifi 都加“为可修改元素分配语义 ID”要求，明确 HTML `id` 属性必须等于字典里的短码或全路径；
  - §8 收尾：标注徽标成为快照前的必要步骤（标注 → 快照 → 预览），字典缺失时降级；
  - §8.5 语义徽标：重写以收敛三处不一致——写明 `elements` 由 Agent 在深挖后登记，并给出字段入口（指向 `docs/semantic-ui-map-schema.md`，当前 SKILL 全篇 0 处引用 `docs/`）；写明 `props` 契约纪律：改 props 只改 `current`、不重写 HTML 结构，超出契约（新增 class 等）必须先声明「将改动组件结构」；写明交付时把短码报给用户，否则用户无法用「改 P1-2-B3」这种口语引用。
  - §11 完成前自检：补语义条目——字典已登记、`meta.type` 与原型形态一致、`id` 用的是短码或全路径、`semantic_ui_map_validate` 无问题码、交付时给了短码。
- 同步 `README.md` / `README.zh-CN.md` 工具表与 `AGENTS.md` §6 集成点。
- 校准 spec 与实现的两处偏差：`fidelities` 校验的表述由「路径存在性」改为「路径格式合法性」（实现一直只查格式，schema 文档也如此记载，只有 spec 没回填）；解析工具的契约由 JS 签名改为工具入参。
**BREAKING**：无。两个新工具是新增入口，不改动既有工具签名与字典格式。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `semantic-ui-map`: 校验与解析从「提供函数」收紧为「提供 Agent 可在运行时直接调用的工具」，并回填两处 spec 与实现的偏差；新增一条「字典维护责任与标注时机」的行为契约，把责任归属写进 spec 而不是只留在 README 里。

## Impact

- 代码：新增 `src/semantic-tools.ts`（两个只读工具的注册与输出整形）或并入 `src/semantic-annotate.ts`；`src/index.ts` 接线。不触碰 `src/gate.ts`——两个工具都不写盘，闸门射程不变。
- 文档：`skills/xpi-prototype-design/SKILL.md`（§7 产出、§8 收尾、§8.5 重写、§11 加项）、`README.md`、`README.zh-CN.md`、`AGENTS.md` §6、`docs/semantic-ui-map-schema.md`（补工具调用契约）。
- 依赖：无新增。
- 范围外（已发现、不在本 change 内）：`prototype_preview` 走页面布局时必须有 `product-map.json`（由迁移写入）且有 `prototypeEntry` 或显式 `file`，否则报 `Unknown product page` 或 `No html output found`；只用 `prototype_setup` 建页面产物的项目因此预览不了自身产物。属编排那一轮的遗留，需要独立 change 处理。
