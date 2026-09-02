import type { SignalGrepLocale } from "./config.js";
import type { SignalGrepInput, SignalGrepSearchOptions, SignalGrepService } from "./service.js";
import { type SessionSummarySnapshot, SessionSummary } from "./session-summary.js";
import type { ContextBudget, SignalGrepResult } from "./types.js";

export class SignalGrepRuntime {
  readonly #service: SignalGrepService;
  readonly #summary = new SessionSummary();

  constructor(service: SignalGrepService) {
    this.#service = service;
  }

  async search(
    input: SignalGrepInput,
    cwd: string,
    signal?: AbortSignal,
    contextBudget?: ContextBudget,
  ): Promise<SignalGrepResult> {
    const searchOptions: SignalGrepSearchOptions = {};
    if (contextBudget) searchOptions.contextBudget = contextBudget;
    const result = await this.#service.search(input, cwd, signal, searchOptions);
    this.#summary.record(input, result);
    return result;
  }

  get sessionSummary(): SessionSummarySnapshot {
    return this.#summary.snapshot;
  }

  formatSessionStatus(locale: SignalGrepLocale): string | undefined {
    return this.#summary.format(locale);
  }

  clear(): void {
    this.#service.clear();
  }

  async shutdown(): Promise<void> {
    await this.#service.shutdown();
  }

  get snapshotCount(): number {
    return this.#service.snapshotCount;
  }

  get storedMatches(): number {
    return this.#service.storedMatches;
  }
}
