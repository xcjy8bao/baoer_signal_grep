import { randomUUID } from "node:crypto";
import {
  ANALYSIS_TTL_MS,
  MAX_ANALYSIS_RESULTS,
  MAX_ANALYSIS_SNAPSHOTS,
  MAX_ANALYSIS_STORAGE_BYTES,
} from "./analysis-limits.js";
import type { AnalysisItem, AnalysisResultSet } from "./analysis-types.js";
import { CursorError, SignalGrepError } from "./errors.js";
import type { SignalGrepResult } from "./types.js";
import { MAX_RESULT_BYTES } from "./types.js";

interface StoredAnalysis {
  id: string;
  result: AnalysisResultSet;
  bytes: number;
  touched: number;
}

/** Stores only bounded display evidence and version references, never syntax trees. */
export class AnalysisStore {
  readonly #items = new Map<string, StoredAnalysis>();
  readonly #now: () => number;
  constructor(now: () => number = Date.now) {
    this.#now = now;
  }
  clear(): void {
    this.#items.clear();
  }

  create(result: AnalysisResultSet): string {
    this.#expire();
    const bounded: AnalysisResultSet = { ...result, reasons: [...result.reasons], items: [] };
    let bytes = Buffer.byteLength(JSON.stringify(bounded));
    for (const item of result.items) {
      const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
      if (
        bounded.items.length >= MAX_ANALYSIS_RESULTS ||
        bytes + itemBytes > MAX_ANALYSIS_STORAGE_BYTES - 1024
      ) {
        bounded.partial = true;
        bounded.reasons.push("Analysis storage limit: 50,000 items / 32 MiB; narrow the query");
        break;
      }
      bounded.items.push(structuredClone(item));
      bytes += itemBytes;
    }
    bytes = Buffer.byteLength(JSON.stringify(bounded));
    while (
      this.#items.size >= MAX_ANALYSIS_SNAPSHOTS ||
      this.#totalBytes() + bytes > MAX_ANALYSIS_STORAGE_BYTES ||
      this.#totalItems() + bounded.items.length > MAX_ANALYSIS_RESULTS
    ) {
      const oldest = [...this.#items.values()].toSorted((a, b) => a.touched - b.touched)[0];
      if (!oldest) throw new SignalGrepError("Analysis metadata exceeds the storage budget");
      this.#items.delete(oldest.id);
    }
    const id = randomUUID();
    this.#items.set(id, { id, result: bounded, bytes, touched: this.#now() });
    return `${id}.analysis.0`;
  }

  resolve(cursor: string): { stored: StoredAnalysis; offset: number } {
    this.#expire();
    const match = /^([a-f0-9-]+)\.analysis\.([0-9a-z]+)$/.exec(cursor);
    if (!match) throw new CursorError("Invalid analysis cursor");
    const id = match[1];
    const rawOffset = match[2];
    if (!id || !rawOffset) throw new CursorError("Invalid analysis cursor");
    const offset = Number.parseInt(rawOffset, 36);
    const stored = this.#items.get(id);
    if (!stored)
      throw new CursorError("Analysis cursor expired or was evicted; run the query again");
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset.toString(36) !== rawOffset ||
      offset > stored.result.items.length
    )
      throw new CursorError("Invalid analysis offset");
    stored.touched = this.#now();
    return { stored, offset };
  }

  item(cursor: string, index: number): AnalysisItem {
    const { stored } = this.resolve(cursor);
    if (!Number.isSafeInteger(index) || index < 1)
      throw new CursorError("matchIndex must be a positive analysis item index");
    const item = stored.result.items[index - 1];
    if (!item) throw new CursorError("Analysis item is outside the retained result");
    return structuredClone(item);
  }

  page(cursor: string): SignalGrepResult {
    const { stored, offset } = this.resolve(cursor);
    const { result } = stored;
    const items: NonNullable<SignalGrepResult["details"]["analysis"]>["items"] = [];
    const header = `${result.kind}: ${result.items.length} retained ${result.unit} (${result.partial ? "PARTIAL" : "complete"}). ${result.counts ? `Counts: ${JSON.stringify(result.counts)}. ` : ""}Counts use ${result.unit}; they are not ordinary matching-line counts.`;
    const notice = result.reasons.length
      ? `\n${result.reasons.map((reason) => `[${reason}]`).join("\n")}`
      : "";
    const rows: string[] = [];
    let bytes = Buffer.byteLength(header + notice) + 1200;
    let next = offset;
    for (let index = offset; index < result.items.length && items.length < 30; index += 1) {
      const item = result.items[index];
      if (!item) throw new Error("Analysis item unavailable");
      const inspect =
        item.source && item.range
          ? { mode: "inspect" as const, cursor: `${stored.id}.analysis.0`, matchIndex: index + 1 }
          : undefined;
      const row = `#${index + 1} ${item.path}:${item.line} ${item.label}${item.excerpt ? `\n${item.excerpt}` : ""}${item.details ? `\nEvidence: ${JSON.stringify(item.details)}` : ""}${inspect ? `\nInspect: ${JSON.stringify(inspect)}` : ""}`;
      const rowBytes = Buffer.byteLength(row) + 2;
      if (bytes + rowBytes > MAX_RESULT_BYTES) {
        if (items.length === 0)
          throw new SignalGrepError("Analysis item exceeds the response limit; narrow its source");
        break;
      }
      rows.push(row);
      bytes += rowBytes;
      next = index + 1;
      items.push({ ...item, index: index + 1, ...(inspect ? { inspect } : {}) });
    }
    const nextRequest =
      next < result.items.length
        ? { cursor: `${stored.id}.analysis.${next.toString(36)}` }
        : undefined;
    const text = [
      header + notice,
      ...rows,
      ...(nextRequest ? [`Next request: ${JSON.stringify(nextRequest)}`] : []),
    ].join("\n\n");
    if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
      throw new SignalGrepError("Analysis metadata exceeds the output limit");
    return {
      text,
      details: {
        version: 1,
        mode:
          result.kind === "outline" || result.kind === "imports" || result.kind === "tests"
            ? result.kind
            : "matches",
        status: result.partial ? "partial" : "complete",
        snapshotComplete: !result.partial,
        totalMatches: 0,
        storedMatches: 0,
        returnedMatches: 0,
        totalFiles: new Set(result.items.map((item) => item.path)).size,
        cursor: nextRequest?.cursor ?? `${stored.id}.analysis.0`,
        ...(nextRequest ? { nextRequest } : {}),
        analysis: {
          kind: result.kind,
          unit: result.unit,
          totalItems: result.items.length,
          returnedItems: items.length,
          items,
          reasons: result.reasons,
          ...(result.filesRead !== undefined ? { filesRead: result.filesRead } : {}),
          ...(result.bytesRead !== undefined ? { bytesRead: result.bytesRead } : {}),
          ...(result.changes ? { changes: result.changes } : {}),
          ...(result.counts ? { counts: result.counts } : {}),
        },
      },
    };
  }

  #expire(): void {
    for (const [id, item] of this.#items)
      if (this.#now() - item.touched >= ANALYSIS_TTL_MS) this.#items.delete(id);
  }
  #totalBytes(): number {
    return [...this.#items.values()].reduce((n, item) => n + item.bytes, 0);
  }
  #totalItems(): number {
    return [...this.#items.values()].reduce((n, item) => n + item.result.items.length, 0);
  }
}
