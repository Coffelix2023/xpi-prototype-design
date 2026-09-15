// biome-ignore-all lint/security/noSecrets: 夹具里的 YAML 片段都是固定字符串。
// biome-ignore-all lint/performance/useTopLevelRegex: 断言里的正则每个只跑一次，提到顶层反而离断言更远。
import { describe, expect, it } from "vitest";
import {
  parseYaml,
  yamlMapping,
  yamlNumber,
  yamlOneOf,
  yamlString,
  yamlStringList,
} from "./semantic-ui-map-yaml.js";

/**
 * 边界测试的口径：**解析器只承诺 schema 用得到的子集**。
 *
 * 因此这里有两种断言并重——能解析的要给准值，不支持的要么明确报错、要么留下
 * 「原样字符串」这个可预见的结果。两者都是契约的一部分：前者防止静默吞掉错误，
 * 后者让「不支持锚点/块标量」这件事有据可查（见 docs/semantic-ui-map-schema.md）。
 */
describe("空与退化输入", () => {
  it("空串、纯空白、纯注释、纯文档标记都读成 null", () => {
    expect(parseYaml("")).toBeNull();
    expect(parseYaml("\n\n   \n")).toBeNull();
    expect(parseYaml("# 只有注释\n   # 缩进的注释\n")).toBeNull();
    expect(parseYaml("---\n...\n")).toBeNull();
  });

  it("BOM 与 CRLF 不影响解析", () => {
    expect(parseYaml("\uFEFFproject: chat\r\nversion: 2\r\n")).toEqual({
      project: "chat",
      version: 2,
    });
  });

  it("文档标记可以夹在内容之间", () => {
    expect(parseYaml("---\na: 1\n...\n")).toEqual({
      a: 1,
    });
  });
});

describe("标量", () => {
  it("数字、布尔、null 各归其类", () => {
    expect(
      parseYaml(
        "int: 1\nneg: -2\nfloat: 2.5\npi: 3.5\ntruthy: true\nfalsy: no\nnullish: ~",
      ),
    ).toEqual({
      falsy: false,
      float: 2.5,
      int: 1,
      neg: -2,
      nullish: null,
      pi: 3.5,
      truthy: true,
    });
  });

  it("YAML 1.1 的 on/off/yes/no 也当布尔", () => {
    expect(parseYaml("a: on\nb: OFF\nc: Yes\nd: n")).toEqual({
      a: true,
      b: false,
      c: true,
      d: "n",
    });
  });

  it("空值、null 字面量与缺失值都是 null", () => {
    expect(parseYaml("a:\nb: null\nc: ~")).toEqual({
      a: null,
      b: null,
      c: null,
    });
  });

  it("不匹配数字模式的一律留作字符串", () => {
    expect(parseYaml("a: 1abc\nb: 1.2.3\nc: +5")).toEqual({
      a: "1abc",
      b: "1.2.3",
      c: "+5",
    });
  });

  it("双引号里支持反斜杠转义，单引号里用两个单引号转义", () => {
    expect(
      parseYaml('a: "x\\ny"\nb: "tab\\there"\nc: "quote\\"end"\nd: \'it\'\'s\''),
    ).toEqual({
      a: "x\ny",
      b: "tab\there",
      c: 'quote"end',
      d: "it's",
    });
  });

  it("未闭合的引号报错，不静默吞掉后半行", () => {
    expect(() => parseYaml('a: "abc')).toThrow(/unterminated string/);
    expect(() => parseYaml("a: 'abc")).toThrow(/unterminated string/);
  });
});

describe("注释", () => {
  it("行内注释被剥离，引号里的 # 和紧贴文字的 # 不动", () => {
    expect(parseYaml('a: 1 # 注释\nb: text#notcomment\nc: "x # y"')).toEqual({
      a: 1,
      b: "text#notcomment",
      c: "x # y",
    });
  });

  it("被注释掉的行整行消失，不影响后续缩进判断", () => {
    expect(parseYaml("a:\n  # 说明\n  b: 1\n")).toEqual({
      a: {
        b: 1,
      },
    });
  });
});

describe("块结构", () => {
  it("映射与序列嵌套到 5 层仍然稳", () => {
    const source = [
      "pages:",
      "  P1:",
      "    elements:",
      "      chat.composer:",
      "        props:",
      "          disabled:",
      "            type: boolean",
      "            current: false",
      "",
    ].join("\n");
    expect(parseYaml(source)).toEqual({
      pages: {
        P1: {
          elements: {
            "chat.composer": {
              props: {
                disabled: {
                  current: false,
                  type: "boolean",
                },
              },
            },
          },
        },
      },
    });
  });

  it("序列里第一项是键值对时，后续同级键并进同一个元素", () => {
    expect(parseYaml("elements:\n  - id: a\n    type: button\n  - id: b\n")).toEqual({
      elements: [
        {
          id: "a",
          type: "button",
        },
        {
          id: "b",
        },
      ],
    });
  });

  it("序列项可以是空值或嵌套块", () => {
    expect(parseYaml("a:\n  -\n  -\n    b: 1\n")).toEqual({
      a: [
        null,
        {
          b: 1,
        },
      ],
    });
  });
});

