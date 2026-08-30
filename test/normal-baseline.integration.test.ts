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
  test("reproduces the real normal prefix and bytes when a long Unicode line matches far from its start", async () => {
    const root = await createBaselineFixture();
    await writeFile(join(root, "late.ts"), `${"界".repeat(1_000)}needle${"x".repeat(1_000)}\n`);
    const input = { pattern: "needle", path: "late.ts", ignoreCase: false };
    const normal = textContent(await createGrepTool(root).execute("normal-late", input));
    const signal = await new SignalGrepService({ runRipgrep: createRipgrepRunner() }).search(
      input,
      root,
      undefined,
      { includeNormalBaseline: true },
    );

    expect(normal).toContain(`${"界".repeat(500)}... [truncated]`);
    expect(normal).not.toContain("needle");
    expect(signal.text).toContain("needle");
    expect(signal.normalText).toBe(normal);
    expect(Buffer.byteLength(signal.normalText ?? "")).toBe(Buffer.byteLength(normal));
  }, 10_000);

  test("keeps only bounded baseline prefixes and uses scan evidence after a source edit", async () => {
    const root = await createBaselineFixture();
    const source = join(root, "mutable.ts");
    const longLine = `${"界".repeat(1_000)}needle${"x".repeat(1_000)}`;
    await writeFile(source, `needle\n${longLine}\n${longLine}\n`);
    const input = { pattern: "needle", path: "mutable.ts", ignoreCase: false, limit: 2 };
    const normal = textContent(await createGrepTool(root).execute("normal-before-edit", input));
    const runRipgrep = createRipgrepRunner();
    const service = new SignalGrepService({
      runRipgrep: async (request, cwd, signal) => {
        const scan = await runRipgrep(request, cwd, signal);
        expect(scan.matches).toHaveLength(3);
        expect(scan.matches[0]?.normalLinePrefix).toBeUndefined();
        expect(scan.matches[1]?.normalLinePrefix).toBe("界".repeat(500));
        expect(scan.matches[2]?.normalLinePrefix).toBeUndefined();
        await writeFile(source, "replaced after the completed search\n");
        return scan;
      },
    });
    const signal = await service.search(input, root, undefined, { includeNormalBaseline: true });

    expect(signal.normalText).toBe(normal);
    expect(signal.normalText).not.toContain("replaced");
  }, 10_000);

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
