import { rangeEvidence } from "./analysis-evidence.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
const inferenceQueue = new OwnedTaskQueue();
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisResultSet } from "./analysis-types.js";
import {
  CONCEPT_MODEL,
  CONCEPT_REVISION,
  CONCEPT_TIMEOUT_MS,
  MAX_CONCEPT_CHARS,
  MAX_CONCEPT_CHUNKS,
} from "./concept-model.js";
import { abortError, SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { rpcRecord } from "./owned-json-rpc.js";
import { normalizeRequest } from "./request.js";
import type { SignalGrepInput } from "./service.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import { SourceDocumentError, type SourceDocument, type ByteRange } from "./source-document.js";
import { listWorkspaceFiles } from "./workspace-files.js";

interface Passage {
  document: SourceDocument;
  range: ByteRange;
  text: string;
}
function passage(document: SourceDocument, start: number): { value: Passage; next: number } {
  let end = Math.min(document.text.length, start + MAX_CONCEPT_CHARS);
  if (end < document.text.length) {
    const newline = document.text.lastIndexOf("\n", end);
    if (newline > start + MAX_CONCEPT_CHARS / 2) end = newline + 1;
    const code = document.text.charCodeAt(end);
    if (code >= 0xdc00 && code <= 0xdfff) end -= 1;
  }
  const range = { start: document.toByteOffset(start), end: document.toByteOffset(end) };
  return {
    value: {
      document,
      range,
      text: `${document.path.slice(0, 200)}\n${document.text.slice(start, end)}`,
    },
    next: end,
  };
}

async function similarities(query: string, passages: Passage[], parent?: AbortSignal) {
  const worker = fileURLToPath(new URL("./concept-worker.mjs", import.meta.url));
  const config = fileURLToPath(new URL("./syntax-worker.toml", import.meta.url));
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), CONCEPT_TIMEOUT_MS);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const buffers: Buffer[] = [];
  let bytes = 0;
  try {
    const processResult = await runOwnedProcess(
      {
        executable: process.execPath,
        args: process.versions.bun
          ? [
              `--config=${config}`,
              "--no-env-file",
              "--no-macros",
              "--no-install",
              worker,
              "--infer",
            ]
          : [worker, "--infer"],
        cwd: dirname(worker),
        env,
        signal,
        input: Buffer.from(JSON.stringify({ query, passages: passages.map((item) => item.text) })),
      },
      async (stdout) => {
        for await (const chunk of stdout) {
          bytes += chunk.byteLength;
          if (bytes > 32_768)
            throw new SignalGrepError("Concept worker exceeded its 32 KiB response budget");
          buffers.push(Buffer.from(chunk));
        }
      },
    );
    if (processResult.code !== 0)
      throw new SignalGrepError(
        `Local concept inference failed (${String(processResult.code)}): ${processResult.stderr.trim()}`,
      );
    const value: unknown = JSON.parse(Buffer.concat(buffers).toString("utf8"));
    if (
      !rpcRecord(value) ||
      !Array.isArray(value.scores) ||
      value.scores.length !== passages.length ||
      value.scores.some((score) => typeof score !== "number" || !Number.isFinite(score)) ||
      !Array.isArray(value.truncated) ||
      value.truncated.some(
        (index) =>
          typeof index !== "number" ||
          !Number.isSafeInteger(index) ||
          index < -1 ||
          index >= passages.length,
      ) ||
      typeof value.peakRssBytes !== "number" ||
      !Number.isFinite(value.peakRssBytes) ||
      value.peakRssBytes < 0
    )
      throw new SignalGrepError("Invalid concept inference response");
    return {
      scores: value.scores.filter((score): score is number => typeof score === "number"),
      truncated: value.truncated.filter((index): index is number => typeof index === "number"),
      peakRssBytes: value.peakRssBytes,
    };
  } catch (error) {
    if (parent?.aborted) throw abortError();
    if (controller.signal.aborted)
      throw new SignalGrepError(
        `Concept inference exceeded the ${String(CONCEPT_TIMEOUT_MS)} ms deadline`,
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runConceptSearch(
  input: SignalGrepInput,
  access: SourceAccess,
): Promise<AnalysisResultSet> {
  const query = input.query;
  if (!query?.trim() || query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError(
      "Concept query requires nonempty, single-line well-formed text of at most 256 characters",
    );
  const started = performance.now();
  const request = normalizeRequest({ ...input, pattern: "" });
  const files = await listWorkspaceFiles(access.cwd, access.signal, {
    ...(request.path ? { path: request.path } : {}),
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
  });
  const result: AnalysisResultSet = {
    kind: "concept",
    unit: "evidence-items",
    items: [],
    partial: files.partial,
    reasons: [...files.reasons],
    redact: input.redact ?? false,
  };
  const documents: { document: SourceDocument; next: number }[] = [];
  for (const path of files.paths) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- shared verified source budget; no source is sent over the network.
      const document = await access.load(path);
      if (!document.utf8) throw new SourceDocumentError("encoding", "Not lossless UTF-8");
      if (document.text.trim()) documents.push({ document, next: 0 });
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        result.partial = true;
        result.reasons.push(error.message);
        break;
      }
      if (!(error instanceof SourceDocumentError)) throw error;
      result.partial = true;
      result.reasons.push(`${path}: ${error.message}`);
    }
  }
  const passages: Passage[] = [];
  // Round-robin prevents one long file from consuming every candidate slot.
  while (
    passages.length < MAX_CONCEPT_CHUNKS &&
    documents.some((item) => item.next < item.document.text.length)
  ) {
    for (const item of documents) {
      if (passages.length >= MAX_CONCEPT_CHUNKS) break;
      if (item.next >= item.document.text.length) continue;
      const chunk = passage(item.document, item.next);
      passages.push(chunk.value);
      item.next = chunk.next;
    }
  }
  if (documents.some((item) => item.next < item.document.text.length)) {
    result.partial = true;
    result.reasons.push(
      `Concept coverage reached ${String(MAX_CONCEPT_CHUNKS)} passages of at most ${String(MAX_CONCEPT_CHARS)} characters; narrow path/glob to cover remaining source`,
    );
  }
  if (passages.length) {
    const inferred = await similarities(query, passages, access.signal);
    if (inferred.truncated.length) {
      result.partial = true;
      result.reasons.push(
        `Model token limit: ${String(inferred.truncated.length)} query/passages exceeded 512 tokens; ranking used their prefixes`,
      );
    }
    result.items = passages
      .map((item, index) => {
        const similarity = inferred.scores[index];
        if (similarity === undefined) throw new Error("Missing concept similarity");
        const evidence = rangeEvidence(item.document, item.range);
        return {
          path: item.document.path,
          line: item.document.lineAt(item.range.start),
          source: item.document.reference,
          range: item.range,
          label: `Concept candidate (cosine ${similarity.toFixed(4)})`,
          excerpt: evidence.excerpt,
          details: {
            kind: "concept-candidate",
            certainty: "candidate",
            score: similarity,
            rankingReason:
              "local multilingual E5 cosine similarity; relevance candidate, no binding or execution claim",
            model: CONCEPT_MODEL,
            revision: CONCEPT_REVISION,
            tokenTruncated: inferred.truncated.includes(index),
            excerptRange: evidence.excerptRange,
            excerptTruncated: evidence.excerptTruncated,
          },
        };
      })
      .toSorted(
        (a, b) =>
          b.details.score - a.details.score || a.path.localeCompare(b.path) || a.line - b.line,
      );
    result.stats = {
      inferencePeakRssBytes: inferred.peakRssBytes,
      passagesRanked: passages.length,
    };
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.stats = {
    ...result.stats,
    elapsedMs: Math.round(performance.now() - started),
    filesEnumerated: files.paths.length,
  };
  result.coverage = {
    conceptCandidates: result.partial ? "partial" : "complete",
    compilerBindings: "not-applicable",
  };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
  };
  return result;
}

export function conceptSearch(
  input: SignalGrepInput,
  access: SourceAccess,
): Promise<AnalysisResultSet> {
  return inferenceQueue.run(() => runConceptSearch(input, access), access.signal);
}
