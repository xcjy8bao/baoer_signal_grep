import { randomUUID } from "node:crypto";
import {
  ANALYSIS_TTL_MS,
  ANALYSIS_METADATA_RESERVE_BYTES,
  MAX_ANALYSIS_REASON_BYTES,
  MAX_ANALYSIS_REASONS,
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

export type RetainedAnalysisSummary = (
  items: readonly AnalysisItem[],
) => Pick<AnalysisResultSet, "counts" | "termCounts">;
export type AnalysisRetentionPriority = (item: AnalysisItem) => number;

function boundedReasons(reasons: readonly string[]): string[] {
  const unsupportedSuffix = ": syntax unsupported; this source remains unclassified";
  const unsupported = reasons
    .filter((reason) => reason.endsWith(unsupportedSuffix))
    .map((reason) => reason.slice(0, -unsupportedSuffix.length));
  const unique = [
    ...new Set(reasons.filter((reason) => !reason.endsWith(unsupportedSuffix))),
    ...(unsupported.length
      ? [
          `${String(unsupported.length)} matching file(s) skipped because syntax is unsupported${unsupported.length ? `; examples: ${unsupported.slice(0, 3).join(", ")}` : ""}`,
        ]
      : []),
  ];
  const retained: string[] = [];
  let bytes = 2;
  let omitted = 0;
  for (const reason of unique) {
    const reasonBytes = Buffer.byteLength(JSON.stringify(reason)) + 1;
    if (
      retained.length >= MAX_ANALYSIS_REASONS ||
      bytes + reasonBytes > MAX_ANALYSIS_REASON_BYTES
    ) {
      omitted += 1;
      continue;
    }
    retained.push(reason);
    bytes += reasonBytes;
  }
  if (omitted === 0) return retained;
  let notice = `${String(omitted)} additional analysis reasons omitted within the ${String(MAX_ANALYSIS_REASONS)}-reason / ${String(MAX_ANALYSIS_REASON_BYTES)}-byte diagnostic limit`;
  while (
    retained.length > 0 &&
    bytes + Buffer.byteLength(JSON.stringify(notice)) + 1 > MAX_ANALYSIS_REASON_BYTES
  ) {
    const removed = retained.pop();
    if (removed === undefined) break;
    bytes -= Buffer.byteLength(JSON.stringify(removed)) + 1;
    omitted += 1;
    notice = `${String(omitted)} additional analysis reasons omitted within the ${String(MAX_ANALYSIS_REASONS)}-reason / ${String(MAX_ANALYSIS_REASON_BYTES)}-byte diagnostic limit`;
  }
  retained.push(notice);
  return retained;
}

/** Stores only bounded display evidence and version references, never syntax trees. */
export class AnalysisStore {
  readonly #items = new Map<string, StoredAnalysis>();
  readonly #expired = new Set<string>();
  readonly #now: () => number;
  constructor(now: () => number = Date.now) {
    this.#now = now;
  }
  clear(): void {
    for (const id of this.#items.keys()) this.#rememberExpired(id);
    this.#items.clear();
  }

  create(
    result: AnalysisResultSet,
    summarize?: RetainedAnalysisSummary,
    retentionPriority?: AnalysisRetentionPriority,
  ): string {
    this.#expire();
    const bounded: AnalysisResultSet = {
      ...result,
      reasons: boundedReasons(result.reasons),
      items: [],
      coverage: { ...result.coverage, retention: "complete" },
    };
    let bytes = Buffer.byteLength(JSON.stringify(bounded));
    const candidates = result.items
      .map((item, index) => ({ item, index }))
      .toSorted(
        (left, right) =>
          (retentionPriority?.(left.item) ?? 0) - (retentionPriority?.(right.item) ?? 0) ||
          left.index - right.index,
      );
    const retainedIndices: number[] = [];
    const rebuildItems = (): void => {
      const retained = new Set(retainedIndices);
      bounded.items = result.items
        .filter((_item, index) => retained.has(index))
        .map((item) => structuredClone(item));
    };
    for (const candidate of candidates) {
      const { item } = candidate;
      const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
      if (
        retainedIndices.length >= MAX_ANALYSIS_RESULTS ||
        bytes + itemBytes > MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES
      ) {
        bounded.partial = true;
        if (bounded.coverage) bounded.coverage.retention = "partial";
        bounded.reasons.push("Analysis storage limit: 50,000 items / 32 MiB; narrow the query");
        break;
      }
      retainedIndices.push(candidate.index);
      bytes += itemBytes;
    }
    rebuildItems();
    if (summarize) Object.assign(bounded, summarize(bounded.items));
    bytes = Buffer.byteLength(JSON.stringify(bounded));
    while (bytes > MAX_ANALYSIS_STORAGE_BYTES - 1024 && bounded.items.length > 0) {
      retainedIndices.pop();
      rebuildItems();
      bounded.partial = true;
      if (bounded.coverage) bounded.coverage.retention = "partial";
      if (
        !bounded.reasons.includes("Analysis storage limit: 50,000 items / 32 MiB; narrow the query")
      )
        bounded.reasons.push("Analysis storage limit: 50,000 items / 32 MiB; narrow the query");
      if (summarize) Object.assign(bounded, summarize(bounded.items));
      bytes = Buffer.byteLength(JSON.stringify(bounded));
    }
    bounded.reasons = boundedReasons(bounded.reasons);
    bytes = Buffer.byteLength(JSON.stringify(bounded));
    if (bytes > MAX_ANALYSIS_STORAGE_BYTES - 1024)
      throw new SignalGrepError("Analysis metadata exceeds the storage budget");
    while (
      this.#items.size >= MAX_ANALYSIS_SNAPSHOTS ||
      this.#totalBytes() + bytes > MAX_ANALYSIS_STORAGE_BYTES ||
      this.#totalItems() + bounded.items.length > MAX_ANALYSIS_RESULTS
    ) {
      const oldest = [...this.#items.values()].toSorted((a, b) => a.touched - b.touched)[0];
      if (!oldest) throw new SignalGrepError("Analysis metadata exceeds the storage budget");
      this.#items.delete(oldest.id);
      this.#rememberExpired(oldest.id);
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
      throw new CursorError(
        this.#expired.has(id)
          ? "Analysis cursor expired or was evicted; run the query again"
          : "Analysis cursor was not found; run the query again",
        this.#expired.has(id) ? "E_CURSOR_EXPIRED" : "E_CURSOR_NOT_FOUND",
      );
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset.toString(36) !== rawOffset ||
      offset > stored.result.items.length
    )
      throw new CursorError("Invalid analysis offset", "E_CURSOR_OFFSET_INVALID");
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
    const scope = result.scope
      ? ` Scope: ${result.scope.assertion === "project-wide" ? "project root" : "requested path"} ${JSON.stringify(result.scope.path)}${result.scope.expandedToProjectRoot ? `, expanded after ${JSON.stringify(result.scope.requestedPath)} had no matches` : ""}.`
      : "";
    const coverage = result.coverage ? ` Coverage: ${JSON.stringify(result.coverage)}.` : "";
    const stats = result.stats ? ` Stats: ${JSON.stringify(result.stats)}.` : "";
    const header = `${result.kind}: ${result.items.length} retained ${result.unit} (${result.partial ? "PARTIAL" : "complete"}). ${result.counts ? `Counts: ${JSON.stringify(result.counts)}. ` : ""}${result.termCounts ? `Term counts: ${JSON.stringify(result.termCounts)}. ` : ""}Counts use ${result.unit}; they are not ordinary matching-line counts.${scope}${coverage}${stats}`;
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
          ? {
              mode: "inspect" as const,
              cursor: `${stored.id}.analysis.0`,
              matchIndex: index + 1,
              ...(result.redact ? { redact: true } : {}),
            }
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
        ? {
            cursor: `${stored.id}.analysis.${next.toString(36)}`,
            ...(result.redact ? { redact: true } : {}),
          }
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
          result.kind === "outline" ||
          result.kind === "imports" ||
          result.kind === "tests" ||
          result.kind === "impact"
            ? result.kind
            : "matches",
        status: result.partial ? "partial" : "complete",
        snapshotComplete: !result.partial,
        totalMatches: result.items.length,
        storedMatches: result.items.length,
        returnedMatches: items.length,
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
          ...(result.termCounts ? { termCounts: result.termCounts } : {}),
          ...(result.scope ? { scope: result.scope } : {}),
          ...(result.chunks !== undefined ? { chunks: result.chunks } : {}),
          ...(result.coverage ? { coverage: result.coverage } : {}),
          ...(result.stats ? { stats: result.stats } : {}),
        },
        ...(result.scope ? { scope: result.scope } : {}),
        ...(result.redact ? { redactionRequested: true } : {}),
      },
    };
  }

  #expire(): void {
    for (const [id, item] of this.#items)
      if (this.#now() - item.touched >= ANALYSIS_TTL_MS) {
        this.#items.delete(id);
        this.#rememberExpired(id);
      }
  }
  #totalBytes(): number {
    return [...this.#items.values()].reduce((n, item) => n + item.bytes, 0);
  }
  #totalItems(): number {
    return [...this.#items.values()].reduce((n, item) => n + item.result.items.length, 0);
  }
  #rememberExpired(id: string): void {
    this.#expired.add(id);
    while (this.#expired.size > MAX_ANALYSIS_SNAPSHOTS * 4) {
      const oldest = this.#expired.values().next().value;
      if (oldest === undefined) break;
      this.#expired.delete(oldest);
    }
  }
}
