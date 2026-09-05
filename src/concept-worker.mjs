#!/usr/bin/env node

// src/concept-worker.ts
import { env, pipeline } from "@huggingface/transformers";

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
var MAX_CONCEPT_CHUNKS = 128;
var MAX_CONCEPT_CHARS = 1000;
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

// src/concept-setup.ts
import { mkdir, mkdtemp, open, rename, rm, stat } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";
async function installConceptModel() {
  const destination = conceptModelDirectory();
  try {
    const existing = await stat(destination);
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
  await mkdir(dirname(destination), { recursive: true });
  const stage = await mkdtemp(join2(dirname(destination), ".install-"));
  const signal = AbortSignal.timeout(10 * 60000);
  try {
    for (const asset of CONCEPT_ASSETS) {
      process.stderr.write(`Downloading pinned concept asset: ${asset.path} (${String(asset.bytes)} bytes)
`);
      const response = await fetch(`https://huggingface.co/${CONCEPT_MODEL}/resolve/${CONCEPT_REVISION}/${asset.path}`, { signal });
      if (!response.ok || !response.body)
        throw new Error(`Model download failed: ${String(response.status)} ${asset.path}`);
      const path = join2(stage, asset.path);
      await mkdir(dirname(path), { recursive: true });
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
      await rename(stage, destination);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || !["EEXIST", "ENOTEMPTY"].includes(String(error.code)))
        throw error;
      await verifyConceptModel(destination);
    }
    process.stderr.write(`Concept model verified and installed: ${destination}
`);
  } finally {
    await rm(stage, { recursive: true, force: true });
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

// src/concept-worker.ts
async function search() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    bytes += buffer.length;
    if (bytes > 2 * 1024 * 1024)
      throw new Error("Concept worker input exceeds 2 MiB");
  }
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!rpcRecord(request) || typeof request.query !== "string" || request.query.length > 256 || !Array.isArray(request.passages) || request.passages.length > MAX_CONCEPT_CHUNKS || request.passages.some((item) => typeof item !== "string" || item.length > MAX_CONCEPT_CHARS + 256))
    throw new Error("Invalid concept worker input");
  const passages = request.passages.filter((item) => typeof item === "string");
  const directory = conceptModelDirectory();
  await verifyConceptModel(directory);
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
    const texts = [`query: ${request.query}`, ...passages.map((text) => `passage: ${text}`)];
    const vectors = [];
    const truncated = [];
    for (const [index, text] of texts.entries()) {
      if (extractor.tokenizer.encode(text).length > 512)
        truncated.push(index - 1);
      const tensor = await extractor(text, { pooling: "mean", normalize: true });
      vectors.push(Array.from(tensor.data, Number));
    }
    const query = vectors.shift();
    if (!query || query.length !== 384)
      throw new Error("Unexpected concept embedding dimensions");
    const scores = vectors.map((vector) => {
      if (vector.length !== query.length)
        throw new Error("Inconsistent concept embedding dimensions");
      const score = vector.reduce((sum, value, index) => sum + value * (query[index] ?? 0), 0);
      if (!Number.isFinite(score))
        throw new Error("Non-finite concept similarity");
      return score;
    });
    process.stdout.write(JSON.stringify({
      scores,
      truncated,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
      modelBytes: CONCEPT_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0)
    }));
  } finally {
    await extractor.dispose();
  }
}
if (process.argv.includes("--install-model"))
  await installConceptModel();
else if (process.argv.includes("--infer"))
  await search();
else
  throw new Error("Usage: baoer_signal_grep_model --install-model");
