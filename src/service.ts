import { createHash } from "node:crypto";
import { EvidenceService, isEvidenceRequest } from "./evidence-service.js";
import type { GitChangeRequest } from "./git-source.js";
import type { SyntaxRoleName } from "./syntax.js";
import { resolve } from "node:path";
import { CursorError, SignalGrepError } from "./errors.js";
import { formatMatchPage, MatchPageSoftLimitError, type MatchPageOptions } from "./format.js";
import { formatSummary } from "./summary.js";
import { summarySourcePreviews } from "./summary-previews.js";
import { normalizeRequest, type RawSearchInput } from "./request.js";
import { redactSignalGrepResult } from "./redaction.js";
import type { RipgrepRunner } from "./rg.js";
import type { CodeStructureProvider } from "./structure.js";
import { SearchPathPolicy } from "./path-policy.js";
import { SnapshotStore } from "./snapshot-store.js";
import {
  DEFAULT_SUMMARY_FILE_LIMIT,
  MAX_INSPECT_TARGETS,
  MAX_SELECTED_PATHS,
  type ContextBudget,
  type InspectTarget,
  type SearchMode,
  type SearchSnapshot,
  type SearchScopeDetails,
  type SignalGrepDetails,
  type SignalGrepResult,
} from "./types.js";

export interface SignalGrepInput extends RawSearchInput {
  query?: string;
  column?: number;
  mode?: SearchMode;
  cursor?: string;
  paths?: string[];
  matchIndex?: number;
  matchIndices?: number[];
  targets?: InspectTarget[];
  line?: number;
  sourceCursor?: string;
  allOf?: string[];
  anyOf?: string[];
  within?: "file" | "function";
  roles?: SyntaxRoleName[];
  changes?: GitChangeRequest;
  symbol?: string;
  maxFilesToParse?: number;
}

export interface SignalGrepServiceOptions {
  runRipgrep: RipgrepRunner;
  snapshots?: SnapshotStore;
  summaryFileLimit?: number;
  structure?: CodeStructureProvider;
}

export interface SignalGrepSearchOptions {
  contextBudget?: ContextBudget;
}
interface PathSelection {
  labels: string[];
  absolutePaths: Set<string>;
  key: string;
}

function cursorPathSelection(input: SignalGrepInput, cwd: string): PathSelection | undefined {
  if (input.path !== undefined && input.paths !== undefined) {
    throw new SignalGrepError("Use either path or paths with a cursor, not both");
  }
  const rawPaths = input.paths ?? (input.path === undefined ? [] : [input.path]);
  if (input.paths !== undefined && rawPaths.length === 0) {
    throw new SignalGrepError("paths must contain at least one retained file");
  }
  if (rawPaths.length === 0) return undefined;
  if (rawPaths.length > MAX_SELECTED_PATHS) {
    throw new SignalGrepError(
      `paths cannot contain more than ${String(MAX_SELECTED_PATHS)} entries`,
    );
  }

  const labels: string[] = [];
  const absolutePaths = new Set<string>();
  const policy = new SearchPathPolicy(cwd);
  for (const rawPath of rawPaths) {
    const label = rawPath.replace(/^@/, "");
    if (label.length === 0) throw new SignalGrepError("Cursor paths cannot be empty");
    const absolutePath = resolve(cwd, label);
    policy.assertPath(absolutePath);
    if (absolutePaths.has(absolutePath)) continue;
    absolutePaths.add(absolutePath);
    labels.push(label);
  }
  const key = createHash("sha256")
    .update([...absolutePaths].toSorted((left, right) => left.localeCompare(right)).join("\0"))
    .digest("hex")
    .slice(0, 16);
  return { labels, absolutePaths, key };
}

