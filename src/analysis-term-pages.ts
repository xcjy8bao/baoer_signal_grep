import type { AnalysisResultSet } from "./analysis-types.js";
import type { SignalGrepResult } from "./types.js";

export const MAX_INLINE_TERM_COUNT_BYTES = 4 * 1024;

export function termCountRequest(id: string, offset: number, redact?: boolean) {
  return {
    cursor: `${id}.analysis-terms.${offset.toString(36)}`,
    ...(redact ? { redact: true } : {}),
  };
}

/** Term metadata has its own pages so even a complete empty result remains readable. */
export function analysisTermPage(
  result: AnalysisResultSet,
  id: string,
  offset: number,
): SignalGrepResult {
  const all = result.termCounts ?? [];
  const terms: typeof all = [];
  const rows: string[] = [];
  let bytes = 0;
  for (let index = offset; index < all.length; index++) {
    const term = all[index];
    if (!term) throw new Error("Term inventory index unavailable");
    const row = `Term #${String(index + 1)} ${JSON.stringify(term.term)}: ${String(term.retainedOccurrences)} retained occurrences`;
    const size = Buffer.byteLength(row) + 2;
    if (bytes + size > 8 * 1024) break;
    rows.push(row);
    terms.push(term);
    bytes += size;
  }
  const nextOffset = offset + terms.length;
  const nextRequest =
    nextOffset < all.length ? termCountRequest(id, nextOffset, result.redact) : undefined;
  const matchesRequest = { cursor: `${id}.analysis.0`, ...(result.redact ? { redact: true } : {}) };
  return {
    text: [
      `Term inventory ${String(offset + 1)}-${String(nextOffset)} of ${String(all.length)} (${result.partial ? "PARTIAL evidence" : "complete evidence"}). Counts refer to retained occurrences.`,
      ...rows,
      ...(nextRequest ? [`Next request: ${JSON.stringify(nextRequest)}`] : []),
      `Matches request: ${JSON.stringify(matchesRequest)}`,
    ].join("\n\n"),
    details: {
      version: 1,
      mode: "matches",
      status: result.partial ? "partial" : "complete",
      snapshotComplete: !result.partial,
      totalMatches: result.items.length,
      storedMatches: result.items.length,
      returnedMatches: 0,
      totalFiles: new Set(result.items.map((item) => item.path)).size,
      cursor: nextRequest?.cursor ?? matchesRequest.cursor,
      ...(nextRequest ? { nextRequest } : {}),
      ...(result.redact ? { redactionRequested: true } : {}),
      analysis: {
        kind: result.kind,
        unit: result.unit,
        totalItems: result.items.length,
        returnedItems: 0,
        items: [],
        reasons: result.reasons,
        termCounts: terms,
        termCountsOffset: offset,
        totalTerms: all.length,
        ...(nextRequest ? { termCountsNextRequest: nextRequest } : {}),
        ...(result.coverage ? { coverage: result.coverage } : {}),
      },
    },
  };
}
