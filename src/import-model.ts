import { posix } from "node:path";
import { MAX_STRUCTURE_BYTES, MAX_STRUCTURE_FILES } from "./analysis-limits.js";
import { abortError, SignalGrepError } from "./errors.js";
import {
  SourceDocumentError,
  type ByteRange,
  type SourceDocument,
  type SourceReference,
} from "./source-document.js";
import { syntaxField } from "./syntax-tree.js";
import type { SyntaxAnalysis } from "./syntax-types.js";

export interface NavigationHost {
  cwd: string;
  signal?: AbortSignal;
  normalizePath?(this: void, path: string): string;
  load(this: void, path: string, expected?: SourceReference): Promise<SourceDocument>;
  syntax(document: SourceDocument): Promise<SyntaxAnalysis>;
  releaseSyntax?(document: SourceDocument): void;
  listFiles(): Promise<string[] | { paths: string[]; partial: boolean; reasons: string[] }>;
  maxFilesToParse?: number;
}

export interface NavigationInput {
  path: string;
  line?: number;
  symbol?: string;
}
export interface NavigationItem {
  path: string;
  line: number;
  label: string;
  excerpt?: string;
  source: SourceReference;
  range: ByteRange;
  details: Record<string, unknown>;
}
export interface NavigationResult {
  items: NavigationItem[];
  partial: boolean;
  reasons: string[];
  filesRead: number;
  bytesRead: number;
  counts?: Record<string, number>;
  stats?: {
    filesParsed: number;
    filesSkipped: number;
    parseMs: number;
    budgetExhausted: boolean;
  };
}

export interface ImportBinding {
  statement: number;
  node: number;
  source: string | undefined;
  local?: string;
  imported: string;
  kind: "named" | "default" | "namespace" | "side-effect";
  typeOnly: boolean;
}
export interface ExportBinding {
  statement: number;
  node: number;
  exported: string;
  local?: string;
  source?: string;
  definition?: number;
  kind: "named" | "default" | "namespace" | "star";
}
export interface ModuleFacts {
  document: SourceDocument;
  syntax: SyntaxAnalysis;
  imports: ImportBinding[];
  exports: ExportBinding[];
  declarations: Map<string, number[]>;
  locations: Map<number, { start: number; end: number; kind: string }>;
}

export class NavigationFailure extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export function navigationPath(path: string): string {
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized)
  ) {
    throw new SignalGrepError("Navigation paths must stay inside the workspace");
  }
  return normalized.replace(/^\.\//, "");
}

export function nodeText(
  facts: Pick<ModuleFacts, "document" | "syntax" | "locations">,
  node: number | undefined,
): string | undefined {
  const value =
    node === undefined ? undefined : (facts.syntax.nodes[node] ?? facts.locations.get(node));
  return value ? facts.document.text.slice(value.start, value.end) : undefined;
}

/** Decode literal syntax without evaluating any source code. */
export function literalText(raw: string | undefined): string | undefined {
  if (!raw || raw.length < 2) return undefined;
  const quote = raw[0];
  if (
    (quote !== "'" && quote !== '"' && quote !== "`") ||
    raw.at(-1) !== quote ||
    (quote === "`" && raw.includes("${"))
  )
    return undefined;
  const body = raw.slice(1, -1);
  let result = "";
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = body[++index];
    if (escaped === undefined) return undefined;
    if (escaped === "\n") continue;
    if (escaped === "\r") {
      if (body[index + 1] === "\n") index++;
      continue;
    }
    const simple: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      v: "\v",
      "0": "\0",
    };
    if (escaped in simple) {
      if (escaped === "0" && /[0-9]/.test(body[index + 1] ?? "")) return undefined;
      result += simple[escaped];
      continue;
    }
    if (escaped === "x" || escaped === "u") {
      const brace = escaped === "u" && body[index + 1] === "{";
      const end = brace ? body.indexOf("}", index + 2) : index + (escaped === "x" ? 2 : 4) + 1;
      if (end < 0) return undefined;
      const digits = body.slice(index + (brace ? 2 : 1), end);
      if (!/^[\da-fA-F]+$/.test(digits) || (!brace && digits.length !== (escaped === "x" ? 2 : 4)))
        return undefined;
      const point = Number.parseInt(digits, 16);
      if (point > 0x10ffff) return undefined;
      result += String.fromCodePoint(point);
      index = brace ? end : end - 1;
      continue;
    }
    if (/[1-9]/.test(escaped)) return undefined;
    result += escaped;
  }
  return result;
}

