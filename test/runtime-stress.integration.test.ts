import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTextTokens } from "../src/metrics.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepRuntime } from "../src/runtime.js";
import { SignalGrepService } from "../src/service.js";
import { extractMatchIds } from "./helpers.js";

const roots = new Set<string>();

async function createMediumFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-medium-"));
  roots.add(root);
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, ".hidden"), { recursive: true });
  await mkdir(join(root, "vendor"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });

  const writes: Promise<void>[] = [];
  for (let fileIndex = 0; fileIndex < 48; fileIndex += 1) {
    const extension = fileIndex % 6 === 0 ? "tsx" : "ts";
    const separator = fileIndex % 5 === 0 ? "\r\n" : "\n";
    const lines = Array.from({ length: 60 }, (_, lineIndex) =>
      lineIndex % 3 === 0
        ? `// NEEDLE group${fileIndex % 4} file${fileIndex} item${lineIndex}`
        : `export const value${lineIndex} = ${fileIndex + lineIndex};`,
    );
    writes.push(
      writeFile(
        join(root, "src", `file-${String(fileIndex).padStart(2, "0")}.${extension}`),
        `${lines.join(separator)}${separator}`,
      ),
    );
  }
  writes.push(
    writeFile(
      join(root, ".hidden", "secret.ts"),
      `${Array.from({ length: 20 }, (_, index) => `// NEEDLE hidden ${index}`).join("\n")}\n`,
    ),
  );
  writes.push(writeFile(join(root, "vendor", "ignored.ts"), "// NEEDLE ignored\n"));
  writes.push(writeFile(join(root, ".git", "config"), "NEEDLE git internals\n"));
  writes.push(writeFile(join(root, ".gitignore"), "vendor/\n"));
  await Promise.all(writes);
  return root;
}

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("medium-repository runtime stress", () => {
  test("accounts for every successful grep while preserving exhaustive cursor accuracy", async () => {
    const root = await createMediumFixture();
    let scans = 0;
    const runRipgrep = createRipgrepRunner();
    const runtime = new SignalGrepRuntime(
      new SignalGrepService({
        runRipgrep: async (...args) => {
          scans += 1;
          return runRipgrep(...args);
        },
      }),
    );
    runtime.enableMetrics();

    const first = await runtime.search({ pattern: "NEEDLE" }, root);
    expect(scans).toBe(1);
    expect(first.details).toMatchObject({
      status: "complete",
      totalMatches: 980,
      returnedMatches: 0,
    });
    expect(first.normalText).toContain("100 matches limit reached");
    expect(runtime.metricsSnapshot.searches).toBe(1);

    const pages: string[] = [];
    let cursor = first.details.cursor;
    while (cursor) {
      // Each cursor is owned by the preceding page and must be consumed sequentially.
      // oxlint-disable-next-line no-await-in-loop
      const page = await runtime.search({ cursor }, root);
      pages.push(page.text);
      expect(Buffer.byteLength(page.text)).toBeLessThanOrEqual(16 * 1024);
      expect(estimateTextTokens(page.text)).toBeLessThanOrEqual(2_200);
      cursor = page.details.cursor;
    }

    const ids = pages.flatMap(extractMatchIds);
    expect(ids).toHaveLength(980);
    expect(new Set(ids).size).toBe(980);
    expect(runtime.metricsSnapshot.cursorPages).toBe(pages.length);
    expect(runtime.snapshotCount).toBe(1);
    expect(runtime.storedMatches).toBe(980);
    runtime.clear();
    expect(runtime.snapshotCount).toBe(0);
    expect(runtime.storedMatches).toBe(0);
    expect(runtime.metricsSnapshot.signalTokens).toBeGreaterThan(0);
    expect(runtime.metricsSnapshot.normalTokens).toBeGreaterThan(0);
    expect(runtime.formatMetricsStatus()).not.toContain("⚠");

    const beforeFailure = runtime.metricsSnapshot;
    let invalidCursorFailure: unknown;
    try {
      await runtime.search({ cursor: "invalid" }, root);
    } catch (error) {
      invalidCursorFailure = error;
    }
    expect(invalidCursorFailure).toBeInstanceOf(Error);
    expect(runtime.metricsSnapshot).toEqual(beforeFailure);

    const controller = new AbortController();
    controller.abort();
    let cancellationFailure: unknown;
    try {
      await runtime.search({ pattern: "NEEDLE" }, root, controller.signal);
    } catch (error) {
      cancellationFailure = error;
    }
    expect(cancellationFailure).toMatchObject({ name: "AbortError" });
    expect(runtime.metricsSnapshot).toEqual(beforeFailure);

    const empty = await runtime.search({ pattern: "NO_SUCH_MATCH", literal: true }, root);
    expect(empty.details.totalMatches).toBe(0);
    expect(runtime.metricsSnapshot.searches).toBe(2);
    expect(scans).toBe(3);
  }, 30_000);

  test("handles parallel filtered searches without losing metrics or crossing snapshots", async () => {
    const root = await createMediumFixture();
    const runtime = new SignalGrepRuntime(
      new SignalGrepService({ runRipgrep: createRipgrepRunner() }),
    );
    runtime.enableMetrics();

    const [groupOne, groupTwo, tsxOnly] = await Promise.all([
      runtime.search({ pattern: "group1", literal: true, exclude: ".hidden/**" }, root),
      runtime.search({ pattern: "group2", literal: true, hidden: false }, root),
      runtime.search({ pattern: "NEEDLE", glob: ["*.tsx"], exclude: ".hidden/**" }, root),
    ]);

    expect(groupOne.details.totalMatches).toBe(240);
    expect(groupTwo.details.totalMatches).toBe(240);
    expect(tsxOnly.details.totalMatches).toBe(160);
    expect(runtime.metricsSnapshot.searches).toBe(3);
    expect(runtime.formatMetricsStatus()).not.toContain("⚠");

    const cursors = [groupOne.details.cursor, groupTwo.details.cursor, tsxOnly.details.cursor];
    expect(cursors.every((cursor) => typeof cursor === "string")).toBe(true);
    const firstPages = await Promise.all(
      cursors.map((cursor) => runtime.search({ cursor: cursor ?? "" }, root)),
    );
    expect(firstPages.map((page) => page.details.totalMatches).toSorted((a, b) => a - b)).toEqual([
      160, 240, 240,
    ]);
    expect(runtime.metricsSnapshot.cursorPages).toBe(3);
  }, 30_000);
});
