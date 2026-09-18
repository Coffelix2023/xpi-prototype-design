#!/usr/bin/env node
/**
 * check-promotion — 核对判定的**会话外入口**，给客户端 CI 用。
 *
 * 存在的唯一理由：判定只要不能被 Pi 会话之外的东西调用，客户端就会（也必须）
 * 自己复写一份 —— 实测就是这么发生的一次：客户端 CI 里跑的是从研究文档抄来的
 *
 *     rg -q --fixed-strings "\"$id\"" "$path"
 *
 * 只要文件里出现带引号的 id 就算过，于是同一份源码得出「脚本 OK: 16 个 /
 * 工具：命中 10，缺 6」两个相反结论。这个入口调的是**同一个**判定与**同一个**
 * 渲染函数（`src/promotion-core.ts`），所以两边的口径不可能再分叉。
 *
 * 用法：
 *   check-promotion --project <slug> [--page <pageId>] [--cwd <dir>]
 *
 * 退出码（fail-closed）：
 *   0  各类差异均为 0
 *   1  有未命中项，或**没做核对**（字典缺失 / 读不出来）
 *   2  入口无法完成核对（用法错误、slug 非法、读取异常）
 *
 * 只读：不写盘、不参与写盘许可判定。
 */
import { register } from "node:module";
import { argv, cwd, exit, stderr, stdout } from "node:process";

const USAGE = [
  "用法: check-promotion --project <slug> [--page <pageId>] [--cwd <dir>]",
  "",
  "  --project  项目 slug（小写 kebab-case，必填）",
  "  --page     只核对某个页面（页面短码 P1 或全路径 chat）",
  "  --cwd      目标仓库根，默认为当前工作目录",
  "",
  "退出码: 0 无差异 / 1 有未命中项或未做核对 / 2 用法或环境错误",
].join("\n");

/** 只解析本入口认识的旗标；未知旗标按用法错误处理，不静默忽略。 */
function parse(argv) {
  const options = {
    cwd: cwd(),
    page: undefined,
    project: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h")
      return {
        help: true,
      };
    if (flag === "--project" || flag === "--page" || flag === "--cwd") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--"))
        return {
          error: `${flag} 缺少取值`,
        };
      options[flag.slice(2)] = value;
      index += 1;
      continue;
    }
    return {
      error: `未知参数 ${flag}`,
    };
  }
  if (!options.project)
    return {
      error: "缺少 --project",
    };
  return {
    options,
  };
}

const parsed = parse(argv.slice(2));
if (parsed.help) {
  stdout.write(`${USAGE}\n`);
  exit(0);
}
if (parsed.error) {
  stderr.write(`${parsed.error}\n\n${USAGE}\n`);
  exit(2);
}

// 让裸 node 能加载 src/** 的 .ts（理由见 ts-resolve.mjs）。
register("./ts-resolve.mjs", import.meta.url);

let core;
try {
  core = await import("../src/promotion-core.ts");
} catch (error) {
  stderr.write(`无法加载核对核心：${error.message}\n`);
  exit(2);
}

const { cwd: root, page, project } = parsed.options;
let result;
try {
  result = await core.checkPromotion(root, project, page);
} catch (error) {
  // slug 非法、路径越界一类都会走到这里。按入口错误报，且非零退出。
  stderr.write(`核对无法完成：${error.message}\n`);
  exit(2);
}

// 刻意**不**截断：`MAX_OUTPUT` 是为模型上下文预算设的，CI 报告没有那份预算，
// 截断只会让人看不到后半个列表。工具的完整文本与这里共用同一个渲染函数。
stdout.write(`${core.promotionText(result, project)}\n`);
exit(core.exitCodeFor(result));
