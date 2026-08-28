import { resolve } from "node:path";
import { CursorError, SignalGrepError } from "./errors.js";
import type { CodeStructureProvider, StructureInspection } from "./structure.js";
import {
  assertExistingPathInsideCwd,
  getSourceRevision,
  isPathInsideCwd,
  readSourceRange,
  sameSourceRevision,
  SourceTooLargeError,
} from "./source.js";
import { SnapshotStore } from "./snapshot-store.js";
import type {
  SignalGrepDetails,
  SignalGrepResult,
  SourceRevision,
  StructureDetails,
} from "./types.js";

export interface InspectInput {
  path?: string;
  line?: number;
  cursor?: string;
}

export interface InspectOptions {
  snapshots: SnapshotStore;
  structure?: CodeStructureProvider;
}

function inspectDetails(structure: StructureDetails, returnedMatches: number): SignalGrepDetails {
  return {
    version: 1,
    mode: "inspect",
    status: "complete",
    totalMatches: 0,
    storedMatches: 0,
    totalFiles: 1,
    returnedMatches,
    snapshotComplete: true,
    structure,
  };
}

function sourceChangedDetails(details: StructureDetails): StructureDetails {
  return {
    status: "source-changed",
    ...(details.provider ? { provider: details.provider } : {}),
  };
}

function sourceChangedResult(
  path: string,
  line: number,
  structure: StructureDetails,
): SignalGrepResult {
  return {
    text: `${path}:${String(line)}\n\n[structure: source-changed; refresh the search before inspecting this match]`,
    details: inspectDetails(structure, 0),
  };
}

function expectedRevisionForMatch(
  input: InspectInput,
  absolutePath: string,
  snapshots: SnapshotStore,
  line: number,
): SourceRevision | undefined {
  if (!input.cursor) return undefined;
  const { snapshot } = snapshots.resolve(input.cursor);
  const match = snapshot.matches.find(
    (candidate) => candidate.absolutePath === absolutePath && candidate.lineNumber === line,
  );
  if (!match) {
    throw new CursorError("The requested line is not a retained match in this snapshot.");
  }
  const revision = snapshot.sourceRevisions.get(absolutePath);
  if (!revision) {
    throw new CursorError("The source revision for this retained match is unavailable.");
  }
  return revision;
}

export async function inspectSource(
  input: InspectInput,
  cwd: string,
  signal: AbortSignal | undefined,
  options: InspectOptions,
): Promise<SignalGrepResult> {
  const rawPath = input.path?.replace(/^@/, "");
  if (!rawPath) throw new SignalGrepError("path is required when mode=inspect");
  if (!Number.isSafeInteger(input.line) || input.line === undefined || input.line < 1) {
    throw new SignalGrepError("line must be a positive integer when mode=inspect");
  }

  const line = input.line;
  const absolutePath = resolve(cwd, rawPath);
  if (!isPathInsideCwd(absolutePath, cwd)) {
    throw new SignalGrepError("Inspect path must stay within the working directory");
  }
  await assertExistingPathInsideCwd(absolutePath, cwd);

  const expectedRevision = expectedRevisionForMatch(input, absolutePath, options.snapshots, line);
  let structure: StructureInspection;
  if (options.structure) {
    structure = await options.structure.inspect(
      { absolutePath, cwd, line, ...(expectedRevision ? { expectedRevision } : {}) },
      signal,
    );
  } else {
    const currentRevision = await getSourceRevision(absolutePath);
    const details: StructureDetails = { status: "provider-unavailable" };
    structure = { details, ...(currentRevision ? { currentRevision } : {}) };
  }

  if (
    expectedRevision &&
    structure.currentRevision &&
    !sameSourceRevision(expectedRevision, structure.currentRevision)
  ) {
    structure.details = sourceChangedDetails(structure.details);
  }
  if (structure.details.status === "source-changed") {
    return sourceChangedResult(rawPath, line, structure.details);
  }

  const requestedRange = structure.details.range ?? {
    startLine: Math.max(1, line - 10),
    endLine: line + 10,
  };
  let source;
  try {
    source = await readSourceRange(
      absolutePath,
      requestedRange.startLine,
      requestedRange.endLine,
      signal,
      line,
    );
    if (expectedRevision) {
      const finalRevision = await getSourceRevision(absolutePath);
      if (!finalRevision || !sameSourceRevision(expectedRevision, finalRevision)) {
        structure.details = sourceChangedDetails(structure.details);
      }
    }
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    if (error instanceof SourceTooLargeError) {
      const details: StructureDetails = {
        status: "file-too-large",
        ...(structure.details.provider ? { provider: structure.details.provider } : {}),
      };
      return {
        text: `Unable to inspect ${rawPath}:${String(line)}.\n\n[structure: file-too-large]`,
        details: inspectDetails(details, 0),
      };
    }
    throw error;
  }

  if (structure.details.status === "source-changed") {
    return sourceChangedResult(rawPath, line, structure.details);
  }

  const symbol = structure.details.symbol;
  const symbolText = symbol
    ? `${symbol.scope.length > 0 ? `${symbol.scope.join(".")}.` : ""}${symbol.name} (${symbol.kind}) lines ${symbol.range.startLine}-${symbol.range.endLine}`
    : `No enclosing symbol found for line ${String(line)}`;
  const statusText = `[structure: ${structure.details.status}${structure.details.provider ? ` via ${structure.details.provider}` : ""}]`;
  const truncationText = source.truncated
    ? "\n[source range truncated; request a narrower range]"
    : "";

  return {
    text: `${rawPath}:${String(line)}\n${symbolText}\n\n${source.text}${truncationText}\n\n${statusText}`,
    details: inspectDetails(structure.details, source.endLine - source.startLine + 1),
  };
}
