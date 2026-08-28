import { StringDecoder } from "node:string_decoder";
import { MAX_PROTOCOL_LINE_BYTES } from "./types.js";

export interface CappedLineReaderOptions {
  maxLineBytes?: number;
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
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  const consumeBuffer = (final: boolean) => {
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
        throw new Error(`Input line exceeds the ${String(maxLineBytes)}-byte limit`);
      }
      onLine(line);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }

    if (Buffer.byteLength(buffer, "utf8") > maxLineBytes) {
      throw new Error(
        `Input line exceeds the ${String(maxLineBytes)}-byte limit${final ? " at end of stream" : ""}`,
      );
    }
  };

  for await (const chunk of stream) {
    buffer += decoder.write(Buffer.from(chunk));
    consumeBuffer(false);
  }

  buffer += decoder.end();
  consumeBuffer(true);
  if (buffer.length > 0) onLine(buffer);
}
