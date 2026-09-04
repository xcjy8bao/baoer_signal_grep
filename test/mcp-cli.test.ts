import { describe, expect, test } from "bun:test";
import { BAOER_SIGNAL_GREP_MCP_USAGE, parseSignalGrepMcpTransport } from "../src/mcp-cli.js";

describe("baoer_signal_grep MCP CLI", () => {
  test("selects the HTTP default and explicit transports", () => {
    expect(parseSignalGrepMcpTransport([])).toBe("http");
    expect(parseSignalGrepMcpTransport(["--http"])).toBe("http");
    expect(parseSignalGrepMcpTransport(["--stdio"])).toBe("stdio");
  });

  test("recognizes both help forms", () => {
    expect(parseSignalGrepMcpTransport(["--help"])).toBe("help");
    expect(parseSignalGrepMcpTransport(["-h"])).toBe("help");
    expect(BAOER_SIGNAL_GREP_MCP_USAGE).toContain("baoer_signal_grep_mcp");
  });

  test("rejects unknown or combined arguments", () => {
    expect(() => parseSignalGrepMcpTransport(["--unknown"])).toThrow(
      "Unknown arguments: --unknown",
    );
    expect(() => parseSignalGrepMcpTransport(["--http", "--stdio"])).toThrow(
      BAOER_SIGNAL_GREP_MCP_USAGE,
    );
  });
});
