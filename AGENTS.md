# AGENTS.md — xpi-prototype-design

> 本文件是本仓库内 AI Agent 与人类开发者的**唯一事实来源 (Single Source of Truth)**。
> 所有变更必须可解释、可回滚。当口头约定、历史代码与本文件冲突时,**以本文件为准**。

## 职责边界

**做什么**

- 在目标项目 `cwd` 内生成与迭代两类原型产物：`wireframe`（灰阶 + 内联 SVG 结构稿）、`hifi`（自包含 HTML 高保真稿）。
- 维护产物骨架 `<cwd>/.pi/prototype-design/<project>/<kind>/`；`THEMES.md` 缺失时把包内模板复制到项目根。
- 提供四个命令模式：`wireframe` / `hifi` / `update` / `archive`。前三者 kick off agent；`archive` 由命令层直接完成，不唤起 agent。
- 维护版本链：`current/` 是工作副本，`vN/` 是不可变快照，`CHANGELOG.md` 倒序记账并给出回滚命令。
- 维护归档：把整个 `<project>/<kind>/` 移进 `archive/`，并在 `archive/CHANGELOG.md` 记录含恢复命令的条目。
- 通过 `skills/xpi-prototype-design/SKILL.md` 告诉 agent 每个阶段该调用哪些设计技能。
- 维护语义字典 `<project>/semantic-ui-map.yaml`（产品级，跨页面与跨保真度共享），并在产出后按 `id` 把徽标落进 HTML（`semantic_ui_map_annotate`）。

**不做什么**

- 不产出可直接合并的产品组件代码——那是目标项目自身的职责。
- **不生成 HTML 原型**：HTML 由 agent 写，扩展只做后处理（补徽标属性、注入徽标 CSS/JS）。同理不接管客户端路由——SPA 的显示/隐藏是原型自己的事。
- 不替用户判断「某个项目做完了没有」——是否归档由用户在面板里决定，扩展只执行归档动作。
- 不启动受控浏览器、不建 CDP 会话；像素级评审交给 `xpi-visualoop`。本扩展只用平台原生命令打开系统默认浏览器。
- 不修改 Pi 的 system prompt；不接管终端渲染；不访问网络。
- 不写入任何密钥，不做遥测。

## 0. TL;DR(Agent 执行守则)

- 每次对话在头部声明"[@PRJ-AGENTS.md]"
- 本仓库是一个 **Pi Coding Agent 扩展 (pi-extension)**,即被 Pi 主进程加载的 Node.js 插件。**不是 Web 应用**。
- **核心栈**:TypeScript (strict) + Node.js + Pi 原生 UI(`ctx.ui.*` / `@earendil-works/pi-tui`)+ Biome + pnpm + Vitest + typebox。
- **无构建步骤**:Pi 直接加载 `src/index.ts` TypeScript 源码。禁止引入 tsup/esbuild/dist 产物。
- **类型真相**:Pi 的 API 签名以 `node_modules/@earendil-works/*` 的 `.d.ts` 为准。**动手前先读类型,不凭记忆猜 API**。
- 任何代码修改后,必须分别保证 `pnpm typecheck`、`pnpm -w run lint`、`pnpm test` 全部通过,否则视为未完成。

## 1. 运行时契约

1. 入口 `src/index.ts` 默认导出 register 函数:`export default function (pi: ExtensionAPI): void`。
2. `package.json` 的 pi manifest 指向 TS 源码:`{ "pi": { "extensions": ["./src/index.ts"] } }`。
3. Pi API 与 typebox 声明为 **peerDependencies(optional)**,版本锁在 devDependencies。
4. 扩展运行在 Pi 主进程内,终端归 Pi TUI 所有。交互一律用 `ctx.ui.*`,禁止 ink/inquirer 等抢终端的库。
5. 尊重 Project Trust:项目级配置(`<cwd>/.pi/*.json`)仅在项目被信任时生效。

## 2. 技术栈

Node.js + pnpm(版本见 `mise.toml`)、TypeScript strict、Biome(lint+format)、Vitest、typebox。
**实装版本以 pnpm-lock.yaml 为准**,不在本文件硬写大版本号。

## 3. 目录结构

```
.
├── mise.toml / package.json / biome.jsonc / tsconfig.json / pnpm-workspace.yaml
├── AGENTS.md / CONTEXT.md / DESIGN.md / README.md / README.zh-CN.md
├── docs/semantic-ui-map-schema.md   # 字典 schema 唯一文档
├── examples/semantic-ui-map/        # 可运行示例（SPA + 徽标开关）
└── src/
    ├── index.ts           # 扩展入口(register)+ 命令接线
    ├── semantic-ui-map.ts # 语义字典:双码、加载、解析、六类校验、版本递增
    ├── semantic-ui-map-yaml.ts # 最小 YAML 解析器(本 schema 子集)
    ├── badge-template.ts  # 徽标 CSS/JS 模板与 HTML 注入
    └── semantic-annotate.ts # semantic_ui_map_annotate 工具
```

`skills/`、`prompts/` 等资源目录在**有真实内容时**再加入 pi manifest,不预建空目录。

## 4. 编码与 API 约定

