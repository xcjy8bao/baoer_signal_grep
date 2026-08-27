import { CursorError, SignalGrepError } from "./errors.js";
import { formatMatchPage, formatSummary } from "./format.js";
import { normalizeRequest, type RawSearchInput } from "./request.js";
import type { RipgrepRunner } from "./rg.js";
import { SnapshotStore } from "./snapshot-store.js";
import {
  DEFAULT_SUMMARY_FILE_LIMIT,
  type SearchMode,
  type SearchSnapshot,
  type SignalGrepDetails,
  type SignalGrepResult,
} from "./types.js";

export interface SignalGrepInput extends RawSearchInput {
  mode?: SearchMode;
  cursor?: string;
}

export interface SignalGrepServiceOptions {
  runRipgrep: RipgrepRunner;
  snapshots?: SnapshotStore;
  summaryFileLimit?: number;
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

export class SignalGrepService {
  readonly #runRipgrep: RipgrepRunner;
  readonly #snapshots: SnapshotStore;
  readonly #summaryFileLimit: number;

  constructor(options: SignalGrepServiceOptions) {
    this.#runRipgrep = options.runRipgrep;
    this.#snapshots = options.snapshots ?? new SnapshotStore();
    this.#summaryFileLimit = options.summaryFileLimit ?? DEFAULT_SUMMARY_FILE_LIMIT;
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SignalGrepResult> {
    const mode = input.mode ?? "auto";
    if (input.cursor) return this.#continue(input.cursor, mode, signal);

    const request = normalizeRequest(input);
    const scan = await this.#runRipgrep(request, cwd, signal);
    const snapshot = this.#snapshots.create(scan);

    if (snapshot.totalMatches === 0) {
      return {
        text: "No matches found (complete).",
        details: baseDetails(snapshot, mode),
      };
    }

    if (mode === "summary" || (mode === "auto" && snapshot.totalMatches > request.pageSize)) {
      return this.#summary(snapshot, mode);
    }
    return this.#page(snapshot, 0, mode, signal);
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
    cursor: string,
    mode: SearchMode,
    signal?: AbortSignal,
  ): Promise<SignalGrepResult> {
    if (mode === "summary") {
      throw new SignalGrepError(
        "A cursor retrieves match pages; mode=summary is not valid with cursor",
      );
    }
    const { snapshot, offset } = this.#snapshots.resolve(cursor);
    return this.#page(snapshot, offset, "matches", signal);
  }

  #summary(snapshot: SearchSnapshot, mode: SearchMode): SignalGrepResult {
    const summary = formatSummary(snapshot, this.#summaryFileLimit);
    const cursor = snapshot.matches.length > 0 ? this.#snapshots.cursor(snapshot, 0) : undefined;
    const omitted =
      summary.omitted > 0 ? `\n… ${summary.omitted} more files omitted from this summary.` : "";
    const next = cursor
      ? `\n\nDetails are available from the stable snapshot with cursor="${cursor}".`
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
  ): Promise<SignalGrepResult> {
    if (offset === snapshot.matches.length) {
      throw new CursorError("Cursor is already at the end of the retained snapshot.");
    }

    const page = await formatMatchPage(snapshot, offset, signal);
    if (page.returnedMatches === 0) {
      throw new SignalGrepError("The output byte budget could not fit a single match");
    }

    const hasRetainedMatches = page.nextOffset < snapshot.matches.length;
    const cursor = hasRetainedMatches
      ? this.#snapshots.cursor(snapshot, page.nextOffset)
      : undefined;
    const range = `${offset + 1}-${page.nextOffset}`;
    const next = cursor ? `\n\nContinue with cursor="${cursor}".` : "";

    return {
      text: `${page.body}\n\n[Matches ${range} of ${snapshot.totalMatches}; ${completenessNote(snapshot)}.]${next}`,
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
