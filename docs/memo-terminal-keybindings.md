# 学习笔记：终端按键、快捷键与「为什么 alt+enter 发不出去」

> 触发这件事的真实 bug：`xpi-prototype-design` 的需求对话框能换行、**却发不出去**。
> 本文按「现象 → 原理 → 排查 → 根因 → 修复 → 经验」走一遍，读完你应该能独立处理
> 同类问题：**终端里某个组合键不生效**。

---

## 0. 一句话结论

> 终端里的按键**不是按键，是一串字节**；Pi 把它翻译成「语义按键」时又依赖三处约定
> （终端能力、keybinding 表、组件判定顺序）。任何一处不匹配，用户看到的就是「这个键没用」。

本次的链条：

```text
Zed 终端发不出「独立的 alt+enter 序列」
  → 只能发老式编码 ESC CR
  → pi-tui Editor 把 ESC CR 硬编码成「换行」
  → 用户在对话框里按 alt+enter，只会多一行，永远提交不了
```

---

## 1. 现象

用户的键位配置（`~/.pi/agent/keybindings.json`）：

```json
{
  "tui.input.newLine": "enter",
  "tui.input.submit": "alt+enter"
}
```

期望：回车换行，`alt+enter` 发送。
实际：主输入框正常；`xpi-prototype-design` 弹出的需求对话框里**回车换行、`alt+enter` 也换行**。

---

## 2. 原理：一次按键的三段流水线

```text
[终端] 按键 → 字节序列
   │
   ▼
[TUI 组件] 拿到 string，问 keybinding 表：这串字节是谁？
   │
   ▼
[动作] submit / newLine / cancel / …
```

三段里任何一段「翻译不出来」，键就静默失效。下面逐段看。

### 2.1 终端段：`alt+enter` 到底发什么字节

终端表示「带修饰键的回车」有三代方案，越新越好：

| 方案 | `alt+enter` 的字节 | 谁支持 |
| --- | --- | --- |
| 老式 ESC 前缀 | `ESC` + `CR` = `\x1b\r` | 所有终端；**有歧义**（和「先按 Esc 再按回车」同形） |
| xterm `modifyOtherKeys` | `\x1b[27;3;13~` | xterm、部分终端 |
| kitty keyboard protocol | `\x1b[13;3u` | kitty、Ghostty、WezTerm、iTerm2… |

Pi 启动时会**探测**终端：支持 kitty 就开 kitty；否则退一步发 `\x1b[>4;2m` 请求
`modifyOtherKeys`；再不行就只剩老式 `ESC CR`。

**本次的终端是 Zed 内嵌终端**（`echo $TERM_PROGRAM` → `zed`）。Zed 在应用层接管键盘，
既不实现 kitty 协议、也不转发 `modifyOtherKeys`，所以 `alt+enter` 只能是 `\x1b\r`。

> 自查手法（在**出问题的那个终端**里敲）：
>
> ```bash
> cat -v      # 然后按 alt+enter，看回显
> ```
>
> - 看到 `^[` 换行 → 老式 `ESC CR`（就是本文的情形）
> - 看到 `^[[13;3u` → kitty 协议
> - 看到 `^[[27;3;13~` → modifyOtherKeys

### 2.2 匹配段：字节怎么变成「按键名」

Pi 用 `matchesKey(字节, 按键名)` 做翻译：

```bash
# 在本仓库根目录，验一条序列到底算不算 alt+enter
node --input-type=module -e "
import { matchesKey } from '@earendil-works/pi-tui';
console.log(matchesKey('\u001b\r', 'alt+enter'));   // true
console.log(matchesKey('\u001b\r', 'enter'));       // false
"
```

结论：`\x1b\r` **确实**是 `alt+enter`。所以问题不在翻译，而在下一段。

### 2.3 组件段：判定的**顺序**比判定本身更重要

`node_modules/@earendil-works/pi-tui/dist/components/editor.js` 的 `handleInput`：

```js
// ① 换行分支（在提交之前）
if (kb.matches(data, "tui.input.newLine") ||
    (data.charCodeAt(0) === 10 && data.length > 1) ||
    data === "\x1b\r" ||                       // ← 硬编码：ESC CR 当换行
    data === "\x1b[13;2~" ||
    (data.length > 1 && data.includes("\x1b") && data.includes("\r")) ||
    (data === "\n" && data.length === 1)) {
  this.addNewLine();
  return;                                      // ← 到此为止，后面不再判
}

// ② 提交分支
if (kb.matches(data, "tui.input.submit")) { this.submitValue(); return }
```

`\x1b\r` 在第 ① 步就被吃掉了，`return` 之后永远走不到第 ② 步。
**同一个字节同时满足两条规则时，谁先判谁赢。**

---

## 3. 排查动作（可复用）

1. **确认现象边界**：主输入框能发、对话框不能 → 差异一定在「组件」这一层，不在终端。
2. **验证字节到按键的翻译**：上面那条 `matchesKey` 命令。
3. **读上游实现**：`ExtensionEditorComponent`（对话框用的组件）只有 60 行：

   ```js
   // dist/modes/interactive/components/extension-editor.js
   handleInput(keyData) {
     if (kb.matches(keyData, "tui.select.cancel")) { cancel(); return }
     if (this.keybindings.matches(keyData, "app.editor.external")) { … }
     this.editor.handleInput(keyData);   // ← 原样转发，自己不认提交键
   }
   ```

   它就是 `new Editor(...)` 加一圈边框，**提交完全交给 pi-tui Editor**，所以 2.3 的
   顺序问题原封不动地存在。
