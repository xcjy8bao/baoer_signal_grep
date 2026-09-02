import {
  ANALYSIS_METADATA_RESERVE_BYTES,
  MAX_ANY_OF_TERMS,
  MAX_ANALYSIS_RESULTS,
  MAX_ANALYSIS_STORAGE_BYTES,
  MAX_LITERAL_TERM_BYTES,
  MIN_ANY_OF_TERMS,
} from "./analysis-limits.js";
import { sourceEvidence } from "./analysis-evidence.js";
import type { AnalysisItem } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import type { EvidenceCandidateFile } from "./evidence-candidates.js";
import { literalOccurrences } from "./literal-search.js";

export function validateAnyOf(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length < MIN_ANY_OF_TERMS ||
    value.length > MAX_ANY_OF_TERMS ||
    value.some(
      (term) =>
        typeof term !== "string" ||
        term.length === 0 ||
        !term.isWellFormed() ||
        /[\r\n\0]/.test(term) ||
        Buffer.byteLength(term) > MAX_LITERAL_TERM_BYTES,
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new SignalGrepError(
      `anyOf requires ${String(MIN_ANY_OF_TERMS)}–${String(MAX_ANY_OF_TERMS)} distinct, nonempty, well-formed, single-line literal terms of at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes`,
    );
  }
  return value;
}

export interface MultiTermExpansion {
  items: AnalysisItem[];
  partial: boolean;
  reasons: string[];
}

/** Expands candidate files locally so alternation choice never hides an overlapping input term. */
export function expandMultiTermCandidates(
  files: readonly EvidenceCandidateFile[],
  terms: readonly string[],
  changedLinesOnly: boolean,
): MultiTermExpansion {
  const items: (AnalysisItem & { termIndex: number })[] = [];
  const reasons = new Set<string>();
  const orderedFiles = files.toSorted((left, right) =>
    left.document.path.localeCompare(right.document.path),
  );
  for (const file of orderedFiles) {
    if (!file.document.utf8) {
      reasons.add(
        `${file.document.path}: exact multi-term evidence requires lossless UTF-8 source`,
      );
    }
  }
  let serializedBytes = 0;
  let exhausted = false;
  for (let termIndex = 0; termIndex < terms.length && !exhausted; termIndex++) {
    const term = terms[termIndex];
    if (term === undefined) throw new Error("Missing validated anyOf term");
    for (const file of orderedFiles) {
      if (!file.document.utf8) continue;
      const allowed = changedLinesOnly ? file.changedRanges : undefined;
      for (const range of literalOccurrences(file.document, term, allowed)) {
        const match = sourceEvidence(file.document, range);
        const item: AnalysisItem & { termIndex: number } = {
          path: file.document.path,
          line: match.line,
          label: `Exact literal occurrence for ${JSON.stringify(term)}`,
          excerpt: match.excerpt,
          source: file.document.reference,
          range,
          details: {
            kind: "literal-term",
            term,
            termIndex,
            excerptRange: match.excerptRange,
            excerptTruncated: match.excerptTruncated,
          },
          termIndex,
        };
        const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
        if (
          items.length >= MAX_ANALYSIS_RESULTS ||
          serializedBytes + itemBytes >=
            MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES
        ) {
          reasons.add("Exact multi-term retention reached the 50,000-item / 32 MiB analysis limit");
          exhausted = true;
          break;
        }
        items.push(item);
        serializedBytes += itemBytes;
      }
      if (exhausted) break;
    }
  }
  return {
    items: items.map(({ termIndex: _termIndex, ...item }) => item),
    partial: reasons.size > 0,
    reasons: [...reasons],
  };
}

export function retainedTermCounts(
  terms: readonly string[],
  items: readonly AnalysisItem[],
): { term: string; retainedOccurrences: number }[] {
  const counts = new Map(terms.map((term) => [term, 0]));
  for (const item of items) {
    const term = item.details?.term;
    if (typeof term === "string" && counts.has(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return terms.map((term) => ({ term, retainedOccurrences: counts.get(term) ?? 0 }));
}
