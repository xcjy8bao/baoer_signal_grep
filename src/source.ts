import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { excerptText } from "./excerpt.js";
import { MAX_RESULT_BYTES, MAX_SOURCE_FILE_BYTES, type SourceRevision } from "./types.js";

const SOURCE_RANGE_METADATA_RESERVE_BYTES = 1024;
const MAX_SOURCE_RANGE_BYTES = MAX_RESULT_BYTES - SOURCE_RANGE_METADATA_RESERVE_BYTES;

export async function getSourceRevision(path: string): Promise<SourceRevision | undefined> {
  try {
    const metadata = await stat(path);
    return {
      size: metadata.size,
      mtimeMs: metadata.mtimeMs,
      ...(metadata.ino !== 0 ? { inode: metadata.ino } : {}),
      ...(metadata.dev !== 0 ? { device: metadata.dev } : {}),
    };
  } catch {
    return undefined;
  }
}

export function sameSourceRevision(left: SourceRevision, right: SourceRevision): boolean {
  return (
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.inode === right.inode &&
    left.device === right.device
  );
}

export function isPathInsideCwd(path: string, cwd: string): boolean {
  const localPath = relative(resolve(cwd), resolve(path));
  return localPath !== ".." && !localPath.startsWith("../") && !isAbsolute(localPath);
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

export interface SourceRangeRead {
  text: string;
  startLine: number;
  endLine: number;
  truncated: boolean;
  omittedBefore: number;
  omittedAfter: number;
}

interface SelectedSourceWindow {
  lines: string[];
  startIndex: number;
  endIndex: number;
}

function selectSourceWindow(rendered: string[], targetIndex: number): SelectedSourceWindow {
  let startIndex = targetIndex;
  let endIndex = targetIndex;
  let bytes = Buffer.byteLength(rendered[targetIndex] ?? "", "utf8");
  let canGrowBefore = true;
  let canGrowAfter = true;

  while (canGrowBefore || canGrowAfter) {
    let grew = false;
    if (canGrowBefore) {
      const candidate = rendered[startIndex - 1];
      if (candidate === undefined) {
        canGrowBefore = false;
      } else if (bytes + 1 + Buffer.byteLength(candidate, "utf8") <= MAX_SOURCE_RANGE_BYTES) {
        startIndex -= 1;
        bytes += 1 + Buffer.byteLength(candidate, "utf8");
        grew = true;
      } else {
        canGrowBefore = false;
      }
    }

    if (canGrowAfter) {
      const candidate = rendered[endIndex + 1];
      if (candidate === undefined) {
        canGrowAfter = false;
      } else if (bytes + 1 + Buffer.byteLength(candidate, "utf8") <= MAX_SOURCE_RANGE_BYTES) {
        endIndex += 1;
        bytes += 1 + Buffer.byteLength(candidate, "utf8");
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
): Promise<SourceRangeRead> {
  if (signal?.aborted) throw abortError();
  const metadata = await stat(absolutePath, { bigint: false });
  if (metadata.size > MAX_SOURCE_FILE_BYTES) {
    throw new SourceTooLargeError(
      `Source file exceeds the ${String(MAX_SOURCE_FILE_BYTES)}-byte source limit`,
    );
  }
  const content = await readFile(absolutePath, { encoding: "utf8", signal });
  const lines = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const boundedStart = Math.max(1, startLine);
  if (boundedStart > lines.length) {
    throw new SignalGrepError(`Source line ${String(targetLine)} is beyond the end of the file`);
  }
  const boundedEnd = Math.min(lines.length, Math.max(boundedStart, endLine));
  if (targetLine < 1 || targetLine > lines.length) {
    throw new SignalGrepError(`Source line ${String(targetLine)} is beyond the end of the file`);
  }
  const boundedTarget = Math.min(boundedEnd, Math.max(boundedStart, targetLine));
  const rendered = Array.from({ length: boundedEnd - boundedStart + 1 }, (_, index) => {
    const lineNumber = boundedStart + index;
    return `${String(lineNumber)}: ${excerptText(lines[lineNumber - 1] ?? "").text}`;
  });
  const selected = selectSourceWindow(rendered, boundedTarget - boundedStart);
  const omittedBefore = selected.startIndex;
  const omittedAfter = rendered.length - selected.endIndex - 1;
  return {
    text: selected.lines.join("\n"),
    startLine: boundedStart + selected.startIndex,
    endLine: boundedStart + selected.endIndex,
    truncated: omittedBefore > 0 || omittedAfter > 0,
    omittedBefore,
    omittedAfter,
  };
}
