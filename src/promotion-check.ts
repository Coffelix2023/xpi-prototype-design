/**
 * promotion-check — `prototype_promotion_check` 的 Pi 工具外壳。
 *
 * 判定、计数与文案全在 `promotion-core.ts`；这个模块**只**做 schema 与 execute。
 *
 * 分文件的理由不是审美：`typebox` 与 `@earendil-works/pi-coding-agent` 只允许
 * 出现在这里，核心因此能在没有 Pi 会话的环境（客户端 CI、脚本）里被导入并跑通——
 * 而只要客户端调不到同一个判定，它就会自己复写一份，两份实现必然漂移。
 * `bin/check-promotion.mjs` 走的就是核心，与这里的工具**共用同一个渲染函数**。
 *
 * 仍然一个字节都不写，因此不碰计划闸门。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkPromotion, promotionText, truncate } from "./promotion-core.js";
import { projectSchema } from "./tools.js";

export function registerPromotionTools(pi: ExtensionAPI): void {
  pi.registerTool({
    description:
      "只读核对：字典里已登记生产落点（impl）的元素，是否真的出现在成品源码里。按 impl.path 定位文件，匹配 data-semantic-id 的全路径值。五类结果分开计数：已推进但源码找不到、属性写成动态表达式（静态核对看不到）、容器搬了子项没搬、源码有而字典没登记、命中。字典缺失或读不出来时明说「未做核对」，不返回空结果冒充通过。不写盘、不阻断、不参与写盘许可。",
    label: "核对原型元素的生产落点",
    name: "prototype_promotion_check",
    parameters: Type.Object({
      pageId: Type.Optional(
        Type.String({
          description:
            "只核对某个页面（页面短码 P1 或全路径 chat）；不传则核对字典里的全部页面。",
        }),
      ),
      project: projectSchema,
    }),
    promptSnippet:
      "Check promoted semantic-ui-map elements against production source via data-semantic-id (read-only).",
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await checkPromotion(ctx.cwd, params.project, params.pageId);
      return {
        details: result,
        content: [
          {
            text: truncate(promotionText(result, params.project)),
            type: "text" as const,
          },
        ],
      };
    },
  });
}
