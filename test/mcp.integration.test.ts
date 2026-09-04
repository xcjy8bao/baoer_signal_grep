import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  startSignalGrepMcpServer,
  type RunningSignalGrepMcpServer,
  type SignalGrepMcpService,
} from "../src/mcp.js";

const roots = new Set<string>();
const servers = new Set<RunningSignalGrepMcpServer>();

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "baoer_signal_grep_mcp-test-"));
  roots.add(root);
  return root;
}

async function serverUrl(server: RunningSignalGrepMcpServer): Promise<URL> {
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP MCP server address");
  return new URL(`http://127.0.0.1:${String(address.port)}/mcp`);
}

interface RawHttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

async function rawPost(
  server: RunningSignalGrepMcpServer,
  body: Buffer,
  headers: Record<string, string> = {},
): Promise<RawHttpResult> {
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected MCP TCP address");
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path: "/mcp",
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          "content-length": String(body.byteLength),
          ...headers,
        },
      },
      (incoming) => {
        let responseBody = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk: string) => {
          responseBody += chunk;
        });
        incoming.on("end", () => {
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: responseBody,
          });
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

function initializeBody(): Buffer {
  return Buffer.from(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mcp-raw-test", version: "1.0.0" },
      },
    }),
  );
}

function sessionHeader(result: RawHttpResult): string {
  const value = result.headers["mcp-session-id"];
  if (typeof value !== "string") throw new Error("Expected MCP session ID");
  return value;
}

