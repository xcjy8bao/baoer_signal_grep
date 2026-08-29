import { describe, expect, test } from "bun:test";
import { resolveContextBudget } from "../src/context-budget.js";

function usage(tokens: number | null, percent: number | null) {
  return { tokens, percent, contextWindow: 100_000 };
}

describe("resolveContextBudget", () => {
  test("keeps the default behavior when host usage is unavailable", () => {
    expect(resolveContextBudget(undefined)).toBeUndefined();
    expect(resolveContextBudget(usage(null, null))).toBeUndefined();
    expect(resolveContextBudget(usage(null, 50))).toBeUndefined();
    expect(resolveContextBudget(usage(50_000, null))).toBeUndefined();
  });

  test("resolves documented tier boundaries", () => {
    expect(resolveContextBudget(usage(59_900, 59.9))).toEqual({
      tier: "full",
      contextRemainderPercent: 40.1,
      resultTokenBudget: 2_000,
    });
    expect(resolveContextBudget(usage(60_000, 60))).toEqual({
      tier: "tight",
      contextRemainderPercent: 40,
      resultTokenBudget: 1_000,
    });
    expect(resolveContextBudget(usage(88_000, 88))).toEqual({
      tier: "tight",
      contextRemainderPercent: 12,
      resultTokenBudget: 1_000,
    });
    expect(resolveContextBudget(usage(88_100, 88.1))).toEqual({
      tier: "critical",
      contextRemainderPercent: 11.9,
      resultTokenBudget: 500,
    });
  });

  test("does not claim a tier for invalid host percentages", () => {
    expect(resolveContextBudget(usage(1, Number.NaN))).toBeUndefined();
    expect(resolveContextBudget(usage(1, -0.1))).toBeUndefined();
    expect(resolveContextBudget(usage(1, 100.1))).toBeUndefined();
  });
});
