// biome-ignore-all lint/security/noSecrets: 夹具里的 CSS 颜色与 HTML 片段都是固定字符串。
import { describe, expect, it } from "vitest";
import {
  addBadgeAttributes,
  BADGE_JS,
  BADGE_TOGGLE_ID,
  badgeCss,
  injectBadgeSystem,
} from "./badge-template.js";
import type { ElementType, SemanticElement, Status } from "./semantic-ui-map.js";

/** 裸写 `[data-semantic-badge] {` 会让徽标特异性与原型规则打平并覆盖原型定位。 */
const BARE_BADGE_SELECTOR = /^\[data-semantic-badge\] \{$/m;
function element(
  short: string,
  id: string,
  status: Status = "confirmed",
  type: ElementType = "button",
): SemanticElement {
  return {
    fidelities: {
      hifi: null,
      wireframe: null,
    },
    id,
    label: short,
    short,
    stage_created: "wireframe",
    status,
    type,
  };
}

const PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>原型</title>
</head>
<body>
  <h1>标题</h1>
  <button type="button" id="P1-2-B1" class="btn">发送</button>
</body>
</html>
`;

describe("badgeCss", () => {
  it("包含 :root 开关、before 伪元素与状态颜色", () => {
    const css = badgeCss(true);
    expect(css).toContain(":root");
    expect(css).toContain("--badge-display: block");
    expect(css).toContain("[data-semantic-badge]::before");
    expect(css).toContain("content: attr(data-semantic-badge)");
    expect(css).toContain('[data-semantic-badge][data-status="proposed"]');
    expect(css).toContain('[data-semantic-badge][data-status="confirmed"]');
    expect(css).toContain('[data-semantic-badge][data-status="locked"]');
    expect(css).toContain('[data-semantic-badge][data-type="panel"]');
  });

  it("定位基准用 :where() 降特异性，不覆盖原型自身的 position", () => {
    const css = badgeCss(true);
    expect(css).toContain(":where([data-semantic-badge])");
    expect(css).not.toMatch(BARE_BADGE_SELECTOR);
  });

  it("annotate_default 为 false 时初始隐藏", () => {
    expect(badgeCss(false)).toContain("--badge-display: none");
    expect(badgeCss(false)).not.toContain("--badge-display: block");
  });

  it("开关外壳声明了可拖拽样式", () => {
    const css = badgeCss(true);
    expect(css).toContain("cursor: move;");
    expect(css).toContain("user-select: none;");
    expect(css).toContain("touch-action: none;");
  });

  it("贴边的徽标按 data-badge-pos 翻角，无属性仍是左上", () => {
    const css = badgeCss(true);
    // tl 不单列规则：基础规则就是左上，注入只写另外三个角。
    expect(css).toContain('[data-semantic-badge][data-badge-pos="tr"]::before');
    expect(css).toContain('[data-semantic-badge][data-badge-pos="bl"]::before');
    expect(css).toContain('[data-semantic-badge][data-badge-pos="br"]::before');
    expect(css).toContain("bottom: -8px;");
    expect(css).toContain("left: auto;");
    // 密集区的 hover 提层：必须低于开关(2000)，否则会把开关盖住。
    expect(css).toContain("[data-semantic-badge]:hover::before");
    expect(css).toContain("z-index: 1500;");
  });
});

describe("BADGE_JS", () => {
  it("绑定开关事件并切换 CSS 变量", () => {
    expect(BADGE_JS).toContain(`document.getElementById("${BADGE_TOGGLE_ID}")`);
    expect(BADGE_JS).toContain('addEventListener("click"');
    expect(BADGE_JS).toContain('setProperty("--badge-display"');
    expect(BADGE_JS).toContain("classList.toggle");
    expect(BADGE_JS).toContain('btn.textContent = visible ? "ON" : "OFF"');
  });

  it("找不到按钮时直接返回，不抛错", () => {
    expect(BADGE_JS).toContain("if (!btn) return;");
  });

  it("拖动开关：指针位移、视口收边、位置持久化与抑制误点击", () => {
    expect(BADGE_JS).toContain('addEventListener("pointerdown"');
    expect(BADGE_JS).toContain('addEventListener("pointermove"');
    expect(BADGE_JS).toContain('addEventListener("pointerup"');
    expect(BADGE_JS).toContain("setPointerCapture");
    // 收边：位置必须在视口内，换小窗口后旧坐标也不会跑到画布外。
    expect(BADGE_JS).toContain("clampAndPlace");
    expect(BADGE_JS).toContain("Math.max(0, window.innerWidth - box.offsetWidth)");
    expect(BADGE_JS).toContain('box.style.right = "auto"');
    // 一次拖拽之后浏览器仍会派发 click，那个 click 不能切换显隐。
    expect(BADGE_JS).toContain("suppressClick");
    expect(BADGE_JS).toContain("localStorage.getItem");
    expect(BADGE_JS).toContain("localStorage.setItem");
  });

  it("徽标朝向：按视口四边选角，滚动与缩放后重算", () => {
    expect(BADGE_JS).toContain('querySelectorAll("[data-semantic-badge]")');
    expect(BADGE_JS).toContain("getBoundingClientRect");
    expect(BADGE_JS).toContain('setAttribute("data-badge-pos"');
    expect(BADGE_JS).toContain('removeAttribute("data-badge-pos")');
    expect(BADGE_JS).toContain('addEventListener("resize"');
    // 内层滚动容器的事件不冒泡到 window，必须在捕获阶段监听。
    expect(BADGE_JS).toContain('addEventListener("scroll", schedulePlaces, true)');
    // 判定读视口坐标，滚动每帧都会触发，靠 rAF 节流。
    expect(BADGE_JS).toContain("requestAnimationFrame");
  });
});

describe("injectBadgeSystem", () => {
  it("CSS 注入 </head> 前，按钮与 JS 注入 </body> 前", () => {
    const html = injectBadgeSystem(PAGE, true);
    const css = html.indexOf("<style data-badge-system>");
    const head = html.indexOf("</head>");
    const button = html.indexOf(`id="${BADGE_TOGGLE_ID}"`);
    const script = html.indexOf("<script data-badge-system>");
    const body = html.indexOf("</body>");

    expect(css).toBeGreaterThan(-1);
    expect(css).toBeLessThan(head);
    expect(button).toBeGreaterThan(head);
    expect(button).toBeLessThan(body);
    expect(script).toBeGreaterThan(button);
    expect(script).toBeLessThan(body);
  });

  it("原 HTML 结构保持完整", () => {
    const html = injectBadgeSystem(PAGE, true);
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain(
      '<button type="button" id="P1-2-B1" class="btn">发送</button>',
    );
    expect(html.match(/<\/head>/g)).toHaveLength(1);
    expect(html.match(/<\/body>/g)).toHaveLength(1);
  });

  it("annotate_default 为 false 时按钮初始为 OFF", () => {
    const html = injectBadgeSystem(PAGE, false);
    expect(html).toContain("--badge-display: none");
    expect(html).toContain('class="off"');
    expect(html).toContain(">OFF</button>");
  });

  it("重复注入是幂等的", () => {
    const once = injectBadgeSystem(PAGE, true);
    const twice = injectBadgeSystem(once, true);
    expect(twice).toBe(once);
    expect(twice.match(/id="badge-toggle-btn"/g)).toHaveLength(1);
  });

  // 回归：元素属性和注入标记曾同名，于是第一个徽标就让注入自认已完成。
  it("标注过元素之后仍然会注入徽标系统", () => {
    const annotated = addBadgeAttributes(PAGE, [
      element("P1-2-B1", "chat.composer.send-btn"),
    ]);
    const html = injectBadgeSystem(annotated, true);
    expect(html).toContain("<style data-badge-system>");
    expect(html).toContain('id="badge-toggle-btn"');
    expect(html).toContain('data-semantic-badge="P1-2-B1"');
  });

  it("缺 </head> 或 </body> 时追加到末尾而不抛错", () => {
    const html = injectBadgeSystem("<h1>裸片段</h1>", true);
    expect(html).toContain("<h1>裸片段</h1>");
    expect(html).toContain("<style data-badge-system>");
    expect(html).toContain("<script data-badge-system>");
  });
});

describe("addBadgeAttributes", () => {
  const send = element("P1-2-B1", "chat.composer.send-btn");

  it("按短码 id 补上徽标与状态属性", () => {
    const html = addBadgeAttributes(PAGE, [
      send,
    ]);
    expect(html).toContain(
      '<button type="button" id="P1-2-B1" class="btn" data-semantic-badge="P1-2-B1" data-status="confirmed" data-type="button">发送</button>',
    );
  });

  it("全路径 id 同样能匹配，徽标仍显示短码", () => {
    const html = addBadgeAttributes('<div id="chat.composer.send-btn">发送</div>', [
      send,
    ]);
    expect(html).toContain('data-semantic-badge="P1-2-B1"');
    expect(html).toContain('data-status="confirmed"');
  });

  it("没有对应 id 的元素不动", () => {
    const html = addBadgeAttributes('<div id="other">x</div>', [
      send,
    ]);
    expect(html).toBe('<div id="other">x</div>');
  });

  it("已标注的元素不重复标注", () => {
    const marked =
      '<button id="P1-2-B1" data-semantic-badge="P1-2-B1" data-status="locked">发送</button>';
    expect(
      addBadgeAttributes(marked, [
        send,
      ]),
    ).toBe(marked);
  });

  it("自闭合标签在 /> 前插入属性", () => {
    const html = addBadgeAttributes('<img id="P1-2-B1" src="a.png" />', [
      send,
    ]);
    expect(html).toBe(
      '<img id="P1-2-B1" src="a.png" data-semantic-badge="P1-2-B1" data-status="confirmed" data-type="button"/>',
    );
  });

  it("缺少短码的草稿条目被跳过", () => {
    const draft = {
      ...send,
      short: "",
    };
    const html = '<button id="P1-2-B1">发送</button>';
    expect(
      addBadgeAttributes(html, [
        draft,
      ]),
    ).toBe(html);
  });

  it("空元素列表原样返回", () => {
    expect(addBadgeAttributes(PAGE, [])).toBe(PAGE);
  });

  it("属性值中的引号被转义，不逃出标签", () => {
    const weird = element('P1-2-B1" onload="x', "chat.weird");
    const html = addBadgeAttributes('<div id="P1-2-B1&quot; onload=&quot;x">x</div>', [
      weird,
    ]);
    expect(html).not.toContain('onload="x"');
    expect(html).toContain("&quot;");
  });

  it("多个元素各自标注", () => {
    const page = element("P1", "chat", "proposed", "page");
    const html = addBadgeAttributes(
      '<div id="P1">page</div><div id="P1-2-B1">btn</div>',
      [
        page,
        send,
      ],
    );
    expect(html).toContain('data-semantic-badge="P1" data-status="proposed"');
    expect(html).toContain(
      'id="P1-2-B1" data-semantic-badge="P1-2-B1" data-status="confirmed"',
    );
  });
});

/** 只 stub 朝向段会碰到的东西：假按钮的 closest() 返回 null，拖动段整段短路。 */
type RectLike = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};
type BadgeNode = {
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => RectLike;
  removeAttribute: (name: string) => void;
  setAttribute: (name: string, value: string) => void;
};

/** 用「上边 + 左边 + 宽高」描述盒子，免得测试里到处铺四行字面量。 */
function rect(top: number, left: number, width: number, height: number): RectLike {
  return {
    bottom: top + height,
    left,
    right: left + width,
    top,
  };
}

/** 参数注入替掉脚本依赖的浏览器全局，跑的就是真正会注入进原型的那段。 */
function runBadgeJs(
  rects: RectLike[],
  viewport: {
    height: number;
    width: number;
  },
): Map<RectLike, string | null> {
  const assigned = new Map<RectLike, string | null>();
  const nodes: BadgeNode[] = rects.map((box) => ({
    getAttribute: () => assigned.get(box) ?? null,
    getBoundingClientRect: () => box,
    removeAttribute: () => assigned.set(box, null),
    setAttribute: (_name, value) => assigned.set(box, value),
  }));
  const win = {
    innerHeight: viewport.height,
    innerWidth: viewport.width,
    addEventListener: () => {},
  };
  const doc = {
    documentElement: {
      style: {
        setProperty: () => {},
      },
    },
    getElementById: () => ({
      textContent: "",
      addEventListener: () => {},
      classList: {
        toggle: () => {},
      },
      closest: () => null,
    }),
    querySelectorAll: () => nodes,
  };
  new Function(
    "window",
    "document",
    "getComputedStyle",
    "requestAnimationFrame",
    BADGE_JS,
  )(
    win,
    doc,
    () => ({
      getPropertyValue: () => "block",
    }),
    (fn: () => void) => fn(),
  );
  return assigned;
}

describe("BADGE_JS 朝向判定", () => {
  const viewport = {
    height: 600,
    width: 800,
  };

  it("视口中间的元素保持默认左上", () => {
    const middle = rect(300, 400, 100, 40);
    expect(
      runBadgeJs(
        [
          middle,
        ],
        viewport,
      ).get(middle),
    ).toBe("tl");
  });

  it("贴左边的翻到右上，贴上边的翻到左下，左上角翻到右下", () => {
    const left = rect(300, 2, 98, 40);
    const top = rect(2, 400, 100, 38);
    const corner = rect(2, 2, 98, 38);
    const assigned = runBadgeJs(
      [
        left,
        top,
        corner,
      ],
      viewport,
    );
    expect(assigned.get(left)).toBe("tr");
    expect(assigned.get(top)).toBe("bl");
    expect(assigned.get(corner)).toBe("br");
  });

  it("撑满视口的元素四角都放不下，退回无属性", () => {
    const full = rect(0, 0, 800, 600);
    expect(
      runBadgeJs(
        [
          full,
        ],
        viewport,
      ).get(full),
    ).toBeUndefined();
  });
});
