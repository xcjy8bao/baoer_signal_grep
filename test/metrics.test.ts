import { describe, expect, test } from "bun:test";
import { createGrepTool } from "@earendil-works/pi-coding-agent";
import { createNormalGrepInput, estimateTextTokens, SearchMetrics } from "../src/metrics.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { createTodoFixture, removeFixture } from "./helpers.js";

function textContent(content: Array<{ type: string; text?: string }>): string {
  return content.find((item) => item.type === "text")?.text ?? "";
}

describe("normal grep comparison input", () => {
  test("maps the common Signal Grep request to normal grep semantics", () => {
    expect(
      createNormalGrepInput({
        pattern: "todo",
        path: "@src",
        glob: "*.ts",
        literal: true,
        context: 2,
      }),
    ).toEqual({
      supported: true,
      input: {
        pattern: "todo",
        path: "src",
        glob: "*.ts",
        literal: true,
        ignoreCase: true,
        context: 2,
      },
    });
  });

  test("preserves smart-case behavior in the normal grep baseline", () => {
    const result = createNormalGrepInput({ pattern: "TODO" });
    expect(result).toMatchObject({ supported: true, input: { ignoreCase: false } });
  });

  test("rejects filters normal grep cannot represent instead of comparing different searches", () => {
    expect(createNormalGrepInput({ pattern: "x", exclude: "generated/**" })).toEqual({
      supported: false,
      reason: "normal grep does not support exclude globs",
    });
    expect(createNormalGrepInput({ pattern: "x", glob: ["*.ts", "*.tsx"] })).toEqual({
      supported: false,
      reason: "normal grep accepts only one include glob",
    });
    expect(createNormalGrepInput({ pattern: "x", hidden: false })).toEqual({
      supported: false,
      reason: "normal grep always includes hidden files",
    });
  });
});

describe("SearchMetrics", () => {
  test("is disabled by default and starts a fresh cumulative window when enabled", () => {
    const metrics = new SearchMetrics();
    metrics.recordComparison("signal", "normal output");
    expect(metrics.snapshot).toMatchObject({ enabled: false, searches: 0 });

    metrics.enable();
    expect(metrics.formatStatus()).toBe("SG 0 / normal 0 · ↓0 (0.0%)");
    metrics.recordComparison("x".repeat(400), "x".repeat(1_200));
    metrics.recordCursorPage("x".repeat(200));

    expect(metrics.snapshot).toMatchObject({
      enabled: true,
      signalTokens: 150,
      normalTokens: 300,
      searches: 1,
      cursorPages: 1,
    });
    expect(metrics.formatStatus()).toBe("SG 150 / normal 300 · ↓150 (50.0%)");
  });

  test("shows negative savings and excluded comparisons without hiding them", () => {
    const metrics = new SearchMetrics();
    metrics.enable();
    metrics.recordComparison("x".repeat(800), "x".repeat(400));
    metrics.recordSkippedSearch();

    expect(metrics.formatStatus()).toBe("SG 200 / normal 100 · ↑100 (100.0%) · ⚠1");
    expect(metrics.formatReport()).toContain("used an additional 100 (100.0%)");
    expect(metrics.formatReport()).toContain("1 unsupported search was excluded");
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

  test("compares real Signal Grep and normal grep model-facing result text", async () => {
    const root = await createTodoFixture();
    try {
      const signalResult = await new SignalGrepService({
        runRipgrep: createRipgrepRunner(),
      }).search({ pattern: "TODO" }, root);
      const normalResult = await createGrepTool(root).execute("metrics-test", {
        pattern: "TODO",
      });
      const metrics = new SearchMetrics();
      metrics.enable();
      metrics.recordComparison(signalResult.text, textContent(normalResult.content));

      expect(metrics.snapshot.searches).toBe(1);
      expect(metrics.snapshot.signalTokens).toBeLessThan(metrics.snapshot.normalTokens);
      expect(metrics.formatStatus()).toMatch(/^SG \d+ \/ normal \d+ · ↓\d+ \(\d+\.\d%\)$/);
    } finally {
      await removeFixture(root);
    }
  });
});
