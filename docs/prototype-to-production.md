# 原型 → 成品:生产实践方案

> 研究轮产出。讨论「把 `.pi/prototype-design/` 里的原型元素推进成生产组件/页面」的最佳实践，
> 并保住两条能力：**版本可迭代/可回滚**、**语义标签可精准定位**。
>
> 目标栈：Next.js 16 + shadcn/ui + Tailwind v4。本文不改本扩展代码，是实践约定与 MVP 定义。

## 1. TL;DR

生产侧**不需要新建机制，只需要一座桥**。

| 能力 | 原型侧现状 | 成品侧做法 | 为什么不照搬 |
| :--- | :--- | :--- | :--- |
| 版本 / 回滚 | `vN/` 快照目录 + `CHANGELOG.md` | **Git 原生**：commit / tag / `git revert` | `vN/` 存在是因为 `.pi/` 刻意不进提交历史；生产代码本来就在 Git 里，再造快照等于双份事实来源 |
| 语义标签 | `data-semantic-badge` + `::before` 徽标 | **`data-semantic-id` 常驻源码，生产构建剥离** | agent 不点鼠标，它 grep 源码。徽标是给人看的副产品，不是定位机制 |
| 原型 ↔ 代码映射 | `semantic-ui-map.yaml` | 同一份字典加 `impl` 段 | `id` / `short` 跨阶段不变是「脊柱模型」的前提，推进到生产同样不变 |

一句话：**`id` 是脊柱，从 wireframe 一直长到 production。**

## 2. 语义标签在成品代码里怎么活

### 2.1 契约

生产组件里，每个「用户可能口语指认的元素」带一个属性：

```tsx
// components/chat/composer.tsx
export function Composer() {
  return (
    <div data-semantic-id="chat.composer" data-slot="composer">
      <Textarea data-semantic-id="chat.composer.input" />
      <Button data-semantic-id="chat.composer.send-btn">发送</Button>
    </div>
  );
}
```

三条规则：

1. **值用全路径**（`chat.composer.send-btn`），不用短码。短码只在页面内唯一，源码是全局的。
   短码留给用户口语引用，`semantic_ui_map_parse` 负责翻译成全路径。
2. **与 `data-slot` 并存，不替代它**。shadcn/ui 自 2025-02（Tailwind v4）起每个 primitive 都带
   `data-slot`，用途是样式锚点；`data-semantic-id` 用途是身份锚点。两者正交，同一元素上可以都有。
   *不要*把语义 ID 塞进 `data-slot`——那会污染 shadcn 的 `has-[>[data-slot=...]]` 选择器。
3. **不进 `className`**。class 名易碎，也会被 Tailwind 工具链当样式处理。

### 2.2 生命周期：源码常驻，DOM 仅 dev

`next.config.ts`：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    // Rust regex 语法（docs.rs/regex），不是 JS RegExp
    reactRemoveProperties: { properties: ["^data-semantic-id$"] },
  },
};

export default nextConfig;
```

- **dev**：属性在 DOM 里，浏览器可直接圈选/审查，`xpi-visualoop` 抓到的像素与元素对得上。
- **production**：SWC 在编译期剥离，交付产物里一个字节都不剩。
- **源码里永久保留**：这才是 agent 定位的依据。

已核实：该选项在 Next.js 16（Turbopack 默认打包器）下可用，PR #67853 已把
`react_remove_properties` 接进 Turbopack；`next@16.3.0` 的编译器文档仍列出它。
未核实：Rust regex 与 JS 正则在本例（纯字面量 + 锚点）上没有差异，但复杂表达式请自行验证。

**为什么不用 LocatorJS / click-to-component 那条路**：它们靠 Babel 注入
`data-inspector-file/line/column`，或读 React fiber 的 `_debugSource`，再通过编辑器协议跳转。
成本是一个 Babel 插件 + React 版本耦合（React 19 起 `_debugSource` 已变为 `_debugStack`），
收益是「人点鼠标跳源码」——而 agent 根本不点鼠标。对本目标是纯成本。

### 2.3 定位怎么发生

用户说「把那个折叠按钮改一下」：

```text
semantic_ui_map_parse { project, input: "折叠按钮", page: "chat" }
  → matched: chat.sidebar.collapse-btn
anchor_grep { pattern: 'chat.sidebar.collapse-btn', literal: true }
  → components/chat/sidebar.tsx:42
```

零新工具。`anchor_grep` 返回的行自带锚点，可以直接 `replace`。

## 3. 字典升级为桥

`semantic-ui-map.yaml` 的元素条目增加一个**可选** `impl` 段：

```yaml
elements:
  chat.composer.send-btn:
    short: P1-2-B1
    label: 发送按钮
    type: button
    status: locked            # 推进生产前应当已 locked
    stage_created: wireframe
    fidelities:
      wireframe: pages/chat/wireframe/current/index.html#P1-2-B1
      hifi: pages/chat/hifi/current/index.html#P1-2-B1
    impl:                      # ← 新增
      path: components/chat/composer.tsx
      export: Composer
      promoted_at: 2026-03-01
