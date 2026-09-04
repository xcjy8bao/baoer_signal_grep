import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { SignalGrepMcpService } from "../src/mcp.js";
import { startSignalGrepMcpStdioServer } from "../src/mcp-stdio.js";

function idleService(onShutdown: () => void): SignalGrepMcpService {
  return {
    async search() {
      throw new Error("Search was not expected");
    },
    async shutdown() {
      onShutdown();
    },
  };
}

describe("baoer_signal_grep MCP stdio lifecycle", () => {
  test("closes once when input ends and keeps close idempotent", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let shutdowns = 0;
    const running = await startSignalGrepMcpStdioServer({
      cwd: "/stdio-project",
      input,
      output,
      createService: () => idleService(() => shutdowns++),
    });

    expect(running.cwd).toBe("/stdio-project");
    input.end();
    await running.closed;
    await running.close();
    expect(shutdowns).toBe(1);
  }, 10_000);

  test("reports service cleanup failure", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const running = await startSignalGrepMcpStdioServer({
      input,
      output,
      createService: () => ({
        async search() {
          throw new Error("Search was not expected");
        },
        async shutdown() {
          throw new Error("cleanup sentinel");
        },
      }),
    });

    const close = running.close();
    expect(close).toBe(running.closed);
    const failure = await close.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(String(failure)).toContain("MCP stdio shutdown failed");
  }, 10_000);

  test("reports output transport failure and still shuts down", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let shutdowns = 0;
    const running = await startSignalGrepMcpStdioServer({
      input,
      output,
      createService: () => idleService(() => shutdowns++),
    });

    output.emit("error", new Error("output sentinel"));
    const failure = await running.closed.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(String(failure)).toContain("MCP stdio transport failed");
    expect(shutdowns).toBe(1);
  }, 10_000);
});
