import {
  ANALYSIS_METADATA_RESERVE_BYTES,
  MAX_ANALYSIS_RESULTS,
  MAX_ANALYSIS_STORAGE_BYTES,
} from "./analysis-limits.js";
import { sourceEvidence } from "./analysis-evidence.js";
import type { AnalysisItem, AnalysisResultSet } from "./analysis-types.js";
import type { EvidenceCandidateFile } from "./evidence-candidates.js";
import type { ImpactTarget } from "./impact-target.js";
import { classifySyntaxRange, syntaxLanguage, type SyntaxRole } from "./syntax.js";
import type { SourceDocument } from "./source-document.js";

export type ImpactCategory =
  | "declaration"
  | "import"
  | "export"
  | "call"
  | "code"
  | "comment"
  | "string"
  | "jsx-text"
  | "unknown"
  | "unclassified";

const CATEGORY_ORDER: readonly ImpactCategory[] = [
  "declaration",
  "import",
  "export",
  "call",
  "code",
  "comment",
  "string",
  "jsx-text",
  "unknown",
  "unclassified",
];
const TEST_ORDER = new Map([
  ["test-use", 5],
  ["test-case", 6],
  ["test-relation", 7],
]);

interface SyntaxOwner {
  syntax(document: SourceDocument): Promise<import("./syntax.js").SyntaxAnalysis>;
  releaseSyntax(document: SourceDocument): void;
}

export interface ImpactOccurrences {
  items: AnalysisItem[];
  partial: boolean;
  reasons: string[];
}

function primaryCategory(roles: readonly SyntaxRole[]): Exclude<ImpactCategory, "unclassified"> {
  for (const category of CATEGORY_ORDER) {
    if (category !== "unclassified" && roles.some((role) => role.role === category))
      return category;
  }
  return "unknown";
}

function roleDetails(roles: readonly SyntaxRole[], document: SourceDocument) {
  return roles.map((role) => ({
    role: role.role,
    certainty: role.certainty,
    subkind: role.subkind,
    range: {
      start: document.toByteOffset(role.start),
      end: document.toByteOffset(role.end),
    },
  }));
}

function occurrenceItem(
  file: EvidenceCandidateFile,
  range: { start: number; end: number },
  target: ImpactTarget,
  category: ImpactCategory,
  roles: readonly SyntaxRole[],
): AnalysisItem {
  const match = file.document.utf8 ? sourceEvidence(file.document, range) : undefined;
  return {
    path: file.document.path,
    line: file.document.lineAt(range.start),
    label: `Exact same-spelling candidate (${category}; binding unproven)`,
    ...(match ? { excerpt: match.excerpt } : {}),
    source: file.document.reference,
    range,
    details: {
      kind: "impact-occurrence",
      impactCategory: category,
      binding: "unproven",
      target: {
        path: target.document.path,
        name: target.symbol.name,
        range: target.item.range,
      },
      roles: roleDetails(roles, file.document),
      ...(match
        ? {
            excerptRange: match.excerptRange,
            excerptTruncated: match.excerptTruncated,
          }
        : {}),
    },
  };
}

/** Retains every exact candidate; syntax changes only its classification, never admission. */
export async function classifyImpactOccurrences(
  files: readonly EvidenceCandidateFile[],
  target: ImpactTarget,
  owner: SyntaxOwner,
): Promise<ImpactOccurrences> {
  const items: AnalysisItem[] = [];
  const reasons = new Set<string>();
  const process = async (index: number): Promise<void> => {
    const file = files[index];
    if (!file) return;
    const language = syntaxLanguage(file.document.path);
    let classified = false;
    let syntax: import("./syntax.js").SyntaxAnalysis | undefined;
    if (language && file.document.utf8) {
      try {
        syntax = await owner.syntax(file.document);
        classified = syntax.status === "ok";
        if (!classified)
          reasons.add(
            `${file.document.path}: syntax ${syntax.status}; exact occurrences remain unclassified`,
          );
      } finally {
        owner.releaseSyntax(file.document);
      }
    } else if (language) {
      reasons.add(
        `${file.document.path}: syntax classification requires lossless UTF-8 source; exact occurrences remain unclassified`,
      );
    }
    const seen = new Set<string>();
    for (const range of file.occurrences) {
      const key = `${String(range.start)}:${String(range.end)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const roles =
        classified && syntax
          ? classifySyntaxRange(
              syntax,
              file.document.toCharacterOffset(range.start),
              file.document.toCharacterOffset(range.end),
            )
          : [];
      const category = classified ? primaryCategory(roles) : "unclassified";
      items.push(occurrenceItem(file, range, target, category, roles));
    }
    await process(index + 1);
  };
  await process(0);
  return { items, partial: reasons.size > 0, reasons: [...reasons] };
}

function itemOrder(item: AnalysisItem): number {
  if (item.details?.kind === "impact-target") return -1;
  if (item.details?.kind === "impact-occurrence") {
    const category = item.details.impactCategory;
    const index = CATEGORY_ORDER.findIndex((value) => value === category);
    if (index < 5) return index;
    return index + 3;
  }
  return TEST_ORDER.get(String(item.details?.kind)) ?? 13;
}

export function mergeImpactItems(
  target: AnalysisItem,
  occurrences: readonly AnalysisItem[],
  tests: readonly AnalysisItem[],
): AnalysisItem[] {
  const stableTests = tests.map((item) => {
    if (!item.details) return item;
    const details = { ...item.details };
    if (details.kind === "test-use") delete details.caseIndex;
    if (details.kind === "test-case") delete details.relationItems;
    return { ...item, details };
  });
  return [target, ...occurrences, ...stableTests]
    .map((item, insertion) => ({ item, insertion }))
    .toSorted(
      (left, right) =>
        itemOrder(left.item) - itemOrder(right.item) ||
        left.item.path.localeCompare(right.item.path) ||
        left.item.line - right.item.line ||
        (left.item.range?.start ?? 0) - (right.item.range?.start ?? 0) ||
        left.insertion - right.insertion,
    )
    .map(({ item }) => item);
}

/** Exact target/occurrence evidence owns storage before derived test candidates. */
export function impactRetentionPriority(item: AnalysisItem): number {
  return item.details?.kind === "impact-target" || item.details?.kind === "impact-occurrence"
    ? 0
    : 1;
}

export function impactRetentionExhausted(items: readonly AnalysisItem[]): boolean {
  if (items.length >= MAX_ANALYSIS_RESULTS) return true;
  const bytes = items.reduce(
    (total, item) => total + Buffer.byteLength(JSON.stringify(item)) + 1,
    0,
  );
  return bytes >= MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES;
}

export function retainedImpactCounts(
  items: readonly AnalysisItem[],
): Pick<AnalysisResultSet, "counts"> {
  const counts: Record<string, number> = {
    targets: 0,
    retainedExactOccurrences: 0,
    testUses: 0,
    testCases: 0,
    testRelations: 0,
  };
  for (const item of items) {
    const kind = item.details?.kind;
    if (kind === "impact-target") counts.targets = (counts.targets ?? 0) + 1;
    else if (kind === "impact-occurrence") {
      counts.retainedExactOccurrences = (counts.retainedExactOccurrences ?? 0) + 1;
      const category = item.details?.impactCategory;
      if (typeof category === "string") counts[category] = (counts[category] ?? 0) + 1;
    } else if (kind === "test-use") counts.testUses = (counts.testUses ?? 0) + 1;
    else if (kind === "test-case") counts.testCases = (counts.testCases ?? 0) + 1;
    else if (kind === "test-relation") counts.testRelations = (counts.testRelations ?? 0) + 1;
  }
  return { counts };
}
