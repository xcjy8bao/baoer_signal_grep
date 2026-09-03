import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CursorError } from "../src/errors.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { SnapshotStore } from "../src/snapshot-store.js";
import { createTodoFixture, removeFixture } from "./helpers.js";

async function cursorFailure(operation: Promise<unknown>): Promise<CursorError> {
  const error = await operation.catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(CursorError);
  if (!(error instanceof CursorError)) throw new Error("Expected CursorError");
  return error;
}

describe("cursor error contract", () => {
  test("distinguishes malformed, missing, wrong-kind and conflicting analysis cursors", async () => {
    const root = await createTodoFixture();
    try {
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
      expect((await cursorFailure(service.search({ cursor: "broken" }, root))).code).toBe(
        "E_CURSOR_MALFORMED",
      );
      expect(
        (await cursorFailure(service.search({ cursor: `${randomUUID()}.matches.0.all` }, root)))
          .code,
      ).toBe("E_CURSOR_NOT_FOUND");

      await writeFile(join(root, "terms.txt"), "alpha beta\n");
      const analysis = await service.search({ anyOf: ["alpha", "beta"] }, root);
      const cursor = analysis.details.cursor;
      if (!cursor) throw new Error("Expected analysis cursor");
      expect((await cursorFailure(service.search({ cursor, mode: "summary" }, root))).code).toBe(
        "E_CURSOR_WRONG_KIND",
      );
      expect((await cursorFailure(service.search({ cursor, pattern: "alpha" }, root))).code).toBe(
        "E_CURSOR_OPTIONS_CONFLICT",
      );
      expect(
        (
          await cursorFailure(
            service.search({ cursor: `${randomUUID()}.analysis.0`, mode: "summary" }, root),
          )
        ).code,
      ).toBe("E_CURSOR_NOT_FOUND");
      await service.shutdown();
    } finally {
      await removeFixture(root);
    }
  });

  test("distinguishes expired and invalid-offset snapshot cursors", () => {
    let now = 0;
    const store = new SnapshotStore({ ttlMs: 10, now: () => now });
    const snapshot = store.create({
      request: {
        pattern: "x",
        glob: [],
        exclude: [],
        literal: true,
        hidden: true,
        context: 0,
        pageSize: 1,
      },
      matches: [],
      totalMatches: 0,
      fileCounts: new Map(),
      sourceRevisions: new Map(),
      snapshotComplete: true,
      truncatedLines: 0,
    });
    const cursor = store.cursor(snapshot, 0);
    expect(() => store.resolve(`${snapshot.id}.matches.1.all`)).toThrow(
      expect.objectContaining({ code: "E_CURSOR_OFFSET_INVALID" }),
    );
    now = 11;
    expect(() => store.resolve(cursor)).toThrow(
      expect.objectContaining({ code: "E_CURSOR_EXPIRED" }),
    );
  });
});