async function rawRequestTarget(
  server: RunningSignalGrepMcpServer,
  target: string,
): Promise<string> {
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected MCP TCP address");
  return new Promise((resolve, reject) => {
    const socket = connect(address.port, "127.0.0.1", () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      response += chunk;
    });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}

function idleService(onShutdown: () => void = () => {}): SignalGrepMcpService {
  return {
    async search() {
      throw new Error("Search was not expected");
    },
    async shutdown() {
      onShutdown();
    },
  };
}

function emptySearchResult() {
  return {
    text: "No matches.",
    details: {
      version: 1 as const,
      mode: "matches" as const,
      status: "complete" as const,
      totalMatches: 0,
      storedMatches: 0,
      totalFiles: 0,
      returnedMatches: 0,
      snapshotComplete: true,
    },
  };
}

function isTextContent(value: unknown): value is { type: "text"; text: string } {
  if (typeof value !== "object" || value === null) return false;
  if (!("type" in value) || !("text" in value)) return false;
  return value.type === "text" && typeof value.text === "string";
}

function firstTextContent(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content;
  if (!Array.isArray(content) || !isTextContent(content[0]))
    throw new Error("Expected text tool content");
  return content[0].text;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resultDetails(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const structured = result.structuredContent;
  if (!isRecord(structured) || !isRecord(structured.details))
    throw new Error("Expected structured details");
  return structured.details;
}

afterEach(async () => {
  await Promise.all([...servers].map((server) => server.close()));
  servers.clear();
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("baoer_signal_grep MCP server", () => {
  test("exposes the existing search contract through a remote session", async () => {
    const root = await createRoot();
    await writeFile(join(root, "source.ts"), "const needle = true;\n", "utf8");
    const server = await startSignalGrepMcpServer({ cwd: root, port: 0 });
    servers.add(server);

    const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(await serverUrl(server));
    try {
      // The SDK's transport declaration is not exact-optional-compatible with this repository's strict settings.
      // oxlint-disable-next-line no-unsafe-type-assertion -- upstream transport boundary
      await client.connect(transport as unknown as Transport);
      expect(client.getServerVersion()).toMatchObject({ version: "1.0.0" });
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(["baoer_signal_grep"]);

      const result = await client.callTool(
        {
          name: "baoer_signal_grep",
          arguments: { pattern: "needle", literal: true },
        },
        CallToolResultSchema,
      );
      const text = firstTextContent(result);
      expect(text).toContain("source.ts");
      expect(text).toContain("needle");
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        details: { mode: "auto", totalMatches: 1, status: "complete" },
      });
    } finally {
      await client.close();
    }
  }, 10_000);

  test("keeps invalid requests explicit instead of accepting arbitrary commands", async () => {
    const root = await createRoot();
    const server = await startSignalGrepMcpServer({ cwd: root, port: 0 });
    servers.add(server);

    const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(await serverUrl(server));
    try {
      // The SDK's transport declaration is not exact-optional-compatible with this repository's strict settings.
      // oxlint-disable-next-line no-unsafe-type-assertion -- upstream transport boundary
      await client.connect(transport as unknown as Transport);
      const result = await client.callTool(
        {
          name: "baoer_signal_grep",
          arguments: { pattern: "anything", context: -1 },
        },
        CallToolResultSchema,
      );
      const text = firstTextContent(result);
      expect(result.isError).toBe(true);
      expect(text).toContain("baoer_signal_grep failed");
    } finally {
      await client.close();
    }
  }, 10_000);
  test("preserves external non-protected paths and cursor continuation", async () => {
    const root = await createRoot();
    const outsideRoot = await createRoot();
    const outsideFile = join(outsideRoot, "outside.ts");
    await writeFile(
      join(root, "source.ts"),
      "const first = needle;\nconst second = needle;\n",
      "utf8",
    );
    await writeFile(outsideFile, "const outside = needle;\n", "utf8");
    const server = await startSignalGrepMcpServer({ cwd: root, port: 0 });
    servers.add(server);

    const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(await serverUrl(server));
    try {
      // The SDK's transport declaration is not exact-optional-compatible with this repository's strict settings.
      // oxlint-disable-next-line no-unsafe-type-assertion -- upstream transport boundary
      await client.connect(transport as unknown as Transport);
      const first = await client.callTool(
        {
          name: "baoer_signal_grep",
          arguments: { pattern: "needle", literal: true, mode: "matches", limit: 1 },
        },
        CallToolResultSchema,
      );
      expect(firstTextContent(first)).toContain("first");

      const cursor = resultDetails(first).cursor;
      if (typeof cursor !== "string") throw new Error("Expected a match cursor");
      const next = await client.callTool(
        { name: "baoer_signal_grep", arguments: { cursor, mode: "matches" } },
        CallToolResultSchema,
      );
      expect(firstTextContent(next)).toContain("second");

      const external = await client.callTool(
        {
          name: "baoer_signal_grep",
          arguments: { pattern: "needle", literal: true, path: outsideFile },
        },
        CallToolResultSchema,
      );
      expect(firstTextContent(external)).toContain("outside.ts");

      const protectedPath = await client.callTool(
        {
          name: "baoer_signal_grep",
          arguments: { pattern: "needle", path: join(outsideRoot, ".ssh") },
        },
        CallToolResultSchema,
      );
      expect(protectedPath.isError).toBe(true);
    } finally {
      await client.close();
    }
  }, 10_000);

  test("rejects unconfigured browser origins without affecting standard MCP clients", async () => {
    const root = await createRoot();
    const server = await startSignalGrepMcpServer({ cwd: root, port: 0 });
    servers.add(server);

    const rejected = await rawPost(server, initializeBody(), {
      origin: "https://attacker.example",
    });
    expect(rejected.status).toBe(403);

    const standard = await rawPost(server, initializeBody());
    expect(standard.status).toBe(200);

    const browserServer = await startSignalGrepMcpServer({
      cwd: root,
      port: 0,
      allowedOrigins: ["https://agent.example"],
    });
    servers.add(browserServer);
    const allowed = await rawPost(browserServer, initializeBody(), {
      origin: "https://agent.example",
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://agent.example");
    expect(allowed.headers["access-control-expose-headers"]).toContain("Mcp-Session-Id");

    const preflight = await fetch(await serverUrl(browserServer), {
      method: "OPTIONS",
      headers: {
        origin: "https://agent.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,mcp-session-id,mcp-protocol-version",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://agent.example");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "content-type,mcp-session-id,mcp-protocol-version",
    );
  }, 10_000);

  test("bounds sessions and proactively releases idle service state", async () => {
    const root = await createRoot();
    let shutdowns = 0;
    const server = await startSignalGrepMcpServer({
      cwd: root,
      port: 0,
      maxSessions: 1,
      sessionIdleTimeoutMs: 30,
      createService: () => idleService(() => (shutdowns += 1)),
    });
    servers.add(server);

    const first = await rawPost(server, initializeBody());
    expect(first.status).toBe(200);
    const firstSession = sessionHeader(first);
    const bounded = await rawPost(server, initializeBody());
    expect(bounded.status).toBe(503);

    await Bun.sleep(80);
    expect(shutdowns).toBe(1);
    const expired = await rawPost(server, initializeBody(), {
      "mcp-session-id": firstSession,
      "mcp-protocol-version": "2025-11-25",
    });
    expect(expired.status).toBe(404);
    expect((await rawPost(server, initializeBody())).status).toBe(200);
  }, 10_000);

  test("releases a service when initialization is rejected before session registration", async () => {
    const root = await createRoot();
    let services = 0;
    let shutdowns = 0;
    let observeShutdown: (() => void) | undefined;
    const shutdownObserved = new Promise<void>((resolve) => {
      observeShutdown = resolve;
    });
    const server = await startSignalGrepMcpServer({
      cwd: root,
      port: 0,
      maxSessions: 1,
      createService: () => {
        services += 1;
        return idleService(() => {
          shutdowns += 1;
          observeShutdown?.();
        });
      },
    });
    servers.add(server);

    const rejected = await rawPost(server, initializeBody(), {
      "content-type": "text/plain",
    });
    expect(rejected.status).toBe(415);
    await shutdownObserved;
    expect({ services, shutdowns }).toEqual({ services: 1, shutdowns: 1 });

    expect((await rawPost(server, initializeBody())).status).toBe(200);
    expect(services).toBe(2);
  }, 10_000);

  test("does not expire an active search and releases it after explicit termination", async () => {
    const root = await createRoot();
    let shutdowns = 0;
    const server = await startSignalGrepMcpServer({
      cwd: root,
      port: 0,
      sessionIdleTimeoutMs: 20,
      createService: () => ({
        async search() {
          await Bun.sleep(80);
          return emptySearchResult();
        },
        async shutdown() {
          shutdowns += 1;
        },
      }),
    });
    servers.add(server);

    const client = new Client({ name: "mcp-active-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(await serverUrl(server));
    try {
      // The SDK's transport declaration is not exact-optional-compatible with this repository's strict settings.
      // oxlint-disable-next-line no-unsafe-type-assertion -- upstream transport boundary
      await client.connect(transport as unknown as Transport);
      const result = await client.callTool(
        { name: "baoer_signal_grep", arguments: { pattern: "needle", literal: true } },
        CallToolResultSchema,
      );
      expect(result.isError).not.toBe(true);
      expect(shutdowns).toBe(0);

      await transport.terminateSession();
      await Bun.sleep(10);
      expect(shutdowns).toBe(1);
    } finally {
      await client.close();
    }
  }, 10_000);

  test("rejects invalid UTF-8 instead of changing the search input", async () => {
    const root = await createRoot();
    let searches = 0;
    const service = idleService();
    service.search = async () => {
      searches += 1;
      throw new Error("Invalid UTF-8 reached the tool");
    };
    const server = await startSignalGrepMcpServer({
      cwd: root,
      port: 0,
      createService: () => service,
    });
    servers.add(server);
    const initialized = await rawPost(server, initializeBody());
    const invalidBody = Buffer.concat([
      Buffer.from(
        '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"baoer_signal_grep","arguments":{"pattern":"',
      ),
      Buffer.from([0xff]),
      Buffer.from('","literal":true}}}'),
    ]);

    const result = await rawPost(server, invalidBody, {
      "mcp-session-id": sessionHeader(initialized),
      "mcp-protocol-version": "2025-11-25",
    });
    expect(result.status).toBe(400);
    expect(result.body).toContain("valid UTF-8");
    expect(searches).toBe(0);
  }, 10_000);

  test("contains malformed request targets without terminating the listener", async () => {
    const root = await createRoot();
    const server = await startSignalGrepMcpServer({ cwd: root, port: 0 });
    servers.add(server);

    const malformed = await rawRequestTarget(server, "//[");
    expect(malformed).toContain("400 Bad Request");
    expect(malformed).toContain("MCP request URL is invalid");
    expect((await rawPost(server, initializeBody())).status).toBe(200);
  }, 10_000);

  test("propagates service cleanup failures and keeps close idempotent", async () => {
    const root = await createRoot();
    const server = await startSignalGrepMcpServer({
      cwd: root,
      port: 0,
      createService: () => ({
        ...idleService(),
        async shutdown() {
          throw new Error("shutdown sentinel");
        },
      }),
    });
    expect((await rawPost(server, initializeBody())).status).toBe(200);

    const firstClose = server.close();
    expect(firstClose).rejects.toThrow("MCP server shutdown failed");
    expect(server.close()).toBe(firstClose);
  }, 10_000);
});
