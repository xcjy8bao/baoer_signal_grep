import type { ByteRange, SourceDocument } from "./source-document.js";

export interface PythonOutlineSymbol {
  name: string;
  kind: "class" | "function" | "method";
  startLine: number;
  endLine: number;
  scope: string[];
  hasBody: boolean;
  range: ByteRange;
  signature: string;
}

interface Declaration {
  name: string;
  kind: "class" | "function";
  indent: number;
  lineIndex: number;
}

interface PythonLine {
  text: string;
  code: string;
  indent: number;
  meaningful: boolean;
  depthBefore: number;
  depthAfter: number;
}

interface LexState {
  tripleQuote?: "'" | '"';
}

function indentation(line: string): number {
  let width = 0;
  for (const character of line) {
    if (character === " ") width += 1;
    else if (character === "\t") width += 4;
    else break;
  }
  return width;
}

function stripStringsAndComments(line: string, state: LexState): string {
  const code = line.split("");
  const blank = (start: number, end: number): void => {
    for (let index = start; index < end; index += 1) code[index] = " ";
  };
  let index = 0;
  while (index < line.length) {
    if (state.tripleQuote) {
      const delimiter = state.tripleQuote.repeat(3);
      const close = line.indexOf(delimiter, index);
      if (close < 0) {
        blank(index, line.length);
        return code.join("");
      }
      blank(index, close + 3);
      index = close + 3;
      delete state.tripleQuote;
      continue;
    }
    const character = line[index];
    if (character === "#") {
      blank(index, line.length);
      break;
    }
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }
    const delimiter = line.slice(index, index + 3);
    if (delimiter === "'''" || delimiter === '"""') {
      state.tripleQuote = character;
      blank(index, Math.min(line.length, index + 3));
      index += 3;
      continue;
    }
    blank(index, index + 1);
    index += 1;
    while (index < line.length) {
      if (line[index] === "\\") {
        blank(index, Math.min(line.length, index + 2));
        index += 2;
        continue;
      }
      if (line[index] === character) {
        blank(index, index + 1);
        index += 1;
        break;
      }
      blank(index, index + 1);
      index += 1;
    }
  }
  return code.join("");
}

function scanLines(document: SourceDocument): PythonLine[] {
  const state: LexState = {};
  let depth = 0;
  return document.text.split("\n").map((text) => {
    const code = stripStringsAndComments(text, state);
    const depthBefore = depth;
    depth = scanTopLevelColon(code, depth).depth;
    return {
      text,
      code,
      indent: indentation(text),
      meaningful: code.trim().length > 0,
      depthBefore,
      depthAfter: depth,
    };
  });
}

function declarations(lines: PythonLine[]): Declaration[] {
  return lines.flatMap((line, lineIndex) => {
    const match =
      /^([ \t]*)(?:(?:async)[ \t]+)?(def|class)[ \t]+([\p{ID_Start}_][\p{ID_Continue}]*)[ \t]*(?=[:(])/u.exec(
        line.code,
      );
    if (!match) return [];
    return [
      {
        name: match[3] ?? "",
        kind: match[2] === "class" ? "class" : "function",
        indent: line.indent,
        lineIndex,
      },
    ];
  });
}

function endLines(lines: PythonLine[]): number[] {
  const nextBoundaries = Array.from({ length: lines.length }, () => lines.length);
  const candidates: Array<{ lineIndex: number; indent: number }> = [];
  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex];
    if (!line?.meaningful || line.depthBefore !== 0) continue;
    while (candidates.at(-1) && (candidates.at(-1)?.indent ?? 0) > line.indent) {
      candidates.pop();
    }
    nextBoundaries[lineIndex] = candidates.at(-1)?.lineIndex ?? lines.length;
    candidates.push({ lineIndex, indent: line.indent });
  }
  return nextBoundaries;
}

function scanTopLevelColon(code: string, initialDepth: number): { depth: number; colon: number } {
  let depth = initialDepth;
  let colon = -1;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (character === "(" || character === "[" || character === "{") depth += 1;
    else if (character === ")" || character === "]" || character === "}")
      depth = Math.max(0, depth - 1);
    else if (character === ":" && depth === 0 && colon < 0) colon = index;
  }
  return { depth, colon };
}

function hasBody(lines: PythonLine[], declaration: Declaration, endLine: number): boolean {
  let headerEnded = false;
  let depth = 0;
  for (let lineIndex = declaration.lineIndex; lineIndex < endLine; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) continue;
    const scanned = scanTopLevelColon(line.code, depth);
    depth = scanned.depth;
    if (scanned.colon < 0) continue;
    headerEnded = true;
    if (line.code.slice(scanned.colon + 1).trim().length > 0) return true;
    break;
  }
  if (!headerEnded) return false;
  for (let lineIndex = declaration.lineIndex + 1; lineIndex < endLine; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line?.meaningful && line.indent > declaration.indent) return true;
  }
  return false;
}

/**
 * Extract bounded Python function/class ranges without claiming compiler-level bindings.
 * Indentation and a small string/comment lexer are the only structural facts used, so
 * callers expose this as outline evidence rather than compiler or runtime relationships.
 */
export function parsePythonOutline(document: SourceDocument): PythonOutlineSymbol[] {
  if (!document.utf8) return [];
  const lines = scanLines(document);
  const found = declarations(lines);
  const boundaries = endLines(lines);
  const active: Declaration[] = [];
  return found.map((declaration) => {
    while (active.at(-1) && (active.at(-1)?.lineIndex ?? 0) >= declaration.lineIndex) {
      active.pop();
    }
    while (active.at(-1) && (active.at(-1)?.indent ?? 0) >= declaration.indent) {
      active.pop();
    }
    const parents = [...active];
    const boundary = boundaries[declaration.lineIndex] ?? lines.length;
    const endLine = boundary === lines.length ? lines.length : boundary;
    const nearestClass = parents.toReversed().find((candidate) => candidate.kind === "class");
    const kind = declaration.kind === "function" && nearestClass ? "method" : declaration.kind;
    const scope = parents.map((item) => item.name);
    const range = document.lineRange(declaration.lineIndex + 1, endLine);
    const lineStart = document.toCharacterOffset(range.start);
    const signature =
      document.text
        .slice(lineStart, Math.min(document.toCharacterOffset(range.end), lineStart + 600))
        .split("\n", 1)[0]
        ?.trimEnd() ?? "";
    const item = {
      name: declaration.name,
      kind,
      startLine: declaration.lineIndex + 1,
      endLine,
      scope,
      hasBody: hasBody(lines, declaration, boundary),
      range,
      signature,
    } satisfies PythonOutlineSymbol;
    active.push(declaration);
    return item;
  });
}
