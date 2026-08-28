import { describe, expect, test } from "bun:test";
import { estimateTextTokens, SearchMetrics } from "../src/metrics.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepRuntime } from "../src/runtime.js";
import { SignalGrepService } from "../src/service.js";
import { createTodoFixture, removeFixture } from "./helpers.js";

const wrapStyle = (tag: string) => (text: string) => `<${tag}>${text}</${tag}>`;

describe("SearchMetrics", () => {
  test("is disabled by default and starts a fresh cumulative window when enabled", () => {
    const metrics = new SearchMetrics();
    metrics.recordComparison("signal", "normal output");
    expect(metrics.snapshot).toMatchObject({ enabled: false, searches: 0 });

    metrics.enable();
    expect(metrics.formatStatus()).toBe("[ SG 0 ]  [ NORMAL 0 ]  [ ↓ 0 · 0.0% ]");
    metrics.recordComparison("x".repeat(400), "x".repeat(1_200));
    metrics.recordCursorPage("x".repeat(200));

    expect(metrics.snapshot).toMatchObject({
      enabled: true,
      signalTokens: 150,
      normalTokens: 300,
      searches: 1,
      cursorPages: 1,
    });
    expect(metrics.formatStatus()).toBe("[ SG 150 ]  [ NORMAL 300 ]  [ ↓ 150 · 50.0% ]");
  });

  test("applies separate styles to signal, baseline, and delta cards", () => {
    const metrics = new SearchMetrics();
    metrics.enable();
    metrics.recordComparison("x".repeat(400), "x".repeat(1_200));
    expect(
      metrics.formatStatus({
        signal: wrapStyle("accent"),
        normal: wrapStyle("dim"),
        positive: wrapStyle("success"),
        negative: wrapStyle("error"),
        neutral: wrapStyle("muted"),
      }),
    ).toBe(
      "<accent>[ SG 100 ]</accent>  <dim>[ NORMAL 300 ]</dim>  <success>[ ↓ 200 · 66.7% ]</success>",
    );
  });

  test("shows negative savings without hiding them", () => {
    const metrics = new SearchMetrics();
    metrics.enable();
    metrics.recordComparison("x".repeat(800), "x".repeat(400));

    expect(metrics.formatStatus()).toBe("[ SG 200 ]  [ NORMAL 100 ]  [ ↑ 100 · 100.0% ]");
    expect(metrics.formatReport()).toContain("used an additional 100 (100.0%)");
  });

  test("uses the same conservative characters-over-four estimate as Pi", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("12345")).toBe(2);
  });

  test("stops accumulating after the comparison window closes", () => {
    const metrics = new SearchMetrics();
    metrics.enable();
    metrics.recordComparison("1234", "12345678");
    const final = metrics.disable();
    metrics.recordCursorPage("1234");

    expect(final).toMatchObject({ enabled: false, signalTokens: 1, normalTokens: 2 });
    expect(metrics.snapshot).toEqual(final);
  });

  test("starts from a fresh snapshot boundary so every successful cursor is accounted for", async () => {
    const root = await createTodoFixture();
    try {
      const runtime = new SignalGrepRuntime(
        new SignalGrepService({ runRipgrep: createRipgrepRunner() }),
      );
      const beforeWindow = await runtime.search({ pattern: "TODO", mode: "summary" }, root);
      const oldCursor = beforeWindow.details.cursor;
      if (!oldCursor) throw new Error("Expected cursor before metrics window");

      runtime.enableMetrics();
      let failure: unknown;
      try {
        await runtime.search({ cursor: oldCursor }, root);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(runtime.metricsSnapshot).toMatchObject({ searches: 0, cursorPages: 0 });
    } finally {
      await removeFixture(root);
    }
  });

  test("does not require a normal baseline for code inspection", async () => {
    const root = await createTodoFixture();
    try {
      const runtime = new SignalGrepRuntime(
        new SignalGrepService({ runRipgrep: createRipgrepRunner() }),
      );
      runtime.enableMetrics();
      const result = await runtime.search({ mode: "inspect", path: "README.md", line: 1 }, root);

      expect(result.details.mode).toBe("inspect");
      expect(runtime.metricsSnapshot).toMatchObject({ searches: 0, cursorPages: 0 });
    } finally {
      await removeFixture(root);
    }
  });

  test("reuses one search scan for Signal Grep and the normal-format baseline", async () => {
    const root = await createTodoFixture();
    let scans = 0;
    const runRipgrep = createRipgrepRunner();
    try {
      const result = await new SignalGrepService({
        runRipgrep: async (...args) => {
          scans += 1;
          return runRipgrep(...args);
        },
      }).search(
        {
          pattern: "TODO",
          glob: ["*.ts", "*.md"],
          exclude: "missing/**",
        },
        root,
        undefined,
        { includeNormalBaseline: true },
      );

      expect(scans).toBe(1);
      expect(result.normalText).toContain("noise.ts:1: // TODO fix 1");
      expect(result.normalText).toContain("README.md:1: TODO readme");
      expect(result.text).not.toContain("⚠");

      const metrics = new SearchMetrics();
      metrics.enable();
      metrics.recordComparison(result.text, result.normalText ?? "");
      expect(metrics.snapshot.searches).toBe(1);
    } finally {
      await removeFixture(root);
    }
  });
});
