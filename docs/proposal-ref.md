# 修改本项目的原因

## Why

线框原型 `.pi/prototype-design/app-shell-sidebar/wireframe/current/index.html` 已长到 9816 行 / 458.6 KB，超过工具一次完整读取的上限（2000 行 / 50 KB）五倍以上。结果是：想改其中一屏的任意一处，都必须先分 5–10 次翻页把文件拼回上下文——这才是"每次修改都是整个框架 HTML"和"容易出错"的机制性原因，而不是代码质量问题。

同时，线框阶段没有按屏文件，导致两件事做不了：

- 无法回答"这一屏的线框定稿了吗"——没有可指认的落点，只有一整份文件。
- 无法把某一屏单独推进到高保真——高保真阶段（`archive/hifi-*`）已经是**一屏一个产物**（`hifi-sol/plan.md`：本轮只产出项目库-剧集页），OpenSpec 也已有一屏一个 change 的先例（`high-fidelity-project-library`，10/10 complete）。缺的正好是线框这一环。

现在做，是因为线框还要继续演进（已到 v25），每多一轮，单文件搬运的成本和出错面只会变大。

## What Changes

- **BREAKING**（对原型工作流而言）线框产物从单文件改为单入口 + 外链资源：`current/index.html`（图标精灵、应用外壳、视图容器、对话框）加 `current/styles/**` 与 `current/js/**`。打开方式不变，仍是 `file://` 直开 `current/index.html`。
- 按 **屏 × 关注点** 切分样式与脚本边界，使"改一屏"只落在该屏对应的源文件上，不再整份文件重写。切分粒度由"可一次完整读取"倒推，不是固定行数。
- 线框覆盖层从 `:root` 全局 token 重映射改为**按屏作用域**，使同一运行原型内可按屏切换线框 / 高保真视觉；保真度随当前屏整体生效（含外壳），不做半屏混合。
- 回归网补齐当前零覆盖的屏（资产管理、思维图、历史会话抽屉、项目库 board 面板），并把"无控制台错误 / 容器非空"作为每屏的兜底断言。
- 不引入构建步骤、打包器、依赖或 `node_modules`；不引 ES module（`file://` 下被 CORS 拒绝），沿用同目录经典 script 共享作用域。

## Capabilities

### New Capabilities

- `prototype-delivery/per-screen-files`: 线框产物的按屏交付形态与边界——单入口、无构建、每个源文件可被一次完整读取、每屏源文件独立因而可单独修改与单独推进阶段。
- `prototype-delivery/per-screen-fidelity`: 同一运行原型内按屏切换线框 / 高保真视觉，且保真度切换不改变信息架构与交互行为。
- `prototype-delivery/screen-render-coverage`: 每一屏都有可运行的渲染断言；结构搬运或产物形态改造不得让任何屏静默失效。

### Modified Capabilities

无。`openspec/specs/` 当前为空（仅有 `.gitkeep`），不存在既有能力需求被修改；`openspec/changes/high-fidelity-project-library` 的能力尚未同步到基线，本变更不触碰它。

## Impact

**受影响文件**（全部在 `.pi/prototype-design/app-shell-sidebar/wireframe/`）

- `current/index.html` —— 9816 行降为约 800 行，只保留图标精灵、应用外壳标记、六个视图容器与对话框。
- `current/styles/**` —— 新增。设计 token、基础与组件样式、外壳样式、线框覆盖层，以及按屏样式。
- `current/js/**` —— 新增。辅助函数、i18n 词典与扫描器、示例数据、状态、外壳行为、路由、动作分发，以及按屏脚本。
- `current/verify-i18n.mjs` —— 增加按屏渲染兜底断言；probe 注入 `<base href>` 以让相对资源路径在临时目录下仍可解析。
- `plan.md` / `tasks.md` / `CHANGELOG.md` —— 记录形态决策与版本沿革。

**不受影响**

- `src/`、生产运行时、依赖、API、数据存储。
- 高保真归档（`.pi/prototype-design/archive/hifi-*`）与 `docs/prototypes/app-shell-sidebar.html` 原件。
- 界面信息架构、交互行为、状态覆盖与文案。

**依赖与兼容性**

- 不新增依赖，不新增构建步骤，不需要本地服务器。
- 唯一新增的隐式契约是 `<script src>` 的加载顺序，因此"控制台无错误"必须是每屏断言的一部分。
- 产物从"可以单文件转发"变为"需要整个目录"，与既有的快照与回滚单位（`cp -R` 整个 `current/`）一致。

**风险边界**

- 回归网当前对资产管理与思维图为零断言，因此"搬运后逐字相同"本身需要先补网才成立；搬运与补网分轮进行，不同轮混做。

**明确延后（不在本变更）**

- 落地到 `src/app/` 的 Next.js 实现——原型职责止于高保真，落地是后续独立变更。
- `renderAll()` 改为只重画当前屏的渲染优化——本变更只降低编辑半径，不改渲染行为。
- 为每一屏单独建立 OpenSpec 能力（沿用 `high-fidelity-project-library` 的先例，一屏一个变更）。
