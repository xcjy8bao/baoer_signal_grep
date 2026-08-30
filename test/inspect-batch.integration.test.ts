import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abortError } from "../src/errors.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import type { CodeStructureProvider } from "../src/structure.js";
import { MAX_RESULT_BYTES } from "../src/types.js";

const fixtures = new Set<string>();
afterEach(async () => {
  await Promise.all([...fixtures].map((root) => rm(root, { recursive: true, force: true })));
  fixtures.clear();
});
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-inspect-batch-"));
  fixtures.add(root);
  return root;
}
function service(structure?: CodeStructureProvider): SignalGrepService {
  return new SignalGrepService({
    runRipgrep: createRipgrepRunner(),
    ...(structure ? { structure } : {}),
  });
}
function enclosingSymbol(endLine: number): CodeStructureProvider {
  return {
    inspect: async () => ({
      details: {
        status: "available",
        provider: "test-provider",
        symbol: {
          name: "container",
          kind: "function",
          scope: [],
          range: { startLine: 1, endLine },
        },
        range: { startLine: 1, endLine },
      },
    }),
  };
}

async function expectFailure(pending: Promise<unknown>, message: string): Promise<void> {
  const failure: unknown = await pending.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}

describe("source inspection evidence", () => {
  test("keeps a late Unicode match visible and reports line truncation in text and details", async () => {
    const root = await fixture();
    await writeFile(join(root, "long.ts"), `${"界".repeat(1_000)} needle-target\n`);
    const search = service();
    const summary = await search.search({ pattern: "needle-target", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected a retained summary cursor");
    const result = await search.search({ mode: "inspect", cursor, matchIndex: 1 }, root);
    expect(result.text).toContain("needle-target");
    expect(result.text).toContain("source line excerpts truncated: 1");
    expect(result.details.source?.truncatedLines).toEqual([1]);
    expect(result.details.lineContentTruncated).toBe(1);
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  });

  test("maps repeated retained targets to deduplicated source evidence", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "sample.ts"),
      "function container() {\n  needle first\n  needle second\n}\n",
    );
    const search = service(enclosingSymbol(4));
    const summary = await search.search({ pattern: "needle", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected a retained summary cursor");
    const result = await search.search({ mode: "inspect", cursor, matchIndices: [2, 1, 2] }, root);
    expect(
      result.details.inspections?.map((item) => [
        item.inputIndex,
        item.matchIndex,
        item.block,
        item.status,
      ]),
    ).toEqual([
      [1, 2, 1, "returned"],
      [2, 1, 1, "returned"],
      [3, 2, 1, "returned"],
    ]);
    expect(result.text.match(/^2:   needle first$/gm)).toHaveLength(1);
    expect(result.text.match(/^3:   needle second$/gm)).toHaveLength(1);
    expect(result.details.returnedMatches).toBe(4);
    expect(result.details.status).toBe("complete");
  });

  test("shares one byte budget across distant targets and reports omitted source ranges", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "large.ts"),
      Array.from(
        { length: 1_000 },
        (_, index) => `evidence-${String(index + 1)} ${"x".repeat(250)}`,
      ).join("\n"),
    );
    const search = service(enclosingSymbol(1_000));
    const lines = [50, 250, 500, 750, 950];
    const result = await search.search(
      { mode: "inspect", targets: lines.map((line) => ({ path: "large.ts", line })) },
      root,
    );
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(result.details.inspections).toHaveLength(5);
    for (const line of lines)
      expect(result.text).toContain(`${String(line)}: evidence-${String(line)}`);
    expect(
      result.details.inspections?.every(
        (item) =>
          item.status === "returned" && item.block === 1 && (item.source?.omittedBefore ?? 0) > 0,
      ),
    ).toBe(true);
    expect(result.text).toContain("… omitted lines");
    expect(result.text).toContain('"mode":"inspect","path":"large.ts"');
  });

  test("returns executable retries when target excerpts cannot fit their shared budget", async () => {
    const root = await fixture();
    const directory = Array.from(
      { length: 8 },
      (_, index) => `${String(index)}${"d".repeat(79)}`,
    ).join("/");
    await mkdir(join(root, directory), { recursive: true });
    const targets = Array.from({ length: 5 }, (_, index) => ({
      path: `${directory}/file-${String(index)}.ts`,
      line: 1,
    }));
    await Promise.all(
      targets.map((target) => writeFile(join(root, target.path), `${"界".repeat(1_000)}\n`)),
    );
    const search = service();
    const result = await search.search({ mode: "inspect", targets }, root);
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    const deferred = result.details.inspections?.find((item) => item.status === "deferred");
    expect(deferred?.retry).toBeDefined();
    expect(result.details.status).toBe("partial");
    expect(result.details.snapshotComplete).toBe(false);
    expect(result.text).toContain("PARTIAL");
    if (!deferred?.retry) throw new Error("Expected a retryable deferred target");
    const retried = await search.search(deferred.retry, root);
    expect(retried.details.source?.range.startLine).toBe(1);
    expect(retried.details.returnedMatches).toBeGreaterThan(0);
  });

  test("keeps independent targets available when another retained source changed", async () => {
    const root = await fixture();
    await writeFile(join(root, "a.ts"), "needle old\n");
    await writeFile(join(root, "b.ts"), "needle stable\n");
    const search = service();
    const summary = await search.search({ pattern: "needle", mode: "summary" }, root);
    await writeFile(join(root, "a.ts"), "replacement changed\n");
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected a retained summary cursor");
    const result = await search.search({ mode: "inspect", cursor, matchIndices: [1, 2] }, root);
    expect(result.details.inspections?.filter((item) => item.status === "returned")).toHaveLength(
      1,
    );
    expect(
      result.details.inspections?.find((item) => item.path === "a.ts")?.structure?.status,
    ).toBe("source-changed");
    expect(result.text).toContain("needle stable");
    expect(result.text).not.toContain("replacement changed");
    expect(result.details.status).toBe("partial");
  });

  test("does not combine different revisions of the same file inside a batch", async () => {
    const root = await fixture();
    const file = join(root, "moving.ts");
    await writeFile(file, "old evidence one\nold evidence two\n");
    let calls = 0;
    const search = service({
      inspect: async () => {
        calls += 1;
        if (calls === 2) await writeFile(file, "new evidence one\nnew evidence two changed\n");
        return { details: { status: "provider-unavailable" } };
      },
    });
    const result = await search.search(
      {
        mode: "inspect",
        targets: [
          { path: "moving.ts", line: 1 },
          { path: "moving.ts", line: 2 },
        ],
      },
      root,
    );
    expect(result.text).toContain("old evidence one");
    expect(result.text).not.toContain("new evidence");
    expect(result.details.inspections?.[1]?.structure?.status).toBe("source-changed");
    expect(result.details.status).toBe("partial");
  });

  test("reports missing and out-of-range targets without hiding available evidence", async () => {
    const root = await fixture();
    await writeFile(join(root, "valid.ts"), "available evidence\n");
    const result = await service().search(
      {
        mode: "inspect",
        targets: [
          { path: "missing.ts", line: 1 },
          { path: "valid.ts", line: 9_999 },
          { path: "valid.ts", line: 1 },
        ],
      },
      root,
    );
    expect(result.details.inspections?.map((item) => item.status)).toEqual([
      "error",
      "error",
      "returned",
    ]);
    expect(result.text).toContain("available evidence");
    expect(result.text).toContain("beyond the end of the file");
    expect(result.details.status).toBe("partial");
  });

  test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "isolates source permission failures from independent batch targets",
    async () => {
      const root = await fixture();
      const restricted = join(root, "restricted");
      await mkdir(restricted);
      await writeFile(join(restricted, "private.ts"), "unavailable evidence\n");
      await writeFile(join(root, "valid.ts"), "available evidence\n");
      await chmod(restricted, 0);
      try {
        const result = await service().search(
          {
            mode: "inspect",
            targets: [
              { path: "restricted/private.ts", line: 1 },
              { path: "valid.ts", line: 1 },
            ],
          },
          root,
        );
        expect(result.details.inspections?.map((item) => item.status)).toEqual([
          "error",
          "returned",
        ]);
        expect(result.details.inspections?.[0]?.structure?.status).toBe("source-unavailable");
        expect(result.text).toContain("available evidence");
        expect(result.text).not.toContain("unavailable evidence");
      } finally {
        await chmod(restricted, 0o700);
      }
    },
  );

  test("rejects ambiguous requests and propagates unexpected provider failures", async () => {
    const root = await fixture();
    await writeFile(join(root, "valid.ts"), "evidence\n");
    const search = service();
    await expectFailure(
      search.search({ mode: "inspect", targets: [] }, root),
      "requires 1-5 targets",
    );
    await expectFailure(
      search.search(
        {
          mode: "inspect",
          targets: Array.from({ length: 6 }, () => ({ path: "valid.ts", line: 1 })),
        },
        root,
      ),
      "requires 1-5 targets",
    );
    await expectFailure(
      search.search(
        { mode: "inspect", targets: [{ path: "valid.ts", line: 1 }], path: "valid.ts" },
        root,
      ),
      "cannot be combined",
    );
    await expectFailure(
      search.search({ mode: "inspect", matchIndices: [1] }, root),
      "requires a cursor",
    );
    await expectFailure(
      search.search({ mode: "inspect", targets: [{ path: "../outside.ts", line: 1 }] }, root),
      "within the working directory",
    );
    const broken = service({
      inspect: async () => {
        throw new TypeError("provider programming failure");
      },
    });
    await expectFailure(
      broken.search({ mode: "inspect", targets: [{ path: "valid.ts", line: 1 }] }, root),
      "provider programming failure",
    );
  });

  test("aborts the complete batch instead of reporting cancellation as an item error", async () => {
    const root = await fixture();
    await writeFile(join(root, "valid.ts"), "evidence\n");
    const controller = new AbortController();
    let calls = 0;
    const search = service({
      inspect: async () => {
        calls += 1;
        controller.abort();
        throw abortError();
      },
    });
    const failure: unknown = await search
      .search(
        {
          mode: "inspect",
          targets: [
            { path: "valid.ts", line: 1 },
            { path: "valid.ts", line: 1 },
          ],
        },
        root,
        controller.signal,
      )
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ name: "AbortError" });
    expect(calls).toBe(1);
  }, 5_000);
});
