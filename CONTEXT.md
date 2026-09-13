# CONTEXT.md — xpi-prototype-design 术语表 (Glossary)

本文件定义本仓库的统一语言 (Ubiquitous Language)。代码、文档、issue、commit 中使用下列术语,禁止漂移为同义词。

| 术语 | 定义 | 备注 |
| :--- | :--- | :--- |
| 阶段一 | 单人快速迭代优先的仓库阶段。默认在 `main` 上直接提交与推送，不建分支。 | 以 `docs/GITHUB-GUARD.md` 为准 |
| 阶段二 | 更严格的协作阶段。默认分支 + PR + 人工合并。 | 以后切换时再启用 |
| 直推 | 直接 push 到 `main`。 | 阶段一的**默认行为**，不是需要额外授权的例外 |
| Git 卫生检查点 | 提交与推送前固定走一遍的检查序列：看状态、精确暂存、检查 cached、约定式提交。 | 见 `docs/GIT-WORKFLOW.md` §3 |
| PR | Pull Request，合并请求。 | 仅由用户显式提出时才走 |
| ruleset | GitHub 仓库规则集。 | 由用户在 GitHub UI 管理；挡的是历史重写与删除，不是普通提交 |
| 远端同步 | 先 fetch，再决定是否 rebase / push / 停止。 | 避免覆盖与分叉 |
| 模式 (mode) | 命令模式闭集：`wireframe` / `hifi` / `execute` / `update` / `archive`。 | 类型即 `Mode`；`wireframe` / `hifi` 与 `KINDS` 同构，`execute` 是执行腿入口但不产新目录 |
| 项目 (project) | 一个设计项目的 slug，产物目录的第一层。 | 小写 kebab-case；同一项目的 `wireframe` 与 `hifi` 必须同名 |
| 阶段 (kind) | 产物类别，闭集 `wireframe` / `hifi`。 | 类型即 `Kind`；项目下的第二层，不含 `update` / `archive` |
| 产物目录 | `<cwd>/.pi/prototype-design/<project>/<kind>/`。 | 相对项目根 |
| current | 阶段内唯一可变目录，agent 直接改它。 | 工作副本 |
| vN | 第 N 次产出的不可变快照目录。 | 版本号只增不减 |
| 快照 (snapshot) | 把 `current/` 存为下一个 `vN/` 并追加 CHANGELOG 条目的动作。 | 由 `prototype_snapshot` 保证一致性 |
| CHANGELOG | 阶段内唯一的倒序迭代日志，最新条目在最上方。 | 由工具写入，禁止手工改格式 |
| THEMES.md | 项目根的主题事实来源，shadcn oklch token。 | 缺失时由包内模板补齐；已存在则绝不覆写 |
| DELTA.md | hifi 相对 wireframe 的结构偏离登记表。 | 仅 hifi 阶段存在 |
| 预览 (preview) | 用系统默认浏览器打开产物。 | 与「像素评审」区分 |
| 像素评审 | 用 `xpi-visualoop` 抓真实渲染像素并让用户圈选反馈。 | 受控 Chromium + 独立 profile |
| 归档 (archive) | 把整个 `<project>/<kind>/` 移进 `archive/` 的动作。 | 可逆；命令层直接执行，不经过 agent |
| 恢复命令 | 归档日志里记录的反向 `mkdir -p` + `mv`。 | 由工具生成，可直接粘贴执行 |
| 规划腿 (planning leg) | 深挖需求并把结论落盘成 `plan.md` + `tasks.md` 的那一段，终点即计划闸门。 | 规划腿不产出 `current/` 里的文件 |
| 执行腿 (execution leg) | 从 `tasks.md` 第一个未完成任务接着产出，直到全部勾选的那一段。 | 由 `execute` 模式或用户明确发话触发；不重新深挖 |
| 任务清单 (tasks.md) | 阶段内的任务与进度账本，一行一个任务，checkbox 即状态。 | 执行腿唯一的事实来源；`parseTaskProgress` 只数方框，不解析正文 |
| 任务进度 (task progress) | `完成数 / 总数`，由 `tasks.md` 的 checkbox 数出。 | `prototype_status` 显示为 `任务 2/7`；null 表示计划还没落盘 |
| 跳过 (skipped) | 任务行保留但行尾标 `⏭ skipped: <原因>`。 | 仍算未完成，不许删行——删行等于伪造完成 |
| 计划闸门 (plan gate) | 写 `current/` 之前的一次确认，按**轮**生效。首轮（阶段还没有 `vN`）三选一：仅保存计划，稍后执行（默认首选）/ 保存后立即执行 / 还有需要补充的；迭代轮二选一：现在就开始改 / 先给改动清单，等我确认。 | 见 `SKILL.md` §5.1；卡由 `prototype_gate` 弹出，顺序是「先展示、再问、最后落盘」。`update` 轮命令层已经问过一次（见「范围声明」），agent 不必重复弹卡 |
| 闸门答案 (gate answer) | `gate.json` 里的 `save` / `execute` / `more`，由用户在卡上选定。 | 闭集见 `GATE_ANSWERS`；只有 `execute` 放行 `current/`
| 闸门记录 (gate record) | 阶段根的 `gate.json`：用户的选择 + 采集时间 + 本轮基线。 | 由 `prototype_gate` 写；`update` 命令层的范围声明写的是同一份记录。`tool_call` 门禁读它，`prototype_status` 显示它 |
| 范围声明 (scope declaration) | `update` 命令在需求之后弹的那一次选择：直接改（`--scope quick`，落 `execute`）/ 先给改动清单（`--scope plan`，落 `save`）。 | 发生在 agent 启动**之前**，因此不烧 token；无面板的模式（print / json）不问也不写，改由 agent 调闸门兜底 |
| 本轮基线 (baseline) | `gate.json` 里的 `baseline`：弹卡那一刻的版本数。 | 与当前版本数一致时许可才算本轮的；每做一次 `prototype_snapshot` 旧许可自动过期 |

## 避免用词 (Banned Synonyms)

- 用「阶段」指 `kind`：不要写「stage / 类型」。
- 用「模式」指 `Mode` 闭集：不要与「阶段」混用——`execute` / `update` / `archive` 是模式但不是阶段。
- 用「规划腿 / 执行腿」指两段流程：不要写「第一步 / 第二步」，那不是顺序而是两段可分开发生的会话。
- 用「任务清单」指 `tasks.md`：不要写「TODO / checklist 文件」；计划闸门只保存它，不代替它。
- 用「闸门记录」指阶段根的 `gate.json`：不要写「审批文件 / approval flag」——它是用户选择的落盘，不是模型的自我声明。
- 用「项目」指产物目录第一层的 slug：不要写「设计稿 / 工程 / workspace」。
- 用「归档」指移进 `archive/`：不要写「删除 / 下线」——它是可逆移动，不是销毁。
- 用「快照」指 `vN` 目录复制：不要写「备份 / checkpoint」。
- 用「预览」指打开浏览器；「像素评审」专指用 `xpi-visualoop` 看真实渲染像素。
- 用「项目根」指目标项目 `cwd`：本仓库是扩展本体，不是产物存放处。
- 用「Git 卫生检查点」指 `docs/GIT-WORKFLOW.md` §3：不要写「git 检查 / pre-commit 流程」。
- 「直推」不是违规词：阶段一下它就是默认回路，不要用它暗示「需要特别授权」。
