import type { SignalGrepLocale } from "./config.js";
import type { SignalGrepInput } from "./service.js";
import type { SignalGrepResult } from "./types.js";

export const SESSION_STATUS_KEY = "signal-grep-session";

export interface SessionSummarySnapshot {
  queries: number;
  completeQueries: number;
  organizedQueries: number;
}

function isNewQuery(input: SignalGrepInput): boolean {
  return input.cursor === undefined && input.sourceCursor === undefined;
}

function wasAutomaticallyOrganized(input: SignalGrepInput, result: SignalGrepResult): boolean {
  const autoMode = input.mode === undefined || input.mode === "auto";
  return autoMode && input.limit === undefined && result.details.summaryFilesShown !== undefined;
}

export class SessionSummary {
  #snapshot: SessionSummarySnapshot = {
    queries: 0,
    completeQueries: 0,
    organizedQueries: 0,
  };

  record(input: SignalGrepInput, result: SignalGrepResult): void {
    if (!isNewQuery(input)) return;
    this.#snapshot.queries += 1;
    if (result.details.status === "complete") this.#snapshot.completeQueries += 1;
    if (wasAutomaticallyOrganized(input, result)) this.#snapshot.organizedQueries += 1;
  }

  get snapshot(): SessionSummarySnapshot {
    return { ...this.#snapshot };
  }

  format(locale: SignalGrepLocale): string | undefined {
    const { completeQueries, organizedQueries, queries } = this.#snapshot;
    if (queries === 0) return undefined;
    const partialQueries = queries - completeQueries;
    if (locale === "zh-CN") {
      const completeness =
        partialQueries === 0
          ? "结果全部完整"
          : `${String(completeQueries)} 次结果完整；${String(partialQueries)} 次仅获得部分结果并已明确标注`;
      const organized =
        organizedQueries > 0 ? `；${String(organizedQueries)} 次结果已自动按文件整理` : "";
      return `Signal Grep：已处理 ${String(queries)} 次查询，${completeness}${organized}`;
    }

    const completeness =
      partialQueries === 0
        ? "all results complete"
        : `${String(completeQueries)} complete; ${String(partialQueries)} partial and clearly marked`;
    const organized =
      organizedQueries > 0
        ? `; ${String(organizedQueries)} ${organizedQueries === 1 ? "result" : "results"} automatically organized by file`
        : "";
    return `Signal Grep: handled ${String(queries)} ${queries === 1 ? "query" : "queries"}; ${completeness}${organized}`;
  }
}
