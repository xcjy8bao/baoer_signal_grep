import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import packageMetadata from "../package.json" with { type: "json" };
import { Value } from "typebox/value";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { SignalGrepResult } from "./types.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SignalGrepService, type SignalGrepInput } from "./service.js";
import { signalGrepMcpInstructions } from "./prompt-guidelines.js";
import { SIGNAL_GREP_DESCRIPTION, signalGrepSchema } from "./tool-schema.js";

export const BAOER_SIGNAL_GREP_MCP_PATH = "/mcp";
export const DEFAULT_MCP_HOST = "127.0.0.1";
export const DEFAULT_MCP_PORT = 3000;
export const DEFAULT_MCP_MAX_SESSIONS = 100;
export const DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_MCP_BODY_BYTES = 16 * 1024 * 1024;

const BAOER_SIGNAL_GREP_MCP_VERSION = packageMetadata.version;

const SIGNAL_GREP_TOOL: Tool = {
  name: "baoer_signal_grep",
  title: "baoer_signal_grep",
  description: SIGNAL_GREP_DESCRIPTION,
  // TypeBox and MCP both consume JSON Schema, but their TypeScript declarations are intentionally unrelated.
  // SAFETY: signalGrepSchema is runtime-validated TypeBox JSON Schema and matches MCP's input schema shape.
  // oxlint-disable-next-line no-unsafe-type-assertion -- this is the checked JSON Schema adapter boundary
  inputSchema: signalGrepSchema as unknown as Tool["inputSchema"],
  outputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description:
          "Complete formatted result page, including source evidence, limits and continuation requests.",
      },
      details: { type: "object" },
    },
    required: ["text", "details"],
  },
  annotations: {
    title: "baoer_signal_grep",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export interface SignalGrepMcpService {
  search(input: SignalGrepInput, cwd: string, signal?: AbortSignal): Promise<SignalGrepResult>;
  shutdown(): Promise<void>;
}

export function createDefaultSignalGrepMcpService(): SignalGrepMcpService {
  return new SignalGrepService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider(),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validationMessage(value: unknown): string | undefined {
  if (Value.Check(signalGrepSchema, value)) return undefined;
  const first = Value.Errors(signalGrepSchema, value)[0];
  if (!first) return "Invalid baoer_signal_grep arguments";
  return `Invalid baoer_signal_grep arguments at ${first.instancePath || "/"}: ${first.message}`;
}

function parseSignalGrepInput(value: unknown): SignalGrepInput {
  const message = validationMessage(value);
  if (message) throw new Error(message);
  // Value.Check has validated the complete public schema before this boundary.
  // oxlint-disable-next-line no-unsafe-type-assertion -- TypeBox's inferred shape feeds the existing service contract
  return value as SignalGrepInput;
}

function toolError(error: unknown) {
  return {
    content: [{ type: "text" as const, text: `baoer_signal_grep failed: ${errorMessage(error)}` }],
    isError: true,
  };
}

export function createSignalGrepMcpServer(service: SignalGrepMcpService, cwd: string): McpServer {
  const server = new McpServer(
    { name: "baoer_signal_grep", version: BAOER_SIGNAL_GREP_MCP_VERSION },
    {
      capabilities: { tools: {} },
      instructions: signalGrepMcpInstructions(),
    },
  );

  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [SIGNAL_GREP_TOOL],
  }));

  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== SIGNAL_GREP_TOOL.name) {
      return toolError(new Error(`Unknown tool: ${request.params.name}`));
    }
    try {
      const input = parseSignalGrepInput(request.params.arguments ?? {});
      const result = await service.search(input, cwd, extra.signal);
      return {
        content: [{ type: "text" as const, text: result.text }],
        // Clients may expose only structuredContent to their model. Both representations
        // must use the same final page, after service-level formatting and redaction.
        structuredContent: { text: result.text, details: result.details },
      };
    } catch (error) {
      return toolError(error);
    }
  });

  return server;
}

