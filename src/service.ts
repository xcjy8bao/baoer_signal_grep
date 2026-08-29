import { resolve } from "node:path";
import { CursorError, SignalGrepError } from "./errors.js";
import { inspectSource } from "./inspect.js";
import {
  formatMatchPage,
  formatNormalBaseline,
  formatSummary,
  type MatchPageOptions,
} from "./format.js";
import { normalizeRequest, type RawSearchInput } from "./request.js";
import type { RipgrepRunner } from "./rg.js";
import type { CodeStructureProvider } from "./structure.js";
import { isPathInsideCwd } from "./source.js";
import { SnapshotStore } from "./snapshot-store.js";
import {
  DEFAULT_SUMMARY_FILE_LIMIT,
  type ContextBudget,
  type SearchMode,
  type SearchSnapshot,
  type SignalGrepDetails,
  type SignalGrepResult,
} from "./types.js";

export interface SignalGrepInput extends RawSearchInput {
  mode?: SearchMode;
  cursor?: string;
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

function baseDetails(snapshot: SearchSnapshot, mode: SearchMode): SignalGrepDetails {
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
  };
}

function completenessNote(snapshot: SearchSnapshot): string {
  if (snapshot.snapshotComplete) return "complete snapshot";
  return `PARTIAL snapshot: retained ${snapshot.matches.length} of ${snapshot.totalMatches} matches; narrow the search to retrieve all matches`;
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
      const inspectOptions = this.#structure
        ? { snapshots: this.#snapshots, structure: this.#structure }
        : { snapshots: this.#snapshots };
      return inspectSource(input, cwd, signal, inspectOptions);
    }
    if (input.cursor) return this.#continue(input, cwd, signal);

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
        const page = await formatMatchPage(snapshot, 0, signal, matchPageOptions(contextBudget));
        result =
          input.limit !== undefined ||
          (snapshot.snapshotComplete && page.nextOffset === snapshot.matches.length)
            ? this.#pageResult(snapshot, 0, mode, page)
            : this.#summary(snapshot, mode);
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
    const mode = input.mode ?? "auto";
    if (mode === "summary") {
      throw new SignalGrepError(
        "A cursor retrieves match pages; mode=summary is not valid with cursor",
      );
    }
    const cursor = input.cursor;
    if (!cursor) throw new CursorError("A cursor is required to continue a search");
    rejectCursorOnlyOptions(input);
    const { snapshot, offset } = this.#snapshots.resolve(cursor);
    const filterLabel = input.path?.replace(/^@/, "");
    const filterPath = filterLabel ? resolve(cwd, filterLabel) : undefined;
    if (filterPath && !isPathInsideCwd(filterPath, cwd)) {
      throw new SignalGrepError("Cursor path must stay within the working directory");
    }
    const result = await this.#page(snapshot, offset, "matches", signal, filterPath, filterLabel);
    return this.#finalize(snapshot, result);
  }

  #finalize(snapshot: SearchSnapshot, result: SignalGrepResult): SignalGrepResult {
    if (!result.details.cursor) this.#snapshots.delete(snapshot);
    return result;
  }

  #summary(snapshot: SearchSnapshot, mode: SearchMode): SignalGrepResult {
    const summary = formatSummary(snapshot, this.#summaryFileLimit);
    const cursor = snapshot.matches.length > 0 ? this.#snapshots.cursor(snapshot, 0) : undefined;
    const omitted =
      summary.omitted > 0 ? `\n… ${summary.omitted} more files omitted from this summary.` : "";
    const next = cursor
      ? `\n\nDetails are available from the stable snapshot with cursor="${cursor}". To select one file, continue with the same cursor and path="<relative-file-path>".`
      : "";
    const text = [
      `${snapshot.totalMatches} matches across ${snapshot.fileCounts.size} files (${completenessNote(snapshot)}).`,
      "",
      summary.body,
      omitted,
      next,
    ]
      .filter((part) => part.length > 0)
      .join("\n");

    return {
      text,
      details: {
        ...baseDetails(snapshot, mode),
        ...(cursor ? { cursor } : {}),
        summaryFilesShown: summary.shown,
        summaryFilesOmitted: summary.omitted,
      },
    };
  }

  async #page(
    snapshot: SearchSnapshot,
    offset: number,
    mode: SearchMode,
    signal?: AbortSignal,
    filterPath?: string,
    filterLabel?: string,
  ): Promise<SignalGrepResult> {
    if (offset === snapshot.matches.length) {
      throw new CursorError("Cursor is already at the end of the retained snapshot.");
    }

    const pageOptions = filterPath
      ? { include: (match: SearchSnapshot["matches"][number]) => match.absolutePath === filterPath }
      : {};
    const page = await formatMatchPage(snapshot, offset, signal, pageOptions);
    if (page.returnedMatches === 0 && filterPath) {
      throw new CursorError("No retained matches exist for the selected path.");
    }
    return this.#pageResult(snapshot, offset, mode, page, filterLabel);
  }

  #pageResult(
    snapshot: SearchSnapshot,
    offset: number,
    mode: SearchMode,
    page: Awaited<ReturnType<typeof formatMatchPage>>,
    filterLabel?: string,
  ): SignalGrepResult {
    if (page.returnedMatches === 0) {
      throw new SignalGrepError("The output budget could not fit a single match");
    }

    const cursor = page.hasNext ? this.#snapshots.cursor(snapshot, page.nextOffset) : undefined;
    const firstMatch = page.firstMatchIndex ?? offset;
    const lastMatch = page.lastMatchIndex ?? firstMatch;
    const range = `${firstMatch + 1}-${lastMatch + 1}`;
    const selection = filterLabel ? `; selected path ${filterLabel}` : "";
    const next = cursor
      ? `\n\nContinue with cursor="${cursor}"${filterLabel ? ` and path="${filterLabel}"` : ""}.`
      : "";
    const rangeNote = page.hasMatchRanges
      ? `\n\n[Match columns are 1-based UTF-16 positions${page.hasByteRanges ? "; b ranges use raw UTF-8 bytes" : ""}.]`
      : "";

    return {
      text: `${page.body}${rangeNote}\n\n[Matches ${range} of ${snapshot.totalMatches}${selection}; ${completenessNote(snapshot)}.]${next}`,
      details: {
        ...baseDetails(snapshot, mode),
        returnedMatches: page.returnedMatches,
        ...(cursor ? { cursor } : {}),
        ...(page.contextOmittedFiles.length > 0
          ? { contextOmittedFiles: page.contextOmittedFiles }
          : {}),
      },
    };
  }
}
