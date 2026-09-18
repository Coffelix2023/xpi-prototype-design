## 1. SKILL.md §7 补判据小节

- [x] 1.1 在 `hifi 的继承纪律` 之后新增小节 `### 什么时候不该升 hifi`，开头写明判据：**这一轮还剩什么未定决策，以及谁来做这个决策**；明说保真度阶梯不是默认路径（requirement: Fidelity advance is decided by remaining decisions）
- [x] 1.2 三分支表，每支给触发条件与产出范围：
  - 决策者是开发者本人 + 视觉系统已定 → **跳过 hifi**，wireframe 即最后一个原型阶段
  - 外部决策者不读代码 → **限缩 hifi**，1 屏完整，不要求全页面全状态覆盖
  - 视觉方向有 ≥2 个真候选 → **1 屏 × N 个方向**，用于比选，不为任一候选建完整流程
- [x] 1.3 记录要求：本轮选了哪一支、为什么，写进 `plan.md`，使后读的人能区分「刻意跳过」与「忘了做」
- [x] 1.4 新增 `### 跳级的义务前移` 小节，写明跳过 hifi ≠ 少做一层，把义务列成 checkbox：状态覆盖（正常/空/加载/错误）、贴近真实长度的文案、可修改元素的语义 ID
- [x] 1.5 在同节写明验收：跳级而上列义务缺失时，不得把跳级说成合理取舍，也不得报「本轮完成」（requirement: Skipping a stage moves its obligations forward）
- [x] 1.6 新增 `### 结构重调 vs 视觉调试` 两行判别表：
  - 块顺序 / 信息层级 / 内容位置变了 → 流程缺陷，登记 `DELTA.md` 并如实报告
  - 只有字体 / 间距 / 密度 / 颜色变了 → 正常，不登记结构偏离
  - 加一条：若同一处外观调整在成品实现里还要再做一遍，记进 `plan.md` 标为延后到成品，不排进原型阶段（requirement: Structural rework is separated from visual tuning）

## 2. SKILL.md §6 hifi 分支入口

- [x] 2.1 在 `### hifi 阶段` 标题下补一行前置说明：进入本表前先过 §7 判据；判定跳过 hifi 就不要调本表任何技能，wireframe 直接进成品
- [x] 2.2 核对 §6 的技能集合**零增减**——本次只改入场条件，不动技能清单

## 3. 校验

- [x] 3.1 `openspec validate add-fidelity-escalation-gate --strict` 通过
- [x] 3.2 人工核对：§7 新增的三个小节与 delta 的三条 requirement 一一对应，无多无漏
- [x] 3.3 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 三条全绿（本次无代码改动，作为回归确认）
- [x] 3.4 确认 `src/` 零改动、`prototype_gate` 未受影响（`git status` 只应出现 `skills/xpi-prototype-design/SKILL.md` 与 `openspec/changes/add-fidelity-escalation-gate/**`）
