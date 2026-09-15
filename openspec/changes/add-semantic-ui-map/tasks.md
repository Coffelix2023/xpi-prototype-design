## 1. 核心模块与类型定义

- [x] 1.1 创建 `src/semantic-ui-map.ts`，定义 TypeScript 类型（SemanticMap、Element、Props、Fidelities、Status 枚举、Type 枚举），并验证 `pnpm typecheck` 通过
- [x] 1.2 实现最小 YAML 解析器（支持映射、序列、字符串、数字、布尔值），编写单元测试覆盖基本类型和嵌套结构，验证 `pnpm test src/semantic-ui-map.test.ts` 通过
- [x] 1.3 实现 `loadSemanticMap(project: string): SemanticMap | null` 加载字典文件，处理文件不存在返回 null，验证加载成功和失败场景的单元测试通过

## 2. 双码标识与校验

- [x] 2.1 实现短码格式校验函数 `validateShortCode(short: string): boolean`，正则匹配 `^P\d+(-\d+)*(-[A-Z]\d+)?$`，验证单元测试覆盖合法和非法格式
- [x] 2.2 实现全路径格式校验函数 `validateFullPath(id: string): boolean`，正则匹配 kebab-case + `.` 分层，验证单元测试覆盖合法和非法格式
- [x] 2.3 实现双码映射唯一性校验 `checkUniqueness(map: SemanticMap): ValidationError[]`，检测 ID 和短码冲突，验证单元测试返回冲突元素路径

## 3. 解析器实现

- [x] 3.1 实现 `parseInput(input: string, map: SemanticMap, context?: { page?: string }): ParseResult`，支持短码、全路径和中文别名三种输入，验证单元测试覆盖唯一匹配、多候选和未匹配场景
- [x] 3.2 实现短码直接查找逻辑（O(1) 哈希表查找），验证性能测试 1000 次查找 <10ms
- [x] 3.3 实现全路径直接查找逻辑，验证单元测试覆盖嵌套路径和不存在路径
- [x] 3.4 实现中文别名模糊匹配（label + aliases 数组），返回候选列表，验证单元测试覆盖单候选、多候选和无候选场景
- [x] 3.5 实现上下文过滤（context.page 限定搜索范围），验证单元测试在指定页面内正确过滤

## 4. 校验工具实现
- [x] 4.1 实现 `validateSemanticMap(map: SemanticMap): ValidationResult`，集成五类检查（ID 冲突、alias 重复、引用完整性、状态机、fidelities 路径），验证单元测试返回所有错误类型
- [x] 4.2 实现循环引用检测（parent/children 图遍历），验证单元测试检测 A→B→A 和 A→B→C→A 循环
- [x] 4.3 实现状态机转换校验（proposed → confirmed → locked 单向），验证单元测试拒绝非法回退
- [x] 4.4 实现 alias 重复检测（跨元素的 label 和 aliases 交叉检查），验证单元测试报告冲突元素对
- [x] 4.5 实现 fidelities 路径格式校验（不强制文件存在，仅校验格式合法性），验证单元测试覆盖合法和非法路径格式

## 5. HTML 徽标模板

- [x] 5.1 创建 `src/badge-template.ts`，导出徽标 CSS 模板字符串（`:root` 变量、`::before` 伪元素、状态颜色），验证模板包含完整 CSS 规则
- [x] 5.2 导出徽标 JavaScript 模板字符串（开关按钮事件、CSS 变量切换逻辑），验证模板包含完整事件处理
- [x] 5.3 实现 `injectBadgeSystem(html: string, annotateDefault: boolean): string`，在 `</head>` 前注入 CSS，在 `</body>` 前注入 JS 和按钮，验证单元测试注入位置正确且不破坏原 HTML 结构
- [x] 5.4 实现 `addBadgeAttributes(html: string, elements: Element[]): string`，为匹配的元素添加 `data-semantic-badge` 和 `data-status` 属性，验证单元测试覆盖已有 `id` 的元素和新增元素

## 6. 工具集成

- [x] 6.1 扩展初始化逻辑（页面模型下是 `prototype_setup` 的工具处理器，覆盖 `setupArtifacts` 与 `setupPageArtifacts` 两条分支），在初始化时调用 `createEmptySemanticMap` 创建空字典骨架，验证集成测试生成的 YAML 包含 `meta.version: 1` 和空 `pages`/`elements`
- [x] 6.2 实现 `createEmptySemanticMap(projectRoot, project)`，写入 `<project>/semantic-ui-map.yaml` 模板（meta + 空 pages/elements），已存在则不覆盖，验证文件内容符合 schema
- [x] 6.3 扩展快照逻辑（`prototype_snapshot` 的工具处理器），在 `vN` 创建后调用 `incrementSemanticMapVersion`，验证集成测试 `meta.version` 递增且 `meta.updated` 更新
- [x] 6.4 实现 `incrementSemanticMapVersion(projectRoot, project)`，只改写 `meta` 块里的 version/updated（不重新序列化整份字典），验证单元测试覆盖文件不存在、YAML 损坏两种降级场景

## 7. HTML 生成集成

