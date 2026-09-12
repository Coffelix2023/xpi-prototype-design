---
name: xpi-prototype-design
description: Produce or revise wireframe and high-fidelity prototype designs inside the current project, saved as versioned artifacts under .pi/prototype-design/. Use when the user asks for a wireframe, 线框, low-fi layout, high-fidelity mockup, 高保真原型, hifi mockup, prototype revision, or asks to roll forward a prototype from a previous version. Skip it for production component code and for non-design tasks.
license: MIT
---

# xpi-prototype-design

两个阶段，同一套版本机制。阶段参数由 `/xpi-prototype-design <kind>` 带进来：

- `wireframe` — 灰阶 + 内联 SVG 的结构稿
- `hifi` — 自包含 HTML 的高保真稿

## 0. 硬规则（先读，别跳过）

1. **产物只落在** `<cwd>/.pi/prototype-design/<kind>/`。工作副本永远是 `current/`，agent 直接改它。
2. **每轮产出后必须调 `prototype_snapshot`**，否则版本链断裂、无法回滚。
3. **每个阶段各一份 `plan.md`**，每轮深挖后覆写，不新建副本。
4. **主题只来自 `<项目根>/THEMES.md`**（shadcn oklch token）。不硬编码 hex、不自造 token。文件缺失由 `prototype_setup` 从包内模板补齐。
5. **默认暗色 + 默认简体中文界面**，两者都要在页内可切换。
6. **无构建**。hifi 是单文件自包含 HTML，不引 React、不引 Tailwind CDN、不产出 `node_modules`。

## 1. 起手

```
prototype_status            # 看现有版本与日志，别重复劳动
prototype_setup  { kind }   # 幂等；命令入口已经调用过，重调无害
```

若 `prototype_status` 显示已有版本，先读 `current/` 与 `CHANGELOG.md` 顶部几条，再决定是**迭代**还是**新开一号**。

## 2. 深挖需求（3 轮 × 3 问）

用 `ask_user_question`，**一轮一次调用、每轮恰好 3 问**。每轮结束再发一次单问确认卡：`继续深挖` / `开始产出`。用户选后者即刻停止提问。

| 轮次 | 三个问题问什么 |
| :--- | :--- |
| 轮 1 | 目的（这个原型回答什么问题）· 主要用户是谁 · 范围（包含/不包含） |
| 轮 2 | 硬约束（平台、时间、已有设计系统）· 内容与信息层级（先看什么、主 CTA 是什么）· 成功标准（怎么算做对了） |
| 轮 3 | 边界与异常（空/错误/无权限）· 关键交互与状态切换 · 偏好与禁忌（讨厌什么风格） |

提问纪律：

- 一次最多 3 问，选项 2–4 个，选项标签 ≤ 5 个词，把权衡写进 description。
- 能从已有 `plan.md`、仓库代码、用户原话里读到的，**不要再问**。
- 用户的自由文本回答**原样引用**，不要硬塞进你给的选项。

## 3. 技能编排表（照表调用，不要凭感觉选）

`brainstorming` 与 `grilling` 属于探索方法，其余属于设计方法。**只调用与本轮目标匹配的**，不要为了"用满技能"而调用。

### wireframe 阶段

| 时机 | 技能 | 目的 |
| :--- | :--- | :--- |
| 深挖 | `brainstorming`、`grilling` | 探清意图、压力测试假设 |
| 收敛 | `design-brief` | 把散落回答收敛成问题/受众/成功标准 |
| 结构 | `information-architecture` | 页面层级与分组 |
| 结构 | `navigation-patterns` | 导航选型（tabs / sidebar / hub） |
| 结构 | `content-strategy` | 内容清单与归属（多页时） |
| 页内 | `wireframe-spec` | 内容优先级、块边界与标注 |
| 页内 | `layout-grid` | 栅格与断点 |
| 页内 | `spacing-system` | 8pt 间距节奏 |
| 收尾 | `design-qa-checklist` | 线框是否覆盖需求清单 |

### hifi 阶段

| 时机 | 技能 | 目的 |
| :--- | :--- | :--- |
| 视觉基础 | `design-token` | 消费 `THEMES.md`，不改写它 |
| 视觉基础 | `typography-scale` | 字阶与行高 |
| 视觉基础 | `spacing-system` | 间距节奏 |
| 视觉基础 | `dark-mode-design` | 亮/暗双模的层级再平衡 |
| 视觉基础 | `icon-system` | 图标规格与尺寸 |
| 视觉基础 | `color-system` | **仅当**确需扩展语义色时；默认不扩展 |
| 组件 | `component-spec` | sidebar、分栏面板等组件规格 |
| 组件 | `state-machine` | 多状态交互的穷举 |
| 组件 | `micro-interaction-spec` | 拖拽 resize、hover、focus 反馈 |
| 状态屏 | `loading-states` | 加载与骨架屏 |
| 状态屏 | `error-handling-ux` | 错误态与恢复路径 |
| 状态屏 | `ux-writing` | 界面文案 |
| 质感 | `design-taste-frontend`、`high-end-visual-design`、`minimalist-ui` | 可选；对抗模板味 |
| 按需 | `responsive-design` | 只有 `plan.md` 勾了 mobile 才用 |
| 验收 | `design-qa-checklist`、`handoff-spec` | 对照设计稿验收 / 交付说明 |

