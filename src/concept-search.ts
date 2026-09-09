import { rangeEvidence } from "./analysis-evidence.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
const inferenceQueue = new OwnedTaskQueue();
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnalysisResultSet, ConceptScoreProfile } from "./analysis-types.js";
import {
  CONCEPT_MODEL,
  CONCEPT_PASSAGE_OVERLAP_CHARS,
  CONCEPT_REVISION,
  MAX_CONCEPT_CHARS,
  MAX_CONCEPT_WORKER_OUTPUT_BYTES,
  resolveConceptTimeoutMs,
} from "./concept-model.js";
import { abortError, SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { rpcRecord } from "./owned-json-rpc.js";
import { normalizeRequest } from "./request.js";
import type { SignalGrepInput } from "./service.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import { SourceDocumentError, type SourceDocument, type ByteRange } from "./source-document.js";
import { listWorkspaceFiles } from "./workspace-files.js";

export interface Passage {
  document: SourceDocument;
  range: ByteRange;
  text: string;
}

/** Soft planning signal: large enumerations should narrow path/glob before interactive inference. */
const MAX_CONCEPT_FILES_WARN = 500;

function conciseWorkerError(stderr: string): string {
  const errorLine = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(?:[A-Za-z_$][\w$]*Error|Error|error):\s*\S/i.test(line));
  if (errorLine) return errorLine.replace(/^[^:]+(?:Error|error):\s*/i, "").slice(0, 512);
  const diagnostic = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (diagnostic) return diagnostic.slice(0, 512);
  return "worker returned no concise diagnostic";
}

function scoreProfile(scores: readonly number[]): ConceptScoreProfile {
  const ordered = scores.toSorted((a, b) => b - a);
  const count = ordered.length;
  const top = ordered[0];
  const min = ordered.at(-1);
  if (top === undefined || min === undefined || count === 0)
    throw new Error("Concept score profile requires at least one score");
  const middle = Math.floor(count / 2);
  const middleValue = ordered[middle] ?? top;
  const median = count % 2 === 1 ? middleValue : ((ordered[middle - 1] ?? top) + middleValue) / 2;
  const second = ordered[1];
  return {
    count,
    top,
    ...(second !== undefined ? { second, topMargin: top - second } : {}),
    median: median ?? top,
    min,
    spread: top - min,
  };
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
  let next = end;
  if (end < document.text.length) {
    next = Math.max(start + 1, end - CONCEPT_PASSAGE_OVERLAP_CHARS);
    const code = document.text.charCodeAt(next);
    if (code >= 0xdc00 && code <= 0xdfff) next += 1;
  }
  return {
    value: {
      document,
      range,
      text: document.text.slice(start, end),
    },
    next,
  };
}

export interface ConceptInferenceResult {
  scores: number[];
  cacheHits: number;
  cacheMisses: number;
  cacheMaxBytes: number;
  cacheBytes?: number;
  windowsRanked: number;
  warnings: string[];
  peakRssBytes: number;
}

export type ConceptInferenceRunner = (
  query: string,
  passages: Passage[],
  parent?: AbortSignal,
) => Promise<ConceptInferenceResult>;

