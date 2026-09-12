# tasks.md — 原型设计 4 模式命令

- 工作流标识：`xpi-fast-fix/2026-09-13-prototype-design-modes`
- 创建时间：2026-09-13T04:12+08:00
- 关联：`README.md`（状态与恢复）、`plan.md`（方案）、`tasks.initial.md`（只读基线）
- 状态机：`pending → in_progress → done`；`in_progress → failed`；`failed → pending`（仅明确修订方案后允许重试）

任务清单（共 20 项）：

## 1. 契约层

- [x] 1.1 新增 MODES 闭集与 isMode(验收:MODES 含 wireframe/hifi/update/archive 四项且 wireframe 与 hifi 同属 KINDS;验证:`pnpm exec vitest run src/contracts.test.ts`)
  - 验证：`pnpm exec vitest run src/contracts.test.ts` → 1 file / 16 tests passed；2026-09-13 04:13
- [x] 1.2 项目 slug 校验(验收:接受 subscription-page 与 a1,拒绝空串、..、a/b、-x、x- 与超长;验证:`pnpm exec vitest run src/contracts.test.ts`)
  - 验证：`pnpm exec vitest run src/contracts.test.ts` → 1 file / 21 tests passed；2026-09-13 04:14
- [x] 1.3 parseCommandArgs 改返回 mode 与选项反查助手(验收:update 解析出 mode=update,hifi 需求 解析出 mode=hifi 且 rest 保留,反查凭 indexOf 不用字符串解析路径;验证:`pnpm exec vitest run src/contracts.test.ts`)
  - 验证：`pnpm exec vitest run src/contracts.test.ts` → 1 file / 25 tests passed；`pnpm typecheck` → exit 0；2026-09-13 04:14
  - 说明：同步更新了唯一调用方 `src/index.ts` 的解构与 mode 判定，避免留下编译不过的中间态；update/archive 分支仍走 showStatus，4.4/4.5 接入。
- [x] 1.4 归档条目渲染与 rollbackCommand 带 project(验收:v1 条目无回滚行,v2 回滚路径同时含 project 与 kind;验证:`pnpm exec vitest run src/contracts.test.ts`)
  - 验证：`pnpm exec vitest run src/contracts.test.ts` → 1 file / 29 tests passed；2026-09-13 04:16
  - 说明：级联同步了 `src/artifacts.ts` 的两处调用点（renderChangelogEntry / rollbackCommand），否则中间态编译不过。

## 2. 文件系统层

- [x] 2.1 artifactDirectory 接受 project 并做 slug 加越界双校验(验收:project 为 .. 或含 / 时抛错且无任何文件系统副作用,合法时路径落在 .pi/prototype-design/<project>/<kind>;验证:`pnpm exec vitest run src/artifacts.test.ts`)
  - 验证：`pnpm exec vitest run src/artifacts.test.ts` → 1 file / 13 tests passed；覆盖 `rejects traversal and separators before touching the filesystem`（断言 `.pi` 未被创建）与 `the same guard covers snapshot, state and preview`；2026-09-13 04:16
- [x] 2.2 setupArtifacts、snapshotArtifact、readArtifactState、findPreviewTarget 全部加 project 参数(验收:原有断言的等价场景在带 project 后仍通过,预览越界校验基址变为 <project>/<kind>/current;验证:`pnpm exec vitest run src/artifacts.test.ts`)
  - 验证：`pnpm exec vitest run src/artifacts.test.ts` → 1 file / 13 tests passed；新增断言含「两项目在同一个产物根下互不干扰」「版本号按阶段而非按项目递增」「预览越界仍被拒」；2026-09-13 04:16
  - 级联：`src/tools.ts` 四工具 schema 与 `src/index.ts` 调用点同步（见 3.1、4.x）。
- [x] 2.3 新增 listProjects 汇总全部活跃 (project,kind)(验收:建两个项目共三条记录后返回三条且各带 versions 与 currentFileCount;验证:`pnpm exec vitest run src/artifacts.test.ts`)
  - 验证：`pnpm exec vitest run src/artifacts.test.ts` → 1 file / 24 tests passed；覆盖「空壳阶段不列出」「带 versions 与 latestEntry」「无产物根返回空数组」「归档目录不被当成项目」；2026-09-13 04:18
  - 实现修正：plan.md §9 原写「archive/ 是单层目录故天然排除」，实为错误——`archive` 本身是合法 slug。已改为按名字显式跳过 `ARCHIVE_DIR`，并补了断言。