export function moduleRange(facts: ModuleFacts, node: number): ByteRange {
  const value = facts.syntax.nodes[node] ?? facts.locations.get(node);
  if (!value) throw new Error("Missing syntax node");
  return {
    start: facts.document.toByteOffset(value.start),
    end: facts.document.toByteOffset(value.end),
  };
}

export function nodeLine(facts: ModuleFacts, node: number): number {
  return facts.document.lineAt(moduleRange(facts, node).start);
}

function descendants(syntax: SyntaxAnalysis, node: number, kind: string): number[] {
  const result: number[] = [];
  const pending = [...(syntax.children[node] ?? [])];
  while (pending.length) {
    const current = pending.pop();
    if (current === undefined) break;
    if (syntax.nodes[current]?.kind === kind) result.push(current);
    else pending.push(...(syntax.children[current] ?? []));
  }
  return result.toSorted((a, b) => a - b);
}

function topLevel(syntax: SyntaxAnalysis, node: number): boolean {
  let parent = syntax.nodes[node]?.parent;
  while (parent !== null && parent !== undefined) {
    const kind = syntax.nodes[parent]?.kind;
    if (kind === "program") return true;
    if (
      kind !== "export_statement" &&
      kind !== "lexical_declaration" &&
      kind !== "variable_declaration" &&
      kind !== "ambient_declaration"
    )
      return false;
    parent = syntax.nodes[parent]?.parent;
  }
  return false;
}

function declaredNames(facts: ModuleFacts, root: number): string[] {
  const names: string[] = [];
  const pending = [root];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined) break;
    const node = facts.syntax.nodes[id];
    if (!node || node.field === "type" || node.field === "right" || node.field === "key") continue;
    if (node.kind === "identifier" || node.kind === "shorthand_property_identifier_pattern") {
      const name = nodeText(facts, id);
      if (name) names.push(name);
    } else pending.push(...(facts.syntax.children[id] ?? []));
  }
  return names;
}

