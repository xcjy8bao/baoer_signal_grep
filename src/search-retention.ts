import { SignalGrepError } from "./errors.js";
import {
  MAX_SEARCH_STORAGE_BYTES,
  MAX_STORED_OCCURRENCES,
  type MatchRecord,
  type SearchRetentionDetails,
} from "./types.js";

/** Accounting bounds serialized evidence and occurrence cardinality, not V8 heap bytes. */
export class SearchRetention {
  #bytes = 0;
  #metadataBytes = 0;
  #occurrences = 0;
  readonly #reasons = new Set<string>();
  readonly maxBytes: number;
  readonly maxOccurrences: number;
  constructor(maxBytes = MAX_SEARCH_STORAGE_BYTES, maxOccurrences = MAX_STORED_OCCURRENCES) {
    this.maxBytes = maxBytes;
    this.maxOccurrences = maxOccurrences;
    for (const value of [maxBytes, maxOccurrences]) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new SignalGrepError("Search retention limits must be positive safe integers");
    }
  }

  file(displayPath: string, absolutePath: string): void {
    // Reserve the count, revision and path metadata before admitting this file's matches.
    const bytes = Buffer.byteLength(JSON.stringify([displayPath, absolutePath])) + 512;
    const metadataLimit = Math.floor(this.maxBytes / 4);
    if (this.#metadataBytes + bytes > metadataLimit)
      throw new SignalGrepError(
        `File-summary storage exceeds its ${String(metadataLimit)}-byte share of the search budget; narrow the path or filters`,
      );
    this.#bytes += bytes;
    this.#metadataBytes += bytes;
  }

  canRetainOccurrences(count: number): boolean {
    if (this.#occurrences + count <= this.maxOccurrences) return true;
    this.#reasons.add(`Occurrence retention reached the ${String(this.maxOccurrences)} limit`);
    return false;
  }

  retain(match: MatchRecord): boolean {
    if (!this.canRetainOccurrences(match.occurrences.length)) return false;
    const bytes = Buffer.byteLength(JSON.stringify(match)) + 1;
    if (this.#bytes - this.#metadataBytes + bytes > this.maxBytes - Math.floor(this.maxBytes / 4)) {
      this.#reasons.add(
        `Search evidence retention reached the ${String(this.maxBytes)}-byte limit`,
      );
      return false;
    }
    this.#bytes += bytes;
    this.#occurrences += match.occurrences.length;
    return true;
  }

  noteLimit(reason: string): void {
    this.#reasons.add(reason);
  }

  get details(): SearchRetentionDetails {
    return {
      accountedBytes: this.#bytes,
      retainedOccurrences: this.#occurrences,
      maxBytes: this.maxBytes,
      maxOccurrences: this.maxOccurrences,
      reasons: [...this.#reasons],
    };
  }
}
