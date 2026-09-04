import type { Readable, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createDefaultSignalGrepMcpService,
  createSignalGrepMcpServer,
  type SignalGrepMcpService,
} from "./mcp.js";

export interface SignalGrepMcpStdioOptions {
  cwd?: string;
  input?: Readable;
  output?: Writable;
  createService?: () => SignalGrepMcpService;
}

export interface RunningSignalGrepMcpStdioServer {
  readonly cwd: string;
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

function rejectedReasons(results: readonly PromiseSettledResult<unknown>[]): unknown[] {
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}

export async function startSignalGrepMcpStdioServer(
  options: SignalGrepMcpStdioOptions = {},
): Promise<RunningSignalGrepMcpStdioServer> {
  const cwd = options.cwd ?? process.cwd();
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const service = (options.createService ?? createDefaultSignalGrepMcpService)();
  const protocol = createSignalGrepMcpServer(service, cwd);

  const lifecycle = Promise.withResolvers<void>();
  let closePromise: Promise<void> | undefined;
  let transportFailure: Error | undefined;
  const requestClose = (): void => {
    void close();
  };
  const requestFailure = (error: Error): void => {
    transportFailure ??= error;
    void close();
  };
  const removeLifecycleListeners = (): void => {
    input.off("end", requestClose);
    input.off("close", requestClose);
    input.off("error", requestFailure);
    output.off("error", requestFailure);
  };
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    input.off("end", requestClose);
    input.off("close", requestClose);
    closePromise = lifecycle.promise;
    const performClose = async (): Promise<void> => {
      const cleanupErrors = rejectedReasons(
        await Promise.allSettled([protocol.close(), service.shutdown()]),
      );
      removeLifecycleListeners();
      const errors = transportFailure ? [transportFailure, ...cleanupErrors] : cleanupErrors;
      if (errors.length > 0) {
        lifecycle.reject(
          new AggregateError(
            errors,
            transportFailure ? "MCP stdio transport failed" : "MCP stdio shutdown failed",
          ),
        );
      } else {
        lifecycle.resolve();
      }
    };
    void performClose();
    return closePromise;
  };

  const transport = new StdioServerTransport(input, output);
  try {
    // The upstream transport exposes a callback property rather than an EventTarget API.
    if (!Reflect.set(transport, "onclose", requestClose)) {
      throw new Error("Unable to attach the MCP stdio close handler");
    }
    input.once("end", requestClose);
    input.once("close", requestClose);
    input.once("error", requestFailure);
    output.once("error", requestFailure);
    await protocol.connect(transport);
  } catch (error) {
    let cleanupFailure: Error | undefined;
    try {
      await close();
    } catch (closeError) {
      cleanupFailure =
        closeError instanceof Error
          ? closeError
          : new Error("MCP stdio startup cleanup failed", { cause: closeError });
    }
    if (cleanupFailure) {
      throw new AggregateError([error, cleanupFailure], "MCP stdio startup failed", {
        cause: error,
      });
    }
    throw error;
  }

  return { cwd, closed: lifecycle.promise, close };
}
