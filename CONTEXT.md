# CONTEXT.md — xpi-prototype-design 术语表 (Glossary)

本文件定义本仓库的统一语言 (Ubiquitous Language)。代码、文档、issue、commit 中使用下列术语,禁止漂移为同义词。

| 术语 | 定义 | 备注 |
| :--- | :--- | :--- |
| 阶段一 | 单人快速迭代优先的仓库阶段。默认允许在本仓内按仓库约束工作。 | 以 `docs/GITHUB-GUARD.md` 为准 |
| 阶段二 | 更严格的协作阶段。默认分支 + PR + 人工合并。 | 以后切换时再启用 |
| 直推 | 直接 push 到主分支。 | 仅在仓库阶段与规则明确允许时才可能出现 |
| PR | Pull Request，合并请求。 | 远端协作入口 |
| ruleset | GitHub 仓库规则集。 | 由用户在 GitHub UI 管理 |
| 远端同步 | 先 fetch，再决定是否 rebase / push / 停止。 | 避免覆盖与分叉 |
| 阶段 (kind) | 产物类别，闭集 `wireframe` / `hifi`。 | 类型即 `Kind` |
| 产物目录 | `<cwd>/.pi/prototype-design/<kind>/`。 | 相对项目根 |
| current | 阶段内唯一可变目录，agent 直接改它。 | 工作副本 |
| vN | 第 N 次产出的不可变快照目录。 | 版本号只增不减 |
| 快照 (snapshot) | 把 `current/` 存为下一个 `vN/` 并追加 CHANGELOG 条目的动作。 | 由 `prototype_snapshot` 保证一致性 |
| CHANGELOG | 阶段内唯一的倒序迭代日志，最新条目在最上方。 | 由工具写入，禁止手工改格式 |
| THEMES.md | 项目根的主题事实来源，shadcn oklch token。 | 缺失时由包内模板补齐；已存在则绝不覆写 |
| DELTA.md | hifi 相对 wireframe 的结构偏离登记表。 | 仅 hifi 阶段存在 |
| 预览 (preview) | 用系统默认浏览器打开产物。 | 与「像素评审」区分 |
| 像素评审 | 用 `xpi-visualoop` 抓真实渲染像素并让用户圈选反馈。 | 受控 Chromium + 独立 profile |

## 避免用词 (Banned Synonyms)

- 用「阶段」指 `kind`：不要写「模式 / stage / 类型」。
- 用「快照」指 `vN` 目录复制：不要写「备份 / checkpoint」。
- 用「预览」指打开浏览器；「像素评审」专指用 `xpi-visualoop` 看真实渲染像素。
- 用「项目根」指目标项目 `cwd`：本仓库是扩展本体，不是产物存放处。
