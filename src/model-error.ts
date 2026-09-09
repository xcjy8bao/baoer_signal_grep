const MAX_MODEL_ERROR_CHARACTERS = 1_024;
const MODEL_ERROR_PREFIX = "baoer_signal_grep failed:";

function errorMessage(error: unknown): string {
  try {
    const value: unknown = error instanceof Error ? error.message : error;
    return String(value);
  } catch {
    return "unreadable failure";
  }
}

/** One bounded model-facing diagnostic; never serialize causes, stacks, or repeated request text. */
export function modelErrorText(error: unknown): string {
  const normalized = errorMessage(error).replace(/\s+/gu, " ").trim();
  const message =
    normalized.replace(/^(?:baoer_signal_grep failed:\s*)+/u, "") || "unknown failure";
  const text = `${MODEL_ERROR_PREFIX} ${message}`;
  if (text.length <= MAX_MODEL_ERROR_CHARACTERS) return text;
  return `${text.slice(0, MAX_MODEL_ERROR_CHARACTERS - 1).toWellFormed()}…`;
}
