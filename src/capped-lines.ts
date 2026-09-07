import { MAX_PROTOCOL_LINE_BYTES } from "./types.js";

const MAX_DIAGNOSTIC_PREFIX_BYTES = 8 * 1024;

export interface CappedLineReaderOptions {
  maxLineBytes?: number;
  onLineTooLong?: (details: { prefix: string; observedBytes: number }) => void;
}

/**
 * Consume LF-delimited UTF-8 lines without allowing one unterminated line to
 * grow without a bound. Only LF is treated as a delimiter so U+2028/U+2029
 * inside JSON strings remain ordinary data.
 */
export async function consumeCappedLines(
  stream: AsyncIterable<Uint8Array>,
  onLine: (line: string) => void,
  options: CappedLineReaderOptions = {},
): Promise<void> {
  const maxLineBytes = options.maxLineBytes ?? MAX_PROTOCOL_LINE_BYTES;
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1)
    throw new Error("Capped line byte limit must be a positive safe integer");

  let lineChunks: Uint8Array[] = [];
  let lineBytes = 0;
  let discarding = false;

  const resetLine = () => {
    lineChunks = [];
    lineBytes = 0;
  };

  const lastLineByte = (): number | undefined => {
    const chunk = lineChunks.at(-1);
    return chunk && chunk.length > 0 ? chunk[chunk.length - 1] : undefined;
  };

  const prefixFor = (segment: Uint8Array, totalBytes: number): string => {
    const prefixBytes = Math.min(MAX_DIAGNOSTIC_PREFIX_BYTES, totalBytes);
    const prefix = Buffer.allocUnsafe(prefixBytes);
    let copied = 0;
    for (const chunk of lineChunks) {
      if (copied === prefixBytes) break;
      const length = Math.min(chunk.length, prefixBytes - copied);
      prefix.set(chunk.subarray(0, length), copied);
      copied += length;
    }
    if (copied < prefixBytes) {
      const length = Math.min(segment.length, prefixBytes - copied);
      prefix.set(segment.subarray(0, length), copied);
    }
    return prefix.toString("utf8");
  };

  const lineText = (withoutTrailingCarriageReturn: boolean): string => {
    const contentBytes = lineBytes - (withoutTrailingCarriageReturn && lineBytes > 0 ? 1 : 0);
    const bytes = Buffer.concat(lineChunks, lineBytes);
    return bytes.toString("utf8", 0, contentBytes);
  };

  const reportOverflow = (segment: Uint8Array, observedBytes: number, final: boolean): void => {
    if (!options.onLineTooLong)
      throw new Error(
        `Input line exceeds the ${String(maxLineBytes)}-byte limit${final ? " at end of stream" : ""}`,
      );
    options.onLineTooLong({
      prefix: prefixFor(segment, observedBytes),
      observedBytes,
    });
  };

  const consumeChunk = (chunk: Uint8Array, final: boolean) => {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline >= 0 ? newline : chunk.length;
      const segment = chunk.subarray(offset, end);

      if (discarding) {
        if (newline < 0) return;
        discarding = false;
        resetLine();
        offset = newline + 1;
        continue;
      }

      const observedBytes = lineBytes + segment.length;
      const hasTrailingCarriageReturn =
        newline >= 0 && observedBytes > 0 && (segment.at(-1) ?? lastLineByte()) === 13;
      const contentBytes = observedBytes - (hasTrailingCarriageReturn ? 1 : 0);
      if (contentBytes > maxLineBytes) {
        reportOverflow(segment, observedBytes, final && newline < 0);
        resetLine();
        if (newline < 0) discarding = true;
        else offset = newline + 1;
        continue;
      }

      if (segment.length > 0) lineChunks.push(segment);
      lineBytes = observedBytes;
      if (newline < 0) return;
      onLine(lineText(hasTrailingCarriageReturn));
      resetLine();
      offset = newline + 1;
    }
  };

  for await (const chunk of stream) consumeChunk(chunk, false);
  if (discarding) return;
  consumeChunk(new Uint8Array(), true);
  if (lineBytes > 0) onLine(lineText(false));
}
