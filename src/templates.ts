/**
 * templates — `prototype_setup` 写入的文档骨架。
 *
 * 骨架刻意保持短：它规定**结构与硬约束**，具体内容由 agent 在深挖后填写。
 */

import { CHANGELOG_MARKER, type Kind, TASKS_FILE } from "./contracts.js";

const PLAN_WIREFRAME = `# plan.md — wireframe

> 本阶段唯一需求事实来源。每轮深挖后**覆写本文件**，不新建副本。

## 1. 目的 (Why)

<!-- 一句话：这个原型要回答什么问题 -->

## 2. 受众 (Who)

<!-- 主要用户 / 次要用户 -->

## 3. 范围

### 包含

-

### 不包含

-

## 4. 页面清单

| ID | 页面 | 优先级 | 状态覆盖 |
| :--- | :--- | :--- | :--- |
| 01-home | 首页 | P0 | main / empty / loading / error |

> ID 规范：两位数字前缀 + kebab-case，决定导航与文件排序。

## 5. 交付形态

- [x] desktop 1440
- [ ] mobile 390
- [x] 状态覆盖：正常 / 空 / 加载 / 错误

## 6. 主题与语言

- 配色来源：\`<项目根>/THEMES.md\`（shadcn token）
- wireframe 仅取基础 MVP token：\`background / foreground / border / muted\`，不增加线框工作量
- 主题：默认暗色，页内可切换 亮/暗
- 语言：默认 \`zh-CN\`，页内可切换 \`zh-CN\` / \`en\`

## 7. 启用技能

<!-- 见 skills/xpi-prototype-design/SKILL.md 的阶段技能表，按需勾选 -->

- [ ] design-brief
- [ ] information-architecture
- [ ] wireframe-spec
- [ ] layout-grid
- [ ] navigation-patterns

## 8. 任务编排

> 任务清单与进度在同目录 \`tasks.md\`（checkbox 状态机），本文件不重复维护清单。
> 这一节只写**切分理由**：为什么这样排、依赖在哪、哪几项可以并行、哪几项必须等用户拍板。

## 9. 成功标准

- [ ]
## 10. 未决问题

- [ ]
`;

const PLAN_HIFI = `# plan.md — hifi

> 本阶段唯一需求事实来源。结构继承 wireframe，视觉自由。每轮深挖后覆写本文件。

## 1. 目的 (Why)

<!-- 一句话：这版高保真要确定什么 -->

## 2. 上游输入

- wireframe 版本：\`v?\`
- 差异登记：见同目录 \`DELTA.md\`

## 3. 页面清单

| ID | 页面 | 优先级 | 状态覆盖 |
| :--- | :--- | :--- | :--- |
| 01-home | 首页 | P0 | main / empty / loading / error |

## 4. 交付形态

- [x] desktop 1440
- [ ] mobile 390
- [x] 自包含 HTML（内联 CSS/JS，无构建、无依赖）
- [x] 状态覆盖：正常 / 空 / 加载 / 错误

## 5. 主题与语言

- 配色来源：\`<项目根>/THEMES.md\`（shadcn oklch token，禁止硬编码 hex）
- 主题：默认暗色（\`<html class="dark">\`），页内可切换
- 语言：默认 \`zh-CN\`，页内可切换 \`zh-CN\` / \`en\`
- 组件：复刻 shadcn 外观（sidebar、分栏面板可拖拽 resize）

## 6. 启用技能

- [x] design-token
- [x] typography-scale
- [x] spacing-system
- [ ] component-spec
- [ ] state-machine
- [ ] micro-interaction-spec
- [ ] design-qa-checklist
## 7. 任务编排

> 任务清单与进度在同目录 \`tasks.md\`（checkbox 状态机），本文件不重复维护清单。
> 这一节只写**切分理由**：为什么这样排、依赖在哪、哪几项可以并行、哪几项必须等用户拍板。

## 8. 成功标准

- [ ]
## 9. 未决问题

- [ ]
`;

