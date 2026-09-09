#!/usr/bin/env node
import { env, pipeline } from "@huggingface/transformers";
import { isUtf8 } from "node:buffer";
import {
  conceptEmbeddingKey,
  enforceConceptCacheLimit,
  readConceptEmbedding,
  writeConceptEmbedding,
  type CachedConceptEmbedding,
} from "./concept-embedding-cache.js";
import {
  cosineSimilarity,
  embedConceptInputs,
  meanNormalized,
  type PendingConceptEmbedding,
} from "./concept-inference.js";
import {
  CONCEPT_ASSETS,
  CONCEPT_CACHE_MAX_BYTES,
  MAX_CONCEPT_CHARS,
  MAX_CONCEPT_WORKER_INPUT_BYTES,
  conceptCacheDirectory,
  conceptModelDirectory,
  verifyConceptModel,
} from "./concept-model.js";
import { installConceptModel } from "./concept-setup.js";
import { rpcRecord } from "./owned-json-rpc.js";

const CACHE_IO_CONCURRENCY = 64;

async function readCachedEmbeddings(root: string, requested: readonly PendingConceptEmbedding[]) {
  const cached = [];
  for (let offset = 0; offset < requested.length; offset += CACHE_IO_CONCURRENCY) {
    // oxlint-disable-next-line no-await-in-loop -- bounded batches avoid exhausting file descriptors.
    const batch = await Promise.all(
      requested
        .slice(offset, offset + CACHE_IO_CONCURRENCY)
        .map((item) => readConceptEmbedding(root, item.key)),
    );
    cached.push(...batch);
  }
  return cached;
}

async function writeCachedEmbeddings(
  root: string,
  created: readonly CachedConceptEmbedding[],
): Promise<boolean> {
  let failed = false;
  for (let offset = 0; offset < created.length; offset += CACHE_IO_CONCURRENCY) {
    // oxlint-disable-next-line no-await-in-loop -- bounded batches avoid exhausting file descriptors.
    const batch = await Promise.allSettled(
      created
        .slice(offset, offset + CACHE_IO_CONCURRENCY)
        .map((item) => writeConceptEmbedding(root, item)),
    );
    failed ||= batch.some((item) => item.status === "rejected");
  }
  return failed;
}

async function requestFromStdin(): Promise<{ query: string; passages: string[] }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    bytes += buffer.length;
    if (bytes > MAX_CONCEPT_WORKER_INPUT_BYTES)
      throw new Error("Concept worker input exceeds its 64 MiB source protocol budget");
  }
  const request: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    !rpcRecord(request) ||
    typeof request.query !== "string" ||
    request.query.length === 0 ||
    request.query.length > 256 ||
    !request.query.isWellFormed() ||
    /[\r\n\0]/u.test(request.query) ||
    !Array.isArray(request.encodedPassages) ||
    request.encodedPassages.some(
      (item) =>
        typeof item !== "string" ||
        item.length === 0 ||
        item.length % 4 !== 0 ||
        item.length > Math.ceil((((MAX_CONCEPT_CHARS + 256) * 4) / 3) * 4) + 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/u.test(item),
    )
  )
    throw new Error("Invalid concept worker input");
  const encodedPassages = request.encodedPassages.filter(
    (item): item is string => typeof item === "string",
  );
  const buffers = encodedPassages.map((item) => Buffer.from(item, "base64"));
  if (buffers.some((item) => !isUtf8(item)))
    throw new Error("Invalid UTF-8 concept worker passage");
  const passages = buffers.map((item) => item.toString("utf8"));
  if (
    passages.some(
      (item) => !item.length || item.length > MAX_CONCEPT_CHARS + 256 || !item.isWellFormed(),
    )
  )
    throw new Error("Invalid decoded concept worker passage");
  return { query: request.query, passages };
}

async function search(): Promise<void> {
  const request = await requestFromStdin();
  const directory = conceptModelDirectory();
  const cacheRoot = conceptCacheDirectory();
  await verifyConceptModel(directory);
  const requested: PendingConceptEmbedding[] = [
    { key: conceptEmbeddingKey("query", request.query), role: "query", text: request.query },
    ...request.passages.map((text): PendingConceptEmbedding => ({
      key: conceptEmbeddingKey("passage", text),
      role: "passage",
      text,
    })),
  ];
  const cached = await readCachedEmbeddings(cacheRoot, requested);
  const missing = requested.filter((_item, index) => !cached[index]);
  const warnings: string[] = [];
  let created: CachedConceptEmbedding[] = [];
  if (missing.length) {
    env.allowRemoteModels = false;
    env.useFSCache = false;
    env.useBrowserCache = false;
    env.localModelPath = "/";
    const extractor = await pipeline("feature-extraction", directory, {
      local_files_only: true,
      dtype: "q8",
      device: "cpu",
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    });
    try {
      created = await embedConceptInputs(extractor, missing);
    } finally {
      await extractor.dispose();
    }
    if (await writeCachedEmbeddings(cacheRoot, created))
      warnings.push(
        "Concept embedding cache write failed; ranking completed but some work may repeat",
      );
  }
  const createdByKey = new Map(created.map((item) => [item.key, item]));
  const embeddings = requested.map((item, index) => cached[index] ?? createdByKey.get(item.key));
  if (embeddings.some((item) => !item)) throw new Error("Missing concept embedding result");
  const queryWindows = embeddings[0]?.windows;
  if (!queryWindows?.length) throw new Error("Missing concept query embedding");
  const query = meanNormalized(queryWindows.map((window) => window.vector));
  const passageEmbeddings = embeddings.slice(1);
  const scores = passageEmbeddings.map((embedding) => {
    if (!embedding?.windows.length) throw new Error("Missing concept passage embedding");
    return Math.max(...embedding.windows.map((window) => cosineSimilarity(query, window.vector)));
  });
  let cacheBytes: number | undefined;
  try {
    cacheBytes = await enforceConceptCacheLimit(cacheRoot);
  } catch {
    warnings.push(
      "Concept embedding cache cleanup failed; the configured 512 MiB bound was not verified",
    );
  }
  process.stdout.write(
    JSON.stringify({
      scores,
      cacheHits: cached.filter(Boolean).length,
      cacheMisses: missing.length,
      cacheMaxBytes: CONCEPT_CACHE_MAX_BYTES,
      ...(cacheBytes === undefined ? {} : { cacheBytes }),
      windowsRanked: passageEmbeddings.reduce(
        (total, embedding) => total + (embedding?.windows.length ?? 0),
        0,
      ),
      warnings: [...new Set(warnings)],
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      modelBytes: CONCEPT_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0),
    }),
  );
}

if (process.argv.includes("--install-model")) await installConceptModel();
else if (process.argv.includes("--infer")) await search();
else throw new Error("Usage: baoer_signal_grep_model --install-model");
