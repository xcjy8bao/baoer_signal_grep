import { bindImpactCandidates } from "./impact-bindings.js";
import { conceptSearch } from "./concept-search.js";
import { structuralSearch } from "./structural-search.js";
import { isSemanticMode } from "./semantic-protocol.js";
import { navigateSemantics } from "./semantic-navigation.js";
import { dirname, resolve } from "node:path";
import { AnalysisStore } from "./analysis-store.js";
import type { AnalysisItem, AnalysisResultSet, CoverageStatus } from "./analysis-types.js";
import { abortError, CursorError, SignalGrepError } from "./errors.js";
import { findGitRepository } from "./git-repository.js";
import { isPathInsideCwd } from "./path-policy.js";
import { resolveInspectionTarget } from "./inspect.js";
import {
  collectEvidenceCandidates,
  type EvidenceCandidateFile,
  type EvidenceCandidates,
} from "./evidence-candidates.js";
import { listWorkspaceFiles, workspaceRelativePath } from "./workspace-files.js";
import { navigateImports } from "./import-navigation.js";
import { findRelatedTests, isLikelyTestPath, TEST_DISCOVERY_PATTERN } from "./test-navigation.js";
import { selectImpactTarget } from "./impact-target.js";
import {
  classifyImpactOccurrences,
  impactRetentionExhausted,
  impactRetentionPriority,
  mergeImpactItems,
  retainedImpactCounts,
} from "./impact-analysis.js";
import { escapeRegexLiteral, literalOccurrences } from "./literal-search.js";
import {
  expandMultiTermCandidates,
  retainedTermCounts,
  validateAnyOf,
} from "./multi-term-search.js";
import { normalizeRequest } from "./request.js";
import { runOwnedParallel } from "./owned-parallel.js";
import { discoverFiles } from "./file-discovery.js";
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
import { syntaxLanguage } from "./syntax.js";
import {
  MAX_ANY_OF_TERMS,
  MAX_CONFIGURABLE_STRUCTURE_FILES,
  MAX_STRUCTURE_FILES,
} from "./analysis-limits.js";
import {
  MAX_INSPECT_TARGETS,
  type SearchRequest,
  type SearchScopeDetails,
  type SignalGrepResult,
} from "./types.js";

export function isEvidenceRequest(input: SignalGrepInput): boolean {
  return (
    isSemanticMode(input.mode) ||
    input.mode === "concept" ||
    input.mode === "structure" ||
    input.mode === "files" ||
    input.mode === "inspect" ||
    input.mode === "outline" ||
    input.mode === "imports" ||
    input.mode === "tests" ||
    input.mode === "impact" ||
    input.sourceCursor !== undefined ||
    input.anyOf !== undefined ||
    input.allOf !== undefined ||
    input.within !== undefined ||
    input.roles !== undefined ||
    input.changes !== undefined ||
    input.symbol !== undefined ||
    (input.cursor?.includes(".analysis") ?? false)
  );
}

function rejectFields(
  input: SignalGrepInput,
  fields: (keyof SignalGrepInput)[],
  operation: string,
  cursor = false,
): void {
  const present = fields.filter((field) => input[field] !== undefined);
  if (present.length)
    throw cursor
      ? new CursorError(
          `${operation} does not accept ${present.join(", ")}; copy the complete returned request`,
          "E_CURSOR_OPTIONS_CONFLICT",
        )
      : new SignalGrepError(
          `${operation} does not accept ${present.join(", ")}; copy the complete returned request`,
        );
}
const searchFields = [
  "query",
  "scope",
  "wholeWord",
  "pattern",
  "anyOf",
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

function maxFilesToParse(value: number | undefined): number {
  const candidate = value ?? MAX_STRUCTURE_FILES;
  if (
    !Number.isSafeInteger(candidate) ||
    candidate < 1 ||
    candidate > MAX_CONFIGURABLE_STRUCTURE_FILES
  ) {
    throw new SignalGrepError(
      `maxFilesToParse must be an integer from 1 through ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}`,
    );
  }
  return candidate;
}

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
    input.ignoreCase !== undefined ||
    input.wholeWord !== undefined
  )
    throw new SignalGrepError(
      "allOf is an explicit case-sensitive literal conjunction; omit pattern, roles, literal and ignoreCase",
    );
  if (input.within !== undefined && input.within !== "file" && input.within !== "function")
    throw new SignalGrepError("within must be file or function");
  return terms;
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

