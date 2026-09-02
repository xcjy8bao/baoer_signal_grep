import { expect, test } from "bun:test";
import {
  classifyImpactOccurrences,
  impactRetentionPriority,
  mergeImpactItems,
} from "../src/impact-analysis.js";
import type { AnalysisItem } from "../src/analysis-types.js";
import type { ImpactTarget } from "../src/impact-target.js";
import { SourceDocument } from "../src/source-document.js";
import type { SyntaxAnalysis } from "../src/syntax.js";

function document(path: string, source: string): SourceDocument {
  const bytes = Buffer.from(source);
  return new SourceDocument(
    {
      path,
      origin: {
        kind: "worktree",
        revision: { size: bytes.length, mtimeMs: 1 },
        contentHash: "fixture",
      },
    },
    bytes,
  );
}

const parseError: SyntaxAnalysis = {
  language: "typescript",
  status: "parse-error",
  nodes: [],
  children: [],
  symbols: [],
  roles: [],
  diagnostics: [],
  limited: false,
};

test("impact retains exact supported-file occurrences when classification is incomplete", async () => {
  const targetDocument = document("target.ts", "function needle() {}\n");
  const candidate = document("broken.ts", "needle();\n");
  const target: ImpactTarget = {
    document: targetDocument,
    symbol: {
      name: "needle",
      kind: "function_declaration",
      start: 0,
      end: 20,
      hasBody: true,
      exported: false,
      node: 0,
    },
    item: {
      path: "target.ts",
      line: 1,
      label: "Impact target: needle",
      source: targetDocument.reference,
      range: { start: 0, end: 20 },
      details: { kind: "impact-target" },
    },
  };
  let released = 0;
  const result = await classifyImpactOccurrences(
    [{ document: candidate, occurrences: [{ start: 0, end: 6 }] }],
    target,
    {
      syntax: async () => parseError,
      releaseSyntax: () => {
        released++;
      },
    },
  );
  expect(result.partial).toBe(true);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]?.details).toMatchObject({
    kind: "impact-occurrence",
    impactCategory: "unclassified",
    binding: "unproven",
  });
  expect(result.reasons.join(" ")).toContain("parse-error");
  expect(released).toBe(1);
});

test("impact merge removes stale page indices while preserving stable test case identity", () => {
  const target: AnalysisItem = {
    path: "src/core.ts",
    line: 1,
    label: "target",
    details: { kind: "impact-target" },
  };
  const occurrence: AnalysisItem = {
    path: "src/core.ts",
    line: 1,
    label: "occurrence",
    details: { kind: "impact-occurrence", impactCategory: "declaration" },
  };
  const tests: AnalysisItem[] = [
    {
      path: "test/core.test.ts",
      line: 1,
      label: "relation",
      details: { kind: "test-relation" },
    },
    {
      path: "test/core.test.ts",
      line: 2,
      label: "case",
      details: {
        kind: "test-case",
        caseId: "stable-case",
        relationItems: { first: 1, last: 1, count: 1 },
      },
    },
    {
      path: "test/core.test.ts",
      line: 3,
      label: "use",
      details: { kind: "test-use", caseId: "stable-case", caseIndex: 2 },
    },
  ];
  const merged = mergeImpactItems(target, [occurrence], tests);
  const use = merged.find((item) => item.details?.kind === "test-use");
  const testCase = merged.find((item) => item.details?.kind === "test-case");
  expect(use?.details).toMatchObject({ caseId: "stable-case" });
  expect(use?.details).not.toHaveProperty("caseIndex");
  expect(testCase?.details).toMatchObject({ caseId: "stable-case" });
  expect(testCase?.details).not.toHaveProperty("relationItems");
  expect(tests[1]?.details).toHaveProperty("relationItems");
  expect(tests[2]?.details).toHaveProperty("caseIndex");
});

test("impact retention prioritizes exact evidence before test candidates", () => {
  const exact: AnalysisItem = {
    path: "src/core.ts",
    line: 1,
    label: "exact",
    details: { kind: "impact-occurrence" },
  };
  const testCandidate: AnalysisItem = {
    path: "test/core.test.ts",
    line: 1,
    label: "test",
    details: { kind: "test-use" },
  };
  expect(impactRetentionPriority(exact)).toBeLessThan(impactRetentionPriority(testCandidate));
});
