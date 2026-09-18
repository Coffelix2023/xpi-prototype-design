# OpenDesign 借鉴评估报告

> 对象:`nexu-io/open-design`(下称 **OD**)。
> 决策:不接线、不安装 OD、只借核心。交付物为研究报告,不改代码。
> 证据等级:全部来自 OD 仓库源码与官方文档(路径可查);**未在本机运行 OD**,凡涉及运行时行为的结论均标注「未实测」。

## TL;DR

**可以借,但只有 2 项值得借,其中 1 项有代码价值。**

- 本项目的自检清单(`skills/xpi-prototype-design/SKILL.md` §11)是一份**纯 prose 清单,没有任何机器校验**。OD 有对应的 artifact lint(产物校验)机制。把 §11 里可机检的条目变成可执行校验,是唯一有代码价值的借鉴 —— 它补的缺口是「绿灯不假」。
- 其余借鉴项里,2 项本项目**已覆盖**(只读/写盘分离、设计系统与技能的职责分离),2 项**不该借**(导出矩阵、sandbox iframe 预览 —— 属于产品扩张或已有替代 lane)。
- OD 与本项目是**同层关系**(都在「生成原型产物」),不是上下游。因此不存在「集成」的正当理由,只有「借鉴」的理由。

---

## 0. 目标与范围

- **本轮目标**:判断能否把 OD 集成进本项目,以及怎么接。
- **用户裁定**:方向 = 只借架构不接线;目标 = 不安装 OD,只借核心;交付 = 只出研究报告。
- **范围外**:任何运行时验证、安装 OD、代码改动、发布为 OD 插件。

---

## 1. 已确认事实:OD 侧

| # | 事实 | 出处 |
| :--- | :--- | :--- |
| F1 | 桌面形态的 local-first 应用:Electron shell + Express daemon + `od` CLI + stdio MCP(`od mcp`)。Web 是 Next.js 16。仓库 3.4 GB 单体 monorepo | `docs/architecture.md` §1–§3 |
| F2 | **OD 已内置 `pi` adapter**(transport `pi-rpc`):`pi --mode rpc [--model] [--thinking] [--append-system-prompt <dir>]`,prompt 走 stdin JSON-RPC;`pi --list-models` 做模型发现;读 `.pi/sessions/*.jsonl` 做 resume | `docs/agent-adapters.md` §3、§5.10 |
| F3 | OD 跑 Pi 时**自动批准所有 dialog**:`confirm → true`,`select → 第一个选项`;`notify` / `setStatus` / `setTitle` 等 fire-and-forget 静默吞掉(web UI 无对应面) | `docs/agent-adapters.md` §5.10 |
| F4 | 每轮运行前,把 skill 目录**真实拷贝**到 `<project-cwd>/.od-skills/<basename>-<hash>/`(非符号链接);prompt 同时给相对与绝对路径 | `docs/skills-protocol.md` §3 |
| F5 | Plugin = 文件夹含 `SKILL.md`(必需,可移植锚点)+ 可选 `.claude-plugin/plugin.json` + 可选 `open-design.json` sidecar。发现路径含 `<projectCwd>/.claude/skills/<id>/` 与 `~/.claude/skills/<id>/` | `docs/plugins-spec.md` §3–§7 |
| F6 | Plugin 的 apply **只注入 prompt、写 `.mcp.json`、stage assets**,**不启动隐藏 runtime** | `docs/plugins-spec.md` §1、§8 |
| F7 | MCP 工具集是项目/文件/run 级:`list_projects`、`get_active_context`、`get_file`、`get_artifact`、`extract_refs`、`write_file`、`delete_*`、触发 run;stdio 幂等,30 分钟空闲退出 | OD `apps/daemon/src/mcp.ts` |
| F8 | License = **Apache-2.0** | `LICENSE` |

**由 F2 + F3 得到的推论(若将来接线,这是唯一的真实阻塞点)**

OD 的 Pi adapter 在 project cwd 里 spawn `pi`,本扩展会自动在该 Pi 进程内生效,方向「OD 驱动 Pi」天然成立、零代码。但 F3 让 `prototype_gate` 的闸门被「自动选第一个选项」应答,而首轮第一个选项恰好是**「仅保存」** —— 拿不到 `execute` 许可,**后续所有写盘被 `tool_call` 钩子硬阻断**。这是设计冲突,不是配置问题。本轮不接线,故仅记录。

