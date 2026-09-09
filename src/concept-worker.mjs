#!/usr/bin/env node

// src/concept-worker.ts
import { env, pipeline } from "@huggingface/transformers";
import { isUtf8 } from "node:buffer";

// src/concept-embedding-cache.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/concept-model.ts
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// src/errors.ts
class SignalGrepError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SignalGrepError";
  }
}

// src/concept-model.ts
var CONCEPT_MODEL = "Xenova/multilingual-e5-small";
var CONCEPT_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
var MAX_CONCEPT_CHARS = 1000;
var CONCEPT_MODEL_TOKENS = 512;
var CONCEPT_WINDOW_OVERLAP_TOKENS = 64;
var CONCEPT_EMBEDDING_DIMENSIONS = 384;
var CONCEPT_CACHE_VERSION = 1;
var CONCEPT_CACHE_MAX_BYTES = 512 * 1024 * 1024;
var CONCEPT_TIMEOUT_MS = 10 * 60000;
var MAX_CONCEPT_TIMEOUT_MS = 60 * 60000;
var MAX_CONCEPT_WORKER_INPUT_BYTES = 64 * 1024 * 1024;
var MAX_CONCEPT_WORKER_OUTPUT_BYTES = 4 * 1024 * 1024;
var CONCEPT_ASSETS = [
  {
    path: "config.json",
    bytes: 658,
    sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1"
  },
  {
    path: "tokenizer_config.json",
    bytes: 443,
    sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b"
  },
  {
    path: "tokenizer.json",
    bytes: 17082730,
    sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"
  },
  {
    path: "onnx/model_quantized.onnx",
    bytes: 118308185,
    sha256: "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193"
  }
];
function conceptModelDirectory() {
  return resolve(process.env.SIGNAL_GREP_MODEL_DIR ?? join(homedir(), ".cache", "baoer_signal_grep", "models"), CONCEPT_REVISION);
}
function conceptCacheDirectory() {
  return resolve(process.env.SIGNAL_GREP_MODEL_DIR ?? join(homedir(), ".cache", "baoer_signal_grep", "models"), "concept-cache", `${CONCEPT_REVISION}-v${String(CONCEPT_CACHE_VERSION)}`);
}
async function verifyConceptModel(directory = conceptModelDirectory()) {
  for (const asset of CONCEPT_ASSETS) {
    const hash = createHash("sha256");
    let size = 0;
    try {
      for await (const chunk of createReadStream(join(directory, asset.path))) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > asset.bytes)
          throw new Error("Asset exceeds pinned size");
        hash.update(bytes);
      }
      if (size !== asset.bytes || hash.digest("hex") !== asset.sha256)
        throw new Error("Pinned hash mismatch");
    } catch (error) {
      throw new SignalGrepError(`Local concept model is missing or invalid (${asset.path}); run baoer_signal_grep_model --install-model explicitly`, { cause: error });
    }
  }
}

// src/owned-process.ts
var MAX_STDERR_BYTES = 16 * 1024;