```

字段取自 Figma Code Connect 的已验证最小集（`source` 路径 + `componentName` + framework label），
砍掉了框架 label（本方案单栈）与 props template（props 契约已有 `props` 段承载）。

三条纪律：

- **`impl` 缺失 = 还没推进生产**，不是缺字段。与 `fidelities` 里的 `null` 同理。
- **`status: locked` 才推进**。`proposed` 的元素结构还会变，推进等于给自己挖返工坑。
- **推进不改 `id` / `short`**。改了就等于砍断脊柱，用户的口语引用全部失效。
- **推进对包含边完整**。推进一个元素时，它的 `children` 里每个 `status: locked` 的子元素必须**同轮一并推进**。不想推进某个子项，就**别把它置为 `locked`**——「本就不打算进生产」的合法表达是状态，不是新增豁免字段。容器搬了、子项没搬，是「卡片 `⋯` 菜单」最常见的漏法。

> 落地提醒：真要把 `impl` 写进本扩展，按 `AGENTS.md` §6 同步四处——
> `src/semantic-ui-map.ts` 类型与闭集、`src/contracts.ts` 出口、
> `docs/semantic-ui-map-schema.md`、`skills/xpi-prototype-design/SKILL.md` §8.5。
> 落地状态：`impl` 已按上面四处同步进本扩展（`change wire-production-mapping`）。元素条目接受
> 可选 `impl: { path, export?, promoted_at? }`；`impl.path` 只查格式不查文件存在，`#` 片段被拒；
> `fidelities` 出现闭集外的键（含旧的 `production`）改报 `unknown-key`，不再静默丢弃；
> `semantic_ui_map_parse` 命中已推进的元素时把 `impl` 一并返回。

## 4. 版本与回滚:Git 原生

不复刻 `vN/`。约定三件事就够：

**提交粒度**：一次提交推进一个页面或一个组件，不混。commit message 钉住来源：

```text
feat(chat): promote composer from prototype

semantic-id: chat.composer, chat.composer.input, chat.composer.send-btn
prototype: .pi/prototype-design/chat-flow/pages/chat/hifi/v7
```

**tag**：页面级推进打一个 tag，回滚有明确落点。

```bash
git tag promote/chat@1 -m "chat 页面首次推进生产"
```

**回滚**：

```bash
git revert <commit>              # 撤一次推进，保留历史
git checkout promote/chat@1 -- app/chat/    # 只取回某个页面的旧版
```

`prototype: ...` 那一行回答了「这个组件对应哪一版原型」——这就是原型侧 `CHANGELOG.md`
在生产侧的等价物，不需要额外账本。

未纳入本轮（用户已明确只要 Git 原生）：changesets 的 semver + 变更广播。
组件契约变更要回答「谁会被这次改动打断」时再引入，那时它是 monorepo 的事实标准。

## 5. 目录约定

```text
app/chat/page.tsx                    # 页面 = App Router 路由文件
components/chat/composer.tsx         # 组件按页面分组
components/ui/                       # shadcn 生成物，不手改
```

页面级 `data-semantic-id` 写在路由文件的根容器上，值等于字典里的页面 `id`（`chat`）。
这样「整页替换」与「单元素微调」共用一套定位机制。

## 6. MVP 定义

**最小可用范围**：一个页面 + 它的可修改元素，跑通「原型 → 成品 → 口语定位 → 改一处 → 回滚」全环。

| # | 任务 | 验收 |
| :-- | :--- | :--- |
| 1 | 目标项目 `next.config.ts` 加 `reactRemoveProperties` | `next build` 产物里 grep 不到 `data-semantic-id`；`next dev` 的 DOM 里能查到 |
| 2 | 挑一个 `status: locked` 的页面，把 hifi 结构翻成 shadcn 组件 | 页面可跑；视觉偏离登记进 hifi 的 `DELTA.md` |
| 3 | 每个可修改元素写上 `data-semantic-id`（全路径） | 数量与字典里该页 `elements` 一致 |
| 4 | 字典对应元素补 `impl.path` / `impl.export` | `semantic_ui_map_validate` 仍返回 `valid` |
| 5 | 提交，commit message 带 `semantic-id:` 与 `prototype:` 两行，打 tag | `git log --grep` 能按语义 ID 反查提交 |
| 6 | 落一个一致性 check（见 §7） | 字典说 promoted 但源码里 grep 不到 → 脚本非零退出 |
| 7 | 演一次口语定位 + 回滚 | `parse` → `anchor_grep` → `replace` → `git revert` 全通 |