---

## 2. 已确认事实:本项目侧

| # | 事实 | 位置 |
| :--- | :--- | :--- |
| P1 | Pi 扩展,无构建步骤,`package.json` 的 pi manifest 直指 `src/index.ts` | `package.json` |
| P2 | 工具集分两类:**只读**(`semantic_ui_map_validate` / `semantic_ui_map_parse` / `prototype_status` / `prototype_page_impact`)与**写盘**(`prototype_setup` / `_snapshot` / `_gate` / `_migration_execute` / `semantic_ui_map_annotate`),分文件实现 | `src/*.ts` |
| P3 | `prototype_gate` 是**硬闸门**:`tool_call` 钩子阻断,未拿到本轮 `execute` 记录前一个字都不写 | `src/gate.ts` |
| P4 | **§11 完成前自检实测为 20 条 checkbox,纯 prose,零机器校验**。其中 2 条本可机检且无既有工具覆盖 | `skills/xpi-prototype-design/SKILL.md` §11(本轮 `grep -c` 实测 20) |
| P5 | `THEMES.md` 是 CSS 变量形态的 token 契约(`--primary: oklch(…)` 等),§6 明确「消费 `THEMES.md`,不改写它」 | `THEMES.md`、`SKILL.md` §6 |
| P6 | 仓库自带示例 `examples/semantic-ui-map/index.html` 实测:32 处 `var(--…)`,12 处色值字面量,**全部集中在 `:root`(第 9 行起)**,组件规则只用 `var(--…)` | 本轮实测 `grep` |

**P6 的意义**:§11「无硬编码色值;所有颜色可在 `THEMES.md` 找到出处」这条**规则是清晰且低误报的** —— 允许色值字面量只出现在 `:root`,组件规则里只允许 `var(--…)`。反过来,朴素的「全文扫色值」写法会在这份示例上直接误报 12 处,做出一个没人愿意看的 linter。

---

## 3. 借鉴清单:逐项判定

| # | OD 对应物 | 本项目现状 | 判定 | 理由 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | artifact lint(产物校验,含 anti-slop) | §11 是 prose,无校验器 | **借**(唯一有代码价值) | 补「绿灯不假」的缺口。但**只借可机检部分**,审美规则不借(见 §4) |
| 2 | `od.craft.requires`:design-system 上下文 → 通用手艺规则 → skill body 的**分层注入顺序** | §6 是一张**平表**,无层级与顺序 | **借**(纯文档) | 纯文本改动,把「用哪些技能」升级为「按什么顺序叠哪一层」 |
| 3 | `SKILL.md` body 保持可移植(扩展专属元数据放 sidecar) | body 里夹带本扩展工具名 | **借**(写作规范,低优先) | 工具名是执行手段,不能删;可借的是**区分「可移植描述」与「本扩展专属机制」两段** |
| 4 | 只读工具幂等可重试,写操作不重放 | 只读/写盘已分文件、分工具 | **已覆盖** | P2 已满足 |
| 5 | design-system 包:`DESIGN.md` prose 必须与 `tokens.css` 契约同步 | `THEMES.md` 是契约,但无法证明 HTML 与它一致 | **部分借**(并入第 1 项) | 本质是同一个校验器的另一条规则,不单独立项 |
| 6 | 导出矩阵 HTML / PDF / PPTX / MP4 | `src/preview.ts` 只开系统浏览器 | **不借** | 本项目是**原型**产出,deck/PPTX 属于 OD 的产品面。功能扩张,非架构借鉴 |
| 7 | sandboxed iframe 预览 + 圈选反馈 | 已有 `xpi-visualoop` 这条外部 lane 看真实像素 | **不借** | 已有替代 lane,再造一套是重复建设 |
| 8 | 把本项目发布为 OD plugin(marketplace 一键安装) | — | **不借**(本轮) | F6:plugin 只注入 prompt。本项目的机制全在 TypeScript 工具里,非 Pi runtime 下专用工具不存在,闸门/快照/字典校验会**全部静默失效**。降级成 prose 手工流程等于把逻辑重写一遍 |

---

## 4. 唯一推荐落地项:产物校验(artifact lint)

### 4.1 规则来源:只取 §11 里可机检的条目

