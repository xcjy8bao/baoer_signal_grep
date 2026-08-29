import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import { CONTEXT_BUDGET_POLICY, type ContextBudget, type ContextBudgetTier } from "./types.js";

function budgetTier(contextRemainderPercent: number): ContextBudgetTier {
  if (contextRemainderPercent > CONTEXT_BUDGET_POLICY.fullAboveRemainderPercent) {
    return "full";
  }
  if (contextRemainderPercent < CONTEXT_BUDGET_POLICY.criticalBelowRemainderPercent) {
    return "critical";
  }
  return "tight";
}

/** Resolve one stable budget decision from the host's pre-call context usage. */
export function resolveContextBudget(usage: ContextUsage | undefined): ContextBudget | undefined {
  if (!usage || usage.tokens === null || usage.percent === null) return undefined;
  if (!Number.isFinite(usage.percent) || usage.percent < 0 || usage.percent > 100) return undefined;

  const contextRemainderPercent = Number((100 - usage.percent).toFixed(1));
  const tier = budgetTier(contextRemainderPercent);
  return {
    tier,
    contextRemainderPercent,
    resultTokenBudget: CONTEXT_BUDGET_POLICY.resultTokenBudgets[tier],
  };
}
