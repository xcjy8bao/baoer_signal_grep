import type { GrepToolInput } from "@earendil-works/pi-coding-agent";
import { normalizeRequest } from "./request.js";
import type { SignalGrepInput } from "./service.js";

export const METRICS_STATUS_KEY = "signal-grep-metrics";

export interface MetricsSnapshot {
  enabled: boolean;
  signalTokens: number;
  normalTokens: number;
  signalBytes: number;
  normalBytes: number;
  searches: number;
  cursorPages: number;
  skippedSearches: number;
}

export type NormalGrepInputResult =
  | { supported: true; input: GrepToolInput }
  | { supported: false; reason: string };

function smartCaseIsInsensitive(pattern: string): boolean {
  return pattern === pattern.toLocaleLowerCase();
}

export function createNormalGrepInput(input: SignalGrepInput): NormalGrepInputResult {
  if (!input.pattern?.trim()) return { supported: false, reason: "pattern is unavailable" };
  const request = normalizeRequest(input);
  if (!request.hidden) {
    return { supported: false, reason: "normal grep always includes hidden files" };
  }
  if (request.exclude.length > 0) {
    return { supported: false, reason: "normal grep does not support exclude globs" };
  }
  if (request.glob.length > 1) {
    return { supported: false, reason: "normal grep accepts only one include glob" };
  }

  return {
    supported: true,
    input: {
      pattern: request.pattern,
      ...(request.path ? { path: request.path } : {}),
      ...(request.glob[0] ? { glob: request.glob[0] } : {}),
      literal: request.literal,
      ignoreCase: request.ignoreCase ?? smartCaseIsInsensitive(request.pattern),
      context: request.context,
    },
  };
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatTokens(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

function formatBytes(count: number): string {
  if (count < 1_024) return `${count} B`;
  if (count < 1_024 * 1_024) return `${(count / 1_024).toFixed(1)} KiB`;
  return `${(count / (1_024 * 1_024)).toFixed(1)} MiB`;
}

function comparison(snapshot: MetricsSnapshot): {
  difference: number;
  percentage: number;
  improved: boolean;
} {
  const difference = snapshot.normalTokens - snapshot.signalTokens;
  return {
    difference,
    percentage:
      snapshot.normalTokens === 0 ? 0 : (Math.abs(difference) / snapshot.normalTokens) * 100,
    improved: difference >= 0,
  };
}

export class SearchMetrics {
  #snapshot: MetricsSnapshot = this.#empty(false);

  enable(): MetricsSnapshot {
    this.#snapshot = this.#empty(true);
    return this.snapshot;
  }

  disable(): MetricsSnapshot {
    this.#snapshot.enabled = false;
    return this.snapshot;
  }

  recordComparison(signalText: string, normalText: string): void {
    if (!this.#snapshot.enabled) return;
    this.#snapshot.signalTokens += estimateTextTokens(signalText);
    this.#snapshot.normalTokens += estimateTextTokens(normalText);
    this.#snapshot.signalBytes += Buffer.byteLength(signalText);
    this.#snapshot.normalBytes += Buffer.byteLength(normalText);
    this.#snapshot.searches += 1;
  }

  recordCursorPage(signalText: string): void {
    if (!this.#snapshot.enabled) return;
    this.#snapshot.signalTokens += estimateTextTokens(signalText);
    this.#snapshot.signalBytes += Buffer.byteLength(signalText);
    this.#snapshot.cursorPages += 1;
  }

  recordSkippedSearch(): void {
    if (!this.#snapshot.enabled) return;
    this.#snapshot.skippedSearches += 1;
  }

  get enabled(): boolean {
    return this.#snapshot.enabled;
  }

  get snapshot(): MetricsSnapshot {
    return { ...this.#snapshot };
  }

  formatStatus(): string {
    const snapshot = this.snapshot;
    const result = comparison(snapshot);
    const warning = snapshot.skippedSearches > 0 ? ` · ⚠${snapshot.skippedSearches}` : "";
    return `SG ${formatTokens(snapshot.signalTokens)} / normal ${formatTokens(snapshot.normalTokens)} · ${result.improved ? "↓" : "↑"}${formatTokens(Math.abs(result.difference))} (${result.percentage.toFixed(1)}%)${warning}`;
  }

  formatReport(): string {
    const snapshot = this.snapshot;
    const result = comparison(snapshot);
    const outcome = result.improved ? "saved" : "used an additional";
    const skipped =
      snapshot.skippedSearches > 0
        ? ` ${snapshot.skippedSearches} unsupported search${snapshot.skippedSearches === 1 ? " was" : "es were"} excluded from the comparison.`
        : "";
    return `Signal Grep metrics: SG ${formatTokens(snapshot.signalTokens)} estimated tokens (${formatBytes(snapshot.signalBytes)}) / normal ${formatTokens(snapshot.normalTokens)} (${formatBytes(snapshot.normalBytes)}) · ${outcome} ${formatTokens(Math.abs(result.difference))} (${result.percentage.toFixed(1)}%) across ${snapshot.searches} searches and ${snapshot.cursorPages} cursor pages.${skipped}`;
  }

  #empty(enabled: boolean): MetricsSnapshot {
    return {
      enabled,
      signalTokens: 0,
      normalTokens: 0,
      signalBytes: 0,
      normalBytes: 0,
      searches: 0,
      cursorPages: 0,
      skippedSearches: 0,
    };
  }
}