- [x] 7.1 按实际架构落位：扩展不生成 HTML（HTML 由 agent 写），新增后处理工具 `semantic_ui_map_annotate`（`src/semantic-annotate.ts`）在产出后调用 `addBadgeAttributes` + `injectBadgeSystem`，验证单元测试覆盖注入结果与幂等
- [x] 7.2 SPA 路由归原型自己（扩展不接管，也不猜标记契约）：契约写进 `SKILL.md` §8.5——路由为 `#/<page.route>`，非活动页面容器必须 `display: none`，徽标作为 `::before` 随容器一起隐藏
- [x] 7.3 multi-page 按 `fidelities[stage]` 过滤：只标注锚点指向本文件的元素（纯锚点无法判断归属时不标），验证单元测试用「同文件里放入别页元素 id」证明不串台
- [x] 7.4 优雅降级：字典不存在时 `annotateStage` 返回 `mapPath: null` 且不写任何字节，验证单元测试断言 HTML 与原文件逐字节相同

## 8. 类型与契约

- [x] 8.1 在 `src/contracts.ts` 添加 `semantic-ui-map` 相关类型导出（`Status`、`ElementType`、`SemanticElement`、`SemanticMap` 等），验证 `pnpm typecheck` 通过
- [x] 8.2 在 `src/contracts.ts` 复用同一份常量枚举（`ELEMENT_TYPES`、`STATUSES`、`STAGES`、`MAP_TYPES`、`PROP_TYPES`；复数命名表示它们是列表），供校验与解析共用，验证与 spec.md 枚举一致
- [x] 8.3 导出 props 契约类型（`PropDefinition`、`PropType`），供 Agent 检查修改是否在契约内，验证类型包含 `type`、`values`、`current` 字段

## 9. 测试覆盖

- [x] 9.1 为 `semantic-ui-map.ts` 编写完整单元测试，覆盖加载、解析、校验三大模块，验证 `vitest run src/semantic-ui-map.test.ts` 通过（52 例）且覆盖率达标（行 97.89% / 分支 82.98%，下限写进 `vitest.config.ts`，`pnpm coverage` 会自己判）
- [x] 9.2 为徽标模板注入和属性添加编写单元测试（19 例），验证 HTML 结构正确且不破坏原内容；含一条回归用例盯住「元素属性与注入标记不得同名」
- [x] 9.3 编写集成测试 `src/semantic-flow.test.ts`：初始化 → 填字典 → 产出 HTML → 标注 → 校验 → 快照 → 版本递增，两轮快照并断言 v1 是不可变历史；另守官方示例（字典可解析可校验、HTML 带着徽标与路由）
- [x] 9.4 为 YAML 解析器编写边界测试 `src/semantic-ui-map-yaml.test.ts`（29 例）：空输入、BOM/CRLF、引号与转义、注释、流式结构、重复键、tab、未闭合、缩进层级、深层嵌套，以及明确不支持的锚点/块标量

## 10. 文档与示例

- [x] 10.1 更新 `README.md` 和 `README.zh-CN.md`：修正「扩展生成 HTML」的错误表述，补三步用法、双码制、徽标开关、字典位置、示例入口，并把 `semantic_ui_map_annotate` 补进工具表与目录树
- [x] 10.2 创建 `docs/semantic-ui-map-schema.md`：位置与生命周期、meta/pages/elements/fidelities/props 字段表、双码正则、六类校验码、支持的 YAML 子集与明确不支持的写法，与 `src/semantic-ui-map.ts` 类型一一对应
- [x] 10.3 将 `docs/notes/semantica-ui-map/prototype-spa-demo/` 移到 `examples/semantic-ui-map/`，改掉文档里的旧路径并补「与扩展的关系」对照表；可运行性由浏览器实测（headless Chrome + CDP）：`#/agents` 下只显示 P2-* 徽标、点击开关 ON↔OFF 时徽标消失/恢复，且 `src/semantic-flow.test.ts` 持续守着字典与 HTML
- [x] 10.4 更新 `AGENTS.md`：职责边界补「维护字典 + 按 id 落徽标」与「不生成 HTML、不接管路由」，§3 目录树补四个新模块与 docs/examples 入口，§5 补 `pnpm coverage`，新增 §6「语义字典」决策表与集成点

## 11. 最终验证

- [x] 11.1 运行 `pnpm typecheck` 确认无类型错误
- [x] 11.2 运行 `pnpm -w run lint` 确认代码风格符合 Biome 规范
- [x] 11.3 运行 `pnpm test` 确认所有单元测试和集成测试通过
- [x] 11.4 手动创建一个测试原型（`/xpi-prototype-design wireframe test-project`），验证字典自动生成、HTML 徽标可见、开关按钮工作正常
- [x] 11.5 手动测试解析器：输入短码、全路径、中文别名，验证返回正确结果或候选列表
- [ ] 11.6 手动测试快照：调用 `prototype_snapshot`，验证 `meta.version` 递增且 CHANGELOG 包含新条目
- [ ] 11.7 验证优雅降级：删除字典文件后预览原型，确认无报错且徽标不显示
