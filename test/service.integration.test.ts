import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estimateTextTokens } from "../src/metrics.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import type { SignalGrepResult } from "../src/types.js";
import { createTodoFixture, extractMatchIds, removeFixture } from "./helpers.js";

const fixtures = new Set<string>();

afterEach(async () => {
  await Promise.all([...fixtures].map(removeFixture));
  fixtures.clear();
});

async function fixture(): Promise<string> {
  const root = await createTodoFixture();
  fixtures.add(root);
  return root;
}

describe("SignalGrepService with ripgrep", () => {
  test("inspects the enclosing code block without rerunning a search", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "client.ts"),
      "export class Client {\n  request() {\n    return true;\n  }\n}\n",
    );
    let providerCalls = 0;
    let scans = 0;
    const runner = createRipgrepRunner();
    const service = new SignalGrepService({
      runRipgrep: (...args) => {
        scans += 1;
        return runner(...args);
      },
      structure: {
        inspect: async () => {
          providerCalls += 1;
          return {
            details: {
              status: "available",
              provider: "test-provider",
              language: "TypeScript",
              symbol: {
                name: "request",
                kind: "method",
                scope: ["Client"],
                range: { startLine: 2, endLine: 4 },
              },
              range: { startLine: 2, endLine: 4 },
            },
          };
        },
      },
    });

    const result = await service.search({ mode: "inspect", path: "client.ts", line: 3 }, root);
    expect(providerCalls).toBe(0);
    expect(scans).toBe(0);
    expect(result.text).toContain("request (method_definition) lines 2-4");
    expect(result.text).toContain("request() {");
    expect(result.text).toContain("[structure: available via tree-sitter]");
    expect(result.details.structure).toMatchObject({
      status: "available",
      provider: "tree-sitter",
      symbol: { scope: ["Client"], range: { startLine: 2, endLine: 4 } },
    });
    expect(result.details.source?.complete).toBe(true);
    expect(result.details.source?.fragments?.map((fragment) => fragment.text).join("")).toBe(
      "request() {\n    return true;\n  }",
    );
  });

  test("returns a compact complete search directly instead of forcing an extra turn", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "TODO" }, root);

    expect(result.details).toMatchObject({
      mode: "auto",
      status: "complete",
      totalMatches: 33,
      totalFiles: 4,
      returnedMatches: 33,
      snapshotComplete: true,
    });
    expect(extractMatchIds(result.text)).toHaveLength(33);
    expect(result.text).toContain("Matches 1-33 of 33; complete snapshot");
    expect(result.text).toContain("[1-4]");
    expect(result.text).toContain("Match columns are 1-based UTF-16 positions.");
    expect(result.details.cursor).toBeUndefined();
    expect(service.snapshotCount).toBe(0);
  });

  test("summarizes a search whose complete details exceed the adaptive budget", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "broad.ts"),
      `${Array.from({ length: 20 }, (_, index) => `// TODO broad ${index} ${"x".repeat(600)}`).join("\n")}\n`,
    );
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "TODO" }, root);

    expect(result.details).toMatchObject({
      mode: "auto",
      status: "complete",
      totalMatches: 53,
      returnedMatches: 0,
    });
    expect(result.text).toContain("53 matches across 5 files (complete snapshot)");
    expect(result.details.cursor).toBeString();
  });

  test("rejects search options that would be silently ignored with a cursor", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "broad.ts"),
      `${Array.from({ length: 20 }, (_, index) => `// TODO broad ${index} ${"x".repeat(600)}`).join("\n")}\n`,
    );
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "TODO" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");

    let failure: unknown;
    try {
      await service.search({ cursor, limit: 1 }, root);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      message: "The following options cannot be used with cursor: limit",
    });
  });

  test("selects one file from a summary cursor without rerunning ripgrep", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "broad.ts"),
      `${Array.from({ length: 20 }, (_, index) => `// TODO broad ${index} ${"x".repeat(600)}`).join("\n")}\n`,
    );
    let scans = 0;
    const service = new SignalGrepService({
      runRipgrep: async (request, cwd, signal) => {
        scans += 1;
        return createRipgrepRunner()(request, cwd, signal);
      },
    });
    const summary = await service.search({ pattern: "TODO" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");

    const selectedIds: string[] = [];
    let selected = await service.search({ cursor, path: "broad.ts" }, root);
    while (true) {
      selectedIds.push(...extractMatchIds(selected.text));
      const nextCursor = selected.details.cursor;
      if (!nextCursor) break;
      // A filtered continuation must carry the same path selector.
      // oxlint-disable-next-line no-await-in-loop -- cursor pages are sequential by contract.
      selected = await service.search({ cursor: nextCursor, path: "broad.ts" }, root);
    }
    expect(scans).toBe(1);
    expect(selectedIds).toHaveLength(20);
    expect(selectedIds.every((id) => id.startsWith("broad.ts:"))).toBe(true);
    expect(selectedIds).toEqual([...new Set(selectedIds)]);
  });

  test("honors an explicit auto-mode limit with immediate details and a cursor", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "TODO", limit: 20 }, root);

    expect(result.details).toMatchObject({
      mode: "auto",
      totalMatches: 33,
      returnedMatches: 20,
    });
    expect(extractMatchIds(result.text)).toHaveLength(20);
    expect(result.details.cursor).toBeString();
  });

  test("paginates the stable snapshot without omissions or duplicates", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const pages: string[] = [];
    let result = await service.search({ pattern: "TODO", mode: "matches", limit: 20 }, root);

    while (true) {
      pages.push(result.text);
      const cursor = result.details.cursor;
      if (!cursor) break;
      // Cursor pages depend on the previous page and therefore cannot execute in parallel.
      // oxlint-disable-next-line no-await-in-loop
      result = await service.search({ cursor }, root);
    }

    const firstPage = extractMatchIds(pages[0] ?? "");
    const allMatches = pages.flatMap(extractMatchIds);
    expect(firstPage).toHaveLength(20);
    expect(allMatches).toHaveLength(33);
    expect(new Set(allMatches).size).toBe(33);
    expect(allMatches.filter((id) => id.startsWith("noise.ts:"))).toHaveLength(30);
    expect(pages.at(-1)).toContain("Matches 21-33 of 33; complete snapshot");
    expect(service.snapshotCount).toBe(0);
  });

  test("includes meaningful hidden files, excludes .git, and respects .gitignore", async () => {
    const root = await fixture();
    await mkdir(join(root, ".git", "hooks"), { recursive: true });
    await writeFile(join(root, ".git", "hooks", "sample"), "TODO git internals\n");
    await writeFile(join(root, ".hidden.ts"), "TODO hidden\n");
    await writeFile(join(root, ".gitignore"), "ignored.ts\n");
    await writeFile(join(root, "ignored.ts"), "TODO ignored\n");

    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "TODO", mode: "summary" }, root);

    expect(result.details.totalMatches).toBe(34);
    expect(result.text).toContain(".hidden.ts");
    expect(result.text).not.toContain(".git/hooks");
    expect(result.text).not.toContain("ignored.ts");
  });

  test("merges overlapping context lines without repeating nearby matches", async () => {
    const root = await fixture();
    await writeFile(join(root, "cluster.ts"), "before\nTODO first\nTODO second\nafter\n");
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search(
      { pattern: "TODO", path: "cluster.ts", context: 1, mode: "matches" },
      root,
    );

    const lines = result.text.split("\n").filter((line) => line.includes("TODO"));
    expect(lines).toHaveLength(2);
    expect(result.text.match(/ 3: TODO second/g)).toHaveLength(1);
  });

  test("does not repeat context lines across cursor pages", async () => {
    const root = await fixture();
    await writeFile(join(root, "cluster.ts"), "before\nTODO first\nTODO second\nafter\n");
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const first = await service.search(
      { pattern: "TODO", path: "cluster.ts", context: 1, limit: 1, mode: "matches" },
      root,
    );
    const cursor = first.details.cursor;
    if (!cursor) throw new Error("Expected a second context page");
    const second = await service.search({ cursor }, root);

    expect(first.text).toContain("TODO first");
    expect(first.text).not.toContain("TODO second");
    expect(second.text).toContain("TODO second");
    expect(second.text).not.toContain("before");
  });

  test("rejects inspection when a retained source file changed", async () => {
    const root = await fixture();
    await writeFile(join(root, "client.ts"), "needle\nneedle again\n");
    const service = new SignalGrepService({
      runRipgrep: createRipgrepRunner(),
      structure: {
        inspect: async ({ expectedRevision }) => ({
          details: expectedRevision
            ? { status: "source-changed" as const }
            : { status: "available" as const },
        }),
      },
    });
    const search = await service.search({ pattern: "needle", path: "client.ts", limit: 1 }, root);
    const cursor = search.details.cursor;
    if (!cursor) throw new Error("Expected a retained cursor");
    await writeFile(join(root, "client.ts"), "changed\nneedle again\n");

    const result = await service.search(
      { mode: "inspect", cursor, path: "client.ts", line: 1 },
      root,
    );
    expect(result.details.structure).toMatchObject({ status: "source-changed" });
    expect(result.text).toContain("refresh the search");
  });

  test("keeps summaries with unusually long paths inside the adaptive character budget", async () => {
    const files = Array.from(
      { length: 30 },
      (_, index) => `${String(index).padStart(2, "0")}-${"nested/".repeat(90)}file.ts`,
    );
    const service = new SignalGrepService({
      runRipgrep: async (request) => ({
        request,
        matches: files.map((displayPath, index) => ({
          absolutePath: `/tmp/${displayPath}`,
          displayPath,
          lineNumber: index + 1,
          lineContent: "TODO",
          lineTruncated: false,
          occurrences: [],
        })),
        totalMatches: files.length,
        fileCounts: new Map(files.map((file) => [file, 1])),
        sourceRevisions: new Map(),
        snapshotComplete: true,
        truncatedLines: 0,
      }),
      summaryFileLimit: 30,
    });

    const result = await service.search({ pattern: "TODO", mode: "summary" }, "/tmp");
    expect(estimateTextTokens(result.text)).toBeLessThanOrEqual(2_200);
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
    expect(result.details.summaryFilesShown).toBeLessThan(30);
    expect(result.details.summaryFilesOmitted).toBeGreaterThan(0);
  });

  test("keeps detail output within the byte budget and reports omitted context", async () => {
    const root = await fixture();
    const longLine = `${"x".repeat(600)}\n`;
    await writeFile(
      join(root, "large-context.ts"),
      `${longLine.repeat(20)}TODO target\n${longLine.repeat(20)}`,
    );

    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search(
      { pattern: "TODO target", literal: true, context: 20, mode: "matches" },
      root,
    );

    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
    expect(result.details.contextOmittedFiles).toContain("large-context.ts");
    expect(result.text).toContain("TODO target");
  });

  test("honors cancellation while continuing a retained snapshot", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "TODO", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");
    const controller = new AbortController();
    controller.abort();

    let failure: unknown;
    try {
      await service.search({ cursor }, root, controller.signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ name: "AbortError" });

    const retry = await service.search({ cursor }, root);
    expect(retry.details.returnedMatches).toBe(33);
    expect(retry.details.cursor).toBeUndefined();
    expect(service.snapshotCount).toBe(1);
    service.clear();
    expect(service.snapshotCount).toBe(0);
  });

  test("marks a bounded snapshot partial instead of claiming completeness", async () => {
    const root = await fixture();
    const service = new SignalGrepService({
      runRipgrep: createRipgrepRunner({ maxStoredMatches: 3 }),
    });
    const result = await service.search({ pattern: "TODO" }, root);

    expect(result.details).toMatchObject({
      status: "partial",
      totalMatches: 33,
      storedMatches: 3,
      snapshotComplete: false,
    });
    expect(result.text).toContain("PARTIAL snapshot: retained 3 of 33 matches");
  });

  test("keeps a distant long-line match visible with absolute occurrence columns", async () => {
    const root = await fixture();
    await writeFile(join(root, "long-line.ts"), `${"x".repeat(900)}NEEDLE${"y".repeat(100)}\n`);
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });

    const result = await service.search(
      { pattern: "NEEDLE", path: "long-line.ts", mode: "matches" },
      root,
    );

    expect(result.text).toContain("NEEDLE");
    expect(result.text).toContain("[901-906]");
    expect(result.details.lineContentTruncated).toBe(1);
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
  });

  test("orders file summaries by match count and pages them without rescanning", async () => {
    const root = await fixture();
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        writeFile(join(root, `rank-${String(index).padStart(2, "0")}.ts`), "needle\n"),
      ),
    );
    await writeFile(
      join(root, "z-heavy.ts"),
      `${Array.from({ length: 40 }, () => "needle").join("\n")}\n`,
    );
    let scans = 0;
    const service = new SignalGrepService({
      runRipgrep: async (request, cwd, signal) => {
        scans += 1;
        return createRipgrepRunner()(request, cwd, signal);
      },
      summaryFileLimit: 10,
    });

    const first = await service.search({ pattern: "needle", mode: "summary" }, root);
    const cursor = first.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");
    const second = await service.search({ cursor, mode: "summary" }, root);
    const secondCursor = second.details.cursor;
    if (!secondCursor) throw new Error("Expected second summary cursor");
    const third = await service.search({ cursor: secondCursor, mode: "summary" }, root);
    const finalSummaryCursor = third.details.cursor;
    if (!finalSummaryCursor) throw new Error("Expected reusable final summary cursor");
    const details = await service.search({ cursor }, root);

    expect(first.text.indexOf("z-heavy.ts")).toBeLessThan(first.text.indexOf("rank-00.ts"));
    expect(first.text).toContain("Files 1-10 of 26, ordered by match count");
    expect(second.text).toContain("Files 11-20 of 26, ordered by match count");
    expect(second.details.summaryOffset).toBe(10);
    const summarizedFiles = [first, second, third].flatMap((result) =>
      result.text
        .split("\n")
        .filter((line) => /^(?:rank-\d{2}|z-heavy)\.ts\s+\d+$/.test(line))
        .map((line) => line.split(/\s+/)[0] ?? ""),
    );
    expect(summarizedFiles).toHaveLength(26);
    expect(new Set(summarizedFiles).size).toBe(26);
    expect(third.text).toContain("Files 21-26 of 26, ordered by match count");
    expect(third.details.summaryFilesOmitted).toBe(0);
    expect(service.search({ cursor: finalSummaryCursor, mode: "summary" }, root)).rejects.toThrow(
      "already at the end of the file summary",
    );
    expect(details.text).toContain("{match #1}");
    expect(scans).toBe(1);
  });

  test("reuses one summary cursor for repeated and batched file selections", async () => {
    const root = await fixture();
    let scans = 0;
    const service = new SignalGrepService({
      runRipgrep: async (request, cwd, signal) => {
        scans += 1;
        return createRipgrepRunner()(request, cwd, signal);
      },
    });
    const summary = await service.search({ pattern: "TODO", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");

    const readme = await service.search({ cursor, path: "README.md" }, root);
    const utils = await service.search({ cursor, path: "utils.ts" }, root);
    const batch = await service.search(
      { cursor, paths: ["README.md", "utils.ts", "missing.ts"] },
      root,
    );

    expect(readme.text).toContain("README.md");
    expect(utils.text).toContain("utils.ts");
    expect(batch.text).toContain("README.md");
    expect(batch.text).toContain("utils.ts");
    expect(batch.details.selectedPaths).toEqual(["README.md", "utils.ts", "missing.ts"]);
    expect(batch.details.selectionMissingPaths).toEqual(["missing.ts"]);
    expect(batch.text).toContain("1 selected path(s) had no retained matches");
    expect(service.snapshotCount).toBe(1);
    expect(scans).toBe(1);
  });

  test("keeps the original summary cursor after exhausting unfiltered detail pages", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "many.ts"),
      `${Array.from({ length: 130 }, (_, index) => `needle ${String(index)}`).join("\n")}\n`,
    );
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "needle", mode: "summary" }, root);
    const summaryCursor = summary.details.cursor;
    if (!summaryCursor) throw new Error("Expected summary cursor");

    const firstPage = await service.search({ cursor: summaryCursor }, root);
    const matchCursor = firstPage.details.cursor;
    if (!matchCursor) throw new Error("Expected match cursor");
    const finalPage = await service.search({ cursor: matchCursor }, root);
    expect(finalPage.details.cursor).toBeUndefined();

    const reused = await service.search({ cursor: summaryCursor, path: "many.ts" }, root);
    expect(reused.text).toContain("{match #1}");
    expect(service.snapshotCount).toBe(1);
  });

  test("inspects a retained match by its visible stable index", async () => {
    const root = await fixture();
    await writeFile(join(root, "indexed.ts"), "needle first\nneedle second\n");
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search(
      { pattern: "needle", path: "indexed.ts", mode: "summary" },
      root,
    );
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");
    const page = await service.search({ cursor }, root);
    const inspected = await service.search({ mode: "inspect", cursor, matchIndex: 2 }, root);

    expect(page.text).toContain("{match #1}");
    expect(page.text).toContain("{match #2}");
    expect(inspected.text).toContain("indexed.ts:2");
    expect(inspected.text).toContain("2: needle second");

    await writeFile(join(root, "indexed.ts"), "changed\nneedle second changed\n");
    const stale = await service.search({ mode: "inspect", cursor, matchIndex: 2 }, root);
    expect(stale.details.structure).toMatchObject({ status: "source-changed" });
  });

  test("rejects ambiguous or unbounded retained-navigation requests", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "TODO", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");

    expect(service.search({ pattern: "TODO", paths: ["utils.ts"] }, root)).rejects.toThrow(
      "paths can only select retained files from a cursor",
    );
    expect(
      service.search({ cursor, path: "utils.ts", paths: ["README.md"] }, root),
    ).rejects.toThrow("Use either path or paths");
    expect(service.search({ cursor, paths: [] }, root)).rejects.toThrow(
      "paths must contain at least one retained file",
    );
    expect(
      service.search(
        { cursor, paths: Array.from({ length: 21 }, (_, index) => `file-${String(index)}.ts`) },
        root,
      ),
    ).rejects.toThrow("paths cannot contain more than 20 entries");
    expect(service.search({ cursor, paths: ["missing.ts"] }, root)).rejects.toThrow(
      "No retained matches exist for the selected paths",
    );
    expect(
      service.search({ mode: "inspect", cursor, matchIndex: 1, path: "utils.ts" }, root),
    ).rejects.toThrow("matchIndex replaces path and line");
    expect(service.search({ mode: "inspect", cursor, matchIndex: 0 }, root)).rejects.toThrow(
      "matchIndex must be a positive integer",
    );
    expect(service.search({ mode: "inspect", matchIndex: 1 }, root)).rejects.toThrow(
      "matchIndex requires a cursor",
    );
  });

  test("fails closed when a filtered match cursor changes its path selection", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "many-a.ts"),
      `${Array.from({ length: 150 }, (_, index) => `needle a ${String(index)}`).join("\n")}\n`,
    );
    await writeFile(
      join(root, "many-b.ts"),
      `${Array.from({ length: 150 }, (_, index) => `needle b ${String(index)}`).join("\n")}\n`,
    );
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "needle", mode: "summary" }, root);
    const summaryCursor = summary.details.cursor;
    if (!summaryCursor) throw new Error("Expected summary cursor");
    const selected = await service.search({ cursor: summaryCursor, path: "many-a.ts" }, root);
    const matchCursor = selected.details.cursor;
    if (!matchCursor) throw new Error("Expected filtered match cursor");

    expect(service.search({ cursor: matchCursor, path: "many-b.ts" }, root)).rejects.toThrow(
      "must continue with the same path selection",
    );
    const continued = await service.search({ cursor: matchCursor, path: "many-a.ts" }, root);
    expect(continued.text).toContain("many-a.ts");
    expect(continued.text).not.toContain("many-b.ts");
  });

  test("distinguishes an unretained match index in a partial snapshot", async () => {
    const root = await fixture();
    const service = new SignalGrepService({
      runRipgrep: createRipgrepRunner({ maxStoredMatches: 1 }),
    });
    const summary = await service.search({ pattern: "TODO", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected partial summary cursor");

    expect(service.search({ mode: "inspect", cursor, matchIndex: 2 }, root)).rejects.toThrow(
      "not retained in this partial snapshot",
    );
  });

  test("keeps the requested line visible inside an oversized enclosing symbol", async () => {
    const root = await fixture();
    const source = `function huge() {\n${Array.from({ length: 998 }, (_, index) => `const line${String(index + 2)} = "${"x".repeat(100)}";`).join("\n")}\n}\n`;
    await writeFile(join(root, "huge-symbol.ts"), source);
    const service = new SignalGrepService({
      runRipgrep: createRipgrepRunner(),
    });

    const result = await service.search(
      { mode: "inspect", path: "huge-symbol.ts", line: 950 },
      root,
    );

    expect(result.text).toContain("950: const line950");
    expect(result.details.structure).toMatchObject({
      status: "available",
      provider: "tree-sitter",
      symbol: { name: "huge", range: { startLine: 1, endLine: 1_000 } },
    });
    expect(result.details.status).toBe("partial");
    expect(result.details.source?.complete).toBe(false);
    expect(result.text).toContain("missing byte ranges");
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
    expect(result.details.nextRequest?.sourceCursor).toBeDefined();
    const fragments = [...(result.details.source?.fragments ?? [])];
    let pages = 1;
    async function readRemaining(current: SignalGrepResult): Promise<void> {
      const next = current.details.nextRequest;
      if (!next) {
        expect(current.details.status).toBe("complete");
        expect(current.details.source?.complete).toBe(true);
        expect(current.details.source?.remainingRanges).toEqual([]);
        return;
      }
      expect(next.sourceCursor).toBeDefined();
      expect(pages).toBeLessThan(20);
      pages += 1;
      const continued = await service.search(next, root);
      expect(Buffer.byteLength(continued.text)).toBeLessThanOrEqual(16 * 1024);
      expect(continued.details.source?.reference).toEqual(result.details.source?.reference);
      expect(continued.details.source?.fragments?.[0]?.start).toBe(
        current.details.source?.remainingRanges?.[0]?.start,
      );
      expect(continued.details.source?.fragments?.length).toBeGreaterThan(0);
      for (const fragment of continued.details.source?.fragments ?? []) {
        expect(fragment.text).toBe(
          Buffer.from(source).subarray(fragment.start, fragment.end).toString(),
        );
        expect(
          fragments.some((prior) => fragment.start < prior.end && prior.start < fragment.end),
        ).toBe(false);
      }
      fragments.push(...(continued.details.source?.fragments ?? []));
      await readRemaining(continued);
    }
    await readRemaining(result);
    fragments.sort((left, right) => left.start - right.start);
    let end = 0;
    for (const fragment of fragments) {
      expect(fragment.start).toBe(end);
      end = fragment.end;
    }
    expect(end).toBe(Buffer.byteLength(source) - 1);
    expect(fragments.map((fragment) => fragment.text).join("")).toBe(source.slice(0, -1));
  });
});
