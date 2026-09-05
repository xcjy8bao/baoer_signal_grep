import { parse, registerDynamicLanguage, type SgNode } from "@ast-grep/napi";
import go from "@ast-grep/lang-go";
import { MAX_STRUCTURE_BYTES, MAX_SYNTAX_NODES } from "./analysis-limits.ts";
import { GO_FIELDS, JAVASCRIPT_FIELDS } from "./syntax-fields.ts";
import type { SyntaxLanguage, SyntaxNode, SyntaxWorkerResult } from "./syntax-types.ts";
import { MAX_SOURCE_FILE_BYTES } from "./types.ts";

interface Frame {
  node: SgNode;
  index: number;
  next: number;
  fields: Map<number, string>;
}

function fieldsFor(node: SgNode, language: SyntaxLanguage): Map<number, string> {
  const fields = new Map<number, string>();
  const names = (language === "go" ? GO_FIELDS : JAVASCRIPT_FIELDS)[node.kind()] ?? [];
  for (const name of names) {
    for (const child of node.fieldChildren(name)) fields.set(child.id(), name);
  }
  return fields;
}

function languageName(value: unknown): SyntaxLanguage {
  if (value === "javascript" || value === "typescript" || value === "tsx" || value === "go") {
    return value;
  }
  throw new Error("Invalid syntax worker language");
}

function parseInput(input: unknown): { language: SyntaxLanguage; text: string; pattern?: string } {
  if (!input || typeof input !== "object" || !("language" in input) || !("text" in input)) {
    throw new Error("Invalid syntax worker input");
  }
  const language = languageName(input.language);
  if (typeof input.text !== "string" || !input.text.isWellFormed()) {
    throw new Error("Syntax worker input must be well-formed Unicode");
  }
  if (Buffer.byteLength(input.text) > MAX_SOURCE_FILE_BYTES) {
    throw new Error("Syntax worker source exceeds the file limit");
  }
  if (
    "pattern" in input &&
    (typeof input.pattern !== "string" || Buffer.byteLength(input.pattern) > 4_096)
  )
    throw new Error("Invalid AST pattern");
  return {
    language,
    text: input.text,
    ...("pattern" in input && typeof input.pattern === "string" ? { pattern: input.pattern } : {}),
  };
}

function extract(language: SyntaxLanguage, text: string, pattern?: string): SyntaxWorkerResult {
  if (language === "go") registerDynamicLanguage({ go });
  const names = { javascript: "JavaScript", typescript: "TypeScript", tsx: "Tsx", go: "go" };
  if (pattern !== undefined) {
    // Go's registered expando character makes metavariables legal identifiers during validation.
    const prepared = language === "go" ? pattern.replaceAll("$", "µ") : pattern;
    const templates =
      language === "go"
        ? [
            prepared,
            `package pattern\n${prepared}`,
            `package pattern\nfunc pattern() {\n${prepared}\n}`,
          ]
        : [prepared];
    const valid = templates.some((candidate) => {
      const template = parse(names[language], candidate).root();
      return template.kind() !== "ERROR" && !template.find({ rule: { kind: "ERROR" } });
    });
    if (!valid) throw new Error("Malformed structural pattern for selected language");
  }
  const root = parse(names[language], text).root();
  const rootRange = root.range();
  const nodes: SyntaxNode[] = [
    {
      kind: String(root.kind()),
      start: rootRange.start.index,
      end: rootRange.end.index,
      parent: null,
      named: root.isNamed(),
    },
  ];
  const stack: Frame[] = [{ node: root, index: 0, next: 0, fields: fieldsFor(root, language) }];
  let malformed = root.kind() === "ERROR";
  while (stack.length > 0) {
    const frame = stack.at(-1);
    if (!frame) break;
    const child = frame.node.child(frame.next++);
    if (!child) {
      stack.pop();
      continue;
    }
    if (nodes.length === MAX_SYNTAX_NODES) return { status: "limit", nodes };
    const range = child.range();
    const kind = String(child.kind());
    const field = frame.fields.get(child.id());
    const node: SyntaxNode = {
      kind,
      start: range.start.index,
      end: range.end.index,
      parent: frame.index,
      named: child.isNamed(),
      ...(field ? { field } : {}),
    };
    if (kind === "ERROR" || node.start === node.end) malformed = true;
    const index = nodes.length;
    nodes.push(node);
    stack.push({ node: child, index, next: 0, fields: fieldsFor(child, language) });
  }
  const patternMatches =
    pattern === undefined || malformed
      ? undefined
      : root
          .findAll(pattern)
          .map((node) => ({ start: node.range().start.index, end: node.range().end.index }));
  return {
    status: malformed ? "parse-error" : "ok",
    nodes,
    ...(patternMatches ? { patternMatches } : {}),
  };
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STRUCTURE_BYTES) throw new Error("Syntax worker input exceeds protocol limit");
    chunks.push(buffer);
  }
  const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const { language, text, pattern } = parseInput(input);
  const output = JSON.stringify(extract(language, text, pattern));
  if (Buffer.byteLength(output) > MAX_STRUCTURE_BYTES) {
    throw new Error("Syntax worker output exceeds protocol limit");
  }
  process.stdout.write(output);
}

await main();
