import { afterEach, describe, expect, test } from "bun:test";
import { createGrepTool } from "@earendil-works/pi-coding-agent";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";

const roots = new Set<string>();

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

async function createBaselineFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-baseline-"));
  roots.add(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "compact.ts"),
    ["before  ", "ALPHA compact  ", "after  ", "alpha lower"].join("\n"),
  );
  await writeFile(
    join(root, "broad.ts"),
    `${Array.from(
      { length: 105 },
      (_, index) =>
        `ALPHA ${String(index).padStart(3, "0")} ${"x".repeat(index === 0 ? 700 : 180)}`,
    ).join("\n")}\n`,
  );
  await writeFile(
    join(root, "exact.ts"),
    `${Array.from({ length: 100 }, (_, index) => `EXACT ${index}`).join("\n")}\n`,
  );
  return root;
}

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("same-snapshot normal baseline", () => {
  test("exactly reproduces normal grep formatting for compact, context, and empty searches", async () => {
    const root = await createBaselineFixture();
    await writeFile(join(root, "large.ts"), `ALPHA large\n${"x".repeat(5 * 1024 * 1024 + 1)}\n`);
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const cases = [
      { pattern: "ALPHA", path: "src", ignoreCase: false },
      { pattern: "ALPHA", path: "src", ignoreCase: false, context: 1 },
      { pattern: "missing", path: "src", ignoreCase: false, literal: true },
      { pattern: "ALPHA", path: "broad.ts", ignoreCase: false, limit: 20 },
      { pattern: "EXACT", path: "exact.ts", ignoreCase: false },
      { pattern: "ALPHA large", path: "large.ts", ignoreCase: false, context: 1 },
    ];

    for (const [index, input] of cases.entries()) {
      // The baseline contract is sequential only to keep diagnostics deterministic.
      // oxlint-disable-next-line no-await-in-loop
      const normal = textContent(await createGrepTool(root).execute(`normal-${index}`, input));
      // oxlint-disable-next-line no-await-in-loop
      const signal = await service.search(input, root, undefined, {
        includeNormalBaseline: true,
      });
      expect(signal.normalText).toBe(normal);
    }
  });

  test("exactly reproduces match, byte, and long-line truncation notices", async () => {
    const root = await createBaselineFixture();
    const input = { pattern: "ALPHA", path: "broad.ts", ignoreCase: false };
    const normal = textContent(await createGrepTool(root).execute("normal-broad", input));
    const signal = await new SignalGrepService({ runRipgrep: createRipgrepRunner() }).search(
      input,
      root,
      undefined,
      { includeNormalBaseline: true },
    );

    expect(signal.details.totalMatches).toBe(105);
    expect(signal.normalText).toBe(normal);
    expect(normal).toContain("100 matches limit reached");
    expect(normal).toContain("limit reached");
    expect(normal).toContain("Some lines truncated to 500 chars");
  });
});
