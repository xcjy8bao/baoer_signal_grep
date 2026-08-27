import { createGrepTool } from "@earendil-works/pi-coding-agent";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { createTodoFixture, removeFixture } from "../test/helpers.js";

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

const root = await createTodoFixture();
try {
  const builtinResult = await createGrepTool(root).execute("benchmark", {
    pattern: "TODO",
  });
  const builtinText = textContent(builtinResult);

  const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
  const summary = await service.search({ pattern: "TODO" }, root);
  const pageCounts: number[] = [];
  let detailBytes = 0;
  let page = await service.search({ mode: "matches", pattern: "TODO" }, root);

  while (true) {
    pageCounts.push(page.details.returnedMatches);
    detailBytes += Buffer.byteLength(page.text);
    const { cursor } = page.details;
    if (!cursor) break;
    // Cursor pages are sequential by contract and cannot execute in parallel.
    // oxlint-disable-next-line no-await-in-loop
    page = await service.search({ cursor }, root);
  }

  const builtinBytes = Buffer.byteLength(builtinText);
  const builtinMatchLines = builtinText.split("\n").filter((line) => line.includes("TODO")).length;
  const summaryBytes = Buffer.byteLength(summary.text);
  const returnedMatches = pageCounts.reduce((total, count) => total + count, 0);

  if (
    builtinMatchLines !== 33 ||
    summary.details.totalMatches !== 33 ||
    summary.details.totalFiles !== 4 ||
    pageCounts.length !== 2 ||
    pageCounts[0] !== 20 ||
    pageCounts[1] !== 13 ||
    returnedMatches !== 33
  ) {
    throw new Error("Benchmark fixture violated its expected 33-match comparison contract");
  }

  const report = {
    fixture: {
      files: 4,
      matches: 33,
      noiseFileMatches: 30,
    },
    piBuiltinGrep: {
      firstResponseBytes: builtinBytes,
      firstResponseMatchLines: builtinMatchLines,
    },
    signalGrepAuto: {
      firstResponseBytes: summaryBytes,
      firstResponseDetailLines: 0,
      firstResponseReductionPercent: Number(
        (((builtinBytes - summaryBytes) / builtinBytes) * 100).toFixed(1),
      ),
      summaryFiles: summary.details.totalFiles,
    },
    signalGrepExhaustive: {
      combinedDetailBytes: detailBytes,
      pageCounts,
      returnedMatches,
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await removeFixture(root);
}
