import { abortError, SignalGrepError } from "./errors.js";
import {
  inspectionDescription,
  inspectSourceEvidence,
  resolveInspectionTarget,
  sourceExcerptDetails,
  type InspectionEvidence,
  type InspectInput,
  type InspectOptions,
} from "./inspect.js";
import {
  sameSourceRevision,
  SourceBudgetTooSmallError,
  SourceLineUnavailableError,
  type SourceExcerptLine,
} from "./source.js";
import {
  MAX_INSPECT_TARGETS,
  MAX_LINE_CHARACTERS,
  MAX_RESULT_BYTES,
  type InspectBatchItemDetails,
  type InspectRetry,
  type InspectTarget,
  type SignalGrepResult,
  type SourceRevision,
} from "./types.js";

export interface InspectBatchInput extends InspectInput {
  matchIndices?: number[];
  targets?: InspectTarget[];
}

interface InspectionBlock {
  path: string;
  absolutePath: string;
  revision: SourceRevision;
  lines: Map<number, SourceExcerptLine>;
}

function batchInputs(input: InspectBatchInput): InspectInput[] {
  if (input.path !== undefined || input.line !== undefined || input.matchIndex !== undefined) {
    throw new SignalGrepError("Batch inspection cannot be combined with path, line, or matchIndex");
  }
  if (input.matchIndices !== undefined && input.targets !== undefined) {
    throw new SignalGrepError("Use either matchIndices or targets for batch inspection");
  }
  const count = input.matchIndices?.length ?? input.targets?.length ?? 0;
  if (count < 1 || count > MAX_INSPECT_TARGETS) {
    throw new SignalGrepError(`Batch inspection requires 1-${String(MAX_INSPECT_TARGETS)} targets`);
  }
  if (input.matchIndices) {
    const { cursor } = input;
    if (!cursor) throw new SignalGrepError("matchIndices requires a cursor when mode=inspect");
    return input.matchIndices.map((matchIndex) => ({ cursor, matchIndex }));
  }
  if (input.cursor !== undefined) {
    throw new SignalGrepError("targets cannot be combined with a cursor; use matchIndices");
  }
  if (!input.targets)
    throw new SignalGrepError("Batch inspection requires targets or matchIndices");
  return input.targets;
}

function blockText(block: InspectionBlock, index: number): string {
  const lines = [...block.lines.values()].toSorted((left, right) => left.line - right.line);
  const output = [`[Block #${String(index + 1)}] ${block.path}`];
  let previous: number | undefined;
  for (const line of lines) {
    if (previous !== undefined && line.line > previous + 1) {
      output.push(`… omitted lines ${String(previous + 1)}-${String(line.line - 1)}`);
    }
    output.push(`${String(line.line)}: ${line.text}`);
    previous = line.line;
  }
  return output.join("\n");
}

