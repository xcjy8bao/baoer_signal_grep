import { describe, expect, test } from "bun:test";
import { changedLineRanges, GitDiffBudget, sourceLineCount } from "../src/git-diff.js";

async function assertRejects(
  operation: Promise<unknown>,
  expected: string | Record<string, string>,
): Promise<void> {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject(
    typeof expected === "string" ? { message: expect.stringContaining(expected) } : expected,
  );
}

function keep(lines: string[], changes: { startLine: number; endLine: number }[]) {
  return lines.filter(
    (_, index) =>
      !changes.some((range) => index + 1 >= range.startLine && index + 1 <= range.endLine),
  );
}

describe("raw Git line comparison", () => {
  test("preserves original line numbers, CRLF and final-newline changes", async () => {
    expect(await changedLineRanges(Buffer.from("a\nb\nc\n"), Buffer.from("a\nx\nc\n"))).toEqual({
      oldRanges: [{ startLine: 2, endLine: 2 }],
      newRanges: [{ startLine: 2, endLine: 2 }],
    });
    expect(await changedLineRanges(Buffer.from("a\r\n"), Buffer.from("a\n"))).toEqual({
      oldRanges: [{ startLine: 1, endLine: 1 }],
      newRanges: [{ startLine: 1, endLine: 1 }],
    });
    expect(await changedLineRanges(Buffer.from("a\n"), Buffer.from("a"))).toEqual({
      oldRanges: [{ startLine: 1, endLine: 1 }],
      newRanges: [{ startLine: 1, endLine: 1 }],
    });
    expect(await changedLineRanges(Buffer.alloc(0), Buffer.from("\n"))).toEqual({
      oldRanges: [],
      newRanges: [{ startLine: 1, endLine: 1 }],
    });
    expect(sourceLineCount(Buffer.alloc(0))).toBe(0);
    expect(sourceLineCount(Buffer.from("\n\n"))).toBe(2);
  });

  test("edit ranges reconstruct equal remaining lines with minimal edit counts", async () => {
    let seed = 11;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let sample = 0; sample < 200; sample += 1) {
      const oldLines = Array.from({ length: random() % 12 }, () => `${String(random() % 4)}\n`);
      const newLines = Array.from({ length: random() % 12 }, () => `${String(random() % 4)}\n`);
      // oxlint-disable-next-line no-await-in-loop -- deterministic samples compare independently with a small reference algorithm.
      const ranges = await changedLineRanges(
        Buffer.from(oldLines.join("")),
        Buffer.from(newLines.join("")),
      );

      const oldKept = keep(oldLines, ranges.oldRanges);
      expect(oldKept).toEqual(keep(newLines, ranges.newRanges));
      const lcs = Array.from(
        { length: oldLines.length + 1 },
        () => new Uint32Array(newLines.length + 1),
      );
      for (let i = 1; i <= oldLines.length; i += 1) {
        for (let j = 1; j <= newLines.length; j += 1) {
          const row = lcs[i];
          const previous = lcs[i - 1];
          if (!row || !previous) throw new Error("Missing reference row");
          row[j] =
            oldLines[i - 1] === newLines[j - 1]
              ? (previous[j - 1] ?? 0) + 1
              : Math.max(previous[j] ?? 0, row[j - 1] ?? 0);
        }
      }
      expect(oldKept.length).toBe(lcs.at(-1)?.at(-1) ?? 0);
    }
  }, 10_000);

  test("bounds cumulative work and allows cancellation during comparison", async () => {
    await assertRejects(
      changedLineRanges(Buffer.from("a\nb\n"), Buffer.from("c\nd\n"), new GitDiffBudget(2)),
      "step limit",
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 0);
    try {
      await assertRejects(
        changedLineRanges(
          Buffer.from("a\n".repeat(100_000)),
          Buffer.from("b\n".repeat(100_000)),
          new GitDiffBudget(2_000_000, controller.signal),
        ),
        { name: "AbortError" },
      );
    } finally {
      clearTimeout(timer);
    }
  }, 10_000);
});
