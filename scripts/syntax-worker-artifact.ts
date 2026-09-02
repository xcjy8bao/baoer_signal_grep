import { join, resolve } from "node:path";

const repository = resolve(import.meta.dirname, "..");

export const syntaxWorkerArtifact = resolve(repository, "src/syntax-worker.mjs");

export async function buildSyntaxWorker(outdir: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [resolve(repository, "src/syntax-worker.ts")],
    outdir,
    naming: "syntax-worker.mjs",
    root: repository,
    target: "node",
    format: "esm",
    packages: "external",
    sourcemap: "none",
  });
  if (!result.success) throw new AggregateError(result.logs, "Syntax worker build failed");
  return join(outdir, "syntax-worker.mjs");
}
