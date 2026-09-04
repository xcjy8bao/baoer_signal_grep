import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMcpServer, mcpServerArtifact } from "./mcp-server-artifact.js";

const output = await mkdtemp(join(tmpdir(), "baoer_signal_grep_mcp-check-"));
try {
  const generated = await buildMcpServer(output);
  const [expected, actual] = await Promise.all([readFile(generated), readFile(mcpServerArtifact)]);
  if (!expected.equals(actual)) {
    throw new Error("src/mcp-server.mjs is stale; run `bun run build:mcp`");
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