**明确不做**：
- 原型 HTML 自动转 JSX（codegen）。原型是自包含 HTML，无 React 无 Tailwind，转换有损；
  且生成后人工一改就再也不能重生成，会退化成一次性脚手架。
- 生产侧徽标 CSS 与开关。那是内部工具的形态，不适合对外产品。
- 生产侧 `vN/` 快照目录。

## 7. 一致性 check

> **这是降级替代，不是唯一实现。** 装了 `xpi-prototype-design` 时优先跑 `prototype_promotion_check`
> `{ project, pageId }`——它走真的 YAML 解析器，不会被字典缩进变化骗过，也不靠 `awk` 配对。
> CI 里要一道独立把关、或没装扩展时，再用下面这段脚本。
> **两边口径必须一致**：源码侧一律匹配 `data-semantic-id` 的**全路径值**，短码不作匹配依据。

字典与代码会漂，需要一个能跑的最小闸门。**不解析 YAML**——一行 grep 拿到 promoted 元素，
逐个在源码里找：

```bash
#!/usr/bin/env bash
# scripts/check-semantic-ids.sh —— 字典说 promoted，源码里必须找得到
set -euo pipefail
MAP="${1:?usage: $0 <semantic-ui-map.yaml>}"
fail=0

# ponytail: 靠缩进配对 id 与 impl.path，不引 YAML 解析器。
# 字典结构变了就改这里；真到多产品多字典再上解析器。
while read -r id path; do
  rg -q --fixed-strings "\"$id\"" "$path" 2>/dev/null \
    || { echo "MISSING $id -> $path"; fail=1; }
done < <(awk '
  /^  [a-z][a-zA-Z0-9.-]*:$/ { id = $1; sub(/:$/, "", id) }
  /^      path:/             { print id, $2 }
' "$MAP")

if [ "$fail" -eq 0 ]; then echo "OK: all promoted semantic ids found in source"; fi
exit "$fail"
```

接进 `package.json` 的 `lint` 之后，或 CI 一步。失败即字典撒谎，两边必有一处要修。

## 8. 研究交付

**已核实事实**
- shadcn/ui 自 2025-02（Tailwind v4）起每个 primitive 带 `data-slot`，官方用途是稳定标识与样式锚点。
- Next.js `compiler.reactRemoveProperties` 支持自定义正则（Rust `regex` 语法），
  PR #67853 已支持 Turbopack；`next@16.3.0` 文档仍列出。
- Figma Code Connect 的映射最小字段：`source`（路径）+ `componentName` + framework label，
  可选 template 做 props 映射。
- LocatorJS / click-to-component / react-dev-inspector 依赖 Babel 注入或 React fiber
  `_debugSource`；React 19 起改为 `_debugStack`，旧方案需换实现。
- changesets 以 markdown 文件记录发布意图，`fixed` / `linked` 让 UI kit 共享版本号。
- 本扩展**永远运行在目标项目的 `ctx.cwd` 里**（用户在自己的 web-app 仓库装上它），所以字典、线框 HTML、
  成品源码、以及 `impl.path` 相对的那个项目根**全在同一个 `cwd` 下**。据此，「目标 web app 仓库与本扩展
  同仓 / monorepo / 完全分离」不是三选一：整条「原型 → 成品」链路都在同一个仓库内，`impl.path` 直接可达。

**推断（未经本项目验证）**
- 用户口语引用的解析路径（`parse` → `anchor_grep` → `replace`）在真实项目上足够精准。
  依据是短码/全路径全局唯一，但未在有真实组件的仓库上跑过。
- `impl` 段用两个字段（`path` / `export`）够用。若一个语义元素被多个组件复用，需要一对多，
  此时字段形状要改。
- §7 的 awk 配对依赖字典缩进恒定（元素键 2 空格、`impl.path` 6 空格）。字典结构变了它会静默漏检。

**未决问题**
- 一个原型元素对应多处生产实现时（响应式拆成 mobile/desktop 两个组件），`impl` 是数组还是拆两个元素 ID？
- ~~`impl` 是否要工具化（新增 `prototype_promote` 校验工具），还是长期停在纯约定？~~ 已定：不新增 promote 工具，
  改为扩既有三处——加载层读 `impl`、`semantic_ui_map_validate` 校验其路径格式、`semantic_ui_map_parse` 命中时返回它。

**下一步**
1. 确认目标 web app 仓库位置，把 §6 的 7 条在一个真实页面上跑一遍。
2. 跑通后再回答「`impl` 要不要进本扩展的 schema」——有真实用例再扩张类型，不预建。
3. 组件契约开始被多方消费时，引入 changesets。在此之前它是空转。
