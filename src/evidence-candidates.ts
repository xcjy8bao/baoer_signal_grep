import {
  MAX_ANALYSIS_RESULTS,
  MAX_STRUCTURE_BYTES,
  MAX_STRUCTURE_FILES,
} from "./analysis-limits.js";
import { consumeCappedLines } from "./capped-lines.js";
import { abortError, SignalGrepError } from "./errors.js";
import { readGitChanges, type GitChangeRequest } from "./git-source.js";
import { filterHistoricalPaths } from "./historical-paths.js";
import { runOwnedProcess } from "./owned-process.js";
import { patternArguments, type RipgrepRunner } from "./rg.js";
import { sameSourceRevision } from "./source.js";
import { SourceBudgetError } from "./source-access.js";
import {
  SourceDocument,
  SourceDocumentError,
  type ByteRange,
  type SourceReference,
} from "./source-document.js";
import { MAX_PROTOCOL_LINE_BYTES, type SearchRequest } from "./types.js";

export interface EvidenceCandidateFile {
  document: SourceDocument;
  occurrences: ByteRange[];
  changedRanges?: ByteRange[];
  change?: string;
}

export interface EvidenceCandidateOptions {
  request: SearchRequest;
  changes?: GitChangeRequest;
  cwd: string;
  signal?: AbortSignal;
  access: { load(path: string, expected?: SourceReference): Promise<SourceDocument> };
  runRipgrep: RipgrepRunner;
}

export interface EvidenceCandidates {
  files: EvidenceCandidateFile[];
  partial: boolean;
  reasons: string[];
  filesRead: number;
  bytesRead: number;
  changes?: { base: string; target: string; scope: string; side: string };
}

