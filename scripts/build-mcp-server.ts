import { dirname } from "node:path";
import { buildMcpServer, mcpServerArtifact } from "./mcp-server-artifact.js";

await buildMcpServer(dirname(mcpServerArtifact));
