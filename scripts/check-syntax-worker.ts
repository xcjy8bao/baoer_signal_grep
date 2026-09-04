import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSyntaxWorker, syntaxWorkerArtifact } from "./syntax-worker-artifact.js";

const output = await mkdtemp(join(tmpdir(), "baoer_signal_grep-worker-check-"));
try {
  const generated = await buildSyntaxWorker(output);
  const [expected, actual] = await Promise.all([
    readFile(generated),
    readFile(syntaxWorkerArtifact),
  ]);
  if (!expected.equals(actual)) {
    throw new Error("src/syntax-worker.mjs is stale; run `bun run build:worker`");
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
