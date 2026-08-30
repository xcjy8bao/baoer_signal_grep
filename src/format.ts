import { readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateLine,
} from "@earendil-works/pi-coding-agent";
import { abortError } from "./errors.js";
import { excerptText } from "./excerpt.js";
import { getSourceRevision, sameSourceRevision } from "./source.js";
import {
  DEFAULT_RESULT_TOKEN_BUDGET,
  ESTIMATED_CHARACTERS_PER_TOKEN,
  MAX_CONTEXT_LINES,
  MAX_DISPLAYED_OCCURRENCES,
  MAX_LINE_CHARACTERS,
  MAX_RESULT_BYTES,
  MAX_SOURCE_FILE_BYTES,
} from "./types.js";
import type { MatchRecord, SearchSnapshot, SourceRevision } from "./types.js";

const RESULT_METADATA_RESERVE_BYTES = 1024;
const RESULT_METADATA_RESERVE_CHARACTERS = 512;
const MAX_PAGE_BODY_BYTES = MAX_RESULT_BYTES - RESULT_METADATA_RESERVE_BYTES;

export class MatchPageSoftLimitError extends Error {
  constructor() {
    super("A single match exceeds the estimated-token detail target");
    this.name = "MatchPageSoftLimitError";
  }
}

function pageBodyCharacterLimit(resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET): number {
  if (!Number.isSafeInteger(resultTokenBudget) || resultTokenBudget <= 0) {
    throw new Error("Result token budget must be a positive safe integer");
  }
  const limit =
    resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - RESULT_METADATA_RESERVE_CHARACTERS;
  if (limit <= 0) {
    throw new Error("Result token budget cannot fit reserved response metadata");
  }
  return limit;
}

export interface FormattedPage {
  body: string;
  returnedMatches: number;
  nextOffset: number;
  hasNext: boolean;
  hasMatchRanges: boolean;
  hasByteRanges: boolean;
  occurrenceRangesOmitted: number;
  occurrenceMatchesTruncated: number;
  firstMatchIndex?: number;
  lastMatchIndex?: number;
  contextOmittedFiles: string[];
  contextChangedFiles: string[];
}

export interface MatchPageOptions {
  resultTokenBudget?: number;
  include?: (match: MatchRecord, index: number) => boolean;
}

type ContextLoad = { status: "available"; lines: string[] } | { status: "changed" | "unavailable" };

type ContextCache = Map<string, ContextLoad>;

function compactLine(line: string): string {
  const clean = line.replaceAll("\r", "").trimEnd();
  return excerptText(clean).text;
}

function matchLocationSuffix(match: MatchRecord): string {
  if (match.occurrences.length === 0) return "";
  const displayed = match.occurrences.slice(0, MAX_DISPLAYED_OCCURRENCES);
  const ranges = displayed.map(({ range }) => {
    const start = range.start.character + 1;
    const end = Math.max(start, range.end.character);
    const suffix = range.encoding === "utf-8" ? "b" : "";
    return `${start}-${end}${suffix}`;
  });
  const omitted = match.occurrences.length - displayed.length;
  const notice =
    omitted > 0
      ? ` [ranges: ${String(displayed.length)} of ${String(match.occurrences.length)} shown; ${String(omitted)} omitted; mode=inspect with this path/line for source]`
      : "";
  return ` [${ranges.join(",")}]${notice}`;
}

function formatMatchLine(match: MatchRecord, matchIndex: number): string {
  return ` ${match.lineNumber}: ${match.lineContent}${matchLocationSuffix(match)} {match #${String(matchIndex)}}`;
}

async function loadContextLines(
  match: MatchRecord,
  expectedRevision: SourceRevision | undefined,
  cache: ContextCache,
  signal?: AbortSignal,
): Promise<ContextLoad> {
  const cached = cache.get(match.absolutePath);
  if (cached) return cached;

  try {
    if (signal?.aborted) throw abortError();
    if (!expectedRevision || expectedRevision.size > MAX_SOURCE_FILE_BYTES) {
      const unavailable = { status: "unavailable" as const };
      cache.set(match.absolutePath, unavailable);
      return unavailable;
    }
    const beforeRevision = await getSourceRevision(match.absolutePath);
    if (!beforeRevision || !sameSourceRevision(expectedRevision, beforeRevision)) {
      const changed = { status: "changed" as const };
      cache.set(match.absolutePath, changed);
      return changed;
    }
    const content = await readFile(match.absolutePath, { encoding: "utf8", signal });
    const afterRevision = await getSourceRevision(match.absolutePath);
    if (!afterRevision || !sameSourceRevision(expectedRevision, afterRevision)) {
      const changed = { status: "changed" as const };
      cache.set(match.absolutePath, changed);
      return changed;
    }
    const available = {
      status: "available" as const,
      lines: content.replaceAll("\r", "").split("\n"),
    };
    cache.set(match.absolutePath, available);
    return available;
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw abortError();
    }
    const unavailable = { status: "unavailable" as const };
    cache.set(match.absolutePath, unavailable);
    return unavailable;
  }
}

