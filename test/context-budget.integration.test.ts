import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveContextBudget } from "../src/context-budget.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import type { ContextBudget } from "../src/types.js";
import { createTodoFixture, extractMatchIds, removeFixture } from "./helpers.js";

const fixtures = new Set<string>();

function budgetAtUsagePercent(percent: number): ContextBudget {
  const budget = resolveContextBudget({ tokens: percent * 1_000, contextWindow: 100_000, percent });
  if (!budget) throw new Error("Expected a context budget");
  return budget;
}

async function fixture(): Promise<string> {
  const root = await createTodoFixture();
  fixtures.add(root);
  return root;
}

afterEach(async () => {
  await Promise.all([...fixtures].map(removeFixture));
  fixtures.clear();
});

describe("context-aware auto budget with ripgrep", () => {
  test("summarizes a legal long-path match that exceeds the critical soft detail target", async () => {
    const root = await fixture();
    const directory = Array.from(
      { length: 10 },
      (_, index) => `${String(index)}${"d".repeat(79)}`,
    ).join("/");
    await mkdir(join(root, directory), { recursive: true });
    const path = `${directory}/long.txt`;
    await writeFile(join(root, path), `${"a".repeat(1_000)}\n`);
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "a", path }, root, undefined, {
      contextBudget: budgetAtUsagePercent(95),
    });
    expect(result.details.totalMatches).toBe(1);
    expect(result.details.returnedMatches).toBe(0);
    expect(result.details.budgetTier).toBe("critical");
    expect(result.text).toContain("Snapshot cursor=");
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16_384);
    const cursor = result.details.cursor;
    if (!cursor) throw new Error("Expected a retained summary cursor");
    const details = await service.search({ mode: "matches", cursor }, root);
    expect(details.details.returnedMatches).toBe(1);
    expect(details.text).toContain("980 omitted");
  });

  test("keeps a compact complete result direct in the critical tier", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "TODO" }, root, undefined, {
      contextBudget: budgetAtUsagePercent(95),
    });

    expect(result.details).toMatchObject({
      mode: "auto",
      returnedMatches: 33,
      budgetTier: "critical",
      contextRemainderPercent: 5,
      resultTokenBudget: 500,
    });
    expect(extractMatchIds(result.text)).toHaveLength(33);
    expect(result.details.cursor).toBeUndefined();
    expect(result.text).toContain(
      "[Budget: critical; context remainder 5%; auto detail target 500 estimated tokens.]",
    );
  });

  test("tightens broad CJK evidence without changing the retained match set", async () => {
    const root = await fixture();
    const path = join(root, "中文证据.ts");
    await writeFile(
      path,
      `${Array.from({ length: 18 }, (_, index) => `// TODO 中文证据 ${index + 1} ${"界".repeat(220)}`).join("\n")}\n`,
    );

    const fullService = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const full = await fullService.search(
      { pattern: "TODO", path: "中文证据.ts" },
      root,
      undefined,
      {
        contextBudget: budgetAtUsagePercent(50),
      },
    );
    expect(full.details).toMatchObject({
      totalMatches: 18,
      returnedMatches: 18,
      budgetTier: "full",
      resultTokenBudget: 2_000,
    });
    expect(full.details.cursor).toBeUndefined();
    expect(full.text).not.toContain("[Budget:");

    const tightService = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const tight = await tightService.search(
      { pattern: "TODO", path: "中文证据.ts" },
      root,
      undefined,
      { contextBudget: budgetAtUsagePercent(70) },
    );
    expect(tight.details).toMatchObject({
      totalMatches: 18,
      storedMatches: 18,
      returnedMatches: 0,
      budgetTier: "tight",
      contextRemainderPercent: 30,
      resultTokenBudget: 1_000,
    });
    expect(tight.details.cursor).toBeString();
    expect(tight.text).toContain(
      "[Budget: tight; context remainder 30%; auto detail target 1000 estimated tokens.]",
    );
  });

  test("does not downshift explicit limits or cursor pages", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "wide.ts"),
      `${Array.from({ length: 30 }, (_, index) => `// TODO wide ${index + 1} ${"x".repeat(180)}`).join("\n")}\n`,
    );
    const critical = budgetAtUsagePercent(95);

    const explicitService = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const explicit = await explicitService.search(
      { pattern: "TODO", path: "wide.ts", limit: 5 },
      root,
      undefined,
      { contextBudget: critical },
    );
    expect(explicit.details.returnedMatches).toBe(5);
    expect(explicit.details.cursor).toBeString();
    expect(explicit.details.budgetTier).toBeUndefined();
    expect(explicit.text).not.toContain("[Budget:");

    const matchesService = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const matches = await matchesService.search(
      { pattern: "TODO", path: "wide.ts", mode: "matches" },
      root,
      undefined,
      { contextBudget: critical },
    );
    expect(matches.details.returnedMatches).toBe(30);
    expect(matches.details.budgetTier).toBeUndefined();
    expect(matches.text).not.toContain("[Budget:");

    const cursorService = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await cursorService.search(
      { pattern: "TODO", path: "wide.ts" },
      root,
      undefined,
      {
        contextBudget: critical,
      },
    );
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected a summary cursor");
    const continuation = await cursorService.search({ cursor }, root, undefined, {
      contextBudget: critical,
    });
    expect(continuation.details.mode).toBe("matches");
    expect(continuation.details.returnedMatches).toBeGreaterThan(0);
    expect(continuation.details.budgetTier).toBeUndefined();
    expect(continuation.text).not.toContain("[Budget:");
  });
});
