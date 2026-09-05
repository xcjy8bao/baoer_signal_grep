import { join, resolve } from "node:path";
const repository = resolve(import.meta.dirname, "..");
export const conceptWorkerArtifact = resolve(repository, "src/concept-worker.mjs");
export async function buildConceptWorker(outdir: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [resolve(repository, "src/concept-worker.ts")],
    outdir,
    naming: "concept-worker.mjs",
    root: repository,
    target: "node",
    format: "esm",
    packages: "external",
    sourcemap: "none",
  });
  if (!result.success) throw new AggregateError(result.logs, "Concept worker build failed");
  return join(outdir, "concept-worker.mjs");
}
