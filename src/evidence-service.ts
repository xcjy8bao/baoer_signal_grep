import { resolve } from "node:path";
import { AnalysisStore } from "./analysis-store.js";
import type { AnalysisItem, AnalysisResultSet } from "./analysis-types.js";
import { abortError, CursorError, SignalGrepError } from "./errors.js";
import { resolveInspectionTarget } from "./inspect.js";
import { collectEvidenceCandidates } from "./evidence-candidates.js";
import { listWorkspaceFiles } from "./workspace-files.js";
import { navigateImports } from "./import-navigation.js";
import { findRelatedTests } from "./test-navigation.js";
import { normalizeRequest } from "./request.js";
import type { RipgrepRunner } from "./rg.js";
import type { SignalGrepInput } from "./service.js";
import type { SnapshotStore } from "./snapshot-store.js";
import { SourceAccess, SourceBudgetError, SyntaxQueue } from "./source-access.js";
import { SourceContinuations } from "./source-continuations.js";
import { type ByteRange, type SourceDocument, type SourceReference } from "./source-document.js";
import {
  continueSource,
  inspectDocuments,
  legacySourceTarget,
  type SourceInspectionTarget,
} from "./source-inspection.js";
import { sameSourceRevision } from "./source.js";
import type { CodeStructureProvider } from "./structure.js";
import { filterRoleOccurrences, findFunctionConjunctions } from "./syntax-search.js";
import { MAX_INSPECT_TARGETS, type SignalGrepResult } from "./types.js";

export function isEvidenceRequest(input: SignalGrepInput): boolean {
  return (
    input.mode === "inspect" ||
    input.mode === "outline" ||
    input.mode === "imports" ||
    input.mode === "tests" ||
    input.sourceCursor !== undefined ||
    input.allOf !== undefined ||
    input.within !== undefined ||
    input.roles !== undefined ||
    input.changes !== undefined ||
    input.symbol !== undefined ||
    (input.cursor?.includes(".analysis.") ?? false)
  );
}

function rejectFields(
  input: SignalGrepInput,
  fields: (keyof SignalGrepInput)[],
  operation: string,
): void {
  const present = fields.filter((field) => input[field] !== undefined);
  if (present.length)
    throw new SignalGrepError(
      `${operation} does not accept ${present.join(", ")}; copy the complete returned request`,
    );
}
const searchFields = [
  "pattern",
  "allOf",
  "within",
  "roles",
  "changes",
  "glob",
  "exclude",
  "literal",
  "ignoreCase",
  "hidden",
  "context",
  "limit",
] satisfies (keyof SignalGrepInput)[];
const inspectFields = [
  "paths",
  "matchIndices",
  "targets",
  "sourceCursor",
] satisfies (keyof SignalGrepInput)[];

