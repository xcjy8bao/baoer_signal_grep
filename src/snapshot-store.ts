import { randomUUID } from "node:crypto";
import { CursorError } from "./errors.js";
import type { SearchScan, SearchSnapshot } from "./types.js";

export interface SnapshotStoreOptions {
  ttlMs?: number;
  maxSnapshots?: number;
  maxTotalStoredMatches?: number;
  now?: () => number;
}

export interface ResolvedCursor {
  snapshot: SearchSnapshot;
  offset: number;
}

export class SnapshotStore {
  readonly #snapshots = new Map<string, SearchSnapshot>();
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

  cursor(snapshot: SearchSnapshot, offset: number): string {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new CursorError("Cannot create a cursor with an invalid offset");
    }
    return `${snapshot.id}.${offset.toString(36)}`;
  }

  resolve(cursor: string): ResolvedCursor {
    this.sweep();
    const separator = cursor.lastIndexOf(".");
    if (separator <= 0 || separator === cursor.length - 1) {
      throw new CursorError("Invalid cursor. Start a new search to obtain a fresh cursor.");
    }

    const id = cursor.slice(0, separator);
    const rawOffset = cursor.slice(separator + 1);
    if (!/^[0-9a-z]+$/.test(rawOffset)) {
      throw new CursorError("Invalid cursor. Start a new search to obtain a fresh cursor.");
    }

    const offset = Number.parseInt(rawOffset, 36);
    const snapshot = this.#snapshots.get(id);
    if (!snapshot) {
      throw new CursorError("Cursor expired or was evicted. Run the search again.");
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.matches.length) {
      throw new CursorError("Cursor offset is outside the retained search snapshot.");
    }

    snapshot.lastAccessedAt = this.#now();
    return { snapshot, offset };
  }

  clear(): void {
    this.#snapshots.clear();
  }

  sweep(): void {
    const cutoff = this.#now() - this.#ttlMs;
    for (const [id, snapshot] of this.#snapshots) {
      if (snapshot.lastAccessedAt < cutoff) this.#snapshots.delete(id);
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
    }
  }

  #totalStoredMatches(): number {
    let total = 0;
    for (const snapshot of this.#snapshots.values()) total += snapshot.matches.length;
    return total;
  }
}
