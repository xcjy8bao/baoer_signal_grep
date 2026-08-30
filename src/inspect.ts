import { resolve } from "node:path";
import { abortError, CursorError, SignalGrepError } from "./errors.js";
import type { CodeStructureProvider, StructureInspection } from "./structure.js";
import {
  assertExistingPathInsideCwd,
  getSourceRevision,
  isPathInsideCwd,
  readSourceRange,
  sameSourceRevision,
  SourceBudgetTooSmallError,
  SourceTooLargeError,
  type SourceRangeRead,
} from "./source.js";
import { SnapshotStore } from "./snapshot-store.js";
import {
  MAX_LINE_CHARACTERS,
  MAX_RESULT_BYTES,
  type MatchRecord,
  type SignalGrepDetails,
  type SignalGrepResult,
  type SourceExcerptDetails,
  type SourceRevision,
  type StructureDetails,
} from "./types.js";

export interface InspectInput {
  path?: string;
  line?: number;
  cursor?: string;
  matchIndex?: number;
}

export interface InspectOptions {
  snapshots: SnapshotStore;
  structure?: CodeStructureProvider;
}

export interface InspectionTarget {
  path: string;
  absolutePath: string;
  line: number;
  retainedMatch?: MatchRecord;
  expectedRevision?: SourceRevision;
  unverified: boolean;
}

export interface InspectionEvidence {
  target: InspectionTarget;
  structure: StructureDetails;
  source?: SourceRangeRead;
  revision?: SourceRevision;
}

export function resolveInspectionTarget(
  input: InspectInput,
  cwd: string,
  snapshots: SnapshotStore,
): InspectionTarget {
  let path = input.path?.replace(/^@/, "");
  let line = input.line;
  let retainedMatch: MatchRecord | undefined;
  if (input.matchIndex !== undefined) {
    if (!input.cursor) throw new SignalGrepError("matchIndex requires a cursor when mode=inspect");
    if (input.path !== undefined || input.line !== undefined) {
      throw new SignalGrepError("matchIndex replaces path and line when mode=inspect");
    }
    if (!Number.isSafeInteger(input.matchIndex) || input.matchIndex < 1) {
      throw new SignalGrepError("matchIndex must be a positive integer when mode=inspect");
    }
    const { snapshot } = snapshots.resolve(input.cursor);
    retainedMatch = snapshot.matches[input.matchIndex - 1];
    if (!retainedMatch) {
      throw new CursorError(
        `matchIndex is ${snapshot.snapshotComplete ? "outside this snapshot" : "not retained in this partial snapshot"}.`,
      );
    }
    path = retainedMatch.displayPath;
    line = retainedMatch.lineNumber;
  }
  if (!path) throw new SignalGrepError("path is required when mode=inspect");
  if (line === undefined || !Number.isSafeInteger(line) || line < 1) {
    throw new SignalGrepError("line must be a positive integer when mode=inspect");
  }
  const absolutePath = retainedMatch?.absolutePath ?? resolve(cwd, path);
  if (!isPathInsideCwd(absolutePath, cwd)) {
    throw new SignalGrepError("Inspect path must stay within the working directory");
  }
  let expectedRevision: SourceRevision | undefined;
  if (input.cursor) {
    const { snapshot } = snapshots.resolve(input.cursor);
    retainedMatch ??= snapshot.matches.find(
      (match) => match.absolutePath === absolutePath && match.lineNumber === line,
    );
    if (!retainedMatch) {
      throw new CursorError("The requested line is not a retained match in this snapshot.");
    }
    expectedRevision = snapshot.sourceRevisions.get(absolutePath);
  }
  return {
    path,
    absolutePath,
    line,
    unverified: input.cursor !== undefined && expectedRevision === undefined,
    ...(retainedMatch ? { retainedMatch } : {}),
    ...(expectedRevision ? { expectedRevision } : {}),
  };
}

export function sourceExcerptDetails(source: SourceRangeRead): SourceExcerptDetails {
  return {
    range: { startLine: source.startLine, endLine: source.endLine },
    omittedBefore: source.omittedBefore,
    omittedAfter: source.omittedAfter,
    truncatedLines: source.truncatedLines,
  };
}

export function sourceTruncationText(source: SourceRangeRead): string {
  const range = source.truncated
    ? `\n[source range centered on target; omitted ${String(source.omittedBefore)} lines before and ${String(source.omittedAfter)} lines after]`
    : "";
  const lines =
    source.truncatedLines.length > 0
      ? `\n[source line excerpts truncated: ${source.truncatedLines.join(", ")}; maximum ${String(MAX_LINE_CHARACTERS)} source characters per line]`
      : "";
  return range + lines;
}

export function inspectionDescription(evidence: InspectionEvidence): string {
  const symbol = evidence.structure.symbol;
  return symbol
    ? `${symbol.scope.length > 0 ? `${symbol.scope.join(".")}.` : ""}${symbol.name} (${symbol.kind}) lines ${symbol.range.startLine}-${symbol.range.endLine}`
    : `No enclosing symbol found for line ${String(evidence.target.line)}`;
}

