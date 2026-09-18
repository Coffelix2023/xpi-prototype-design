/**
 * semantic-map-io — 读字典的那一层，刻意不碰 `typebox`。
 *
 * 为什么单独一个文件：核对判定要能被 Pi 会话之外的东西调用（客户端 CI、脚本），
 * 而 `semantic-tools.ts` / `tools.ts` 在模块顶层 `import { Type } from "typebox"`
 * 来声明工具 schema。只要判定链路里出现那个 import，整条工具注册图就被拖进来，
 * 没有 Pi 运行时的环境就导入不了 —— 于是客户端只能自己复写一份判定，而两份
 * 实现必然漂移。
 *
 * 本模块只做一件事：读文件、把「没有字典」与「字典坏了」分开。零依赖声明。
 */
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  loadSemanticMap,
  type SemanticMap,
  semanticMapPattern,
} from "./semantic-ui-map.js";

export interface LoadedMap {
  map: SemanticMap | null;
  mapPath: string;
  /** 文件在、但读不出来（YAML 坏了，或没有 `meta`）——与「文件不存在」不同。 */
  unreadable: string | null;
}

/**
 * 读字典，把「没有字典」与「字典坏了」分开。
 *
 * `loadSemanticMap` 对不存在的文件返回 null、对坏 YAML 抛错，但「文件在、却没有
 * `meta`」也走 null 那条路。后者若报成「缺失」，Agent 会去重新建骨架，而骨架又是
 * 幂等的（不覆写）——于是它会卡在一个看不见的原因上。所以这里补一次 `stat` 区分。
 */
export async function readProjectMap(
  projectRoot: string,
  project: string,
): Promise<LoadedMap> {
  const mapPath = semanticMapPattern(projectRoot, project);
  try {
    const map = await loadSemanticMap(projectRoot, project);
    if (map)
      return {
        map,
        mapPath,
        unreadable: null,
      };
  } catch (error) {
    return {
      map: null,
      mapPath,
      unreadable: (error as Error).message,
    };
  }
  try {
    await stat(resolve(projectRoot, mapPath));
  } catch {
    return {
      map: null,
      mapPath,
      unreadable: null,
    };
  }
  return {
    map: null,
    mapPath,
    unreadable: "字典文件存在，但顶层不是映射或缺 meta，读不出字典",
  };
}