interface MatchBudget {
  retained: number;
  protocolBytes: number;
}
class CandidateLimit extends SignalGrepError {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function eventBytes(value: unknown): Buffer {
  if (record(value) && typeof value.text === "string") return Buffer.from(value.text);
  if (record(value) && typeof value.bytes === "string") return Buffer.from(value.bytes, "base64");
  throw new SignalGrepError("Raw ripgrep event omitted source bytes");
}

/** Half-open source ranges never attribute the start of an unchanged next line to a changed line. */
export function occurrenceInsideRanges(
  range: ByteRange,
  allowed: ByteRange[],
  document: SourceDocument,
): boolean {
  return allowed.some(
    (outer) =>
      range.start >= outer.start &&
      range.end <= outer.end &&
      (range.end > range.start ||
        range.start < outer.end ||
        (outer.end === document.bytes.length && document.bytes.at(-1) !== 10)),
  );
}

async function searchRawSource(
  cwd: string,
  document: SourceDocument,
  request: SearchRequest,
  budget: MatchBudget,
  allowed: ByteRange[] | undefined,
  signal?: AbortSignal,
): Promise<{ occurrences: ByteRange[]; reason?: string }> {
  const occurrences: ByteRange[] = [];
  try {
    const result = await runOwnedProcess(
      {
        executable: "rg",
        args: [
          "--no-config",
          "--encoding",
          "none",
          "--json",
          "--line-number",
          "--color=never",
          ...patternArguments(request),
          "--",
          request.pattern,
          "-",
        ],
        cwd,
        input: document.bytes,
        ...(signal ? { signal } : {}),
      },
      (stdout) =>
        consumeCappedLines(
          stdout,
          (line) => {
            budget.protocolBytes += Buffer.byteLength(line);
            if (budget.protocolBytes > MAX_STRUCTURE_BYTES)
              throw new CandidateLimit("Raw candidate matching reached the 32 MiB protocol budget");
            let event: unknown;
            try {
              event = JSON.parse(line);
            } catch (error) {
              throw new SignalGrepError("Invalid raw ripgrep JSON", { cause: error });
            }
            if (!record(event) || event.type !== "match") return;
            const data = event.data;
            if (
              !record(data) ||
              !integer(data.absolute_offset) ||
              !integer(data.line_number) ||
              data.line_number < 1 ||
              !Array.isArray(data.submatches)
            )
              throw new SignalGrepError("Invalid raw ripgrep match event");
            const start = data.absolute_offset;
            const bytes = eventBytes(data.lines);
            if (
              document.lineStarts[data.line_number - 1] !== start ||
              start + bytes.length > document.bytes.length ||
              !document.bytes.subarray(start, start + bytes.length).equals(bytes)
            )
              throw new SignalGrepError(
                "Raw ripgrep evidence does not match its source version and line offset",
              );
            for (const submatch of data.submatches) {
              if (
                !record(submatch) ||
                !integer(submatch.start) ||
                !integer(submatch.end) ||
                submatch.end < submatch.start ||
                submatch.end > bytes.length ||
                !bytes.subarray(submatch.start, submatch.end).equals(eventBytes(submatch.match))
              )
                throw new SignalGrepError("Invalid raw ripgrep occurrence bounds or bytes");
              const range = { start: start + submatch.start, end: start + submatch.end };
              if (allowed && !occurrenceInsideRanges(range, allowed, document)) continue;
              if (budget.retained >= MAX_ANALYSIS_RESULTS)
                throw new CandidateLimit(
                  `Candidate matching reached the ${String(MAX_ANALYSIS_RESULTS)} occurrence limit`,
                );
              budget.retained += 1;
              occurrences.push(range);
            }
          },
          { maxLineBytes: MAX_PROTOCOL_LINE_BYTES },
        ),
    );
    if (result.code !== 0 && result.code !== 1)
      throw new SignalGrepError(
        result.stderr.trim() || `Raw ripgrep exited ${String(result.code)}`,
      );
  } catch (error) {
    if (!(error instanceof CandidateLimit)) throw error;
    return { occurrences, reason: error.message };
  }
  return { occurrences };
}

/* oxlint-disable no-await-in-loop -- retained files share one source and occurrence budget. */
async function ordinaryCandidates(options: EvidenceCandidateOptions): Promise<EvidenceCandidates> {
  const scan = await options.runRipgrep(options.request, options.cwd, options.signal);
  const reasons = new Set<string>();
  if (!scan.snapshotComplete)
    reasons.add("Search retention is partial; only retained matching files can be analyzed");
  const grouped = new Map<string, typeof scan.matches>();
  for (const match of scan.matches) {
    const existing = grouped.get(match.absolutePath);
    if (existing) existing.push(match);
    else grouped.set(match.absolutePath, [match]);
  }
  const files: EvidenceCandidateFile[] = [];
  let filesRead = 0;
  let bytesRead = 0;
  let retained = 0;
  for (const [absolute, matches] of grouped) {
    if (options.signal?.aborted) throw abortError();
    const revision = scan.sourceRevisions.get(absolute);
    if (!revision) {
      reasons.add("Some matching files lack a verified search revision");
      continue;
    }
    if (filesRead >= MAX_STRUCTURE_FILES || bytesRead + revision.size > MAX_STRUCTURE_BYTES) {
      reasons.add("Candidate analysis reached the 200-file / 32 MiB source limit");
      continue;
    }
    filesRead += 1;
    let document: SourceDocument;
    try {
      document = await options.access.load(absolute);
    } catch (error) {
      if (error instanceof SourceDocumentError || error instanceof SourceBudgetError) {
        reasons.add(error.message);
        continue;
      }
      throw error;
    }
    bytesRead += document.bytes.length;
    if (
      document.reference.origin.kind !== "worktree" ||
      !sameSourceRevision(revision, document.reference.origin.revision)
    ) {
      reasons.add(`Source changed since search: ${document.path}`);
      continue;
    }
    if (
      (document.bytes[0] === 255 && document.bytes[1] === 254) ||
      (document.bytes[0] === 254 && document.bytes[1] === 255)
    ) {
      reasons.add(
        `Transcoded search offsets cannot be bound to raw UTF-16 source: ${document.path}`,
      );
      continue;
    }
    const utf8Bom = document.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]));
    const occurrences: ByteRange[] = [];
    for (const match of matches) {
      const lineStart = document.lineStarts[match.lineNumber - 1];
      if (lineStart === undefined)
        throw new SignalGrepError("Retained match line is outside its verified source");
      const base = lineStart + (utf8Bom && match.lineNumber === 1 ? 3 : 0);
      const lineEnd = document.lineStarts[match.lineNumber] ?? document.bytes.length;
      if (match.occurrences.length === 0)
        reasons.add("Some retained matches have no exact occurrence ranges");
      for (const occurrence of match.occurrences) {
        const range = { start: base + occurrence.byteStart, end: base + occurrence.byteEnd };
        document.checkRange(range);
        if (range.end > lineEnd)
          throw new SignalGrepError("Retained occurrence extends beyond its verified source line");
        if (retained >= MAX_ANALYSIS_RESULTS) {
          reasons.add(
            `Candidate matching reached the ${String(MAX_ANALYSIS_RESULTS)} occurrence limit`,
          );
          break;
        }
        retained += 1;
        occurrences.push(range);
      }
    }
    if (occurrences.length > 0) files.push({ document, occurrences });
  }
  return { files, partial: reasons.size > 0, reasons: [...reasons], filesRead, bytesRead };
}
/* oxlint-enable no-await-in-loop */

