import { join, resolve } from "node:path";

const repository = resolve(import.meta.dirname, "..");

export const mcpServerArtifact = resolve(repository, "src/mcp-server.mjs");

export async function buildMcpServer(outdir: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [resolve(repository, "src/mcp-server.ts")],
    outdir,
    naming: "mcp-server.mjs",
    root: repository,
    target: "node",
    format: "esm",
    packages: "external",
    sourcemap: "none",
  });
  if (!result.success) throw new AggregateError(result.logs, "MCP server build failed");
  return join(outdir, "mcp-server.mjs");
}
