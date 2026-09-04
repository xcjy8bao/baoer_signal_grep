import { describe, expect, test } from "bun:test";
import { SessionSummary } from "../src/session-summary.js";
import type { SignalGrepDetails, SignalGrepResult } from "../src/types.js";

function result(
  status: SignalGrepDetails["status"],
  options: { organized?: boolean } = {},
): SignalGrepResult {
  return {
    text: "evidence",
    details: {
      version: 1,
      mode: "auto",
      status,
      totalMatches: 1,
      storedMatches: 1,
      totalFiles: 1,
      returnedMatches: options.organized ? 0 : 1,
      snapshotComplete: status === "complete",
      ...(options.organized ? { summaryFilesShown: 1 } : {}),
    },
  };
}

describe("SessionSummary", () => {
  test("stays hidden before the first new query", () => {
    expect(new SessionSummary().format("zh-CN")).toBeUndefined();
  });

  test("reports complete and automatically organized queries in plain Chinese", () => {
    const summary = new SessionSummary();
    summary.record({ pattern: "small" }, result("complete"));
    summary.record({ pattern: "broad" }, result("complete", { organized: true }));
    expect(summary.format("zh-CN")).toBe(
      "baoer_signal_grep：已处理 2 次查询，结果全部完整；1 次结果已自动按文件整理",
    );
  });

  test("describes partial evidence without calling it a failed search", () => {
    const summary = new SessionSummary();
    summary.record({ pattern: "complete" }, result("complete"));
    summary.record({ pattern: "partial" }, result("partial"));
    expect(summary.format("zh-CN")).toBe(
      "baoer_signal_grep：已处理 2 次查询，1 次结果完整；1 次仅获得部分结果并已明确标注",
    );
  });

  test("does not count cursor pages, source continuations, or explicit summaries as automatic work", () => {
    const summary = new SessionSummary();
    summary.record({ cursor: "cursor" }, result("complete"));
    summary.record({ mode: "inspect", sourceCursor: "source" }, result("complete"));
    summary.record({ pattern: "manual", mode: "summary" }, result("complete", { organized: true }));
    expect(summary.snapshot).toEqual({
      queries: 1,
      completeQueries: 1,
      organizedQueries: 0,
    });
  });

  test("provides the same neutral facts in English", () => {
    const summary = new SessionSummary();
    summary.record({ pattern: "broad" }, result("partial", { organized: true }));
    expect(summary.format("en")).toBe(
      "baoer_signal_grep: handled 1 query; 0 complete; 1 partial and clearly marked; 1 result automatically organized by file",
    );
  });
});
