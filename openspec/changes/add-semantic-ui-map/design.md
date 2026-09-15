## Context

当前 xpi-prototype-design 扩展已实现原型生成（wireframe/hifi）、版本快照（`vN/`）、迁移工具、门禁系统（gate）和产品地图（pages）。产物为自包含 HTML，存储在 `.pi/prototype-design/<project>/<kind>/current/`。

现有架构约束：
- TypeScript strict + Node.js，无外部依赖（peerDependencies only）
- 工具分离：只读工具（`prototype_status`）、变更工具（`prototype_setup`、`prototype_snapshot`）
- 产物根固定为 `ctx.cwd`，项目 slug 是信任边界
- HTML 生成通过模板（`src/templates.ts`），门禁系统（`gate.ts`）控制写入权限
- 现有模块：`artifacts.ts`（骨架管理）、`contracts.ts`（类型与常量）、`tools.ts`（工具注册）、`product-map.ts`（页面索引）

缺口：用户描述修改目标时依赖自然语言或视觉位置，无稳定标识系统，Agent 需截图或反复确认。

## Goals / Non-Goals

**Goals:**
- 建立语义元素字典（semantic-ui-map），为每个可修改元素分配双码标识（短码 + 全路径）
- 在 HTML 原型中嵌入可视化徽标系统（开关控制），用户可直接引用短码
- 提供解析器和校验工具，拒绝静默猜测，多候选时返回列表
- 扩展现有工具（`prototype_setup`、`prototype_snapshot`）自动维护字典元数据
- 支持跨保真度（wireframe → hifi）ID 不变，支持状态机（proposed → confirmed → locked）
- 保持零外部依赖，纯 Node.js 实现

**Non-Goals:**
- 不引入 Semantica runtime、Python、Knowledge Graph、向量检索或独立服务
- 不自动从已有 HTML 提取元素（Phase 2 可选）
- 不支持代码阶段的 `fidelities.code`（原型止于 hifi）
- 不替换现有命令结构，只扩展功能

## Decisions

### 1. 字典存储位置与格式

**决策**：字典存储在 `<project>/semantic-ui-map.yaml`（跨 kind 共享），用 YAML 人工维护，不生成 JSON/TypeScript 常量。

**理由**：
- 跨 kind 共享实现"脊柱模型"：同一元素在 wireframe 和 hifi 阶段 ID 不变
- YAML 人类可读可编辑，符合原型快速迭代的特点
- 不生成 TypeScript 常量因为原型是独立 HTML，不需要类型导入

**替代方案**：
- ❌ 每个 kind 独立字典（`<kind>/semantic-ui-map.yaml`）：违背脊柱模型，wireframe → hifi 迁移时 ID 失稳
- ❌ 生成 TypeScript 类型：增加构建复杂度，原型无需类型检查

### 2. 双码制分隔符

**决策**：短码用 `-` 分隔（`P1-2-B3`），全路径用 `.` 分隔（`chat.composer.send-btn`）。

**理由**：
- `-` 更易读，避免与全路径混淆（advisor-02 原方案用 `.` 导致歧义）
- 符合 HTML `id` 属性规范（`-` 合法，`.` 需转义）
- CSS 选择器 `#P1-2-B3` 直接可用

**替代方案**：
- ❌ 短码也用 `.`（`P1.2.B3`）：与全路径格式重叠，解析歧义
- ❌ 短码用 `_`（`P1_2_B3`）：视觉噪音高，不符合用户习惯

### 3. 徽标渲染技术

**决策**：用 `::before` 伪元素 + CSS 变量 `--badge-display` 控制显示/隐藏，不修改 DOM 结构。

**理由**：
- 不污染 DOM，元素序列化（复制 HTML）时徽标自动消失
- CSS 变量全局切换，一行代码控制全部徽标
- 状态颜色通过属性选择器 `[data-status="proposed"]::before` 实现，扩展性好

**替代方案**：
- ❌ 真实 DOM 元素（`<span class="badge">`）：污染结构，复制时需手动清理
- ❌ JavaScript 动态注入：增加运行时复杂度，SEO/可访问性风险

### 4. 解析器策略

**决策**：保守匹配，不静默猜测。返回三种结果：唯一匹配 / 候选列表 / 未匹配。

**理由**：
- 错误修改代价高（原型评审中出错影响决策）
- 候选列表让用户快速消歧（列出短码即可）
- 未匹配返回 `unregistered` 而非静默跳过，Agent 可提示用户补充字典

**替代方案**：
- ❌ 模糊匹配自动选最佳：误改概率高，用户信任度降低
- ❌ 上下文推断（如当前页面）：增加隐式规则，调试困难

### 5. YAML 解析器选择

**决策**：使用 Node.js 内置或现有 peerDependencies 的 YAML 解析器，无新增依赖。如果 Pi 扩展 API 或现有依赖未提供 YAML 解析器，手动实现最小子集（支持本项目的 schema 即可）。

**理由**：
- 保持零依赖承诺（见 AGENTS.md）
- semantic-ui-map.yaml 结构固定，不需要完整 YAML 1.2 实现
- 最小实现约 200 行（支持基本映射、序列、字符串、数字、布尔值）

**替代方案**：
- ❌ 引入 `js-yaml` 或 `yaml` 包：违反零依赖约束
- ❌ 改用 JSON：牺牲可读性，注释和多行字符串支持缺失

