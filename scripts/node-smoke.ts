import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const outdir = resolve(".signal-grep-node-smoke");

try {
  const build = await Bun.build({
    entrypoints: [resolve("src/index.ts")],
    outdir,
    target: "node",
    packages: "external",
    sourcemap: "none",
  });

  if (!build.success) {
    throw new AggregateError(build.logs, "Node smoke build failed");
  }

  const process = Bun.spawn(["node", resolve(outdir, "index.js")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`Node 22+ smoke import failed (${exitCode}): ${stderr.trim()}`);
  }
} finally {
  await rm(outdir, { recursive: true, force: true });
}