interface McpSession {
  protocol: McpServer;
  service: SignalGrepMcpService;
  transport: StreamableHTTPServerTransport;
  lastAccessedAt: number;
  activeRequests: number;
  cleanup?: Promise<void>;
}

function settledErrors(results: readonly PromiseSettledResult<unknown>[]): unknown[] {
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}

function cleanupSession(sessions: Map<string, McpSession>, session: McpSession): Promise<void> {
  if (session.cleanup) return session.cleanup;
  session.cleanup = Promise.resolve().then(async () => {
    const sessionId = session.transport.sessionId;
    if (sessionId && sessions.get(sessionId) === session) sessions.delete(sessionId);
    const errors = settledErrors(
      await Promise.allSettled([session.protocol.close(), session.service.shutdown()]),
    );
    if (errors.length > 0) throw new AggregateError(errors, "MCP session cleanup failed");
    return undefined;
  });
  return session.cleanup;
}

interface McpSessionState {
  readonly sessions: Map<string, McpSession>;
  readonly ownedSessions: Set<McpSession>;
  readonly maxSessions: number;
  readonly idleTimeoutMs: number;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly cleanupErrors: unknown[];
  pendingInitializations: number;
  closing: boolean;
}

function recordCleanupError(state: McpSessionState, error: unknown): void {
  state.cleanupErrors.push(error);
}

function ignoreCleanupError(): void {}

function cleanupOwnedSession(state: McpSessionState, session: McpSession): Promise<void> {
  return cleanupSession(state.sessions, session).finally(() => state.ownedSessions.delete(session));
}

async function sweepIdleSessions(state: McpSessionState, now = Date.now()): Promise<void> {
  const expired = [...state.sessions.values()].filter(
    (session) =>
      session.activeRequests === 0 && now - session.lastAccessedAt >= state.idleTimeoutMs,
  );
  const errors = settledErrors(
    await Promise.allSettled(expired.map((session) => cleanupOwnedSession(state, session))),
  );
  state.cleanupErrors.push(...errors);
}

async function useSession(session: McpSession, operation: () => Promise<void>): Promise<void> {
  session.activeRequests += 1;
  session.lastAccessedAt = Date.now();
  try {
    await operation();
  } finally {
    session.activeRequests -= 1;
    session.lastAccessedAt = Date.now();
  }
}

export interface SignalGrepMcpHttpOptions {
  cwd?: string;
  host?: string;
  port?: number;
  allowedOrigins?: readonly string[];
  maxSessions?: number;
  sessionIdleTimeoutMs?: number;
  createService?: () => SignalGrepMcpService;
}

export interface RunningSignalGrepMcpServer {
  readonly httpServer: Server;
  readonly cwd: string;
  close(): Promise<void>;
}

function requestHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function admitOrigin(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = requestHeader(request, "origin");
  if (origin === undefined) return true;
  if (!allowedOrigins.has(origin)) {
    writeJsonError(response, 403, "MCP request Origin is not allowed");
    return false;
  }
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-expose-headers", "Mcp-Session-Id, MCP-Protocol-Version");
  response.setHeader("vary", "Origin");
  return true;
}

type ParsedMcpBody = { ok: true; value: unknown } | { ok: false; message: string };

async function readJsonBody(request: IncomingMessage): Promise<ParsedMcpBody> {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0)
      return { ok: false, message: "Invalid Content-Length" };
    if (length > MAX_MCP_BODY_BYTES)
      return { ok: false, message: "MCP request body exceeds the size limit" };
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_MCP_BODY_BYTES)
      return { ok: false, message: "MCP request body exceeds the size limit" };
    chunks.push(bytes);
  }
  if (chunks.length === 0) return { ok: true, value: undefined };

  let body: string;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    return { ok: false, message: "MCP request body must be valid UTF-8" };
  }
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, message: "MCP request body must be valid JSON" };
  }
}

