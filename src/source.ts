import { readFile, realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { excerptText } from "./excerpt.js";
import {
  MAX_RESULT_BYTES,
  MAX_SOURCE_FILE_BYTES,
  type MatchOccurrence,
  type SourceRevision,
} from "./types.js";

const SOURCE_RANGE_METADATA_RESERVE_BYTES = 1024;
const MAX_SOURCE_RANGE_BYTES = MAX_RESULT_BYTES - SOURCE_RANGE_METADATA_RESERVE_BYTES;

export async function getSourceRevision(path: string): Promise<SourceRevision | undefined> {
  try {
    const metadata = await stat(path);
    return sourceRevisionFromStats(metadata);
  } catch {
    return undefined;
  }
}

export function sourceRevisionFromStats(metadata: Stats): SourceRevision {
  return {
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
    ...(metadata.ino !== 0 ? { inode: metadata.ino } : {}),
    ...(metadata.dev !== 0 ? { device: metadata.dev } : {}),
  };
}

export function sameSourceRevision(left: SourceRevision, right: SourceRevision): boolean {
  return (
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    (left.ctimeMs === undefined || right.ctimeMs === undefined || left.ctimeMs === right.ctimeMs) &&
    left.inode === right.inode &&
    left.device === right.device
  );
}

export function isPathInsideCwd(path: string, cwd: string): boolean {
  const localPath = relative(resolve(cwd), resolve(path));
  return localPath !== ".." && !localPath.startsWith(`..${sep}`) && !isAbsolute(localPath);
}

export async function assertExistingPathInsideCwd(path: string, cwd: string): Promise<void> {
  if (!isPathInsideCwd(path, cwd)) {
    throw new SignalGrepError("Path must stay within the working directory");
  }
  try {
    const [realCwd, realPath] = await Promise.all([realpath(cwd), realpath(path)]);
    if (!isPathInsideCwd(realPath, realCwd)) {
      throw new SignalGrepError("Path must stay within the working directory");
    }
  } catch (error) {
    if (error instanceof SignalGrepError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export class SourceTooLargeError extends SignalGrepError {
  constructor(message: string) {
    super(message);
    this.name = "SourceTooLargeError";
  }
}

export class SourceBudgetTooSmallError extends SignalGrepError {
  constructor() {
    super("Source target line exceeds the available byte budget");
    this.name = "SourceBudgetTooSmallError";
  }
}

export class SourceLineUnavailableError extends SignalGrepError {
  constructor(line: number) {
    super(`Source line ${String(line)} is beyond the end of the file`);
    this.name = "SourceLineUnavailableError";
  }
}

export interface SourceRangeRead {
  text: string;
  lines: SourceExcerptLine[];
  startLine: number;
  endLine: number;
  truncated: boolean;
  omittedBefore: number;
  omittedAfter: number;
  truncatedLines: number[];
}

export interface SourceExcerptLine {
  line: number;
  text: string;
  truncated: boolean;
}

export interface SourceRangeOptions {
  maxBytes?: number;
  focus?: MatchOccurrence;
}

interface SelectedSourceWindow {
  lines: SourceExcerptLine[];
  startIndex: number;
  endIndex: number;
}

function sourceLineBytes(line: SourceExcerptLine): number {
  return Buffer.byteLength(`${String(line.line)}: ${line.text}`, "utf8");
}

function selectSourceWindow(
  rendered: SourceExcerptLine[],
  targetIndex: number,
  maxBytes: number,
): SelectedSourceWindow {
  let startIndex = targetIndex;
  let endIndex = targetIndex;
  const target = rendered[targetIndex];
  if (!target) throw new Error("Source target line is unavailable");
  let bytes = sourceLineBytes(target);
  if (bytes > maxBytes) throw new SourceBudgetTooSmallError();
  let canGrowBefore = true;
  let canGrowAfter = true;

  while (canGrowBefore || canGrowAfter) {
    let grew = false;
    if (canGrowBefore) {
      const candidate = rendered[startIndex - 1];
      if (candidate === undefined) {
        canGrowBefore = false;
      } else if (bytes + 1 + sourceLineBytes(candidate) <= maxBytes) {
        startIndex -= 1;
        bytes += 1 + sourceLineBytes(candidate);
        grew = true;
      } else {
        canGrowBefore = false;
      }
    }

    if (canGrowAfter) {
      const candidate = rendered[endIndex + 1];
      if (candidate === undefined) {
        canGrowAfter = false;
      } else if (bytes + 1 + sourceLineBytes(candidate) <= maxBytes) {
        endIndex += 1;
        bytes += 1 + sourceLineBytes(candidate);
        grew = true;
      } else {
        canGrowAfter = false;
      }
    }

    if (!grew && !canGrowBefore && !canGrowAfter) break;
  }

  return { lines: rendered.slice(startIndex, endIndex + 1), startIndex, endIndex };
}

export async function readSourceRange(
  absolutePath: string,
  startLine: number,
  endLine: number,
  signal?: AbortSignal,
  targetLine = startLine,
  options: SourceRangeOptions = {},
): Promise<SourceRangeRead> {
  if (signal?.aborted) throw abortError();
  const maxBytes = options.maxBytes ?? MAX_SOURCE_RANGE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_SOURCE_RANGE_BYTES) {
    throw new Error("Source range byte budget must be within the result body limit");
  }
  const metadata = await stat(absolutePath, { bigint: false });
  if (metadata.size > MAX_SOURCE_FILE_BYTES) {
    throw new SourceTooLargeError(
      `Source file exceeds the ${String(MAX_SOURCE_FILE_BYTES)}-byte source limit`,
    );
  }
  const content = await readFile(absolutePath, { signal });
  if (content.byteLength > MAX_SOURCE_FILE_BYTES) {
    throw new SourceTooLargeError(
      `Source file exceeds the ${String(MAX_SOURCE_FILE_BYTES)}-byte source limit`,
    );
  }
  return sourceRangeFromBytes(content, startLine, endLine, targetLine, options);
}

export function sourceRangeFromBytes(
  content: Buffer,
  startLine: number,
  endLine: number,
  targetLine = startLine,
  options: SourceRangeOptions = {},
): SourceRangeRead {
  const maxBytes = options.maxBytes ?? MAX_SOURCE_RANGE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_SOURCE_RANGE_BYTES)
    throw new Error("Source range byte budget must be within the result body limit");
  // ripgrep counts LF-delimited lines. Keep original bytes until byte-based
  // occurrence offsets have been decoded; re-encoding replacement characters
  // would move the focus in files containing invalid UTF-8.
  const lines: Buffer[] = [];
  let lineStart = 0;
  for (let newline = content.indexOf(10); newline >= 0; newline = content.indexOf(10, lineStart)) {
    lines.push(content.subarray(lineStart, newline));
    lineStart = newline + 1;
  }
  lines.push(content.subarray(lineStart));
  const boundedStart = Math.max(1, startLine);
  if (boundedStart > lines.length) {
    throw new SourceLineUnavailableError(targetLine);
  }
  const boundedEnd = Math.min(lines.length, Math.max(boundedStart, endLine));
  if (targetLine < 1 || targetLine > lines.length) {
    throw new SourceLineUnavailableError(targetLine);
  }
  const boundedTarget = Math.min(boundedEnd, Math.max(boundedStart, targetLine));
  const rendered = Array.from({ length: boundedEnd - boundedStart + 1 }, (_, index) => {
    const lineNumber = boundedStart + index;
    const raw = lines[lineNumber - 1];
    if (!raw) throw new Error("Source line is unavailable");
    const focus = lineNumber === targetLine ? options.focus : undefined;
    const start = focus?.range.start.character ?? 0;
    const end = focus?.range.end.character ?? start;
    const bytes = focus?.range.encoding === "utf-8" ? raw : undefined;
    const excerpt = excerptText(
      raw.toString("utf8").replaceAll("\r", ""),
      bytes ? bytes.subarray(0, start).toString("utf8").replaceAll("\r", "").length : start,
      bytes ? bytes.subarray(0, end).toString("utf8").replaceAll("\r", "").length : end,
    );
    return { line: lineNumber, text: excerpt.text, truncated: excerpt.truncated };
  });
  const selected = selectSourceWindow(rendered, boundedTarget - boundedStart, maxBytes);
  const omittedBefore = selected.startIndex;
  const omittedAfter = rendered.length - selected.endIndex - 1;
  return {
    text: selected.lines.map((line) => `${String(line.line)}: ${line.text}`).join("\n"),
    lines: selected.lines,
    startLine: boundedStart + selected.startIndex,
    endLine: boundedStart + selected.endIndex,
    truncated: omittedBefore > 0 || omittedAfter > 0,
    omittedBefore,
    omittedAfter,
    truncatedLines: selected.lines.filter((line) => line.truncated).map((line) => line.line),
  };
}
