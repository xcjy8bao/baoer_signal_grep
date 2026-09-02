import { expect, test } from "bun:test";
import { MAX_ANALYSIS_RESULTS } from "../src/analysis-limits.js";
import { AnalysisStore } from "../src/analysis-store.js";
import type { AnalysisItem } from "../src/analysis-types.js";
import { impactRetentionPriority, retainedImpactCounts } from "../src/impact-analysis.js";
import { retainedTermCounts } from "../src/multi-term-search.js";
import { MAX_RESULT_BYTES } from "../src/types.js";

test("analysis storage recomputes retained summaries after applying its item bound", () => {
  const store = new AnalysisStore();
  const item: AnalysisItem = {
    path: "a.ts",
    line: 1,
    label: "exact alpha",
    details: { kind: "literal-term", term: "alpha" },
  };
  const cursor = store.create(
    {
      kind: "any-of",
      unit: "occurrences",
      items: Array.from({ length: MAX_ANALYSIS_RESULTS + 1 }, () => item),
      partial: false,
      reasons: [],
    },
    (items) => ({ termCounts: retainedTermCounts(["alpha", "beta"], items) }),
  );
  const page = store.page(cursor);
  expect(page.details.status).toBe("partial");
  expect(page.details.analysis?.totalItems).toBe(MAX_ANALYSIS_RESULTS);
  expect(page.details.analysis?.termCounts).toEqual([
    { term: "alpha", retainedOccurrences: MAX_ANALYSIS_RESULTS },
    { term: "beta", retainedOccurrences: 0 },
  ]);
  expect(page.details.analysis?.reasons.join(" ")).toContain("storage limit");
});

test("analysis storage drops derived impact tests before exact evidence at the item bound", () => {
  const store = new AnalysisStore();
  const testCandidate: AnalysisItem = {
    path: "test/core.test.ts",
    line: 1,
    label: "derived test",
    details: { kind: "test-use" },
  };
  const exact: AnalysisItem = {
    path: "src/core.ts",
    line: 1,
    label: "exact occurrence",
    details: { kind: "impact-occurrence", impactCategory: "code" },
  };
  const cursor = store.create(
    {
      kind: "impact",
      unit: "impact-candidates",
      items: [testCandidate, ...Array.from({ length: MAX_ANALYSIS_RESULTS }, () => exact)],
      partial: false,
      reasons: [],
    },
    retainedImpactCounts,
    impactRetentionPriority,
  );
  const page = store.page(cursor);
  expect(page.details.status).toBe("partial");
  expect(page.details.analysis?.totalItems).toBe(MAX_ANALYSIS_RESULTS);
  expect(page.details.analysis?.counts).toMatchObject({
    retainedExactOccurrences: MAX_ANALYSIS_RESULTS,
    testUses: 0,
  });
});

test("analysis storage bounds high-cardinality reasons without losing partial status", () => {
  const store = new AnalysisStore();
  const cursor = store.create({
    kind: "impact",
    unit: "impact-candidates",
    items: [],
    partial: true,
    reasons: ["x".repeat(MAX_RESULT_BYTES + 1)],
  });
  const page = store.page(cursor);
  expect(page.details.status).toBe("partial");
  expect(Buffer.byteLength(page.text)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  expect(page.details.analysis?.reasons.join(" ")).toContain("additional analysis reasons omitted");
});
