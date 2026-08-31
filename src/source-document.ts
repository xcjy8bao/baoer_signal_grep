import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import {
  getSourceRevision,
  isPathInsideCwd,
  sameSourceRevision,
  sourceRevisionFromStats,
} from "./source.js";
import { MAX_SOURCE_FILE_BYTES, type SourceRevision } from "./types.js";

export type SourceOrigin =
  | { kind: "worktree"; revision: SourceRevision; contentHash: string }
  | { kind: "git"; commit: string; blob: string };

export interface SourceReference {
  path: string;
  origin: SourceOrigin;
}

export interface ByteRange {
  start: number;
  end: number;
}

export interface SourcePosition {
  line: number;
  /** One-based UTF-16 column, with the byte range remaining authoritative. */
  column: number;
}

export class SourceDocumentError extends SignalGrepError {
  readonly reason: "source-changed" | "source-unavailable" | "file-too-large" | "encoding";

  constructor(
    reason: "source-changed" | "source-unavailable" | "file-too-large" | "encoding",
    message: string,
  ) {
    super(message);
    this.reason = reason;
    this.name = "SourceDocumentError";
  }
}

export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** One verified read. Byte offsets refer to the original, unnormalized source. */
export class SourceDocument {
  readonly reference: SourceReference;
  readonly bytes: Buffer;
  readonly text: string;
  readonly utf8: boolean;
  readonly lineStarts: number[] = [0];
  #byteOffsets?: Uint32Array;

  constructor(reference: SourceReference, bytes: Buffer) {
    this.reference = reference;
    this.bytes = bytes;
    if (bytes.length > MAX_SOURCE_FILE_BYTES) {
      throw new SourceDocumentError("file-too-large", "Source exceeds the 5 MiB file limit");
    }
    this.utf8 = isUtf8(bytes);
    this.text = bytes.toString("utf8");
    for (let index = bytes.indexOf(10); index >= 0; index = bytes.indexOf(10, index + 1)) {
      this.lineStarts.push(index + 1);
    }
  }

  get path(): string {
    return this.reference.path;
  }

  toByteOffset(character: number): number {
    this.#requireUtf8();
    if (!Number.isSafeInteger(character) || character < 0 || character > this.text.length) {
      throw new SignalGrepError("Source character offset is outside the document");
    }
    const code = this.text.charCodeAt(character);
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new SignalGrepError("Source character offset splits a Unicode character");
    }
    const value = this.#offsets()[character];
    if (value === undefined) throw new Error("Missing source offset");
    return value;
  }

  toCharacterOffset(byte: number): number {
    this.#requireUtf8();
    this.checkRange({ start: byte, end: byte });
    const offsets = this.#offsets();
    let low = 0;
    let high = offsets.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const value = offsets[middle];
      if (value === undefined) throw new Error("Missing source offset");
      if (value < byte) low = middle + 1;
      else high = middle;
    }
    if (offsets[low] !== byte) {
      throw new SignalGrepError("Source byte offset splits a Unicode character");
    }
    return low;
  }

  lineAt(byte: number): number {
    this.checkRange({ start: byte, end: byte });
    let low = 0;
    let high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      const start = this.lineStarts[middle];
      if (start === undefined) throw new Error("Missing source line");
      if (start <= byte) low = middle;
      else high = middle;
    }
    return low + 1;
  }

  positionAt(byte: number): SourcePosition {
    const line = this.lineAt(byte);
    const start = this.lineStarts[line - 1];
    if (start === undefined) throw new Error("Missing source line");
    return {
      line,
      column: this.toCharacterOffset(byte) - this.toCharacterOffset(start) + 1,
    };
  }

  lineRange(startLine: number, endLine = startLine): ByteRange {
    if (
      !Number.isSafeInteger(startLine) ||
      !Number.isSafeInteger(endLine) ||
      startLine < 1 ||
      endLine < startLine ||
      startLine > this.lineStarts.length
    ) {
      throw new SignalGrepError("Source line range is outside the document");
    }
    const start = this.lineStarts[startLine - 1];
    if (start === undefined) throw new Error("Missing source line");
    return { start, end: this.lineStarts[endLine] ?? this.bytes.length };
  }

  slice(range: ByteRange): string {
    this.#requireUtf8();
    this.checkRange(range);
    this.toCharacterOffset(range.start);
    this.toCharacterOffset(range.end);
    return this.bytes.subarray(range.start, range.end).toString("utf8");
  }

  checkRange(range: ByteRange): void {
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < 0 ||
      range.end < range.start ||
      range.end > this.bytes.length
    ) {
      throw new SignalGrepError("Source byte range is outside the document");
    }
  }

  #requireUtf8(): void {
    if (!this.utf8) {
      throw new SourceDocumentError("encoding", "Source is not losslessly representable as UTF-8");
    }
  }

  #offsets(): Uint32Array {
    if (this.#byteOffsets) return this.#byteOffsets;
    const offsets = new Uint32Array(this.text.length + 1);
    let character = 0;
    let byte = 0;
    for (const point of this.text) {
      offsets[character] = byte;
      if (point.length === 2) offsets[character + 1] = byte;
      character += point.length;
      byte += Buffer.byteLength(point);
    }
    offsets[character] = byte;
    this.#byteOffsets = offsets;
    return offsets;
  }
}

