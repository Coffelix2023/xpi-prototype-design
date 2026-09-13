/**
 * requirement-editor — 需求输入对话框。
 *
 * 为什么不用 `ctx.ui.editor`：它内部是 pi-coding-agent 的 `ExtensionEditorComponent`，
 * 只把按键原样转发给 pi-tui `Editor`，而那个 `Editor.handleInput` 里**换行分支排在提交
 * 分支之前**，且硬编码把 `\x1b\r`（老式终端里 alt+enter 的编码）当换行。于是任何
 * 「提交键绑到 alt+enter、跑在非 kitty 终端」的用户都会得到「能换行、发不出去」。
 * 详细推导见 `docs/memo-terminal-keybindings.md`。
 *
 * 这里的做法只有一条差别：**提交键先判**，命中就自己收尾；其余按键照旧转发给
 * `Editor`（换行、光标、历史、粘贴展开都还是它的活）。
 */
import {
  DynamicBorder,
  type ExtensionCommandContext,
  type ExtensionUIContext,
  getSelectListTheme,
  keyHint,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Editor,
  type Focusable,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";

/**
 * 注入参数的类型从 `ctx.ui.custom` 的签名里推导，不自己从 pi-tui 具名导入。
 *
 * 原因：本仓库的 devDependency 是 pi-coding-agent 0.84.4，它自带一份 pi-tui 0.84.4
 * 类型；而运行时（以及我们 `import` 到的）是 pi-tui 0.85.1。两份类型在 `OverlayHandle`
 * 等细节上不兼容，但运行时同一个包、同一套接口，所以按注入方给的形状写，只在构造
 * `Editor` 时做一次收敛转换。
 */
type DialogFactory = Parameters<ExtensionUIContext["custom"]>[0];
type DialogTui = Parameters<DialogFactory>[0];
type DialogTheme = Parameters<DialogFactory>[1];
type DialogKeybindings = Parameters<DialogFactory>[2];

/**
 * 多行需求输入框。
 *
 * 提交与取消用注入的 `keybindings`（就是 Pi 运行时那份带用户配置的 manager）自己判，
 * 判不出结果的按键才交给内部 `Editor`。
 */
export class RequirementDialog extends Container implements Focusable {
  private readonly editor: Editor;
  private readonly keybindings: DialogKeybindings;
  private readonly done: (value: string | undefined) => void;
  private _focused = false;

  constructor(
    tui: DialogTui,
    theme: DialogTheme,
    keybindings: DialogKeybindings,
    title: string,
    done: (value: string | undefined) => void,
  ) {
    super();
    this.keybindings = keybindings;
    this.done = done;
    // DynamicBorder 必须显式传色函数：jiti 加载下它自己的全局 theme 可能不可用。
    const border = (text: string) => theme.fg("border", text);

    this.addChild(new DynamicBorder(border));
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("accent", title), 1, 0));
    this.addChild(new Spacer(1));
    // 跨版本类型的唯一一次收敛（见文件头注释）：运行时是同一套 TUI 接口。
    // SAFETY: 注入的 tui 与这里 new 出来的 Editor 都是 pi-tui 的同一套接口，
    // 只是类型来自两个 pi-tui 副本（devDep 的 0.84.4 vs 我们 import 的 0.85.1），
    // 结构兼容而名义类型不同；这是本文件唯一一处收敛。
    this.editor = new Editor(
      tui as unknown as ConstructorParameters<typeof Editor>[0],
      {
        selectList: getSelectListTheme(),
        borderColor: (text) => theme.fg("borderMuted", text),
      },
    );
    this.addChild(this.editor);
    this.addChild(new Spacer(1));
    // keyHint 取的是用户实际配置：上游 ExtensionEditorComponent 这里写的是
    // `tui.select.confirm`，改了提交键也照旧显示 enter。
    this.addChild(
      new Text(
        `${keyHint("tui.input.submit", "submit")}  ${keyHint("tui.input.newLine", "newline")}  ${keyHint("tui.select.cancel", "cancel")}`,
        1,
        0,
      ),
    );
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder(border));
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value;
  }

  handleInput(data: string): void {
    // 顺序即修复：提交先判，`\x1b\r` 之类的序列才轮不到 Editor 的硬编码换行分支。
    if (this.keybindings.matches(data, "tui.input.submit")) {
      // getExpandedText 会把粘贴占位符换成真实内容，比 getText 更适合当提交值。
      this.done(this.editor.getExpandedText().trim());
      return;
    }
    if (this.keybindings.matches(data, "tui.select.cancel")) {
      this.done(undefined);
      return;
    }
    this.editor.handleInput(data);
  }
}

/**
 * 对话框标题。
 *
 * 标题即提示：`ctx.ui.custom` 没有 placeholder 参数，示例只能写进标题。
 * 单独成函数是为了让「标题要能说明当前模式 + 带示例」有地方可测。
 */
export function requirementTitle(target: string): string {
  return `${target} · 需求（可留空，可多行）· 例：订阅页，含月付/年付切换与账单历史`;
}

/**
 * 弹需求输入框。返回 `undefined` 表示用户取消（Esc），空串表示「无需求」。
 *
 * 与 `ctx.ui.editor` 同款契约，调用方无需分辨底层是哪个组件。
 */
export function promptRequirement(
  ctx: ExtensionCommandContext,
  title: string,
): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>(
    (tui, theme, keybindings, done) =>
      new RequirementDialog(tui, theme, keybindings, title, done),
  );
}