// src/owned-json-rpc.ts
var MAX_RPC_FRAME_BYTES = 16 * 1024 * 1024;
var MAX_RPC_TOTAL_BYTES = 64 * 1024 * 1024;
function rpcRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// src/concept-embedding-cache.ts
function errorCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}
function conceptEmbeddingKey(role, text) {
  return createHash2("sha256").update(role).update("\x00").update(text).digest("hex");
}
function cachePath(root, key) {
  return join2(root, key.slice(0, 2), `${key}.json`);
}
function encodeVector(vector) {
  const buffer = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
  for (const [index, value] of vector.entries())
    buffer.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
  return buffer.toString("base64");
}
function decodeVector(encoded) {
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length !== CONCEPT_EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT)
    return;
  const vector = Array.from({ length: CONCEPT_EMBEDDING_DIMENSIONS }, (_, index) => buffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT));
  return vector.every(Number.isFinite) ? vector : undefined;
}
function storedEmbedding(value, key) {
  if (!rpcRecord(value) || value.version !== CONCEPT_CACHE_VERSION || value.key !== key || !Array.isArray(value.windows) || value.windows.length === 0)
    return;
  const windows = [];
  for (const item of value.windows) {
    if (!rpcRecord(item) || typeof item.start !== "number" || !Number.isSafeInteger(item.start) || item.start < 0 || typeof item.end !== "number" || !Number.isSafeInteger(item.end) || item.end <= item.start || typeof item.vector !== "string")
      return;
    const vector = decodeVector(item.vector);
    if (!vector)
      return;
    windows.push({ start: item.start, end: item.end, vector });
  }
  return { key, windows };
}
async function readConceptEmbedding(root, key) {
  try {
    return storedEmbedding(JSON.parse(await readFile(cachePath(root, key), "utf8")), key);
  } catch {
    return;
  }
}
async function writeConceptEmbedding(root, embedding) {
  const directory = join2(root, embedding.key.slice(0, 2));
  await mkdir(directory, { recursive: true });
  const destination = cachePath(root, embedding.key);
  const temporary = join2(directory, `.${embedding.key}.${randomUUID()}.tmp`);
  const stored = {
    version: CONCEPT_CACHE_VERSION,
    key: embedding.key,
    windows: embedding.windows.map((window) => ({
      start: window.start,
      end: window.end,
      vector: encodeVector(window.vector)
    }))
  };
  await writeFile(temporary, JSON.stringify(stored), { flag: "wx", mode: 384 });
  try {
    await rename(temporary, destination);
  } catch (error) {
    if (errorCode(error) !== "EEXIST") {
      await rm(temporary, { force: true });
      throw error;
    }
    if (await readConceptEmbedding(root, embedding.key)) {
      await rm(temporary, { force: true });
      return;
    }
    await rm(destination, { force: true });
    try {
      await rename(temporary, destination);
    } catch (replacementError) {
      await rm(temporary, { force: true });
      if (errorCode(replacementError) !== "EEXIST")
        throw replacementError;
    }
  }
}
async function enforceConceptCacheLimit(root, maximumBytes = CONCEPT_CACHE_MAX_BYTES) {
  const entries = [];
  let shards;
  try {
    shards = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT")
      return 0;
    throw error;
  }
  for (const shard of shards) {
    if (!shard.isDirectory() || !/^[0-9a-f]{2}$/u.test(shard.name))
      continue;
    const directory = join2(root, shard.name);
    const files = await readdir(directory, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json"))
        continue;
      const path = join2(directory, file.name);
      const metadata = await stat(path);
      entries.push({ path, bytes: metadata.size, modified: metadata.mtimeMs });
    }
  }
  let bytes = entries.reduce((total, item) => total + item.bytes, 0);
  if (bytes <= maximumBytes)
    return bytes;
  for (const item of entries.toSorted((a, b) => a.modified - b.modified || a.path.localeCompare(b.path))) {
    await rm(item.path, { force: true });
    bytes -= item.bytes;
    if (bytes <= maximumBytes)
      break;
  }
  return bytes;
}

// src/concept-inference.ts
var INFERENCE_BATCH_SIZE = 16;
function safeUtf16End(text, end) {
  if (end <= 0 || end >= text.length)
    return end;
  const previous = text.charCodeAt(end - 1);
  return previous >= 55296 && previous <= 56319 ? end - 1 : end;
}
function tokenCount(extractor, text) {
  return extractor.tokenizer.encode(text).length;
}
function advanceLow(low, middle) {
  return Math.max(low + 1, middle + 1);
}
function binarySearchBudget(span) {
  return 2 * Math.max(span, 1) + 32;
}
function maximumTokenSafeEnd(extractor, prefix, text, start) {
  let low = start + 1;
  let high = text.length;
  let accepted = start;
  let iterations = 0;
  const maxIterations = binarySearchBudget(high - low + 1);
  while (low <= high) {
    iterations += 1;
    if (iterations > maxIterations)
      throw new Error("Concept token window search failed to make progress");
    const middle = safeUtf16End(text, Math.floor((low + high) / 2));
    if (middle <= start) {
      low += 1;
      continue;
    }
    if (tokenCount(extractor, `${prefix}${text.slice(start, middle)}`) <= CONCEPT_MODEL_TOKENS) {
      accepted = middle;
      low = advanceLow(low, middle);
    } else {
      high = middle - 1;
    }
  }
  return accepted;
}
function overlapStart(extractor, prefix, text, start, end) {
  let low = start + 1;
  let high = end;
  let accepted = end;
  let iterations = 0;
  const maxIterations = binarySearchBudget(high - low + 1);
  while (low <= high) {
    iterations += 1;
    if (iterations > maxIterations)
      throw new Error("Concept overlap search failed to make progress");
    const middle = safeUtf16End(text, Math.floor((low + high) / 2));
    const tokens = tokenCount(extractor, `${prefix}${text.slice(middle, end)}`);
    if (tokens <= CONCEPT_WINDOW_OVERLAP_TOKENS) {
      accepted = middle;
      high = middle - 1;
    } else {
      low = advanceLow(low, middle);
    }
  }
  return Math.max(start + 1, accepted);
}
function tokenSafeWindows(extractor, pending) {
  const prefix = `${pending.role}: `;
  const windows = [];
  let start = 0;
  while (start < pending.text.length) {
    const end = maximumTokenSafeEnd(extractor, prefix, pending.text, start);
    if (end <= start)
      throw new Error("Concept tokenizer could not admit one complete source character");
    windows.push({ start, end, input: `${prefix}${pending.text.slice(start, end)}` });
    if (end >= pending.text.length)
      break;
    const next = overlapStart(extractor, prefix, pending.text, start, end);
    if (next <= start)
      throw new Error("Concept window overlap failed to advance past a complete window");
    start = next;
  }
  return windows;
}
async function embedConceptInputs(extractor, pending) {
  const layouts = pending.map((item) => tokenSafeWindows(extractor, item));
  const inputs = layouts.flatMap((windows) => windows.map((window) => window.input));
  const vectors = [];
  for (let offset = 0;offset < inputs.length; offset += INFERENCE_BATCH_SIZE) {
    const batch = inputs.slice(offset, offset + INFERENCE_BATCH_SIZE);
    const tensor = await extractor(batch, { pooling: "mean", normalize: true });
    if (tensor.data.length !== batch.length * CONCEPT_EMBEDDING_DIMENSIONS)
      throw new Error("Unexpected concept embedding dimensions");
    for (let index = 0;index < batch.length; index += 1) {
      const start = index * CONCEPT_EMBEDDING_DIMENSIONS;
      vectors.push(Array.from(tensor.data.slice(start, start + CONCEPT_EMBEDDING_DIMENSIONS), Number));
    }
  }
  let vectorIndex = 0;
  return pending.map((item, index) => ({
    key: item.key,
    windows: (layouts[index] ?? []).map((window) => ({
      start: window.start,
      end: window.end,
      vector: vectors[vectorIndex++] ?? []
    }))
  }));
}
function cosineSimilarity(left, right) {
  if (left.length !== CONCEPT_EMBEDDING_DIMENSIONS || right.length !== left.length)
    throw new Error("Inconsistent concept embedding dimensions");
  const score = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  if (!Number.isFinite(score))
    throw new Error("Non-finite concept similarity");
  return score;
}
function meanNormalized(vectors) {
  if (!vectors.length)
    throw new Error("Cannot pool an empty concept embedding");
  const pooled = Array.from({ length: CONCEPT_EMBEDDING_DIMENSIONS }, (_, index) => vectors.reduce((sum, vector) => sum + (vector[index] ?? 0), 0));
  const magnitude = Math.sqrt(pooled.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0)
    throw new Error("Invalid pooled concept query embedding");
  return pooled.map((value) => value / magnitude);
}

