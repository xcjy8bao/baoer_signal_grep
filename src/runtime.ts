import type { SignalGrepLocale } from "./config.js";
import {
  METRICS_STATUS_KEY,
  type MetricsSnapshot,
  type MetricsStatusStyles,
  SearchMetrics,
} from "./metrics.js";
import type { SignalGrepInput, SignalGrepSearchOptions, SignalGrepService } from "./service.js";
import type { ContextBudget, SignalGrepResult } from "./types.js";

export { METRICS_STATUS_KEY };

export class SignalGrepRuntime {
  readonly #service: SignalGrepService;
  readonly #metrics = new SearchMetrics();

  constructor(service: SignalGrepService) {
    this.#service = service;
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
    contextBudget?: ContextBudget,
  ): Promise<SignalGrepResult> {
    const inputCursor = input.cursor;
    const isInspection = input.mode === "inspect";
    const searchOptions: SignalGrepSearchOptions = {
      includeNormalBaseline: this.#metrics.enabled && !inputCursor && !isInspection,
    };
    if (contextBudget) searchOptions.contextBudget = contextBudget;
    const result = await this.#service.search(input, cwd, signal, searchOptions);

    if (!this.#metrics.enabled || isInspection) return result;
    if (inputCursor) {
      this.#metrics.recordCursorPage(result.text);
      return result;
    }
    if (result.normalText === undefined) {
      throw new Error("Signal Grep metrics baseline was not generated");
    }
    this.#metrics.recordComparison(result.text, result.normalText);
    return result;
  }

  enableMetrics(): MetricsSnapshot {
    this.#service.clear();
    return this.#metrics.enable();
  }

  disableMetrics(): MetricsSnapshot {
    return this.#metrics.disable();
  }

  get metricsEnabled(): boolean {
    return this.#metrics.enabled;
  }

  get metricsSnapshot(): MetricsSnapshot {
    return this.#metrics.snapshot;
  }

  formatMetricsStatus(styles?: MetricsStatusStyles, locale: SignalGrepLocale = "en"): string {
    return this.#metrics.formatStatus(styles, locale);
  }

  formatMetricsReport(locale: SignalGrepLocale = "en"): string {
    return this.#metrics.formatReport(locale);
  }

  clear(): void {
    this.#service.clear();
  }

  get snapshotCount(): number {
    return this.#service.snapshotCount;
  }

  get storedMatches(): number {
    return this.#service.storedMatches;
  }
}
