import { DEFAULT_HYBRID_CONCEPT_LIMIT, MAX_HYBRID_CONCEPT_LIMIT } from "./analysis-limits.js";
import type { AnalysisItem, AnalysisResultSet, CoverageStatus } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import { SourceDocumentError, type ByteRange, type SourceDocument } from "./source-document.js";
import { sameSourceRevision } from "./source.js";
import type { SearchScan } from "./types.js";

function rangesOverlap(left: ByteRange, right: ByteRange): boolean {
  return left.start < right.end && right.start < left.end;
}

export function hybridConceptLimit(value: number | undefined): number {
  const candidate = value ?? DEFAULT_HYBRID_CONCEPT_LIMIT;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_HYBRID_CONCEPT_LIMIT) {
    throw new SignalGrepError(
      `conceptLimit must be an integer from 1 through ${String(MAX_HYBRID_CONCEPT_LIMIT)}`,
    );
  }
  return candidate;
}

function absoluteOccurrenceRanges(
  document: SourceDocument,
  line: number,
  match: SearchScan["matches"][number],
): ByteRange[] {
  const lineRange = document.lineRange(line);
  return match.occurrences.map((occurrence) => ({
    start: lineRange.start + occurrence.byteStart,
    end: lineRange.start + occurrence.byteEnd,
  }));
}

async function literalEvidence(
  scan: SearchScan,
  access: SourceAccess,
): Promise<{
  items: AnalysisItem[];
  rangesByPath: Map<string, ByteRange[]>;
  sourceCoverage: CoverageStatus;
  reasons: string[];
}> {
  const documents = new Map<string, SourceDocument>();
  const unavailable = new Map<string, string>();
  for (const match of scan.matches) {
    if (documents.has(match.absolutePath) || unavailable.has(match.absolutePath)) continue;
    try {
      // oxlint-disable-next-line no-await-in-loop -- SourceAccess owns a bounded serialized read budget.
      const document = await access.load(match.absolutePath);
      const expected = scan.sourceRevisions.get(match.absolutePath);
      if (
        !expected ||
        document.reference.origin.kind !== "worktree" ||
        !sameSourceRevision(expected, document.reference.origin.revision)
      ) {
        unavailable.set(match.absolutePath, "source revision was not stable across hybrid search");
        continue;
      }
      documents.set(match.absolutePath, document);
    } catch (error) {
      if (error instanceof SourceBudgetError || error instanceof SourceDocumentError) {
        unavailable.set(match.absolutePath, error.message);
        continue;
      }
      throw error;
    }
  }

  const rangesByPath = new Map<string, ByteRange[]>();
  const items = scan.matches.map((match): AnalysisItem => {
    const document = documents.get(match.absolutePath);
    const path = document?.path ?? match.displayPath;
    const ranges = document ? absoluteOccurrenceRanges(document, match.lineNumber, match) : [];
    if (ranges.length) {
      const existing = rangesByPath.get(path) ?? [];
      existing.push(...ranges);
      rangesByPath.set(path, existing);
    }
    const primary = ranges[0];
    return {
      path,
      line: match.lineNumber,
      label: `Literal exact match (${String(match.occurrences.length)} occurrence${match.occurrences.length === 1 ? "" : "s"})${document && primary ? "" : "; source inspection unavailable"}`,
      excerpt: match.lineContent,
      ...(document && primary ? { source: document.reference, range: primary } : {}),
      details: {
        kind: "literal-match",
        source: "literal",
        certainty: "exact",
        sourceVerified: Boolean(document && primary),
        occurrenceCount: match.occurrences.length,
        ranges,
        lineContentTruncated: match.lineTruncated,
      },
    };
  });
  const reasons = [...new Set(unavailable.values())].map(
    (reason) => `Literal source inspection is unavailable for retained evidence: ${reason}`,
  );
  return {
    items,
    rangesByPath,
    sourceCoverage: unavailable.size ? "partial" : "complete",
    reasons,
  };
}

