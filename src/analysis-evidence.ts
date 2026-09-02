import type { ByteRange, SourceDocument } from "./source-document.js";
import { MAX_LINE_CHARACTERS } from "./types.js";

/** Creates one bounded, UTF-8-safe line excerpt around an exact byte range. */
export function sourceEvidence(document: SourceDocument, range: ByteRange) {
  const line = document.lineAt(range.start);
  const lineRange = document.lineRange(line);
  const lineStart = document.toCharacterOffset(lineRange.start);
  const lineEnd = document.toCharacterOffset(lineRange.end);
  const focus = document.toCharacterOffset(range.start);
  const focusEnd = document.toCharacterOffset(range.end);
  let start = Math.max(
    lineStart,
    focus - Math.floor(Math.max(0, MAX_LINE_CHARACTERS - (focusEnd - focus)) / 2),
  );
  let end = Math.min(lineEnd, start + MAX_LINE_CHARACTERS);
  const startCode = document.text.charCodeAt(start);
  const endCode = document.text.charCodeAt(end);
  if (startCode >= 0xdc00 && startCode <= 0xdfff) start--;
  if (endCode >= 0xdc00 && endCode <= 0xdfff) end--;
  const excerptRange = { start: document.toByteOffset(start), end: document.toByteOffset(end) };
  return {
    range: { ...range },
    line,
    excerpt: `${start > lineStart ? "…" : ""}${document.text.slice(start, end)}${end < lineEnd ? "…" : ""}`,
    excerptRange,
    excerptTruncated: start > lineStart || end < lineEnd,
  };
}
