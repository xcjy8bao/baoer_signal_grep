import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { CursorError, SignalGrepError } from "./errors.js";
import { inspectSource } from "./inspect.js";
import { inspectSourceBatch } from "./inspect-batch.js";
import {
  formatMatchPage,
  formatNormalBaseline,
  MatchPageSoftLimitError,
  type MatchPageOptions,
} from "./format.js";
import { formatSummary } from "./summary.js";
import { normalizeRequest, type RawSearchInput } from "./request.js";
import type { RipgrepRunner } from "./rg.js";
import type { CodeStructureProvider } from "./structure.js";
import { isPathInsideCwd } from "./source.js";
import { SnapshotStore } from "./snapshot-store.js";
import {
  DEFAULT_SUMMARY_FILE_LIMIT,
  MAX_INSPECT_TARGETS,
  MAX_SELECTED_PATHS,
  type ContextBudget,
  type InspectTarget,
  type SearchMode,
  type SearchSnapshot,
  type SignalGrepDetails,
  type SignalGrepResult,
} from "./types.js";

export interface SignalGrepInput extends RawSearchInput {
  mode?: SearchMode;
  cursor?: string;
  paths?: string[];
  matchIndex?: number;
  matchIndices?: number[];
  targets?: InspectTarget[];
  line?: number;
}

export interface SignalGrepServiceOptions {
  runRipgrep: RipgrepRunner;
  snapshots?: SnapshotStore;
  summaryFileLimit?: number;
  structure?: CodeStructureProvider;
}

export interface SignalGrepSearchOptions {
  contextBudget?: ContextBudget;
  includeNormalBaseline?: boolean;
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
  for (const rawPath of rawPaths) {
    const label = rawPath.replace(/^@/, "");
    if (label.length === 0) throw new SignalGrepError("Cursor paths cannot be empty");
    const absolutePath = resolve(cwd, label);
    if (!isPathInsideCwd(absolutePath, cwd)) {
      throw new SignalGrepError("Cursor paths must stay within the working directory");
    }
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
    ...(snapshot.truncatedLines > 0 ? { lineContentTruncated: snapshot.truncatedLines } : {}),
    ...(sourceUnverifiedFileCount > 0 ? { sourceUnverifiedFileCount } : {}),
  };
}

function completenessNote(snapshot: SearchSnapshot): string {
  if (snapshot.snapshotComplete) return "complete snapshot";
  return `PARTIAL snapshot: retained ${snapshot.matches.length} of ${snapshot.totalMatches} matches; narrow the search to retrieve all matches`;
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
    throw new SignalGrepError(
      `The following options cannot be used with cursor: ${ignored.join(", ")}`,
    );
  }
}

export class SignalGrepService {
  readonly #runRipgrep: RipgrepRunner;
  readonly #snapshots: SnapshotStore;
  readonly #summaryFileLimit: number;
  readonly #structure: CodeStructureProvider | undefined;
  readonly #reusableSummarySnapshots = new WeakSet<SearchSnapshot>();

