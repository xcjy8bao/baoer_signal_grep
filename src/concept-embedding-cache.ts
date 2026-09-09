import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONCEPT_CACHE_MAX_BYTES,
  CONCEPT_CACHE_VERSION,
  CONCEPT_EMBEDDING_DIMENSIONS,
} from "./concept-model.js";
import { rpcRecord } from "./owned-json-rpc.js";

export interface CachedConceptWindow {
  start: number;
  end: number;
  vector: number[];
}

export interface CachedConceptEmbedding {
  key: string;
  windows: CachedConceptWindow[];
}

interface StoredEmbedding {
  version: number;
  key: string;
  windows: { start: number; end: number; vector: string }[];
}

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
}

export function conceptEmbeddingKey(role: "query" | "passage", text: string): string {
  return createHash("sha256").update(role).update("\0").update(text).digest("hex");
}

function cachePath(root: string, key: string): string {
  return join(root, key.slice(0, 2), `${key}.json`);
}

function encodeVector(vector: readonly number[]): string {
  const buffer = Buffer.allocUnsafe(vector.length * Float32Array.BYTES_PER_ELEMENT);
  for (const [index, value] of vector.entries())
    buffer.writeFloatLE(value, index * Float32Array.BYTES_PER_ELEMENT);
  return buffer.toString("base64");
}

function decodeVector(encoded: string): number[] | undefined {
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.length !== CONCEPT_EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT)
    return undefined;
  const vector = Array.from({ length: CONCEPT_EMBEDDING_DIMENSIONS }, (_, index) =>
    buffer.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT),
  );
  return vector.every(Number.isFinite) ? vector : undefined;
}

function storedEmbedding(value: unknown, key: string): CachedConceptEmbedding | undefined {
  if (
    !rpcRecord(value) ||
    value.version !== CONCEPT_CACHE_VERSION ||
    value.key !== key ||
    !Array.isArray(value.windows) ||
    value.windows.length === 0
  )
    return undefined;
  const windows: CachedConceptWindow[] = [];
  for (const item of value.windows) {
    if (
      !rpcRecord(item) ||
      typeof item.start !== "number" ||
      !Number.isSafeInteger(item.start) ||
      item.start < 0 ||
      typeof item.end !== "number" ||
      !Number.isSafeInteger(item.end) ||
      item.end <= item.start ||
      typeof item.vector !== "string"
    )
      return undefined;
    const vector = decodeVector(item.vector);
    if (!vector) return undefined;
    windows.push({ start: item.start, end: item.end, vector });
  }
  return { key, windows };
}

export async function readConceptEmbedding(
  root: string,
  key: string,
): Promise<CachedConceptEmbedding | undefined> {
  try {
    return storedEmbedding(JSON.parse(await readFile(cachePath(root, key), "utf8")), key);
  } catch {
    return undefined;
  }
}

export async function writeConceptEmbedding(
  root: string,
  embedding: CachedConceptEmbedding,
): Promise<void> {
  const directory = join(root, embedding.key.slice(0, 2));
  await mkdir(directory, { recursive: true });
  const destination = cachePath(root, embedding.key);
  const temporary = join(directory, `.${embedding.key}.${randomUUID()}.tmp`);
  const stored: StoredEmbedding = {
    version: CONCEPT_CACHE_VERSION,
    key: embedding.key,
    windows: embedding.windows.map((window) => ({
      start: window.start,
      end: window.end,
      vector: encodeVector(window.vector),
    })),
  };
  await writeFile(temporary, JSON.stringify(stored), { flag: "wx", mode: 0o600 });
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
      if (errorCode(replacementError) !== "EEXIST") throw replacementError;
    }
  }
}

export async function enforceConceptCacheLimit(
  root: string,
  maximumBytes = CONCEPT_CACHE_MAX_BYTES,
): Promise<number> {
  const entries: { path: string; bytes: number; modified: number }[] = [];
  let shards: Dirent[];
  try {
    shards = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return 0;
    throw error;
  }
  for (const shard of shards) {
    if (!shard.isDirectory() || !/^[0-9a-f]{2}$/u.test(shard.name)) continue;
    const directory = join(root, shard.name);
    // oxlint-disable-next-line no-await-in-loop -- bounded 256-shard cache inventory.
    const files = await readdir(directory, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) continue;
      const path = join(directory, file.name);
      // oxlint-disable-next-line no-await-in-loop -- eviction needs authoritative file sizes and mtimes.
      const metadata = await stat(path);
      entries.push({ path, bytes: metadata.size, modified: metadata.mtimeMs });
    }
  }
  let bytes = entries.reduce((total, item) => total + item.bytes, 0);
  if (bytes <= maximumBytes) return bytes;
  for (const item of entries.toSorted(
    (a, b) => a.modified - b.modified || a.path.localeCompare(b.path),
  )) {
    // oxlint-disable-next-line no-await-in-loop -- deterministic oldest-first eviction owns its files.
    await rm(item.path, { force: true });
    bytes -= item.bytes;
    if (bytes <= maximumBytes) break;
  }
  return bytes;
}
