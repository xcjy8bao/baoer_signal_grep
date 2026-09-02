import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRipgrepArguments, createRipgrepRunner } from "../src/rg.js";
import type { SearchRequest } from "../src/types.js";
import { createTodoFixture, removeFixture } from "./helpers.js";

const request: SearchRequest = {
  pattern: "TODO",
  glob: [],
  exclude: [],
  literal: false,
  hidden: true,
  context: 0,
  pageSize: 20,
};

describe("ripgrep runner", () => {
  test("always excludes Git internals while retaining hidden search", () => {
    const args = buildRipgrepArguments(request, "/repo");
    expect(args).toContain("--hidden");
    expect(args).toContain("!.git/**");
    expect(args).toContain("!**/.git/**");
    expect(args.slice(-3)).toEqual(["--", "TODO", "."]);
    expect(buildRipgrepArguments({ ...request, path: "src" }, "/repo").slice(-1)).toEqual(["src"]);
  });

  test("counts every match while retaining only the configured bound", async () => {
    const root = await createTodoFixture();
    try {
      const result = await createRipgrepRunner({ maxStoredMatches: 3 })(request, root);
      expect(result.totalMatches).toBe(33);
      expect(result.matches).toHaveLength(3);
      expect(result.snapshotComplete).toBe(false);
      expect([...result.fileCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(33);
    } finally {
      await removeFixture(root);
    }
  });

  test("keeps every same-line occurrence with byte and UTF-16 ranges", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(join(root, "unicode.ts"), "prefix\n前😀 needle needle\n");
      const result = await createRipgrepRunner()(
        { ...request, pattern: "needle", literal: true },
        root,
      );
      const match = result.matches.find((candidate) => candidate.displayPath === "unicode.ts");
      expect(match?.occurrences).toEqual([
        {
          byteStart: 8,
          byteEnd: 14,
          range: {
            start: { line: 1, character: 4 },
            end: { line: 1, character: 10 },
            encoding: "utf-16",
          },
        },
        {
          byteStart: 15,
          byteEnd: 21,
          range: {
            start: { line: 1, character: 11 },
            end: { line: 1, character: 17 },
            encoding: "utf-16",
          },
        },
      ]);
    } finally {
      await removeFixture(root);
    }
  });

  test("maps columns against normalized text when CR appears inside a line", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(join(root, "cr.txt"), "aaa\rNEEDLE\rbbb\n");
      const result = await createRipgrepRunner()(
        { ...request, pattern: "NEEDLE", literal: true },
        root,
      );
      const match = result.matches.find((candidate) => candidate.displayPath === "cr.txt");
      expect(match?.occurrences[0]?.range).toEqual({
        start: { line: 0, character: 3 },
        end: { line: 0, character: 9 },
        encoding: "utf-16",
      });
    } finally {
      await removeFixture(root);
    }
  });

  test("keeps raw UTF-8 byte ranges for non-UTF-8 text", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(join(root, "bytes.txt"), Buffer.from([0xff, ...Buffer.from("needle\n")]));
      const result = await createRipgrepRunner()(
        { ...request, pattern: "needle", literal: true },
        root,
      );
      const match = result.matches.find((candidate) => candidate.displayPath === "bytes.txt");
      expect(match?.occurrences[0]?.range).toEqual({
        start: { line: 0, character: 1 },
        end: { line: 0, character: 7 },
        encoding: "utf-8",
      });
    } finally {
      await removeFixture(root);
    }
  });

  test("rejects search paths outside the working directory", () => {
    expect(() => buildRipgrepArguments({ ...request, path: ".." }, "/repo/project")).toThrow(
      "Search path must stay within the working directory",
    );
    expect(() =>
      buildRipgrepArguments({ ...request, path: "../outside" }, "/repo/project"),
    ).toThrow("Search path must stay within the working directory");
  });

  test("rejects explicit Git internals even though ripgrep would bypass file globs", () => {
    for (const path of [".git", ".git/config", "nested/.git/HEAD"]) {
      expect(() => buildRipgrepArguments({ ...request, path }, "/repo/project")).toThrow(
        "Git internals are excluded from search",
      );
    }
  });

  test("bounds candidate revisions without limiting the actual matching set", async () => {
    const root = await createTodoFixture();
    try {
      const scan = await createRipgrepRunner({ maxSourceRevisionFiles: 1 })(request, root);
      expect(scan.totalMatches).toBe(33);
      expect(scan.snapshotComplete).toBe(true);
      expect(scan.sourceRevisions.size).toBe(1);
      expect(new Set(scan.matches.map((match) => match.absolutePath)).size).toBe(4);
    } finally {
      await removeFixture(root);
    }
  });

  test("cancels during asynchronous path validation before attempting to spawn", async () => {
    const root = await createTodoFixture();
    const controller = new AbortController();
    try {
      const operation = createRipgrepRunner({ executable: "must-not-start" })(
        request,
        root,
        controller.signal,
      );
      queueMicrotask(() => controller.abort());
      expect(operation).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      await removeFixture(root);
    }
  }, 5_000);

  test("fails immediately for an already aborted search", async () => {
    const controller = new AbortController();
    controller.abort();
    let failure: unknown;
    try {
      await createRipgrepRunner()(request, ".", controller.signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ name: "AbortError" });
  });
});