function writeJsonError(response: ServerResponse, status: number, message: string): void {
  if (response.headersSent) return;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function reportHttpFailure(response: ServerResponse, error: unknown): void {
  process.stderr.write(`baoer_signal_grep MCP request failed: ${errorMessage(error)}\n`);
  if (!response.headersSent) writeJsonError(response, 500, "MCP request failed");
  else response.destroy();
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? BAOER_SIGNAL_GREP_MCP_PATH, "http://baoer_signal_grep.local")
    .pathname;
}

async function handleMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  state: McpSessionState,
  createService: () => SignalGrepMcpService,
  cwd: string,
): Promise<void> {
  if (!admitOrigin(request, response, state.allowedOrigins)) return;
  if (state.closing) {
    writeJsonError(response, 503, "MCP server is shutting down");
    return;
  }

  let path: string;
  try {
    path = requestPath(request);
  } catch {
    writeJsonError(response, 400, "MCP request URL is invalid");
    return;
  }
  if (path !== BAOER_SIGNAL_GREP_MCP_PATH) {
    writeJsonError(response, 404, "MCP endpoint not found");
    return;
  }

  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    const requestedHeaders = requestHeader(request, "access-control-request-headers");
    if (requestedHeaders) response.setHeader("access-control-allow-headers", requestedHeaders);
    response.statusCode = 204;
    response.end();
    return;
  }

  const sessionId = requestHeader(request, "mcp-session-id");
  if (request.method === "POST") {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) {
      writeJsonError(response, 400, parsedBody.message);
      return;
    }
    const body = parsedBody.value;

    let session = sessionId ? state.sessions.get(sessionId) : undefined;
    let createdSession: McpSession | undefined;
    let initializationReserved = false;
    if (!session) {
      if (sessionId) {
        writeJsonError(response, 404, "MCP session not found");
        return;
      }
      if (!isInitializeRequest(body)) {
        writeJsonError(response, 400, "MCP initialization is required before tool calls");
        return;
      }

      await sweepIdleSessions(state);
      if (state.closing) {
        writeJsonError(response, 503, "MCP server is shutting down");
        return;
      }
      if (state.sessions.size + state.pendingInitializations >= state.maxSessions) {
        writeJsonError(
          response,
          503,
          "MCP session limit reached; retry after an idle session expires",
        );
        return;
      }
      state.pendingInitializations += 1;
      initializationReserved = true;

      let pendingSession: McpSession | undefined;
      try {
        const service = createService();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            if (!pendingSession) throw new Error("MCP session initialized before registration");
            state.sessions.set(initializedSessionId, pendingSession);
            if (initializationReserved) {
              state.pendingInitializations -= 1;
              initializationReserved = false;
            }
          },
        });
        const protocol = createSignalGrepMcpServer(service, cwd);
        pendingSession = {
          protocol,
          service,
          transport,
          lastAccessedAt: Date.now(),
          activeRequests: 0,
        };
        createdSession = pendingSession;
        state.ownedSessions.add(pendingSession);
        // MCP transport exposes its lifecycle hook as an onclose property.
        // oxlint-disable-next-line unicorn/prefer-add-event-listener -- required by the upstream transport API
        transport.onclose = () => {
          const closedSession = pendingSession;
          if (!closedSession) return;
          const cleanupAlreadyOwned = closedSession.cleanup !== undefined;
          const cleanup = cleanupOwnedSession(state, closedSession);
          void cleanup.catch(
            cleanupAlreadyOwned
              ? ignoreCleanupError
              : (error: unknown) => recordCleanupError(state, error),
          );
        };
        // The SDK's transport declaration is not exact-optional-compatible with this repository's strict settings.
        // SAFETY: StreamableHTTPServerTransport implements the MCP Transport contract; only optional callbacks differ in declarations.
        // oxlint-disable-next-line no-unsafe-type-assertion -- upstream transport boundary
        await protocol.connect(transport as unknown as Transport);
        session = pendingSession;
      } catch (error) {
        if (initializationReserved) {
          state.pendingInitializations -= 1;
          initializationReserved = false;
        }
        if (pendingSession) {
          try {
            await cleanupOwnedSession(state, pendingSession);
          } catch (cleanupError) {
            recordCleanupError(state, cleanupError);
          }
        }
        reportHttpFailure(response, error);
        return;
      }
    }

    let requestFailed = false;
    try {
      await useSession(session, () => session.transport.handleRequest(request, response, body));
    } catch (error) {
      requestFailed = true;
      reportHttpFailure(response, error);
    } finally {
      if (createdSession && (requestFailed || createdSession.transport.sessionId === undefined)) {
        try {
          await cleanupOwnedSession(state, createdSession);
        } catch (cleanupError) {
          recordCleanupError(state, cleanupError);
        }
      }
      if (initializationReserved) state.pendingInitializations -= 1;
    }
    return;
  }

  if (request.method === "GET" || request.method === "DELETE") {
    if (!sessionId) {
      writeJsonError(response, 400, "MCP session ID is required");
      return;
    }
    const session = state.sessions.get(sessionId);
    if (!session) {
      writeJsonError(response, 404, "MCP session not found");
      return;
    }
    try {
      await useSession(session, () => session.transport.handleRequest(request, response));
    } catch (error) {
      reportHttpFailure(response, error);
    }
    return;
  }

  response.setHeader("allow", "GET, POST, DELETE, OPTIONS");
  writeJsonError(response, 405, "MCP method not allowed");
}