function searchScope(request: SearchRequest): SearchScopeDetails {
  const path = request.path ?? ".";
  const requestedPath = request.expandedFromPath ?? path;
  return {
    path,
    requestedPath,
    glob: [...request.glob],
    exclude: [...request.exclude],
    hidden: request.hidden,
    expandedToProjectRoot: request.expandedFromPath !== undefined,
    assertion: path === "." ? "project-wide" : "requested-scope",
  };
}

async function navigationRoot(cwd: string, path: string, signal?: AbortSignal): Promise<string> {
  const absolute = resolve(cwd, path);
  if (isPathInsideCwd(absolute, cwd)) return resolve(cwd);
  return (await findGitRepository(dirname(absolute), signal)) ?? dirname(absolute);
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

  async #testEntryPaths(
    root: string,
    files: readonly string[],
    cwd: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const request = normalizeRequest({
      pattern: TEST_DISCOVERY_PATTERN,
      path: root,
      glob: ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.mts", "*.cts"],
      ignoreCase: false,
    });
    const scan = await this.#runner(request, cwd, signal);
    const contentCandidates = new Set(scan.fileCounts.keys());
    return files.filter(
      (path) => isLikelyTestPath(path) || contentCandidates.has(workspaceRelativePath(cwd, path)),
    );
  }

  async #candidates(
    request: SearchRequest,
    input: SignalGrepInput,
    access: SourceAccess,
  ): Promise<{ candidates: EvidenceCandidates; request: SearchRequest }> {
    const collect = (candidateRequest: SearchRequest) =>
      collectEvidenceCandidates({
        request: candidateRequest,
        ...(input.changes ? { changes: input.changes } : {}),
        cwd: access.cwd,
        ...(access.signal ? { signal: access.signal } : {}),
        access,
        runRipgrep: this.#runner,
        maxFiles: access.maxFiles,
      });
    const candidates = await collect(request);
    if (
      input.changes ||
      request.scope === "strict" ||
      request.path === undefined ||
      candidates.files.length > 0 ||
      candidates.partial
    ) {
      return { candidates, request };
    }
    const { path: requestedPath, ...projectRequest } = request;
    const expandedRequest = { ...projectRequest, expandedFromPath: requestedPath };
    return { candidates: await collect(expandedRequest), request: expandedRequest };
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SignalGrepResult> {
    if (signal?.aborted) throw abortError();
    const analysisStarted = performance.now();
    const fileLimit = maxFilesToParse(input.maxFilesToParse);
    const access = new SourceAccess(cwd, this.#queue, signal, { maxFiles: fileLimit });
    if (isSemanticMode(input.mode)) {
      rejectFields(
        input,
        [...searchFields, ...inspectFields, "cursor", "matchIndex"],
        `mode=${input.mode}`,
      );
      return this.#analyses.page(this.#analyses.create(await navigateSemantics(input, access)));
    }
    if (input.column !== undefined)
      throw new SignalGrepError("column requires semantic navigation");
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
          "maxFilesToParse",
        ],
        "Source continuation",
        true,
      );
      return continueSource(input.sourceCursor, access, this.#continuations);
    }
    if (input.mode === "inspect") {
      rejectFields(input, [...searchFields, "paths", "symbol", "maxFilesToParse"], "mode=inspect");
      const targets = this.#inspectionTargets(input, cwd);
      return inspectDocuments(targets, access, this.#continuations, this.#structure);
    }
    if (input.mode === "concept") {
      rejectFields(
        input,
        [
          ...searchFields.filter(
            (field) => !["query", "glob", "exclude", "hidden"].includes(field),
          ),
          ...inspectFields,
          "cursor",
          "line",
          "symbol",
          "matchIndex",
        ],
        "mode=concept",
      );
      return this.#analyses.page(this.#analyses.create(await conceptSearch(input, access)));
    }
    if (input.mode === "structure") {
      rejectFields(
        input,
        [
          ...searchFields.filter(
            (field) => !["pattern", "glob", "exclude", "hidden"].includes(field),
          ),
          ...inspectFields,
          "cursor",
          "line",
          "symbol",
          "matchIndex",
        ],
        "mode=structure",
      );
      return this.#analyses.page(this.#analyses.create(await structuralSearch(input, access)));
    }
    if (input.mode === "files") {
      rejectFields(
        input,
        [
          "pattern",
          "cursor",
          "line",
          "matchIndex",
          "symbol",
          "maxFilesToParse",
          "wholeWord",
          "scope",
          "literal",
          "ignoreCase",
          "context",
          "limit",
          "anyOf",
          "allOf",
          "within",
          "roles",
          "changes",
          ...inspectFields,
        ],
        "mode=files",
      );
      return this.#analyses.page(this.#analyses.create(await discoverFiles(input, cwd, signal)));
    }
    if (input.mode === "impact") return this.#impact(input, access);
    if (input.cursor?.includes(".analysis") && !input.mode?.match(/^(outline|imports|tests)$/)) {
      this.#analyses.resolve(input.cursor);
      rejectFields(
        input,
        [
          ...searchFields,
          ...inspectFields,
          "path",
          "line",
          "matchIndex",
          "symbol",
          "maxFilesToParse",
        ],
        "Analysis continuation",
        true,
      );
      if (input.mode !== undefined && input.mode !== "matches" && input.mode !== "auto")
        throw new CursorError(
          "Analysis cursor cannot continue in the requested mode",
          "E_CURSOR_WRONG_KIND",
        );
      return this.#analyses.page(input.cursor);
    }
    if (input.mode === "outline" || input.mode === "imports" || input.mode === "tests")
      return this.#navigate(input, access);
    rejectFields(
      input,
      [...inspectFields, "query", "line", "matchIndex", "symbol", "cursor"],
      "Evidence search",
    );
    const anyOf = validateAnyOf(input.anyOf);
    if (anyOf) {
      if (
        input.pattern !== undefined ||
        input.allOf !== undefined ||
        input.within !== undefined ||
        input.roles !== undefined ||
        input.literal !== undefined ||
        input.ignoreCase !== undefined ||
        input.wholeWord !== undefined
      )
        throw new SignalGrepError(
          "anyOf is an explicit case-sensitive literal union; omit pattern, allOf, within, roles, literal and ignoreCase",
        );
      if (input.mode !== undefined && input.mode !== "auto" && input.mode !== "matches")
        throw new SignalGrepError("anyOf mode must be omitted, auto, or matches");
      const chunks = Array.from(
        { length: Math.ceil(anyOf.length / MAX_ANY_OF_TERMS) },
        (_, index) => anyOf.slice(index * MAX_ANY_OF_TERMS, (index + 1) * MAX_ANY_OF_TERMS),
      );
      const { path: _inputPath, ...unscopedInput } = input;
      let chunkAccess = access;
      const runChunks = async (expandedFromPath?: string) =>
        runOwnedParallel((groupSignal) => {
          chunkAccess = new SourceAccess(cwd, this.#queue, groupSignal, { maxFiles: fileLimit });
          return chunks.map(async (chunk) => {
            const request = normalizeRequest({
              ...(expandedFromPath === undefined ? input : unscopedInput),
              pattern: chunk.map(escapeRegexLiteral).join("|"),
              literal: false,
              ignoreCase: false,
            });
            const effectiveRequest =
              expandedFromPath === undefined ? request : { ...request, expandedFromPath };
            const candidates = await collectEvidenceCandidates({
              request: effectiveRequest,
              ...(input.changes ? { changes: input.changes } : {}),
              cwd,
              signal: groupSignal,
              access: chunkAccess,
              runRipgrep: this.#runner,
              maxFiles: fileLimit,
            });
            return { chunk, request: effectiveRequest, candidates };
          });
        }, signal);
      let chunkResults = await runChunks();
      if (
        !input.changes &&
        input.path !== undefined &&
        input.scope !== "strict" &&
        chunkResults.every(({ candidates }) => !candidates.partial && candidates.files.length === 0)
      ) {
        chunkResults = await runChunks(input.path.replace(/^@/, ""));
      }
      const reasons = new Set<string>();
      let partial = false;
      let changes: AnalysisResultSet["changes"];
      const candidateFiles = new Map<string, EvidenceCandidateFile>();
      const invalidatedPaths = new Set<string>();
      for (const { candidates } of chunkResults) {
        partial ||= candidates.partial;
        changes ??= candidates.changes;
        for (const reason of candidates.reasons) reasons.add(reason);
        for (const file of candidates.files) {
          if (invalidatedPaths.has(file.document.path)) continue;
          const existing = candidateFiles.get(file.document.path);
          if (
            existing &&
            JSON.stringify(existing.document.reference) !== JSON.stringify(file.document.reference)
          ) {
            candidateFiles.delete(file.document.path);
            invalidatedPaths.add(file.document.path);
            partial = true;
            reasons.add(`Source changed across anyOf chunks: ${file.document.path}`);
          } else candidateFiles.set(file.document.path, file);
        }
      }
      const expanded = expandMultiTermCandidates(
        [...candidateFiles.values()],
        anyOf,
        input.changes?.scope === "lines",
      );
      partial ||= expanded.partial;
      for (const reason of expanded.reasons) reasons.add(reason);
      const scope = searchScope(
        chunkResults[0]?.request ??
          normalizeRequest({
            ...input,
            pattern: chunks[0]?.map(escapeRegexLiteral).join("|") ?? "",
            literal: false,
            ignoreCase: false,
          }),
      );
      const result: AnalysisResultSet = {
        kind: "any-of",
        unit: "occurrences",
        items: expanded.items,
        partial,
        reasons: [...reasons],
        filesRead: chunkAccess.filesRead,
        bytesRead: chunkAccess.bytesRead,
        ...(changes ? { changes } : {}),
        scope,
        chunks: {
          chunked: chunks.length > 1,
          count: chunks.length,
          maxTermsPerChunk: MAX_ANY_OF_TERMS,
          execution: chunks.length > 1 ? ("bounded-parallel" as const) : ("single" as const),
        },
        coverage: { exactOccurrences: partial ? "partial" : "complete" },
        redact: input.redact ?? false,
      };
      return this.#analyses.page(
        this.#analyses.create(result, (retainedItems) => ({
          termCounts: retainedTermCounts(anyOf, retainedItems),
        })),
      );
    }
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
            pattern: terms.map(escapeRegexLiteral).join("|"),
            literal: false,
            ignoreCase: false,
          }
        : input,
    );
    const selected = await this.#candidates(request, input, access);
    const candidates = selected.candidates;
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
      scope: searchScope(selected.request),
      coverage: {
        candidateSearch: candidates.partial ? "partial" : "complete",
        ...(terms || input.roles ? { syntaxClassification: "complete" as const } : {}),
      },
      redact: input.redact ?? false,
    };
    let syntaxCapableFiles = 0;
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
          if (syntaxLanguage(file.document.path)) syntaxCapableFiles += 1;
          const syntax = await access.syntax(file.document);
          const classified = terms
            ? findFunctionConjunctions(
                file.document,
                syntax,
                terms,
                input.changes?.scope === "lines" ? file.changedRanges : undefined,
              )
            : filterRoleOccurrences(file.document, syntax, file.occurrences, input.roles ?? []);
          result.items.push(...classified.items);
          result.partial ||= classified.partial;
          if (classified.partial && result.coverage)
            result.coverage.syntaxClassification = "partial";
          result.reasons.push(...classified.reasons);
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
    if ((input.roles || (terms && input.within === "function")) && syntaxCapableFiles === 0) {
      throw new SignalGrepError(
        `${input.roles ? "roles" : "within=function"} requires a supported source language; use ordinary search or file-level allOf for non-code content`,
      );
    }
    if (terms || input.roles) {
      result.stats = {
        filesEnumerated: candidates.files.length,
        filesParsed: access.syntaxParses,
        filesSkipped: Math.max(0, candidates.files.length - syntaxCapableFiles),
        cacheHits: access.syntaxCacheHits,
        parseMs: Math.round(performance.now() - analysisStarted),
        budgetExhausted: result.reasons.some(
          (reason) => reason.includes("limit") || reason.includes("budget-exhausted"),
        ),
      };
    }
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
      const isStructural =
        item.details?.kind === "symbol" ||
        item.details?.kind === "function" ||
        item.details?.kind === "impact-target";
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

  async #impact(input: SignalGrepInput, access: SourceAccess): Promise<SignalGrepResult> {
    const impactStarted = performance.now();
    rejectFields(input, [...searchFields, ...inspectFields], "mode=impact");
    let path: string;
    let line = input.line;
    let document: SourceDocument;
    if (input.cursor !== undefined) {
      if (input.cursor.includes(".analysis."))
        throw new CursorError(
          "Impact requires an ordinary search snapshot, not an analysis cursor",
        );
      if (
        input.matchIndex === undefined ||
        input.path !== undefined ||
        input.line !== undefined ||
        input.symbol !== undefined
      )
        throw new SignalGrepError(
          "Snapshot impact requires cursor+matchIndex instead of path, line, or symbol",
        );
      const selected = resolveInspectionTarget(input, access.cwd, this.#snapshots);
      if (selected.unverified)
        throw new SignalGrepError("Snapshot source revision is unverified; refresh the search");
      path = selected.path;
      line = selected.line;
      document = await access.load(path);
      if (
        selected.expectedRevision &&
        (document.reference.origin.kind !== "worktree" ||
          !sameSourceRevision(selected.expectedRevision, document.reference.origin.revision))
      )
        throw new SignalGrepError("Source changed; refresh the search");
    } else {
      if (input.matchIndex !== undefined)
        throw new SignalGrepError("matchIndex requires an ordinary search cursor");
      if (!input.path || (input.line === undefined && input.symbol === undefined))
        throw new SignalGrepError("Direct impact requires path and at least one of symbol or line");
      path = input.path;
      document = await access.load(path);
    }
    if (document.reference.origin.kind !== "worktree")
      throw new SignalGrepError("Impact currently supports worktree sources only");
    const root = await navigationRoot(access.cwd, document.path, access.signal);

    const targetSyntax = await access.syntax(document);
    let target;
    try {
      target = selectImpactTarget(document, targetSyntax, {
        ...(line !== undefined ? { line } : {}),
        ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
      });
    } finally {
      access.releaseSyntax(document);
    }

    const request = normalizeRequest({
      pattern: target.symbol.name,
      path: root,
      literal: true,
      ignoreCase: false,
    });
    const candidates = await collectEvidenceCandidates({
      request,
      cwd: access.cwd,
      ...(access.signal ? { signal: access.signal } : {}),
      access,
      runRipgrep: this.#runner,
      maxFiles: access.maxFiles,
    });
    const occurrences = await classifyImpactOccurrences(candidates.files, target, access);
    const bound = await bindImpactCandidates(target, candidates.files, occurrences.items, access);
    occurrences.items = bound.items;
    const reasons = new Set([...candidates.reasons, ...occurrences.reasons]);
    let partial = candidates.partial || occurrences.partial;
    let testItems: AnalysisItem[] = [];
    let testStats: AnalysisResultSet["stats"];
    let relatedTestsCoverage: CoverageStatus = "skipped";
    const retainedBeforeTests = [target.item, ...occurrences.items];
    if (!target.symbol.hasBody) {
      reasons.add("Related-test augmentation skipped: selected target has no implementation body");
    } else if (impactRetentionExhausted(retainedBeforeTests)) {
      partial = true;
      reasons.add(
        "Related-test augmentation skipped: exact occurrences exhausted the shared analysis budget",
      );
    } else {
      const files = await listWorkspaceFiles(access.cwd, access.signal, { path: root });
      const allowed = new Set(files.paths.map((file) => resolve(access.cwd, file)));
      const primaryPath = resolve(access.cwd, document.path);
      const host = {
        cwd: access.cwd,
        ...(access.signal ? { signal: access.signal } : {}),
        normalizePath: (file: string) => workspaceRelativePath(access.cwd, file),
        load: async (file: string, expected?: SourceReference) => {
          const absolutePath = resolve(access.cwd, file);
          if (!allowed.has(absolutePath))
            throw new SignalGrepError("Navigation source is excluded by current ignore rules");
          if (absolutePath === primaryPath && expected === undefined) return document;
          return expected ? access.refresh(file, expected) : access.load(file);
        },
        syntax: (source: SourceDocument) => access.syntax(source),
        releaseSyntax: (source: SourceDocument) => access.releaseSyntax(source),
        listFiles: async () => files,
        maxFilesToParse: access.maxFiles,
      };
      const entryPaths = await this.#testEntryPaths(root, files.paths, access.cwd, access.signal);
      const tests = await findRelatedTests(
        host,
        {
          path: document.path,
          line: target.item.line,
          symbol: target.symbol.name,
        },
        { entryPaths },
      );
      testItems = tests.items;
      testStats = {
        filesEnumerated: files.paths.length,
        ...tests.stats,
        filesParsed: access.syntaxParses,
        cacheHits: access.syntaxCacheHits,
      };
      relatedTestsCoverage = tests.partial || files.partial ? "partial" : "complete";
      partial ||= tests.partial || files.partial;
      for (const reason of [...tests.reasons, ...files.reasons]) reasons.add(reason);
    }
    const result: AnalysisResultSet = {
      kind: "impact",
      unit: "impact-candidates",
      items: mergeImpactItems(target.item, occurrences.items, testItems),
      partial,
      reasons: [...reasons],
      filesRead: access.filesRead,
      bytesRead: access.bytesRead,
      stats: {
        ...testStats,
        filesParsed: access.syntaxParses,
        cacheHits: access.syntaxCacheHits,
        parseMs: testStats?.parseMs ?? Math.round(performance.now() - impactStarted),
        budgetExhausted:
          testStats?.budgetExhausted ??
          [...reasons].some(
            (reason) => reason.includes("limit") || reason.includes("budget-exhausted"),
          ),
      },
      coverage: {
        compilerCandidateBindings: candidates.partial ? "partial" : "complete",
        exactOccurrences: candidates.partial ? "partial" : "complete",
        syntaxClassification: occurrences.partial ? "partial" : "complete",
        relatedTests: relatedTestsCoverage,
      },
      redact: input.redact ?? false,
    };
    return this.#analyses.page(
      this.#analyses.create(
        result,
        (items) => retainedImpactCounts(items),
        impactRetentionPriority,
      ),
    );
  }

  async #navigate(input: SignalGrepInput, access: SourceAccess): Promise<SignalGrepResult> {
    const navigationStarted = performance.now();
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
    const language = syntaxLanguage(document.path);
    if (!language || language === "go") {
      throw new SignalGrepError(
        `${input.mode} requires reliable JS/TS/TSX syntax (${language ?? "unsupported"})`,
      );
    }
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
          stats: {
            filesEnumerated: 1,
            filesParsed: access.syntaxParses,
            filesSkipped: 0,
            cacheHits: access.syntaxCacheHits,
            parseMs: Math.round(performance.now() - navigationStarted),
            budgetExhausted: false,
          },
          redact: input.redact ?? false,
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
    const root = await navigationRoot(access.cwd, document.path, access.signal);
    const files = await listWorkspaceFiles(access.cwd, access.signal, { path: root });
    const allowed = new Set(files.paths.map((file) => resolve(access.cwd, file)));
    const primaryPath = resolve(access.cwd, document.path);
    const host = {
      cwd: access.cwd,
      ...(access.signal ? { signal: access.signal } : {}),
      normalizePath: (file: string) => workspaceRelativePath(access.cwd, file),
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
      maxFilesToParse: access.maxFiles,
    };
    const request = {
      path: document.path,
      ...(line !== undefined ? { line } : {}),
      ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
    };
    const result =
      input.mode === "imports"
        ? await navigateImports(host, request)
        : await findRelatedTests(host, request, {
            entryPaths: await this.#testEntryPaths(root, files.paths, access.cwd, access.signal),
          });
    return this.#analyses.page(
      this.#analyses.create({
        ...result,
        partial: result.partial || files.partial,
        reasons: [...result.reasons, ...files.reasons],
        kind: input.mode === "imports" ? "imports" : "tests",
        unit: input.mode === "imports" ? "relationships" : "evidence-items",
        coverage: {
          navigation: result.partial || files.partial ? "partial" : "complete",
        },
        stats: {
          filesEnumerated: files.paths.length,
          ...result.stats,
          filesParsed: access.syntaxParses,
          cacheHits: access.syntaxCacheHits,
        },
        redact: input.redact ?? false,
      }),
    );
  }
}
