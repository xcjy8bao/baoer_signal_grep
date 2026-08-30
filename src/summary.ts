import {
  DEFAULT_RESULT_TOKEN_BUDGET,
  ESTIMATED_CHARACTERS_PER_TOKEN,
  MAX_RESULT_BYTES,
  type MatchRecord,
  type SearchSnapshot,
} from "./types.js";

const METADATA_CHARACTERS = 1_200;
const METADATA_BYTES = 2_048;

/** A sample is retained evidence, not a relevance score or a second search. */
export function formatSummary(
  snapshot: SearchSnapshot,
  fileLimit: number,
  offset = 0,
  resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET,
) {
  if (!Number.isSafeInteger(fileLimit) || fileLimit <= 0) {
    throw new Error("Summary file limit must be a positive safe integer");
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.fileCounts.size) {
    throw new Error("Summary offset is outside the file summary");
  }
  const files = [...snapshot.fileCounts.entries()].toSorted(
    ([leftPath, leftCount], [rightPath, rightCount]) =>
      rightCount - leftCount || leftPath.localeCompare(rightPath),
  );
  const firstMatches = new Map<string, { match: MatchRecord; index: number }>();
  for (const [index, match] of snapshot.matches.entries()) {
    if (!firstMatches.has(match.displayPath)) firstMatches.set(match.displayPath, { match, index });
  }
  const maxCharacters = resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - METADATA_CHARACTERS;
  const maxBytes = MAX_RESULT_BYTES - METADATA_BYTES;
  if (maxCharacters <= 0) throw new Error("Summary budget cannot fit response metadata");
  const rows: string[] = [];
  const previews: string[] = [];
  let bytes = 0;
  let characters = 0;
  for (const [file, count] of files.slice(offset, offset + fileLimit)) {
    const row = `${file}  ${String(count).padStart(6)}`;
    const retained = firstMatches.get(file);
    const preview = retained
      ? `${file}:${String(retained.match.lineNumber)} {match #${String(retained.index + 1)}} ${retained.match.lineContent}`
      : `${file}: [no matching line retained; narrow the search]`;
    const rowCharacters = row.length + preview.length + 2;
    const rowBytes = Buffer.byteLength(row) + Buffer.byteLength(preview) + 2;
    if (characters + rowCharacters > maxCharacters || bytes + rowBytes > maxBytes) {
      if (rows.length === 0) {
        // Keep navigation progressing when one path/sample cannot fit the soft target.
        // The hard byte boundary still applies; a long sample is explicitly omitted.
        if (Buffer.byteLength(row) > maxBytes) {
          throw new Error("A file summary row exceeds the response byte budget; narrow the path");
        }
        rows.push(row);
      }
      break;
    }
    rows.push(row);
    if (retained) previews.push(preview);
    bytes += rowBytes;
    characters += rowCharacters;
  }
  const nextOffset = offset + rows.length;
  return {
    body: rows.join("\n"),
    previews: previews.join("\n"),
    previewsShown: previews.length,
    previewsOmitted: snapshot.fileCounts.size - previews.length,
    shown: rows.length,
    offset,
    nextOffset,
    hasNext: nextOffset < files.length,
    omitted: files.length - nextOffset,
  };
}
