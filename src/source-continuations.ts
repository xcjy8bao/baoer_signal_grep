import { randomUUID } from "node:crypto";
import {
  ANALYSIS_TTL_MS,
  MAX_SOURCE_CONTINUATIONS,
  MAX_SOURCE_CONTINUATION_BYTES,
} from "./analysis-limits.js";
import { CursorError } from "./errors.js";
import type { ByteRange, SourceReference } from "./source-document.js";
import { mergeByteRanges, subtractByteRange } from "./source-pages.js";

interface Continuation {
  id: string;
  source: SourceReference;
  target: ByteRange[];
  gaps: ByteRange[];
  accessed: number;
  /** Only cursors issued by this chain are valid; offsets are not a public seek API. */
  issued: Set<number>;
}

export interface ResolvedSourceContinuation {
  source: SourceReference;
  target: ByteRange[];
  remaining: ByteRange[];
}

/** Cursor offsets encode progress, not mutable per-page state; retries can replay. */
export class SourceContinuations {
  readonly #items = new Map<string, Continuation>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  create(
    source: SourceReference,
    target: readonly ByteRange[],
    gaps: readonly ByteRange[],
  ): string {
    this.#sweep();
    const item: Continuation = {
      id: randomUUID(),
      source: structuredClone(source),
      target: mergeByteRanges(target),
      gaps: mergeByteRanges(gaps),
      accessed: this.#now(),
      issued: new Set([0]),
    };
    if (
      item.gaps.length === 0 ||
      item.gaps.some(
        (gap) =>
          gap.start === gap.end ||
          !item.target.some((range) => range.start <= gap.start && gap.end <= range.end),
      )
    ) {
      throw new CursorError("Source continuation requires missing ranges inside its target");
    }
    this.#items.set(item.id, item);
    while (
      this.#items.size > MAX_SOURCE_CONTINUATIONS ||
      Buffer.byteLength(
        JSON.stringify(
          [...this.#items.values()].map((continuation) => ({
            id: continuation.id,
            source: continuation.source,
            target: continuation.target,
            gaps: continuation.gaps,
            accessed: continuation.accessed,
            issued: [...continuation.issued],
          })),
        ),
      ) > MAX_SOURCE_CONTINUATION_BYTES
    ) {
      let oldest: Continuation | undefined;
      for (const candidate of this.#items.values()) {
        if (!oldest || candidate.accessed < oldest.accessed) oldest = candidate;
      }
      if (!oldest) break;
      this.#items.delete(oldest.id);
    }
    if (!this.#items.has(item.id))
      throw new CursorError("Source continuation metadata exceeds its limit");
    return `${item.id}.source.0`;
  }

  resolve(cursor: string): ResolvedSourceContinuation {
    const { item, consumed } = this.#resolve(cursor);
    return {
      source: structuredClone(item.source),
      target: item.target.map((range) => ({ ...range })),
      remaining: this.#remaining(item, consumed),
    };
  }

  advance(cursor: string, returned: ByteRange): string | undefined {
    const { item, consumed } = this.#resolve(cursor);
    const remaining = this.#remaining(item, consumed);
    const first = remaining[0];
    if (
      !first ||
      returned.start !== first.start ||
      returned.end <= returned.start ||
      returned.end > first.end
    ) {
      throw new CursorError("Source continuation must advance along its next missing range");
    }
    const next = consumed + returned.end - returned.start;
    item.issued.add(next);
    return this.#remaining(item, next).length > 0
      ? `${item.id}.source.${next.toString(36)}`
      : undefined;
  }

  clear(): void {
    this.#items.clear();
  }

  #resolve(cursor: string): { item: Continuation; consumed: number } {
    this.#sweep();
    const match = /^([0-9a-f-]+)\.source\.([0-9a-z]+)$/.exec(cursor);
    if (!match?.[1] || !match[2]) throw new CursorError("Invalid source continuation cursor");
    const item = this.#items.get(match[1]);
    if (!item) throw new CursorError("Source continuation expired or was evicted; inspect again");
    const consumed = Number.parseInt(match[2], 36);
    const length = item.gaps.reduce((sum, range) => sum + range.end - range.start, 0);
    if (
      !Number.isSafeInteger(consumed) ||
      consumed < 0 ||
      consumed >= length ||
      !item.issued.has(consumed)
    ) {
      throw new CursorError("Source continuation offset is outside its missing ranges");
    }
    item.accessed = this.#now();
    return { item, consumed };
  }

  #remaining(item: Continuation, consumed: number): ByteRange[] {
    let left = consumed;
    let ranges = item.gaps.map((range) => ({ ...range }));
    for (const range of item.gaps) {
      if (left === 0) break;
      const take = Math.min(left, range.end - range.start);
      ranges = subtractByteRange(ranges, { start: range.start, end: range.start + take });
      left -= take;
    }
    return ranges;
  }

  #sweep(): void {
    const cutoff = this.#now() - ANALYSIS_TTL_MS;
    for (const item of this.#items.values())
      if (item.accessed < cutoff) this.#items.delete(item.id);
  }
}