interface MatchContextWindow {
  startLine: number;
  endLine: number;
}

interface FormattedMatchBlock {
  text: string;
  contextStatus: "available" | "changed" | "unavailable" | "none";
}

function matchContextWindows(
  snapshot: SearchSnapshot,
  include: MatchPageOptions["include"],
): Map<MatchRecord, MatchContextWindow> {
  const windows = new Map<MatchRecord, MatchContextWindow>();
  const context = Math.min(Math.max(0, snapshot.request.context), MAX_CONTEXT_LINES);
  if (context === 0) return windows;

  const selectedFiles = new Map<string, MatchRecord[]>();
  for (const [index, match] of snapshot.matches.entries()) {
    if (include && !include(match, index)) continue;
    const matches = selectedFiles.get(match.absolutePath) ?? [];
    matches.push(match);
    selectedFiles.set(match.absolutePath, matches);
  }
  for (const matches of selectedFiles.values()) {
    const ordered = matches.toSorted((left, right) => left.lineNumber - right.lineNumber);
    for (const [index, match] of ordered.entries()) {
      const previous = ordered[index - 1];
      const next = ordered[index + 1];
      // Each context line belongs to its nearest selected match; ties belong to the earlier one.
      // This partitions overlapping windows without guessing what a previous cursor page emitted.
      windows.set(match, {
        startLine: Math.max(
          1,
          match.lineNumber - context,
          previous ? Math.floor((previous.lineNumber + match.lineNumber) / 2) + 1 : 1,
        ),
        endLine: Math.min(
          match.lineNumber + context,
          next ? Math.floor((match.lineNumber + next.lineNumber) / 2) : Number.MAX_SAFE_INTEGER,
        ),
      });
    }
  }
  return windows;
}

async function formatBlock(
  match: MatchRecord,
  matchIndex: number,
  expectedRevision: SourceRevision | undefined,
  window: MatchContextWindow | undefined,
  cache: ContextCache,
  allMatchLines: Map<string, Set<number>>,
  signal?: AbortSignal,
): Promise<FormattedMatchBlock> {
  const matchingLine = formatMatchLine(match, matchIndex);
  if (!window) return { text: matchingLine, contextStatus: "none" };

  const contextLoad = await loadContextLines(match, expectedRevision, cache, signal);
  if (contextLoad.status !== "available") {
    return { text: matchingLine, contextStatus: contextLoad.status };
  }
  const { lines } = contextLoad;
  const output: string[] = [];
  for (let lineNumber = window.startLine; lineNumber <= window.endLine; lineNumber += 1) {
    if (lineNumber === match.lineNumber) {
      output.push(matchingLine);
    } else if (
      lineNumber <= lines.length &&
      !allMatchLines.get(match.absolutePath)?.has(lineNumber)
    ) {
      output.push(` ${lineNumber}- ${compactLine(lines[lineNumber - 1] ?? "")}`);
    }
  }
  return { text: output.join("\n"), contextStatus: "available" };
}

