# plan.md — 原型设计 4 模式命令

- 工作流标识：`xpi-fast-fix/2026-09-13-prototype-design-modes`
- 创建时间：2026-09-13T04:12+08:00
- 关联：`README.md`（状态与恢复）、`tasks.md`（工作清单）、`tasks.initial.md`（只读基线）

## 1. 目标

`/xpi-prototype-design` 命令支持 4 个模式并在无参数时列出可选项：

| 模式 | 行为 |
| :--- | :--- |
| `wireframe` | 创建线框原型设计 |
| `hifi` | 创建高保真原型设计；可选「基于已有线框」或「直接开始」，并在选项描述中提示推荐先做线框 |
| `update` | 列出当前项目中已有的原型设计项目，选一个进入修改流程 |
| `archive` | 列出已有项目，选一个执行归档 |

同时：输入 `xpi-prototype-design` 加空格即列出全部模式；支持首字母/子序列过滤。

## 2. 非目标

- 不写旧布局自动迁移代码（见 §4）。
- 不引入任何新依赖（复用 `@earendil-works/pi-tui` 已导出的 `fuzzyFilter`）。
- 不执行任何 Git 操作；不自动提交、推送、合并。
- 不引入交互式配置面板。
- 不改动 SKILL.md 中既有的阶段技能映射表内容，只补模式说明。

## 3. 证据

| # | 事实 | 位置 |
| :--- | :--- | :--- |
| E1 | 模式闭集只有 2 个：`KINDS = ["wireframe","hifi"]` | `src/contracts.ts` |
| E2 | `parseCommandArgs` 返回 `{kind, rest}`，无法表达 `update`/`archive` | `src/contracts.ts` |
| E3 | 补全用 `startsWith`，非模糊 | `src/index.ts` `completions()` |
| E4 | 尾随空格会触发参数补全且 `argumentText` 为空串 | `node_modules/@earendil-works/pi-tui/dist/autocomplete.js:234` |
| E5 | `fuzzyFilter` 是 `@earendil-works/pi-tui` 的公开导出 | `pi-tui/dist/index.d.ts:20` |
| E6 | Pi 内置 `/model`、`/thinking`、`/login` 的补全即使用 `fuzzyFilter` | `pi-coding-agent/dist/modes/interactive/interactive-mode.js:462-493` |
| E7 | `ctx.ui.select(title, options, opts)` 只接受 `string[]`，无 description 字段 | `pi-coding-agent/dist/core/extensions/types.d.ts:70` |
| E8 | 本仓不存在 `.pi/` 目录，扩展未发布 | `ls -la .pi/` → No such file or directory |
| E9 | `getArgumentCompletions` 返回空数组时补全层直接返回 `null`（不渲染） | `pi-tui/dist/autocomplete.js:245` |

E4 + E9 合起来说明：**「输空格即列选项」不需要新代码**，只要补全函数对空串返回非空数组；当前实现已满足，缺的只是把 `update`/`archive` 加入模式集。

## 4. 根因 / 假设

**根因**：不是缺陷，而是功能缺口。模式集是 2 元闭集，且产物布局是「阶段即顶层目录」，导致 `update`/`archive` 所要的「项目列表」没有可列举的实体——最多只能列出 `wireframe` 和 `hifi` 两个固定名字。

**假设 A1（已验证）**：项目维度是列表有意义的前提。已由用户选择「引入项目维度」确认。

**假设 A2（已验证）**：无存量数据，不需要迁移。E8 显示本仓无 `.pi/` 产物目录；扩展尚未发布，唯一产物来自测试用的临时目录。故本次只做**只读探测**，发现旧的顶层 `<kind>/` 布局时仅提示，不搬迁。

**假设 A3**：`archive/` 与 `<project>/` 永远位于同一个 `.pi/prototype-design/` 之下，因此同属一个文件系统，`rename` 不会遇到 `EXDEV`。若该假设不成立，"失败处理"一节规定了行为。

## 5. 推荐方案

### 5.1 目录布局

```text
<cwd>/.pi/prototype-design/
├── <project-slug>/              # kebab-case，如 subscription-page
│   └── <kind>/                  # wireframe | hifi
│       ├── plan.md
│       ├── principles.md
│       ├── DELTA.md             # 仅 hifi
│       ├── CHANGELOG.md
│       ├── current/             # 工作副本
│       └── v1/ v2/ ...          # 不可变快照
└── archive/
    ├── CHANGELOG.md             # 归档日志，倒序
    └── <YYYY-MM-DD>-<project>-<kind>/   # 归档产物（内容同上，去掉外层包裹）
```

