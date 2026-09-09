import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { SignalGrepError } from "./errors.js";

export const CONCEPT_MODEL = "Xenova/multilingual-e5-small";
export const CONCEPT_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
export const MAX_CONCEPT_CHARS = 1_000;
export const CONCEPT_PASSAGE_OVERLAP_CHARS = 160;
export const CONCEPT_MODEL_TOKENS = 512;
export const CONCEPT_WINDOW_OVERLAP_TOKENS = 64;
export const CONCEPT_EMBEDDING_DIMENSIONS = 384;
export const CONCEPT_CACHE_VERSION = 1;
export const CONCEPT_CACHE_MAX_BYTES = 512 * 1024 * 1024;
export const CONCEPT_TIMEOUT_MS = 10 * 60_000;
export const MIN_CONCEPT_TIMEOUT_MS = 1_000;
export const MAX_CONCEPT_TIMEOUT_MS = 60 * 60_000;
export const CONCEPT_TIMEOUT_ENV = "BAOER_SIGNAL_GREP_CONCEPT_TIMEOUT_MS";
export const MAX_CONCEPT_WORKER_INPUT_BYTES = 64 * 1024 * 1024;
export const MAX_CONCEPT_WORKER_OUTPUT_BYTES = 4 * 1024 * 1024;
export const CONCEPT_ASSETS = [
  {
    path: "config.json",
    bytes: 658,
    sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1",
  },
  {
    path: "tokenizer_config.json",
    bytes: 443,
    sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
  },
  {
    path: "tokenizer.json",
    bytes: 17_082_730,
    sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
  },
  {
    path: "onnx/model_quantized.onnx",
    bytes: 118_308_185,
    sha256: "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193",
  },
] as const;
export function conceptModelDirectory(): string {
  return resolve(
    process.env.SIGNAL_GREP_MODEL_DIR ?? join(homedir(), ".cache", "baoer_signal_grep", "models"),
    CONCEPT_REVISION,
  );
}

export function conceptCacheDirectory(): string {
  return resolve(
    process.env.SIGNAL_GREP_MODEL_DIR ?? join(homedir(), ".cache", "baoer_signal_grep", "models"),
    "concept-cache",
    `${CONCEPT_REVISION}-v${String(CONCEPT_CACHE_VERSION)}`,
  );
}

/** Interactive hosts may lower the deadline; invalid values fail closed with an explicit error. */
export function resolveConceptTimeoutMs(environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment[CONCEPT_TIMEOUT_ENV];
  if (raw === undefined || raw === "") return CONCEPT_TIMEOUT_MS;
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_CONCEPT_TIMEOUT_MS ||
    value > MAX_CONCEPT_TIMEOUT_MS
  ) {
    throw new SignalGrepError(
      `${CONCEPT_TIMEOUT_ENV} must be an integer from ${String(MIN_CONCEPT_TIMEOUT_MS)} through ${String(MAX_CONCEPT_TIMEOUT_MS)}`,
    );
  }
  return value;
}
export async function verifyConceptModel(directory = conceptModelDirectory()): Promise<void> {
  for (const asset of CONCEPT_ASSETS) {
    const hash = createHash("sha256");
    let size = 0;
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded streaming integrity checks, one model asset at a time.
      for await (const chunk of createReadStream(join(directory, asset.path))) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > asset.bytes) throw new Error("Asset exceeds pinned size");
        hash.update(bytes);
      }
      if (size !== asset.bytes || hash.digest("hex") !== asset.sha256)
        throw new Error("Pinned hash mismatch");
    } catch (error) {
      throw new SignalGrepError(
        `Local concept model is missing or invalid (${asset.path}); run baoer_signal_grep_model --install-model explicitly`,
        { cause: error },
      );
    }
  }
}
