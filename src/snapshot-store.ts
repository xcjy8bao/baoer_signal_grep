import { randomUUID } from "node:crypto";
import { CursorError } from "./errors.js";
import type { SearchScan, SearchSnapshot } from "./types.js";

export type CursorKind = "matches" | "summary";

export interface SnapshotStoreOptions {
  ttlMs?: number;
  maxSnapshots?: number;
  maxTotalStoredMatches?: number;
  now?: () => number;
}

export interface ResolvedCursor {
  snapshot: SearchSnapshot;
  offset: number;
  kind: CursorKind;
  selectionKey: string;
}

export class SnapshotStore {
  readonly #snapshots = new Map<string, SearchSnapshot>();
  readonly #expired = new Set<string>();
  readonly #ttlMs: number;
  readonly #maxSnapshots: number;
  readonly #maxTotalStoredMatches: number;
  readonly #now: () => number;

  constructor(options: SnapshotStoreOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.#maxSnapshots = options.maxSnapshots ?? 20;
    this.#maxTotalStoredMatches = options.maxTotalStoredMatches ?? 100_000;
    this.#now = options.now ?? Date.now;
  }

  create(scan: SearchScan): SearchSnapshot {
    this.sweep();
    const now = this.#now();
    const snapshot: SearchSnapshot = {
      ...scan,
      id: randomUUID(),
      createdAt: now,
      lastAccessedAt: now,
    };
    this.#snapshots.set(snapshot.id, snapshot);
    this.#evictToBounds();
    return snapshot;
  }

  cursor(
    snapshot: SearchSnapshot,
    offset: number,
    kind: CursorKind = "matches",
    selectionKey = "all",
  ): string {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new CursorError(
        "Cannot create a cursor with an invalid offset",
        "E_CURSOR_OFFSET_INVALID",
      );
    }
    if (!/^(?:all|[0-9a-f]{16})$/.test(selectionKey)) {
      throw new CursorError("Cannot create a cursor with an invalid selection key");
    }
    return `${snapshot.id}.${kind}.${offset.toString(36)}.${selectionKey}`;
  }

  resolve(cursor: string): ResolvedCursor {
    this.sweep();
    const parts = cursor.match(/^(.+)\.(matches|summary)\.([0-9a-z]+)\.(all|[0-9a-f]{16})$/);
    if (!parts) {
      throw new CursorError(
        "Invalid cursor. Start a new search to obtain a fresh cursor.",
        "E_CURSOR_MALFORMED",
      );
    }
    const [, id, rawKind, rawOffset, selectionKey] = parts;
    if (!id || !rawKind || !rawOffset || !selectionKey) {
      throw new CursorError(
        "Invalid cursor. Start a new search to obtain a fresh cursor.",
        "E_CURSOR_MALFORMED",
      );
    }
    const kind: CursorKind = rawKind === "summary" ? "summary" : "matches";

    const offset = Number.parseInt(rawOffset, 36);
    const snapshot = this.#snapshots.get(id);
    if (!snapshot)
      throw new CursorError(
        this.#expired.has(id)
          ? "Cursor expired or was evicted. Run the search again."
          : "Cursor was not found. Run the search again.",
        this.#expired.has(id) ? "E_CURSOR_EXPIRED" : "E_CURSOR_NOT_FOUND",
      );
    const maximumOffset = kind === "summary" ? snapshot.fileCounts.size : snapshot.matches.length;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximumOffset) {
      throw new CursorError(
        "Cursor offset is outside the retained search snapshot.",
        "E_CURSOR_OFFSET_INVALID",
      );
    }

    snapshot.lastAccessedAt = this.#now();
    return { snapshot, offset, kind, selectionKey };
  }

  delete(snapshot: SearchSnapshot): boolean {
    return this.#snapshots.delete(snapshot.id);
  }

  clear(): void {
    for (const id of this.#snapshots.keys()) this.#rememberExpired(id);
    this.#snapshots.clear();
  }

  sweep(): void {
    const cutoff = this.#now() - this.#ttlMs;
    for (const [id, snapshot] of this.#snapshots) {
      if (snapshot.lastAccessedAt < cutoff) {
        this.#snapshots.delete(id);
        this.#rememberExpired(id);
      }
    }
  }

  get size(): number {
    this.sweep();
    return this.#snapshots.size;
  }

  get storedMatches(): number {
    this.sweep();
    return this.#totalStoredMatches();
  }

  #evictToBounds(): void {
    while (
      this.#snapshots.size > this.#maxSnapshots ||
      this.#totalStoredMatches() > this.#maxTotalStoredMatches
    ) {
      let oldest: SearchSnapshot | undefined;
      for (const snapshot of this.#snapshots.values()) {
        if (!oldest || snapshot.lastAccessedAt < oldest.lastAccessedAt) oldest = snapshot;
      }
      if (!oldest) break;
      this.#snapshots.delete(oldest.id);
      this.#rememberExpired(oldest.id);
    }
  }

  #totalStoredMatches(): number {
    let total = 0;
    for (const snapshot of this.#snapshots.values()) total += snapshot.matches.length;
    return total;
  }

  #rememberExpired(id: string): void {
    this.#expired.add(id);
    while (this.#expired.size > this.#maxSnapshots * 4) {
      const oldest = this.#expired.values().next().value;
      if (oldest === undefined) break;
      this.#expired.delete(oldest);
    }
  }
}
