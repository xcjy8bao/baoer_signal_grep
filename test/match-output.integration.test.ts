import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { MAX_RESULT_BYTES, type SearchScan, type SignalGrepResult } from "../src/types.js";

const fixtures = new Set<string>();

afterEach(async () => {
  await Promise.all([...fixtures].map((root) => rm(root, { recursive: true, force: true })));
  fixtures.clear();
});

async function fixture(name: string, content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "baoer_signal_grep-match-output-"));
  fixtures.add(root);
  await writeFile(join(root, name), content);
  return root;
}

function matchIndices(result: SignalGrepResult): number[] {
  return [...result.text.matchAll(/\{match #(\d+)\}/g)].map((match) => Number(match[1]));
}

async function collectPages(
  service: SignalGrepService,
  root: string,
  first: SignalGrepResult,
): Promise<SignalGrepResult[]> {
  const pages = [first];
  let result = first;
  while (result.details.cursor) {
    if (pages.length >= 200) throw new Error("Pagination did not finish within the fixture bound");
    // oxlint-disable-next-line no-await-in-loop -- each continuation needs the previous cursor.
    result = await service.search({ cursor: result.details.cursor }, root);
    pages.push(result);
  }
  return pages;
}

describe("bounded matching evidence", () => {
  test.each(["x", "界"])(
    "never emits future matches before a context page budget boundary (%s)",
    async (character) => {
      const root = await fixture(
        "dense.ts",
        Array.from(
          { length: 100 },
          (_, index) => `needle ${String(index)} ${character.repeat(250)}`,
        ).join("\n"),
      );
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
      const first = await service.search({ pattern: "needle", mode: "matches", context: 5 }, root);
      const pages = await collectPages(service, root, first);

      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        const indices = matchIndices(page);
        expect(indices).toHaveLength(page.details.returnedMatches);
        expect(page.text).toContain(
          `Matches ${String(indices[0])}-${String(indices.at(-1))} of 100`,
        );
        expect(Buffer.byteLength(page.text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      }
      expect(pages.flatMap(matchIndices)).toEqual(
        Array.from({ length: 100 }, (_, index) => index + 1),
      );
    },
    10_000,
  );

  test("outputs every overlapping context line once across budget-limited pages", async () => {
    const source = Array.from({ length: 100 }, (_, index) =>
      index % 2 === 0 ? `context-${String(index)} ${"x".repeat(250)}` : `needle ${String(index)}`,
    );
    const root = await fixture("alternating.ts", source.join("\n"));
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const first = await service.search({ pattern: "needle", mode: "matches", context: 5 }, root);
    const pages = await collectPages(service, root, first);
    const contextLines = pages.flatMap((page) =>
      [...page.text.matchAll(/^ (\d+)- /gm)].map((match) => Number(match[1])),
    );

    expect(pages.length).toBeGreaterThan(1);
    expect(contextLines.toSorted((left, right) => left - right)).toEqual(
      Array.from({ length: 50 }, (_, index) => index * 2 + 1),
    );
    expect(pages.flatMap(matchIndices)).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
  }, 10_000);

  test("does not mistake budget-omitted context for already emitted context", async () => {
    const source = Array.from({ length: 61 }, (_, index) => {
      if (index === 20 || index === 21) return `needle ${String(index)}`;
      return `context-${String(index)} ${index < 20 ? "x".repeat(500) : "nearby source"}`;
    });
    const root = await fixture("omitted-context.ts", source.join("\n"));
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const first = await service.search(
      { pattern: "needle", mode: "matches", context: 20, limit: 1 },
      root,
    );
    const pages = await collectPages(service, root, first);

    expect(pages.flatMap(matchIndices)).toEqual([1, 2]);
    expect(pages[0]?.details.contextOmittedFiles).toEqual(["omitted-context.ts"]);
    expect(pages[1]?.details.contextOmittedFiles).toBeUndefined();
    expect(pages[1]?.text).toContain("context-22");
    expect(pages[1]?.text).toContain("context-40");
    expect(pages[1]?.text).toContain("context-41");
  }, 10_000);

  test("keeps high-frequency occurrences searchable with explicit bounded ranges", async () => {
    const root = await fixture("dense-occurrences.txt", `${"a".repeat(1000)}\n`);
    const runRipgrep = createRipgrepRunner();
    let retainedScan: SearchScan | undefined;
    const service = new SignalGrepService({
      runRipgrep: async (...args) => {
        retainedScan = await runRipgrep(...args);
        return retainedScan;
      },
    });

    for (const mode of ["auto", "matches"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- both public output modes exercise the same fixture.
      const result = await service.search({ pattern: "a", mode }, root);
      expect(result.details.totalMatches).toBe(1);
      expect(result.details.returnedMatches).toBe(1);
      expect(result.text).toContain("20 of 1000 shown; 980 omitted");
      expect(result.text).toContain("mode=inspect");
      expect(result.details).toMatchObject({
        occurrenceRangesOmitted: 980,
        occurrenceMatchesTruncated: 1,
      });
      expect(retainedScan?.matches[0]?.occurrences).toHaveLength(1000);
      expect(retainedScan?.matches[0]?.occurrences.at(-1)?.byteEnd).toBe(1000);
      expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    }
  }, 10_000);
});