// src/concept-setup.ts
import { mkdir as mkdir2, mkdtemp, open, rename as rename2, rm as rm2, stat as stat2 } from "node:fs/promises";
import { dirname, join as join3 } from "node:path";
async function installConceptModel() {
  const destination = conceptModelDirectory();
  try {
    const existing = await stat2(destination);
    if (!existing.isDirectory())
      throw new Error("Concept model destination is not a directory");
    await verifyConceptModel(destination);
    process.stderr.write(`Concept model is already verified: ${destination}
`);
    return;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")
      throw error;
  }
  await mkdir2(dirname(destination), { recursive: true });
  const stage = await mkdtemp(join3(dirname(destination), ".install-"));
  const signal = AbortSignal.timeout(10 * 60000);
  try {
    for (const asset of CONCEPT_ASSETS) {
      process.stderr.write(`Downloading pinned concept asset: ${asset.path} (${String(asset.bytes)} bytes)
`);
      const response = await fetch(`https://huggingface.co/${CONCEPT_MODEL}/resolve/${CONCEPT_REVISION}/${asset.path}`, { signal });
      if (!response.ok || !response.body)
        throw new Error(`Model download failed: ${String(response.status)} ${asset.path}`);
      const path = join3(stage, asset.path);
      await mkdir2(dirname(path), { recursive: true });
      const file = await open(path, "wx");
      let size = 0;
      try {
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > asset.bytes)
            throw new Error(`Model asset exceeds pinned size: ${asset.path}`);
          await file.writeFile(chunk);
        }
        await file.sync();
      } finally {
        await file.close();
      }
    }
    await verifyConceptModel(stage);
    try {
      await rename2(stage, destination);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || !["EEXIST", "ENOTEMPTY"].includes(String(error.code)))
        throw error;
      await verifyConceptModel(destination);
    }
    process.stderr.write(`Concept model verified and installed: ${destination}
`);
  } finally {
    await rm2(stage, { recursive: true, force: true });
  }
}

