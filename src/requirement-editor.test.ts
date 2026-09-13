/**
 * requirement-editor 的回归锁。
 *
 * 锁的就是那个 bug：用户把提交键绑到 alt+enter（Zed / Alacritty / Terminal.app 这类
 * 非 kitty 终端只能把它发成 ESC CR），而 pi-tui `Editor` 的换行分支排在提交之前、
 * 又硬编码把 `\x1b\r` 当换行 —— 结果「能换行、发不出去」。这里用用户真实的按键配置
 * 复现，断言提交键一定生效。
 *
 * 这里不测底部提示行显示的是哪个键：`keyHint` 走的是 pi-coding-agent 内部的 pi-tui 全局，
 * 在 vitest 的模块图里那是第三个 pi-tui 实例（真跑时由 Pi 的加载器把 peer 依赖指到同一份），
 * 测不到用户配置；提示行的正确性靠 `keyHint("tui.input.submit", …)` 这个写法本身保证。
 */

import { initTheme } from "@earendil-works/pi-coding-agent";
import {
  getKeybindings,
  KeybindingsManager,
  setKeybindings,
  TUI_KEYBINDINGS,
} from "@earendil-works/pi-tui";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { RequirementDialog, requirementTitle } from "./requirement-editor.js";

/** 与用户实际配置同款：回车换行，alt+enter 提交。 */
function userKeybindings(): KeybindingsManager {
  return new KeybindingsManager(TUI_KEYBINDINGS, {
    "tui.input.newLine": "enter",
    "tui.input.submit": "alt+enter",
  });
}

/** Editor 只用这几个成员渲染与请求重绘，够用即可，不必起真 TUI。 */
const tui = {
  requestRender: () => {},
  setFocus: () => {},
  terminal: {
    columns: 80,
    rows: 24,
  },
};
const theme = {
  fg: (_color: string, text: string) => text,
};

/** 结果三态：还没提交、提交了某段文本、被取消。 */
const PENDING = Symbol("pending");

beforeAll(() => {
  // 组件里的 keyHint 走 pi-coding-agent 的全局 theme；真跑时由 Pi 启动流程初始化。
  initTheme("dark");
});

function open(kb: KeybindingsManager, title = "wireframe · 需求") {
  let result: string | undefined | typeof PENDING = PENDING;
  const dialog = new RequirementDialog(
    tui as never,
    theme as never,
    // 组件参数类型来自 pi-coding-agent 0.84.4 自带的 pi-tui 类型（见组件文件头说明），
    // 运行时是同一套 manager，故这里收敛一次。
    kb as never,
    title,
    (value) => {
      result = value;
    },
  );
  return {
    dialog,
    /** 模拟一次按键（终端原样交给组件的字节序列）。 */
    press: (data: string) => dialog.handleInput(data),
    result: () => result,
  };
}

const original = getKeybindings();

afterEach(() => {
  // 内部 Editor 读的是 pi-tui 全局 keybindings，测试期间替换过，用完还回去。
  setKeybindings(original);
});

describe("RequirementDialog", () => {
  it("submits on the configured key even when the terminal sends it as ESC CR", () => {
    const kb = userKeybindings();
    setKeybindings(kb);
    const view = open(kb);

    view.press("一个订阅页");
    view.press("\x1b\r"); // alt+enter 的老式编码：别人眼里的「换行」

    expect(view.result()).toBe("一个订阅页");
  });

  it("still inserts a newline on the key bound to newLine", () => {
    const kb = userKeybindings();
    setKeybindings(kb);
    const view = open(kb);

    view.press("第一行");
    view.press("\r"); // 回车：用户绑给了 newLine
    view.press("第二行");

    // 还没提交 —— 回车不该发送。
    expect(view.result()).toBe(PENDING);

    view.press("\x1b\r");
    expect(view.result()).toBe("第一行\n第二行");
  });

  it("submits an empty requirement instead of refusing", () => {
    const kb = userKeybindings();
    setKeybindings(kb);
    const view = open(kb);

    view.press("\x1b\r");

    // 空串 = 「无需求」起一轮，与 undefined（取消）区分开。
    expect(view.result()).toBe("");
  });

  it("returns undefined on cancel", () => {
    const kb = userKeybindings();
    setKeybindings(kb);
    const view = open(kb);

    view.press("写了一半");
    view.press("\x1b"); // Esc

    expect(view.result()).toBeUndefined();
  });
});

describe("requirementTitle", () => {
  it("names the target and carries an example", () => {
    const title = requirementTitle("wireframe");

    expect(title).toContain("wireframe · 需求");
    expect(title).toContain("例：");
  });
});
