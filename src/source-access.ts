import { extname, resolve } from "node:path";
import {
  MAX_STRUCTURE_BYTES,
  MAX_STRUCTURE_FILES,
  MAX_SYNTAX_CACHE_ENTRIES,
  MAX_SYNTAX_CACHE_NODES,
} from "./analysis-limits.js";
import { abortError, SignalGrepError } from "./errors.js";
import { readGitSource } from "./git-source.js";
import {
  readWorkspaceDocument,
  SourceDocument,
  SourceDocumentError,
  type SourceReference,
} from "./source-document.js";
import { parseSyntax, type SyntaxAnalysis } from "./syntax.js";
import { getSourceRevision } from "./source.js";

function noop(): void {}

interface CachedSyntax {
  analysis: SyntaxAnalysis;
  nodes: number;
}

interface SyntaxParseResult {
  analysis: SyntaxAnalysis;
  cacheHit: boolean;
}

/** One parser owner across calls, with a bounded content-addressed syntax cache. */
export class SyntaxQueue {
  #tail: Promise<void> = Promise.resolve();
  #generation = new AbortController();
  readonly #cache = new Map<string, CachedSyntax>();
  #cachedNodes = 0;

  async parse(document: SourceDocument, signal?: AbortSignal): Promise<SyntaxAnalysis> {
    return (await this.parseWithMetrics(document, signal)).analysis;
  }

  async parseWithMetrics(
    document: SourceDocument,
    signal?: AbortSignal,
  ): Promise<SyntaxParseResult> {
    const combined = signal
      ? AbortSignal.any([signal, this.#generation.signal])
      : this.#generation.signal;
    if (combined.aborted) throw abortError();
    const predecessor = this.#tail;
    let release: () => void = noop;
    this.#tail = new Promise<void>((done) => {
      release = done;
    });
    try {
      await predecessor;
      if (combined.aborted) throw abortError();
      if (!document.utf8)
        throw new SourceDocumentError("encoding", "Syntax requires lossless UTF-8 source");
      const origin = document.reference.origin;
      const revision = origin.kind === "worktree" ? origin.contentHash : origin.blob;
      const key = `${extname(document.path).toLowerCase()}\0${revision}`;
      const cached = this.#cache.get(key);
      if (cached) {
        this.#cache.delete(key);
        this.#cache.set(key, cached);
        return { analysis: cached.analysis, cacheHit: true };
      }
      const analysis = await parseSyntax(document.path, document.text, combined);
      const entry = { analysis, nodes: analysis.nodes.length };
      this.#cache.set(key, entry);
      this.#cachedNodes += entry.nodes;
      while (
        this.#cache.size > MAX_SYNTAX_CACHE_ENTRIES ||
        this.#cachedNodes > MAX_SYNTAX_CACHE_NODES
      ) {
        const oldest = this.#cache.entries().next().value;
        if (!oldest) break;
        this.#cache.delete(oldest[0]);
        this.#cachedNodes -= oldest[1].nodes;
      }
      return { analysis, cacheHit: false };
    } finally {
      release();
    }
  }

  clear(): void {
    this.#generation.abort();
    this.#generation = new AbortController();
    this.#cache.clear();
    this.#cachedNodes = 0;
  }

  async shutdown(): Promise<void> {
    this.clear();
    await this.#tail;
  }
}

export class SourceBudgetError extends SignalGrepError {
  readonly reason = "structural-read-budget-exhausted";
}

/** Created for a single tool request, then discarded, including its parse results. */
export class SourceAccess {
  readonly cwd: string;
  readonly signal: AbortSignal | undefined;
  readonly #queue: SyntaxQueue;
  readonly #maxFiles: number;
  readonly #documents = new Map<string, Promise<SourceDocument>>();
  readonly #syntax = new Map<SourceDocument, Promise<SyntaxAnalysis>>();
  #bytes = 0;
  #syntaxParses = 0;
  #syntaxCacheHits = 0;
  #readTail: Promise<void> = Promise.resolve();

