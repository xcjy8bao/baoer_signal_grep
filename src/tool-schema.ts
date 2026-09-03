import { Type } from "typebox";
import {
  MAX_ANY_OF_TOTAL_TERMS,
  MAX_ANY_OF_TERMS,
  MAX_CONFIGURABLE_STRUCTURE_FILES,
  MAX_LITERAL_TERM_BYTES,
  MIN_ANY_OF_TERMS,
} from "./analysis-limits.js";
import {
  MAX_CONTEXT_LINES,
  MAX_INSPECT_TARGETS,
  MAX_PAGE_SIZE,
  MAX_SELECTED_PATHS,
} from "./types.js";

function stringEnum<const Values extends readonly string[]>(
  values: Values,
  options?: { description?: string },
) {
  return Type.Unsafe<Values[number]>({
    type: "string",
    enum: values,
    ...(options?.description ? { description: options.description } : {}),
  });
}

export const SIGNAL_GREP_DESCRIPTION =
  "Search project content with bounded, verifiable evidence. For an ordinary new search, supply pattern and optional path; a zero-result subpath automatically expands to the project root. Use anyOf for an exact multi-term inventory or mode=impact for one symbol's same-spelling and related-test evidence. Normally omit mode and limit. Auto returns small results directly and broad results as file counts plus real samples. Explicit absolute paths and .. traversal may target locations outside cwd, except protected external system areas and .git internals; ordinary Git changes search remains cwd-scoped. If a matching line answers the question, use its path/line citation directly. For missing source context, inspect selected locations in one batch. Inspection has separate parameters: mode plus path/line, cursor/matchIndices, or targets; never include search pattern or context. Coverage dimensions and source changes are explicit.";

