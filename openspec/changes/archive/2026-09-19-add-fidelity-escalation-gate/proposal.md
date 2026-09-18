## Why

保真度阶梯（wireframe → hifi → 成品）在本项目里被当作**默认必经路径**执行，但没有任何 spec 规定「什么时候不该往上走」。而本项目自己在 [`docs/prototype-to-production.md`](../../../docs/prototype-to-production.md) §6 已经判定：原型 HTML 无法继承进成品代码（自包含 HTML 与 React/Tailwind 之间转换有损，codegen 被明确列为「不做」）。

于是每一次跃迁都是**纯重写，只继承决策**：视觉与交互在 hifi 里实现一遍，在成品里再实现一遍。当决策者就是开发者本人、视觉系统已由 Tailwind + shadcn + `THEMES.md` 固定时，hifi 这一层**不产出任何新决策**，只剩重写成本。用户在实际 web-app 开发中已经撞上这个亏损。

既有 spec 只规定了「推进时 `id` / 链接不变」（`prototype-screen-orchestration` → *Page fidelity advances*），是一条**单边**规则：它保证跃迁安全，却让跃迁看起来总是正确。缺口就在这里。

## What Changes

- `prototype-screen-orchestration` 新增 Requirement：**保真度推进以「本轮还剩什么未定决策 + 谁来做这个决策」为判据**，而不是以保真度阶梯为默认路径。
- 新增三条互斥判据分支，并要求 Agent 在写入计划前显式选一条：
  - 判定者本人 + 视觉系统已定 → **跳过 hifi**
  - 外部决策者不读代码 → **限缩 hifi**（1 屏完整，不做全流程全状态）
  - 视觉方向有 ≥2 个真候选 → **1 屏 × N 个方向**，用于比选
- 新增 Requirement：**跳级不是少做一层，而是义务前移**。跳过 hifi 时，hifi 阶段的决策义务（状态覆盖、贴近真实长度的文案、可修改元素的语义 ID）SHALL 在 wireframe 阶段完成。跳过 hifi 而线框质量不达标的产出 SHALL NOT 被视为合格。
- 新增 Requirement：**区分「结构重调」与「视觉调试」**。结构重调是流程缺陷（已由 §7「hifi 的继承纪律」覆盖）；视觉调试不可避免，但正因不可避免，SHALL 只在成品发生一次，不在 hifi 与成品发生两次。
- `SKILL.md` §7 补判据与三步检查表；§6 在 hifi 分支入口补「先过判据，判定跳过就不要再进 hifi 表」。
- 不新增工具、不改代码、不引入新依赖。

## Capabilities

### New Capabilities

无。本次不引入新能力，只修正既有能力里保真度推进的单边假设。

### Modified Capabilities

- `prototype-screen-orchestration`：新增三条 requirement —— 保真度推进判据、跳级的义务前移、结构重调与视觉调试的区分。既有的 *Page fidelity advances* 与 *Mixed page maturity is represented* 不变（它们描述跃迁发生后的性质，本次补的是跃迁是否该发生）。

## Impact

- **文档**：`skills/xpi-prototype-design/SKILL.md` §6（hifi 分支入口）与 §7（`hifi 的继承纪律` 之后新增判据小节）。这是本 change 的唯一实现面。
- **代码**：无。不新增工具，不碰 `src/`，闸门射程不变。
- **消费方（本仓外）**：`docs/prototype-to-production.md` 描述的生产桥不受影响；本次改的是「要不要走到 hifi」，不是「hifi 之后怎么推进生产」。
- **明确不做**：
  - 不做「保真度自动推荐」工具。判据依赖「谁是决策者」，这是 Agent 在对话里读到的信息，工具读不到；做成工具只会产出假绿灯。
  - 不规定 hifi 的屏数上限以外的配额（例如「hifi 最多 N 个版本」）。真实阈值应按项目定，写死会变成新的教条。
  - 不动 `prototype_gate`。跳级判定发生在写盘之前，与本轮的写盘许可正交。