function baseDetails(snapshot: SearchSnapshot, mode: SearchMode): SignalGrepDetails {
  const sourceUnverifiedFileCount = new Set(
    snapshot.matches
      .filter((match) => !snapshot.sourceRevisions.has(match.absolutePath))
      .map((match) => match.absolutePath),
  ).size;
  return {
    version: 1,
    mode,
    status: snapshot.snapshotComplete ? "complete" : "partial",
    totalMatches: snapshot.totalMatches,
    storedMatches: snapshot.matches.length,
    totalFiles: snapshot.fileCounts.size,
    returnedMatches: 0,
    snapshotComplete: snapshot.snapshotComplete,
    ...(snapshot.retention ? { retention: snapshot.retention } : {}),
    scope: searchScope(snapshot.request),
    ...(snapshot.request.redact ? { redactionRequested: true } : {}),
    ...(snapshot.truncatedLines > 0 ? { lineContentTruncated: snapshot.truncatedLines } : {}),
    ...(sourceUnverifiedFileCount > 0 ? { sourceUnverifiedFileCount } : {}),
  };
}

function searchScope(request: SearchSnapshot["request"]): SearchScopeDetails {
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

function emptyResultText(scope: SearchScopeDetails): string {
  const filters =
    scope.glob.length || scope.exclude.length || !scope.hidden
      ? " Include/exclude and hidden-file filters were applied."
      : "";
  const expansion = scope.expandedToProjectRoot
    ? ` after the requested path ${JSON.stringify(scope.requestedPath)} also returned no matches`
    : "";
  const range = scope.assertion === "project-wide" ? "project root" : "requested path";
  return `No matches found anywhere in ${range} ${JSON.stringify(scope.path)}${expansion}.${filters}`;
}

function scopeExpansionNote(scope: SearchScopeDetails | undefined, totalMatches: number): string {
  if (!scope?.expandedToProjectRoot) return "";
  const outcome =
    totalMatches > 0
      ? "returned project-wide matches"
      : "the project root was also searched and had no matches";
  return `\n\n[Scope expanded: requested path ${JSON.stringify(scope.requestedPath)} had no matches; ${outcome} from ${JSON.stringify(scope.path)}.]`;
}

function completenessNote(snapshot: SearchSnapshot): string {
  if (snapshot.snapshotComplete) return "complete snapshot";
  const reasons = snapshot.retention?.reasons.join("; ");
  return `PARTIAL snapshot: retained ${snapshot.matches.length} of ${snapshot.totalMatches} matches; ${reasons ? `${reasons}; ` : ""}narrow the search to retrieve all matches`;
}

function sourceVerificationNote(details: SignalGrepDetails): string {
  return details.sourceUnverifiedFileCount
    ? `\n\n[Source revision unverified for ${String(details.sourceUnverifiedFileCount)} retained file(s); context and snapshot-scoped inspection require verified source.]`
    : "";
}
function selectContextBudget(
  input: SignalGrepInput,
  mode: SearchMode,
  candidate: ContextBudget | undefined,
): ContextBudget | undefined {
  if (mode !== "auto" || input.limit !== undefined || input.cursor) return undefined;
  return candidate;
}

function matchPageOptions(budget: ContextBudget | undefined): MatchPageOptions {
  if (!budget) return {};
  return { resultTokenBudget: budget.resultTokenBudget };
}

function attachContextBudget(
  result: SignalGrepResult,
  budget: ContextBudget | undefined,
  totalMatches: number,
): SignalGrepResult {
  if (!budget || totalMatches === 0) return result;
  let text = result.text;
  if (budget.tier !== "full") {
    text = `${result.text}\n\n[Budget: ${budget.tier}; context remainder ${budget.contextRemainderPercent}%; auto detail target ${budget.resultTokenBudget} estimated tokens.]`;
  }
  return {
    ...result,
    text,
    details: {
      ...result.details,
      budgetTier: budget.tier,
      contextRemainderPercent: budget.contextRemainderPercent,
      resultTokenBudget: budget.resultTokenBudget,
    },
  };
}

function rejectCursorOnlyOptions(input: SignalGrepInput): void {
  const ignored: string[] = [];
  if (input.scope !== undefined) ignored.push("scope");
  if (input.wholeWord !== undefined) ignored.push("wholeWord");
  if (input.query !== undefined) ignored.push("query");
  if (input.pattern !== undefined) ignored.push("pattern");
  if (input.glob !== undefined) ignored.push("glob");
  if (input.exclude !== undefined) ignored.push("exclude");
  if (input.literal !== undefined) ignored.push("literal");
  if (input.ignoreCase !== undefined) ignored.push("ignoreCase");
  if (input.hidden !== undefined) ignored.push("hidden");
  if (input.context !== undefined) ignored.push("context");
  if (input.limit !== undefined) ignored.push("limit");
  if (input.line !== undefined) ignored.push("line");
  if (input.matchIndex !== undefined) ignored.push("matchIndex");
  if (input.matchIndices !== undefined) ignored.push("matchIndices");
  if (input.targets !== undefined) ignored.push("targets");
  if (ignored.length > 0) {
    throw new CursorError(
      `The following options cannot be used with cursor: ${ignored.join(", ")}`,
      "E_CURSOR_OPTIONS_CONFLICT",
    );
  }
}

export class SignalGrepService {
  readonly #runRipgrep: RipgrepRunner;
  readonly #snapshots: SnapshotStore;
  readonly #summaryFileLimit: number;
  readonly #evidence: EvidenceService;
  #lifecycle = new AbortController();
  readonly #active = new Set<Promise<SignalGrepResult>>();
  readonly #reusableSummarySnapshots = new WeakSet<SearchSnapshot>();

  constructor(options: SignalGrepServiceOptions) {
    this.#runRipgrep = options.runRipgrep;
    this.#snapshots = options.snapshots ?? new SnapshotStore();
    this.#summaryFileLimit = options.summaryFileLimit ?? DEFAULT_SUMMARY_FILE_LIMIT;
    this.#evidence = new EvidenceService(this.#runRipgrep, this.#snapshots, options.structure);
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
    options: SignalGrepSearchOptions = {},
  ): Promise<SignalGrepResult> {
    const combined = signal
      ? AbortSignal.any([signal, this.#lifecycle.signal])
      : this.#lifecycle.signal;
    const request = this.#search(input, cwd, combined, options);
    this.#active.add(request);
    try {
      const result = await request;
      return input.redact || result.details.redactionRequested
        ? redactSignalGrepResult(result)
        : result;
    } finally {
      this.#active.delete(request);
    }
  }

  async #search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
    options: SignalGrepSearchOptions = {},
  ): Promise<SignalGrepResult> {
    if (
      input.cursor !== undefined &&
      (typeof input.cursor !== "string" || input.cursor.trim().length === 0)
    ) {
      throw new CursorError("Invalid cursor. Copy a nonempty cursor from a previous result.");
    }
    const mode = input.mode ?? "auto";
    const contextBudget = selectContextBudget(input, mode, options.contextBudget);
    if (isEvidenceRequest(input)) return this.#evidence.search(input, cwd, signal);
    if (input.column !== undefined)
      throw new SignalGrepError("column requires semantic navigation");
    if (input.query !== undefined) throw new SignalGrepError("query requires a discovery mode");
    if (input.maxFilesToParse !== undefined) {
      throw new SignalGrepError("maxFilesToParse is only valid for structural analysis requests");
    }
    if (input.cursor) return this.#continue(input, cwd, signal);
    if (input.paths !== undefined) {
      throw new SignalGrepError("paths can only select retained files from a cursor");
    }
    if (input.matchIndex !== undefined) {
      throw new SignalGrepError("matchIndex requires mode=inspect with a cursor");
    }
    if (input.matchIndices !== undefined || input.targets !== undefined) {
      throw new SignalGrepError("matchIndices and targets require mode=inspect");
    }
    if (input.line !== undefined) throw new SignalGrepError("line requires mode=inspect");

    const request = normalizeRequest(input);
    let scan = await this.#runRipgrep(request, cwd, signal);
    if (scan.totalMatches === 0 && request.path !== undefined && request.scope !== "strict") {
      const { path: requestedPath, ...projectRequest } = request;
      scan = await this.#runRipgrep(
        { ...projectRequest, expandedFromPath: requestedPath },
        cwd,
        signal,
      );
    }
    const snapshot = this.#snapshots.create(scan);
    try {
      let result: SignalGrepResult;

      if (snapshot.totalMatches === 0) {
        const details = baseDetails(snapshot, mode);
        result = {
          text: emptyResultText(details.scope ?? searchScope(snapshot.request)),
          details,
        };
      } else if (snapshot.matches.length === 0) {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "summary") {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "matches") {
        result = await this.#page(snapshot, 0, mode, signal);
      } else {
        try {
          const page = await formatMatchPage(snapshot, 0, signal, matchPageOptions(contextBudget));
          result =
            input.limit !== undefined ||
            (snapshot.snapshotComplete && page.nextOffset === snapshot.matches.length)
              ? this.#pageResult(snapshot, 0, mode, page)
              : await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
        } catch (error) {
          // Auto can summarize evidence that does not fit its soft detail target.
          // Explicit limits, hard byte bounds, and runtime failures still fail clearly.
          if (input.limit !== undefined || !(error instanceof MatchPageSoftLimitError)) throw error;
          result = await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
        }
      }

      result = {
        ...result,
        text: `${result.text}${scopeExpansionNote(result.details.scope, result.details.totalMatches)}`,
      };
      const budgetedResult = attachContextBudget(result, contextBudget, snapshot.totalMatches);
      return this.#finalize(snapshot, budgetedResult);
    } catch (error) {
      this.#snapshots.delete(snapshot);
      throw error;
    }
  }

  clear(): void {
    this.#lifecycle.abort();
    this.#lifecycle = new AbortController();
    this.#snapshots.clear();
    this.#evidence.clear();
  }

  async shutdown(): Promise<void> {
    this.clear();
    const pending = [...this.#active];
    await Promise.allSettled(pending);
    await this.#evidence.shutdown();
  }

  get snapshotCount(): number {
    return this.#snapshots.size;
  }

  get storedMatches(): number {
    return this.#snapshots.storedMatches;
  }

  async #continue(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SignalGrepResult> {
    const cursor = input.cursor;
    if (!cursor) throw new CursorError("A cursor is required to continue a search");
    const { snapshot, offset, kind, selectionKey } = this.#snapshots.resolve(cursor);
    rejectCursorOnlyOptions(input);
    const mode = input.mode ?? "auto";
    if (mode === "summary") {
      if (input.path !== undefined || input.paths !== undefined) {
        throw new SignalGrepError("path and paths are not valid while paging a file summary");
      }
      if (kind !== "summary") {
        throw new CursorError(
          "A summary cursor is required to continue a file summary.",
          "E_CURSOR_WRONG_KIND",
        );
      }
      if (offset >= snapshot.fileCounts.size) {
        throw new CursorError("Cursor is already at the end of the file summary.");
      }
      return this.#summary(snapshot, mode, cwd, signal, offset);
    }

    const selection = cursorPathSelection(input, cwd);
    const requestedSelectionKey = selection?.key ?? "all";
    if (kind === "matches" && selectionKey !== requestedSelectionKey) {
      throw new CursorError(
        "A match cursor must continue with the same path selection.",
        "E_CURSOR_OPTIONS_CONFLICT",
      );
    }
    const pageOffset = kind === "summary" ? 0 : offset;
    const result = await this.#page(snapshot, pageOffset, "matches", signal, selection);
    return this.#finalize(snapshot, result, kind === "summary" || selection !== undefined);
  }

  #finalize(
    snapshot: SearchSnapshot,
    result: SignalGrepResult,
    retainSnapshot = false,
  ): SignalGrepResult {
    if (
      !result.details.cursor &&
      !retainSnapshot &&
      !this.#reusableSummarySnapshots.has(snapshot)
    ) {
      this.#snapshots.delete(snapshot);
    }
    return result;
  }

  async #summary(
    snapshot: SearchSnapshot,
    mode: SearchMode,
    cwd: string,
    signal: AbortSignal | undefined,
    offset = 0,
    budget?: ContextBudget,
  ): Promise<SignalGrepResult> {
    this.#reusableSummarySnapshots.add(snapshot);
    const summary = formatSummary(
      snapshot,
      this.#summaryFileLimit,
      offset,
      budget?.resultTokenBudget,
    );
    const details = baseDetails(snapshot, mode);
    const cursor =
      snapshot.fileCounts.size > 0
        ? this.#snapshots.cursor(snapshot, summary.nextOffset, "summary")
        : undefined;
    const fileRange =
      summary.shown > 0
        ? `Files ${String(summary.offset + 1)}-${String(summary.nextOffset)} of ${String(snapshot.fileCounts.size)}, ordered by match count.`
        : "No retained file summaries are available.";
    const omitted =
      summary.omitted > 0 ? `\n… ${String(summary.omitted)} lower-ranked files remain.` : "";
    const preview = await summarySourcePreviews(
      snapshot,
      summary.shownPaths,
      summary.previewByteBudget,
      cwd,
      signal,
    );
    const sampleText = preview.text || summary.previews;
    const indices = preview.text ? preview.indices : summary.sampleIndices;
    const samples = sampleText
      ? `\n\nSamples: bounded source windows; not relevance-ranked or exhaustive.\n${sampleText}`
      : "";
    const sampleOmissions = `\n[Preview limits: at most 5 source files, 2 non-overlapping windows/file, 7 lines/window. File rows and navigation take priority; shown ${preview.text ? preview.windows : summary.previewsShown} previews.]${preview.reasons.length ? `\n[${preview.reasons.map((reason) => reason.slice(0, 200)).join("; ")}]` : ""}`;
    const redaction = snapshot.request.redact ? { redact: true } : {};
    const nextRequest =
      cursor && summary.hasNext ? { cursor, mode: "summary" as const, ...redaction } : undefined;
    const inspectRequest =
      cursor && indices.length
        ? {
            mode: "inspect" as const,
            cursor,
            matchIndices: indices.slice(0, MAX_INSPECT_TARGETS),
            ...redaction,
          }
        : undefined;
    const matchesRequest =
      cursor && snapshot.matches.length > 0 && summary.shownPaths.length
        ? { cursor, paths: summary.shownPaths.slice(0, 1), ...redaction }
        : undefined;
    const followUp = cursor
      ? `\n\nSnapshot cursor="${cursor}".${inspectRequest ? `\nInspect samples: ${JSON.stringify(inspectRequest)}` : ""}${matchesRequest ? `\nRetrieve matching lines: ${JSON.stringify(matchesRequest)}` : ""}${nextRequest ? `\nNext request: ${JSON.stringify(nextRequest)}` : ""}`
      : "";
    const text = `${snapshot.totalMatches} matches across ${snapshot.fileCounts.size} files (${completenessNote(snapshot)}).\n${fileRange}\n\n${summary.body}${omitted}${samples}${sampleOmissions}${followUp}${sourceVerificationNote(details)}`;

    return {
      text,
      details: {
        ...details,
        ...(cursor ? { cursor } : {}),
        ...(nextRequest ? { nextRequest } : {}),
        summaryOffset: summary.offset,
        summaryFilesShown: summary.shown,
        summaryFilesOmitted: summary.omitted,
        summaryPreviewsShown: preview.text ? preview.windows : summary.previewsShown,
        summaryPreviewsOmitted: Math.max(
          0,
          summary.shown -
            (preview.text
              ? new Set(indices.map((index) => snapshot.matches[index - 1]?.displayPath)).size
              : summary.previewsShown),
        ),
      },
    };
  }

  async #page(
    snapshot: SearchSnapshot,
    offset: number,
    mode: SearchMode,
    signal?: AbortSignal,
    selection?: PathSelection,
  ): Promise<SignalGrepResult> {
    if (offset === snapshot.matches.length) {
      throw new CursorError("Cursor is already at the end of the retained snapshot.");
    }

    const pageOptions = selection
      ? {
          metadataReserveBytes:
            1536 + Buffer.byteLength(JSON.stringify({ paths: selection.labels })),
          include: (match: SearchSnapshot["matches"][number]) =>
            selection.absolutePaths.has(match.absolutePath),
        }
      : {};
    const page = await formatMatchPage(snapshot, offset, signal, pageOptions);
    if (page.returnedMatches === 0 && selection) {
      throw new CursorError("No retained matches exist for the selected paths.");
    }
    const missingPaths: string[] = [];
    if (selection) {
      const matchedAbsolutePaths = new Set<string>();
      for (const match of snapshot.matches) {
        if (selection.absolutePaths.has(match.absolutePath)) {
          matchedAbsolutePaths.add(match.absolutePath);
        }
      }
      const selectedAbsolutePaths = [...selection.absolutePaths];
      for (const [index, label] of selection.labels.entries()) {
        const absolutePath = selectedAbsolutePaths[index];
        if (absolutePath !== undefined && !matchedAbsolutePaths.has(absolutePath)) {
          missingPaths.push(label);
        }
      }
    }
    return this.#pageResult(
      snapshot,
      offset,
      mode,
      page,
      selection?.labels,
      missingPaths,
      selection?.key ?? "all",
    );
  }

  #pageResult(
    snapshot: SearchSnapshot,
    offset: number,
    mode: SearchMode,
    page: Awaited<ReturnType<typeof formatMatchPage>>,
    selectedPaths?: string[],
    selectionMissingPaths: string[] = [],
    selectionKey = "all",
  ): SignalGrepResult {
    if (page.returnedMatches === 0) {
      throw new SignalGrepError("The output budget could not fit a single match");
    }

    const cursor = page.hasNext
      ? this.#snapshots.cursor(snapshot, page.nextOffset, "matches", selectionKey)
      : undefined;
    const firstMatch = page.firstMatchIndex ?? offset;
    const lastMatch = page.lastMatchIndex ?? firstMatch;
    const range = `${firstMatch + 1}-${lastMatch + 1}`;
    const selection = selectedPaths ? `; selected ${String(selectedPaths.length)} path(s)` : "";
    const next = cursor
      ? `\n\nContinue with cursor="${cursor}".\nNext request: ${JSON.stringify({ cursor, ...(selectedPaths ? { paths: selectedPaths } : {}), ...(snapshot.request.redact ? { redact: true } : {}) })}`
      : "";
    const missingSelectionNote =
      selectionMissingPaths.length > 0
        ? `\n\n[${String(selectionMissingPaths.length)} selected path(s) had no retained matches.]`
        : "";
    const rangeNote = page.hasMatchRanges
      ? `\n\n[Match columns are 1-based UTF-16 positions${page.hasByteRanges ? "; b ranges use raw UTF-8 bytes" : ""}.]`
      : "";
    const contextNotes: string[] = [];
    if (page.contextChangedFiles.length > 0) {
      contextNotes.push(
        `Context omitted for ${String(page.contextChangedFiles.length)} changed file(s); refresh the search before relying on surrounding lines.`,
      );
    }
    if (page.contextOmittedFiles.length > 0) {
      contextNotes.push(
        `Context unavailable for ${String(page.contextOmittedFiles.length)} file(s); retained matching lines are still shown.`,
      );
    }
    const contextNote = contextNotes.length > 0 ? `\n\n[${contextNotes.join(" ")}]` : "";
    const details = baseDetails(snapshot, mode);

    return {
      text: `${page.body}${rangeNote}${contextNote}${missingSelectionNote}\n\n[Matches ${range} of ${snapshot.totalMatches}${selection}; ${completenessNote(snapshot)}.]${next}${sourceVerificationNote(details)}`,
      details: {
        ...details,
        returnedMatches: page.returnedMatches,
        ...(page.occurrenceRangesOmitted > 0
          ? { occurrenceRangesOmitted: page.occurrenceRangesOmitted }
          : {}),
        ...(page.occurrenceMatchesTruncated > 0
          ? { occurrenceMatchesTruncated: page.occurrenceMatchesTruncated }
          : {}),
        ...(cursor ? { cursor } : {}),
        ...(cursor
          ? {
              nextRequest: {
                cursor,
                ...(selectedPaths ? { paths: selectedPaths } : {}),
                ...(snapshot.request.redact ? { redact: true } : {}),
              },
            }
          : {}),
        ...(selectedPaths ? { selectedPaths } : {}),
        ...(selectionMissingPaths.length > 0 ? { selectionMissingPaths } : {}),
        ...(page.contextOmittedFiles.length > 0
          ? { contextOmittedFiles: page.contextOmittedFiles }
          : {}),
        ...(page.contextChangedFiles.length > 0
          ? { contextChangedFiles: page.contextChangedFiles }
          : {}),
      },
    };
  }
}
