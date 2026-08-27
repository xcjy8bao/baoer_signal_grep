import { SignalGrepError } from "./errors.js";
import {
  DEFAULT_PAGE_SIZE,
  MAX_CONTEXT_LINES,
  MAX_PAGE_SIZE,
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
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item.length > 0);
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  const candidate = value ?? fallback;
  if (!Number.isFinite(candidate)) throw new SignalGrepError(`${field} must be finite`);
  return Math.min(maximum, Math.max(minimum, Math.floor(candidate)));
}

export function normalizeRequest(input: RawSearchInput): SearchRequest {
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
  };
}