function validateTerms(input: SignalGrepInput): string[] | undefined {
  const terms = input.allOf;
  if (terms === undefined) {
    if (input.within !== undefined) throw new SignalGrepError("within requires allOf");
    return undefined;
  }
  if (
    !Array.isArray(terms) ||
    terms.length < 2 ||
    terms.length > 3 ||
    terms.some((term) => typeof term !== "string" || !term.trim() || /[\r\n\0]/.test(term)) ||
    new Set(terms).size !== terms.length
  )
    throw new SignalGrepError("allOf requires 2–3 distinct, nonempty, single-line literal terms");
  if (
    input.pattern !== undefined ||
    input.roles !== undefined ||
    input.literal !== undefined ||
    input.ignoreCase !== undefined
  )
    throw new SignalGrepError(
      "allOf is an explicit case-sensitive literal conjunction; omit pattern, roles, literal and ignoreCase",
    );
  if (input.within !== undefined && input.within !== "file" && input.within !== "function")
    throw new SignalGrepError("within must be file or function");
  return terms;
}
function regexLiteral(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literalOccurrences(
  document: SourceDocument,
  term: string,
  allowed?: ByteRange[],
): ByteRange[] {
  const needle = Buffer.from(term);
  const found: ByteRange[] = [];
  for (
    let start = document.bytes.indexOf(needle);
    start >= 0;
    start = document.bytes.indexOf(needle, start + Math.max(1, needle.length))
  ) {
    const range = { start, end: start + needle.length };
    if (!allowed || allowed.some((part) => part.start <= range.start && range.end <= part.end))
      found.push(range);
  }
  return found;
}
function fileConjunction(
  document: SourceDocument,
  terms: string[],
  allowed?: ByteRange[],
): AnalysisItem | undefined {
  const evidence = terms.map((term) => ({
    term,
    ranges: literalOccurrences(document, term, allowed),
  }));
  if (evidence.some((item) => !item.ranges.length)) return undefined;
  const first = evidence[0]?.ranges[0];
  if (!first) throw new Error("Conjunction evidence unavailable");
  return {
    path: document.path,
    line: document.lineAt(first.start),
    label: "All terms occur in this file; no cross-file or execution-path claim",
    source: document.reference,
    range: first,
    details: {
      terms: evidence.map((item) => ({
        term: item.term,
        occurrences: item.ranges.length,
        evidence: item.ranges.slice(0, 3).map((range) => ({
          start: range.start,
          end: range.end,
          line: document.lineAt(range.start),
          text: document.slice(document.lineRange(document.lineAt(range.start))).slice(0, 500),
        })),
      })),
      scope: allowed ? "changed-lines" : "file",
      unit: "files",
    },
  };
}

export class EvidenceService {
  readonly #runner: RipgrepRunner;
  readonly #snapshots: SnapshotStore;
  readonly #structure: CodeStructureProvider | undefined;
  readonly #queue = new SyntaxQueue();
  readonly #analyses = new AnalysisStore();
  readonly #continuations = new SourceContinuations();
  constructor(runner: RipgrepRunner, snapshots: SnapshotStore, structure?: CodeStructureProvider) {
    this.#runner = runner;
    this.#snapshots = snapshots;
    this.#structure = structure;
  }
  clear(): void {
    this.#analyses.clear();
    this.#continuations.clear();
    this.#queue.clear();
  }
  async shutdown(): Promise<void> {
    this.clear();
    await this.#queue.shutdown();
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SignalGrepResult> {
    if (signal?.aborted) throw abortError();
    const access = new SourceAccess(cwd, this.#queue, signal);
    if (input.sourceCursor !== undefined) {
      if (typeof input.sourceCursor !== "string" || !input.sourceCursor.trim())
        throw new CursorError("A nonempty sourceCursor is required");
      if (input.mode !== "inspect") throw new SignalGrepError("sourceCursor requires mode=inspect");
      rejectFields(
        input,
        [
          ...searchFields,
          "cursor",
          "path",
          "paths",
          "line",
          "matchIndex",
          "matchIndices",
          "targets",
          "symbol",
        ],
        "Source continuation",
      );
      return continueSource(input.sourceCursor, access, this.#continuations);
    }
    if (input.mode === "inspect") {
      rejectFields(input, [...searchFields, "paths", "symbol"], "mode=inspect");
      const targets = this.#inspectionTargets(input, cwd);
      return inspectDocuments(targets, access, this.#continuations, this.#structure);
    }
    if (input.cursor?.includes(".analysis.") && !input.mode?.match(/^(outline|imports|tests)$/)) {
      rejectFields(
        input,
        [...searchFields, ...inspectFields, "path", "line", "matchIndex", "symbol"],
        "Analysis continuation",
      );
      if (input.mode !== undefined && input.mode !== "matches" && input.mode !== "auto")
        throw new CursorError("Analysis cursor continues with cursor alone");
      return this.#analyses.page(input.cursor);
    }
    if (input.mode === "outline" || input.mode === "imports" || input.mode === "tests")
      return this.#navigate(input, access);
    rejectFields(
      input,
      [...inspectFields, "line", "matchIndex", "symbol", "cursor"],
      "Evidence search",
    );
    const terms = validateTerms(input);
    if (
      input.roles !== undefined &&
      (!input.roles.length ||
        input.roles.some(
          (role) =>
            ![
              "declaration",
              "call",
              "import",
              "export",
              "comment",
              "string",
              "jsx-text",
              "code",
              "unknown",
            ].includes(role),
        ))
    )
      throw new SignalGrepError("roles must contain supported syntactic roles");
    const request = normalizeRequest(
      terms
        ? {
            ...input,
            pattern: terms.map(regexLiteral).join("|"),
            literal: false,
            ignoreCase: false,
          }
        : input,
    );
    const candidates = await collectEvidenceCandidates({
      request,
      ...(input.changes ? { changes: input.changes } : {}),
      cwd,
      ...(signal ? { signal } : {}),
      access,
      runRipgrep: this.#runner,
    });
    const kind = terms
      ? input.within === "function"
        ? "function-and"
        : "file-and"
      : input.roles
        ? "roles"
        : "changes";
    const result: AnalysisResultSet = {
      kind,
      unit: kind === "function-and" ? "functions" : kind === "file-and" ? "files" : "occurrences",
      items: [],
      partial: candidates.partial,
      reasons: [...candidates.reasons],
      filesRead: candidates.filesRead,
      bytesRead: candidates.bytesRead,
      ...(candidates.changes ? { changes: candidates.changes } : {}),
    };
    const processFile = async (index: number): Promise<void> => {
      const file = candidates.files[index];
      if (!file) return;
      try {
        if (!file.document.utf8) {
          result.partial = true;
          result.reasons.push(
            `${file.document.path}: non-UTF-8 evidence cannot be reliably classified`,
          );
        } else if (terms && input.within !== "function") {
          const item = fileConjunction(
            file.document,
            terms,
            input.changes?.scope === "lines" ? file.changedRanges : undefined,
          );
          if (item) result.items.push(item);
        } else if (terms || input.roles) {
          const syntax = await access.syntax(file.document);
          const selected = terms
            ? findFunctionConjunctions(
                file.document,
                syntax,
                terms,
                input.changes?.scope === "lines" ? file.changedRanges : undefined,
              )
            : filterRoleOccurrences(file.document, syntax, file.occurrences, input.roles ?? []);
          result.items.push(...selected.items);
          result.partial ||= selected.partial;
          result.reasons.push(...selected.reasons);
        } else {
          for (const range of file.occurrences) {
            const line = file.document.lineAt(range.start);
            result.items.push({
              path: file.document.path,
              line,
              label: `${file.change ?? "changed"} source occurrence`,
              excerpt: file.document.slice(file.document.lineRange(line)).slice(0, 500),
              source: file.document.reference,
              range,
              details: { change: file.change, byteRange: range },
            });
          }
        }
      } catch (error) {
        if (!(error instanceof SourceBudgetError)) throw error;
        result.partial = true;
        result.reasons.push(error.message);
        return;
      } finally {
        access.releaseSyntax(file.document);
      }
      await processFile(index + 1);
    };
    await processFile(0);
    result.reasons = [...new Set(result.reasons)];
    return this.#analyses.page(this.#analyses.create(result));
  }

  #inspectionTargets(input: SignalGrepInput, cwd: string): SourceInspectionTarget[] {
    if (input.targets !== undefined && input.matchIndices !== undefined)
      throw new SignalGrepError("Use targets or matchIndices, not both");
    if (input.targets !== undefined || input.matchIndices !== undefined) {
      rejectFields(input, ["path", "line", "matchIndex"], "Batch inspection");
      const size = input.targets?.length ?? input.matchIndices?.length ?? 0;
      if (size < 1 || size > MAX_INSPECT_TARGETS)
        throw new SignalGrepError("Batch inspection requires 1-5 targets");
      if (input.targets) {
        if (input.cursor !== undefined)
          throw new SignalGrepError("targets cannot be combined with cursor");
        return input.targets.map((target) =>
          legacySourceTarget(resolveInspectionTarget(target, cwd, this.#snapshots)),
        );
      }
      if (!input.cursor) throw new SignalGrepError("matchIndices requires a cursor");
      const cursor = input.cursor;
      return (input.matchIndices ?? []).map((matchIndex) =>
        this.#singleTarget({ cursor, matchIndex }, cwd),
      );
    }
    return [this.#singleTarget(input, cwd)];
  }
  #singleTarget(input: SignalGrepInput, cwd: string): SourceInspectionTarget {
    if (input.cursor?.includes(".analysis.")) {
      if (input.path !== undefined || input.line !== undefined || input.matchIndex === undefined)
        throw new CursorError("Analysis inspection requires only cursor and matchIndex");
      const item = this.#analyses.item(input.cursor, input.matchIndex);
      if (!item.source || !item.range)
        throw new CursorError("This analysis item has no verified source range");
      const isStructural = item.details?.kind === "symbol" || item.details?.kind === "function";
      return {
        path: item.path,
        line: item.line,
        reference: item.source,
        ...(isStructural ? { range: item.range } : { absoluteFocus: item.range.start }),
      };
    }
    return {
      ...legacySourceTarget(resolveInspectionTarget(input, cwd, this.#snapshots)),
      ...(input.matchIndex !== undefined ? { matchIndex: input.matchIndex } : {}),
    };
  }

  async #navigate(input: SignalGrepInput, access: SourceAccess): Promise<SignalGrepResult> {
    rejectFields(input, [...searchFields, ...inspectFields], `mode=${input.mode}`);
    let path = input.path;
    let reference: SourceReference | undefined;
    let line = input.line;
    let loaded: SourceDocument | undefined;
    if (input.cursor) {
      if (input.path !== undefined || input.line !== undefined || input.matchIndex === undefined)
        throw new SignalGrepError(
          "Snapshot navigation requires cursor+matchIndex instead of path/line",
        );
      const selected = this.#singleTarget(input, access.cwd);
      path = selected.path;
      line = selected.line;
      reference = selected.reference;
      if (selected.unverified)
        throw new SignalGrepError("Snapshot source revision is unverified; refresh the search");
      if (selected.expectedRevision) {
        const doc = await access.load(path);
        if (
          doc.reference.origin.kind !== "worktree" ||
          !sameSourceRevision(selected.expectedRevision, doc.reference.origin.revision)
        )
          throw new SignalGrepError("Source changed; refresh the search");
        reference = doc.reference;
        loaded = doc;
      }
    } else if (input.matchIndex !== undefined)
      throw new SignalGrepError("matchIndex requires a cursor");
    if (!path) throw new SignalGrepError(`${input.mode} requires path or cursor+matchIndex`);
    const document = loaded ?? (await access.load(path, reference));
    if (input.mode === "outline") {
      const syntax = await access.syntax(document);
      const supported = syntax.status === "ok" && syntax.language !== "go";
      const items: AnalysisItem[] = supported
        ? syntax.symbols.map((symbol) => {
            const range = {
              start: document.toByteOffset(symbol.start),
              end: document.toByteOffset(symbol.end),
            };
            const firstLine = document.lineAt(range.start);
            const signatureEnd = symbol.bodyStart ?? symbol.end;
            const signature = document.text.slice(
              symbol.start,
              Math.min(signatureEnd, symbol.start + 600),
            );
            return {
              path: document.path,
              line: firstLine,
              label: `${symbol.kind} ${symbol.name}${symbol.hasBody ? "" : " (no implementation body)"}`,
              excerpt: signature,
              source: document.reference,
              range,
              details: {
                kind: "symbol",
                name: symbol.name,
                scope: symbol.scope,
                hasBody: symbol.hasBody,
                exported: symbol.exported,
                signatureTruncated: signatureEnd - symbol.start > 600,
              },
            };
          })
        : [];
      return this.#analyses.page(
        this.#analyses.create({
          kind: "outline",
          unit: "symbols",
          items,
          partial: !supported,
          reasons: supported
            ? []
            : [
                `Outline requires reliable JS/TS/TSX syntax (${syntax.language ?? "unsupported"}: ${syntax.status})`,
              ],
          filesRead: access.filesRead,
          bytesRead: access.bytesRead,
        }),
      );
    }
    if (document.reference.origin.kind !== "worktree")
      return this.#analyses.page(
        this.#analyses.create({
          kind: input.mode === "imports" ? "imports" : "tests",
          unit: input.mode === "imports" ? "relationships" : "evidence-items",
          items: [],
          partial: true,
          reasons: [
            "Import and related-test navigation currently support worktree sources only; historical sources are not switched to the worktree",
          ],
        }),
      );
    const files = await listWorkspaceFiles(access.cwd, access.signal);
    const allowed = new Set(files.paths.map((file) => resolve(access.cwd, file)));
    const primaryPath = resolve(access.cwd, document.path);
    const host = {
      cwd: access.cwd,
      ...(access.signal ? { signal: access.signal } : {}),
      load: async (file: string, expected?: SourceReference) => {
        const absolutePath = resolve(access.cwd, file);
        if (!allowed.has(absolutePath))
          throw new SignalGrepError("Navigation source is excluded by current ignore rules");
        if (absolutePath === primaryPath && expected === undefined) return document;
        return expected ? access.refresh(file, expected) : access.load(file);
      },
      syntax: (doc: SourceDocument) => access.syntax(doc),
      releaseSyntax: (doc: SourceDocument) => access.releaseSyntax(doc),
      listFiles: async () => files,
    };
    const request = {
      path: document.path,
      ...(line !== undefined ? { line } : {}),
      ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
    };
    const result =
      input.mode === "imports"
        ? await navigateImports(host, request)
        : await findRelatedTests(host, request);
    return this.#analyses.page(
      this.#analyses.create({
        ...result,
        partial: result.partial || files.partial,
        reasons: [...result.reasons, ...files.reasons],
        kind: input.mode === "imports" ? "imports" : "tests",
        unit: input.mode === "imports" ? "relationships" : "evidence-items",
      }),
    );
  }
}
