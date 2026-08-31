import { resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import type { InspectionTarget } from "./inspect.js";
import type { SourceAccess } from "./source-access.js";
import { SourceContinuations } from "./source-continuations.js";
import {
  SourceDocumentError,
  type ByteRange,
  type SourceDocument,
  type SourceReference,
} from "./source-document.js";
import { mergeByteRanges, sourcePage, type SourceFragment } from "./source-pages.js";
import { getSourceRevision, sameSourceRevision, sourceRangeFromBytes } from "./source.js";
import type { CodeStructureProvider } from "./structure.js";
import { syntaxLanguage } from "./syntax.js";
import type { SignalGrepInput } from "./service.js";
import {
  MAX_RESULT_BYTES,
  type InspectBatchItemDetails,
  type SignalGrepResult,
  type SourceExcerptDetails,
  type SourceRevision,
  type StructureDetails,
} from "./types.js";

export interface SourceInspectionTarget {
  path: string;
  line: number;
  matchIndex?: number;
  reference?: SourceReference;
  range?: ByteRange;
  /** Raw source byte offset; legacy retained-match focus is line-relative. */
  absoluteFocus?: number;
  focus?: number;
  expectedRevision?: SourceRevision;
  unverified?: boolean;
  retry?: SignalGrepInput;
}
interface PreparedTarget {
  target: SourceInspectionTarget;
  document: SourceDocument;
  range: ByteRange;
  structure: StructureDetails;
  focus: number;
}
interface SourceBlock {
  document: SourceDocument;
  ranges: ByteRange[];
  targets: number[];
  prepared: PreparedTarget[];
  fragments: SourceFragment[];
  remaining: ByteRange[];
  text: string[];
  continuation?: string;
}

export function legacySourceTarget(target: InspectionTarget): SourceInspectionTarget {
  return {
    path: target.path,
    line: target.line,
    unverified: target.unverified,
    ...(target.expectedRevision ? { expectedRevision: target.expectedRevision } : {}),
    ...(target.retainedMatch?.occurrences[0]
      ? { focus: target.retainedMatch.occurrences[0].byteStart }
      : {}),
  };
}

function errorStatus(error: unknown): StructureDetails["status"] | undefined {
  if (error instanceof SourceDocumentError)
    return error.reason === "encoding" ? "source-unavailable" : error.reason;
  if (
    error instanceof Error &&
    "code" in error &&
    ["ENOENT", "EACCES", "EPERM", "EISDIR", "ENOTDIR"].includes(String(error.code))
  )
    return "source-unavailable";
  return undefined;
}

async function prepare(
  target: SourceInspectionTarget,
  access: SourceAccess,
  structure?: CodeStructureProvider,
): Promise<PreparedTarget> {
  if (target.unverified)
    throw new SourceDocumentError(
      "source-unavailable",
      "Snapshot source revision is unverified; refresh the search",
    );
  const document = await access.load(target.path, target.reference);
  if (
    target.expectedRevision &&
    (document.reference.origin.kind !== "worktree" ||
      !sameSourceRevision(target.expectedRevision, document.reference.origin.revision))
  )
    throw new SourceDocumentError("source-changed", "Source changed; refresh the search");
  if (target.line > document.lineStarts.length)
    throw new SourceDocumentError(
      "source-unavailable",
      `Source line ${target.line} is beyond the end of the file`,
    );
  const lineRange = document.lineRange(target.line);
  const focus =
    target.range?.start ??
    target.absoluteFocus ??
    Math.min(lineRange.end, lineRange.start + (target.focus ?? 0));
  let range = target.range;
  let details: StructureDetails = { status: "no-symbol" };
  const language = syntaxLanguage(document.path);
  if (document.utf8 && language && language !== "go") {
    const syntax = await access.syntax(document);
    details = {
      status:
        syntax.status === "ok"
          ? "no-symbol"
          : syntax.status === "unsupported"
            ? "provider-unavailable"
            : "parse-error",
      provider: "tree-sitter",
      language,
    };
    if (syntax.status === "ok") {
      const character = document.toCharacterOffset(focus);
      const symbols = syntax.symbols
        .filter((symbol) => symbol.hasBody && symbol.start <= character && character < symbol.end)
        .toSorted((a, b) => a.end - a.start - (b.end - b.start));
      // A path+line can point at indentation before the declaration itself.
      const symbol =
        symbols[0] ??
        syntax.symbols.find(
          (item) =>
            item.hasBody && document.lineAt(document.toByteOffset(item.start)) === target.line,
        );
      if (symbol && !target.range) {
        range = {
          start: document.toByteOffset(symbol.start),
          end: document.toByteOffset(symbol.end),
        };
        const lines = {
          startLine: document.lineAt(range.start),
          endLine: document.lineAt(Math.max(range.start, range.end - 1)),
        };
        details = {
          status: "available",
          provider: "tree-sitter",
          language,
          range: lines,
          symbol: {
            name: symbol.name,
            kind: symbol.kind,
            scope: symbol.scope ? [symbol.scope] : [],
            range: lines,
          },
        };
      }
    }
  } else if (
    document.utf8 &&
    structure &&
    document.reference.origin.kind === "worktree" &&
    !target.range
  ) {
    const result = await structure.inspect(
      {
        absolutePath: resolve(access.cwd, target.path),
        cwd: access.cwd,
        line: target.line,
        expectedRevision: document.reference.origin.revision,
      },
      access.signal,
    );
    details = result.details;
    if (["source-changed", "source-unavailable", "file-too-large"].includes(details.status))
      throw new SourceDocumentError(
        details.status === "source-changed" ? "source-changed" : "source-unavailable",
        `Source inspection: ${details.status}`,
      );
    if (details.range)
      range = document.lineRange(
        details.range.startLine,
        Math.min(details.range.endLine, document.lineStarts.length),
      );
  } else {
    details = { status: "provider-unavailable", ...(language ? { language } : {}) };
  }
  range ??= document.lineRange(
    Math.max(1, target.line - 10),
    Math.min(document.lineStarts.length, target.line + 10),
  );
  document.checkRange(range);
  return { target, document, range, structure: details, focus };
}

function blockDetails(block: SourceBlock): SourceExcerptDetails {
  const starts = block.fragments.map((fragment) => fragment.start);
  const ends = block.fragments.map((fragment) => fragment.end);
  const start = starts.length > 0 ? Math.min(...starts) : (block.ranges[0]?.start ?? 0);
  const end = ends.length > 0 ? Math.max(...ends) : start;
  const nextRequest: SignalGrepInput | undefined = block.continuation
    ? { mode: "inspect", sourceCursor: block.continuation }
    : undefined;
  return {
    range: {
      startLine: block.document.lineAt(start),
      endLine: block.document.lineAt(Math.max(start, end - 1)),
    },
    omittedBefore: block.remaining
      .filter((range) => range.end <= start)
      .reduce(
        (n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start),
        0,
      ),
    omittedAfter: block.remaining
      .filter((range) => range.start >= end)
      .reduce(
        (n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start),
        0,
      ),
    truncatedLines: [],
    reference: block.document.reference,
    targetRanges: block.ranges,
    fragments: block.fragments,
    remainingRanges: block.remaining,
    complete: block.document.utf8 && block.remaining.length === 0,
    ...(nextRequest ? { nextRequest } : {}),
  };
}

function render(items: InspectBatchItemDetails[], blocks: SourceBlock[], single: boolean): string {
  const rows = items.map(
    (item) =>
      `Target #${item.inputIndex} ${item.path ?? ""}:${item.line ?? ""}: ${item.status}${item.block ? `; Block #${item.block}` : ""}${item.structure ? ` [structure: ${item.structure.status}${item.structure.provider ? ` via ${item.structure.provider}` : ""}]` : ""}${item.structure?.symbol ? ` ${item.structure.symbol.name} (${item.structure.symbol.kind}) lines ${item.structure.symbol.range.startLine}-${item.structure.symbol.range.endLine}` : ""}${item.error ? `; ${item.error}` : ""}${item.retry ? `\nRetry: ${JSON.stringify(item.retry)}` : ""}`,
  );
  const sourceRows = blocks.map(
    (block, index) =>
      `[Block #${index + 1}] ${block.document.path}; ${block.document.reference.origin.kind === "git" ? `commit ${block.document.reference.origin.commit}; blob ${block.document.reference.origin.blob}` : `source sha256 ${block.document.reference.origin.contentHash}`}\n${block.text.join("\n")}\n[source ${block.remaining.length ? `PARTIAL; missing byte ranges ${JSON.stringify(block.remaining)}` : "complete"}; shared 16384-byte output limit]${block.continuation ? `\nNext request: ${JSON.stringify({ mode: "inspect", sourceCursor: block.continuation })}` : ""}`,
  );
  return [
    single
      ? "Source inspection"
      : `Batch inspection: ${items.filter((item) => item.status === "returned").length} of ${items.length} targets returned; overlapping ranges merged before the shared 16384-byte budget.`,
    ...rows,
    ...sourceRows,
  ].join("\n\n");
}

export async function inspectDocuments(
  targets: SourceInspectionTarget[],
  access: SourceAccess,
  continuations: SourceContinuations,
  structure?: CodeStructureProvider,
): Promise<SignalGrepResult> {
  const items: InspectBatchItemDetails[] = [];
  const blocks: SourceBlock[] = [];
  for (const [index, target] of targets.entries()) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- targets share one bounded source/parse context and input-order response budget.
      const prepared = await prepare(target, access, structure);
      let blockIndex = blocks.findIndex((block) => block.document === prepared.document);
      if (blockIndex < 0) {
        blockIndex = blocks.length;
        blocks.push({
          document: prepared.document,
          ranges: [],
          targets: [],
          prepared: [],
          fragments: [],
          remaining: [],
          text: [],
        });
      }
      const block = blocks[blockIndex];
      if (!block) throw new Error("Inspection block is unavailable");
      block.ranges.push(prepared.range);
      block.targets.push(index);
      block.prepared.push(prepared);
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "returned",
        ...(target.matchIndex !== undefined ? { matchIndex: target.matchIndex } : {}),
        block: blockIndex + 1,
        structure: prepared.structure,
      });
    } catch (error) {
      if (access.signal?.aborted || (error instanceof Error && error.name === "AbortError"))
        throw abortError();
      const status = errorStatus(error);
      if (!status) throw error;
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "error",
        structure: { status },
        error: error instanceof Error ? error.message : status,
      });
    }
  }
  for (const block of blocks) {
    block.ranges = mergeByteRanges(block.ranges);
    block.remaining = block.ranges;
  }
  const baseBytes = Buffer.byteLength(render(items, blocks, targets.length === 1));
  let remainingResponseBytes = MAX_RESULT_BYTES - baseBytes - blocks.length * 400;
  if (blocks.length && remainingResponseBytes < blocks.length * 256)
    throw new SignalGrepError(
      "Inspection selectors exceed the shared response limit; use fewer targets",
    );
  for (const [index, block] of blocks.entries()) {
    const followingBlocks = blocks.length - index - 1;
    let allowance = remainingResponseBytes - followingBlocks * 256;
    if (!block.document.utf8) {
      const target = block.prepared[0];
      if (!target) throw new Error("Missing lossy-source target");
      const lineStart = block.document.lineStarts[target.target.line - 1] ?? 0;
      const relativeFocus = target.focus - lineStart;
      const preview = sourceRangeFromBytes(
        block.document.bytes,
        Math.max(1, target.target.line - 10),
        Math.min(block.document.lineStarts.length, target.target.line + 10),
        target.target.line,
        {
          maxBytes: Math.min(MAX_RESULT_BYTES - 1024, Math.max(256, allowance - 300)),
          focus: {
            byteStart: relativeFocus,
            byteEnd: relativeFocus,
            range: {
              start: { line: target.target.line - 1, character: relativeFocus },
              end: { line: target.target.line - 1, character: relativeFocus },
              encoding: "utf-8",
            },
          },
        },
      );
      block.text.push(
        `[lossy UTF-8 preview only; original bytes are not fully representable; source continuation unavailable; lines may be clipped at 500 characters]\n${preview.text}`,
      );
      remainingResponseBytes -= Buffer.byteLength(block.text.at(-1) ?? "") + 1;
      for (const targetIndex of block.targets) {
        const item = items[targetIndex];
        if (item)
          item.source = {
            range: { startLine: preview.startLine, endLine: preview.endLine },
            omittedBefore: preview.omittedBefore,
            omittedAfter: preview.omittedAfter,
            truncatedLines: preview.truncatedLines,
            complete: false,
            reference: block.document.reference,
          };
      }
      continue;
    }
    // Allocate around distinct requested locations after computing the union.
    // This keeps distant batch targets visible without charging overlap twice.
    const focuses = [...new Set(block.prepared.map((prepared) => prepared.focus))];
    for (const [focusIndex, focus] of focuses.entries()) {
      if (
        !block.remaining.some((range) => range.start <= focus && focus < range.end) ||
        allowance < 256
      )
        continue;
      const missingBytes = block.remaining.reduce(
        (total, range) => total + range.end - range.start,
        0,
      );
      const budget =
        missingBytes + block.remaining.length * 200 < allowance
          ? allowance
          : Math.max(256, Math.floor(allowance / (focuses.length - focusIndex)));
      const page = sourcePage(block.document, block.remaining, budget, focus);
      block.fragments.push(page.fragment);
      block.remaining = page.remaining;
      block.text.push(page.text);
      const pageBytes = Buffer.byteLength(page.text) + 1;
      allowance -= pageBytes;
      remainingResponseBytes -= pageBytes;
    }
    while (block.remaining.length && allowance >= 256) {
      const page = sourcePage(block.document, block.remaining, allowance);
      block.fragments.push(page.fragment);
      block.remaining = page.remaining;
      block.text.push(page.text);
      const pageBytes = Buffer.byteLength(page.text) + 1;
      allowance -= pageBytes;
      remainingResponseBytes -= pageBytes;
    }
    if (block.remaining.length)
      block.continuation = continuations.create(
        block.document.reference,
        block.ranges,
        block.remaining,
      );
    if (block.document.reference.origin.kind === "worktree") {
      // oxlint-disable-next-line no-await-in-loop -- each block's revision check follows its own completed read and shared output allocation.
      const current = await getSourceRevision(resolve(access.cwd, block.document.path));
      if (!current || !sameSourceRevision(current, block.document.reference.origin.revision)) {
        block.text = [];
        block.fragments = [];
        block.remaining = block.ranges;
        delete block.continuation;
        for (const targetIndex of block.targets) {
          const item = items[targetIndex];
          if (item) {
            item.status = "error";
            item.structure = { status: "source-changed" };
            item.error = "Source changed during inspection; refresh the source";
          }
        }
      }
    }
    for (const targetIndex of block.targets) {
      const item = items[targetIndex];
      if (item?.status === "returned") item.source = blockDetails(block);
    }
    if (access.signal?.aborted) throw abortError();
    if (index >= 5) throw new Error("Inspection target limit was not validated");
  }
  const text = render(items, blocks, targets.length === 1);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SignalGrepError("Inspection metadata exceeds the response byte limit");
  const complete =
    items.every((item) => item.status === "returned") &&
    blocks.every((block) => block.remaining.length === 0);
  const first = items[0];
  return {
    text,
    details: {
      version: 1,
      mode: "inspect",
      status: complete ? "complete" : "partial",
      snapshotComplete: complete,
      totalMatches: 0,
      storedMatches: 0,
      returnedMatches: 0,
      totalFiles: blocks.length,
      inspections: items,
      sourceBlocks: blocks.map((block) => ({
        path: block.document.path,
        source: blockDetails(block),
      })),
      ...(targets.length === 1 && first?.structure ? { structure: first.structure } : {}),
      ...(targets.length === 1 && first?.source
        ? {
            source: first.source,
            ...(first.source.nextRequest ? { nextRequest: first.source.nextRequest } : {}),
          }
        : {}),
    },
  };
}

export async function continueSource(
  cursor: string,
  access: SourceAccess,
  continuations: SourceContinuations,
): Promise<SignalGrepResult> {
  const state = continuations.resolve(cursor);
  const document = await access.load(state.source.path, state.source);
  const page = sourcePage(document, state.remaining, MAX_RESULT_BYTES - 1400);
  const next = continuations.advance(cursor, page.fragment);
  const block: SourceBlock = {
    document,
    ranges: state.target,
    targets: [],
    prepared: [],
    fragments: [page.fragment],
    remaining: page.remaining,
    text: [page.text],
    ...(next ? { continuation: next } : {}),
  };
  const source = blockDetails(block);
  const text = render([], [block], true);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SignalGrepError("Source continuation metadata exceeds the output limit");
  return {
    text,
    details: {
      version: 1,
      mode: "inspect",
      status: next ? "partial" : "complete",
      snapshotComplete: !next,
      totalMatches: 0,
      storedMatches: 0,
      returnedMatches: 0,
      totalFiles: 1,
      source,
      sourceBlocks: [{ path: document.path, source }],
      ...(source.nextRequest ? { nextRequest: source.nextRequest } : {}),
    },
  };
}