### 5.2 契约层

- `KINDS = ["wireframe","hifi"]` 保持不变（阶段闭集）。
- 新增 `MODES = ["wireframe","hifi","update","archive"]`（命令模式闭集）与 `isMode()`。
- 新增项目 slug 校验：`/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/`，拒绝空串、`..`、含 `/`、前导/尾随连字符、超长。
- `parseCommandArgs` 改为返回 `{ mode, rest }`。
- 新增选项文本与索引的反查助手：`select` 只给字符串，必须通过 `indexOf` 反查回结构体，**禁止从字符串解析路径**。
- `rollbackCommand` 与归档条目渲染都带上 project。

### 5.3 文件系统层（`src/artifacts.ts`）

所有函数加 `project` 参数：

| 函数 | 变化 |
| :--- | :--- |
| `artifactDirectory(root, project, kind)` | 双重校验：slug 合法 + 解析后路径仍在 `.pi/prototype-design/` 内 |
| `setupArtifacts(root, project, kind)` | 同上；THEMES.md 分发逻辑不变 |
| `snapshotArtifact(root, project, kind, input)` | 路径加 project；回滚命令加 project |
| `readArtifactState(root, project, kind)` | 返回值加 `project` |
| `findPreviewTarget(root, project, kind, file?)` | 越界校验基址改为 `<project>/<kind>/current/` |
| `listProjects(root)` | 新增：遍历 `.pi/prototype-design/*/*`，返回活跃 `(project, kind)` 列表 |
| `archiveProject(root, project, kind)` | 新增：`rename` 到 `archive/<date>-<project>-<kind>/`，写归档日志，空项目目录清理 |
| `detectLegacyLayout(root)` | 新增：探测顶层 `<kind>/`，只读 |

### 5.4 工具层（`src/tools.ts`）

- `prototype_setup { project, kind }`
- `prototype_snapshot { project, kind, change, reason?, files? }`
- `prototype_preview { project, kind, file? }`
- `prototype_status { project?, kind? }` — 不传 `project` 时汇总全部并附 legacy 提示

### 5.5 命令层（`src/index.ts`）

```text
/xpi-prototype-design                    → select 4 个模式
/xpi-prototype-design wireframe <需求>    → kick off，agent 深挖后自定 project slug
/xpi-prototype-design hifi [<需求>]       → select: 有 wireframe 产出的项目 / 直接开始新的高保真
/xpi-prototype-design update             → select 活跃 (project,kind) → kick off 带 --project/--kind
/xpi-prototype-design archive            → select 活跃 (project,kind) → 移动 + 记日志（不 kick off）
```

- 补全改用 `fuzzyFilter`（E5/E6）。
- `ctx.ui.select` 返回 `undefined`（非 TUI 模式或用户取消）时回退 `notify` 列出全部，不抛错。
- `hifi` 的「直接开始」选项标签内嵌提示：建议优先完成线框设计。
- `project` 由 agent 在深挖后从 `plan.md` 主题生成（写进 SKILL.md），命令层不猜。

### 5.6 归档失败处理

`rename` 是原子的：要么成功、要么无副作用。异常时直接抛出真实错误，**不做部分清理**。若出现 `EXDEV`（假设 A3 不成立），如实报错并提示手动 `mv`，不静默降级为 `cp` + `rm`。

## 6. 放弃的方案

| 方案 | 放弃原因 |
| :--- | :--- |
| 阶段即项目（维持现状） | `update`/`archive` 列表最多 2 项，需求要的「列表选择」没有信息量 |
| 双轨兼容（优先项目，回退阶段） | E8 证明无存量数据，白付一层布局判定分支 |
| archive 原地加 `.archived` 标记 | 顶层目录不会变干净，归档与活跃混在一起，且 `update` 需额外读标记 |
| archive 移出到 `docs/design-archive/` | 离开扩展工作区后不再可识别，无法用 `update` 恢复 |
| 归档额外写 `ARCHIVE.md` | 摘要内容可从 `plan.md` 与 `CHANGELOG.md` 推得，属重复维护 |
| 命令层传项目名 | 与需求描述抢参数位，必然歧义 |
| 从 `select` 返回字符串解析路径 | 一旦标签格式变化即静默选错项目、动错数据 |
| 写旧布局自动迁移 | 无存量数据，且迁移是破坏性操作，不该由扩展自动做 |

## 7. 涉及范围

