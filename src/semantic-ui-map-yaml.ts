/**
 * semantic-ui-map — minimum YAML parser for the project schema.
 *
 * Supported: block mappings/sequences, flow mappings/sequences, quoted
 * strings, numbers, booleans and null. Anchors and block scalars are not
 * supported because the semantic map schema does not use them.
 */

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | {
      [key: string]: YamlValue;
    };

export interface YamlMapping {
  [key: string]: YamlValue;
}

interface YamlLine {
  indent: number;
  text: string;
}

const BOOLEAN_LITERALS = new Set([
  "true",
  "false",
  "yes",
  "no",
  "on",
  "off",
]);
const DOCUMENT_MARKERS = new Set([
  "---",
  "...",
]);
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;
const BOM_PATTERN = /^\uFEFF/;
const LINE_BREAK_PATTERN = /\r?\n/;
const TAB_INDENT_PATTERN = /^[ \t]*\t/;
const WHITESPACE_PATTERN = /\s/;

function stripYamlComment(line: string): string {
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote.length > 0) {
      if (quote === '"' && char === "\\") {
        index += 1;
      } else if (quote === "'" && char === "'" && line[index + 1] === "'") {
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || WHITESPACE_PATTERN.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function toYamlLines(source: string): YamlLine[] {
  const lines: YamlLine[] = [];
  for (const raw of source.replace(BOM_PATTERN, "").split(LINE_BREAK_PATTERN)) {
    const trimmed = stripYamlComment(raw).trimEnd();
    if (trimmed.length === 0) continue;
    if (TAB_INDENT_PATTERN.test(trimmed)) {
      throw new Error(
        `Invalid YAML: tabs are not allowed near ${JSON.stringify(trimmed)}`,
      );
    }
    if (DOCUMENT_MARKERS.has(trimmed.trim())) continue;
    const indent = trimmed.length - trimmed.trimStart().length;
    lines.push({
      indent,
      text: trimmed.trimStart(),
    });
  }
  return lines;
}

function unquoteYaml(text: string): string {
  const quote = text[0];
  if (quote !== '"' && quote !== "'") return text;
  if (text.length < 2 || text[text.length - 1] !== quote) {
    throw new Error(`Invalid YAML: unterminated string ${JSON.stringify(text)}`);
  }
  const inner = text.slice(1, -1);
  if (quote === "'") return inner.replace(/''/g, "'");
  return inner.replace(/\\(["\\/nrt])/g, (_, char: string) => {
    if (char === "n") return "\n";
    if (char === "r") return "\r";
    if (char === "t") return "\t";
    return char;
  });
}

function parseYamlScalar(text: string): YamlValue {
  if (text.length === 0) return null;
  if (text.startsWith('"') || text.startsWith("'")) return unquoteYaml(text);
  if (text === "~" || text === "null") return null;
  if (BOOLEAN_LITERALS.has(text.toLowerCase())) {
    const lower = text.toLowerCase();
    return lower === "true" || lower === "yes" || lower === "on";
  }
  if (NUMBER_PATTERN.test(text)) return Number.parseFloat(text);
  return text;
}

function splitFlowItems(text: string): string[] {
  const items: string[] = [];
  let quote = "";
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote.length > 0) {
      if (quote === '"' && char === "\\") {
        index += 1;
      } else if (quote === "'" && char === "'" && text[index + 1] === "'") {
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      items.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote.length > 0) {
    throw new Error(`Invalid YAML: unterminated string ${JSON.stringify(text)}`);
  }
  items.push(text.slice(start).trim());
  return items.filter((item) => item.length > 0);
}

function findUnquotedColon(text: string): number {
  let quote = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote.length > 0) {
      if (quote === '"' && char === "\\") {
        index += 1;
      } else if (quote === "'" && char === "'" && text[index + 1] === "'") {
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth -= 1;
    } else if (char === ":" && depth === 0) {
      return index;
    }
  }
  return -1;
}

function parseMappingEntry(text: string): [
  string,
  string,
] {
  const colon = findUnquotedColon(text);
  if (colon <= 0) {
    throw new Error(`Invalid YAML: expected "key: value" near ${JSON.stringify(text)}`);
  }
  const key = unquoteYaml(text.slice(0, colon).trim());
  if (key.length === 0) {
    throw new Error(
      `Invalid YAML: expected non-empty key near ${JSON.stringify(text)}`,
    );
  }
  return [
    key,
    text.slice(colon + 1).trim(),
  ];
}

function parseFlowSequence(text: string): YamlValue[] {
  if (!text.endsWith("]")) {
    throw new Error(`Invalid YAML: unterminated sequence ${text}`);
  }
  const inner = text.slice(1, -1).trim();
  if (inner.length === 0) return [];
  return splitFlowItems(inner).map(parseYamlValue);
}

function parseFlowMapping(text: string): YamlMapping {
  if (!text.endsWith("}")) {
    throw new Error(`Invalid YAML: unterminated mapping ${text}`);
  }
  const inner = text.slice(1, -1).trim();
  const mapping: YamlMapping = {};
  if (inner.length === 0) return mapping;
  for (const pair of splitFlowItems(inner)) {
    const [key, valueText] = parseMappingEntry(pair);
    if (Object.hasOwn(mapping, key)) {
      throw new Error(`Invalid YAML: duplicate key ${JSON.stringify(key)}`);
    }
    mapping[key] = parseYamlValue(valueText);
  }
  return mapping;
}

function parseYamlValue(text: string): YamlValue {
  if (text.startsWith("[")) return parseFlowSequence(text);
  if (text.startsWith("{")) return parseFlowMapping(text);
  return parseYamlScalar(text);
}

function isSequenceItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

function parseYamlBlock(
  lines: YamlLine[],
  start: number,
): [
  YamlValue,
  number,
] {
  const { indent, text } = lines[start];
  if (isSequenceItem(text)) return parseYamlSequence(lines, start, indent);
  if (findUnquotedColon(text) >= 0) return parseYamlMapping(lines, start, indent);
  throw new Error(`Invalid YAML: expected "key: value" near ${JSON.stringify(text)}`);
}

function parseEntryValue(
  lines: YamlLine[],
  start: number,
  valueText: string,
  ownerIndent: number,
): [
  YamlValue,
  number,
] {
  if (valueText.length > 0)
    return [
      parseYamlValue(valueText),
      start,
    ];
  if (start < lines.length && lines[start].indent > ownerIndent) {
    return parseYamlBlock(lines, start);
  }
  return [
    null,
    start,
  ];
}

function parseYamlSequence(
  lines: YamlLine[],
  start: number,
  blockIndent: number,
): [
  YamlValue[],
  number,
] {
  const sequence: YamlValue[] = [];
  let index = start;
  while (index < lines.length && lines[index].indent >= blockIndent) {
    const { indent, text } = lines[index];
    if (indent === blockIndent && isSequenceItem(text)) {
      const content = text === "-" ? "" : text.slice(2).trim();
      index += 1;
      if (content.length === 0) {
        const [nested, next] =
          index < lines.length && lines[index].indent > blockIndent
            ? parseYamlBlock(lines, index)
            : [
                null,
                index,
              ];
        sequence.push(nested);
        index = next;
        continue;
      }
      if (findUnquotedColon(content) >= 0) {
        const [key, valueText] = parseMappingEntry(content);
        const item: YamlMapping = {};
        const [value, next] = parseEntryValue(lines, index, valueText, blockIndent);
        item[key] = value;
        index = next;
        if (index < lines.length && lines[index].indent > blockIndent) {
          const [rest, afterRest] = parseYamlMapping(lines, index, lines[index].indent);
          for (const [restKey, restValue] of Object.entries(rest)) {
            if (Object.hasOwn(item, restKey)) {
              throw new Error(`Invalid YAML: duplicate key ${JSON.stringify(restKey)}`);
            }
            item[restKey] = restValue;
          }
          index = afterRest;
        }
        sequence.push(item);
      } else {
        sequence.push(parseYamlValue(content));
      }
    } else if (indent > blockIndent) {
      throw new Error(
        `Invalid YAML: unexpected indentation near ${JSON.stringify(text)}`,
      );
    } else {
      break;
    }
  }
  return [
    sequence,
    index,
  ];
}

function parseYamlMapping(
  lines: YamlLine[],
  start: number,
  blockIndent: number,
): [
  YamlMapping,
  number,
] {
  const mapping: YamlMapping = {};
  let index = start;
  while (index < lines.length && lines[index].indent >= blockIndent) {
    const { indent, text } = lines[index];
    if (indent === blockIndent) {
      const [key, valueText] = parseMappingEntry(text);
      if (Object.hasOwn(mapping, key)) {
        throw new Error(`Invalid YAML: duplicate key ${JSON.stringify(key)}`);
      }
      index += 1;
      const [value, next] = parseEntryValue(lines, index, valueText, blockIndent);
      mapping[key] = value;
      index = next;
    } else if (indent > blockIndent) {
      throw new Error(
        `Invalid YAML: unexpected indentation near ${JSON.stringify(text)}`,
      );
    } else {
      break;
    }
  }
  return [
    mapping,
    index,
  ];
}

export function parseYaml(source: string): YamlValue {
  const lines = toYamlLines(source);
  if (lines.length === 0) return null;
  const [value, next] = parseYamlBlock(lines, 0);
  if (next < lines.length) {
    throw new Error(
      `Invalid YAML: unexpected content near ${JSON.stringify(lines[next].text)}`,
    );
  }
  return value;
}

export function yamlMapping(value: YamlValue | undefined): YamlMapping | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

export function yamlString(value: YamlValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function yamlNumber(value: YamlValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function yamlStringList(value: YamlValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === "string");
  return list.length > 0 ? list : undefined;
}

export function yamlOneOf<T extends string>(
  values: readonly T[],
  value: YamlValue | undefined,
): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