export const signalGrepSchema = Type.Object({
  anyOf: Type.Optional(
    Type.Array(Type.String({ maxLength: MAX_LITERAL_TERM_BYTES }), {
      minItems: MIN_ANY_OF_TERMS,
      maxItems: MAX_ANY_OF_TOTAL_TERMS,
      description: `Exact literal union: ${String(MIN_ANY_OF_TERMS)}-${String(MAX_ANY_OF_TOTAL_TERMS)} distinct case-sensitive single-line terms, at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes each. Requests above ${String(MAX_ANY_OF_TERMS)} terms are split into version-checked chunks and merged. Returns every retained occurrence attributed to its term. Omit pattern, allOf, within, roles, literal and ignoreCase.`,
    }),
  ),
  allOf: Type.Optional(
    Type.Array(Type.String(), {
      minItems: 2,
      maxItems: 3,
      description:
        "Explicit AND: 2-3 distinct case-sensitive literal terms, all in one file (default) or one function. Omit pattern, roles, literal and ignoreCase.",
    }),
  ),
  within: Type.Optional(
    stringEnum(["file", "function"] as const, {
      description:
        "Scope for allOf. function requires JS/TS/TSX and counts only that implementation's own code, excluding nested callbacks, strings/comments/types. Not proof of a shared execution path.",
    }),
  ),
  roles: Type.Optional(
    Type.Array(
      stringEnum([
        "declaration",
        "call",
        "import",
        "export",
        "comment",
        "string",
        "jsx-text",
        "code",
        "unknown",
      ] as const),
      {
        minItems: 1,
        description:
          "Filter each single-pattern occurrence by syntax role (JS/TS/TSX/Go). Roles may be candidates, especially Go call/conversion ambiguity. Cannot combine with allOf.",
      },
    ),
  ),
  changes: Type.Optional(
    Type.Object({
      base: Type.Optional(
        Type.String({
          description: "Git base commit/ref; default HEAD, pinned to a commit at query time.",
        }),
      ),
      target: Type.Optional(
        Type.String({
          description:
            "Optional target commit/ref. Omit for final working-tree contents including unignored untracked files, not just the staged index.",
        }),
      ),
      scope: stringEnum(["files", "lines"] as const, {
        description:
          "Search changed files or only changed lines. With allOf every term must lie on the chosen side's changed lines.",
      }),
      side: stringEnum(["new", "old"] as const, {
        description:
          "Choose final/new content or deleted/old content. Historical inspect and continuation remain bound to that commit/blob.",
      }),
    }),
  ),
  sourceCursor: Type.Optional(
    Type.String({
      description:
        "Missing-source continuation token. Copy nextRequest exactly: mode=inspect plus sourceCursor only. Same token replays the same page; changed or expired sources fail clearly.",
    }),
  ),
  symbol: Type.Optional(
    Type.String({
      description:
        "Optional binding name for imports or tests navigation, or an exact impact target name; never a whole-program call graph.",
    }),
  ),
  pattern: Type.Optional(
    Type.String({
      description:
        "New search only: regex, or plain text with literal=true. Required for ordinary search; use allOf for explicit AND or anyOf for an exact literal union. Omit for inspect, outline, imports, tests, impact and cursor continuation.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description:
        "Search root or inspection file. A zero-result search root is retried from project cwd. Absolute paths and .. traversal may resolve outside cwd, except protected external system areas and .git internals; Git changes mode remains cwd-scoped.",
    }),
  ),
  paths: Type.Optional(
    Type.Array(Type.String(), {
      minItems: 1,
      maxItems: MAX_SELECTED_PATHS,
      description:
        "Exact retained files to select together from a cursor; unavailable for a new search.",
    }),
  ),
  glob: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description: "Include glob or globs, for example '*.ts' or 'src/**'.",
    }),
  ),
  exclude: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description: "Exclude glob or globs. A leading ! is optional.",
    }),
  ),
  literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal text." })),
  ignoreCase: Type.Optional(
    Type.Boolean({
      description: "true for insensitive, false for sensitive; omitted uses smart-case.",
    }),
  ),
  hidden: Type.Optional(
    Type.Boolean({ description: "Search hidden files (default true; .git is always excluded)." }),
  ),
  redact: Type.Optional(
    Type.Boolean({
      description:
        "Optional display-only masking for credential-like values and private-key bodies. Default false. It never changes searched files, admitted matches, counts, or cursor completeness.",
    }),
  ),
  maxFilesToParse: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_CONFIGURABLE_STRUCTURE_FILES,
      description: `Maximum source files parsed by one structural analysis request (default 200, max ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}). Candidate discovery still searches the full requested scope.`,
    }),
  ),
  context: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: MAX_CONTEXT_LINES,
      description:
        "New search only: nearby lines (0-20). MUST be omitted for inspect, which selects its own bounded source window.",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_PAGE_SIZE,
      description:
        "New search only: explicit detail-page match limit (max 100). Normally omit to preserve automatic summarization; not valid for inspect.",
    }),
  ),
  mode: Type.Optional(
    stringEnum(
      ["auto", "summary", "matches", "inspect", "outline", "imports", "tests", "impact"] as const,
      {
        description:
          "Normally OMIT for new searches (auto). summary explicitly requests a file overview; matches explicitly requests match pages. inspect requires only location selectors, never pattern/context/limit. outline lists JS/TS/TSX symbols; imports follows static ESM binding links; tests finds related test candidates. impact selects one JS/TS/TSX symbol and inventories exact same-spelling candidates and related-test evidence without claiming binding. Navigation and impact use path with optional line/symbol, or cursor+matchIndex, without search options.",
      },
    ),
  ),
  line: Type.Optional(
    Type.Number({
      description:
        "1-indexed source line for path inspection/navigation/impact. Omit with matchIndex, matchIndices or targets.",
    }),
  ),
  matchIndex: Type.Optional(
    Type.Number({
      description:
        "1-based retained match index for cursor-scoped inspect; replaces path and line.",
    }),
  ),
  matchIndices: Type.Optional(
    Type.Array(Type.Integer({ minimum: 1 }), {
      minItems: 1,
      maxItems: MAX_INSPECT_TARGETS,
      description:
        "Inspect up to five visible match numbers together using the same cursor; mutually exclusive with matchIndex, path, line and targets.",
    }),
  ),
  targets: Type.Optional(
    Type.Array(Type.Object({ path: Type.String(), line: Type.Integer({ minimum: 1 }) }), {
      minItems: 1,
      maxItems: MAX_INSPECT_TARGETS,
      description:
        "Inspect known path/line locations together without a cursor. The complete batch shares one 16 KiB response budget.",
    }),
  ),
  cursor: Type.Optional(
    Type.String({ description: "Opaque cursor from a previous stable search snapshot." }),
  ),
});