export function collectModuleFacts(document: SourceDocument, syntax: SyntaxAnalysis): ModuleFacts {
  const facts: ModuleFacts = {
    document,
    syntax,
    imports: [],
    exports: [],
    declarations: new Map(),
    locations: new Map(),
  };
  for (const symbol of syntax.symbols) {
    if (!topLevel(syntax, symbol.node)) continue;
    // Expressions are owned by their variable binding; they do not declare a second export.
    if (
      [
        "arrow_function",
        "function_expression",
        "generator_function",
        "class",
        "variable_declarator",
      ].includes(symbol.kind)
    )
      continue;
    const existing = facts.declarations.get(symbol.name) ?? [];
    if (!existing.includes(symbol.node)) existing.push(symbol.node);
    facts.declarations.set(symbol.name, existing);
  }
  for (let id = 0; id < syntax.nodes.length; id++) {
    if (syntax.nodes[id]?.kind !== "variable_declarator" || !topLevel(syntax, id)) continue;
    const binding = syntaxField(syntax, id, "name");
    if (binding === undefined) continue;
    for (const name of declaredNames(facts, binding)) {
      const existing = facts.declarations.get(name) ?? [];
      if (!existing.includes(id)) existing.push(id);
      facts.declarations.set(name, existing);
    }
  }
  for (const [name, declarations] of facts.declarations) {
    const implementations = declarations.filter((id) =>
      ["function_declaration", "generator_function_declaration"].includes(
        syntax.nodes[id]?.kind ?? "",
      ),
    );
    if (
      implementations.length === 1 &&
      declarations.every(
        (id) => id === implementations[0] || syntax.nodes[id]?.kind === "function_signature",
      )
    )
      facts.declarations.set(name, implementations);
  }
  for (const statement of syntax.children[0] ?? []) {
    const node = syntax.nodes[statement];
    if (!node) continue;
    const source = literalText(nodeText(facts, syntaxField(syntax, statement, "source")));
    const children = syntax.children[statement] ?? [];
    if (node.kind === "import_statement") {
      const clause = children.find((child) => syntax.nodes[child]?.kind === "import_clause");
      const typeOnly = children.some((child) => syntax.nodes[child]?.kind === "type");
      if (clause === undefined) {
        facts.imports.push({
          statement,
          node: statement,
          source,
          imported: "*",
          kind: "side-effect",
          typeOnly,
        });
        continue;
      }
      for (const child of syntax.children[clause] ?? []) {
        const kind = syntax.nodes[child]?.kind;
        if (kind === "identifier")
          facts.imports.push({
            statement,
            node: child,
            source,
            local: nodeText(facts, child) ?? "",
            imported: "default",
            kind: "default",
            typeOnly,
          });
        if (kind === "namespace_import") {
          const local = (syntax.children[child] ?? []).find(
            (part) => syntax.nodes[part]?.kind === "identifier",
          );
          facts.imports.push({
            statement,
            node: child,
            source,
            local: nodeText(facts, local) ?? "",
            imported: "*",
            kind: "namespace",
            typeOnly,
          });
        }
      }
      for (const specifier of descendants(syntax, clause, "import_specifier")) {
        const name = nodeText(facts, syntaxField(syntax, specifier, "name"));
        const imported = literalText(name) ?? name;
        if (imported === undefined) continue;
        const local = nodeText(facts, syntaxField(syntax, specifier, "alias")) ?? imported;
        facts.imports.push({
          statement,
          node: specifier,
          source,
          imported,
          local,
          kind: "named",
          typeOnly:
            typeOnly ||
            (syntax.children[specifier] ?? []).some((part) => syntax.nodes[part]?.kind === "type"),
        });
      }
    }
    if (node.kind !== "export_statement") continue;
    const isDefault = children.some((child) => syntax.nodes[child]?.kind === "default");
    const declaration = syntaxField(syntax, statement, "declaration");
    const value = syntaxField(syntax, statement, "value");
    if (isDefault && (declaration !== undefined || value !== undefined)) {
      const definition = declaration ?? value;
      if (definition !== undefined)
        facts.exports.push({
          statement,
          node: statement,
          exported: "default",
          definition,
          kind: "default",
        });
    } else if (declaration !== undefined) {
      for (const [name, declarations] of facts.declarations) {
        for (const definition of declarations) {
          const current = syntax.nodes[definition];
          const container = syntax.nodes[declaration];
          if (
            current &&
            container &&
            current.start >= container.start &&
            current.end <= container.end
          )
            facts.exports.push({
              statement,
              node: definition,
              exported: name,
              local: name,
              definition,
              kind: "named",
            });
        }
      }
    }
    for (const specifier of descendants(syntax, statement, "export_specifier")) {
      const raw = nodeText(facts, syntaxField(syntax, specifier, "name"));
      const local = literalText(raw) ?? raw;
      if (local === undefined) continue;
      const alias = nodeText(facts, syntaxField(syntax, specifier, "alias"));
      const exported = literalText(alias) ?? alias ?? local;
      facts.exports.push({
        statement,
        node: specifier,
        exported,
        local,
        ...(source !== undefined ? { source } : {}),
        kind: "named",
      });
    }
    const namespace = children.find((child) => syntax.nodes[child]?.kind === "namespace_export");
    if (namespace !== undefined) {
      const name = (syntax.children[namespace] ?? []).find(
        (child) => syntax.nodes[child]?.kind === "identifier",
      );
      facts.exports.push({
        statement,
        node: namespace,
        exported: nodeText(facts, name) ?? "*",
        ...(source !== undefined ? { source } : {}),
        kind: "namespace",
      });
    } else if (children.some((child) => syntax.nodes[child]?.kind === "*")) {
      facts.exports.push({
        statement,
        node: statement,
        exported: "*",
        ...(source !== undefined ? { source } : {}),
        kind: "star",
      });
    }
  }
  const retained = new Set([
    0,
    ...syntax.symbols.map((symbol) => symbol.node),
    ...[...facts.declarations.values()].flat(),
    ...facts.imports.flatMap((binding) => [binding.node, binding.statement]),
    ...facts.exports.flatMap((binding) => [
      binding.node,
      binding.statement,
      ...(binding.definition === undefined ? [] : [binding.definition]),
    ]),
  ]);
  for (const id of retained) {
    const node = syntax.nodes[id];
    if (node) facts.locations.set(id, { start: node.start, end: node.end, kind: node.kind });
  }
  return facts;
}

export function navigationError(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    error.reason === "structural-read-budget-exhausted"
  )
    return error.reason;
  if (error instanceof NavigationFailure) return error.reason;
  if (error instanceof SourceDocumentError) return error.reason;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" ||
      error.code === "ENOTDIR" ||
      error.code === "EISDIR" ||
      error.code === "EACCES")
  )
    return "source-unavailable";
  return undefined;
}