export async function formatMatchPage(
  snapshot: SearchSnapshot,
  offset: number,
  signal?: AbortSignal,
  options: MatchPageOptions = {},
): Promise<FormattedPage> {
  const maxPageBodyCharacters = pageBodyCharacterLimit(options.resultTokenBudget);
  const cache: ContextCache = new Map();
  const omittedFiles = new Set<string>();
  const changedFiles = new Set<string>();
  const output: string[] = [];
  let returnedMatches = 0;
  let nextOffset = offset;
  let currentFile: string | undefined;
  let outputBytes = 0;
  let outputCharacters = 0;
  let firstMatchIndex: number | undefined;
  let lastMatchIndex: number | undefined;
  let hasMatchRanges = false;
  let hasByteRanges = false;
  let occurrenceRangesOmitted = 0;
  let occurrenceMatchesTruncated = 0;
  const contextWindows = matchContextWindows(snapshot, options.include);
  const allMatchLines = new Map<string, Set<number>>();
  if (contextWindows.size > 0) {
    for (const match of snapshot.matches) {
      const lines = allMatchLines.get(match.absolutePath) ?? new Set<number>();
      lines.add(match.lineNumber);
      allMatchLines.set(match.absolutePath, lines);
    }
  }

  while (nextOffset < snapshot.matches.length && returnedMatches < snapshot.request.pageSize) {
    if (signal?.aborted) throw abortError();
    const matchIndex = nextOffset;
    const match = snapshot.matches[matchIndex];
    if (!match) break;
    nextOffset += 1;
    if (options.include && !options.include(match, matchIndex)) continue;
    // Formatting is sequential because each block consumes the remaining shared byte budget.
    // oxlint-disable-next-line no-await-in-loop -- the shared output budget is consumed in order.
    let block = await formatBlock(
      match,
      matchIndex + 1,
      snapshot.sourceRevisions.get(match.absolutePath),
      contextWindows.get(match),
      cache,
      allMatchLines,
      signal,
    );
    const fileHeader = match.displayPath === currentFile ? "" : `${match.displayPath}\n`;
    const separator = output.length === 0 ? "" : fileHeader.length === 0 ? "\n" : "\n\n";
    let addition = `${separator}${fileHeader}${block.text}`;
    let additionBytes = Buffer.byteLength(addition);
    let additionCharacters = addition.length;
    const exceedsBudget = () =>
      outputBytes + additionBytes > MAX_PAGE_BODY_BYTES ||
      outputCharacters + additionCharacters > maxPageBodyCharacters;

    if (exceedsBudget()) {
      if (returnedMatches > 0) {
        nextOffset = matchIndex;
        break;
      }
      block = { text: formatMatchLine(match, matchIndex + 1), contextStatus: "unavailable" };
      addition = `${fileHeader}${block.text}`;
      additionBytes = Buffer.byteLength(addition);
      additionCharacters = addition.length;
    }
    if (additionBytes > MAX_PAGE_BODY_BYTES) {
      throw new Error("A single match exceeds the reserved result budget");
    }
    if (additionCharacters > maxPageBodyCharacters) throw new MatchPageSoftLimitError();

    output.push(addition);
    outputBytes += additionBytes;
    outputCharacters += additionCharacters;
    currentFile = match.displayPath;
    returnedMatches += 1;
    hasMatchRanges ||= match.occurrences.length > 0;
    hasByteRanges ||= match.occurrences
      .slice(0, MAX_DISPLAYED_OCCURRENCES)
      .some(({ range }) => range.encoding === "utf-8");
    const omittedRanges = Math.max(0, match.occurrences.length - MAX_DISPLAYED_OCCURRENCES);
    occurrenceRangesOmitted += omittedRanges;
    if (omittedRanges > 0) occurrenceMatchesTruncated += 1;
    if (block.contextStatus === "changed") changedFiles.add(match.displayPath);
    if (block.contextStatus === "unavailable") omittedFiles.add(match.displayPath);
    firstMatchIndex ??= matchIndex;
    lastMatchIndex = matchIndex;
  }

  const hasNext = snapshot.matches
    .slice(nextOffset)
    .some((match, index) => !options.include || options.include(match, nextOffset + index));

  const page: FormattedPage = {
    body: output.join(""),
    returnedMatches,
    nextOffset,
    hasNext,
    hasMatchRanges,
    hasByteRanges,
    occurrenceRangesOmitted,
    occurrenceMatchesTruncated,
    contextOmittedFiles: [...omittedFiles].toSorted((left, right) => left.localeCompare(right)),
    contextChangedFiles: [...changedFiles].toSorted((left, right) => left.localeCompare(right)),
  };
  if (firstMatchIndex !== undefined) page.firstMatchIndex = firstMatchIndex;
  if (lastMatchIndex !== undefined) page.lastMatchIndex = lastMatchIndex;
  return page;
}

interface NormalBlock {
  lines: string[];
  linesTruncated: boolean;
}

