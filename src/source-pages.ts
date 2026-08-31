import { SignalGrepError } from "./errors.js";
import { SourceDocument, type ByteRange, type SourcePosition } from "./source-document.js";

export interface SourceFragment extends ByteRange {
  text: string;
  startPosition: SourcePosition;
  endPosition: SourcePosition;
}

export interface SourcePage {
  fragment: SourceFragment;
  remaining: ByteRange[];
  text: string;
}

/** Half-open ranges, combined before allocating the shared response budget. */
export function mergeByteRanges(ranges: readonly ByteRange[]): ByteRange[] {
  const merged: ByteRange[] = [];
  for (const range of ranges.toSorted((a, b) => a.start - b.start || a.end - b.end)) {
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < 0 ||
      range.end < range.start
    ) {
      throw new SignalGrepError("Invalid source range");
    }
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

export function subtractByteRange(ranges: readonly ByteRange[], returned: ByteRange): ByteRange[] {
  const remaining: ByteRange[] = [];
  for (const range of ranges) {
    if (returned.end <= range.start || returned.start >= range.end) {
      remaining.push({ start: range.start, end: range.end });
      continue;
    }
    if (range.start < returned.start) remaining.push({ start: range.start, end: returned.start });
    if (returned.end < range.end) remaining.push({ start: returned.end, end: range.end });
  }
  return remaining;
}

function utf8Boundary(document: SourceDocument, offset: number, direction: -1 | 1): number {
  let byte = Math.max(0, Math.min(document.bytes.length, offset));
  while (byte > 0 && byte < document.bytes.length) {
    const value = document.bytes[byte];
    if (value === undefined || (value & 0xc0) !== 0x80) break;
    byte += direction;
  }
  return byte;
}

export function renderSourceFragment(fragment: SourceFragment): string {
  const header = `[source bytes ${String(fragment.start)}..${String(fragment.end)}; ${String(fragment.startPosition.line)}:${String(fragment.startPosition.column)}–${String(fragment.endPosition.line)}:${String(fragment.endPosition.column)}; UTF-8, end exclusive]`;
  const lines = fragment.text.split("\n");
  return [
    header,
    ...lines.map((text, index) => `${String(fragment.startPosition.line + index)}: ${text}`),
  ].join("\n");
}

/** Keep actual source characters; only the explicitly described range is paged. */
export function sourcePage(
  document: SourceDocument,
  ranges: readonly ByteRange[],
  maxBytes: number,
  focus?: number,
): SourcePage {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) {
    throw new SignalGrepError("Source page budget must allow at least 256 bytes");
  }
  const gaps = mergeByteRanges(ranges);
  const range =
    gaps.find((item) => focus !== undefined && item.start <= focus && focus < item.end) ?? gaps[0];
  if (!range) throw new SignalGrepError("Source range is already complete");
  document.checkRange(range);
  document.toCharacterOffset(range.start);
  document.toCharacterOffset(range.end);
  const target = Math.max(range.start, Math.min(range.end, focus ?? range.start));
  let available = Math.max(4, maxBytes - 160);
  for (;;) {
    let start = range.start;
    if (range.end - range.start > available && target - range.start > available / 2) {
      start = utf8Boundary(document, Math.floor(target - available / 2), 1);
    }
    start = Math.max(range.start, start);
    let end = utf8Boundary(document, Math.min(range.end, start + available), -1);
    if (end <= start && range.end > range.start) end = utf8Boundary(document, start + 1, 1);
    const fragment: SourceFragment = {
      start,
      end,
      text: document.slice({ start, end }),
      startPosition: document.positionAt(start),
      endPosition: document.positionAt(end),
    };
    const text = renderSourceFragment(fragment);
    if (Buffer.byteLength(text) <= maxBytes) {
      return {
        fragment,
        remaining: subtractByteRange(gaps, fragment).filter((gap) => gap.start < gap.end),
        text,
      };
    }
    if (available <= 4) throw new SignalGrepError("Source metadata exceeds the page budget");
    available = Math.max(4, Math.floor(available * 0.75));
  }
}