export async function startSignalGrepMcpServer(
  options: SignalGrepMcpHttpOptions = {},
): Promise<RunningSignalGrepMcpServer> {
  const cwd = options.cwd ?? process.cwd();
  const maxSessions = options.maxSessions ?? DEFAULT_MCP_MAX_SESSIONS;
  const idleTimeoutMs = options.sessionIdleTimeoutMs ?? DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1)
    throw new Error("maxSessions must be a positive safe integer");
  if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1)
    throw new Error("sessionIdleTimeoutMs must be a positive safe integer");
  const state: McpSessionState = {
    sessions: new Map(),
    ownedSessions: new Set(),
    maxSessions,
    idleTimeoutMs,
    allowedOrigins: new Set(options.allowedOrigins ?? []),
    cleanupErrors: [],
    pendingInitializations: 0,
    closing: false,
  };
  const createService = options.createService ?? createDefaultSignalGrepMcpService;
  const httpServer = createServer((request, response) => {
    void handleMcpRequest(request, response, state, createService, cwd).catch((error: unknown) => {
      reportHttpFailure(response, error);
    });
  });

  const host = options.host ?? DEFAULT_MCP_HOST;
  const port = options.port ?? DEFAULT_MCP_PORT;
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(port, host);
    });
  } catch (error) {
    state.closing = true;
    throw error;
  }

  const sweepIntervalMs = Math.min(Math.max(Math.floor(idleTimeoutMs / 2), 10), 60_000);
  const sweepTimer = setInterval(() => {
    void sweepIdleSessions(state);
  }, sweepIntervalMs);
  sweepTimer.unref();

  let closePromise: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      state.closing = true;
      clearInterval(sweepTimer);
      const stopListening = new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      const initialCleanup = await Promise.allSettled([
        ...[...state.ownedSessions].map((session) => cleanupOwnedSession(state, session)),
        stopListening,
      ]);
      const finalCleanup = await Promise.allSettled(
        [...state.ownedSessions].map((session) => cleanupOwnedSession(state, session)),
      );
      const errors = [
        ...state.cleanupErrors,
        ...settledErrors(initialCleanup),
        ...settledErrors(finalCleanup),
      ];
      if (errors.length > 0) throw new AggregateError(errors, "MCP server shutdown failed");
    })();
    return closePromise;
  };

  return {
    httpServer,
    cwd,
    close,
  };
}
