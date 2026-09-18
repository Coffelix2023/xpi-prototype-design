## Why

v0.4.0 发布的 `prototype_promotion_check` 只以 **Pi 会话内工具**的形式存在。这带来两个问题,一个客户端已经撞上:

**1. 副本漂移(客户端已实测)。** 客户端 CI 里跑的是从 `docs/prototype-to-production.md` §7 抄来的一段 bash：

```bash
rg -q --fixed-strings "\"$id\"" "$path"
```

只要文件里出现带引号的 id 字面量就算过。而扩展在 v0.4.0 长出了同一个判定,口径是**属性形态**：

```ts
const ID_ATTR_PATTERN = /\bdata-semantic-id\s*=\s*(["'])([^"'<>]+)\1/g;
```

同一份源码,两边结论相反：脚本报 `OK: 16 个`,工具报 `命中 10,缺 6`。根因不在客户端的纪律,在本仓的分层——`package.json` 是 `private: true`,`bin` / `exports` / `main` 全空,而 `checkPromotion()` 虽然本身是纯函数(收 `projectRoot` / `project` / `pageId`,不用 `ctx`),`import` 它会连带拖进 `typebox` → `semantic-tools.ts` → `tools.ts` → `preview.ts` 整条工具注册图。**客户端 CI 无从调用同一个判定,只能抄一份。** 抄的那一刻,单一事实来源就断了。

**2. 判定把两种修法完全不同的情况混成一类。** `missing_in_source` 同时承纳「元素真的没搬」与「搬了但属性写成动态表达式」：

```tsx
// 常量表里有 "nav-hud",渲染点没有字面量
<Link data-semantic-id={NAV_SEMANTIC_ID[view.id]} />
```

后者在客户端实测产生 6 条 `✗ MISSING`。元素其实渲染了,只是静态字面量匹配看不到。v0.4.0 的 `design.md` §Risks 写过「误判方向是『漏报缺失』,属可接受的保守失败」——**这句话的判定方向说反了**:动态表达式产生的是**假阳性**,不是漏报。两类混在一起时,报告长得一样,人无法决定该去改源码还是该接受「静态核对看不到」。

**顺带一处温床。** `rollbackCommand(project, kind, version)` 手写 `${ARTIFACT_ROOT}/${project}/${kind}`,而它的两个兄弟 `versionArchiveRestoreCommand` / `archiveRestoreCommand` 都走 `stagePath()`；`page-artifacts.ts:249` 还把 `` `${project}/pages/${pageId}` `` 当 `project` 参数塞进去——那个参数不是 slug,是路径前缀。值今天算对了,但「同一个路径公式存在两份」正是台账路径漂移的温床。

## What Changes

- **新增第五类结果 `dynamic_attribute`**：当某元素的 `impl.path` 文件里没有它的 `data-semantic-id` 字面量,但该文件里存在 `data-semantic-id={` 形式的**动态表达式**时,归入这一类并说明「静态核对看不到,请确认渲染点是否真带该属性」,不再冒充 `missing_in_source`。四类变五类,各自独立计数与封顶。
- **判定核心与 Pi 工具外壳分层**：
  - 新 `src/semantic-map-io.ts`：`LoadedMap` + `readProjectMap`（零 `typebox`；现住在 `semantic-tools.ts`,只是历史原因）
  - 新 `src/promotion-core.ts`：`checkPromotion` / `findUnpromotedChildren` / `collectSemanticIds` / 输出文案（零 `typebox`、零 `@earendil-works/pi-coding-agent`）
  - `src/promotion-check.ts`：只留 Pi 工具外壳（schema + `execute`）
- **暴露可被 CI 调用的入口**：新增 CLI 入口 `src/cli.ts`,`package.json` 补 `bin` 与 `exports`。客户端 CI 写一行调用**同一个判定**,不再保留第二份实现。
- **整理 `rollbackCommand` 签名**（F2）：改为收**阶段路径**而非拼 slug,两个调用方分别传 `stagePath()` / `pageStagePath()`,消除重复公式与撒谎的参数名。
- **把「脚本是降级替代」搬到可见处**：该提醒此前写在 `docs/prototype-to-production.md` §7,而那份文档已移入被 `.gitignore` 忽略的 `docs/notes/`——客户端看不见。改写进 README 与 SKILL。
- 不新增依赖（`typebox` 已在 devDependencies,CLI 核心路径不需要它）。

## Capabilities

### New Capabilities

无。全部落在既有的 `semantic-ui-map` 能力里：核对工具是它的工具族成员,`impl` 是它的字段。

### Modified Capabilities

- `semantic-ui-map`：
  1. **核对结果的类别从四类扩到五类**,新增 `dynamic_attribute`（MODIFIED:既有的「核对工具比对字典与生产源码」requirement 需要改写四类表）。
  2. **新增 requirement：核对判定 SHALL 可在 Pi 会话之外被调用**（CLI 入口 + 分层约束:核心模块不得依赖 `typebox` 或 Pi 运行时）。

## Impact

- **代码**：`src/promotion-check.ts`（拆分）、新 `src/promotion-core.ts`、新 `src/semantic-map-io.ts`、`src/semantic-tools.ts`（`readProjectMap` 迁出并再出口）、`src/contracts.ts`（`rollbackCommand` 签名）、`src/artifacts.ts` + `src/page-artifacts.ts`（调用点）、新 `src/cli.ts`、`package.json`（`bin` / `exports`）。
- **文档**：`skills/xpi-prototype-design/SKILL.md` §8.5（五类表 + CLI 用法）、`docs/semantic-ui-map-schema.md` §11（工具契约五类 + CLI）、`README.md` / `README.zh-CN.md`（工具表 + 五类 + CI 用法 + 脚本降级提醒）。
- **测试**：`src/promotion-check.test.ts`（新增 `dynamic_attribute` 用例）；新 `src/promotion-core.test.ts`（分层约束:核心模块可在无 Pi 运行时下导入并跑通）；`src/contracts.test.ts`（`rollbackCommand` 新签名）。
- **消费方（本仓外）**：客户端可删掉 `scripts/check-semantic-ids.sh`,改用 CLI。已存在的 6 条 `dynamic_attribute` 需要客户端自己决定:改成字面量属性,或接受静态核对看不到。
- **不新增依赖**；`src/gate.ts` 不动（新入口只读）。
- **明确不做**：
  - **不做宽匹配**（例如「id 出现在文件里就算命中」）。那正是客户端脚本现在的口径,也正是假通过的来源。核对必须坚持属性形态。
  - **不做 lint/CI 配置生成本身**。只提供入口,客户端自己决定在哪个 pipeline 里跑。
  - **不把 CLI 做成写盘工具**。它就是只读核对的另一个入口,不参与闸门。
  - **不放开 `private: true`**。发不发 npm 是发布决策,与本次无关；`bin` 对本地 / git 安装同样可用。
