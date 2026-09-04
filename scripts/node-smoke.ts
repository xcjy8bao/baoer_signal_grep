import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { mcpServerArtifact } from "./mcp-server-artifact.js";

const outdir = resolve(".baoer_signal_grep-node-smoke");

async function withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 10_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForServerUrl(stderr: ReadableStream<Uint8Array>): Promise<URL> {
  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  let output = "";
  try {
    while (true) {
      // Stream chunks must be consumed in order until the startup URL is complete.
      // oxlint-disable-next-line no-await-in-loop -- one sequential stream reader owns startup output
      const next = await withTimeout(reader.read(), "Node MCP server did not start in time");
      if (next.done) throw new Error(`Node MCP server exited before startup: ${output.trim()}`);
      output += decoder.decode(next.value, { stream: true });
      const match = /baoer_signal_grep MCP listening on (http:\/\/\S+)/.exec(output);
      if (match?.[1]) return new URL(match[1]);
    }
  } finally {
    reader.releaseLock();
  }
}

async function smokeMcpHttpArtifact(cwd: string): Promise<void> {
  const supportsGracefulSignalShutdown = process.platform !== "win32";
  const child = Bun.spawn(["node", mcpServerArtifact], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, BAOER_SIGNAL_GREP_MCP_CWD: cwd, BAOER_SIGNAL_GREP_MCP_PORT: "0" },
  });
  let operationFailure: { error: unknown } | undefined;
  try {
    const url = await waitForServerUrl(child.stderr);
    const client = new Client({ name: "node-smoke", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(url);
    try {
      // The SDK's transport declaration is not exact-optional-compatible with this repository's strict settings.
      // oxlint-disable-next-line no-unsafe-type-assertion -- upstream transport boundary
      const clientTransport = transport as unknown as Transport;
      await withTimeout(client.connect(clientTransport), "Node MCP initialization timed out");
      if (client.getServerVersion()?.version !== "1.0.0") {
        throw new Error("Node MCP server advertised the wrong release version");
      }
      const result = await withTimeout(
        client.callTool(
          {
            name: "baoer_signal_grep",
            arguments: { pattern: "node-artifact-needle", literal: true },
          },
          CallToolResultSchema,
        ),
        "Node MCP search timed out",
      );
      const serialized = JSON.stringify(result);
      if (result.isError || !serialized.includes("node-smoke-fixture.ts")) {
        throw new Error(`Node MCP search failed: ${serialized}`);
      }
    } finally {
      await client.close();
    }
  } catch (error) {
    operationFailure = { error };
  } finally {
    child.kill("SIGTERM");
  }
  let shutdownFailure: { error: unknown } | undefined;
  try {
    const exitCode = await withTimeout(child.exited, "Node MCP server did not shut down in time");
    if (exitCode !== 0 && supportsGracefulSignalShutdown && !operationFailure) {
      throw new Error(`Node MCP shutdown failed with status ${String(exitCode)}`);
    }
  } catch (error) {
    shutdownFailure = { error };
  }
  if (operationFailure && shutdownFailure) {
    throw new AggregateError(
      [operationFailure.error, shutdownFailure.error],
      "Node MCP smoke test and shutdown failed",
    );
  }
  if (operationFailure) throw operationFailure.error;
  if (shutdownFailure) throw shutdownFailure.error;
}

async function smokeMcpStdioArtifact(cwd: string): Promise<void> {
  let diagnostics = "";
  const transport = new StdioClientTransport({
    command: "node",
    args: [mcpServerArtifact, "--stdio"],
    cwd,
    env: {
      BAOER_SIGNAL_GREP_MCP_CWD: cwd,
      BAOER_SIGNAL_GREP_MCP_HOST: "invalid stdio-only sentinel",
      BAOER_SIGNAL_GREP_MCP_PORT: "not-a-port",
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk: unknown) => {
    diagnostics += String(chunk);
  });
  const client = new Client({ name: "node-stdio-smoke", version: "1.0.0" });
  try {
    await withTimeout(client.connect(transport), "Node stdio MCP initialization timed out");
    if (client.getServerVersion()?.version !== "1.0.0") {
      throw new Error("Node stdio MCP server advertised the wrong release version");
    }
    if (!client.getInstructions()?.includes("baoer_signal_grep")) {
      throw new Error("Node stdio MCP server omitted search workflow instructions");
    }
    const tools = await withTimeout(client.listTools(), "Node stdio MCP tool listing timed out");
    if (tools.tools.length !== 1 || tools.tools[0]?.name !== "baoer_signal_grep") {
      throw new Error(`Node stdio MCP server exposed unexpected tools: ${JSON.stringify(tools)}`);
    }
    const result = await withTimeout(
      client.callTool(
        {
          name: "baoer_signal_grep",
          arguments: { pattern: "node-artifact-needle", literal: true },
        },
        CallToolResultSchema,
      ),
      "Node stdio MCP search timed out",
    );
    const serialized = JSON.stringify(result);
    if (result.isError || !serialized.includes("node-smoke-fixture.ts")) {
      throw new Error(`Node stdio MCP search failed: ${serialized}`);
    }
  } finally {
    await withTimeout(client.close(), "Node stdio MCP server did not shut down in time");
  }
  if (!diagnostics.includes("serving one local client over stdio")) {
    throw new Error(`Node stdio MCP startup diagnostics were missing: ${diagnostics.trim()}`);
  }
  if (diagnostics.includes("listening on http://")) {
    throw new Error(`Node stdio MCP unexpectedly opened HTTP mode: ${diagnostics.trim()}`);
  }
}

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

  await writeFile(
    resolve(outdir, "node-smoke-fixture.ts"),
    "export const nodeArtifactNeedle = 'node-artifact-needle';\n",
    "utf8",
  );

  const nodeImport = Bun.spawn(["node", resolve(outdir, "index.js")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    nodeImport.exited,
    new Response(nodeImport.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`Node 22+ smoke import failed (${exitCode}): ${stderr.trim()}`);
  }
  await smokeMcpHttpArtifact(outdir);
  await smokeMcpStdioArtifact(outdir);
} finally {
  await rm(outdir, { recursive: true, force: true });
}
