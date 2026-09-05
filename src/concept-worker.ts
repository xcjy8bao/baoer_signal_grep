#!/usr/bin/env node
import { env, pipeline } from "@huggingface/transformers";
import {
  CONCEPT_ASSETS,
  MAX_CONCEPT_CHARS,
  MAX_CONCEPT_CHUNKS,
  conceptModelDirectory,
  verifyConceptModel,
} from "./concept-model.js";
import { installConceptModel } from "./concept-setup.js";
import { rpcRecord } from "./owned-json-rpc.js";

async function search(): Promise<void> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buffer);
    bytes += buffer.length;
    if (bytes > 2 * 1024 * 1024) throw new Error("Concept worker input exceeds 2 MiB");
  }
  const request: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    !rpcRecord(request) ||
    typeof request.query !== "string" ||
    request.query.length > 256 ||
    !Array.isArray(request.passages) ||
    request.passages.length > MAX_CONCEPT_CHUNKS ||
    request.passages.some(
      (item) => typeof item !== "string" || item.length > MAX_CONCEPT_CHARS + 256,
    )
  )
    throw new Error("Invalid concept worker input");
  const passages = request.passages.filter((item): item is string => typeof item === "string");
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
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
  });
  try {
    const texts = [`query: ${request.query}`, ...passages.map((text) => `passage: ${text}`)];
    const vectors: number[][] = [];
    const truncated: number[] = [];
    for (const [index, text] of texts.entries()) {
      if (extractor.tokenizer.encode(text).length > 512) truncated.push(index - 1);
      // oxlint-disable-next-line no-await-in-loop -- single inference at a time bounds native memory and CPU work.
      const tensor = await extractor(text, { pooling: "mean", normalize: true });
      vectors.push(Array.from(tensor.data, Number));
    }
    const query = vectors.shift();
    if (!query || query.length !== 384) throw new Error("Unexpected concept embedding dimensions");
    const scores = vectors.map((vector) => {
      if (vector.length !== query.length)
        throw new Error("Inconsistent concept embedding dimensions");
      const score = vector.reduce((sum, value, index) => sum + value * (query[index] ?? 0), 0);
      if (!Number.isFinite(score)) throw new Error("Non-finite concept similarity");
      return score;
    });
    process.stdout.write(
      JSON.stringify({
        scores,
        truncated,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        modelBytes: CONCEPT_ASSETS.reduce((sum, asset) => sum + asset.bytes, 0),
      }),
    );
  } finally {
    await extractor.dispose();
  }
}

if (process.argv.includes("--install-model")) await installConceptModel();
else if (process.argv.includes("--infer")) await search();
else throw new Error("Usage: baoer_signal_grep_model --install-model");
