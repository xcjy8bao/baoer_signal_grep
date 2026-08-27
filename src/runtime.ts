import { METRICS_STATUS_KEY, type MetricsSnapshot, SearchMetrics } from "./metrics.js";
import type { SignalGrepInput, SignalGrepService } from "./service.js";
import type { SignalGrepResult } from "./types.js";

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
  ): Promise<SignalGrepResult> {
    const inputCursor = input.cursor;
    const result = await this.#service.search(input, cwd, signal, {
      includeNormalBaseline: this.#metrics.enabled && !inputCursor,
    });

    if (!this.#metrics.enabled) return result;
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

  formatMetricsStatus(): string {
    return this.#metrics.formatStatus();
  }

  formatMetricsReport(): string {
    return this.#metrics.formatReport();
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
