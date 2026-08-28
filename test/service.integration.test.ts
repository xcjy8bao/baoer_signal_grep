import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { estimateTextTokens } from "../src/metrics.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
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
    const service = new SignalGrepService({
      runRipgrep: createRipgrepRunner(),
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
    expect(providerCalls).toBe(1);
    expect(result.text).toContain("Client.request (method) lines 2-4");
    expect(result.text).toContain("2:   request() {");
    expect(result.text).toContain("[structure: available via test-provider]");
    expect(result.details.structure).toMatchObject({ status: "available" });
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
});
