# tasks.initial.md — 只读基线

> **只读基线，禁止修改；用于与 `tasks.md` 对比检测任务遗漏。**
>
> 本文件是 `.pi/fast-fixes/2026-09-13-prototype-design-modes/tasks.md` 的初始版本。
> 执行期间任何步骤（含失败处理、恢复、重试）都不得修改、重命名或删除本文件。
> 每次写入 `tasks.md` 后，须对比两者的任务 id 集合与顺序；基线中存在而 `tasks.md` 缺失的即为遗漏。

---

# tasks.md — 原型设计 4 模式命令

- 工作流标识：`xpi-fast-fix/2026-09-13-prototype-design-modes`
- 创建时间：2026-09-13T04:12+08:00
- 关联：`README.md`（状态与恢复）、`plan.md`（方案）、`tasks.initial.md`（只读基线）
- 状态机：`pending → in_progress → done`；`in_progress → failed`；`failed → pending`（仅明确修订方案后允许重试）

任务清单（共 20 项）：

## 1. 契约层

- [ ] 1.1 新增 MODES 闭集与 isMode(验收:MODES 含 wireframe/hifi/update/archive 四项且 wireframe 与 hifi 同属 KINDS;验证:`pnpm exec vitest run src/contracts.test.ts`)
- [ ] 1.2 项目 slug 校验(验收:接受 subscription-page 与 a1,拒绝空串、..、a/b、-x、x- 与超长;验证:`pnpm exec vitest run src/contracts.test.ts`)
- [ ] 1.3 parseCommandArgs 改返回 mode 与选项反查助手(验收:update 解析出 mode=update,hifi 需求 解析出 mode=hifi 且 rest 保留,反查凭 indexOf 不用字符串解析路径;验证:`pnpm exec vitest run src/contracts.test.ts`)
- [ ] 1.4 归档条目渲染与 rollbackCommand 带 project(验收:v1 条目无回滚行,v2 回滚路径同时含 project 与 kind;验证:`pnpm exec vitest run src/contracts.test.ts`)

## 2. 文件系统层

- [ ] 2.1 artifactDirectory 接受 project 并做 slug 加越界双校验(验收:project 为 .. 或含 / 时抛错且无任何文件系统副作用,合法时路径落在 .pi/prototype-design/<project>/<kind>;验证:`pnpm exec vitest run src/artifacts.test.ts`)
- [ ] 2.2 setupArtifacts、snapshotArtifact、readArtifactState、findPreviewTarget 全部加 project 参数(验收:原有断言的等价场景在带 project 后仍通过,预览越界校验基址变为 <project>/<kind>/current;验证:`pnpm exec vitest run src/artifacts.test.ts`)
- [ ] 2.3 新增 listProjects 汇总全部活跃 (project,kind)(验收:建两个项目共三条记录后返回三条且各带 versions 与 currentFileCount;验证:`pnpm exec vitest run src/artifacts.test.ts`)
- [ ] 2.4 新增 archiveProject 执行移动与记账(验收:归档后该条不再出现在 listProjects 中,archive/CHANGELOG.md 顶部存在该条且含可执行恢复命令,<project>/ 变空时被删除;验证:`pnpm exec vitest run src/artifacts.test.ts`)
- [ ] 2.5 新增 detectLegacyLayout 只读探测旧顶层布局(验收:存在顶层 <kind>/ 时被报告为 legacy 且目录未被移动;验证:`pnpm exec vitest run src/artifacts.test.ts`)

## 3. 工具层

- [ ] 3.1 四个工具的 schema 与 describeState 加 project(验收:prototype_setup 缺少 project 时被 schema 拒绝,传入非法 slug 时被拒;验证:`pnpm typecheck`)
- [ ] 3.2 prototype_status 在无 project 时汇总全部(验收:输出含每个 (project,kind) 一行,存在旧布局时附 legacy 提示;验证:`pnpm typecheck`)

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
