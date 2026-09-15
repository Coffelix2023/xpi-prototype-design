## Why

原型设计的 vibe-coding 流程中，用户描述修改目标时常模糊不清（"把那个折叠按钮改一下"），Agent 要么通过截图确认，要么反复追问，浪费成本。建立语义元素字典（semantic-ui-map）为每个可修改元素分配稳定的双码标识（短码 `P1-2-B1` 给用户，全路径 `chat.composer.send-btn` 给机器），并在 HTML 预览上渲染可开关的徽标，让用户可以直接说 "改 P1-2-B1"，Agent 瞬间定位，零歧义。这是 xpi-prototype-design 的核心特色功能，适用于新建、修改、迁移原型的全生命周期。

## What Changes

- 为每个原型项目维护一个跨保真度（wireframe → hifi）共享的 `semantic-ui-map.yaml`，记录页面结构、面板、控件的双码标识、中文别名、类型、状态（proposed/confirmed/locked）、props 契约和跨阶段锚点
- 在生成的 HTML 原型中嵌入 `data-semantic-badge` 属性和徽标渲染系统（CSS 变量控制开关），用户可点击按钮切换徽标显示
- 提供解析器工具，接受用户的短码、全路径或中文别名，返回唯一匹配或候选列表，拒绝静默猜测
- 提供校验工具，检查 ID 冲突、alias 重复、引用完整性、状态机合法性
- 扩展 `prototype_setup` 和 `prototype_snapshot` 工具，在初始化和快照时自动更新字典元数据（version、updated）
- 支持 SPA 和多页面两种模式，SPA 用客户端路由（`#/chat`），多页面用文件路径（`pricing.html`）
- **不引入**：Semantica runtime、Python 依赖、Knowledge Graph、OWL/RDF、向量检索、独立语义索引服务

## Capabilities

### New Capabilities

- `semantic-ui-map`: 为原型元素提供稳定语义标识、双码制、徽标开关、解析器、校验工具，支持跨保真度 ID 不变和状态机治理

### Modified Capabilities

<!-- 无现有 capability 的需求变更 -->

## Impact

**新增工具**：
- `semantic_ui_map_parse(input, project, context?)` - 解析短码/全路径/别名 → 返回匹配结果或候选
- `semantic_ui_map_validate(project)` - 校验字典完整性

**修改工具**：
- `prototype_setup` - 初始化时创建空的 `semantic-ui-map.yaml` 骨架
- `prototype_snapshot` - 快照时自动递增字典 `meta.version`

**产物结构变更**：
```
.pi/prototype-design/
  <project>/
    semantic-ui-map.yaml       # 新增：跨 kind 共享
    wireframe/current/*.html   # 修改：嵌入 data-semantic-badge + 徽标系统
    hifi/current/*.html        # 修改：同上
```

**文件新增**：
- `src/semantic-ui-map.ts` - 核心逻辑（YAML 加载、解析、校验）
- `src/semantic-ui-map.test.ts` - 单元测试
- `src/badge-template.ts` - HTML 徽标系统模板（CSS + JS）

**依赖**：无新增外部依赖（纯 Node.js + 现有 peerDependencies）

**兼容性**：
- 现有项目无 `semantic-ui-map.yaml` 时仍可正常预览，徽标系统优雅降级
- 已有原型的 `vN/` 快照不受影响
- 迁移工具 `prototype_migration_scan` 可选支持从已有 HTML 提取元素（Phase 2）
