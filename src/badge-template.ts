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
 *
 * `position: relative` 必须包在 `:where()` 里：它给徽标提供定位基准，但徽标
 * `<style>` 注入在 `<head>` 末尾，裸写 `[data-semantic-badge]` 的特异性与原型
 * 自身的 `.drawer { position: fixed }` / `.view` / `.pane` 相同，会按注入顺序
 * 覆盖掉原型的定位，把原型布局测穿（真实渲染自检里表现为面板高度、sticky 与
 * 折叠态断言集体失败）。`:where()` 特异性为 0，原型有声明时原型赢，原型没
 * 声明时这条仍生效。
 */
export function badgeCss(annotateDefault: boolean): string {
  return `:root {
  --badge-display: ${annotateDefault ? "block" : "none"};
}
:where([data-semantic-badge]) {
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
/* 朝向由注入的 JS 按元素 rect 写进 data-badge-pos：贴视口边时把徽标翻到反侧，
   四角都放不下就退回默认的左上。无属性 = 左上，与不装本段时一致。 */
[data-semantic-badge][data-badge-pos="tr"]::before {
  left: auto;
  right: -8px;
}
[data-semantic-badge][data-badge-pos="bl"]::before {
  top: auto;
  bottom: -8px;
}
[data-semantic-badge][data-badge-pos="br"]::before {
  top: auto;
  right: -8px;
  bottom: -8px;
  left: auto;
}
/* 密集区相邻元素的徽标会互相压（伪元素不参与布局，不会自己避让）。
   抬到开关(2000)之下、其余徽标之上，hover 的那一个总能读全。 */
[data-semantic-badge]:hover::before {
  z-index: 1500;
}
.badge-toggle {
  position: fixed;
  top: 12px;
  /* 顶部居中：left/right 同为 0 且宽度收窄，auto margin 平分剩余空间。
     不用 translateX(-50%)：拖动会写 left，残留 transform 会再偏半格。
     拖动后 right 被置为 auto，auto margin 归零，left 定位照常生效。 */
  left: 0;
  right: 0;
  width: fit-content;
  margin: 0 auto;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: move;
  user-select: none;
  touch-action: none;
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
  var suppressClick = false;
  btn.addEventListener("click", function () {
    // 拖拽的 pointerup 之后浏览器还会派发一次 click，这里把它吃掉，
    // 否则「把开关挪个位置」会顺手把标注关掉。
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    visible = !visible;
    apply();
  });

  // ==================== 拖动 ====================
  // 开关固定在右上角，挡住页面信息时用户可以拖走；位置记在 localStorage。
  var box = btn.closest(".badge-toggle");
  if (box) {
    var STORE_KEY = "badge-toggle-pos";
    var DRAG_THRESHOLD = 4;
    var drag = null;

    // 收边后才落笔：换到更小的窗口后，旧坐标会落在画布外。
    function clampAndPlace(left, top) {
      var maxLeft = Math.max(0, window.innerWidth - box.offsetWidth);
      var maxTop = Math.max(0, window.innerHeight - box.offsetHeight);
      var x = Math.min(Math.max(0, left), maxLeft);
      var y = Math.min(Math.max(0, top), maxTop);
      box.style.right = "auto";
      box.style.left = x + "px";
      box.style.top = y + "px";
    }

    try {
      var saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
      if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
        clampAndPlace(saved.left, saved.top);
      }
    } catch (error) {
      // 隐私模式、file:// 或坏 JSON：读不出来就用 CSS 的默认右上角，不抛错。
    }

    box.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      suppressClick = false;
      drag = {
        left: box.offsetLeft,
        top: box.offsetTop,
        x: event.clientX,
        y: event.clientY,
      };
      if (box.setPointerCapture) box.setPointerCapture(event.pointerId);
    });

    box.addEventListener("pointermove", function (event) {
      if (!drag) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      suppressClick = true;
      clampAndPlace(drag.left + dx, drag.top + dy);
    });

    box.addEventListener("pointerup", function () {
      if (!drag) return;
      drag = null;
      if (!suppressClick) return;
      try {
        window.localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ left: box.offsetLeft, top: box.offsetTop })
        );
      } catch (error) {
        // 存不下只影响「下次打开还在原地」，不影响本轮拖动。
      }
    });

    box.addEventListener("pointercancel", function () {
      drag = null;
    });
  }

  // ==================== 徽标朝向 ====================
  // 徽标画在元素左上外侧，元素贴视口边时会被推出可视区，或被 overflow 祖先裁掉。
  // 这里按元素 rect 从 4 个角里挑一个「徽标仍完整落在视口内」的角，
  // 写进 data-badge-pos，CSS 负责按角定位。
  // GAP 是留给视口边的呼吸量，略大于徽标自身 8px 的外偏。
  var GAP = 12;
  var badges = document.querySelectorAll("[data-semantic-badge]");
  function choosePos(rect) {
    var top = rect.top >= GAP;
    var bottom = window.innerHeight - rect.bottom >= GAP;
    var left = rect.left >= GAP;
    var right = window.innerWidth - rect.right >= GAP;
    if (top && left) return "tl";
    if (top && right) return "tr";
    if (bottom && left) return "bl";
    if (bottom && right) return "br";
    // 元素本身撑满视口，四角都放不下：退回默认左上。
    return null;
  }
  function placeBadges() {
    for (var i = 0; i < badges.length; i++) {
      var el = badges[i];
      var pos = choosePos(el.getBoundingClientRect());
      if (el.getAttribute("data-badge-pos") === pos) continue;
      if (pos) el.setAttribute("data-badge-pos", pos);
      else el.removeAttribute("data-badge-pos");
    }
  }
  // 判定读的是视口坐标，滚动与缩放都会改变结果；rAF 节流保证一帧最多算一次。
  var frame = 0;
  function schedulePlaces() {
    if (frame) return;
    frame = requestAnimationFrame(function () {
      frame = 0;
      placeBadges();
    });
  }
  window.addEventListener("resize", schedulePlaces);
  // capture：内层滚动容器的事件不冒泡到 window，得在捕获阶段才收得到。
  window.addEventListener("scroll", schedulePlaces, true);
  // 图片与字体后加载会挪动布局，靠 load 再收一次。
  // ponytail: 元素表只快照一次；SPA 切页插入的新元素不在表内，需要时改成每次重查。
  window.addEventListener("load", function () {
    badges = document.querySelectorAll("[data-semantic-badge]");
    schedulePlaces();
  });
  placeBadges();

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
