export const DEFAULT_MCP_OUTPUT_MODE = "structured";

export type SignalGrepMcpOutputMode = "structured" | "text" | "model";

export function parseSignalGrepMcpOutputMode(value: string | undefined): SignalGrepMcpOutputMode {
  if (value === undefined || value === DEFAULT_MCP_OUTPUT_MODE) return DEFAULT_MCP_OUTPUT_MODE;
  if (value === "text" || value === "model") return value;
  throw new Error('BAOER_SIGNAL_GREP_MCP_OUTPUT_MODE must be "structured", "text", or "model"');
}