  constructor(options: SignalGrepServiceOptions) {
    this.#runRipgrep = options.runRipgrep;
    this.#snapshots = options.snapshots ?? new SnapshotStore();
    this.#summaryFileLimit = options.summaryFileLimit ?? DEFAULT_SUMMARY_FILE_LIMIT;
    this.#structure = options.structure;
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
    options: SignalGrepSearchOptions = {},
  ): Promise<SignalGrepResult> {
    const mode = input.mode ?? "auto";
    const contextBudget = selectContextBudget(input, mode, options.contextBudget);
    if (mode === "inspect") {
      const searchOptions = [
        "pattern",
        "glob",
        "exclude",
        "literal",
        "ignoreCase",
        "hidden",
        "context",
        "limit",
      ] as const;
      const unsupported = searchOptions.filter((key) => input[key] !== undefined);
      if (unsupported.length > 0) {
        throw new SignalGrepError(
          `Search options cannot be used with mode=inspect: ${unsupported.join(", ")}`,
        );
      }
      if (input.paths !== undefined) {
        throw new SignalGrepError("paths cannot be used with mode=inspect");
      }
      const inspectOptions = this.#structure
        ? { snapshots: this.#snapshots, structure: this.#structure }
        : { snapshots: this.#snapshots };
      if (input.matchIndices !== undefined || input.targets !== undefined) {
        return inspectSourceBatch(input, cwd, signal, inspectOptions);
      }
      return inspectSource(input, cwd, signal, inspectOptions);
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
    const scan = await this.#runRipgrep(request, cwd, signal);
    const snapshot = this.#snapshots.create(scan);
    try {
      const normalText = options.includeNormalBaseline
        ? await formatNormalBaseline(snapshot, cwd, signal)
        : undefined;
      const attachBaseline = (result: SignalGrepResult): SignalGrepResult =>
        normalText === undefined ? result : { ...result, normalText };
      let result: SignalGrepResult;

      if (snapshot.totalMatches === 0) {
        result = {
          text: "No matches found (complete).",
          details: baseDetails(snapshot, mode),
        };
      } else if (mode === "summary") {
        result = this.#summary(snapshot, mode);
      } else if (mode === "matches") {
        result = await this.#page(snapshot, 0, mode, signal);
      } else {
        try {
          const page = await formatMatchPage(snapshot, 0, signal, matchPageOptions(contextBudget));
          result =
            input.limit !== undefined ||
            (snapshot.snapshotComplete && page.nextOffset === snapshot.matches.length)
              ? this.#pageResult(snapshot, 0, mode, page)
              : this.#summary(snapshot, mode, 0, contextBudget);
        } catch (error) {
          // Auto can summarize evidence that does not fit its soft detail target.
          // Explicit limits, hard byte bounds, and runtime failures still fail clearly.
          if (input.limit !== undefined || !(error instanceof MatchPageSoftLimitError)) throw error;
          result = this.#summary(snapshot, mode, 0, contextBudget);
        }
      }

      const budgetedResult = attachContextBudget(result, contextBudget, snapshot.totalMatches);
      return this.#finalize(snapshot, attachBaseline(budgetedResult));
    } catch (error) {
      this.#snapshots.delete(snapshot);
      throw error;
    }
  }

  clear(): void {
    this.#snapshots.clear();
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
    rejectCursorOnlyOptions(input);
    const { snapshot, offset, kind, selectionKey } = this.#snapshots.resolve(cursor);
    const mode = input.mode ?? "auto";
    if (mode === "summary") {
      if (input.path !== undefined || input.paths !== undefined) {
        throw new SignalGrepError("path and paths are not valid while paging a file summary");
      }
      if (kind !== "summary") {
        throw new CursorError("A summary cursor is required to continue a file summary.");
      }
      if (offset >= snapshot.fileCounts.size) {
        throw new CursorError("Cursor is already at the end of the file summary.");
      }
      return this.#summary(snapshot, mode, offset);
    }

    const selection = cursorPathSelection(input, cwd);
    const requestedSelectionKey = selection?.key ?? "all";
    if (kind === "matches" && selectionKey !== requestedSelectionKey) {
      throw new CursorError("A match cursor must continue with the same path selection.");
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

  #summary(
    snapshot: SearchSnapshot,
    mode: SearchMode,
    offset = 0,
    budget?: ContextBudget,
  ): SignalGrepResult {
    this.#reusableSummarySnapshots.add(snapshot);
    const summary = formatSummary(
      snapshot,
      this.#summaryFileLimit,
      offset,
      budget?.resultTokenBudget,
    );
    const details = baseDetails(snapshot, mode);
    const cursor =
      snapshot.matches.length > 0
        ? this.#snapshots.cursor(snapshot, summary.nextOffset, "summary")
        : undefined;
    const fileRange =
      summary.shown > 0
        ? `Files ${String(summary.offset + 1)}-${String(summary.nextOffset)} of ${String(snapshot.fileCounts.size)}, ordered by match count.`
        : "No retained file summaries are available.";
    const omitted =
      summary.omitted > 0 ? `\n… ${String(summary.omitted)} lower-ranked files remain.` : "";
    const samples =
      summary.previews.length > 0
        ? `\n\nSamples: first retained match per shown file, not relevance-ranked or exhaustive.\n${summary.previews}`
        : "";
    const sampleOmissions =
      summary.previewsOmitted > 0
        ? `\n[${String(summary.previewsOmitted)} file(s) have no sample on this page.]`
        : "";
    const navigation = cursor
      ? `\n\nSnapshot cursor="${cursor}".\nInspect samples: mode="inspect", cursor, matchIndices=[one or more visible match numbers, max ${String(MAX_INSPECT_TARGETS)}].\nRetrieve matching lines: cursor with path or paths selecting exact files, no mode.${summary.hasNext ? '\nMore file summaries: cursor with mode="summary".' : ""}`
      : "";
    const text = `${snapshot.totalMatches} matches across ${snapshot.fileCounts.size} files (${completenessNote(snapshot)}).\n${fileRange}\n\n${summary.body}${omitted}${samples}${sampleOmissions}${navigation}${sourceVerificationNote(details)}`;

    return {
      text,
      details: {
        ...details,
        ...(cursor ? { cursor } : {}),
        summaryOffset: summary.offset,
        summaryFilesShown: summary.shown,
        summaryFilesOmitted: summary.omitted,
        summaryPreviewsShown: summary.previewsShown,
        summaryPreviewsOmitted: summary.previewsOmitted,
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
      ? `\n\nContinue with cursor="${cursor}"${selectedPaths ? " and the same path selection" : ""}.`
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