| 文件 | 改动 |
| :--- | :--- |
| `src/contracts.ts` | `MODES`/`isMode`、slug 校验、`parseCommandArgs` → mode、选项反查、归档条目渲染、`rollbackCommand` 带 project |
| `src/artifacts.ts` | 全部函数加 project；新增 `listProjects`/`archiveProject`/`detectLegacyLayout` |
| `src/tools.ts` | 4 个工具 schema 与 `describeState` 加 project |
| `src/index.ts` | 4 分支 handler、select 列表、fuzzy 补全、非 TUI 回退 |
| `src/contracts.test.ts` | mode 解析、slug 校验、归档条目 |
| `src/artifacts.test.ts` | 项目维度路径、`listProjects`、`archiveProject`、legacy 探测 |
| `src/index.test.ts` | 4 模式注册、列表选择、archive 不 kick off、非 TUI 回退 |
| `skills/xpi-prototype-design/SKILL.md` | slug 生成规则、4 模式参数、hifi 双入口、归档说明 |
| `README.md` / `README.zh-CN.md` | 用法表与产物结构图 |
| `CONTEXT.md` / `AGENTS.md` | 新增「项目」「归档」术语；职责边界补一行 |

## 8. 决策记录

| 决策 | 取值 | 依据 |
| :--- | :--- | :--- |
| 项目粒度 | `<project>/<kind>/` | 用户选择 |
| 归档落地 | `rename` 到 `archive/<date>-<project>-<kind>/` | 用户选择；可逆、不碰 Git |
| 归档记录 | 仅 `archive/CHANGELOG.md` 倒序 | 用户选择 |
| 项目名产生时机 | agent 深挖后生成 slug | 避免与需求描述抢参数位 |
| 补全过滤 | `fuzzyFilter` | E5/E6，与宿主内置命令一致且无新依赖 |
| `archive` 的「已完成」判定 | 列出现有产出，由用户在面板判断 | 无任务清单概念，扩展不猜 |
| 空项目目录 | 归档后若为空则删除 | 避免留下空壳 |

## 9. 风险与兼容性

| 风险 | 处理 |
| :--- | :--- |
| 工具签名破坏性变更（`project` 变必填） | 未发布、无外部调用方；同步面 = `SKILL.md` + README 用法表 |
| `project` 来自模型，属信任边界 | slug 校验 + 路径越界校验，双重拒绝 |
| 选项文本与路径解耦 | 靠 `indexOf` 反查索引，不解析字符串 |
| 非 TUI 模式（RPC/print）无 select | 返回 `undefined` 时回退 `notify`，不抛错 |
| `rename` 跨设备失败（`EXDEV`） | 如实报错 + 提示手动 `mv`；不静默降级 |
| 归档后 `update` 误列已归档项 | `listProjects` 只遍历 `.pi/prototype-design/*/*`，`archive/` 是单层目录故天然排除；需有测试断言 |

## 10. 假设与默认值

- 假设 A1/A2/A3 见 §4。
- `archive` 列出「存在产出」的 `(project, kind)`；是否完成由用户判断。
- 项目 slug 由 agent 生成后需在对话中告知用户；改名不在本计划范围内。
- `hifi` 双入口中「直接开始新的高保真」仍需 agent 深挖后决定 slug。

## 11. 验证命令

```bash
pnpm typecheck
pnpm -w run lint
pnpm test
```

单项任务另用：

```bash
pnpm exec vitest run src/contracts.test.ts
pnpm exec vitest run src/artifacts.test.ts
pnpm exec vitest run src/index.test.ts
```

## 12. 验收标准

- [ ] 三条门禁全部 exit 0。
- [ ] `/xpi-prototype-design` 无参数时列出 4 个模式；输入 `"w"` 时只剩 `wireframe`。
- [ ] `xpi-prototype-design` 加空格同样列出 4 个模式。
- [ ] `hifi` 在有 `wireframe` 产出的项目存在时，选项包含「基于该项目线框」与「直接开始新的高保真」，后者描述含优先线框的提示。
- [ ] `update` 列出的项目与实际 `.pi/prototype-design/*/*` 一一对应。
- [ ] `archive` 后活跃列表不再包含该项，`.pi/prototype-design/archive/CHANGELOG.md` 顶部存在该条记录，且记录内含可执行的恢复命令。
- [ ] `project` 传入 `..` 或含 `/` 时被拒绝，不产生任何文件系统副作用。
- [ ] 旧的顶层 `<kind>/` 布局被提示但不被移动。
