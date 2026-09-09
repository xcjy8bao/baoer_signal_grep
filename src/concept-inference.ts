import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { CachedConceptEmbedding } from "./concept-embedding-cache.js";
import {
  CONCEPT_EMBEDDING_DIMENSIONS,
  CONCEPT_MODEL_TOKENS,
  CONCEPT_WINDOW_OVERLAP_TOKENS,
} from "./concept-model.js";

export interface PendingConceptEmbedding {
  key: string;
  role: "query" | "passage";
  text: string;
}

const INFERENCE_BATCH_SIZE = 16;

function safeUtf16End(text: string, end: number): number {
  if (end <= 0 || end >= text.length) return end;
  const previous = text.charCodeAt(end - 1);
  return previous >= 0xd800 && previous <= 0xdbff ? end - 1 : end;
}

function tokenCount(extractor: FeatureExtractionPipeline, text: string): number {
  return extractor.tokenizer.encode(text).length;
}

function maximumTokenSafeEnd(
  extractor: FeatureExtractionPipeline,
  prefix: string,
  text: string,
  start: number,
): number {
  let low = start + 1;
  let high = text.length;
  let accepted = start;
  while (low <= high) {
    const middle = safeUtf16End(text, Math.floor((low + high) / 2));
    if (middle <= start) {
      low += 1;
      continue;
    }
    if (tokenCount(extractor, `${prefix}${text.slice(start, middle)}`) <= CONCEPT_MODEL_TOKENS) {
      accepted = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return accepted;
}

function overlapStart(
  extractor: FeatureExtractionPipeline,
  prefix: string,
  text: string,
  start: number,
  end: number,
): number {
  let low = start + 1;
  let high = end;
  let accepted = end;
  while (low <= high) {
    const middle = safeUtf16End(text, Math.floor((low + high) / 2));
    const tokens = tokenCount(extractor, `${prefix}${text.slice(middle, end)}`);
    if (tokens <= CONCEPT_WINDOW_OVERLAP_TOKENS) {
      accepted = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return Math.max(start + 1, accepted);
}

function tokenSafeWindows(
  extractor: FeatureExtractionPipeline,
  pending: PendingConceptEmbedding,
): { start: number; end: number; input: string }[] {
  const prefix = `${pending.role}: `;
  const windows: { start: number; end: number; input: string }[] = [];
  let start = 0;
  while (start < pending.text.length) {
    const end = maximumTokenSafeEnd(extractor, prefix, pending.text, start);
    if (end <= start)
      throw new Error("Concept tokenizer could not admit one complete source character");
    windows.push({ start, end, input: `${prefix}${pending.text.slice(start, end)}` });
    if (end >= pending.text.length) break;
    start = overlapStart(extractor, prefix, pending.text, start, end);
  }
  return windows;
}

export async function embedConceptInputs(
  extractor: FeatureExtractionPipeline,
  pending: readonly PendingConceptEmbedding[],
): Promise<CachedConceptEmbedding[]> {
  const layouts = pending.map((item) => tokenSafeWindows(extractor, item));
  const inputs = layouts.flatMap((windows) => windows.map((window) => window.input));
  const vectors: number[][] = [];
  for (let offset = 0; offset < inputs.length; offset += INFERENCE_BATCH_SIZE) {
    const batch = inputs.slice(offset, offset + INFERENCE_BATCH_SIZE);
    // oxlint-disable-next-line no-await-in-loop -- bounded batches cap native tensor memory.
    const tensor = await extractor(batch, { pooling: "mean", normalize: true });
    if (tensor.data.length !== batch.length * CONCEPT_EMBEDDING_DIMENSIONS)
      throw new Error("Unexpected concept embedding dimensions");
    for (let index = 0; index < batch.length; index += 1) {
      const start = index * CONCEPT_EMBEDDING_DIMENSIONS;
      vectors.push(
        Array.from(tensor.data.slice(start, start + CONCEPT_EMBEDDING_DIMENSIONS), Number),
      );
    }
  }
  let vectorIndex = 0;
  return pending.map((item, index) => ({
    key: item.key,
    windows: (layouts[index] ?? []).map((window) => ({
      start: window.start,
      end: window.end,
      vector: vectors[vectorIndex++] ?? [],
    })),
  }));
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== CONCEPT_EMBEDDING_DIMENSIONS || right.length !== left.length)
    throw new Error("Inconsistent concept embedding dimensions");
  const score = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  if (!Number.isFinite(score)) throw new Error("Non-finite concept similarity");
  return score;
}

export function meanNormalized(vectors: readonly (readonly number[])[]): number[] {
  if (!vectors.length) throw new Error("Cannot pool an empty concept embedding");
  const pooled = Array.from({ length: CONCEPT_EMBEDDING_DIMENSIONS }, (_, index) =>
    vectors.reduce((sum, vector) => sum + (vector[index] ?? 0), 0),
  );
  const magnitude = Math.sqrt(pooled.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0)
    throw new Error("Invalid pooled concept query embedding");
  return pooled.map((value) => value / magnitude);
}
