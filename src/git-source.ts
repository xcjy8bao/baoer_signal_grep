import { MAX_GIT_DIFF_WORK, MAX_STRUCTURE_BYTES, MAX_STRUCTURE_FILES } from "./analysis-limits.js";
import { abortError, SignalGrepError } from "./errors.js";
import { filterHistoricalPaths } from "./historical-paths.js";
import {
  changedLineRanges,
  GitDiffBudget,
  GitDiffLimitError,
  sourceLineCount,
  sourceSimilarity,
  type GitLineRange,
} from "./git-diff.js";
import {
  gitPath,
  readGitBlob,
  readGitTree,
  readWorktreeSource,
  resolveGitCommit,
  visibleGitPaths,
  verifyWorktreeRevision,
  worktreeNames,
  type GitRawSource,
  type GitReadBudget,
  type GitSourceOrigin,
  type GitTreeEntry,
} from "./git-repository.js";
import { setImmediate } from "node:timers/promises";

export type { GitSourceOrigin } from "./git-repository.js";
export type { GitLineRange } from "./git-diff.js";

export interface GitChangeRequest {
  base?: string;
  target?: string;
  scope: "files" | "lines";
  side: "new" | "old";
}

export interface GitSourceOptions {
  filterPaths?: (paths: string[]) => Promise<{ paths: string[]; bytesRead?: number }>;
  includePath?: (path: string) => boolean | Promise<boolean>;
  maxFiles?: number;
  maxBytes?: number;
  maxDiffWork?: number;
}

export interface GitSourceFile {
  path: string;
  oldPath?: string;
  newPath?: string;
  change: "added" | "modified" | "deleted" | "renamed" | "unknown";
  sourceStatus: GitRawSource["sourceStatus"];
  content?: Buffer;
  contentHash?: string;
  origin?: GitSourceOrigin;
  changedRanges: GitLineRange[];
  ranges: GitLineRange[];
  reason?: string;
  rename?: { method: "identical-content" | "line-similarity"; similarity: number };
}

export interface GitChangeResult {
  base: string;
  target: string;
  scope: "files" | "lines";
  side: "new" | "old";
  files: GitSourceFile[];
  partial: boolean;
  reasons: string[];
  filesRead: number;
  bytesRead: number;
  diffWork: number;
  omittedFiles: number;
}

interface SourcePair {
  old: GitRawSource;
  new: GitRawSource;
  rename?: GitSourceFile["rename"];
}

function absent(path: string): GitRawSource {
  return { path, mode: "000000", sourceStatus: "absent" };
}

function sameContents(left: GitRawSource, right: GitRawSource): boolean {
  return left.contentHash !== undefined && left.contentHash === right.contentHash;
}

function wholeFile(content: Buffer): GitLineRange[] {
  const lines = sourceLineCount(content);
  return lines === 0 ? [] : [{ startLine: 1, endLine: lines }];
}

function validateLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new SignalGrepError(`${label} must be a positive integer`);
  return value;
}

function rememberBest(
  best: Map<SourcePair, { score: number; count: number }>,
  pair: SourcePair,
  score: number,
) {
  const previous = best.get(pair);
  if (!previous || score > previous.score) best.set(pair, { score, count: 1 });
  else if (score === previous.score) previous.count += 1;
}