// src/concept-worker.ts
var CACHE_IO_CONCURRENCY = 64;
async function readCachedEmbeddings(root, requested) {
  const cached = [];
  for (let offset = 0;offset < requested.length; offset += CACHE_IO_CONCURRENCY) {
    const batch = await Promise.all(requested.slice(offset, offset + CACHE_IO_CONCURRENCY).map((item) => readConceptEmbedding(root, item.key)));
    cached.push(...batch);
  }
  return cached;
}
async function writeCachedEmbeddings(root, created) {
  let failed = false;
  for (let offset = 0;offset < created.length; offset += CACHE_IO_CONCURRENCY) {
    const batch = await Promise.allSettled(created.slice(offset, offset + CACHE_IO_CONCURRENCY).map((item) => writeConceptEmbedding(root, item)));
    failed ||= batch.some((item) => item.status === "rejected");
  }
  return failed;
}
async function requestFromStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    bytes += buffer.length;
    if (bytes > MAX_CONCEPT_WORKER_INPUT_BYTES)
      throw new Error("Concept worker input exceeds its 64 MiB source protocol budget");
  }
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!rpcRecord(request) || typeof request.query !== "string" || request.query.length === 0 || request.query.length > 256 || !request.query.isWellFormed() || /[\r\n\0]/u.test(request.query) || !Array.isArray(request.encodedPassages) || request.encodedPassages.some((item) => typeof item !== "string" || item.length === 0 || item.length % 4 !== 0 || item.length > Math.ceil((MAX_CONCEPT_CHARS + 256) * 4 / 3 * 4) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(item)))
    throw new Error("Invalid concept worker input");
  const encodedPassages = request.encodedPassages.filter((item) => typeof item === "string");
  const buffers = encodedPassages.map((item) => Buffer.from(item, "base64"));
  if (buffers.some((item) => !isUtf8(item)))
    throw new Error("Invalid UTF-8 concept worker passage");
  const passages = buffers.map((item) => item.toString("utf8"));
  if (passages.some((item) => !item.length || item.length > MAX_CONCEPT_CHARS + 256 || !item.isWellFormed()))
    throw new Error("Invalid decoded concept worker passage");
  return { query: request.query, passages };
}
async function search() {
  const request = await requestFromStdin();
  const directory = conceptModelDirectory();
  const cacheRoot = conceptCacheDirectory();
  await verifyConceptModel(directory);
  const requested = [
    { key: conceptEmbeddingKey("query", request.query), role: "query", text: request.query },
    ...request.passages.map((text) => ({
      key: conceptEmbeddingKey("passage", text),
      role: "passage",
      text
    }))
  ];
  const cached = await readCachedEmbeddings(cacheRoot, requested);
  const missing = requested.filter((_item, index) => !cached[index]);
  const warnings = [];
  let created = [];
  if (missing.length) {
    env.allowRemoteModels = false;
    env.useFSCache = false;
    env.useBrowserCache = false;
    env.localModelPath = "/";
    const extractor = await pipeline("feature-extraction", directory, {
      local_files_only: true,
      dtype: "q8",
      device: "cpu",
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 }
    });
    try {
      created = await embedConceptInputs(extractor, missing);
    } finally {
      await extractor.dispose();
    }
    if (await writeCachedEmbeddings(cacheRoot, created))
      warnings.push("Concept embedding cache write failed; ranking completed but some work may repeat");
  }
  const createdByKey = new Map(created.map((item) => [item.key, item]));
  const embeddings = requested.map((item, index) => cached[index] ?? createdByKey.get(item.key));
  if (embeddings.some((item) => !item))
    throw new Error("Missing concept embedding result");
  const queryWindows = embeddings[0]?.windows;
  if (!queryWindows?.length)
    throw new Error("Missing concept query embedding");
  const query = meanNormalized(queryWindows.map((window) => window.vector));
  const passageEmbeddings = embeddings.slice(1);
  const scores = passageEmbeddings.map((embedding) => {
    if (!embedding?.windows.length)
      throw new Error("Missing concept passage embedding");
    return Math.max(...embedding.windows.map((window) => cosineSimilarity(query, window.vector)));
  });
  let cacheBytes;
  try {
    cacheBytes = await enforceConceptCacheLimit(cacheRoot);
  } catch {
    warnings.push("Concept embedding cache cleanup failed; the configured 512 MiB bound was not verified");
  }
  process.stdout.write(JSON.stringify({
    scores,
    cacheHits: cached.filter(Boolean).length,
    cacheMisses: missing.length,
    cacheMaxBytes: CONCEPT_CACHE_MAX_BYTES,
    ...cacheBytes === undefined ? {} : { cacheBytes },
    windowsRanked: passageEmbeddings.reduce((total, embedding) => total + (embedding?.windows.length ?? 0), 0),
    warnings: [...new Set(warnings)],
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
    modelBytes: CONCEPT_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0)
  }));
}
if (process.argv.includes("--install-model"))
  await installConceptModel();
else if (process.argv.includes("--infer"))
  await search();
else
  throw new Error("Usage: baoer_signal_grep_model --install-model");