function unavailableEvidence(
  target: InspectionTarget,
  status: StructureDetails["status"],
  provider?: string,
): InspectionEvidence {
  return { target, structure: { status, ...(provider ? { provider } : {}) } };
}

function isUnavailableSourceError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["ENOENT", "EACCES", "EPERM", "ENOTDIR", "EISDIR"].includes(String(error.code))
  );
}

export async function inspectSourceEvidence(
  target: InspectionTarget,
  cwd: string,
  signal: AbortSignal | undefined,
  options: InspectOptions,
  maxSourceBytes?: number,
): Promise<InspectionEvidence> {
  if (signal?.aborted) throw abortError();
  try {
    await assertExistingPathInsideCwd(target.absolutePath, cwd);
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (isUnavailableSourceError(error)) return unavailableEvidence(target, "source-unavailable");
    throw error;
  }
  if (signal?.aborted) throw abortError();
  if (target.unverified) return unavailableEvidence(target, "source-unavailable");
  let inspection: StructureInspection;
  if (options.structure) {
    inspection = await options.structure.inspect(
      {
        absolutePath: target.absolutePath,
        cwd,
        line: target.line,
        ...(target.expectedRevision ? { expectedRevision: target.expectedRevision } : {}),
      },
      signal,
    );
  } else {
    const currentRevision = await getSourceRevision(target.absolutePath);
    inspection = {
      details: { status: "provider-unavailable" },
      ...(currentRevision ? { currentRevision } : {}),
    };
  }
  const { details: structure } = inspection;
  if (signal?.aborted) throw abortError();
  if (["source-changed", "source-unavailable", "file-too-large"].includes(structure.status)) {
    return { target, structure };
  }
  const revision = inspection.currentRevision ?? (await getSourceRevision(target.absolutePath));
  if (!revision) return unavailableEvidence(target, "source-unavailable", structure.provider);
  if (target.expectedRevision && !sameSourceRevision(target.expectedRevision, revision)) {
    return unavailableEvidence(target, "source-changed", structure.provider);
  }
  const evidence: InspectionEvidence = { target, structure, revision };
  const headerBytes = Buffer.byteLength(
    `${target.path}:${String(target.line)}\n${inspectionDescription(evidence)}\n\n[structure: ${structure.status}${structure.provider ? ` via ${structure.provider}` : ""}]`,
  );
  const maxBytes = Math.min(
    maxSourceBytes ?? MAX_RESULT_BYTES,
    MAX_RESULT_BYTES - headerBytes - 1024,
  );
  if (maxBytes <= 0) throw new SourceBudgetTooSmallError();
  const range = structure.range ?? {
    startLine: Math.max(1, target.line - 10),
    endLine: target.line + 10,
  };
  try {
    evidence.source = await readSourceRange(
      target.absolutePath,
      range.startLine,
      range.endLine,
      signal,
      target.line,
      {
        maxBytes,
        ...(target.retainedMatch?.occurrences[0]
          ? { focus: target.retainedMatch.occurrences[0] }
          : {}),
      },
    );
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError"))
      throw abortError();
    if (error instanceof SourceTooLargeError)
      return unavailableEvidence(target, "file-too-large", structure.provider);
    if (isUnavailableSourceError(error)) {
      return unavailableEvidence(target, "source-unavailable", structure.provider);
    }
    throw error;
  }
  const finalRevision = await getSourceRevision(target.absolutePath);
  if (signal?.aborted) throw abortError();
  if (!finalRevision || !sameSourceRevision(revision, finalRevision)) {
    return unavailableEvidence(target, "source-changed", structure.provider);
  }
  return evidence;
}

export async function inspectSource(
  input: InspectInput,
  cwd: string,
  signal: AbortSignal | undefined,
  options: InspectOptions,
): Promise<SignalGrepResult> {
  const target = resolveInspectionTarget(input, cwd, options.snapshots);
  const evidence = await inspectSourceEvidence(target, cwd, signal, options);
  const { source, structure } = evidence;
  const details: SignalGrepDetails = {
    version: 1,
    mode: "inspect",
    status: source ? "complete" : "partial",
    totalMatches: 0,
    storedMatches: 0,
    totalFiles: 1,
    returnedMatches: source?.lines.length ?? 0,
    snapshotComplete: source !== undefined,
    structure,
    ...(source ? { source: sourceExcerptDetails(source) } : {}),
    ...(source && source.truncatedLines.length > 0
      ? { lineContentTruncated: source.truncatedLines.length }
      : {}),
  };
  const status = `[structure: ${structure.status}${structure.provider ? ` via ${structure.provider}` : ""}${!source && target.retainedMatch ? "; refresh the search before inspecting this match" : ""}]`;
  const text = source
    ? `${target.path}:${String(target.line)}\n${inspectionDescription(evidence)}\n\n${source.text}${sourceTruncationText(source)}\n\n${status}`
    : `${target.path}:${String(target.line)}\n\n${status}`;
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SignalGrepError("Inspection metadata exceeds the result byte budget");
  return { text, details };
}
