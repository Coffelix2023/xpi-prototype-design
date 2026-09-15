---
name: xpi-prototype-migration
description: Migrate explicitly selected legacy prototype or wireframe assets into the product/page artifact model with read-only scanning, user-confirmed mappings, conflict-safe execution, link validation, and render checks.
license: MIT
---

# xpi-prototype-migration

迁移是独立动作：它把用户明确指定的旧原型/线框搬进 `.pi/prototype-design/` 的
产品页面模型，不创建新设计、不深挖需求、不调任何设计技能。用户从主入口选到
「迁移已有原型或线框」时才走这里；普通页面设计走 `xpi-prototype-design`。

## 流程（四步，不能跳）

1. **要来源**。让用户明确给出当前项目根内的文件或目录（相对路径）。用户没说之前
   不扫描任何路径；来源只读，越界路径会被工具拒绝。
2. **扫描**。调 `prototype_migration_scan { sources }`，把返回的映射计划、链接引用、
   资源清单和全部待决项原样展示给用户。扫描不写盘，也不会改写来源文件。
3. **逐项确认**。待决项必须由用户决定，不能猜：
   - `pageId`：可用扫描建议值，但必须用户点头；
   - `implementation`：production / prototype / external / placeholder；
   - `fidelity`：none / wireframe / prototype / hifi；
   - `target`：`<product>/pages/<pageId>/<kind>`（kind 为 wireframe 或 hifi），
     且路径里的 pageId 必须与决策一致；
   - 资源：非 HTML 文件要么列入所属页面的 `assets`，要么带 `reason` 显式排除。
   把这些决定做成 `decisions` 数组再调 `prototype_migration_scan` 复核一次：
   `ready: true` 才继续。
4. **执行**。用户确认后调
   `prototype_migration_execute { project, sources, decisions, confirm: true }`。
   `ready: false` 或 `confirm: false` 时工具不写盘，只会把待决项回给你。

## 硬边界

- 目标只允许 `.pi/prototype-design/` 下；已有目标不覆盖，冲突逐个报告。
- 执行会顺带把迁移页面登记进产品地图，然后跑链接校验与最小渲染检查，
  报告写到 `<product>/migration/<时间>-migration-report.md`。
- **只有零待决项、零冲突、校验全通过（`complete: true`）才能说「迁移完成」**；
  否则报未完成，并给出报告路径与 `rm -f` 回滚命令（只删本次新建的文件）。
- 迁移失败不碰来源；恢复靠报告里的回滚命令删掉本次新建目标。
- 扫描只把 HTML 里的 href/src 列出来，**不改写**。改成稳定 page ID 是迁移后的人工动作。
- 迁移不去满足 `prototype_gate`（那是设计产出的闸门）；放行依据是用户确认过的
  `decisions` 与 `confirm`。