function isLiteralOverlap(item: AnalysisItem, rangesByPath: Map<string, ByteRange[]>): boolean {
  const itemRange = item.range;
  if (!itemRange) return false;
  return (rangesByPath.get(item.path) ?? []).some((range) => rangesOverlap(range, itemRange));
}

export async function combineHybridSearch(
  scan: SearchScan,
  concept: AnalysisResultSet,
  access: SourceAccess,
  conceptLimit: number,
): Promise<AnalysisResultSet> {
  if (concept.kind !== "concept") throw new Error("Hybrid search requires concept evidence");
  const literal = await literalEvidence(scan, access);
  const eligibleConcept = concept.items.filter(
    (item) => !isLiteralOverlap(item, literal.rangesByPath),
  );
  const duplicateConceptCandidates = concept.items.length - eligibleConcept.length;
  const selectedConcept: AnalysisItem[] = [];
  for (const item of eligibleConcept.slice(0, conceptLimit)) {
    selectedConcept.push({
      ...item,
      details: { ...item.details, source: "concept" },
    });
  }
  const conceptCandidatesOmitted = Math.max(0, eligibleConcept.length - selectedConcept.length);
  const literalOccurrencesRetained = scan.matches.reduce(
    (total, match) => total + match.occurrences.length,
    0,
  );
  const literalCoverage: CoverageStatus = scan.snapshotComplete ? "complete" : "partial";
  const conceptCoverage =
    concept.coverage?.conceptCandidates ?? (concept.partial ? "partial" : "complete");
  const deduplicationCoverage: CoverageStatus =
    scan.snapshotComplete && literal.sourceCoverage === "complete" ? "complete" : "partial";
  const partial =
    !scan.snapshotComplete ||
    concept.partial ||
    conceptCoverage === "skipped" ||
    literal.sourceCoverage === "partial" ||
    deduplicationCoverage === "partial";
  const selectionReason = conceptCandidatesOmitted
    ? `Hybrid concept limit retained the top ${String(selectedConcept.length)} of ${String(eligibleConcept.length)} non-overlapping semantic candidates`
    : undefined;
  return {
    kind: "hybrid",
    unit: "evidence-items",
    items: [...literal.items, ...selectedConcept],
    partial,
    reasons: [
      ...(scan.retention?.reasons ?? []),
      ...concept.reasons,
      ...literal.reasons,
      ...(selectionReason ? [selectionReason] : []),
    ],
    filesRead: (concept.filesRead ?? 0) + access.filesRead,
    bytesRead: (concept.bytesRead ?? 0) + access.bytesRead,
    counts: {
      ...concept.counts,
      literalMatchingLinesFound: scan.totalMatches,
      literalMatchingLinesPrepared: literal.items.length,
      literalOccurrencesRetained,
      conceptCandidatesRanked: concept.items.length,
      conceptCandidatesDeduplicated: duplicateConceptCandidates,
      conceptCandidatesEligible: eligibleConcept.length,
      conceptCandidatesSelected: selectedConcept.length,
      conceptCandidatesOmitted,
      literalItemsRetained: literal.items.length,
      conceptItemsRetained: selectedConcept.length,
    },
    ...(concept.scope ? { scope: concept.scope } : {}),
    coverage: {
      literalMatches: literalCoverage,
      conceptCandidates: conceptCoverage,
      crossSourceDeduplication: deduplicationCoverage,
      sourceInspection: literal.sourceCoverage,
      retention: "complete",
    },
    ...(concept.stats ? { stats: concept.stats } : {}),
    ...(concept.redact !== undefined ? { redact: concept.redact } : {}),
  };
}

export function retainedHybridCounts(
  original: Readonly<Record<string, number>>,
  items: readonly AnalysisItem[],
): Record<string, number> {
  let literalItemsRetained = 0;
  let conceptItemsRetained = 0;
  for (const item of items) {
    if (item.details?.source === "literal") literalItemsRetained += 1;
    if (item.details?.source === "concept") conceptItemsRetained += 1;
  }
  return { ...original, literalItemsRetained, conceptItemsRetained };
}
