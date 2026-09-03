import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { recognizeSignalGrepResult } from "../src/tui/presentation.js";
import { renderSignalGrepResult } from "../src/tui/renderers.js";

const roots = new Set<string>();
const theme = { bold: (text: string) => text, fg: (_color: string, text: string) => text };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-navigation-"));
  roots.add(root);
  await Promise.all([
    writeFile(
      join(root, "noise.ts"),
      Array.from({ length: 80 }, (_, i) => `// NEEDLE noise ${String(i)} ${"x".repeat(100)}`).join(
        "\n",
      ),
    ),
    writeFile(
      join(root, "app.ts"),
      "export function app() {\n  // NEEDLE application\n  return 42;\n}\n",
    ),
    writeFile(
      join(root, "认证.ts"),
      "export function authorize() {\n  // NEEDLE authorization\n  return false;\n}\n",
    ),
  ]);
  return root;
}

function visibleCursor(text: string): string {
  const cursor = /Snapshot cursor="([^"]+)"/.exec(text)?.[1];
  if (!cursor) throw new Error("Model-visible snapshot cursor is missing");
  return cursor;
}

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("model-visible evidence navigation", () => {
  test("navigates from real summary samples to batch evidence using only text", async () => {
    const root = await fixture();
    let scans = 0;
    const runner = createRipgrepRunner();
    const service = new SignalGrepService({
      runRipgrep: (...args) => {
        scans += 1;
        return runner(...args);
      },
    });
    const summary = await service.search({ pattern: "NEEDLE" }, root);
    const cursor = visibleCursor(summary.text);
    const samples = [...summary.text.matchAll(/\{match #(\d+)\}/g)].map((match) =>
      Number(match[1]),
    );
    // A summary may show two bounded source windows for one file. Every displayed
    // marker remains a valid inspect target, and the model-visible cap is five.
    expect(samples.length).toBeGreaterThanOrEqual(3);
    expect(samples.length).toBeLessThanOrEqual(5);
    expect(new Set(samples).size).toBe(samples.length);
    expect(summary.text).toContain("NEEDLE application");
    expect(summary.text).toContain("NEEDLE authorization");
    const inspected = await service.search(
      { mode: "inspect", cursor, matchIndices: samples },
      root,
    );
    expect(inspected.text).toContain("return 42;");
    expect(inspected.text).toContain("return false;");
    expect(inspected.details.inspections?.every((item) => item.status === "returned")).toBe(true);
    expect(Buffer.byteLength(inspected.text)).toBeLessThanOrEqual(16 * 1024);
    expect(scans).toBe(1);
  }, 10_000);

  test("keeps external search evidence usable through cursor inspection", async () => {
    const root = await fixture();
    const cwd = join(root, "workspace");
    await mkdir(cwd);
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "NEEDLE", path: "..", mode: "summary" }, cwd);
    const cursor = visibleCursor(summary.text);
    expect(summary.text).toContain(join(root, "app.ts"));
    const inspected = await service.search({ mode: "inspect", cursor, matchIndex: 1 }, cwd);
    expect(inspected.details.source?.reference?.path.startsWith(await realpath(root))).toBe(true);
    expect(inspected.details.status).toBe("complete");
  }, 10_000);
  test("real summary and batch results enter localized responsive TUI views", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "NEEDLE", mode: "summary" }, root);
    expect(recognizeSignalGrepResult(summary.text, summary.details)?.kind).toBe("summary");
    const inspected = await service.search(
      {
        mode: "inspect",
        targets: [
          { path: "app.ts", line: 2 },
          { path: "认证.ts", line: 2 },
        ],
      },
      root,
    );
    expect(recognizeSignalGrepResult(inspected.text, inspected.details)?.kind).toBe(
      "inspect-batch",
    );
    for (const result of [summary, inspected]) {
      const component = renderSignalGrepResult(
        { content: [{ type: "text", text: result.text }], details: result.details },
        { expanded: false, isPartial: false, isError: false },
        "zh-CN",
        theme,
      );
      for (const width of [30, 60, 100]) {
        const lines = component.render(width);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        expect(lines.join("\n")).toContain(result === summary ? "摘要" : "源码检查");
      }
    }
  }, 10_000);

  test("all file-summary pages expose a usable text cursor", async () => {
    const root = await fixture();
    const service = new SignalGrepService({
      runRipgrep: createRipgrepRunner(),
      summaryFileLimit: 2,
    });
    const first = await service.search({ pattern: "NEEDLE", mode: "summary" }, root);
    const firstCursor = visibleCursor(first.text);
    const last = await service.search({ cursor: firstCursor, mode: "summary" }, root);
    const lastCursor = visibleCursor(last.text);
    expect(last.details.summaryFilesOmitted).toBe(0);
    const page = await service.search({ cursor: lastCursor, path: "app.ts" }, root);
    expect(page.text).toContain("NEEDLE application");
  }, 10_000);

  test("rejects inspect options that would silently change or ignore search semantics", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const inspectError = await service
      .search({ mode: "inspect", path: "app.ts", line: 2, pattern: "NEEDLE" }, root)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    if (!(inspectError instanceof Error)) throw new Error("Expected invalid inspect input to fail");
    expect(inspectError.message).toContain("mode=inspect does not accept pattern");
    expect(inspectError.message).toContain("copy the complete returned request");
    const searchError = await service
      .search({ pattern: "NEEDLE", targets: [{ path: "app.ts", line: 2 }] }, root)
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(searchError).toMatchObject({ message: expect.stringContaining("require mode=inspect") });
  }, 10_000);
});