/** One candidate boundary for ordinary retained searches and fixed Git source versions. */
/* oxlint-disable no-await-in-loop -- Git sources consume one cumulative rg protocol and occurrence budget. */
export async function collectEvidenceCandidates(
  options: EvidenceCandidateOptions,
): Promise<EvidenceCandidates> {
  if (!options.changes) return ordinaryCandidates(options);
  const reasons = new Set<string>();
  const result = await readGitChanges(options.cwd, options.changes, options.signal, {
    filterPaths: async (paths) => {
      const selected = await filterHistoricalPaths(
        options.cwd,
        paths,
        options.request,
        options.signal,
      );
      for (const reason of selected.reasons) reasons.add(reason);
      return { paths: selected.paths, bytesRead: selected.ignoreBytesRead };
    },
  });
  for (const reason of result.reasons) reasons.add(reason);
  const files: EvidenceCandidateFile[] = [];
  const budget: MatchBudget = { retained: 0, protocolBytes: 0 };
  for (const file of result.files) {
    if (options.signal?.aborted) throw abortError();
    if (!file.content || !file.origin) {
      if (file.sourceStatus !== "absent")
        reasons.add(`${file.path}: ${file.reason ?? file.sourceStatus}`);
      continue;
    }
    const document = new SourceDocument({ path: file.path, origin: file.origin }, file.content);
    const changedRanges = file.changedRanges.map((range) =>
      document.lineRange(range.startLine, range.endLine),
    );
    if (options.changes.scope === "lines" && changedRanges.length === 0) continue;
    const matched = await searchRawSource(
      options.cwd,
      document,
      options.request,
      budget,
      options.changes.scope === "lines" ? changedRanges : undefined,
      options.signal,
    );
    if (matched.reason) reasons.add(matched.reason);
    if (matched.occurrences.length > 0)
      files.push({
        document,
        occurrences: matched.occurrences,
        changedRanges,
        change: file.change,
      });
    if (matched.reason) {
      reasons.add("Remaining Git candidate files were not searched after the matching limit");
      break;
    }
  }
  return {
    files,
    partial: reasons.size > 0,
    reasons: [...reasons],
    filesRead: result.filesRead,
    bytesRead: result.bytesRead,
    changes: { base: result.base, target: result.target, scope: result.scope, side: result.side },
  };
}
/* oxlint-enable no-await-in-loop */