### 6. 校验工具范围

**决策**：提供 `semantic_ui_map_validate(project)` 检查六类问题：必填字段、ID 冲突、alias 重复、引用完整性、状态机合法性、fidelities 路径存在性。

**理由**：
- 必填字段（`id` / `short` / `label`）是 spec「元素字段结构」的场景；缺 `short` 的条目在标注时会被跳过，不报出来用户只会看到「这个元素没有徽标」。其余字段加载器回落合法默认值，无法与显式赋值区分，不在这里判
- ID 冲突和 alias 重复是硬错误，必须拦截
- 引用完整性（parent/children 循环）防止无限递归
- 状态机合法性保证状态转换单向
- fidelities 路径格式合法性保证锚点可达（但不强制文件存在，允许草稿状态）

**替代方案**：
- ❌ 只校验 ID 冲突：遗漏其他常见错误，用户体验差
- ❌ 强制 fidelities 文件存在：阻碍草稿阶段灵活编辑

### 7. 模块拆分

**决策**：新增三个文件：
- `src/semantic-ui-map.ts`（核心逻辑：加载、解析、校验）
- `src/semantic-ui-map.test.ts`（单元测试）
- `src/badge-template.ts`（徽标 HTML 模板）

**理由**：
- 功能内聚，易于测试和维护
- 徽标模板独立便于复用（wireframe 和 hifi 共享）
- 遵循现有模块命名约定（`artifacts.ts`、`contracts.ts`）

**替代方案**：
- ❌ 合并到 `tools.ts`：文件过大（已 662 行）
- ❌ 合并到 `templates.ts`：语义不匹配（templates 是文档骨架，不是 HTML 运行时）

### 8. SPA vs 多页面检测

**决策**：通过 `meta.type: spa | multi-page` 显式声明，不自动检测。

**理由**：
- 避免启发式检测的边界问题（混合模式难判断）
- 用户在初始化时明确意图，减少歧义
- 解析器根据 type 调整 `fidelities` 解析逻辑（SPA 用锚点，多页面用文件路径）

**替代方案**：
- ❌ 自动检测（扫描 `pages.route` 格式）：混合模式无法处理
- ❌ 不区分类型：解析器逻辑复杂，容错性差

### 9. 与现有工具集成点

**决策**：
- `prototype_setup` 扩展：初始化时创建空 `semantic-ui-map.yaml` 骨架
- `prototype_snapshot` 扩展：快照时递增 `meta.version` 并更新 `meta.updated`
- 不修改 `prototype_preview`（预览逻辑由 HTML 自包含）
- 不修改 `prototype_gate`（门禁只管写入权限，不关心字典内容）

**理由**：
- 最小侵入，复用现有生命周期钩子
- 字典骨架在初始化阶段生成，避免运行时检查
- 快照元数据自动更新，减少人工维护负担

**替代方案**：
- ❌ 新增独立工具（如 `semantic_ui_map_init`）：增加命令复杂度
- ❌ 在 HTML 生成时动态注入徽标：增加模板复杂度，测试难度高

## Risks / Trade-offs

### 风险 1：YAML 解析器兼容性

**风险**：手动实现 YAML 解析器可能遗漏边界情况（如转义字符、复杂嵌套）。

**缓解**：
1. 限定 schema 范围，只支持本项目必需的 YAML 特性
2. 提供充分单元测试覆盖边界情况
3. 文档明确声明不支持的 YAML 特性（如锚点、合并键）

### 风险 2：字典维护成本

**风险**：手工维护 YAML 可能导致 ID 冲突、alias 漂移。

**缓解**：
1. 校验工具在快照前自动检查
2. 解析器返回清晰错误信息（如"P1-2-B3 与 P1-2-B5 的 label 重复"）
3. 未来可选工具：从 HTML 反向提取元素（Phase 2）

### 风险 3：徽标性能

**风险**：大量元素（100+ 个）的徽标渲染可能影响页面性能。

**缓解**：
1. `::before` 伪元素性能优于真实 DOM
2. CSS 变量切换无重排（reflow），只改 `display` 属性
3. 徽标默认开启，但用户可关闭

### 权衡 1：双码制复杂度 vs 用户体验

**权衡**：维护双码（短码 + 全路径）增加字典复杂度。

**选择理由**：
- 用户引用短码（`P1-2-B3`）比全路径（`chat.composer.send-btn`）快 3 倍
- Agent 处理全路径更可靠（语义明确，无页面边界歧义）
- 解析器自动映射，用户无需关心双码同步

### 权衡 2：跨 kind 共享 vs 独立字典

**权衡**：跨 kind 共享字典要求 wireframe 和 hifi 元素 ID 严格对应。

**选择理由**：
- 脊柱模型是 semantic-ui-map 的核心价值（ID 不变保证修改历史连续）
- wireframe → hifi 迁移时，元素只需更新 `fidelities.hifi`，不重新分配 ID
- 牺牲部分灵活性（hifi 新增元素需补 `stage_created: hifi`），换取修改历史可追溯

### 权衡 3：优雅降级 vs 强制字典

**权衡**：无字典时仍可预览，但失去语义定位能力。

**选择理由**：
- 向后兼容已有原型（历史快照无字典）
- 原型初期可跳过字典，先验证视觉，后续补充
- 字典是增强功能，不应成为预览阻塞项
