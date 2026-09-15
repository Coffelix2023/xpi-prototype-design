/**
 * badge-template — HTML 徽标渲染系统：CSS/JS 模板与注入工具。
 *
 * 徽标用 `::before` 伪元素画，不往 DOM 里塞节点：复制元素源码时徽标自动消失，
 * 序列化产物里也就没有需要清理的痕迹。显隐只由一个 CSS 变量 `--badge-display`
 * 决定，开关按钮改的是它，遍历 DOM 的事一次都不用做。
 *
 * 注入是幂等的：页面里已有 `data-semantic-badge-system` 就原样返回。
 */
import type { SemanticElement } from "./semantic-ui-map.js";

/** 开关按钮的 id。JS 靠它找按钮，重复注入也只会命中第一个。 */
export const BADGE_TOGGLE_ID = "badge-toggle-btn";

/**
 * 元素上的徽标属性。CSS 的 `content: attr(...)` 与 spec.md 都用这个名字，
 * 改名会让「生成的 HTML 与规范不符」。
 */
export const BADGE_ATTR = "data-semantic-badge";

/**
 * 注入标记，只打在 `<style>` / `<script>` / 开关按钮上。
 *
 * 必须与 `BADGE_ATTR` 不同名：同名的话元素上第一个徽标属性就会让
 * `injectBadgeSystem` 以为「这个文件已经装过徽标系统」，静默跳过注入。
 */
export const BADGE_MARK = "data-badge-system";

/**
 * 徽标 CSS。`:root` 的 `--badge-display` 是唯一开关，`[data-semantic-badge]`
 * 上的 `::before` 用 `attr()` 取短码，状态和类型只是换一个背景色。
 */
export function badgeCss(annotateDefault: boolean): string {
  return `:root {
  --badge-display: ${annotateDefault ? "block" : "none"};
}
[data-semantic-badge] {
  position: relative;
}
[data-semantic-badge]::before {
  content: attr(data-semantic-badge);
  position: absolute;
  top: -8px;
  left: -8px;
  z-index: 1000;
  display: var(--badge-display);
  padding: 2px 8px;
  font-family: ui-monospace, "SF Mono", Monaco, monospace;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  color: #ffffff;
  white-space: nowrap;
  pointer-events: none;
  background: #4f46e5;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgb(0 0 0 / 0.15);
}
[data-semantic-badge][data-status="proposed"]::before {
  background: #f59e0b;
}
[data-semantic-badge][data-status="confirmed"]::before {
  background: #4f46e5;
}
[data-semantic-badge][data-status="locked"]::before {
  background: #4b5563;
}
[data-semantic-badge][data-type="panel"]::before {
  background: #7c3aed;
}
.badge-toggle {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.12);
}
.badge-toggle-label {
  font-family: system-ui, sans-serif;
  font-size: 12px;
  color: #4b5563;
}
.badge-toggle button {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  background: #4f46e5;
  border: none;
  border-radius: 6px;
}
.badge-toggle button.off {
  background: #4b5563;
}
`;
}

/**
 * 徽标 JavaScript。初始状态直接从 `--badge-display` 读回来，不再另立一份
 * 真相——CSS 决定显示什么，按钮只负责把它翻过来。
 */
export const BADGE_JS = `(function () {
  var btn = document.getElementById("${BADGE_TOGGLE_ID}");
  if (!btn) return;
  var root = document.documentElement;
  var visible =
    getComputedStyle(root).getPropertyValue("--badge-display").trim() !== "none";
  function apply() {
    root.style.setProperty("--badge-display", visible ? "block" : "none");
    btn.textContent = visible ? "ON" : "OFF";
    btn.classList.toggle("off", !visible);
  }
  btn.addEventListener("click", function () {
    visible = !visible;
    apply();
  });
  apply();
})();
`;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 在 `</tag>` 之前插入；文档缺这个结束标签时退化为追加到末尾，不抛错。 */
function injectBefore(html: string, tag: string, block: string): string {
  const closing = `</${tag}>`;
  const at = html.toLowerCase().indexOf(closing);
  if (at < 0) return `${html}\n${block}`;
  return `${html.slice(0, at)}${block}${html.slice(at)}`;
}

function toggleHtml(annotateDefault: boolean): string {
  const state = annotateDefault ? "ON" : "OFF";
  const className = annotateDefault ? "" : ' class="off"';
  return `<div class="badge-toggle">
  <span class="badge-toggle-label">🏷️ 语义标注</span>
  <button type="button" ${BADGE_MARK} id="${BADGE_TOGGLE_ID}"${className}>${state}</button>
</div>`;
}

/**
 * 注入 CSS 到 `</head>` 前，注入按钮和 JS 到 `</body>` 前。
 *
 * 幂等：同一份 HTML 再注一次不会出现第二个按钮。
 */
export function injectBadgeSystem(html: string, annotateDefault: boolean): string {
  if (html.includes(BADGE_MARK)) return html;
  const withCss = injectBefore(
    html,
    "head",
    `<style ${BADGE_MARK}>\n${badgeCss(annotateDefault)}</style>\n`,
  );
  return injectBefore(
    withCss,
    "body",
    `${toggleHtml(annotateDefault)}\n<script ${BADGE_MARK}>\n${BADGE_JS}</script>\n`,
  );
}

/** 起始标签，属性部分容忍引号内的 `>`。注释和结束标签天然不匹配。 */
const TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ID_PATTERN = /\sid\s*=\s*("([^"]*)"|'([^']*)')/;

/**
 * 给 HTML 里已存在的元素补徽标属性。
 *
 * 匹配靠元素的 `id` 属性，短码（`P1-2-B1`）和全路径（`chat.composer`）都认，
 * 两种写法在不同原型里都出现过。没有对应 id 的元素不动，已标注的不重复标注。
 */
export function addBadgeAttributes(html: string, elements: SemanticElement[]): string {
  const byId = new Map<string, SemanticElement>();
  for (const element of elements) {
    // 没有短码的草稿条目标不出可念的徽标，跳过。
    if (element.short.length === 0) continue;
    for (const key of [
      element.short,
      element.id,
    ]) {
      if (key.length > 0 && !byId.has(key)) byId.set(key, element);
    }
  }
  if (byId.size === 0) return html;

  return html.replace(TAG_PATTERN, (tag) => {
    if (tag.includes(BADGE_ATTR)) return tag;
    const idMatch = ID_PATTERN.exec(tag);
    const id = idMatch?.[2] ?? idMatch?.[3];
    const element = id ? byId.get(id) : undefined;
    if (!element) return tag;

    const attrs = [
      `${BADGE_ATTR}="${escapeAttr(element.short)}"`,
      `data-status="${escapeAttr(element.status)}"`,
      `data-type="${escapeAttr(element.type)}"`,
    ].join(" ");
    const close = tag.endsWith("/>") ? "/>" : ">";
    const head = tag.slice(0, tag.length - close.length).trimEnd();
    return `${head} ${attrs}${close}`;
  });
}