function batchText(
  items: InspectBatchItemDetails[],
  blocks: InspectionBlock[],
  descriptions: Map<number, string>,
): string {
  const returned = items.filter((item) => item.status === "returned").length;
  const header = `Batch inspection: ${String(returned)} of ${String(items.length)} targets returned (${returned === items.length ? "complete" : "PARTIAL"}); shared ${String(MAX_RESULT_BYTES)}-byte output limit.`;
  const rows = items.map((item) => {
    let row = `Target #${String(item.inputIndex)} ${item.path ?? ""}:${String(item.line ?? "")}${item.matchIndex !== undefined ? ` {match #${String(item.matchIndex)}}` : ""}: ${item.status}`;
    if (item.block !== undefined) row += `; Block #${String(item.block)}`;
    if (item.structure)
      row += `; structure=${item.structure.status}${item.structure.provider ? ` via ${item.structure.provider}` : ""}`;
    const description = descriptions.get(item.inputIndex);
    if (description) row += `; ${description}`;
    if (item.error) row += `; ${item.error}`;
    if (item.source) {
      row += `; source lines ${String(item.source.range.startLine)}-${String(item.source.range.endLine)}`;
      if (item.source.omittedBefore > 0 || item.source.omittedAfter > 0) {
        row += `; omitted ${String(item.source.omittedBefore)} lines before and ${String(item.source.omittedAfter)} after`;
      }
      if (item.source.truncatedLines.length > 0) {
        row += `; line excerpts truncated at ${item.source.truncatedLines.join(",")} (max ${String(MAX_LINE_CHARACTERS)} source characters)`;
      }
    }
    if (item.retry)
      row += `\nRetry target #${String(item.inputIndex)}: ${JSON.stringify(item.retry)}`;
    return row;
  });
  return [header, ...rows, ...blocks.map(blockText)].join("\n\n");
}

function addEvidence(
  blocks: InspectionBlock[],
  evidence: InspectionEvidence,
): { blocks: InspectionBlock[]; block: number } {
  const { source, revision, target } = evidence;
  if (!source || !revision)
    throw new Error("Only verified source evidence may enter a batch block");
  const next = blocks.map((block) => ({ ...block, lines: new Map(block.lines) }));
  let index = next.findIndex(
    (block) =>
      block.absolutePath === target.absolutePath && sameSourceRevision(block.revision, revision),
  );
  if (index < 0) {
    index = next.length;
    next.push({ path: target.path, absolutePath: target.absolutePath, revision, lines: new Map() });
  }
  const block = next[index];
  if (!block) throw new Error("Batch block is unavailable");
  for (const line of source.lines) {
    const previous = block.lines.get(line.line);
    if (previous && previous.text !== line.text) {
      // A focused excerpt and a neighboring context excerpt can show different
      // portions of the same long line. Keep the target's focused excerpt.
      if (line.line !== target.line) continue;
    }
    block.lines.set(line.line, line);
  }
  return { blocks: next, block: index + 1 };
}

export async function inspectSourceBatch(
  input: InspectBatchInput,
  cwd: string,
  signal: AbortSignal | undefined,
  options: InspectOptions,
): Promise<SignalGrepResult> {
  if (signal?.aborted) throw abortError();
  const inputs = batchInputs(input);
  const targets = inputs.map((item) => resolveInspectionTarget(item, cwd, options.snapshots));
  const retries: InspectRetry[] = inputs.map((item) => ({ mode: "inspect", ...item }));
  const items: InspectBatchItemDetails[] = targets.map((target, index) => ({
    inputIndex: index + 1,
    path: target.path,
    line: target.line,
    ...(inputs[index]?.matchIndex !== undefined ? { matchIndex: inputs[index]?.matchIndex } : {}),
    status: "deferred",
    error: "not returned within the shared byte budget",
    ...(retries[index] ? { retry: retries[index] } : {}),
  }));
  const descriptions = new Map<number, string>();
  let blocks: InspectionBlock[] = [];
  const initialBytes = Buffer.byteLength(batchText(items, blocks, descriptions));
  if (initialBytes + 512 > MAX_RESULT_BYTES) {
    throw new SignalGrepError(
      "Batch target metadata exceeds the result byte budget; inspect fewer targets",
    );
  }

  for (const [index, target] of targets.entries()) {
    if (signal?.aborted) throw abortError();
    const previous = items[index];
    if (!previous) throw new Error("Batch item is unavailable");
    const remaining = MAX_RESULT_BYTES - Buffer.byteLength(batchText(items, blocks, descriptions));
    const maxSourceBytes = Math.floor((remaining - 512) / (targets.length - index)) - 512;
    if (maxSourceBytes <= 0) continue;
    let evidence: InspectionEvidence;
    try {
      // Each target consumes part of the same output budget. Sequential reads
      // also give cancellation one owner and do not fan out child processes.
      // oxlint-disable-next-line no-await-in-loop -- shared batch output budget.
      evidence = await inspectSourceEvidence(target, cwd, signal, options, maxSourceBytes);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError"))
        throw abortError();
      if (error instanceof SourceBudgetTooSmallError) continue;
      if (!(error instanceof SourceLineUnavailableError)) throw error;
      items[index] = { ...previous, status: "error", error: error.message };
      delete items[index]?.retry;
      continue;
    }
    if (!evidence.source) {
      items[index] = {
        inputIndex: previous.inputIndex,
        path: target.path,
        line: target.line,
        ...(previous.matchIndex !== undefined ? { matchIndex: previous.matchIndex } : {}),
        status: "error",
        structure: evidence.structure,
        error: `${evidence.structure.status}; ${target.retainedMatch ? "refresh the search before inspecting this match" : "source evidence is unavailable"}`,
      };
      continue;
    }
    const sourceRevision = evidence.revision;
    if (
      sourceRevision &&
      blocks.some(
        (block) =>
          block.absolutePath === target.absolutePath &&
          !sameSourceRevision(block.revision, sourceRevision),
      )
    ) {
      items[index] = {
        inputIndex: previous.inputIndex,
        path: target.path,
        line: target.line,
        ...(previous.matchIndex !== undefined ? { matchIndex: previous.matchIndex } : {}),
        status: "error",
        structure: { status: "source-changed" },
        error: "source-changed during batch inspection; refresh the source before retrying",
      };
      continue;
    }
    const candidate = addEvidence(blocks, evidence);
    const source = sourceExcerptDetails(evidence.source);
    items[index] = {
      inputIndex: previous.inputIndex,
      path: target.path,
      line: target.line,
      ...(previous.matchIndex !== undefined ? { matchIndex: previous.matchIndex } : {}),
      status: "returned",
      block: candidate.block,
      structure: evidence.structure,
      source,
      ...((source.omittedBefore > 0 || source.omittedAfter > 0) && retries[index]
        ? { retry: retries[index] }
        : {}),
    };
    descriptions.set(index + 1, inspectionDescription(evidence));
    if (Buffer.byteLength(batchText(items, candidate.blocks, descriptions)) > MAX_RESULT_BYTES) {
      items[index] = previous;
      descriptions.delete(index + 1);
    } else {
      blocks = candidate.blocks;
    }
  }
  if (signal?.aborted) throw abortError();
  const text = batchText(items, blocks, descriptions);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES) {
    throw new SignalGrepError(
      "Batch result metadata exceeds the byte budget; inspect fewer targets",
    );
  }
  const complete = items.every((item) => item.status === "returned");
  return {
    text,
    details: {
      version: 1,
      mode: "inspect",
      status: complete ? "complete" : "partial",
      snapshotComplete: complete,
      totalMatches: 0,
      storedMatches: 0,
      totalFiles: new Set(targets.map((target) => target.absolutePath)).size,
      returnedMatches: blocks.reduce((total, block) => total + block.lines.size, 0),
      inspections: items,
    },
  };
}