/* oxlint-disable no-await-in-loop -- rename pairs consume one cumulative work budget. */
async function pairRenames(
  pairs: SourcePair[],
  budget: GitDiffBudget,
  reasons: Set<string>,
): Promise<SourcePair[]> {
  const removed = pairs.filter((pair) => pair.new.sourceStatus === "absent" && pair.old.content);
  const added = pairs.filter((pair) => pair.old.sourceStatus === "absent" && pair.new.content);
  const scores: { oldPair: SourcePair; newPair: SourcePair; score: number }[] = [];
  const bestOld = new Map<SourcePair, { score: number; count: number }>();
  const bestNew = new Map<SourcePair, { score: number; count: number }>();

  try {
    for (const oldPair of removed) {
      for (const newPair of added) {
        if (!oldPair.old.content || !newPair.new.content) continue;
        if (budget.tick()) await setImmediate();
        const score = sameContents(oldPair.old, newPair.new)
          ? 100
          : await sourceSimilarity(oldPair.old.content, newPair.new.content, budget);
        if (score >= 50) {
          scores.push({ oldPair, newPair, score });
          rememberBest(bestOld, oldPair, score);
          rememberBest(bestNew, newPair, score);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof GitDiffLimitError)) throw error;
    reasons.add(error.message);
    reasons.add("Rename comparison is incomplete; unpaired additions/deletions remain explicit");
    return pairs;
  }
  const consumed = new Set<SourcePair>();
  const renamed: SourcePair[] = [];
  for (const entry of scores) {
    const oldBest = bestOld.get(entry.oldPair);
    const newBest = bestNew.get(entry.newPair);
    if (
      oldBest?.score !== entry.score ||
      newBest?.score !== entry.score ||
      oldBest.count !== 1 ||
      newBest.count !== 1
    )
      continue;
    consumed.add(entry.oldPair);
    consumed.add(entry.newPair);
    renamed.push({
      old: entry.oldPair.old,
      new: entry.newPair.new,
      rename: {
        method: entry.score === 100 ? "identical-content" : "line-similarity",
        similarity: entry.score,
      },
    });
  }
  if (scores.some((entry) => !consumed.has(entry.oldPair) && !consumed.has(entry.newPair))) {
    reasons.add("Ambiguous rename candidates remain separate additions/deletions");
  }
  return [...pairs.filter((pair) => !consumed.has(pair)), ...renamed];
}

/* oxlint-enable no-await-in-loop */

async function renderPair(
  pair: SourcePair,
  request: GitChangeRequest,
  budget: GitDiffBudget,
  reasons: Set<string>,
): Promise<GitSourceFile> {
  const selected = request.side === "old" ? pair.old : pair.new;
  const oldExists = pair.old.sourceStatus !== "absent";
  const newExists = pair.new.sourceStatus !== "absent";
  let changedRanges: GitLineRange[] = [];
  let rangeReason: string | undefined;
  if (selected.content) {
    try {
      if (!oldExists || !newExists) changedRanges = wholeFile(selected.content);
      else if (pair.old.content && pair.new.content) {
        const diff = await changedLineRanges(pair.old.content, pair.new.content, budget);
        changedRanges = request.side === "old" ? diff.oldRanges : diff.newRanges;
      } else {
        rangeReason =
          "Changed lines unavailable because the opposite source cannot be compared as raw text";
      }
    } catch (error) {
      if (!(error instanceof GitDiffLimitError)) throw error;
      rangeReason = error.message;
    }
  }
  if (rangeReason) reasons.add(rangeReason);
  for (const source of [pair.old, pair.new]) {
    if (source.sourceStatus === "unavailable") reasons.add(source.reason ?? "Source unavailable");
  }
  const unsupported = [pair.old, pair.new].some((source) =>
    ["unavailable", "symlink", "submodule"].includes(source.sourceStatus),
  );
  const change = pair.rename
    ? "renamed"
    : !oldExists
      ? "added"
      : !newExists
        ? "deleted"
        : unsupported
          ? "unknown"
          : "modified";
  const reason = selected.reason ?? rangeReason;
  return {
    path:
      selected.sourceStatus === "absent"
        ? request.side === "old"
          ? pair.new.path
          : pair.old.path
        : selected.path,
    ...(oldExists ? { oldPath: pair.old.path } : {}),
    ...(newExists ? { newPath: pair.new.path } : {}),
    change,
    sourceStatus: selected.sourceStatus,
    ...(selected.content ? { content: selected.content } : {}),
    ...(selected.contentHash ? { contentHash: selected.contentHash } : {}),
    ...(selected.origin ? { origin: selected.origin } : {}),
    changedRanges,
    ranges:
      request.scope === "files" && selected.content ? wholeFile(selected.content) : changedRanges,
    ...(reason ? { reason } : {}),
    ...(pair.rename ? { rename: pair.rename } : {}),
  };
}

/** Compare fixed commit trees or a fixed base with final raw disk contents; never read the index as source. */
/* oxlint-disable no-await-in-loop -- reads and comparisons share request budgets; revisions are checked after all comparisons. */
export async function readGitChanges(
  cwd: string,
  request: GitChangeRequest,
  signal?: AbortSignal,
  options: GitSourceOptions = {},
): Promise<GitChangeResult> {
  if (!["files", "lines"].includes(request.scope) || !["new", "old"].includes(request.side))
    throw new SignalGrepError("Invalid Git scope or side");
  if (request.target !== undefined && request.base === undefined)
    throw new SignalGrepError("Git commit comparison requires an explicit base and target");
  const maxFiles = validateLimit(options.maxFiles ?? MAX_STRUCTURE_FILES, "Git file limit");
  const maxBytes = validateLimit(options.maxBytes ?? MAX_STRUCTURE_BYTES, "Git byte limit");
  const maxDiffWork = validateLimit(
    options.maxDiffWork ?? MAX_GIT_DIFF_WORK,
    "Git diff work limit",
  );
  const base = await resolveGitCommit(cwd, request.base ?? "HEAD", signal);
  const target =
    request.target === undefined ? undefined : await resolveGitCommit(cwd, request.target, signal);
  const oldTree = await readGitTree(cwd, base, signal);
  const newTree = target ? await readGitTree(cwd, target, signal) : undefined;
  const diskNames = target ? undefined : await worktreeNames(cwd, signal);
  const reasons = new Set<string>();
  if (oldTree.limited || newTree?.limited || diskNames?.limited)
    reasons.add("Git candidate metadata limit reached");
  const candidates = [
    ...new Set([...oldTree.entries.keys(), ...(newTree?.entries.keys() ?? diskNames?.paths ?? [])]),
  ]
    .filter((path) => {
      if (!target) return true;
      const oldEntry = oldTree.entries.get(path);
      const newEntry = newTree?.entries.get(path);
      return (
        !oldEntry || !newEntry || oldEntry.blob !== newEntry.blob || oldEntry.mode !== newEntry.mode
      );
    })
    .toSorted();
  let visible = await visibleGitPaths(cwd, candidates, signal, options.includePath);
  let filterBytes = 0;
  if (options.filterPaths) {
    const allowed = new Set(visible);
    const filtered = await options.filterPaths(visible);
    visible = filtered.paths;
    filterBytes = filtered.bytesRead ?? 0;
    if (!Number.isSafeInteger(filterBytes) || filterBytes < 0 || filterBytes > maxBytes)
      throw new SignalGrepError("Git path filtering exceeded its shared source read budget");
    if (visible.some((path) => !allowed.has(path)))
      throw new SignalGrepError("Git path filter expanded the authorized candidate set");
    visible = [...new Set(visible)];
  }
  const readBudget: GitReadBudget = { bytes: filterBytes, maxBytes };
  const diffBudget = new GitDiffBudget(maxDiffWork, signal);
  const pairs: SourcePair[] = [];
  let filesRead = 0;
  let omittedFiles = 0;
  for (const path of visible) {
    if (signal?.aborted) throw abortError();
    const oldEntry = oldTree.entries.get(path);
    const newEntry = newTree?.entries.get(path);
    if (filesRead >= maxFiles || readBudget.bytes >= maxBytes) {
      omittedFiles += 1;
      continue;
    }
    filesRead += 1;
    const oldSource = oldEntry
      ? await readGitBlob(cwd, base, oldEntry, readBudget, signal)
      : absent(path);
    const newSource = target
      ? newEntry
        ? await readGitBlob(cwd, target, newEntry, readBudget, signal)
        : absent(path)
      : await readWorktreeSource(cwd, path, readBudget, signal);
    if (oldSource.sourceStatus === "absent" && newSource.sourceStatus === "absent") continue;
    if (
      sameContents(oldSource, newSource) &&
      (process.platform === "win32" || oldSource.mode === newSource.mode)
    )
      continue;
    pairs.push({ old: oldSource, new: newSource });
  }
  if (omittedFiles > 0)
    reasons.add(
      `Git read limits omitted ${String(omittedFiles)} candidate files (${String(maxFiles)} files / ${String(maxBytes)} bytes)`,
    );
  const paired = await pairRenames(pairs, diffBudget, reasons);
  const files: GitSourceFile[] = [];
  for (const pair of paired) files.push(await renderPair(pair, request, diffBudget, reasons));
  // Range calculation and rename work must not outlive the disk revision used to discover them.
  for (const pair of paired) {
    if (pair.new.origin?.kind !== "worktree") continue;
    await verifyWorktreeRevision(cwd, pair.new.path, pair.new.origin.revision);
  }
  return {
    base,
    target: target ?? "worktree",
    scope: request.scope,
    side: request.side,
    files: files.toSorted((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
    partial: reasons.size > 0,
    reasons: [...reasons],
    filesRead,
    bytesRead: readBudget.bytes,
    diffWork: diffBudget.work,
    omittedFiles,
  };
}

/* oxlint-enable no-await-in-loop */

/** Revalidate path membership and today's privacy rules before returning immutable historical source. */
export async function readGitSource(
  cwd: string,
  identity: { commit: string; path: string; blob?: string },
  signal?: AbortSignal,
  options: Pick<GitSourceOptions, "includePath" | "maxBytes"> = {},
): Promise<GitRawSource> {
  const path = gitPath(cwd, identity.path);
  if (!(await visibleGitPaths(cwd, [path], signal, options.includePath)).includes(path))
    throw new SignalGrepError("Git source is excluded by current workspace privacy or path rules");
  const selected = await filterHistoricalPaths(
    cwd,
    [path],
    { glob: [], exclude: [], hidden: true },
    signal,
  );
  if (selected.partial || !selected.paths.includes(path))
    throw new SignalGrepError(
      "Git source is excluded or unverified by current .ignore/.rgignore rules",
    );
  const commit = await resolveGitCommit(cwd, identity.commit, signal);
  const tree = await readGitTree(cwd, commit, signal, path);
  const entry: GitTreeEntry | undefined = tree.entries.get(path);
  if (!entry) throw new SignalGrepError("Git source path does not exist in the requested commit");
  if (identity.blob !== undefined && identity.blob !== entry.blob)
    throw new SignalGrepError("Git source blob does not match its commit and path");
  return readGitBlob(
    cwd,
    commit,
    entry,
    { bytes: selected.ignoreBytesRead, maxBytes: options.maxBytes ?? MAX_STRUCTURE_BYTES },
    signal,
  );
}
