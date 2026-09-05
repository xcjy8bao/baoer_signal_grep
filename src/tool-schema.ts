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
  "Search and navigate code with bounded, verifiable evidence. Ordinary pattern searches use auto detail/summary; scope=strict prevents zero-result path expansion and wholeWord requires word boundaries. files+query discovers filenames; structure+pattern matches AST shapes. JS/TS definitions, references, implementations, callers and callees use path+line+column (1-based UTF-16) or an unambiguous symbol. dependencies/dependents use a workspace file path and the compiler's project module resolution. impact combines compiler-confirmed candidate references, same-spelling candidates and related-test evidence. concept+query ranks local multilingual model candidates after explicit model installation; it never downloads a model during search. Compiler relationships are static, not runtime proof. Use returned path/line evidence directly, or copy inspection/continuation requests when more context is needed. Limits, source changes, ranking reasons and partial coverage are explicit.";

export const signalGrepSchema = Type.Object({
  column: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "1-based UTF-16 column for exact compiler navigation; requires path and line.",
    }),
  ),
  query: Type.Optional(
    Type.String({
      maxLength: 256,
      description:
        "With mode=files, a filename/path/fuzzy query (optional); with mode=concept, a required natural-language question. Both preserve their requested path. Concept requires an explicitly installed local model.",
    }),
  ),
  scope: Type.Optional(
    stringEnum(["strict", "expand"] as const, {
      description:
        "Content search scope: strict never expands a zero-result path; expand (default) retries from project cwd. Applies to ordinary, multi-term and role searches.",
    }),
  ),
  wholeWord: Type.Optional(
    Type.Boolean({
      description:
        "Single-pattern search only: require ripgrep Unicode word boundaries around the match. Works with regex or literal=true.",
    }),
  ),
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
        "Binding name for imports/tests/impact; semantic modes accept it only when it identifies one source occurrence. Prefer exact path+line+column when the name repeats.",
    }),
  ),
  pattern: Type.Optional(
    Type.String({
      description:
        "Ordinary search: regex or literal=true text. mode=structure: ast-grep code pattern, at most 4 KiB, including $NAME and $$$ARGS metavariables; no regex/literal options. Omit for discovery, semantic navigation, inspection and cursors.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description:
        "Search root or source file. A zero-result content search expands from cwd unless scope=strict. Compiler navigation stays within admitted workspace sources. Absolute paths and .. traversal may resolve outside cwd, except protected external system areas and .git internals; Git changes mode remains cwd-scoped.",
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
      description:
        "Exclude file/path globs (not content negation); applied after include globs. A leading ! is optional.",
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
      [
        "auto",
        "summary",
        "matches",
        "inspect",
        "outline",
        "imports",
        "tests",
        "impact",
        "files",
        "structure",
        "concept",
        "definitions",
        "references",
        "implementations",
        "callers",
        "callees",
        "dependencies",
        "dependents",
      ] as const,
      {
        description:
          "Ordinary search defaults to auto; summary/matches request explicit pages. files uses query, structure uses an AST pattern, concept uses natural-language query. definitions/references/implementations/callers/callees require a workspace path and exact line+column or unique symbol; dependencies/dependents require only a workspace file path. inspect/outline/imports/tests/impact retain their documented location selectors. Compiler results are static evidence; concept and related-test results remain candidates.",
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