describe("流式结构", () => {
  it("流式映射、序列与空容器", () => {
    expect(parseYaml("a: {x: 1, y: two}\nb: [1, 2, three]\nc: {}\nd: []")).toEqual({
      c: {},
      d: [],
      a: {
        x: 1,
        y: "two",
      },
      b: [
        1,
        2,
        "three",
      ],
    });
  });

  it("流式结构可以嵌套，逗号在引号与括号内不切分", () => {
    expect(parseYaml('a: [{k: "v,1"}, {k2: [1, 2]}]\nb: ["x]y", z]')).toEqual({
      a: [
        {
          k: "v,1",
        },
        {
          k2: [
            1,
            2,
          ],
        },
      ],
      b: [
        "x]y",
        "z",
      ],
    });
  });

  it("流式未闭合报错", () => {
    expect(() => parseYaml("a: [1, 2")).toThrow(/unterminated sequence/);
    expect(() => parseYaml("a: {x: 1")).toThrow(/unterminated mapping/);
  });
});

describe("结构性错误", () => {
  it("重复键（块式与流式）都报错", () => {
    expect(() => parseYaml("a: 1\na: 2\n")).toThrow(/duplicate key/);
    expect(() => parseYaml("a: {x: 1, x: 2}")).toThrow(/duplicate key/);
  });

  it("tab 缩进直接拒绝", () => {
    expect(() => parseYaml("a:\n\tb: 1\n")).toThrow(/tabs are not allowed/);
  });

  it("没有冒号的行不是合法映射项", () => {
    expect(() => parseYaml("这不是字典\n")).toThrow(/expected "key: value"/);
    expect(() => parseYaml("a: 1\nb\n")).toThrow(/expected "key: value"/);
  });

  it("空 key 报错", () => {
    expect(() => parseYaml(": 1\n")).toThrow(/expected "key: value"/);
  });

  it("缩进回退到中间层级时报错，不猜层级", () => {
    expect(() => parseYaml("a:\n    b: 1\n  c: 2\n")).toThrow(/unexpected indentation/);
  });

  it("顶层内容读完还有剩余时报错", () => {
    expect(() => parseYaml("a: 1\nb: 2\n  c: 3\n")).toThrow(/unexpected indentation/);
  });
});

describe("明确不支持的 YAML 特性", () => {
  it("锚点与别名降级成普通字符串，不报错也不解析", () => {
    expect(parseYaml("a: &anchor\nb: *ref\nc: <<\n")).toEqual({
      a: "&anchor",
      b: "*ref",
      c: "<<",
    });
  });

  it("块标量不折行：`|` 就是字符串，缩进内容按非法缩进拒绝", () => {
    expect(parseYaml("a: |\n")).toEqual({
      a: "|",
    });
    expect(() => parseYaml("a: |\n  多行\n")).toThrow(/unexpected indentation/);
  });
});

describe("取值助手", () => {
  it("yamlMapping 只认映射", () => {
    expect(
      yamlMapping({
        a: 1,
      }),
    ).toEqual({
      a: 1,
    });
    expect(yamlMapping([])).toBeNull();
    expect(yamlMapping("x")).toBeNull();
    expect(yamlMapping(null)).toBeNull();
    expect(yamlMapping(undefined)).toBeNull();
  });

  it("yamlString / yamlNumber 只认对应类型", () => {
    expect(yamlString("x")).toBe("x");
    expect(yamlString(1)).toBeUndefined();
    expect(yamlNumber(1)).toBe(1);
    expect(yamlNumber("1")).toBeUndefined();
  });

  it("yamlStringList 过滤非字符串，过滤空了等于没有", () => {
    expect(
      yamlStringList([
        "a",
        1,
        "b",
      ]),
    ).toEqual([
      "a",
      "b",
    ]);
    expect(
      yamlStringList([
        1,
        2,
      ]),
    ).toBeUndefined();
    expect(yamlStringList([])).toBeUndefined();
    expect(yamlStringList("a")).toBeUndefined();
  });

  it("yamlOneOf 做闭集收窄", () => {
    const values = [
      "a",
      "b",
    ] as const;
    expect(yamlOneOf(values, "a")).toBe(true);
    expect(yamlOneOf(values, "c")).toBe(false);
    expect(yamlOneOf(values, 1)).toBe(false);
    expect(yamlOneOf(values, undefined)).toBe(false);
  });
});
