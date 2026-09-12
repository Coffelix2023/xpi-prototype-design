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
| 模式 (mode) | 命令模式闭集：`wireframe` / `hifi` / `update` / `archive`。 | 类型即 `Mode`；前两项与 `KINDS` 同构 |
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

## 避免用词 (Banned Synonyms)

- 用「阶段」指 `kind`：不要写「stage / 类型」。
- 用「模式」指 `Mode` 闭集：不要与「阶段」混用——`update` / `archive` 是模式但不是阶段。
- 用「项目」指产物目录第一层的 slug：不要写「设计稿 / 工程 / workspace」。
- 用「归档」指移进 `archive/`：不要写「删除 / 下线」——它是可逆移动，不是销毁。
- 用「快照」指 `vN` 目录复制：不要写「备份 / checkpoint」。
- 用「预览」指打开浏览器；「像素评审」专指用 `xpi-visualoop` 看真实渲染像素。
- 用「项目根」指目标项目 `cwd`：本仓库是扩展本体，不是产物存放处。
- 用「Git 卫生检查点」指 `docs/GIT-WORKFLOW.md` §3：不要写「git 检查 / pre-commit 流程」。
- 「直推」不是违规词：阶段一下它就是默认回路，不要用它暗示「需要特别授权」。