### 两个阶段都可用的旁路

| 技能 | 何时用 |
| :--- | :--- |
| `xpi-visualoop` | 需要看真实渲染像素、或让用户圈选区域提意见 |
| `visual-explainer` | 要解释一个页面/流程的整体结构 |
| `excalidraw-diagram` | 要手绘风流程图（不是界面稿） |
| `diagram-design` | 要架构/流程/状态机图 |

## 4. 产出

### wireframe

- 一屏一文件：`current/screens/<ID>.html`，<ID> 形如 `01-home`。
- 灰阶 + 内联 SVG；只用 `background / foreground / border / muted` 四个基础 token。
- 每个块带 `data-wireframe-block="<id>"` 与 `data-priority="P0|P1|P2"`。
- 占位文案贴近真实长度（中文 12–20 字），禁止 lorem ipsum。
- 状态覆盖：正常 / 空 / 加载 / 错误，各自独立文件或独立视图。

### hifi

- 单文件自包含 HTML：`current/index.html`（多屏可拆 `current/screens/<ID>.html`）。
- 内联 CSS/JS，零外部请求。
- `<html class="dark" lang="zh-CN">`；主题与语言切换按钮写 `localStorage`，并在首帧前应用以免闪烁。
- 文案走 `window.__i18n`，`zh-CN` / `en` 两份，切换即时生效。
- sidebar 与分栏面板复刻 shadcn 外观；分栏可拖拽 resize，并且键盘可达。
- 色值全部来自 `THEMES.md`；`--radius`、border、muted 层级与 shadcn 一致。
- 无障碍底线：语义标签、`aria-label`、正文对比度 ≥ 4.5:1、焦点可见、尊重 `prefers-reduced-motion`。
- 状态覆盖同 wireframe。

### hifi 的继承纪律

结构继承 `wireframe/current/`，视觉自由。每一条偏离线框的布局决策，**必须**登记进 `hifi/DELTA.md`：

```markdown
| 日期 | 线框决策 | hifi 改动 | 原因 | 批准 |
| :--- | :--- | :--- | :--- | :--- |
| 2026-09-13 | hero 左文右图 | 改上下堆叠 | 移动端优先 | 用户已确认 |
```

信息层级（哪些内容在前、有哪些 CTA）**不可擅自变更**。真要改，先问。

## 5. 收尾：快照 + 预览

```
prototype_snapshot { kind, change: "本轮做了什么", reason: "为什么", files: [...] }
```

- `vN` 表示**第 N 次产出**；回滚目标即 `v(N-1)`，命令会随快照一起返回。
- `CHANGELOG.md` 倒序，最新在最上方，由工具写入，不要手工改格式。

然后让用户看到结果：

```
prototype_preview { kind }                       # 默认 current/index.html
prototype_preview { kind, file: "screens/01-home.html" }
```

这是**用系统默认浏览器**打开，不建受控浏览器会话。

需要像素级评审或让用户圈选区域时，转 `xpi-visualoop`（`visual_prepare` → `visual_capture` → `visual_feedback`）。注意：`xpi-visualoop` 走 CDP，只能驱动它自己启动的 Chromium 系浏览器与独立 profile，**无法接管用户日常浏览器窗口**。

## 6. 迭代与回滚

- **迭代**：直接改 `current/`，改完 `prototype_snapshot`，在 `plan.md` 里同步更新受影响的章节。
- **回滚**：跑快照返回的 `cp -R .../v(N-1)/. .../current/` 命令，然后再快照一次记录这次回滚。
- 版本号只增不减；不要在 `v*/` 目录里就地改文件——那些是不可变历史。

## 7. 完成前自检

- [ ] `plan.md` 反映了最新的 9 个（或提前退出时的实际）回答
- [ ] 每屏四态齐全：正常 / 空 / 加载 / 错误
- [ ] 无硬编码色值；所有颜色可在 `THEMES.md` 找到出处
- [ ] 暗色为默认；亮/暗与中/英切换都可用且不闪烁
- [ ] `current/` 没有任何外部网络请求
- [ ] hifi 的每条偏离都在 `DELTA.md` 有记录
- [ ] `prototype_snapshot` 已执行，`CHANGELOG.md` 顶部是本轮
