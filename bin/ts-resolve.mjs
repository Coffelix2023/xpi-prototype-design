/**
 * ts-resolve — 让裸 `node` 能加载 `src/**` 的 TypeScript，而**不动** `src/` 的 import 后缀。
 *
 * 为什么需要它：本包没有构建步骤（Pi 直接加载 `src/index.ts`），而 `src/**` 的 import
 * 一律写 `.js` 后缀（NodeNext 风格）。**Node 不把 `./x.js` 重写到 `./x.ts`** —— 已实测，
 * 会抛 `ERR_MODULE_NOT_FOUND`。所以 `bin` 直接指向 `src/*.ts` 跑不起来。
 *
 * 另一条可行路是把 `src/**` 的 import 后缀全改成 `.ts`（Node 24 认）。**没走那条**，
 * 因为它会触碰 Pi 的加载契约（Pi 如何解析扩展入口的 import 后缀，本地无法验证），
 * 改错的方向是**整个扩展加载不了**；而这个 hook 的失败面只有 CLI。
 *
 * 只在目标文件真的存在时改写，绝不吞掉真实的模块缺失。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && specifier.endsWith(".js")) {
    const candidate = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
  }
  return next(specifier, context);
}
