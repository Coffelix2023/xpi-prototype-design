## 1. 只读工具模块

- [x] 1.1 新建 `src/semantic-tools.ts`：导出 `registerSemanticReadTools(pi)`，注册两个只读工具（不写盘、不 import `gate.ts`）；沿用 `MAX_OUTPUT = 2_000` 截断纪律
- [x] 1.2 实现 `semantic_ui_map_validate`：加载字典 → `validateSemanticMap` → 映射为三态 `status`（`missing` / `invalid` / `valid`）；字典缺失时文案明说「未做校验」，不得返回空问题码冒充通过（design D2）
- [x] 1.3 实现 `semantic_ui_map_parse`：参数 `project`、`input`、可选 `page`；走 `parseInput`，`matched` 返回元素摘要（`id`/`short`/`status`/`type`/`fidelities`），`ambiguous` 返回封顶 10 条候选 + 总数，`unregistered` 明确报「没登记」不猜（design D3）
- [x] 1.4 两个工具的文案都报「共 N 条，已显示 M 条」式计数，避免截断被当成完整结果（design Risks）
- [x] 1.5 `src/index.ts` 接线：与既有的 `registerSemanticTools` 并列调用

## 2. 工具测试

- [x] 2.1 `src/semantic-tools.test.ts`：校验工具三态各一例——字典缺失（`missing`）、有问题码（`invalid`，含冲突元素路径）、干净字典（`valid`）
- [x] 2.2 断言两个工具**不写盘**：调用前后字典与同一阶段的 `current/**/*.html` 逐字节相同
- [x] 2.3 解析工具测短码、全路径、唯一别名、多候选（断言封顶数与总数）、未匹配（`unregistered`）
- [x] 2.4 解析工具测 `page` 上下文过滤：同一别名在两个页面都存在时，给了上下文只返回该页元素
- [x] 2.5 工具注册断言：`registerSemanticReadTools` 注册的工具名恰好是 `semantic_ui_map_validate` 与 `semantic_ui_map_parse`（防改名漂移）

## 3. SKILL.md（Agent 侧契约与工作流集成）

- [x] 3.0 §7 产出：wireframe 和 hifi 都加“为可修改元素分配语义 ID”要求，明确 HTML `id` 属性必须等于字典里的短码或全路径
- [x] 3.1 §8.5 写明 `elements` 由 Agent 在深挖后登记：`prototype_setup` 只建空骨架、`prototype_snapshot` 只递增版本，两者都不登记元素；给出字段入口 `docs/semantic-ui-map-schema.md`（当前 SKILL 全篇 0 处引用 `docs/`）
- [x] 3.2 §8.5 补两个工具的调用时机与形态：产出前 `semantic_ui_map_validate`（无问题码再往下走）、用户口语引用时 `semantic_ui_map_parse`（多候选必须问用户，不得自己挑）
- [x] 3.3 §8.5 补 props 契约纪律：只改 `current`、不重写 HTML 结构；越界（新增 class 等）先声明「将改动组件结构」（design D5）
- [x] 3.4 §8.5 补「交付时把短码报给用户」，否则用户无法用「改 `P1-2-B3`」引用元素
- [x] 3.5 §8 收尾：标注徽标成为快照前的必要步骤（标注 → 快照 → 预览），字典缺失时不写徽标、只报告跳过
- [x] 3.6 §11 完成前自检补语义条目：字典已登记、`meta.type` 与原型形态一致（单文件 spa / 多文件 multi-page）、`id` 用短码或全路径、`semantic_ui_map_validate` 无问题码、交付时给了短码
- [x] 3.7 检查 SKILL 与 README 对维护责任的表述一致（§8.5 的「只负责两件事」是本次要消掉的矛盾源）

## 4. 文档同步

- [x] 4.1 `README.md` / `README.zh-CN.md`：工具表补两个只读工具（含「不写盘」与三态 `status`），三步用法里插入校验/解析这两步
- [x] 4.2 `docs/semantic-ui-map-schema.md`：补一节「工具调用契约」——工具名、入参、返回值形态、与库函数的分工；`AGENTS.md` §3 目录树补 `src/semantic-tools.ts`、§6 集成点补两个工具
- [x] 4.3 `AGENTS.md` §6 决策表补一行：为什么只读工具与写盘工具分文件（design D1）

## 5. 最终验证

- [x] 5.1 `pnpm typecheck` 通过
- [x] 5.2 `pnpm -w run lint` 通过
- [x] 5.3 `pnpm test` 通过；`pnpm coverage` 不跌破 `vitest.config.ts` 的四模块下限
- [x] 5.4 手动验收：在真实项目目录里对一份故意写坏的字典调校验工具，确认拿到问题码而不是「通过」；对同一份字典的别名调解析工具，确认多候选时返回列表
- [x] 5.5 `openspec validate --changes wire-semantic-map-tools` 通过
- [x] 5.6 归档顺序：确认 `add-semantic-ui-map` 已先归档（capability 落进 `openspec/specs/semantic-ui-map/`），否则本 change 带 MODIFIED delta 会被 CLI 拒档（见 design.md「归档顺序约束」）