async function similarities(
  query: string,
  passages: Passage[],
  parent?: AbortSignal,
): Promise<ConceptInferenceResult> {
  const worker = fileURLToPath(new URL("./concept-worker.mjs", import.meta.url));
  const config = fileURLToPath(new URL("./syntax-worker.toml", import.meta.url));
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const timeoutMs = resolveConceptTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        input: Buffer.from(
          JSON.stringify({
            query,
            encodedPassages: passages.map((item) => Buffer.from(item.text).toString("base64")),
          }),
        ),
      },
      async (stdout) => {
        for await (const chunk of stdout) {
          bytes += chunk.byteLength;
          if (bytes > MAX_CONCEPT_WORKER_OUTPUT_BYTES)
            throw new SignalGrepError("Concept worker exceeded its 4 MiB response budget");
          buffers.push(Buffer.from(chunk));
        }
      },
    );
    if (processResult.code !== 0)
      throw new SignalGrepError(
        `Local concept inference failed (${String(processResult.code)}): ${conciseWorkerError(processResult.stderr)}`,
      );
    const value: unknown = JSON.parse(Buffer.concat(buffers).toString("utf8"));
    if (
      !rpcRecord(value) ||
      !Array.isArray(value.scores) ||
      value.scores.length !== passages.length ||
      value.scores.some((score) => typeof score !== "number" || !Number.isFinite(score)) ||
      typeof value.cacheHits !== "number" ||
      !Number.isSafeInteger(value.cacheHits) ||
      value.cacheHits < 0 ||
      typeof value.cacheMisses !== "number" ||
      !Number.isSafeInteger(value.cacheMisses) ||
      value.cacheMisses < 0 ||
      typeof value.cacheMaxBytes !== "number" ||
      !Number.isSafeInteger(value.cacheMaxBytes) ||
      value.cacheMaxBytes <= 0 ||
      (value.cacheBytes !== undefined &&
        (typeof value.cacheBytes !== "number" ||
          !Number.isSafeInteger(value.cacheBytes) ||
          value.cacheBytes < 0)) ||
      typeof value.windowsRanked !== "number" ||
      !Number.isSafeInteger(value.windowsRanked) ||
      value.windowsRanked < passages.length ||
      !Array.isArray(value.warnings) ||
      value.warnings.some((warning) => typeof warning !== "string") ||
      typeof value.peakRssBytes !== "number" ||
      !Number.isFinite(value.peakRssBytes) ||
      value.peakRssBytes < 0
    )
      throw new SignalGrepError("Invalid concept inference response");
    return {
      scores: value.scores.filter((score): score is number => typeof score === "number"),
      cacheHits: value.cacheHits,
      cacheMisses: value.cacheMisses,
      cacheMaxBytes: value.cacheMaxBytes,
      ...(typeof value.cacheBytes === "number" ? { cacheBytes: value.cacheBytes } : {}),
      windowsRanked: value.windowsRanked,
      warnings: value.warnings.filter((warning): warning is string => typeof warning === "string"),
      peakRssBytes: value.peakRssBytes,
    };
  } catch (error) {
    if (parent?.aborted) throw abortError();
    if (controller.signal.aborted)
      throw new SignalGrepError(`Concept inference exceeded the ${String(timeoutMs)} ms deadline`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function validateConceptQuery(query: string | undefined): string {
  if (!query?.trim() || query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError(
      "Concept query requires nonempty, single-line well-formed text of at most 256 characters",
    );
  return query;
}

async function runConceptSearch(
  input: SignalGrepInput,
  access: SourceAccess,
  infer: ConceptInferenceRunner,
): Promise<AnalysisResultSet> {
  const query = validateConceptQuery(input.query);
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
  let filesSkippedEmpty = 0;
  let filesUnavailable = 0;
  for (const path of files.paths) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- shared verified source budget; no source is sent over the network.
      const document = await access.load(path);
      if (!document.utf8) throw new SourceDocumentError("encoding", "Not lossless UTF-8");
      // Empty or whitespace-only files carry no passages; this is a normal skip, not a coverage gap.
      if (!document.text.trim()) {
        filesSkippedEmpty += 1;
        continue;
      }
      documents.push({ document, next: 0 });
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        result.partial = true;
        result.reasons.push(error.message);
        filesUnavailable += 1;
        break;
      }
      if (!(error instanceof SourceDocumentError)) throw error;
      result.partial = true;
      filesUnavailable += 1;
      result.reasons.push(`${path}: ${error.message}`);
    }
  }
  const passages: Passage[] = [];
  while (documents.some((item) => item.next < item.document.text.length)) {
    for (const item of documents) {
      if (item.next >= item.document.text.length) continue;
      const chunk = passage(item.document, item.next);
      passages.push(chunk.value);
      item.next = chunk.next;
    }
  }
  const filesAdmitted = documents.length;
  const filesProcessed = filesAdmitted + filesSkippedEmpty + filesUnavailable;
  const filesNotProcessed = Math.max(0, files.paths.length - filesProcessed);
  if (files.paths.length > MAX_CONCEPT_FILES_WARN) {
    result.reasons.push(
      `Concept enumerated ${String(files.paths.length)} files; narrow path or glob for faster interactive retrieval`,
    );
  }
  result.counts = {
    filesEnumerated: files.paths.length,
    filesAdmitted,
    filesSkippedEmpty,
    filesUnavailable: filesUnavailable + filesNotProcessed,
    passagesQueued: passages.length,
  };
  if (passages.length) {
    const inferred = await infer(query, passages, access.signal);
    result.reasons.push(...inferred.warnings);
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
            tokenTruncated: false,
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
      conceptWindowsRanked: inferred.windowsRanked,
      conceptCacheHits: inferred.cacheHits,
      conceptCacheMisses: inferred.cacheMisses,
      conceptCacheMaxBytes: inferred.cacheMaxBytes,
      ...(inferred.cacheBytes === undefined ? {} : { conceptCacheBytes: inferred.cacheBytes }),
      scoreProfile: scoreProfile(inferred.scores),
    };
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.stats = {
    ...result.stats,
    elapsedMs: Math.round(performance.now() - started),
    filesEnumerated: files.paths.length,
    filesAdmitted,
  };
  result.coverage = {
    conceptCandidates: result.partial ? "partial" : "complete",
    admissionPlan: result.partial ? "partial" : "complete",
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
  return inferenceQueue.run(() => runConceptSearch(input, access, similarities), access.signal);
}

export type ConceptSearchRunner = typeof conceptSearch;

export function createConceptSearchRunner(infer: ConceptInferenceRunner): ConceptSearchRunner {
  return (input, access) =>
    inferenceQueue.run(() => runConceptSearch(input, access, infer), access.signal);
}
