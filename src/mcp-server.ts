#!/usr/bin/env node
import {
  DEFAULT_MCP_HOST,
  DEFAULT_MCP_MAX_SESSIONS,
  DEFAULT_MCP_PORT,
  DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS,
  SIGNAL_GREP_MCP_PATH,
  startSignalGrepMcpServer,
} from "./mcp.js";

function environmentInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < minimum || port > maximum) {
    throw new Error(
      `${name} must be an integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return port;
}

function allowedOrigins(): string[] {
  return (process.env.SIGNAL_GREP_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const running = await startSignalGrepMcpServer({
  cwd: process.env.SIGNAL_GREP_MCP_CWD ?? process.cwd(),
  host: process.env.SIGNAL_GREP_MCP_HOST ?? DEFAULT_MCP_HOST,
  port: environmentInteger("SIGNAL_GREP_MCP_PORT", DEFAULT_MCP_PORT, 0, 65_535),
  maxSessions: environmentInteger(
    "SIGNAL_GREP_MCP_MAX_SESSIONS",
    DEFAULT_MCP_MAX_SESSIONS,
    1,
    Number.MAX_SAFE_INTEGER,
  ),
  sessionIdleTimeoutMs: environmentInteger(
    "SIGNAL_GREP_MCP_SESSION_IDLE_MS",
    DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS,
    1,
    Number.MAX_SAFE_INTEGER,
  ),
  allowedOrigins: allowedOrigins(),
});

const address = running.httpServer.address();
if (!address || typeof address === "string") throw new Error("MCP TCP listener is unavailable");
const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
process.stderr.write(
  `Signal Grep MCP listening on http://${displayHost}:${String(address.port)}${SIGNAL_GREP_MCP_PATH}\n`,
);
process.stderr.write(`Signal Grep MCP working directory: ${running.cwd}\n`);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await running.close();
  } catch (error) {
    process.stderr.write(
      `Signal Grep MCP shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
