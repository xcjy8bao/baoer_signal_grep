import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import {
  MAX_LINE_CHARACTERS,
  MAX_RESULT_BYTES,
  MAX_SOURCE_FILE_BYTES,
  type SourceRevision,
} from "./types.js";

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
  const output: string[] = [];
  let bytes = 0;
  let truncated = false;
  for (let line = boundedStart; line <= boundedEnd; line += 1) {
    const raw = lines[line - 1] ?? "";
    const compact =
      raw.length > MAX_LINE_CHARACTERS ? `${raw.slice(0, MAX_LINE_CHARACTERS)}…` : raw;
    const rendered = `${line}: ${compact}`;
    const addition = output.length === 0 ? rendered : `\n${rendered}`;
    const additionBytes = Buffer.byteLength(addition, "utf8");
    if (bytes + additionBytes > MAX_RESULT_BYTES) {
      truncated = true;
      break;
    }
    output.push(addition);
    bytes += additionBytes;
  }
  return {
    text: output.join(""),
    startLine: boundedStart,
    endLine: output.length === 0 ? boundedStart - 1 : boundedStart + output.length - 1,
    truncated,
  };
}