| §11 原条目 | 可否机检 | 规则形态 |
| :--- | :--- | :--- |
| 无硬编码色值;所有颜色可在 `THEMES.md` 找到出处 | 可 | 色值字面量只允许出现在 `:root` 块内;组件规则只允许 `var(--…)` |
| `current/` 没有任何外部网络请求 | 可 | 禁 `http://` / `https://` 资源引用、`fetch(`、`@import url(` |
| 可修改元素已分配语义 ID | 部分可 | 已被 `semantic_ui_map_annotate` 的返回值计数覆盖,不重复造 |
| `semantic_ui_map_validate` 返回 `valid` | 可 | 已有工具 |
| `prototype_snapshot` 已执行 | 可 | 已有工具 |

净新增只剩**前两条**。其余由既有工具覆盖。

### 4.2 明确不借:anti-slop 审美规则

OD 的 lint 里有「anti-slop」这类反模板味规则。**不借** —— 审美不可机检,把主观判断写成规则只会产出两种结果:要么天天误报被关掉,要么永远绿灯成为假绿灯。本项目的对应手段是 §6 里那三个可选质感技能(`design-taste-frontend` / `high-end-visual-design` / `minimalist-ui`),已经是对的位置。

### 4.3 接口形状(若实施)

- 只读能力,**不新增工具**是首选:先在 `SKILL.md` §11 把这两条改写成可核对的语句(agent 自己用 `bash` 核),零工具表面积成本。
- 只有当「agent 反复不自查」被实际观察到时,才升级为一个只读校验工具,并放到 `src/semantic-tools.ts` 同侧(只读文件),不碰 `gate.ts`,闸门射程不变。

### 4.4 License 注意事项

| 情形 | 义务 |
| :--- | :--- |
| 借鉴**设计思想**(本报告 §3 全部条目) | 无义务 |
| 复制 OD **代码**(Apache-2.0)进本项目(MIT) | 许可兼容,但须保留 OD 的版权声明与 `NOTICE` 文件;被复制文件需带出处注释 |

本报告推荐的全部条目都属第一类,无 License 义务。

---

## 5. 未决问题

1. **这两条自检规则是否真出过问题?** 无证据表明曾经触发。若从未触发,规则的价值只是「保险」,优先级应降到最低。
2. **是否值得为 2 条规则引入校验?** 若走 §4.3 的首选路径(只改文档),成本≈0;若要工具化,要权衡工具表面积的持续维护成本。
3. **将来是否需要 PDF / 图片导出?** 若原型的下游是评审材料而非工程交付,导出会重新变成真需求;那时应重新评估 OD 的导出矩阵,而不是现在预先接上。
4. **若将来要接线,`prototype_gate` 的无 dialog 降级路径够不够?**(见 §1 推论)。现有降级机制(`print` / `json` 模式用 `answer` 回填)正好是这种情况的形状,但**未实测**能否覆盖 F3 的自动批准。

---

## 6. 建议下一步

### 最小可用 MVP

**只改文档,不加代码。** 在 `SKILL.md` §11 把两条自检条目从「陈述」改写成「可执行的核对动作」,并在 §6 引入 OD 式的分层顺序(视觉基础层 → 组件层 → 状态层 → 质感层)。

### 验收检查

- [ ] §11 的两条能一句话说清怎么核(不依赖任何新工具)
- [ ] §6 的分层顺序与现有那张平表的技能集合**完全一致**,不新增、不删除技能
- [ ] 两份文档改完,`pnpm typecheck` / `pnpm -w run lint` / `pnpm test` 仍全绿
- [ ] 没有任何代码改动,回滚 = 单文件 revert

### 明确不做

- 不安装 OD、不注册 `od mcp`、不加 `open-design.json`、不发布 marketplace
- 不改 `src/` 下任何文件
- 不引入导出功能、不引入 iframe 预览层
- 不复制 OD 任何源码

---

## 7. 附:OD 关键路径索引(将来查证用)

| 关注点 | 路径 |
| :--- | :--- |
| 运行时拓扑与组件边界 | `docs/architecture.md` |
| agent adapter 契约与 Pi adapter(§5.10) | `docs/agent-adapters.md` |
| skill 格式、发现优先级、运行时 staging | `docs/skills-protocol.md` |
| plugin / marketplace 契约与安装来源 | `docs/plugins-spec.md` |
| MCP server 与工具集 | `apps/daemon/src/mcp.ts` |
| 设计系统契约 | `design-systems/README.md`、`docs/design-system-*.md` |
| 外部编排器嵌入 OD | `docs/orchestrator-workspaces.md` |
