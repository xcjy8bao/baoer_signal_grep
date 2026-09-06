import { SignalGrepError } from "./errors.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_CONTEXT_LINES,
  MAX_PAGE_SIZE,
  MAX_FILE_FILTER_ITEMS,
  MAX_PATH_CHARACTERS,
  MAX_PATTERN_CHARACTERS,
  type SearchRequest,
} from "./types.js";

export interface RawSearchInput {
  pattern?: string;
  path?: string;
  glob?: string | string[];
  exclude?: string | string[];
  literal?: boolean;
  ignoreCase?: boolean;
  hidden?: boolean;
  context?: number;
  limit?: number;
  redact?: boolean;
  scope?: "strict" | "expand";
  wholeWord?: boolean;
  modifiedAfter?: number;
  modifiedBefore?: number;
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item.length > 0);
}

function validateText(
  value: string,
  field: string,
  maxCharacters: number,
  singleLine = false,
): void {
  if (!value.isWellFormed() || /\0/.test(value) || (singleLine && /[\r\n]/.test(value)))
    throw new SignalGrepError(`${field} must be well-formed text without NUL or line breaks`);
  if (value.length > maxCharacters)
    throw new SignalGrepError(
      `${field} is too long (maximum ${String(maxCharacters)} characters); use a shorter value or a narrower working directory`,
    );
}

export function validateSearchPath(value: string, field = "path"): void {
  validateText(value.replace(/^@/, ""), field, MAX_PATH_CHARACTERS, true);
}

/** Validate input before any filesystem or subprocess boundary is reached. */
export function validateRawSearchInput(input: RawSearchInput): void {
  if (input.pattern !== undefined) validateText(input.pattern, "pattern", MAX_PATTERN_CHARACTERS);
  if (input.path !== undefined) {
    validateSearchPath(input.path);
  }
  for (const [field, value] of [
    ["glob", input.glob],
    ["exclude", input.exclude],
  ] as const) {
    const values = list(value);
    if (values.length > MAX_FILE_FILTER_ITEMS)
      throw new SignalGrepError(
        `${field} accepts at most ${String(MAX_FILE_FILTER_ITEMS)} entries`,
      );
    values.forEach((item) => validateText(item, field, MAX_PATH_CHARACTERS, true));
  }
  for (const [field, value] of [
    ["modifiedAfter", input.modifiedAfter],
    ["modifiedBefore", input.modifiedBefore],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new SignalGrepError(`${field} must be a non-negative Unix timestamp in milliseconds`);
  }
  if (
    input.modifiedAfter !== undefined &&
    input.modifiedBefore !== undefined &&
    input.modifiedAfter > input.modifiedBefore
  )
    throw new SignalGrepError("modifiedAfter must be earlier than or equal to modifiedBefore");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new SignalGrepError(
      `${field} must be an integer from ${String(minimum)} through ${String(maximum)}`,
    );
  }
  return candidate;
}

export function normalizeRequest(input: RawSearchInput): SearchRequest {
  validateRawSearchInput(input);
  if (input.scope !== undefined && input.scope !== "strict" && input.scope !== "expand")
    throw new SignalGrepError("scope must be strict or expand");
  const pattern = input.pattern;
  if (pattern === undefined) {
    throw new SignalGrepError("pattern is required when cursor is not provided");
  }

  const path = input.path?.replace(/^@/, "");
  return {
    pattern,
    ...(path ? { path } : {}),
    glob: list(input.glob),
    exclude: list(input.exclude),
    literal: input.literal ?? false,
    ...(input.ignoreCase === undefined ? {} : { ignoreCase: input.ignoreCase }),
    hidden: input.hidden ?? true,
    context: boundedInteger(input.context, 0, 0, MAX_CONTEXT_LINES, "context"),
    pageSize: boundedInteger(input.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, "limit"),
    redact: input.redact ?? false,
    ...(input.modifiedAfter !== undefined ? { modifiedAfterMs: input.modifiedAfter } : {}),
    ...(input.modifiedBefore !== undefined ? { modifiedBeforeMs: input.modifiedBefore } : {}),
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.wholeWord !== undefined ? { wholeWord: input.wholeWord } : {}),
  };
}
