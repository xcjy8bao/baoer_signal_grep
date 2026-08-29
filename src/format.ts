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
  MAX_LINE_CHARACTERS,
  MAX_RESULT_BYTES,
  MAX_SOURCE_FILE_BYTES,
} from "./types.js";
import type { MatchRecord, SearchSnapshot, SourceRevision } from "./types.js";

const RESULT_METADATA_RESERVE_BYTES = 1024;
const RESULT_METADATA_RESERVE_CHARACTERS = 512;
const MAX_PAGE_BODY_BYTES = MAX_RESULT_BYTES - RESULT_METADATA_RESERVE_BYTES;
const DEFAULT_MAX_PAGE_BODY_CHARACTERS =
  DEFAULT_RESULT_TOKEN_BUDGET * ESTIMATED_CHARACTERS_PER_TOKEN - RESULT_METADATA_RESERVE_CHARACTERS;

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
  const ranges = match.occurrences.map(({ range }) => {
    const start = range.start.character + 1;
    const end = Math.max(start, range.end.character);
    const suffix = range.encoding === "utf-8" ? "b" : "";
    return `${start}-${end}${suffix}`;
  });
  return ` [${ranges.join(",")}]`;
}

function formatMatchLine(match: MatchRecord, matchIndex: number): string {
  return ` ${match.lineNumber}: ${match.lineContent}${matchLocationSuffix(match)} {match #${String(matchIndex)}}`;
}