export async function readWorkspaceDocument(
  path: string,
  cwd: string,
  signal?: AbortSignal,
  expected?: SourceOrigin,
  readBudget = MAX_SOURCE_FILE_BYTES,
): Promise<SourceDocument> {
  if (signal?.aborted) throw abortError();
  if (expected?.kind === "git") {
    throw new SignalGrepError("A Git source reference cannot be read from the worktree");
  }
  const absolute = resolve(cwd, path);
  if (!isPathInsideCwd(absolute, cwd)) throw new SignalGrepError("Source path must stay in cwd");
  const [root, canonical] = await Promise.all([realpath(cwd), realpath(absolute)]);
  if (!isPathInsideCwd(canonical, root)) throw new SignalGrepError("Source path must stay in cwd");
  const before = await getSourceRevision(absolute);
  if (!before) throw new SourceDocumentError("source-unavailable", "Source is unavailable");
  if (expected && !sameSourceRevision(before, expected.revision)) {
    throw new SourceDocumentError("source-changed", "Source changed; start a new inspection");
  }
  if (before.size > Math.min(MAX_SOURCE_FILE_BYTES, readBudget)) {
    throw new SourceDocumentError("file-too-large", "Source exceeds the 5 MiB file limit");
  }
  if (signal?.aborted) throw abortError();
  const handle = await open(canonical, "r");
  let bytes: Buffer;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new SourceDocumentError("source-unavailable", "Source must be a regular file");
    }
    if (!sameSourceRevision(before, sourceRevisionFromStats(metadata))) {
      throw new SourceDocumentError("source-changed", "Source was replaced before reading");
    }
    const buffer = Buffer.alloc(before.size);
    let used = 0;
    while (used < buffer.length) {
      if (signal?.aborted) throw abortError();
      // oxlint-disable-next-line no-await-in-loop -- each positional read advances the same file buffer.
      const read = await handle.read(buffer, used, buffer.length - used, used);
      if (read.bytesRead === 0) break;
      used += read.bytesRead;
    }
    if (used !== before.size) {
      throw new SourceDocumentError("source-changed", "Source changed during reading");
    }
    bytes = buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
  const [after, finalPath] = await Promise.all([getSourceRevision(absolute), realpath(absolute)]);
  if (!after || canonical !== finalPath || !sameSourceRevision(before, after)) {
    throw new SourceDocumentError("source-changed", "Source changed during reading");
  }
  if (signal?.aborted) throw abortError();
  const hash = contentHash(bytes);
  if (expected && expected.contentHash !== hash) {
    throw new SourceDocumentError(
      "source-changed",
      "Source content changed; start a new inspection",
    );
  }
  return new SourceDocument(
    {
      path: relative(resolve(cwd), absolute),
      origin: { kind: "worktree", revision: after, contentHash: hash },
    },
    bytes,
  );
}
