import { posix } from "node:path";
import type { AnalysisResultSet } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import { SearchPathPolicy } from "./path-policy.js";
import { normalizeRequest, type RawSearchInput } from "./request.js";
import { listWorkspaceFiles } from "./workspace-files.js";

interface FileScore {
  score: number;
  reason: string;
}
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function subsequenceScore(text: string, query: string): number | undefined {
  const characters = Array.from(graphemes.segment(text), (item) => item.segment);
  const queryCharacters = Array.from(graphemes.segment(query), (item) => item.segment);
  let next = 0;
  let first = -1;
  let last = 0;
  for (const character of queryCharacters) {
    const index = characters.indexOf(character, next);
    if (index < 0) return undefined;
    if (first < 0) first = index;
    last = index;
    next = index + 1;
  }
  return Math.round((40 * queryCharacters.length) / Math.max(1, last - first + 1));
}

export function scoreFilePath(path: string, query: string): FileScore | undefined {
  if (!query) return { score: 0, reason: "all admitted files" };
  const normalized = path.toLowerCase();
  const needle = query.toLowerCase();
  const basename = posix.basename(normalized);
  if (basename === needle) return { score: 100, reason: "exact filename" };
  if (basename.slice(0, basename.length - posix.extname(basename).length) === needle)
    return { score: 95, reason: "exact filename stem" };
  if (basename.includes(needle)) return { score: 85, reason: "filename substring" };
  if (normalized.includes(needle)) return { score: 70, reason: "path substring" };
  const scores = needle
    .trim()
    .split(/\s+/)
    .map((term) => subsequenceScore(normalized, term));
  if (scores.some((score) => score === undefined)) return undefined;
  return {
    score: Math.min(...scores.map((score) => score ?? 0)),
    reason: "ordered fuzzy path characters; candidate, not an exact filename",
  };
}

export async function discoverFiles(
  input: RawSearchInput & { query?: string },
  cwd: string,
  signal?: AbortSignal,
): Promise<AnalysisResultSet> {
  const query = input.query ?? "";
  if (query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError(
      "File query must be well-formed single-line text of at most 256 characters",
    );
  const request = normalizeRequest({ ...input, pattern: "" });
  const files = await listWorkspaceFiles(cwd, signal, {
    ...(request.path ? { path: request.path } : {}),
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
  });
  const selected = files.paths
    .flatMap((path) => {
      const rank = scoreFilePath(path, query);
      return rank ? [{ path, ...rank }] : [];
    })
    .toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  const policy = new SearchPathPolicy(cwd);
  for (let offset = 0; offset < selected.length; offset += 16) {
    // oxlint-disable-next-line no-await-in-loop -- bounded canonical-path checks enforce the same protected-path policy.
    await Promise.all(
      selected.slice(offset, offset + 16).map((item) => policy.assertExistingPath(item.path)),
    );
    signal?.throwIfAborted();
  }
  return {
    kind: "files",
    unit: "files",
    partial: files.partial,
    reasons: files.reasons,
    items: selected.map((item) => ({
      path: item.path,
      line: 1,
      label: `File candidate (${item.reason})`,
      details: {
        kind: "file",
        score: item.score,
        rankingReason: item.reason,
        inspect: { mode: "inspect", path: item.path, line: 1 },
      },
    })),
    coverage: { fileEnumeration: files.partial ? "partial" : "complete" },
    stats: { filesEnumerated: files.paths.length },
    scope: {
      path: request.path ?? ".",
      requestedPath: request.path ?? ".",
      glob: request.glob,
      exclude: request.exclude,
      hidden: request.hidden,
      expandedToProjectRoot: false,
      assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
    },
    redact: input.redact ?? false,
  };
}
