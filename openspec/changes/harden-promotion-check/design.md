## Context

动机见 `proposal.md` §Why，行为契约见 `specs/semantic-ui-map/spec.md`。本节只记录塑造实现方案的现状约束。

三条约束决定了本设计的形状：

1. **本仓无构建步骤。** Pi 直接加载 `src/index.ts` 的 TypeScript 源码，禁止引入 tsup/esbuild/dist 产物。任何「加一个 CLI」的方案都必须在不构建的前提下可运行。
2. **import 全用 `.js` 后缀**（NodeNext 风格），而 **Node 不把 `./x.js` 重写到 `./x.ts`**。这一条已实测：`node a.ts` 里写 `import { hi } from "./b.js"` 会抛 `ERR_MODULE_NOT_FOUND`，加 `--experimental-strip-types` 也一样（Node v24.20.0）。**所以「`bin` 直接指向 `src/cli.ts`」在现状下跑不起来。**
3. **`readProjectMap` 住在 `semantic-tools.ts` 只是历史原因**，它本身只用到 `loadSemanticMap` / `semanticMapPattern` / `stat` / `resolve`，不碰 `typebox`。而 `promotion-check.ts` 与 `semantic-tools.ts`、`tools.ts` 的模块级 `import { Type } from "typebox"` 使得 `import` 核对逻辑必然拖进 `typebox` 与整条工具注册图。

## Goals / Non-Goals

**Goals:**

- 让**同一份**判定能在 Pi 会话外被调用，从根上消除客户端复写第二份实现。
- 让「属性写成动态表达式」与「元素真的没搬」在报告里可区分，因为两者修法不同。
- 消除 `rollbackCommand` 里重复的路径公式（一个参数名撒谎的函数）。

**Non-Goals:**

- 不放开 `private: true`。发不发 npm 是发布决策，与本次无关。
- 不做 JSX AST 解析。动态表达式按**文件级**信号判定（见 D2）。
- 不把 CLI 做成写盘工具，也不让它参与闸门。
- 不为了让 CLI 跑起来而改全仓 import 后缀（见 D3）。

## Decisions

### D1 切分位置：三个模块，一条单向依赖

```
semantic-map-io.ts    LoadedMap + readProjectMap              零 typebox、零 pi-coding-agent
        ▲
promotion-core.ts     checkPromotion + 判定 + 文本渲染          零 typebox、零 pi-coding-agent
        ▲
promotion-check.ts    Pi 工具外壳（schema + execute）           只有这里碰 typebox
        ▲
bin/check-promotion.mjs + bin/ts-resolve.mjs                    只有这里碰 node CLI
```

`semantic-tools.ts` 改为从 `semantic-map-io.ts` 导入并**再出口** `readProjectMap` / `LoadedMap`，使既有调用方不必改。

分层不是审美：它是**可验证的**——`promotion-core.test.ts` 断言核心模块能在没有 `typebox` 的环境里导入并跑通，这条断言就是「客户端真的能复用」的证明（spec scenario「无 Pi 运行时也能跑」）。

### D2 动态属性按**文件级**判定，不按元素级

检出信号是文件里存在 `data-semantic-id={`（没有紧跟引号的形态）。这是**文件级**的：一个文件里只要有任意一处动态表达式，该文件里所有未命中的元素都归 `dynamic_attribute`。

刻意的粗粒度，理由两条：

- 元素级归因需要 JSX AST（要看某个具体元素是否被某表达式渲染），而那会引入 TS 解析器依赖，与「不新增依赖」冲突；而 `impl.path` 已经把范围收窄到单个文件，文件级信号已经比现状精确得多。
- **误判方向是安全的**：把真缺失说成「可能动态」会让人去确认那个文件——顺路就会发现真相；把动态说成真缺失则送人去写已经存在的代码。所以两个桶都往 `dynamic_attribute` 倾斜。

代价写进 §Risks。

### D3 CLI 用 resolve-hook shim，不改全仓 import 后缀

两条可行路，已分别实测：

