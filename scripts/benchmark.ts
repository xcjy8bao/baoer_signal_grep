import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGrepTool } from "@earendil-works/pi-coding-agent";
import { resolveContextBudget } from "../src/context-budget.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { createTodoFixture, removeFixture } from "../test/helpers.js";

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

function matchingLines(text: string): number {
  return text.split("\n").filter((line) => line.includes("TODO")).length;
}

function budgetAtRemainderPercent(contextRemainderPercent: number) {
  const percent = 100 - contextRemainderPercent;
  const budget = resolveContextBudget({
    tokens: percent * 1_000,
    contextWindow: 100_000,
    percent,
  });
  if (!budget) throw new Error("Expected benchmark context budget");
  return budget;
}

const root = await createTodoFixture();
try {
  const compactNormalText = textContent(
    await createGrepTool(root).execute("benchmark-compact", { pattern: "TODO" }),
  );
  const compactSignal = await new SignalGrepService({
    runRipgrep: createRipgrepRunner(),
  }).search({ pattern: "TODO" }, root);

  const paginationService = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
  const pageCounts: number[] = [];
  let page = await paginationService.search({ mode: "matches", pattern: "TODO", limit: 20 }, root);
  while (true) {
    pageCounts.push(page.details.returnedMatches);
    const { cursor } = page.details;
    if (!cursor) break;
    // Cursor pages are sequential by contract and cannot execute in parallel.
    // oxlint-disable-next-line no-await-in-loop
    page = await paginationService.search({ cursor }, root);
  }

  await writeFile(
    join(root, "budget.ts"),
    `${Array.from({ length: 18 }, (_, index) => `// BUDGET_HIT ${index + 1} ${"x".repeat(220)}`).join("\n")}\n`,
  );
  const runBudgetScenario = (contextRemainderPercent: number) =>
    new SignalGrepService({ runRipgrep: createRipgrepRunner() }).search(
      { pattern: "BUDGET_HIT" },
      root,
      undefined,
      { contextBudget: budgetAtRemainderPercent(contextRemainderPercent) },
    );
  const [fullBudget, tightBudget, criticalBudget] = await Promise.all([
    runBudgetScenario(80),
    runBudgetScenario(30),
    runBudgetScenario(8),
  ]);
  await writeFile(
    join(root, "broad.ts"),
    `${Array.from({ length: 200 }, (_, index) => `// TODO broad ${index} ${"x".repeat(100)}`).join("\n")}\n`,
  );
  const broadNormalText = textContent(
    await createGrepTool(root).execute("benchmark-broad", { pattern: "TODO" }),
  );
  const broadSignal = await new SignalGrepService({
    runRipgrep: createRipgrepRunner(),
  }).search({ pattern: "TODO" }, root);

  if (
    matchingLines(compactNormalText) !== 33 ||
    compactSignal.details.totalMatches !== 33 ||
    compactSignal.details.returnedMatches !== 33 ||
    compactSignal.details.cursor !== undefined ||
    pageCounts.length !== 2 ||
    pageCounts[0] !== 20 ||
    pageCounts[1] !== 13 ||
    fullBudget.details.budgetTier !== "full" ||
    fullBudget.details.returnedMatches !== 18 ||
    fullBudget.details.cursor !== undefined ||
    tightBudget.details.budgetTier !== "tight" ||
    tightBudget.details.returnedMatches !== 0 ||
    !tightBudget.details.cursor ||
    criticalBudget.details.budgetTier !== "critical" ||
    criticalBudget.details.returnedMatches !== 0 ||
    !criticalBudget.details.cursor ||
    matchingLines(broadNormalText) !== 100 ||
    broadSignal.details.totalMatches !== 233 ||
    broadSignal.details.returnedMatches !== 0 ||
    !broadSignal.details.cursor
  ) {
    throw new Error("Benchmark fixtures violated adaptive search contracts");
  }

  const broadNormalBytes = Buffer.byteLength(broadNormalText);
  const broadSignalBytes = Buffer.byteLength(broadSignal.text);
  const report = {
    compactSearch: {
      matches: 33,
      normalFirstResponseBytes: Buffer.byteLength(compactNormalText),
      signalFirstResponseBytes: Buffer.byteLength(compactSignal.text),
      signalReturnedMatches: compactSignal.details.returnedMatches,
      extraDetailTurnRequired: false,
    },
    explicitPagination: {
      pageCounts,
      returnedMatches: pageCounts.reduce((total, count) => total + count, 0),
    },
    contextAwareBudget: {
      fixtureMatches: 18,
      tiers: [
        {
          tier: fullBudget.details.budgetTier,
          contextRemainderPercent: fullBudget.details.contextRemainderPercent,
          resultTokenBudget: fullBudget.details.resultTokenBudget,
          returnedMatches: fullBudget.details.returnedMatches,
          firstResponseBytes: Buffer.byteLength(fullBudget.text),
        },
        {
          tier: tightBudget.details.budgetTier,
          contextRemainderPercent: tightBudget.details.contextRemainderPercent,
          resultTokenBudget: tightBudget.details.resultTokenBudget,
          returnedMatches: tightBudget.details.returnedMatches,
          firstResponseBytes: Buffer.byteLength(tightBudget.text),
        },
        {
          tier: criticalBudget.details.budgetTier,
          contextRemainderPercent: criticalBudget.details.contextRemainderPercent,
          resultTokenBudget: criticalBudget.details.resultTokenBudget,
          returnedMatches: criticalBudget.details.returnedMatches,
          firstResponseBytes: Buffer.byteLength(criticalBudget.text),
        },
      ],
    },
    broadSearch: {
      actualMatches: broadSignal.details.totalMatches,
      normalFirstResponseMatchLines: matchingLines(broadNormalText),
      normalFirstResponseBytes: broadNormalBytes,
      signalFirstResponseDetailLines: broadSignal.details.returnedMatches,
      signalFirstResponseBytes: broadSignalBytes,
      firstResponseReductionPercent: Number(
        (((broadNormalBytes - broadSignalBytes) / broadNormalBytes) * 100).toFixed(1),
      ),
      summaryFiles: broadSignal.details.totalFiles,
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await removeFixture(root);
}
