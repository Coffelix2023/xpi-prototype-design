## 1. 分层拆分（无行为变更）

- [x] 1.1 新建 `src/semantic-map-io.ts`，导出 `LoadedMap` 与 `readProjectMap`（从 `semantic-tools.ts` 原样搬出，含那条「文件在、却没有 `meta`」的 stat 区分逻辑与注释）；验证：`grep -n "typebox" src/semantic-map-io.ts` 无输出
- [x] 1.2 `src/semantic-tools.ts` 改为从 `semantic-map-io.ts` 导入并**再出口** `LoadedMap` / `readProjectMap`，既有调用方零改动；验证：`pnpm typecheck` 通过且 `semantic-tools.test.ts` 全绿 —— **偏离**：**没有做再出口**。移出后 `readProjectMap` 只剩一个调用方（`promotion-check.ts`），而它现在经由 `promotion-core.ts` 传递依赖拿到；再加一层再出口是死表面。改为直接 import，`semantic-tools.ts` 自身调用点零改动
- [x] 1.3 新建 `src/promotion-core.ts`，搬入 `checkPromotion` / `findUnpromotedChildren` / `collectSemanticIds` / `MissingEntry` / `UnpromotedEntry` / `PromotionCheckResult` / `PromotionStatus` / `MAX_OUTPUT` / `MAX_ITEMS` / 文本渲染与 `ID_ATTR_PATTERN`；验证：`grep -nE "typebox|pi-coding-agent" src/promotion-core.ts` 无输出
- [x] 1.4 `src/promotion-check.ts` 收缩为 Pi 工具外壳（`registerPromotionTools` + schema + `execute`），从 `promotion-core.ts` 导入；验证：`git diff --stat` 里该文件只减不增（除 import 与转发）—— 411 行 → 56 行
- [x] 1.5 `src/index.ts` 接线不动（仍是 `registerPromotionTools`）；验证：`index.test.ts` 的十二工具断言不变

## 2. 动态属性类 `dynamic_attribute`

- [x] 2.1 `promotion-core.ts` 增加文件级动态信号：检出 `data-semantic-id={`（值不是紧跟引号）的形态；验证：单元测试给一个含 `data-semantic-id={NAV_SEMANTIC_ID[view.id]}` 的文件，断言信号为真；给一个只有字面量的文件，断言为假
- [x] 2.2 `checkPromotion` 把「未命中且该文件有动态信号」的元素归入新集合 `dynamic: string[]`，其余仍归 `missing`；验证：单元测试断言两者互斥且并集等于全部未命中元素
- [x] 2.3 结果类型增加 `dynamic` / `dynamicTotal`，`status` 判定把它算进 `issues`；验证：单元测试断言只有动态未命中时 `status === "issues"`
- [x] 2.4 文本渲染新增一节，说明「静态核对看不到动态表达式，先确认渲染点是否真带该属性」，并按 `MAX_ITEMS` 封顶 + 报总数；验证：单元测试断言文案含该说明且截断时报「共 N 条，已显示 M 条」
- [x] 2.5 既有 `missing` 的语义收窄为「该文件里没有任何动态表达式」；验证：原有 missing 用例仍通过（其夹具无动态表达式）

## 3. CLI 入口

- [x] 3.1 新建 `bin/ts-resolve.mjs`：`resolve` 钩子把相对 `.js` specifier 重写到同目录 `.ts`（仅在目标存在时）；验证：`node bin/check-promotion.mjs --help` 之类冒烟命令能加载到 `src/promotion-core.ts` 而不抛 `ERR_MODULE_NOT_FOUND` —— 实测：不注册钩子时抛 `ERR_MODULE_NOT_FOUND`，注册后正常
- [x] 3.2 新建 `bin/check-promotion.mjs`：`register("./ts-resolve.mjs", import.meta.url)` 后动态导入 `src/promotion-core.ts`，解析 `--project` / `--page` / `--cwd`；验证：对合成夹具跑一次，输出与 `prototype_promotion_check` 工具文本**逐字符相同** —— **偏离**：CLI **不截断**。`MAX_OUTPUT` 是模型上下文预算，CI 报告没有那份预算，截断只会让人看不到后半个列表。测试在小夹具（未超上限）上断言与 `promotionText` 逐字符相同，并单独断言工具侧仍有截断
- [x] 3.3 退出码 fail-closed：`clean` → 0；`issues` / `missing` / `unreadable` → 1；用法错误 → 2；验证：四类各跑一次断言退出码 —— 另补：未知旗标 → 2、缺少取值 → 2、slug 非法 → 2
- [x] 3.4 `package.json` 补 `bin`（`xpi-prototype-design-check` → `./bin/check-promotion.mjs`）与 `files` 增加 `bin`；验证：`node -e "require('./package.json')"` 能读到该字段且路径存在
- [x] 3.5 只读断言：CLI 跑前跑后字典与源码逐字节相同；验证：测试或冒烟脚本比对内容

