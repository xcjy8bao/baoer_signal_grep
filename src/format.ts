import { readFile, stat } from "node:fs/promises";
import { abortError } from "./errors.js";
import { MAX_CONTEXT_LINES, MAX_LINE_CHARACTERS, MAX_RESULT_BYTES } from "./types.js";
import type { MatchRecord, SearchSnapshot } from "./types.js";

const MAX_CONTEXT_FILE_BYTES = 5 * 1024 * 1024;
const RESULT_METADATA_RESERVE_BYTES = 1024;
const MAX_PAGE_BODY_BYTES = MAX_RESULT_BYTES - RESULT_METADATA_RESERVE_BYTES;

export interface FormattedPage {
  body: string;
  returnedMatches: number;
  nextOffset: number;
  contextOmittedFiles: string[];
}

function compactLine(line: string): string {
  const clean = line.replaceAll("\r", "").trimEnd();
  return clean.length > MAX_LINE_CHARACTERS ? `${clean.slice(0, MAX_LINE_CHARACTERS)}…` : clean;
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
    if (metadata.size > MAX_CONTEXT_FILE_BYTES) {
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
  signal?: AbortSignal,
): Promise<string> {
  if (context === 0) return ` ${match.lineNumber}: ${match.lineContent}`;

  const lines = await loadContextLines(match, cache, signal);
  if (!lines) {
    omittedFiles.add(match.displayPath);
    return ` ${match.lineNumber}: ${match.lineContent}`;
  }

  const boundedContext = Math.min(Math.max(0, context), MAX_CONTEXT_LINES);
  const start = Math.max(1, match.lineNumber - boundedContext);
  const end = Math.min(lines.length, match.lineNumber + boundedContext);
  const output: string[] = [];
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    const marker = lineNumber === match.lineNumber ? ":" : "-";
    output.push(` ${lineNumber}${marker} ${compactLine(lines[lineNumber - 1] ?? "")}`);
  }
  return output.join("\n");
}

export async function formatMatchPage(
  snapshot: SearchSnapshot,
  offset: number,
  signal?: AbortSignal,
): Promise<FormattedPage> {
  const cache = new Map<string, string[] | null>();
  const omittedFiles = new Set<string>();
  const output: string[] = [];
  let returnedMatches = 0;
  let nextOffset = offset;
  let currentFile: string | undefined;
  let outputBytes = 0;

  while (nextOffset < snapshot.matches.length && returnedMatches < snapshot.request.pageSize) {
    if (signal?.aborted) throw abortError();
    const match = snapshot.matches[nextOffset];
    if (!match) break;
    let block = await formatBlock(match, snapshot.request.context, cache, omittedFiles, signal);
    const fileHeader = match.displayPath === currentFile ? "" : `${match.displayPath}\n`;
    const separator = output.length === 0 || fileHeader.length === 0 ? "" : "\n";
    let addition = `${separator}${fileHeader}${block}`;
    let additionBytes = Buffer.byteLength(addition);

    if (outputBytes + additionBytes > MAX_PAGE_BODY_BYTES) {
      if (returnedMatches > 0) break;
      block = ` ${match.lineNumber}: ${match.lineContent}`;
      addition = `${fileHeader}${block}`;
      additionBytes = Buffer.byteLength(addition);
      omittedFiles.add(match.displayPath);
    }
    if (additionBytes > MAX_PAGE_BODY_BYTES) {
      throw new Error("A single match exceeds the reserved result byte budget");
    }

    output.push(addition);
    outputBytes += additionBytes;
    currentFile = match.displayPath;
    returnedMatches += 1;
    nextOffset += 1;
  }

  return {
    body: output.join("\n"),
    returnedMatches,
    nextOffset,
    contextOmittedFiles: [...omittedFiles].sort(),
  };
}

export function formatSummary(snapshot: SearchSnapshot, fileLimit: number) {
  const files = [...snapshot.fileCounts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const rows: string[] = [];
  let bytes = 0;

  for (const [file, count] of files.slice(0, fileLimit)) {
    const row = `${file}  ${String(count).padStart(6)}`;
    const rowBytes = Buffer.byteLength(`${rows.length === 0 ? "" : "\n"}${row}`);
    if (rows.length > 0 && bytes + rowBytes > MAX_PAGE_BODY_BYTES) break;
    rows.push(row);
    bytes += rowBytes;
  }

  return {
    body: rows.join("\n"),
    shown: rows.length,
    omitted: files.length - rows.length,
  };
}
