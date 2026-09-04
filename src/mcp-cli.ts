export type SignalGrepMcpTransport = "http" | "stdio";

export const BAOER_SIGNAL_GREP_MCP_USAGE = `Usage: baoer_signal_grep_mcp [--http | --stdio]

Transports:
  --http   Start the Streamable HTTP server (default)
  --stdio  Serve one local MCP client over stdin/stdout
`;

export function parseSignalGrepMcpTransport(
  arguments_: readonly string[],
): SignalGrepMcpTransport | "help" {
  if (arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === "--http")) {
    return "http";
  }
  if (arguments_.length === 1 && arguments_[0] === "--stdio") return "stdio";
  if (arguments_.length === 1 && (arguments_[0] === "--help" || arguments_[0] === "-h")) {
    return "help";
  }
  throw new Error(`Unknown arguments: ${arguments_.join(" ")}\n${BAOER_SIGNAL_GREP_MCP_USAGE}`);
}
