import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createGrepTool } from "@earendil-works/pi-coding-agent";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { createTodoFixture, removeFixture } from "../test/helpers.js";

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

function matchingLines(text: string): number {
  return text.split("\n").filter((line) => line.includes("TODO")).length;
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
