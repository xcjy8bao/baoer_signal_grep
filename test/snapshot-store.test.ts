import { describe, expect, test } from "bun:test";
import { CursorError } from "../src/errors.js";
import { SnapshotStore } from "../src/snapshot-store.js";
import type { SearchScan } from "../src/types.js";

function scan(matchCount = 1): SearchScan {
  return {
    request: {
      pattern: "TODO",
      glob: [],
      exclude: [],
      literal: false,
      hidden: true,
      context: 0,
      pageSize: 20,
    },
    matches: Array.from({ length: matchCount }, (_, index) => ({
      absolutePath: `/repo/file-${index}.ts`,
      displayPath: `file-${index}.ts`,
      lineNumber: 1,
      lineContent: "TODO",
      lineTruncated: false,
      occurrences: [],
    })),
    totalMatches: matchCount,
    fileCounts: new Map([["file.ts", matchCount]]),
    sourceRevisions: new Map(),
    snapshotComplete: true,
    truncatedLines: 0,
  };
}

describe("SnapshotStore", () => {
  test("round-trips an opaque cursor", () => {
    const store = new SnapshotStore();
    const snapshot = store.create(scan(3));
    const resolved = store.resolve(store.cursor(snapshot, 2));
    expect(resolved.snapshot.id).toBe(snapshot.id);
    expect(resolved.offset).toBe(2);
    expect(resolved.kind).toBe("matches");
    const summary = store.resolve(store.cursor(snapshot, 1, "summary"));
    expect(summary).toMatchObject({ offset: 1, kind: "summary" });
  });

  test("expires cursors by last access", () => {
    let now = 100;
    const store = new SnapshotStore({ ttlMs: 10, now: () => now });
    const snapshot = store.create(scan());
    const cursor = store.cursor(snapshot, 0);
    now = 111;
    expect(() => store.resolve(cursor)).toThrow(CursorError);
  });

  test("evicts oldest snapshots to enforce the shared match budget", () => {
    let now = 0;
    const store = new SnapshotStore({ maxTotalStoredMatches: 3, now: () => now });
    const first = store.create(scan(2));
    const firstCursor = store.cursor(first, 0);
    now = 1;
    store.create(scan(2));
    expect(() => store.resolve(firstCursor)).toThrow(CursorError);
    expect(store.storedMatches).toBe(2);
  });
});
