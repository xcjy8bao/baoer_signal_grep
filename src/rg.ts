import { isAbsolute, relative, resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { excerptText } from "./excerpt.js";
import { SearchRetention } from "./search-retention.js";
import { consumeCappedLines } from "./capped-lines.js";
import { isPathInsideCwd, SearchPathPolicy } from "./path-policy.js";
import { runOwnedProcess } from "./owned-process.js";
import { resolveRipgrepExecutable } from "./ripgrep-executable.js";
import {
  classifyRipgrepDiagnostics,
  describeUnreadableDiagnostics,
  hasRequestedRootUnreadable,
} from "./ripgrep-diagnostics.js";
import { matchesModificationTime } from "./source.js";
import { captureCandidateRevisions, retainStableSourceRevisions } from "./scan-revisions.js";
import {
  MAX_SOURCE_REVISION_CONCURRENCY,
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
  maxStoredBytes?: number;
  maxStoredOccurrences?: number;
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
function jsonObjectEnd(value: string, start: number, end: number): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < end; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) return index + 1;
  }
  return undefined;
}

function jsonObjectStringProperty(
  value: string,
  property: string,
  pathStart: number,
): string | undefined {
  let offset = pathStart + '"path"'.length;
  while (/\s/.test(value[offset] ?? "")) offset += 1;
  if (value[offset] !== ":") return undefined;
  offset += 1;
  while (/\s/.test(value[offset] ?? "")) offset += 1;
  if (value[offset] !== "{") return undefined;
  const objectEnd = jsonObjectEnd(value, offset, value.length);
  if (objectEnd === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(value.slice(offset, objectEnd));
    if (!isRecord(parsed)) return undefined;
    const candidate = parsed[property];
    return typeof candidate === "string" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function oversizedMatchPath(
  prefix: string,
  cwd: string,
): { absolutePath: string; displayPath: string } | undefined {
  const pathStart = prefix.indexOf('"path"');
  if (pathStart < 0) return undefined;
  const text = jsonObjectStringProperty(prefix, "text", pathStart);
  if (text !== undefined) return displayPath(text, cwd);
  const encoded = jsonObjectStringProperty(prefix, "bytes", pathStart);
  if (encoded === undefined) return undefined;
  const bytes = Buffer.from(encoded, "base64");
  const decoded = bytes.toString("utf8");
  return Buffer.from(decoded, "utf8").equals(bytes) ? displayPath(decoded, cwd) : undefined;
}

async function assertSearchTargetIdentity(
  policy: SearchPathPolicy,
  path: string,
  expectedCanonical: string | undefined,
): Promise<void> {
  const currentCanonical = await policy.resolveExistingPath(path);
  if (currentCanonical !== expectedCanonical) {
    throw new SignalGrepError("Search target changed during validation; retry the search");
  }
}

async function assertRetainedPathsAllowed(
  policy: SearchPathPolicy,
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  for (let offset = 0; offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted) throw abortError();
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop -- bounded batches avoid unbounded filesystem work.
    await Promise.all(batch.map((path) => policy.resolveExistingPath(path)));
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
  args.push("--iglob", "!.git", "--iglob", "!.git/**", "--iglob", "!**/.git/**");
  return args;
}

export function buildRipgrepArguments(
  request: SearchRequest,
  cwd: string,
  validatedSearchPath?: string,
): string[] {
  const searchPath = validatedSearchPath ?? resolve(cwd, request.path ?? ".");
  const policy = new SearchPathPolicy(cwd);
  policy.assertPath(searchPath);
  const args = [
    "--no-config",
    "--json",
    "--line-number",
    "--color=never",
    "--no-heading",
    ...fileScopeArguments(request),
    ...policy.ripgrepGlobArguments(searchPath),
  ];

  args.push(...patternArguments(request));

  const searchTarget = isPathInsideCwd(searchPath, cwd)
    ? relative(resolve(cwd), searchPath) || "."
    : searchPath;
  args.push("--", request.pattern, searchTarget);
  return args;
}

export function patternArguments(
  request: Pick<SearchRequest, "literal" | "ignoreCase" | "wholeWord">,
): string[] {
  return [
    ...(request.wholeWord ? ["--word-regexp"] : []),
    ...(request.literal ? ["--fixed-strings"] : []),
    request.ignoreCase === true
      ? "--ignore-case"
      : request.ignoreCase === false
        ? "--case-sensitive"
        : "--smart-case",
  ];
}

export function createRipgrepRunner(options: RipgrepRunnerOptions = {}) {
  const maxStoredMatches = options.maxStoredMatches ?? MAX_STORED_MATCHES;
  const maxEventBytes = options.maxEventBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const maxSourceRevisionFiles = options.maxSourceRevisionFiles ?? MAX_SOURCE_REVISION_FILES;

  return async function runRipgrep(
    request: SearchRequest,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SearchScan> {
    if (signal?.aborted) throw abortError();
    const executable = options.executable ?? (await resolveRipgrepExecutable());
    const searchPath = resolve(cwd, request.path ?? ".");
    const policy = new SearchPathPolicy(cwd);
    const validatedSearchPath = await policy.resolveSearchTarget(searchPath);
    const expectedSearchTarget = await policy.resolveExistingPath(validatedSearchPath);
    const searchTarget = isPathInsideCwd(validatedSearchPath, cwd)
      ? relative(resolve(cwd), validatedSearchPath) || "."
      : validatedSearchPath;
    const args = buildRipgrepArguments(request, cwd, validatedSearchPath);
    if (signal?.aborted) throw abortError();

    const matches: MatchRecord[] = [];
    const retention = new SearchRetention(options.maxStoredBytes, options.maxStoredOccurrences);
    const fileCounts = new Map<string, number>();
    const lossyPaths = new Set<string>();
    const oversizedPathReasons = new Set<string>();
    let totalMatches = 0;
    let truncatedLines = 0;
    let modificationTimeFilterIncomplete = false;
    let candidateRevisions = new Map<string, import("./types.js").SourceRevision>();

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
      if (request.modifiedAfterMs !== undefined || request.modifiedBeforeMs !== undefined) {
        const revision = candidateRevisions.get(path.absolutePath);
        if (!revision) {
          modificationTimeFilterIncomplete = true;
          retention.noteLimit(
            `Modification time could not be verified for ${path.displayPath}; matching evidence was retained`,
          );
        } else if (
          !matchesModificationTime(revision, request.modifiedAfterMs, request.modifiedBeforeMs)
        ) {
          return;
        }
      }
      if (rawPath.encoding === "utf-8") lossyPaths.add(path.absolutePath);
      const submatches = event.data.submatches ?? [];
      if (submatches.some((match) => match.end > rawContent.bytes.length))
        throw new SignalGrepError("ripgrep emitted a submatch outside its matching line");
      const primaryOccurrence = submatches[0];
      let focusStart = 0;
      let focusEnd = 0;
      if (primaryOccurrence) {
        focusStart = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.start, "utf-16");
        focusEnd = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.end, "utf-16");
      }
      const excerpt = excerptText(normalizedContent, focusStart, focusEnd);
      const { text: lineContent, truncated: lineTruncated } = excerpt;

      totalMatches += 1;
      if (!fileCounts.has(path.displayPath)) {
        if (retention.file(path.displayPath, path.absolutePath))
          fileCounts.set(path.displayPath, 0);
      }
      if (fileCounts.has(path.displayPath))
        fileCounts.set(path.displayPath, (fileCounts.get(path.displayPath) ?? 0) + 1);
      if (lineTruncated) truncatedLines += 1;
      if (matches.length >= maxStoredMatches)
        retention.noteLimit(
          `Matching-line retention reached the ${String(maxStoredMatches)} limit`,
        );
      if (matches.length < maxStoredMatches && retention.canRetainOccurrences(submatches.length)) {
        const match = {
          ...path,
          lineNumber: event.data.line_number,
          lineContent,
          lineTruncated,
          occurrences: createOccurrences(event.data.line_number, rawContent, submatches),
        };
        if (retention.retain(match)) matches.push(match);
      }
    };

    try {
      const before = await captureCandidateRevisions(
        executable,
        [
          "--no-config",
          "--files",
          "--null",
          ...fileScopeArguments(request),
          ...policy.ripgrepGlobArguments(validatedSearchPath),
          "--",
          searchTarget,
        ],
        cwd,
        maxSourceRevisionFiles,
        signal,
      );
      if (hasRequestedRootUnreadable(before.unreadable, cwd, validatedSearchPath))
        throw new SignalGrepError(describeUnreadableDiagnostics(before.unreadable));
      candidateRevisions = before.revisions;
      if (before.unreadable.length > 0)
        retention.noteLimit(describeUnreadableDiagnostics(before.unreadable));
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const { code, stderr } = await runOwnedProcess(
        { executable, args, cwd, ...(signal ? { signal } : {}) },
        (stdout) =>
          consumeCappedLines(stdout, onLine, {
            maxLineBytes: maxEventBytes,
            onLineTooLong: ({ prefix, observedBytes }) => {
              const source = oversizedMatchPath(prefix, cwd);
              const label = source?.displayPath ?? "unknown source";
              if (oversizedPathReasons.has(label)) return;
              oversizedPathReasons.add(label);
              retention.noteLimit(
                `Skipped oversized ripgrep match line in ${JSON.stringify(label)}; observed at least ${String(observedBytes)} bytes, limit is ${String(maxEventBytes)} bytes`,
              );
            },
          }),
      );
      const diagnostics = classifyRipgrepDiagnostics(stderr);
      if (hasRequestedRootUnreadable(diagnostics.unreadable, cwd, validatedSearchPath))
        throw new SignalGrepError(describeUnreadableDiagnostics(diagnostics.unreadable));
      if (diagnostics.unreadable.length > 0)
        retention.noteLimit(describeUnreadableDiagnostics(diagnostics.unreadable));
      if (code === 2 && (diagnostics.other.length > 0 || diagnostics.unreadable.length === 0)) {
        throw new SignalGrepError(stderr.trim() || `ripgrep exited with status ${String(code)}`);
      }
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const retainedPaths = new Set(
        matches.map((match) => match.absolutePath).filter((path) => !lossyPaths.has(path)),
      );
      await assertRetainedPathsAllowed(policy, [...retainedPaths], signal);
      const sourceRevisions = await retainStableSourceRevisions(
        retainedPaths,
        before.revisions,
        signal,
      );
      if (signal?.aborted) throw abortError();
      return {
        request,
        matches,
        totalMatches,
        fileCounts,
        sourceRevisions,
        snapshotComplete:
          matches.length === totalMatches &&
          !modificationTimeFilterIncomplete &&
          retention.details.reasons.length === 0,
        truncatedLines,
        retention: retention.details,
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