## 4. `rollbackCommand` 改收阶段路径

- [x] 4.1 `src/contracts.ts` 把 `rollbackCommand(project, kind, version)` 改为 `rollbackCommand(stage, version)`，公式不再手写；验证：`grep -n 'ARTIFACT_ROOT}/\${project}' src/contracts.ts` 无输出
- [x] 4.2 `renderChangelogEntry` 的 `ChangelogEntryInput` 改为携带阶段路径（`stage`）而非 `project` + `kind` 拼路径；验证：`pnpm typecheck` 通过，条目文本与改动前**逐字符相同** —— 另**删除** `archived.stage`：它与新的顶层 `stage` 是同一个值，留两份就是同类漂移温床；`renderEntryTitle` 的参数同时收窄为 `{ stamp, version }`，调用方不必为拼标题凑齐整个条目
- [x] 4.3 `src/artifacts.ts` 调用点传 `stagePath(project, kind)`；验证：`artifacts.test.ts` 全绿
- [x] 4.4 `src/page-artifacts.ts` 调用点传 `pageStagePath(project, pageId, kind)`，删掉 `` `${project}/pages/${pageId}` `` 这处路径前缀当 slug 的用法；验证：`page-artifacts.test.ts` 全绿，且页面级 CHANGELOG 的回滚命令仍含 `/pages/`
- [x] 4.5 补一条回归：断言 `rollbackCommand` 的输出对项目级与页面级两种阶段分别落在正确路径；验证：`contracts.test.ts` 新增一例（现 43 例）

## 5. 文档

- [x] 5.1 `skills/xpi-prototype-design/SKILL.md` §8.5 把四类表改为五类，并补 CLI 用法与「同一判定」的理由；验证：与 delta spec 的类别名逐字一致
- [x] 5.2 `docs/semantic-ui-map-schema.md` §11 工具表补五类与命令入口；验证：与 `promotion-core.ts` 的字段名一致
- [x] 5.3 双语 README：工具表补五类、第 6 步补 `dynamic_attribute` 的处置、补 CI 用法（`node bin/check-promotion.mjs`）；验证：两份 README 的口径一致
- [x] 5.4 双语 README 补「不要复写判定脚本」的提醒（D6）：指出 `docs/prototype-to-production.md` §7 那段 bash 是**降级替代**，装了本包就调 CLI；验证：该提醒出现在两份 README 的可见处，不只在被忽略的 `docs/notes/` —— 两处 README 第 6 步后各有一段 blockquote，并写进了实测数字（脚本 `OK: 16` vs 工具「命中 10，缺 6」）

## 6. 校验

- [x] 6.1 `openspec validate harden-promotion-check --strict` 通过 —— 首轮**不通过**：我在 MODIFIED 块里把一个 scenario 改了名字，而 MODIFIED 是整块替换，归档会丢掉原 scenario。改回原名后通过
- [x] 6.2 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 三条全绿；验证：三条退出码为 0（test：18 文件 / 342 例）
- [x] 6.3 新 `src/promotion-core.test.ts`：断言核心模块不依赖 `typebox` / Pi 运行时（用一次不含这两者的导入路径跑通判定）；验证：该测试单独运行通过 —— 实现为**剥注释后**的 import 闭包静态断言 + 一次真实子进程跑 CLI。**必须剥注释**：`promotion-core.ts` 的文档注释里就写着 `from "typebox"` 这串字面量（用来说明为什么要分层），不剥会立刻假红
- [x] 6.4 `pnpm coverage` 不跌破 `vitest.config.ts` 的门槛；验证：命令退出码为 0（`promotion-core.ts` 91.85% 行 / 96.47% 分支 / 90.9% 函数）
- [x] 6.5 `git status --short` 只出现预期文件；验证：无意外新增或删除
