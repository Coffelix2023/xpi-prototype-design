# xpi-prototype-design

[English](./README.md) · **简体中文**

**把设计讨论落成可版本化、可评审的原型产物的 Pi Coding Agent 扩展。**

**A Pi Coding Agent extension that turns design discussions into versioned, reviewable prototype artifacts.**

<!-- TODO: 补一个 LICENSE 文件(MIT),下面的徽章指向它 -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

```text
> /xpi-prototype-design
```

## 为什么

设计讨论留在会话里没问题,可一旦对话结束,就没人说得清哪一版才是被拍板的那一版。线框评审通过了,高保真阶段却悄悄漏掉一个 CTA,唯一的记录只剩滚动历史。本扩展把整条回路落在磁盘上、留在项目里、并且版本化:结构化深挖的结论写进 `plan.md`,产出落进 `current/` 工作副本,每轮都存成 `vN/` 快照,并把回滚命令记进唯一一份倒序 `CHANGELOG.md`。主题色来自 `THEMES.md`——由扩展创建一次,此后绝不覆写。

本仓库里的每个扩展都从同样四条规则出发:

- **没有构建步骤。** Pi 直接加载 `./src/index.ts`,没有 `dist/`、没有打包器、不提交编译产物。
- **Pi 原生 UI。** 渲染走 `ctx.ui.*` 与 `@earendil-works/pi-tui`,绝不劫持终端,也不引入竞争性的终端框架。
- **没有重度运行时依赖。** 只用宿主提供的 API 加严格类型;工具 Schema 用 `typebox`,其余依赖都要先证明自己值得。
- **门禁严格,没有例外。** TypeScript strict、Biome、Vitest 三条全绿才能提交。

它也不越界:扩展是被 Pi 主进程加载的插件,不是独立服务。确实需要进程边界时,先写一份 ADR 说明理由,再动手。

## 技术栈

- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/),版本锁定在 [`mise.toml`](./mise.toml)
- [Pi Coding Agent](https://github.com/earendil-works/pi) —— 宿主本体、扩展 API 与 `@earendil-works/pi-tui`
- TypeScript strict(`target: ES2024`,`module: NodeNext`)
- [Biome](https://biomejs.dev/) 负责 lint 与格式化
- [Vitest](https://vitest.dev/) 作为测试运行器

## 安装

前置条件:一个可用的 Pi 安装。本包直接从源码加载,安装前不需要任何构建。

```bash
pi install git:github.com/Coffelix2023/xpi-prototype-design
```
`pi install` 写入 `~/.pi/agent/settings.json`;加 `-l` 写入项目设置,项目被信任后 Pi 会自动安装。固定的 git ref 不会被 `pi update` 移动。

```bash
pi list                              # 已安装的包
pi update --extensions               # 更新包并校对固定的 ref
pi remove git:github.com/<owner>/xpi-prototype-design
```

包级调试刻意只走 npm / git 远程源:本地路径安装只是在 settings 里留一条指向工作目录的引用,一旦忘记 `pi remove`,残留的脏路径就会和正式安装双份并存。

## 用法

| 命令 | 说明 |
| --- | --- |
| `/xpi-prototype-design` | 显示两个阶段的版本、当前产出数量、CHANGELOG 顶部与 `THEMES.md` 状态 |
| `/xpi-prototype-design wireframe <需求>` | 建好线框阶段骨架,并展开 `skills/xpi-prototype-design/SKILL.md` |
| `/xpi-prototype-design hifi <需求>` | 建好高保真阶段骨架,并展开同一份技能文档 |

两个阶段都可以用命令的参数补全直接选出来。

### 工具

| 工具 | 读什么 | 改什么 | 拒绝什么 |
| --- | --- | --- | --- |
| `prototype_setup` | `<cwd>/.pi/prototype-design/<kind>/`、`<cwd>/THEMES.md` | 补建缺失的目录与文档骨架;`THEMES.md` 缺失时复制包内模板 | 绝不覆写已存在的文档或 `THEMES.md` |
| `prototype_snapshot` | `<cwd>/.pi/prototype-design/<kind>/current/` | 写出 `v<N>/`,并在 `CHANGELOG.md` 顶部插入一条记录 | `current/` 为空时拒绝执行 |
| `prototype_status` | 两个阶段 | 不修改任何东西 | 绝不写盘 |
| `prototype_preview` | `<cwd>/.pi/prototype-design/<kind>/current/` | 用系统默认浏览器打开该文件 | 拒绝任何越出 `current/` 的路径 |

所有路径都由 `ctx.cwd` 推导,任何工具都不接受模型传入的任意文件系统根目录。工具输出上限 2000 字符。

### 产物结构

```text
<cwd>/
├── THEMES.md                          # shadcn oklch token —— 主题的事实来源
└── .pi/prototype-design/
    └── wireframe/                     # 或 hifi/
        ├── plan.md                    # 需求;每轮深挖后覆写
        ├── principles.md              # 本阶段的硬约束
        ├── DELTA.md                   # 仅 hifi:相对线框的结构偏离
        ├── CHANGELOG.md               # 倒序,最新在最上方
        ├── current/                   # 工作副本 —— 改这里
        └── v1/ v2/ ...                # 不可变快照
```

## 开发

```bash
mise install                         # 安装锁定版本的 Node.js 与 pnpm
pnpm install
```

| 门禁 | 命令 |
| --- | --- |
| 类型 | `pnpm typecheck` —— `tsc --noEmit` |
| Lint 与格式 | `pnpm -w run lint` —— Biome 全仓检查 |
| 测试 | `pnpm test` —— Vitest(`vitest run --passWithNoTests`) |

提交前三条必须全绿。Lint 请在 workspace root 显式运行 `pnpm -w run lint`;包装层偶发会把裸写的 `pnpm run lint` 误判为未知递归命令。

开发期运行扩展有两种方式:

```bash
pi -e ./src/index.ts                 # 冒烟:只加载一次,仅本次运行,不写配置
```

```bash
ln -s "$(pwd)" ~/.pi/agent/extensions/xpi-prototype-design   # 日常回路:在 Pi 内用 /reload 热载
```

`pi -e` 不写任何设置;软链由扩展目录自动发现,`rm` 掉软链即干净。

## 目录结构

```text
.
├── mise.toml / package.json / biome.jsonc / tsconfig.json / pnpm-workspace.yaml
├── AGENTS.md / CONTEXT.md / DESIGN.md
├── THEMES.md                  # 包内 shadcn token 模板,会被复制进目标项目
├── docs/                      # Git 工作流与仓库约束
├── skills/xpi-prototype-design/SKILL.md   # 阶段流程 + 该调用哪些设计技能
└── src/
    ├── index.ts               # 扩展入口(register)+ 两个子命令
    ├── contracts.ts           # Kind 枚举、目录布局、CHANGELOG 格式
    ├── templates.ts           # plan / principles / DELTA / CHANGELOG 骨架
    ├── artifacts.ts           # 文件系统:setup、snapshot、state、预览目标
    ├── preview.ts             # 系统默认浏览器启动器
    └── tools.ts               # 注册的四个工具
```

## 设计规范

本项目遵循 [Google Labs DESIGN.md 规范](https://github.com/google-labs-code/design.md),并专门为终端 TUI 场景定制。详见 [`DESIGN.md`](./DESIGN.md) 查看设计 Token(颜色、等宽字阶、间距网格与组件定义)。

## 约定与约束

- **术语表**:[`CONTEXT.md`](./CONTEXT.md) 定义了本仓库的统一语言,代码、文档与提交中禁止术语漂移。
- **Git 纪律**:提交或推送前先读 [`docs/GIT-WORKFLOW.md`](./docs/GIT-WORKFLOW.md) 与 [`docs/GITHUB-GUARD.md`](./docs/GITHUB-GUARD.md)。默认回路是**不建分支**、直接在 `main` 上提交与推送:先过 Git 卫生检查点(见 §3),再用小粒度 Conventional Commits。分支、PR 与发布只在用户显式提出时才走。
- **Token 安全**:密钥与 Token 绝不写入代码、日志、示例或文档。
- **Agent 契约**:[`AGENTS.md`](./AGENTS.md) 是本仓库的唯一事实来源。口头约定、历史代码或本 README 与它冲突时,以 `AGENTS.md` 为准。

## 致谢

- [Pi Coding Agent](https://github.com/earendil-works/pi) —— 由 [earendil-works](https://github.com/earendil-works) 开发。本扩展寄宿其中:扩展 API、`ctx.ui` 契约和包清单规范都来自该项目。
<!-- TODO: 采用或移植过的第三方仓库都要在这里致谢:项目名、作者、链接、许可证,以及你取了什么。 -->

## 许可

MIT