function indexedMatchLine(
  match: MatchRecord,
  matchIndices: ReadonlyMap<MatchRecord, number>,
): string {
  const matchIndex = matchIndices.get(match);
  if (matchIndex === undefined) throw new Error("Match index is unavailable");
  return formatMatchLine(match, matchIndex);
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
      lines: content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n"),
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

async function formatBlock(
  match: MatchRecord,
  expectedRevision: SourceRevision | undefined,
  matchIndices: ReadonlyMap<MatchRecord, number>,
  context: number,
  cache: ContextCache,
  omittedFiles: Set<string>,
  changedFiles: Set<string>,
  emittedLines: Map<string, Set<number>>,
  pageMatches: Map<string, Map<number, MatchRecord>>,
  allMatchLines: Map<string, Set<number>>,
  priorContextLines: Map<string, Set<number>>,
  signal?: AbortSignal,
): Promise<string> {
  const matchIndex = matchIndices.get(match);
  if (matchIndex === undefined) throw new Error("Match index is unavailable");
  if (context === 0) return formatMatchLine(match, matchIndex);

  const contextLoad = await loadContextLines(match, expectedRevision, cache, signal);
  if (contextLoad.status !== "available") {
    const affectedFiles = contextLoad.status === "changed" ? changedFiles : omittedFiles;
    affectedFiles.add(match.displayPath);
    return formatMatchLine(match, matchIndex);
  }
  const { lines } = contextLoad;

  const boundedContext = Math.min(Math.max(0, context), MAX_CONTEXT_LINES);
  const start = Math.max(1, match.lineNumber - boundedContext);
  const end = match.lineNumber + boundedContext;
  const output: string[] = [];
  const emitted = emittedLines.get(match.absolutePath) ?? new Set<number>();
  const matchesByLine = pageMatches.get(match.absolutePath);
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    const matchingRecord = matchesByLine?.get(lineNumber);
    if (lineNumber > lines.length && !matchingRecord) continue;
    if (emitted.has(lineNumber)) continue;
    if (!matchingRecord && allMatchLines.get(match.absolutePath)?.has(lineNumber)) continue;
    if (!matchingRecord && priorContextLines.get(match.absolutePath)?.has(lineNumber)) continue;
    output.push(
      matchingRecord
        ? indexedMatchLine(matchingRecord, matchIndices)
        : ` ${lineNumber}- ${compactLine(lines[lineNumber - 1] ?? "")}`,
    );
    emitted.add(lineNumber);
  }
  emittedLines.set(match.absolutePath, emitted);
  return output.join("\n");
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
  const matchIndices = new Map(snapshot.matches.map((match, index) => [match, index + 1] as const));
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
  const emittedLines = new Map<string, Set<number>>();
  const candidateIndices: number[] = [];
  for (let index = offset; index < snapshot.matches.length; index += 1) {
    const match = snapshot.matches[index];
    if (match && (!options.include || options.include(match, index))) candidateIndices.push(index);
    if (candidateIndices.length >= snapshot.request.pageSize) break;
  }
  const allMatchLines = new Map<string, Set<number>>();
  for (const match of snapshot.matches) {
    const lines = allMatchLines.get(match.absolutePath) ?? new Set<number>();
    lines.add(match.lineNumber);
    allMatchLines.set(match.absolutePath, lines);
  }
  const priorContextLines = new Map<string, Set<number>>();
  const boundedContext = Math.min(Math.max(0, snapshot.request.context), MAX_CONTEXT_LINES);
  for (let index = 0; index < offset; index += 1) {
    const match = snapshot.matches[index];
    if (!match || (options.include && !options.include(match, index))) continue;
    const lines = priorContextLines.get(match.absolutePath) ?? new Set<number>();
    const matchLines = allMatchLines.get(match.absolutePath);
    const start = Math.max(1, match.lineNumber - boundedContext);
    const end = match.lineNumber + boundedContext;
    for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
      if (!matchLines?.has(lineNumber)) lines.add(lineNumber);
    }
    priorContextLines.set(match.absolutePath, lines);
  }
  const pageMatches = new Map<string, Map<number, MatchRecord>>();
  for (const index of candidateIndices) {
    const match = snapshot.matches[index];
    if (!match) continue;
    const lines = pageMatches.get(match.absolutePath) ?? new Map<number, MatchRecord>();
    lines.set(match.lineNumber, match);
    pageMatches.set(match.absolutePath, lines);
  }

  while (nextOffset < snapshot.matches.length && returnedMatches < snapshot.request.pageSize) {
    if (signal?.aborted) throw abortError();
    const matchIndex = nextOffset;
    const match = snapshot.matches[matchIndex];
    if (!match) break;
    nextOffset += 1;
    if (options.include && !options.include(match, matchIndex)) continue;
    hasMatchRanges ||= match.occurrences.length > 0;
    hasByteRanges ||= match.occurrences.some(({ range }) => range.encoding === "utf-8");
    // Formatting is sequential because each block consumes the remaining shared byte budget.
    const emittedBefore = new Map(
      [...emittedLines].map(([path, lines]) => [path, new Set(lines)] as const),
    );
    // oxlint-disable-next-line no-await-in-loop -- the shared output budget is consumed in order.
    let block = await formatBlock(
      match,
      snapshot.sourceRevisions.get(match.absolutePath),
      matchIndices,
      snapshot.request.context,
      cache,
      omittedFiles,
      changedFiles,
      emittedLines,
      pageMatches,
      allMatchLines,
      priorContextLines,
      signal,
    );
    const restoreEmittedLines = () => {
      emittedLines.clear();
      for (const [path, lines] of emittedBefore) emittedLines.set(path, lines);
    };
    if (block.length === 0) {
      returnedMatches += 1;
      firstMatchIndex ??= matchIndex;
      lastMatchIndex = matchIndex;
      continue;
    }
    const fileHeader = match.displayPath === currentFile ? "" : `${match.displayPath}\n`;
    const separator = output.length === 0 || fileHeader.length === 0 ? "" : "\n";
    let addition = `${separator}${fileHeader}${block}`;
    let additionBytes = Buffer.byteLength(addition);
    let additionCharacters = addition.length;
    const exceedsBudget = () =>
      outputBytes + additionBytes > MAX_PAGE_BODY_BYTES ||
      outputCharacters + additionCharacters > maxPageBodyCharacters;

    if (exceedsBudget()) {
      if (returnedMatches > 0) {
        restoreEmittedLines();
        nextOffset = matchIndex;
        break;
      }
      restoreEmittedLines();
      block = indexedMatchLine(match, matchIndices);
      addition = `${fileHeader}${block}`;
      additionBytes = Buffer.byteLength(addition);
      additionCharacters = addition.length;
      omittedFiles.add(match.displayPath);
    }
    if (additionBytes > MAX_PAGE_BODY_BYTES || additionCharacters > maxPageBodyCharacters) {
      throw new Error("A single match exceeds the reserved result budget");
    }

    output.push(addition);
    outputBytes += additionBytes;
    outputCharacters += additionCharacters;
    currentFile = match.displayPath;
    returnedMatches += 1;
    firstMatchIndex ??= matchIndex;
    lastMatchIndex = matchIndex;
  }

  const hasNext = snapshot.matches
    .slice(nextOffset)
    .some((match, index) => !options.include || options.include(match, nextOffset + index));

  const page: FormattedPage = {
    body: output.join("\n"),
    returnedMatches,
    nextOffset,
    hasNext,
    hasMatchRanges,
    hasByteRanges,
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
    const content = match.lineTruncated
      ? `${match.lineContent.slice(0, MAX_LINE_CHARACTERS)}... [truncated]`
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

export function formatSummary(snapshot: SearchSnapshot, fileLimit: number, offset = 0) {
  if (!Number.isSafeInteger(fileLimit) || fileLimit <= 0) {
    throw new Error("Summary file limit must be a positive safe integer");
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.fileCounts.size) {
    throw new Error("Summary offset is outside the file summary");
  }
  const files = [...snapshot.fileCounts.entries()].toSorted(
    ([leftPath, leftCount], [rightPath, rightCount]) =>
      rightCount - leftCount || leftPath.localeCompare(rightPath),
  );
  const rows: string[] = [];
  let bytes = 0;
  let characters = 0;

  for (const [file, count] of files.slice(offset, offset + fileLimit)) {
    const row = `${file}  ${String(count).padStart(6)}`;
    const separatorLength = rows.length === 0 ? 0 : 1;
    const rowBytes = Buffer.byteLength(row) + separatorLength;
    const rowCharacters = row.length + separatorLength;
    if (
      rows.length > 0 &&
      (bytes + rowBytes > MAX_PAGE_BODY_BYTES ||
        characters + rowCharacters > DEFAULT_MAX_PAGE_BODY_CHARACTERS)
    ) {
      break;
    }
    rows.push(row);
    bytes += rowBytes;
    characters += rowCharacters;
  }

  const nextOffset = offset + rows.length;
  return {
    body: rows.join("\n"),
    shown: rows.length,
    offset,
    nextOffset,
    hasNext: nextOffset < files.length,
    omitted: files.length - nextOffset,
  };
}
