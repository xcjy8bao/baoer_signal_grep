import type { ByteRange, SourceDocument } from "./source-document.js";

export function escapeRegexLiteral(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds non-overlapping occurrences of one exact byte sequence. Different terms are scanned independently. */
export function literalOccurrences(
  document: SourceDocument,
  term: string,
  allowed?: readonly ByteRange[],
): ByteRange[] {
  const needle = Buffer.from(term);
  const found: ByteRange[] = [];
  for (
    let start = document.bytes.indexOf(needle);
    start >= 0;
    start = document.bytes.indexOf(needle, start + Math.max(1, needle.length))
  ) {
    const range = { start, end: start + needle.length };
    if (!allowed || allowed.some((part) => part.start <= range.start && range.end <= part.end))
      found.push(range);
  }
  return found;
}