/** Current-request facts only; serialized results never contain these trees. */
export class NavigationContext {
  readonly host: NavigationHost;
  readonly modules = new Map<string, ModuleFacts>();
  readonly documents = new Map<string, SourceDocument>();
  readonly reasons = new Set<string>();
  bytesRead = 0;
  #files?: Set<string>;
  #fileLimit: number;
  #failures = new Map<string, string>();
  #attempted = new Set<string>();
  constructor(host: NavigationHost, fileLimit = host.maxFilesToParse ?? MAX_STRUCTURE_FILES) {
    this.host = host;
    this.#fileLimit = fileLimit;
  }
  checkAbort(): void {
    if (this.host.signal?.aborted) throw abortError();
  }
  normalizePath(path: string): string {
    return this.host.normalizePath?.(path) ?? navigationPath(path);
  }
  async files(): Promise<Set<string>> {
    this.checkAbort();
    if (this.#files) return this.#files;
    const listed = await this.host.listFiles();
    if (!Array.isArray(listed) && listed.partial)
      for (const reason of listed.reasons) this.reasons.add(reason);
    this.#files = new Set(
      (Array.isArray(listed) ? listed : listed.paths).map((path) => this.normalizePath(path)),
    );
    return this.#files;
  }
  async module(path: string, retainSyntax = false): Promise<ModuleFacts> {
    this.checkAbort();
    path = this.normalizePath(path);
    const cached = this.modules.get(path);
    if (cached) {
      if (retainSyntax && cached.syntax.nodes.length === 0) {
        let retained = false;
        try {
          cached.syntax = await this.host.syntax(cached.document);
          if (cached.syntax.status !== "ok")
            throw new NavigationFailure(`syntax-${cached.syntax.status}`);
          retained = true;
        } finally {
          if (!retained) this.release(cached);
        }
      }
      return cached;
    }
    const failed = this.#failures.get(path);
    if (failed) throw new NavigationFailure(failed);
    if (!this.#attempted.has(path) && this.#attempted.size >= this.#fileLimit)
      throw new NavigationFailure("file-budget-exhausted");
    this.#attempted.add(path);
    const document = await this.host.load(path);
    this.documents.set(path, document);
    let facts: ModuleFacts | undefined;
    let retained = false;
    try {
      if (document.reference.origin.kind !== "worktree")
        throw new NavigationFailure("historical-navigation-unsupported");
      if (!document.utf8) throw new NavigationFailure("encoding");
      if (this.bytesRead + document.bytes.length > MAX_STRUCTURE_BYTES)
        throw new NavigationFailure("byte-budget-exhausted");
      this.bytesRead += document.bytes.length;
      const syntax = await this.host.syntax(document);
      if (syntax.language === "go" || syntax.status !== "ok") {
        const reason =
          syntax.language === "go" ? "language-unsupported" : `syntax-${syntax.status}`;
        this.#failures.set(path, reason);
        throw new NavigationFailure(reason);
      }
      facts = collectModuleFacts(document, syntax);
      this.modules.set(path, facts);
      retained = retainSyntax;
      return facts;
    } finally {
      if (!retained) {
        if (facts) this.release(facts);
        else this.host.releaseSyntax?.(document);
      }
    }
  }
  release(facts: ModuleFacts): void {
    this.host.releaseSyntax?.(facts.document);
    const { language, status, limited } = facts.syntax;
    facts.syntax = {
      ...(language ? { language } : {}),
      status,
      limited,
      nodes: [],
      children: [],
      symbols: [],
      roles: [],
      diagnostics: [],
    };
  }
  async verify(): Promise<Map<string, string>> {
    const invalid = new Map<string, string>();
    let exhausted = false;
    for (const [path, document] of this.documents) {
      this.checkAbort();
      if (exhausted) {
        invalid.set(path, "structural-read-budget-exhausted");
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- version rechecks consume one shared read budget.
        await this.host.load(path, document.reference);
      } catch (error) {
        const reason = navigationError(error);
        if (!reason) throw error;
        invalid.set(path, reason);
        this.reasons.add(`${path}: ${reason}`);
        exhausted = reason === "structural-read-budget-exhausted";
      }
    }
    return invalid;
  }
  result(items: NavigationItem[]): NavigationResult {
    return {
      items,
      partial: this.reasons.size > 0,
      reasons: [...this.reasons],
      filesRead: this.#attempted.size,
      bytesRead: this.bytesRead,
    };
  }
}
