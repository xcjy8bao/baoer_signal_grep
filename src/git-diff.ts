import { setImmediate } from "node:timers/promises";
import { MAX_GIT_DIFF_WORK } from "./analysis-limits.js";
import { abortError, SignalGrepError } from "./errors.js";

export interface GitLineRange {
  startLine: number;
  endLine: number;
}

export class GitDiffLimitError extends SignalGrepError {}

/** One work counter is shared by every file and rename comparison in a request. */
export class GitDiffBudget {
  work = 0;

  readonly maxWork: number;
  readonly signal: AbortSignal | undefined;

  constructor(maxWork = MAX_GIT_DIFF_WORK, signal?: AbortSignal) {
    this.maxWork = maxWork;
    this.signal = signal;
  }

  tick(): boolean {
    if (this.signal?.aborted) throw abortError();
    this.work += 1;
    if (this.work > this.maxWork) {
      throw new GitDiffLimitError(
        `Git line comparison exceeds the ${String(this.maxWork)} step limit`,
      );
    }
    return this.work % 4096 === 0;
  }
}

/* oxlint-disable no-await-in-loop -- sequential CPU work yields regularly for cancellation. */
async function sourceLines(content: Buffer, budget: GitDiffBudget): Promise<string[]> {
  const lines: string[] = [];
  for (let start = 0; start < content.length;) {
    if (budget.tick()) await setImmediate();
    const newline = content.indexOf(10, start);
    const end = newline === -1 ? content.length : newline + 1;
    // Latin-1 is a reversible byte mapping, so malformed UTF-8 and CRLF remain distinct.
    lines.push(content.toString("latin1", start, end));
    start = end;
  }
  return lines;
}

/* oxlint-enable no-await-in-loop */

export function sourceLineCount(content: Buffer): number {
  if (content.length === 0) return 0;
  let count = content[content.length - 1] === 10 ? 0 : 1;
  for (const byte of content) if (byte === 10) count += 1;
  return count;
}

function diagonal(vector: Int32Array, distance: number, k: number): number {
  return vector[k + distance + 1] ?? -1;
}

function prependLine(ranges: GitLineRange[], line: number): void {
  const last = ranges.at(-1);
  if (last && last.startLine === line + 1) last.startLine = line;
  else ranges.push({ startLine: line, endLine: line });
}

function reconstruct(
  trace: Int32Array[],
  oldLength: number,
  newLength: number,
  prefix: number,
): { oldRanges: GitLineRange[]; newRanges: GitLineRange[] } {
  let x = oldLength;
  let y = newLength;
  const oldRanges: GitLineRange[] = [];
  const newRanges: GitLineRange[] = [];
  for (let distance = trace.length - 1; distance > 0; distance -= 1) {
    const previous = trace[distance - 1];
    if (!previous) throw new Error("Missing Git line comparison trace");
    const k = x - y;
    const previousK =
      k === -distance ||
      (k !== distance &&
        diagonal(previous, distance - 1, k - 1) < diagonal(previous, distance - 1, k + 1))
        ? k + 1
        : k - 1;
    const previousX = diagonal(previous, distance - 1, previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
    }
    if (x === previousX) {
      prependLine(newRanges, prefix + y);
      y -= 1;
    } else {
      prependLine(oldRanges, prefix + x);
      x -= 1;
    }
  }
  return { oldRanges: oldRanges.toReversed(), newRanges: newRanges.toReversed() };
}

/** Myers shortest edit script over raw LF-delimited lines, with bounded trace and cancellation. */
/* oxlint-disable no-await-in-loop -- each frontier depends on its predecessor; yields allow cancellation. */
export async function changedLineRanges(
  oldContent: Buffer,
  newContent: Buffer,
  budget = new GitDiffBudget(),
): Promise<{ oldRanges: GitLineRange[]; newRanges: GitLineRange[] }> {
  if (budget.signal?.aborted) throw abortError();
  if (oldContent.equals(newContent)) return { oldRanges: [], newRanges: [] };
  const oldLines = await sourceLines(oldContent, budget);
  const newLines = await sourceLines(newContent, budget);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    if (budget.tick()) await setImmediate();
    prefix += 1;
  }
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > prefix && newEnd > prefix && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    if (budget.tick()) await setImmediate();
    oldEnd -= 1;
    newEnd -= 1;
  }
  const n = oldEnd - prefix;
  const m = newEnd - prefix;
  if (n === 0 || m === 0) {
    return {
      oldRanges: n === 0 ? [] : [{ startLine: prefix + 1, endLine: oldEnd }],
      newRanges: m === 0 ? [] : [{ startLine: prefix + 1, endLine: newEnd }],
    };
  }
  const trace: Int32Array[] = [];
  for (let distance = 0; distance <= n + m; distance += 1) {
    const current = new Int32Array(2 * distance + 3).fill(-1);
    const previous = trace[distance - 1];
    for (let k = -distance; k <= distance; k += 2) {
      if (budget.tick()) await setImmediate();
      let x = 0;
      if (previous) {
        x =
          k === -distance ||
          (k !== distance &&
            diagonal(previous, distance - 1, k - 1) < diagonal(previous, distance - 1, k + 1))
            ? diagonal(previous, distance - 1, k + 1)
            : diagonal(previous, distance - 1, k - 1) + 1;
      }
      let y = x - k;
      while (x < n && y < m && oldLines[prefix + x] === newLines[prefix + y]) {
        if (budget.tick()) await setImmediate();
        x += 1;
        y += 1;
      }
      current[k + distance + 1] = x;
      if (x >= n && y >= m) {
        trace.push(current);
        return reconstruct(trace, n, m, prefix);
      }
    }
    trace.push(current);
  }
  throw new Error("Git line comparison did not produce an edit script");
}

/* oxlint-enable no-await-in-loop */

/** A bounded byte-weighted line multiset score; this is explicitly heuristic, not rename history. */
export async function sourceSimilarity(
  oldContent: Buffer,
  newContent: Buffer,
  budget: GitDiffBudget,
): Promise<number> {
  if (oldContent.equals(newContent)) return 100;
  const maximum = Math.max(oldContent.length, newContent.length);
  if (maximum === 0 || Math.min(oldContent.length, newContent.length) / maximum < 0.5) return 0;
  const counts = new Map<string, number>();
  for (const line of await sourceLines(oldContent, budget))
    counts.set(line, (counts.get(line) ?? 0) + 1);
  let commonBytes = 0;
  for (const line of await sourceLines(newContent, budget)) {
    const remaining = counts.get(line) ?? 0;
    if (remaining === 0) continue;
    counts.set(line, remaining - 1);
    commonBytes += line.length;
  }
  return Math.min(99, Math.floor((100 * commonBytes) / maximum));
}
