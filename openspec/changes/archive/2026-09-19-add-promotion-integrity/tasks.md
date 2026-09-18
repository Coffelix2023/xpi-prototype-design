## 1. 核对工具模块（`src/promotion-check.ts`，只读）

- [x] 1.1 新建 `src/promotion-check.ts`，导出 `registerPromotionTools(pi)`；只 import 字典加载与 `tools.ts` 的 schema 工具，**不 import `gate.ts`**（design D1）；验证：`grep -n "gate" src/promotion-check.ts` 无输出
- [x] 1.2 构建待扫描文件集合：遍历字典所有元素的 `impl.path`，按项目根解析、去重（design D3）；验证：单元测试断言传入含重复 `impl.path` 的字典时只扫描一次 —— **注**：去重是纯 I/O 优化，读次数不可观测；测试改为断言**可观测契约**——同一 `impl.path` 的元素被一起处理，结果不因路径重复而改变（`promoted` 数元素不数文件，两个元素各得各自的结论）
- [x] 1.3 源码侧字面量匹配：识别 `data-semantic-id=` 后紧跟单双引号、值为**全路径 id** 的形式，带出命中所在文件；不引入 AST（design D2、spec「核对工具比对字典与生产源码」）；验证：单元测试对单引号与双引号两种写法都判为命中，对短码值判为不命中
- [x] 1.4 判定 `missing_in_source`：元素有 `impl` 但该文件里找不到它的 `data-semantic-id`；文件不存在或不可读时报同类并说明原因，**不静默跳过**（spec scenario「impl 指向的文件不存在」）；验证：单元测试覆盖「文件不存在」与「文件存在但无该 id」两条路径，均落在 `missing_in_source`
- [x] 1.5 判定 `unregistered_in_map`：文件里出现的 `data-semantic-id` 值在字典里没有对应 `id`（design D3）；验证：单元测试给一个字典未登记的值，断言落入该类而非被忽略
- [x] 1.6 判定 `unpromoted_child`：独立纯函数，依据 `children` + 子元素 `status: locked` + 子元素 `impl` 有无；**未 `locked` 的子元素不算漏**（design D4、spec「未冻结的子元素不算漏」）；验证：单元测试对 `locked` 与 `confirmed` 两种子元素断言不同结果
- [x] 1.7 统计 `matched`：有 `impl` 且源码里命中的元素数（spec scenario「已推进且源码就位」）；验证：单元测试断言三类问题计数为 0 时 `matched` 等于已推进元素总数
- [x] 1.8 输出有界且分类计数：沿用 `MAX_OUTPUT = 2_000`；四类**分别**计数不合并；`unregistered_in_map` 超出上限时报「共 N 条，已显示 M 条」（design D5）；验证：单元测试构造 30 条未登记值，断言输出含总数与被截断的显示数
- [x] 1.9 工具 schema 定为 `{ project, pageId? }`，`pageId` 缺省时核对字典全部页面（design D6）；验证：单元测试断言传 `pageId` 时只统计该页面元素，不传时覆盖全部页面
- [x] 1.10 字典缺失时报「未做核对」并说明字典缺失，**不返回空结果集冒充通过**（spec scenario「字典缺失」）；验证：单元测试在无字典的项目根上断言返回文案含「未做核对」
- [x] 1.11 输出文案明说「字典维护由 Agent 负责，本工具不判定字典失效」，避免用户把 `unregistered_in_map` 读成字典损坏；验证：单元测试断言该文案出现在 `unregistered_in_map` 非空时的输出里

## 2. 接线与只读保证

- [x] 2.1 `src/index.ts` 注册核对工具，与既有 `register*` 调用并列；验证：`pnpm test` 里 `src/index.test.ts` 的工具清单断言通过（若无该断言则补一条）—— 该断言存在，已把 `prototype_promotion_check` 加进工具名单与 `extras` 参数表，两处「eleven」改为「twelve」
- [x] 2.2 确认 `src/gate.ts` 与写盘路径**零改动**（spec「核对是只读且不阻断的」）；验证：`git diff --stat src/gate.ts` 无输出

## 3. 测试

