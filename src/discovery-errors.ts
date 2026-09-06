const FILE_DISCOVERY_QUERY_PLACEHOLDER = "<filename-or-path>";

function repairQuery(value: unknown): string {
  return typeof value === "string" &&
    value.length <= 256 &&
    value.isWellFormed() &&
    !/[\r\n\0]/.test(value)
    ? value
    : FILE_DISCOVERY_QUERY_PLACEHOLDER;
}

export function fileDiscoveryQueryHint(value: unknown): string {
  return `file discovery uses query; retry with ${JSON.stringify({ mode: "files", query: repairQuery(value) })}`;
}

export const DISCOVERY_MODE_REQUIRED_ERROR =
  'query requires an explicit discovery mode: use mode=files for filename/path discovery or mode=concept for semantic discovery; for example {"mode":"files","query":"<filename-or-path>"}';
