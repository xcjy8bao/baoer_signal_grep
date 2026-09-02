import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { excerptText } from "./excerpt.js";
import { consumeCappedLines } from "./capped-lines.js";
import { assertExistingPathInsideCwd } from "./source.js";
import { runOwnedProcess } from "./owned-process.js";
import { captureCandidateRevisions, retainStableSourceRevisions } from "./scan-revisions.js";
import {
  MAX_PROTOCOL_LINE_BYTES,
  MAX_SOURCE_REVISION_FILES,
  MAX_STORED_MATCHES,
  type MatchOccurrence,
  type MatchRecord,
  type SearchRequest,
  type SearchScan,
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
  maxSourceRevisionFiles?: number;
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

function assertOutsideGit(searchPath: string): void {
  if (searchPath.split(sep).includes(".git")) {
    throw new SignalGrepError("Git internals are excluded from search");
  }
}

function assertSearchPathInsideCwd(searchPath: string, cwd: string): void {
  const localPath = relative(resolve(cwd), searchPath);
  if (localPath === ".." || localPath.startsWith(`..${sep}`) || isAbsolute(localPath)) {
    throw new SignalGrepError("Search path must stay within the working directory");
  }
  assertOutsideGit(searchPath);
}

async function assertResolvedTargetOutsideGit(searchPath: string): Promise<void> {
  try {
    // Explicit file arguments bypass rg's globs. Resolve both symbolic links
    // and filesystem case aliases before allowing that target to be searched.
    assertOutsideGit(await realpath(searchPath));
  } catch (error) {
    // Leave missing-path diagnostics to the search process, as with workspace validation.
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
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

export function fileScopeArguments(
  request: Pick<SearchRequest, "hidden" | "glob" | "exclude">,
): string[] {
  const args: string[] = [];
  if (request.hidden) args.push("--hidden");
  for (const glob of request.glob) args.push("--glob", glob);
  for (const excluded of request.exclude) {
    const normalized = excluded.startsWith("!") ? excluded : `!${excluded}`;
    args.push("--glob", normalized);
  }
  // Ripgrep gives the last matching glob priority, so this invariant must come last.
  args.push("--glob", "!.git", "--glob", "!.git/**", "--glob", "!**/.git/**");
  return args;
}

export function buildRipgrepArguments(request: SearchRequest, cwd: string): string[] {
  const args = [
    "--no-config",
    "--json",
    "--line-number",
    "--color=never",
    "--no-heading",
    ...fileScopeArguments(request),
  ];

  args.push(...patternArguments(request));

  const searchPath = resolve(cwd, request.path ?? ".");
  assertSearchPathInsideCwd(searchPath, cwd);
  const searchTarget = relative(resolve(cwd), searchPath) || ".";
  args.push("--", request.pattern, searchTarget);
  return args;
}

export function patternArguments(request: Pick<SearchRequest, "literal" | "ignoreCase">): string[] {
  return [
    ...(request.literal ? ["--fixed-strings"] : []),
    request.ignoreCase === true
      ? "--ignore-case"
      : request.ignoreCase === false
        ? "--case-sensitive"
        : "--smart-case",
  ];
}

export function createRipgrepRunner(options: RipgrepRunnerOptions = {}) {
  const executable = options.executable ?? "rg";
  const maxStoredMatches = options.maxStoredMatches ?? MAX_STORED_MATCHES;
  const maxEventBytes = options.maxEventBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const maxSourceRevisionFiles = options.maxSourceRevisionFiles ?? MAX_SOURCE_REVISION_FILES;

  return async function runRipgrep(
    request: SearchRequest,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SearchScan> {
    if (signal?.aborted) throw abortError();
    const searchPath = resolve(cwd, request.path ?? ".");
    const searchTarget = relative(resolve(cwd), searchPath) || ".";
    const args = buildRipgrepArguments(request, cwd);
    await assertExistingPathInsideCwd(searchPath, cwd);
    await assertResolvedTargetOutsideGit(searchPath);
    if (signal?.aborted) throw abortError();

    const matches: MatchRecord[] = [];
    const fileCounts = new Map<string, number>();
    const lossyPaths = new Set<string>();
    let totalMatches = 0;
    let truncatedLines = 0;

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
      if (rawPath.encoding === "utf-8") lossyPaths.add(path.absolutePath);
      const submatches = event.data.submatches ?? [];
      const occurrences = createOccurrences(event.data.line_number, rawContent, submatches);
      const primaryOccurrence = occurrences[0];
      let focusStart = 0;
      let focusEnd = 0;
      if (primaryOccurrence) {
        focusStart = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.byteStart, "utf-16");
        focusEnd = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.byteEnd, "utf-16");
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

    try {
      const before = await captureCandidateRevisions(
        executable,
        ["--no-config", "--files", "--null", ...fileScopeArguments(request), "--", searchTarget],
        cwd,
        maxSourceRevisionFiles,
        signal,
      );
      const { code, stderr } = await runOwnedProcess(
        { executable, args, cwd, ...(signal ? { signal } : {}) },
        (stdout) => consumeCappedLines(stdout, onLine, { maxLineBytes: maxEventBytes }),
      );
      if (code !== 0 && code !== 1) {
        throw new SignalGrepError(stderr.trim() || `ripgrep exited with status ${String(code)}`);
      }
      const retainedPaths = new Set(
        matches.map((match) => match.absolutePath).filter((path) => !lossyPaths.has(path)),
      );
      const sourceRevisions = await retainStableSourceRevisions(retainedPaths, before, signal);
      if (signal?.aborted) throw abortError();
      return {
        request,
        matches,
        totalMatches,
        fileCounts,
        sourceRevisions,
        snapshotComplete: matches.length === totalMatches,
        truncatedLines,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw abortError();
      const cause = error instanceof Error ? error : new Error(String(error));
      const executableMissing = "code" in cause && cause.code === "ENOENT";
      const message = executableMissing
        ? `ripgrep executable not found: ${executable}`
        : cause.message;
      throw new SignalGrepError(message, { cause });
    }
  };
}

export type RipgrepRunner = ReturnType<typeof createRipgrepRunner>;