- **Tools**:每个 Tool 用 typebox 声明输入 Schema;只读与变更工具严格分离;输出必须有界(大输出先截断/摘要)。
- **Hooks**:生命周期事件以安装版本类型为准;钩子内不做重活,重活放异步任务或子进程。
- **Prompt Hygiene**:永不修改 Pi 的 system prompt;注入指令用对话消息追加,精简、可移除,空闲不注入。
- **配置与密钥**:配置解析 fail-closed;Token/API Key 绝不写入代码、日志、示例或文档,仅经环境变量或 `chmod 0600` 文件存储,日志一律脱敏。

- **视觉与 TUI 规范**：所有涉及终端渲染、状态栏、通知与字符排版的改动，必须严格遵循根目录 `DESIGN.md` 中的 Token 与 8 大章节规范。

## 5. 命令与开发回路

```bash
pnpm typecheck        # tsc --noEmit
pnpm -w run lint      # workspace root: biome check .
pnpm test             # vitest run
pnpm coverage         # vitest run --coverage（带 semantic-ui-map 四个模块的 80% 下限）
```

- 提交前三条全绿。
- 若 lint 输出意外出现 ESLint,先确认 `scripts.lint` 仍为 `biome check .`,再运行 `pnpm exec biome check .` 诊断;禁止安装 ESLint。
- `vitest.config.ts` 只收 `src/**/*.test.ts`。`docs/notes/` 是参考资料（含 vendored 第三方仓库），其测试依赖不在本包，收进来会让 `pnpm test` 永远红。

## 6. 语义字典（semantic-ui-map）

**它解决什么**：用户说「把那个折叠按钮改一下」时，Agent 不必截图或反问。每个可修改元素拿一个稳定的双码标识，HTML 上角标显示短码。

**架构决策（改动前必读）**：

| 决策 | 内容 | 理由 |
| :--- | :--- | :--- |
| 字典位置 | `<project>/semantic-ui-map.yaml`，产品级 | 跨页面、跨保真度共享是「脊柱模型」的前提：同一元素在 wireframe 与 hifi 的 `id`/`short` 不变 |
| 双码分隔符 | 短码 `-`（`P1-2-B1`），全路径 `.`（`chat.composer.send-btn`） | 两种码在格式上互斥，解析器不必猜；`-` 是合法 HTML `id` 字符，`#P1-2-B1` 可直接做 CSS 选择器 |
| 徽标渲染 | `::before` + `attr(data-semantic-badge)`，`--badge-display` 一个变量控显隐 | 不污染 DOM，复制元素源码时徽标自动消失；开关只改一个 CSS 变量，不遍历 DOM |
| 属性命名 | 元素属性 `data-semantic-badge`，注入标记 `data-badge-system`，**两者必须不同名** | 同名会让元素上第一个徽标属性骗过 `injectBadgeSystem` 的幂等检查，静默跳过注入（已出过这个 bug，`badge-template.test.ts` 里有回归用例） |
| HTML 归属 | HTML 由 agent 写，扩展只做后处理 | 扩展不生成 HTML；`semantic_ui_map_annotate` 按 `id` 匹配，写错的靠返回值里的计数暴露，不静默 |
| 范围过滤 | `multi-page` 按 `fidelities[stage]` 只标注指向本文件的元素；`spa` 按 `id` 命中 | 短码只在页面内唯一，跨页面全量匹配会串台 |
| 路由归属 | SPA 的显示/隐藏由原型自己实现（非活动页面容器 `display:none`），契约写在 SKILL.md §8.5 | 徽标是元素的 `::before`，容器隐藏则徽标一并隐藏；扩展猜标记契约会静默失效 |
| YAML 解析 | 手写最小子集（`semantic-ui-map-yaml.ts`），不引依赖 | 零运行时依赖；schema 固定，不需要完整 YAML 1.2。支持与不支持的范围见 schema 文档 §10 |
| 校验 | 六类问题码；`version`/`updated` 由快照递增时只改这两行，不重新序列化字典 | 人工写的注释与字段顺序必须活下来 |

**集成点**：

- `prototype_setup` → `createEmptySemanticMap`（幂等，已存在不覆写）
- `prototype_snapshot` → `incrementSemanticMapVersion`（失败静默降级，不让一次成功的快照看起来像失败）
- `semantic_ui_map_annotate` → `annotateStage`（字典缺失时一个字节都不写）
- 不改 `prototype_preview`、`prototype_gate`：预览逻辑自包含，闸门只管写盘许可

**文档与示例**：字段真相在 [`docs/semantic-ui-map-schema.md`](./docs/semantic-ui-map-schema.md)，与 `src/semantic-ui-map.ts` 类型一一对应；可运行示例在 [`examples/semantic-ui-map/`](./examples/semantic-ui-map/)（其字典与 HTML 由 `src/semantic-flow.test.ts` 守着，腐烂即测试失败）。

**新增字段/枚举时**：同步四处——`src/semantic-ui-map.ts` 的类型与闭集、`src/contracts.ts` 的出口、`docs/semantic-ui-map-schema.md`、`skills/xpi-prototype-design/SKILL.md` 的 §8.5。
