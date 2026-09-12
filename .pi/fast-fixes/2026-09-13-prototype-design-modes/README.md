# 修复计划 — 原型设计 4 模式命令

| 字段 | 值 |
| :--- | :--- |
| 工作流标识 | `xpi-fast-fix/2026-09-13-prototype-design-modes` |
| 创建时间 | 2026-09-13T04:12+08:00 |
| planStatus | `archived` |
| executionStatus | `deferred` |
| 计划路径 | `.pi/fast-fixes/2026-09-13-prototype-design-modes/plan.md` |
| 任务路径 | `.pi/fast-fixes/2026-09-13-prototype-design-modes/tasks.md` |
| 只读基线路径 | `.pi/fast-fixes/2026-09-13-prototype-design-modes/tasks.initial.md` |

`planStatus: archived` 表示计划已确认并持久化，**不表示不可修改**。`executionStatus: deferred` 表示尚未开始执行。

## 原始需求摘要

> 补充: 当用户输入指令 `xpi-prototype-design` 时，会出现选项 `wireframe`、`hifi`、`update`、`archive` 4 种模式：
>
> - `xpi-prototype-design wireframe`：创建 wireframe 线框原型设计
> - `xpi-prototype-design hifi`：创建 hifi 高保真原型设计，可选基于已有线框图还是直接开始高保真设计，并友情提示推荐优先线框设计
> - `xpi-prototype-design update`：识别当前项目中已有的原型设计项目，识别为列表选项供用户选择，从而进行对应项目的修改工作
> - `xpi-prototype-design archive`：识别当前项目中已经完成任务的设计项目，列表选项供用户选择，从而进行对应的 archive 归档工作
> - 当用户输入 `xpi-prototype-design` 加空格也会列出选项可以快速选择（包括输入首字母过滤功能）

## 只读基线用途

`tasks.initial.md` 是本次计划任务清单的**只读基线，禁止修改**。每次写入 `tasks.md` 后，必须将两者的任务 id 集合与顺序做一次对比：基线中存在而 `tasks.md` 中缺失的任务即为遗漏，必须从基线恢复该条目、将当前任务标记为 `failed` 并暂停。该文件是检测任务遗漏的唯一依据。

## 当前任务状态

- 已完成：11 / 20

### 执行偏差记录

- **任务顺序偏差**：1.4 的契约变更（`ChangelogEntryInput.project`、`rollbackCommand` 三参）必然波及 `artifacts.ts`，无法单独验证；2.1 与 2.2 共用同一组断言，也无法拆开。因此 1.4 / 2.1 / 2.2 / 3.1 在同一轮内连续实现，各自按自己的验证命令取证、各自勾选。
- **行为变更（超出原任务描述）**：2.2 的签名变更迫使命令层决定「谁来建骨架」。按 plan.md §5.5「项目 slug 由 agent 深挖后生成，命令层不猜」，已移除 `src/index.ts` 里的 eager `setupArtifacts` 与 THEMES.md 补齐；骨架改由 agent 调用 `prototype_setup`。`src/index.test.ts` 三条断言相应改到新约定。此项已在 1.3/2.2 的说明行留痕。

## 阻塞记录

无。

## 恢复说明

1. 读取本目录下 `README.md`、`plan.md`、`tasks.md`、`tasks.initial.md`。
2. 执行入口：`/xpi-fast-fix execute .pi/fast-fixes/2026-09-13-prototype-design-modes`
3. 从 `tasks.md` 中第一个未勾选（`- [ ]` 且无 `⏳`）的任务继续；带 `⏳ in_progress` 的任务需先确认其现场是否可用。
4. 每完成一项，只勾一项并写验证子行；随后与 `tasks.initial.md` 对比任务 id 集合，无漂移才继续。
5. 全部完成后做一次全量基线对比，任务 id 与顺序一致方视为完成。