  constructor(
    cwd: string,
    queue: SyntaxQueue,
    signal?: AbortSignal,
    options: { maxFiles?: number } = {},
  ) {
    this.cwd = cwd;
    this.#queue = queue;
    this.signal = signal;
    this.#maxFiles = options.maxFiles ?? MAX_STRUCTURE_FILES;
  }

  get filesRead(): number {
    return this.#documents.size;
  }
  get bytesRead(): number {
    return this.#bytes;
  }
  get maxFiles(): number {
    return this.#maxFiles;
  }
  get syntaxParses(): number {
    return this.#syntaxParses;
  }
  get syntaxCacheHits(): number {
    return this.#syntaxCacheHits;
  }

  async load(path: string, expected?: SourceReference): Promise<SourceDocument> {
    if (this.signal?.aborted) throw abortError();
    if (expected && resolve(this.cwd, expected.path) !== resolve(this.cwd, path)) {
      throw new SignalGrepError("Source reference path does not match the requested file");
    }
    const key = JSON.stringify([resolve(this.cwd, path), expected?.origin]);
    const existing = this.#documents.get(key);
    if (existing) return existing;
    if (this.#documents.size >= this.#maxFiles) {
      throw new SourceBudgetError(
        `Structural scan reached the ${String(this.#maxFiles)}-file limit`,
      );
    }
    const pending = this.#read(path, expected);
    this.#documents.set(key, pending);
    return pending;
  }

  async #read(path: string, expected?: SourceReference): Promise<SourceDocument> {
    const predecessor = this.#readTail;
    let release: () => void = noop;
    this.#readTail = new Promise<void>((done) => {
      release = done;
    });
    try {
      await predecessor;
      return await this.#readOnce(path, expected);
    } finally {
      release();
    }
  }

  async #readOnce(path: string, expected?: SourceReference): Promise<SourceDocument> {
    let document: SourceDocument;
    const remaining = MAX_STRUCTURE_BYTES - this.#bytes;
    if (remaining <= 0)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    if (expected?.origin.kind !== "git") {
      const metadata = await getSourceRevision(resolve(this.cwd, path));
      if (metadata && metadata.size > remaining)
        throw new SourceBudgetError(
          "Next source exceeds the remaining 32 MiB structural read budget",
        );
    }
    if (expected?.origin.kind === "git") {
      const origin = expected.origin;
      const raw = await readGitSource(
        this.cwd,
        { path, commit: origin.commit, blob: origin.blob },
        this.signal,
        { maxBytes: remaining },
      );
      if (!raw.content || !raw.origin) {
        throw new SourceDocumentError(
          "source-unavailable",
          raw.reason ?? `Git source is ${raw.sourceStatus}`,
        );
      }
      document = new SourceDocument({ path, origin: raw.origin }, raw.content);
    } else {
      document = await readWorkspaceDocument(
        path,
        this.cwd,
        this.signal,
        expected?.origin,
        remaining,
      );
    }
    this.#bytes += document.bytes.length;
    if (this.#bytes > MAX_STRUCTURE_BYTES)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    return document;
  }

  syntax(document: SourceDocument): Promise<SyntaxAnalysis> {
    let pending = this.#syntax.get(document);
    if (!pending) {
      pending = this.#queue.parseWithMetrics(document, this.signal).then((parsed) => {
        if (parsed.cacheHit) this.#syntaxCacheHits += 1;
        else this.#syntaxParses += 1;
        return parsed.analysis;
      });
      this.#syntax.set(document, pending);
    }
    return pending;
  }

  releaseSyntax(document: SourceDocument): void {
    this.#syntax.delete(document);
  }

  /** Relationship validation must reread the expected version, not consult the request cache. */
  refresh(path: string, expected: SourceReference): Promise<SourceDocument> {
    return this.#read(path, expected);
  }
}