| 方案 | 可行性 | 否决/采纳理由 |
| :--- | :--- | :--- |
| (i) 把 `src/**` 的 import 后缀全改成 `.ts` | 实测可行（`node c.ts` 导入 `./b.ts` 正常） | **否决**：它会触碰 **Pi 的加载契约**（Pi 如何解析扩展入口的 import 后缀，本地无法验证）。改错的方向是**整个扩展加载不了** |
| (ii) `bin/` 下一个约 10 行的 resolve hook，把相对 `.js` specifier 重写到 `.ts` | 实测可行 | **采纳**：改动隔离在 CLI 入口，`src/` 一个字节不动；CLI 坏掉不影响扩展，反之 (i) 坏掉会干掉扩展 |

风险不对称是决定因素：**(ii) 的失败面是 CLI，(i) 的失败面是整个扩展。**

### D4 CLI 的形状与退出码

```
node bin/check-promotion.mjs --project <slug> [--page <pageId>] [--cwd <dir>]
```

`--cwd` 默认 `process.cwd()`，指向客户端仓库根。输出复用 `promotion-core.ts` 的同一个文本渲染函数——**不新写一份文案**，否则文案漂移会和判定漂移一样难查。

退出码**fail-closed**：

| 结果 | 退出码 |
| :--- | :--- |
| `clean` | 0 |
| `issues`（任一未命中类非空） | 1 |
| `missing`（没字典） | 1 |
| `unreadable`（字典坏） | 1 |
| 用法错误 | 2 |

`missing` / `unreadable` 必须非零，否则 CI 会在**什么都没核对**的情况下变绿——那正是本仓反复要消除的假绿灯。（这条是写 spec 时才发现的洞：原文只规定「未命中项非空则非零」，而缺失字典时各类列表**都为空**，按字面会返回 0。）

### D5 `rollbackCommand` 改收阶段路径

```ts
// 之前：手写公式，且 project 参数被 page-artifacts 塞进一个路径前缀
rollbackCommand(project: string, kind: Kind, version: number)
  const base = `${ARTIFACT_ROOT}/${project}/${kind}`;

// 之后：调用方给阶段路径，公式只有一份
rollbackCommand(stage: string, version: number)
```

两个调用方分别传 `stagePath(project, kind)`（`artifacts.ts`）与 `pageStagePath(project, pageId, kind)`（`page-artifacts.ts`）。与它的两个兄弟 `versionArchiveRestoreCommand` / `archiveRestoreCommand` 取得一致：那两个本来就走 `stagePath()`。

这不是「顺手清理」，是消除一个**同公式两份实现**的结构——而台账路径漂移正是这类结构长出来的东西。

### D6 「脚本是降级替代」搬到可见处

那句提醒此前只写在 `docs/prototype-to-production.md` §7，而该文档已在上一轮移入被 `.gitignore` 忽略的 `docs/notes/`，**客户端看不见**。改写进双语 README 与 SKILL §8.5，并在其中指出**正确做法是用 CLI 调同一判定**，而不是重写脚本。

## Risks / Trade-offs

- **[D2 的粗粒度：同一文件里既有字面量属性又有动态表达式的元素，真缺失会被报成 `dynamic_attribute`]** → 误判方向安全（会促使人去看文件），且报告里带出该文件路径。若某天真需要元素级归因，再引入 AST，而不是现在预建。
- **[D3 的 resolve hook 依赖 Node 的 `module.register`，Node < 22 不可用]** → 记录在 README 的前置条件里；扩展到 Pi 宿主自身不受影响（shim 只用于 CLI）。已在 Node v24.20.0 实测通过。
- **[CLI 与工具的输出可能漂移]** → 两者共用 `promotion-core.ts` 的同一个渲染函数，测试断言两条路径的文本一致。
- **[客户端仍需自己决定 `dynamic_attribute` 的处置]** → 这是刻意的：改成字面量属性、或接受静态核对看不到，是产品决策，工具不该替它选。
- **[CLI 检查必须在客户端 CI 里被接上，否则仍是「靠自律」]** → 本次只提供入口；接不接 CI 属客户端。**如实记录为残余风险**，不假装解决（与 `docs/notes/od-borrow-report.md` §4.3 同一条纪律）。