const PRINCIPLES_WIREFRAME = `# principles.md — wireframe
> 线框阶段的硬约束。与本文档冲突的做法一律视为缺陷。

## 硬约束

- 灰阶 + 内联 SVG；无品牌色、无阴影、无渐变、无动效
- 仅使用 \`THEMES.md\` 的 \`background / foreground / border / muted\` 四个基础 token
- 每个块标注 \`data-wireframe-block="<id>"\` 与优先级 \`data-priority="P0|P1|P2"\`
- 占位文案贴近真实长度（中文 12–20 字），不用 lorem ipsum
- 栅格与间距遵循 8pt 基准

## 禁止

- 自造色值或 token
- 用真实视觉稿代替结构表达（那是 hifi 阶段的事）
`;

const PRINCIPLES_HIFI = `# principles.md — hifi

> 高保真阶段的硬约束。与本文档冲突的做法一律视为缺陷。

## 硬约束

- 自包含单文件 HTML：内联 CSS/JS，零外部请求、零构建步骤
- 色值只来自 \`THEMES.md\`；不新增 token、不硬编码 hex
- 默认暗色：\`<html class="dark">\`，切换按钮写 \`localStorage\` 并在首帧前生效
- 语言默认 \`zh-CN\`；文案走 \`window.__i18n\`，切换即时生效
- shadcn 外观复刻：\`--radius\`、border、muted 层级与 shadcn 一致
- sidebar 与分栏面板可拖拽 resize（pointer events，键盘可达）
- 状态必须齐全：正常 / 空 / 加载 / 错误

## 无障碍底线

- 语义标签 + \`aria-label\`；\`lang\` 与主题同步更新
- 正文对比度 ≥ 4.5:1；焦点可见
- 尊重 \`prefers-reduced-motion\`

## 禁止

- React / Vue / Tailwind CDN / 任何构建产物
- 装饰性渐变、无意义动效
`;

const DELTA = `# DELTA.md — hifi ↔ wireframe 差异说明

> 结构继承 wireframe，视觉自由。**每条偏离线框的决策都必须登记在此**，未登记视为偏离。

| 日期 | 线框决策 | hifi 改动 | 原因 | 批准 |
| :--- | :--- | :--- | :--- | :--- |
| | | | | |

> 信息层级（哪些内容在前、有哪些 CTA）不可擅自变更；仅布局与视觉可在本节说明后调整。
`;

/**
 * 任务清单骨架。
 *
 * 刻意**不含任何可解析的任务行**：这样「只有骨架、还没填计划」的阶段不会被
 * `parseTaskProgress` 误判成「有任务」，`prototype_status` 与 execute 的候选列表
 * 也就不会把空壳当成待执行计划。格式约定写在 SKILL.md 里，不靠示例行暗示。
 */
function tasksTemplate(kind: Kind): string {
  return `# tasks.md — ${kind}

> 本阶段的**任务清单与进度**，与 \`plan.md\` 一起在每轮深挖后覆写，不新建副本。
> 编号顺序即产出顺序；只有非线性依赖才在行尾补 \`(依赖: 1.2)\`。
> 状态机：待执行是空方框；进行中是空方框加行尾 \`⏳ in_progress\`；完成是打勾方框并紧跟一条验证子行。
> 一次只推进一项：先标进行中，产出后立刻勾选并写验证子行，不批量补勾。
> **首轮产出前必须先过计划闸门**（见 SKILL.md §5.1）。用户没发话，就停在这里。

## 任务

<!-- 逐条填写。每行自带验收与产出，形如：验收:hero 三块信息齐全;产出:current/screens/01-home.html -->

## 阻塞与决定

<!-- 卡住时记录：卡在哪一条、为什么、下一步等谁发话 -->
`;
}

function changelogTemplate(kind: Kind): string {
  return `# CHANGELOG — ${kind}

> 最新迭代在最上方，倒序排列。每轮产出后由 \`prototype_snapshot\` 追加一条。

${CHANGELOG_MARKER}
`;
}

export function docTemplate(kind: Kind, file: string): string | undefined {
  if (file === "CHANGELOG.md") return changelogTemplate(kind);
  if (file === "DELTA.md") return kind === "hifi" ? DELTA : undefined;
  if (file === "plan.md") return kind === "hifi" ? PLAN_HIFI : PLAN_WIREFRAME;
  if (file === TASKS_FILE) return tasksTemplate(kind);
  if (file === "principles.md") {
    return kind === "hifi" ? PRINCIPLES_HIFI : PRINCIPLES_WIREFRAME;
  }
  return undefined;
}
