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

  it("annotate_default 为 false 时初始隐藏", () => {
    expect(badgeCss(false)).toContain("--badge-display: none");
    expect(badgeCss(false)).not.toContain("--badge-display: block");
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