4. **问「为什么主输入框能用」**：主输入框不是 `ExtensionEditorComponent`，而是
   `CustomEditor`，它多了一张 action 表：

   ```js
   this.defaultEditor.onAction("app.message.followUp", () => this.handleFollowUp())
   ```

   而 `app.message.followUp` 的 macOS 默认键**正好也是 `alt+enter`**，`handleFollowUp()`
   在非流式时直接替你调 `editor.onSubmit(text)`：

   ```js
   this.session.isStreaming ? … : this.editor.onSubmit && (this.editor.setText(""), this.editor.onSubmit(text))
   ```

   也就是说：主输入框能发送是**搭便车**，不是 `tui.input.submit` 生效了。
   （顺带发现：你的 `tui.input.submit` 与内置 `app.message.followUp` 撞键了，
   Pi 的冲突检测只报「用户自己两处绑定撞车」，不报「撞内置默认」。）

---

## 4. 根因链（四层，缺一不可）

| 层 | 事实 | 后果 |
| --- | --- | --- |
| 终端 | Zed 不实现 kitty / modifyOtherKeys | `alt+enter` 只能是 `\x1b\r` |
| keybinding | `\x1b\r` 确实匹配 `alt+enter` | 翻译没问题，别在这里绕 |
| pi-tui `Editor` | 换行分支在前，且硬编码 `\x1b\r` | `alt+enter` 变成换行 |
| 组件 | `ExtensionEditorComponent` 不认提交键、只转发 | 对话框里没有任何补救机会 |

---

## 5. 修复：让提交键**先判**

`src/requirement-editor.ts` 换掉 `ctx.ui.editor`，自己搭对话框（`ctx.ui.custom()`），
差别只有一段：

```ts
handleInput(data: string): void {
  // 顺序即修复：提交先判，`\x1b\r` 之类的序列才轮不到 Editor 的硬编码换行分支。
  if (this.keybindings.matches(data, "tui.input.submit")) {
    this.done(this.editor.getExpandedText().trim());
    return;
  }
  if (this.keybindings.matches(data, "tui.select.cancel")) {
    this.done(undefined);
    return;
  }
  this.editor.handleInput(data);   // 其余（换行、光标、历史、粘贴）照旧交给 Editor
}
```

要点：

- `keybindings` 由 `ctx.ui.custom()` 注入，就是 Pi 运行时那份**带用户配置**的 manager；
- 用 `getExpandedText()` 而不是 `getText()`：大段粘贴在编辑器里是占位符，前者会展开；
- 这样还顺手修好两件事：提示行能显示用户真实的提交键；`submit=enter` 时 LF 编码的回车
  不再被硬编码的 `"\n"` 分支吃掉。

---

## 6. 怎么证明修好了

回归测试 `src/requirement-editor.test.ts`，用**用户真实的按键配置**复现：

```ts
const kb = new KeybindingsManager(TUI_KEYBINDINGS, {
  "tui.input.newLine": "enter",
  "tui.input.submit": "alt+enter",
});
view.press("一个订阅页");
view.press("\x1b\r");          // alt+enter 的老式编码
expect(view.result()).toBe("一个订阅页");
```

同一个文件还锁住「回车只换行」「空提交允许」「Esc 返回 undefined」。
手工验收：`/xpi-prototype-design wireframe` 回车，在对话框里敲两行再按 `alt+enter`。

---

## 7. 可迁移的经验

1. **判定顺序是契约。** 多个规则可能命中同一输入时，「先判谁」是行为的一部分。
   修 bug 时先问「是不是被前面的分支吃了」，再看规则写得对不对。
2. **硬编码按键序列是地雷。** `data === "\x1b\r"` 这种兜底会覆盖用户配置，
   应写成「如果用户把提交键设成 …」。上游这处是为了兼容没有 shift+enter 的终端，
   代价就是今天我们踩的坑。
3. **先找「为什么另一边能用」。** 主输入框能用不是对照组的胜利，而是它恰好有别的通路
   （`app.message.followUp`）。找到那条通路，就找到了自己缺什么。
4. **默认键可能被内置功能占用。** 改 `tui.*` 之前先看 `app.*` 有没有同键；
   本次 `alt+enter` = `app.message.followUp`。
5. **模块实例 ≠ 包名。** 本仓库 devDependency 的 `pi-coding-agent@0.84.4` 自带一份
   pi-tui 0.84.4 类型，而我们 `import` 的是 0.85.1，于是出现「类型不兼容但运行没问题」
   （`src/requirement-editor.ts` 里有一次带注释的收敛）。运行时 Pi 用加载器的 alias
   把扩展的 `@earendil-works/pi-tui` 指到**自己那一份**，所以 `setKeybindings` 全局是同一份；
   但在 vitest 的模块图里会有三个副本，这就是测试里不能断言 `keyHint` 文案的原因。
6. **排查顺序：终端 → 翻译 → 组件。** 从最外层的能力问题（终端支持什么）开始，
   再到翻译（字节↔按键名），最后才怀疑业务代码。

---

## 8. 延伸阅读

- kitty keyboard protocol 规范：<https://sw.kovidgoyal.net/kitty/keyboard-protocol>
- Zed 终端不支持该协议：<https://github.com/zed-industries/zed/issues/29654>
- Pi 上游同类修复：`fix(tui): detect Zed terminal capabilities`（earendil-works/pi#8828）
- 本仓库相关代码：`src/requirement-editor.ts`、`src/requirement-editor.test.ts`
