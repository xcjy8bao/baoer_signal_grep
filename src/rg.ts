import { spawn } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { excerptText } from "./excerpt.js";
import { consumeCappedLines } from "./capped-lines.js";
import { assertExistingPathInsideCwd, getSourceRevision } from "./source.js";
import {
  MAX_PROTOCOL_LINE_BYTES,
  MAX_SOURCE_REVISION_CONCURRENCY,
  MAX_STORED_MATCHES,
  type MatchOccurrence,
  type MatchRecord,
  type SearchRequest,
  type SearchScan,
  type SourceRevision,
  type TextRange,
} from "./types.js";

interface RgText {
  text?: string;
  bytes?: string;
}

interface RgSubmatch {
  match: RgText;
  start: number;
  end: number;
}

interface RgMatchEvent {
  type: "match";
  data: {
    path: RgText;
    lines: RgText;
    line_number: number;
    submatches?: RgSubmatch[];
  };
}

export interface RipgrepRunnerOptions {
  executable?: string;
  maxStoredMatches?: number;
  maxEventBytes?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRgText(value: unknown): value is RgText {
  return isRecord(value) && (typeof value.text === "string" || typeof value.bytes === "string");
}

function isRgSubmatch(value: unknown): value is RgSubmatch {
  if (!isRecord(value)) return false;
  return (
    isRgText(value.match) &&
    typeof value.start === "number" &&
    Number.isSafeInteger(value.start) &&
    typeof value.end === "number" &&
    Number.isSafeInteger(value.end) &&
    value.start >= 0 &&
    value.end >= value.start
  );
}

function isRgMatchEvent(value: unknown): value is RgMatchEvent {
  if (!isRecord(value) || value.type !== "match" || !isRecord(value.data)) return false;
  const submatches = value.data.submatches;
  return (
    isRgText(value.data.path) &&
    isRgText(value.data.lines) &&
    typeof value.data.line_number === "number" &&
    Number.isSafeInteger(value.data.line_number) &&
    value.data.line_number > 0 &&
    (submatches === undefined || (Array.isArray(submatches) && submatches.every(isRgSubmatch)))
  );
}

interface DecodedRgText {
  text: string;
  bytes: Buffer;
  encoding: "utf-8" | "utf-16";
}

function decodeRgText(value: RgText, field: string): DecodedRgText {
  if (typeof value.text === "string") {
    return { text: value.text, bytes: Buffer.from(value.text, "utf8"), encoding: "utf-16" };
  }
  if (typeof value.bytes === "string") {
    const bytes = Buffer.from(value.bytes, "base64");
    return { text: bytes.toString("utf8"), bytes, encoding: "utf-8" };
  }
  throw new SignalGrepError(`ripgrep JSON event omitted ${field}`);
}

function displayPath(rawPath: string, cwd: string): { absolutePath: string; displayPath: string } {
  const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
  const localPath = relative(cwd, absolutePath).replaceAll("\\", "/");
  const isInsideCwd = localPath !== ".." && !localPath.startsWith("../") && !isAbsolute(localPath);
  return {
    absolutePath,
    displayPath: isInsideCwd && localPath.length > 0 ? localPath : absolutePath,
  };
}

function assertSearchPathInsideCwd(searchPath: string, cwd: string): void {
  const localPath = relative(resolve(cwd), searchPath);
  if (localPath === ".." || localPath.startsWith("../") || isAbsolute(localPath)) {
    throw new SignalGrepError("Search path must stay within the working directory");
  }
}

function utf16Length(value: string): number {
  return value.length;
}

function byteOffsetToCharacter(
  bytes: Buffer,
  byteOffset: number,
  encoding: "utf-8" | "utf-16",
): number {
  if (byteOffset < 0 || byteOffset > bytes.length) {
    throw new SignalGrepError("ripgrep emitted a submatch outside its matching line");
  }
  if (encoding === "utf-8") return byteOffset;
  const prefix = bytes.subarray(0, byteOffset).toString("utf8").replaceAll("\r", "");
  return utf16Length(prefix);
}

function createOccurrences(
  lineNumber: number,
  decodedLine: DecodedRgText,
  submatches: RgSubmatch[],
): MatchOccurrence[] {
  const range: TextRange = {
    start: { line: lineNumber - 1, character: 0 },
    end: { line: lineNumber - 1, character: 0 },
    encoding: decodedLine.encoding,
  };
  const occurrences: MatchOccurrence[] = [];
  for (const submatch of submatches) {
    if (submatch.end > decodedLine.bytes.length) {
      throw new SignalGrepError("ripgrep emitted a submatch outside its matching line");
    }
    occurrences.push({
      byteStart: submatch.start,
      byteEnd: submatch.end,
      range: {
        start: {
          ...range.start,
          character: byteOffsetToCharacter(decodedLine.bytes, submatch.start, range.encoding),
        },
        end: {
          ...range.end,
          character: byteOffsetToCharacter(decodedLine.bytes, submatch.end, range.encoding),
        },
        encoding: range.encoding,
      },
    });
  }
  return occurrences;
}

async function captureSourceRevisions(
  paths: ReadonlySet<string>,
): Promise<Map<string, SourceRevision>> {
  const pathList = [...paths];
  const entries: Array<readonly [string, SourceRevision] | undefined> = Array(pathList.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      const path = pathList[index];
      if (path === undefined) return;
      // The concurrency bound prevents a broad search from exhausting file descriptors.
      // oxlint-disable-next-line no-await-in-loop -- each worker owns one bounded queue slot.
      const revision = await getSourceRevision(path);
      if (revision) entries[index] = [path, revision];
    }
  };
  const workerCount = Math.min(MAX_SOURCE_REVISION_CONCURRENCY, pathList.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return new Map(
    entries.filter((entry): entry is readonly [string, SourceRevision] => entry !== undefined),
  );
}

export function buildRipgrepArguments(request: SearchRequest, cwd: string): string[] {
  const args = ["--json", "--line-number", "--color=never", "--no-heading"];

  if (request.hidden) args.push("--hidden");
  args.push("--glob", "!.git/**", "--glob", "!**/.git/**");

  for (const glob of request.glob) args.push("--glob", glob);
  for (const excluded of request.exclude) {
    const normalized = excluded.startsWith("!") ? excluded : `!${excluded}`;
    args.push("--glob", normalized);
  }

  if (request.literal) args.push("--fixed-strings");
  if (request.ignoreCase === true) args.push("--ignore-case");
  else if (request.ignoreCase === false) args.push("--case-sensitive");
  else args.push("--smart-case");

  const searchPath = resolve(cwd, request.path ?? ".");
  assertSearchPathInsideCwd(searchPath, cwd);
  args.push("--", request.pattern, searchPath);
  return args;
}

export function createRipgrepRunner(options: RipgrepRunnerOptions = {}) {
  const executable = options.executable ?? "rg";
  const maxStoredMatches = options.maxStoredMatches ?? MAX_STORED_MATCHES;
  const maxEventBytes = options.maxEventBytes ?? MAX_PROTOCOL_LINE_BYTES;

  return async function runRipgrep(
    request: SearchRequest,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SearchScan> {
    if (signal?.aborted) throw abortError();
    await assertExistingPathInsideCwd(resolve(cwd, request.path ?? "."), cwd);

    return new Promise<SearchScan>((resolveSearch, rejectSearch) => {
      const child = spawn(executable, buildRipgrepArguments(request, cwd), {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const matches: MatchRecord[] = [];
      const fileCounts = new Map<string, number>();
      let totalMatches = 0;
      let truncatedLines = 0;
      let stderr = "";
      let aborted = false;

      const closePromise = new Promise<number | null>((resolveClose, rejectClose) => {
        child.once("error", rejectClose);
        child.once("close", resolveClose);
      });

      const onLine = (line: string) => {
        if (line.length === 0) return;
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch (error) {
          throw new SignalGrepError("Failed to parse ripgrep JSON output", { cause: error });
        }
        if (!isRecord(event) || event.type !== "match") return;
        if (!isRgMatchEvent(event)) {
          throw new SignalGrepError("ripgrep emitted an invalid match event");
        }

        const rawPath = decodeRgText(event.data.path, "path");
        const rawContent = decodeRgText(event.data.lines, "line content");
        const normalizedContent = rawContent.text.replaceAll("\r", "").replace(/\n$/, "");
        const path = displayPath(rawPath.text, cwd);
        const submatches = event.data.submatches ?? [];
        const occurrences = createOccurrences(event.data.line_number, rawContent, submatches);
        const primaryOccurrence = occurrences[0];
        let focusStart = 0;
        let focusEnd = 0;
        if (primaryOccurrence) {
          if (primaryOccurrence.range.encoding === "utf-16") {
            focusStart = primaryOccurrence.range.start.character;
            focusEnd = primaryOccurrence.range.end.character;
          } else {
            focusStart = primaryOccurrence.byteStart;
            focusEnd = primaryOccurrence.byteEnd;
          }
        }
        const excerpt = excerptText(normalizedContent, focusStart, focusEnd);
        const { text: lineContent, truncated: lineTruncated } = excerpt;

        totalMatches += 1;
        fileCounts.set(path.displayPath, (fileCounts.get(path.displayPath) ?? 0) + 1);
        if (lineTruncated) truncatedLines += 1;
        if (matches.length < maxStoredMatches) {
          matches.push({
            ...path,
            lineNumber: event.data.line_number,
            lineContent,
            lineTruncated,
            occurrences,
          });
        }
      };

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 16_384) stderr += chunk.toString("utf8");
      });

      const onAbort = () => {
        aborted = true;
        if (!child.killed) child.kill();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      void (async () => {
        try {
          const outputPromise = consumeCappedLines(child.stdout, onLine, {
            maxLineBytes: maxEventBytes,
          });
          const [code] = await Promise.all([closePromise, outputPromise]);
          if (aborted || signal?.aborted) {
            rejectSearch(abortError());
            return;
          }
          if (code !== 0 && code !== 1) {
            rejectSearch(
              new SignalGrepError(stderr.trim() || `ripgrep exited with status ${String(code)}`),
            );
            return;
          }

          const retainedPaths = new Set(matches.map((match) => match.absolutePath));
          const sourceRevisions = await captureSourceRevisions(retainedPaths);
          resolveSearch({
            request,
            matches,
            totalMatches,
            fileCounts,
            sourceRevisions,
            snapshotComplete: matches.length === totalMatches,
            truncatedLines,
          });
        } catch (error) {
          if (!child.killed) child.kill();
          if (aborted || signal?.aborted) {
            rejectSearch(abortError());
            return;
          }
          const cause = error instanceof Error ? error : new Error(String(error));
          const executableMissing = "code" in cause && cause.code === "ENOENT";
          const message = executableMissing
            ? `ripgrep executable not found: ${executable}`
            : cause.message;
          rejectSearch(new SignalGrepError(message, { cause }));
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      })();
    });
  };
}

export type RipgrepRunner = ReturnType<typeof createRipgrepRunner>;
