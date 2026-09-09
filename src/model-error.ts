import { types } from "node:util";

const MAX_RAW_ERROR_SCAN_CHARACTERS = 4_096;
const MAX_MODEL_ERROR_CHARACTERS = 1_024;
const MODEL_ERROR_PREFIX = "baoer_signal_grep failed:";

function errorMessage(error: unknown): string {
  try {
    if (types.isNativeError(error)) {
      const message = Object.getOwnPropertyDescriptor(error, "message");
      if (!message) return "unknown failure";
      return typeof message.value === "string" ? message.value : "unreadable failure";
    }
    if (error === null) return "null";
    switch (typeof error) {
      case "string":
        return error;
      case "number":
        return String(error);
      case "boolean":
        return error ? "true" : "false";
      case "undefined":
        return "undefined";
      case "bigint":
        return "bigint failure";
      case "symbol":
        return "symbol failure";
      case "function":
      case "object":
        return "non-error failure";
      default:
        return "unreadable failure";
    }
  } catch {
    return "unreadable failure";
  }
}

/** One bounded model-facing diagnostic; never serialize causes, stacks, or repeated request text. */
export function modelErrorText(error: unknown): string {
  const raw = errorMessage(error);
  const normalized = raw
    .slice(0, MAX_RAW_ERROR_SCAN_CHARACTERS)
    .toWellFormed()
    .replace(/\s+/gu, " ")
    .trim();
  const message =
    normalized.replace(/^(?:baoer_signal_grep failed:\s*)+/u, "") || "unknown failure";
  const text = `${MODEL_ERROR_PREFIX} ${message}`;
  if (text.length <= MAX_MODEL_ERROR_CHARACTERS) return text;
  return `${text.slice(0, MAX_MODEL_ERROR_CHARACTERS - 1).toWellFormed()}…`;
}
