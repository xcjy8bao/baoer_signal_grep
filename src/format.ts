import { readFile, stat } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateLine,
} from "@earendil-works/pi-coding-agent";
import { abortError } from "./errors.js";
import {
  DEFAULT_RESULT_TOKEN_BUDGET,
  ESTIMATED_CHARACTERS_PER_TOKEN,
  MAX_CONTEXT_LINES,
  MAX_LINE_CHARACTERS,
  MAX_RESULT_BYTES,
  MAX_SOURCE_FILE_BYTES,
} from "./types.js";
import type { MatchRecord, SearchSnapshot } from "./types.js";

const RESULT_METADATA_RESERVE_BYTES = 1024;
const RESULT_METADATA_RESERVE_CHARACTERS = 512;
const MAX_PAGE_BODY_BYTES = MAX_RESULT_BYTES - RESULT_METADATA_RESERVE_BYTES;
const MAX_PAGE_BODY_CHARACTERS =
  DEFAULT_RESULT_TOKEN_BUDGET * ESTIMATED_CHARACTERS_PER_TOKEN - RESULT_METADATA_RESERVE_CHARACTERS;

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
}

export interface MatchPageOptions {
  include?: (match: MatchRecord, index: number) => boolean;
}

function compactLine(line: string): string {
  const clean = line.replaceAll("\r", "").trimEnd();
  return clean.length > MAX_LINE_CHARACTERS ? `${clean.slice(0, MAX_LINE_CHARACTERS)}…` : clean;
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

function formatMatchLine(match: MatchRecord): string {
  return ` ${match.lineNumber}: ${match.lineContent}${matchLocationSuffix(match)}`;
}

async function loadContextLines(
  match: MatchRecord,
  cache: Map<string, string[] | null>,
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (cache.has(match.absolutePath)) return cache.get(match.absolutePath) ?? null;

  try {
    if (signal?.aborted) throw abortError();
    const metadata = await stat(match.absolutePath);
    if (metadata.size > MAX_SOURCE_FILE_BYTES) {
      cache.set(match.absolutePath, null);
      return null;
    }
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

async function formatBlock(
  match: MatchRecord,
  context: number,
  cache: Map<string, string[] | null>,
  omittedFiles: Set<string>,
  emittedLines: Map<string, Set<number>>,
  pageMatches: Map<string, Map<number, MatchRecord>>,
  allMatchLines: Map<string, Set<number>>,
  priorContextLines: Map<string, Set<number>>,
  signal?: AbortSignal,
): Promise<string> {
  if (context === 0) return formatMatchLine(match);

  const lines = await loadContextLines(match, cache, signal);
  if (!lines) {
    omittedFiles.add(match.displayPath);
    return formatMatchLine(match);
  }

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
        ? formatMatchLine(matchingRecord)
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
  const cache = new Map<string, string[] | null>();
  const omittedFiles = new Set<string>();
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
      snapshot.request.context,
      cache,
      omittedFiles,
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
      outputCharacters + additionCharacters > MAX_PAGE_BODY_CHARACTERS;

    if (exceedsBudget()) {
      if (returnedMatches > 0) {
        restoreEmittedLines();
        nextOffset = matchIndex;
        break;
      }
      restoreEmittedLines();
      block = formatMatchLine(match);
      addition = `${fileHeader}${block}`;
      additionBytes = Buffer.byteLength(addition);
      additionCharacters = addition.length;
      omittedFiles.add(match.displayPath);
    }
    if (additionBytes > MAX_PAGE_BODY_BYTES || additionCharacters > MAX_PAGE_BODY_CHARACTERS) {
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

  return {
    body: output.join("\n"),
    returnedMatches,
    nextOffset,
    hasNext,
    hasMatchRanges,
    hasByteRanges,
    ...(firstMatchIndex === undefined ? {} : { firstMatchIndex }),
    ...(lastMatchIndex === undefined ? {} : { lastMatchIndex }),
    contextOmittedFiles: [...omittedFiles].toSorted(),
  };
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
    searchPathIsDirectory = (await stat(searchPath)).isDirectory();
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

export function formatSummary(snapshot: SearchSnapshot, fileLimit: number) {
  const files = [...snapshot.fileCounts.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  );
  const rows: string[] = [];
  let bytes = 0;
  let characters = 0;

  for (const [file, count] of files.slice(0, fileLimit)) {
    const row = `${file}  ${String(count).padStart(6)}`;
    const separatorLength = rows.length === 0 ? 0 : 1;
    const rowBytes = Buffer.byteLength(row) + separatorLength;
    const rowCharacters = row.length + separatorLength;
    if (
      rows.length > 0 &&
      (bytes + rowBytes > MAX_PAGE_BODY_BYTES ||
        characters + rowCharacters > MAX_PAGE_BODY_CHARACTERS)
    ) {
      break;
    }
    rows.push(row);
    bytes += rowBytes;
    characters += rowCharacters;
  }

  return {
    body: rows.join("\n"),
    shown: rows.length,
    omitted: files.length - rows.length,
  };
}
