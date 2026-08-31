import {
  DEFAULT_RESULT_TOKEN_BUDGET,
  ESTIMATED_CHARACTERS_PER_TOKEN,
  MAX_RESULT_BYTES,
  type MatchRecord,
  type SearchSnapshot,
} from "./types.js";

const METADATA_CHARACTERS = 2_400;
const METADATA_BYTES = 3_584;

/** File navigation gets its budget before optional source samples. */
export function formatSummary(
  snapshot: SearchSnapshot,
  fileLimit: number,
  offset = 0,
  resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET,
) {
  if (!Number.isSafeInteger(fileLimit) || fileLimit <= 0)
    throw new Error("Summary file limit must be a positive safe integer");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.fileCounts.size)
    throw new Error("Summary offset is outside the file summary");
  const files = [...snapshot.fileCounts.entries()].toSorted(
    ([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right),
  );
  const firstMatches = new Map<string, { match: MatchRecord; index: number }>();
  for (const [index, match] of snapshot.matches.entries())
    if (!firstMatches.has(match.displayPath)) firstMatches.set(match.displayPath, { match, index });
  const maxCharacters = Math.max(
    256,
    resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - METADATA_CHARACTERS,
  );
  const maxBytes = MAX_RESULT_BYTES - METADATA_BYTES;
  const rows: string[] = [];
  const shownPaths: string[] = [];
  let bytes = 0;
  let characters = 0;
  for (const [file, count] of files.slice(offset, offset + Math.min(30, fileLimit))) {
    const row = `${file}  ${String(count).padStart(6)}`;
    if (bytes + Buffer.byteLength(row) + 1 > maxBytes) {
      if (!rows.length)
        throw new Error("A file summary row exceeds the response byte budget; narrow the path");
      break;
    }
    if (rows.length && characters + row.length + 1 > maxCharacters) break;
    rows.push(row);
    shownPaths.push(file);
    bytes += Buffer.byteLength(row) + 1;
    characters += row.length + 1;
  }
  const previews: string[] = [];
  const sampleIndices: number[] = [];
  const sampleBudget = Math.max(0, Math.min(maxBytes - bytes, maxCharacters - characters));
  let sampleBytes = 0;
  for (const path of shownPaths.slice(0, 5)) {
    const retained = firstMatches.get(path);
    if (!retained) continue;
    const preview = `${path}:${retained.match.lineNumber} {match #${retained.index + 1}} ${retained.match.lineContent}`;
    if (sampleBytes + Buffer.byteLength(preview) + 1 > sampleBudget) continue;
    previews.push(preview);
    sampleIndices.push(retained.index + 1);
    sampleBytes += Buffer.byteLength(preview) + 1;
  }
  const nextOffset = offset + rows.length;
  return {
    body: rows.join("\n"),
    previews: previews.join("\n"),
    previewsShown: previews.length,
    previewsOmitted: shownPaths.length - previews.length,
    shown: rows.length,
    offset,
    nextOffset,
    hasNext: nextOffset < files.length,
    omitted: files.length - nextOffset,
    shownPaths,
    sampleIndices,
    previewByteBudget: sampleBudget,
  };
}