- [x] 3.1 四类结果各一例，覆盖 `matched` / `missing_in_source` / `unpromoted_child` / `unregistered_in_map`；验证：`pnpm test src/promotion-check.test.ts` 通过（20 例）
- [x] 3.2 只读断言：调用前后字典与生产源码**逐字节相同**（spec scenario「核对不写盘」）；验证：测试里比对调用前后的文件内容
- [x] 3.3 降噪断言：字典里没有 `impl` 的元素**不**出现在任何一类问题里，且整体不报错；验证：用 `examples/semantic-ui-map/semantic-ui-map.yaml`（12 个元素、零 `impl`）跑一次，断言四类计数全为 0
- [x] 3.4 记录已知边界为测试：注释或字符串里出现 `data-semantic-id="x"` 会被判为命中（design §Risks 第 1 条，误判方向是漏报缺失）；验证：断言当前行为并在测试名里写明这是边界而非期望

## 4. 文档

- [x] 4.1 `skills/xpi-prototype-design/SKILL.md` 补搬运纪律：进度以字典 `impl` 为唯一事实来源、`status: locked` 才推进、推进时 `children` 里的 `locked` 子项同轮一并推进；验证：新内容与 delta spec 的三条 requirement 一一对应，无多无漏
- [x] 4.2 `SKILL.md` §11 完成前自检补一条卡点：已推进元素的核对未命中数为 0，或每一个都有已说明的理由；验证：该条是可核对语句而非陈述句
- [x] 4.3 `SKILL.md` 补核对时机：搬运完成后调用 `prototype_promotion_check`；验证：与 §11 那条互相指得通
- [x] 4.4 `docs/prototype-to-production.md` §3 补第四条纪律（推进对包含边完整）；验证：与 §2.1、§3 既有三条纪律并列且不重复
- [x] 4.5 `docs/prototype-to-production.md` §7 标注为「本扩展核对工具的降级替代，非唯一实现」，口径统一为全路径 id；验证：该节内不再出现短码作为匹配依据的说法
- [x] 4.6 `docs/prototype-to-production.md` §8 关闭「同仓 / monorepo / 分离」这条伪未决问题，改写为架构事实（扩展运行在目标项目 `cwd`，项目根 = `cwd`）；验证：该条从「未决问题」移出，并写明依据（已移入「已核实事实」）
- [x] 4.7 `docs/semantic-ui-map-schema.md` 按 `AGENTS.md` §6 四处同步纪律补核对工具的字段口径（`impl` 与 `children` + `status: locked` 的关系）；验证：schema 文档与 `src/semantic-ui-map.ts` 类型仍一一对应
- [x] 4.8 `README.md` / `README.zh-CN.md` 工具表加 `prototype_promotion_check` 一行；验证：两份 README 的工具表条数一致（同时补了两份的源码结构树）
- [x] 4.9 核对 `src/contracts.ts` 出口是否需同步新增类型（`AGENTS.md` §6）；验证：确认后在本条注明结论，不留悬空 —— **结论：无需同步。** `contracts.ts` 只做两件事：再出口 `semantic-ui-map.ts` / `product-map.ts` 的**闭集与实体类型**（`SemanticElement`、`Status`、`ELEMENT_TYPES` 等），以及自身定义跨模块共享的常量与闭集（`ARTIFACT_ROOT`、`KINDS`、`GateAnswer`）。核对工具引入的是**工具结果形状**（`PromotionCheckResult` / `MissingEntry` / `UnpromotedEntry`），与 `ValidateToolResult` / `ParseToolResult` / `ElementSummary` 同类——那三个也都留在各自模块里，不在 `contracts.ts`。本 change 未新增任何闭集或共享实体类型（`impl` 与 `children` 早已存在），故四处的第四处不动

## 5. 校验

- [x] 5.1 `openspec validate add-promotion-integrity --strict` 通过
- [x] 5.2 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 三条全绿；验证：三条命令退出码为 0（test：17 文件 / 326 例）
- [x] 5.3 `git status --short` 只出现预期文件（新模块 + 测试 + 五处文档）；验证：无意外的新增或删除 —— 预期文件之外另有 3 项**非本 change 产生**的工作区改动：`docs/memo-terminal-keybindings.md` 被外部移入 `docs/notes/`、`openspec/specs/prototype-screen-orchestration/spec.md` 被外部归档前一个 change 时合并、`openspec/changes/archive/2026-09-19-add-fidelity-escalation-gate/` 同理