async function loadNormalContextLines(
  match: MatchRecord,
  cache: Map<string, string[] | null>,
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (cache.has(match.absolutePath)) return cache.get(match.absolutePath) ?? null;

  try {
    if (signal?.aborted) throw abortError();
    const content = await readFile(match.absolutePath, { encoding: "utf8", signal });
    const lines = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
    cache.set(match.absolutePath, lines);
    return lines;
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw abortError();
    }
    cache.set(match.absolutePath, null);
    return null;
  }
}

async function formatNormalBlock(
  match: MatchRecord,
  displayPath: string,
  context: number,
  cache: Map<string, string[] | null>,
  signal?: AbortSignal,
): Promise<NormalBlock> {
  if (context === 0) {
    if (match.lineTruncated && match.normalLinePrefix === undefined) {
      throw new Error("Normal grep baseline requires the original truncated line prefix");
    }
    const content = match.lineTruncated
      ? `${match.normalLinePrefix}... [truncated]`
      : match.lineContent;
    return {
      lines: [`${displayPath}:${match.lineNumber}: ${content}`],
      linesTruncated: match.lineTruncated,
    };
  }

  const lines = await loadNormalContextLines(match, cache, signal);
  if (!lines) {
    return {
      lines: [`${displayPath}:${match.lineNumber}: (unable to read file)`],
      linesTruncated: false,
    };
  }

  const start = Math.max(1, match.lineNumber - context);
  const end = Math.min(lines.length, match.lineNumber + context);
  const output: string[] = [];
  let linesTruncated = false;
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    const isMatch = lineNumber === match.lineNumber;
    const marker = isMatch ? ":" : "-";
    const rawContent = (lines[lineNumber - 1] ?? "").replaceAll("\r", "");
    const truncated = truncateLine(rawContent, MAX_LINE_CHARACTERS);
    linesTruncated ||= truncated.wasTruncated;
    output.push(`${displayPath}${marker}${lineNumber}${marker} ${truncated.text}`);
  }
  return { lines: output, linesTruncated };
}

async function createNormalPathFormatter(snapshot: SearchSnapshot, cwd: string) {
  const searchPath = resolve(cwd, snapshot.request.path ?? ".");
  let searchPathIsDirectory = false;
  try {
    const searchPathStats = await stat(searchPath);
    searchPathIsDirectory = searchPathStats.isDirectory();
  } catch {
    // The scan already succeeded. If the root disappears before formatting, basename behavior is
    // the only deterministic fallback and matches normal grep's file-root formatting.
  }

  return (match: MatchRecord): string => {
    if (searchPathIsDirectory) {
      const localPath = relative(searchPath, match.absolutePath);
      if (
        localPath.length > 0 &&
        localPath !== ".." &&
        !localPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      ) {
        return localPath.replaceAll("\\", "/");
      }
    }
    return basename(match.absolutePath);
  };
}

export async function formatNormalBaseline(
  snapshot: SearchSnapshot,
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  if (snapshot.totalMatches === 0) return "No matches found";

  const cache = new Map<string, string[] | null>();
  const formatPath = await createNormalPathFormatter(snapshot, cwd);
  const normalMatchLimit = snapshot.request.pageSize;
  const output: string[] = [];
  let linesTruncated = false;
  for (const match of snapshot.matches.slice(0, normalMatchLimit)) {
    if (signal?.aborted) throw abortError();
    // The normal baseline is ordered and bounded exactly like a single grep result.
    // oxlint-disable-next-line no-await-in-loop
    const block = await formatNormalBlock(
      match,
      formatPath(match),
      snapshot.request.context,
      cache,
      signal,
    );
    output.push(...block.lines);
    linesTruncated ||= block.linesTruncated;
  }

  const truncation = truncateHead(output.join("\n"), {
    maxLines: Number.MAX_SAFE_INTEGER,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  let text = truncation.content;
  const notices: string[] = [];
  if (snapshot.totalMatches >= normalMatchLimit) {
    notices.push(
      `${normalMatchLimit} matches limit reached. Use limit=${normalMatchLimit * 2} for more, or refine pattern`,
    );
  }
  if (truncation.truncated) notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
  if (linesTruncated) {
    notices.push(
      `Some lines truncated to ${MAX_LINE_CHARACTERS} chars. Use read tool to see full lines`,
    );
  }
  if (notices.length > 0) text += `\n\n[${notices.join(". ")}]`;
  return text;
}