- [x] 2.4 新增 archiveProject 执行移动与记账(验收:归档后该条不再出现在 listProjects 中,archive/CHANGELOG.md 顶部存在该条且含可执行恢复命令,<project>/ 变空时被删除;验证:`pnpm exec vitest run src/artifacts.test.ts`)
  - 验证：`pnpm exec vitest run src/artifacts.test.ts` → 1 file / 24 tests passed；覆盖「移走后 v1 内容仍在归档目录」「同日同名自动加 -2 不覆盖」「兄弟阶段仍在时不删项目目录」「目标不存在时拒绝且不留下 .pi」「日志顶部含恢复命令」；2026-09-13 04:18
- [x] 2.5 新增 detectLegacyLayout 只读探测旧顶层布局(验收:存在顶层 <kind>/ 时被报告为 legacy 且目录未被移动;验证:`pnpm exec vitest run src/artifacts.test.ts`)
  - 验证：`pnpm exec vitest run src/artifacts.test.ts` → 1 file / 24 tests passed；覆盖「报告顶层 wireframe 且目录仍在」「项目维度布局下返回空」「无产物根返回空」；2026-09-13 04:18

## 3. 工具层

- [x] 3.1 四个工具的 schema 与 describeState 加 project(验收:prototype_setup 缺少 project 时被 schema 拒绝,传入非法 slug 时被拒;验证:`pnpm typecheck`)
  - 验证：`pnpm typecheck` → exit 0；`pnpm test` → 3 files / 48 tests passed；新增 `tool schemas` 断言用 `Value.Check` 实测四个工具缺 project 与传入 `..`/`a/b`/`/abs`/`.hidden`/`Upper` 均被拒；2026-09-13 04:16
  - 后续调整：3.2 把 `prototype_status` 的 project 改为可选后，该断言拆成「三个工具必填 + status 可总览」，见 3.2 说明行。
- [x] 3.2 prototype_status 在无 project 时汇总全部(验收:输出含每个 (project,kind) 一行,存在旧布局时附 legacy 提示;验证:`pnpm typecheck`)
  - 验证：`pnpm typecheck` → exit 0；新增 `src/tools.test.ts` → 5 tests passed（总览行数/按 kind 过滤/空态文案/旧布局提示不改动目录/无 project 时仍能产出）；`pnpm test` → 4 files / 66 tests passed；2026-09-13 04:20
  - 契约变更：`prototype_status` 的 `project` 改为可选，`src/index.test.ts` 的 schema 断言相应拆成「三个工具必填」与「status 可总览」两组。

## 4. 命令层

- [ ] 4.1 补全改用 pi-tui 的 fuzzyFilter 并覆盖四个模式(验收:prefix 为空返回四项,prefix 为 w 只剩 wireframe;验证:`pnpm exec vitest run src/index.test.ts`)
- [ ] 4.2 无模式时用 select 列出四项并支持 undefined 回退(验收:select 返回 undefined 时不抛错且 notify 被调用并列出四项;验证:`pnpm exec vitest run src/index.test.ts`)
- [ ] 4.3 wireframe 与 hifi 分支含 hifi 双入口(验收:存在带 wireframe 产出的项目时,选项含基于该项目线框与直接开始新的高保真,后者文案含优先线框提示;验证:`pnpm exec vitest run src/index.test.ts`)
- [ ] 4.4 update 分支(验收:列表与实际活跃 (project,kind) 一一对应,kickoff 消息带 --project 与 --kind;验证:`pnpm exec vitest run src/index.test.ts`)
- [ ] 4.5 archive 分支(验收:选中后调用 archiveProject 且不发送任何 skill 消息;验证:`pnpm exec vitest run src/index.test.ts`)

## 5. 技能与文档

- [ ] 5.1 更新 SKILL.md(验收:含项目 slug 生成规则、四模式参数说明、hifi 双入口、update 与 archive 说明;验证:`grep -c project skills/xpi-prototype-design/SKILL.md`)
- [ ] 5.2 更新双语 README 用法表与产物结构图(验收:两份内容一致且含四模式与 archive 目录;验证:`grep -n archive README.md README.zh-CN.md`)
- [ ] 5.3 CONTEXT.md 增加项目与归档术语、AGENTS.md 职责边界补一行(验收:两处术语就位且避免用词区列出禁用同义词;验证:`grep -n 归档 CONTEXT.md`)

## 6. 门禁

- [ ] 6.1 三条门禁全绿(验收:三条命令均 exit 0 且 vitest 无失败用例;验证:`pnpm typecheck && pnpm -w run lint && pnpm test`)
