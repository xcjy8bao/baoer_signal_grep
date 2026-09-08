import { Type } from "typebox";
import {
  MAX_ANY_OF_TOTAL_TERMS,
  MAX_ANY_OF_TERMS,
  MAX_CONFIGURABLE_STRUCTURE_FILES,
  DEFAULT_HYBRID_CONCEPT_LIMIT,
  MAX_HYBRID_CONCEPT_LIMIT,
  MAX_LITERAL_TERM_BYTES,
  MIN_ANY_OF_TERMS,
} from "./analysis-limits.js";
import {
  MAX_CONTEXT_LINES,
  MAX_INSPECT_TARGETS,
  MAX_PAGE_SIZE,
  MAX_SELECTED_PATHS,
  MAX_FILE_FILTER_ITEMS,
  MAX_PATH_CHARACTERS,
  MAX_PATTERN_CHARACTERS,
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
  "Search and navigate code with bounded, verifiable evidence. Ordinary pattern searches use auto detail/summary; scope=strict prevents zero-result path expansion and wholeWord requires word boundaries. mode=concept accepts query, path, glob, exclude, hidden and redact, and exposes a same-query scoreProfile without deciding relevance thresholds. mode=hybrid always runs exact literal and local concept retrieval once, ranks exact evidence first, deduplicates overlapping semantic passages, and retains a bounded semantic supplement in one pageable snapshot. allOf is a 2-3 term literal conjunction; within is valid only with allOf and must be omitted for ordinary single-pattern searches. modifiedAfter/modifiedBefore filter worktree files by inclusive/exclusive modification-time bounds in Unix milliseconds. files+query discovers filenames and stays inside the requested path; structure+pattern matches AST shapes. Python outline is supported as bounded indentation-based function/class evidence; JS/TS definitions, references, implementations, callers and callees use path+line+column (1-based UTF-16) or an unambiguous symbol. dependencies/dependents use a workspace file path and the compiler's project module resolution. impact combines compiler-confirmed candidate bindings, exact occurrences and related-test candidates without running tests; all analysis is static evidence, and partial coverage stays explicit.";

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
        "With mode=files, a filename/path/fuzzy query (optional); with mode=concept or hybrid, a required natural-language question. Hybrid uses the same query as exact literal text and as the local concept query. Discovery modes preserve their requested path. Concept and hybrid require an explicitly installed local model.",
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
    Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
      minItems: 2,
      maxItems: 3,
      description:
        "Explicit AND: 2-3 distinct case-sensitive literal terms, all in one file (default) or one function. Omit pattern, roles, literal and ignoreCase.",
    }),
  ),
  within: Type.Optional(
    stringEnum(["file", "function"] as const, {
      description:
        "Only valid with allOf; omit for ordinary single-pattern searches. function requires JS/TS/TSX and counts only that implementation's own code, excluding nested callbacks, strings/comments/types. Not proof of a shared execution path.",
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
      maxLength: MAX_PATTERN_CHARACTERS,
      description:
        "Ordinary search: regex or literal=true text. mode=structure: ast-grep code pattern, at most 4 KiB, including $NAME and $$$ARGS metavariables; no regex/literal options. Omit for discovery, semantic navigation, inspection and cursors.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      maxLength: MAX_PATH_CHARACTERS,
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
    Type.Union(
      [
        Type.String({ maxLength: MAX_PATH_CHARACTERS }),
        Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
          maxItems: MAX_FILE_FILTER_ITEMS,
        }),
      ],
      {
        description: "Include glob or globs, for example '*.ts' or 'src/**'.",
      },
    ),
  ),
  exclude: Type.Optional(
    Type.Union(
      [
        Type.String({ maxLength: MAX_PATH_CHARACTERS }),
        Type.Array(Type.String({ maxLength: MAX_PATH_CHARACTERS }), {
          maxItems: MAX_FILE_FILTER_ITEMS,
        }),
      ],
      {
        description:
          "Exclude file/path globs (not content negation); applied after include globs. A leading ! is optional.",
      },
    ),
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
  modifiedAfter: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description:
        "Worktree modification-time lower bound, inclusive, as a Unix timestamp in milliseconds. Not valid with Git changes.",
    }),
  ),
  modifiedBefore: Type.Optional(
    Type.Integer({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      description:
        "Worktree modification-time upper bound, exclusive, as a Unix timestamp in milliseconds. Not valid with Git changes.",
    }),
  ),
  maxFilesToParse: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_CONFIGURABLE_STRUCTURE_FILES,
      description: `Maximum source files parsed by one structural analysis request (default 200, max ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}). Candidate discovery still searches the full requested scope.`,
    }),
  ),
  conceptLimit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_HYBRID_CONCEPT_LIMIT,
      description: `mode=hybrid only: retain the top semantic candidates after overlap deduplication (default ${String(DEFAULT_HYBRID_CONCEPT_LIMIT)}, max ${String(MAX_HYBRID_CONCEPT_LIMIT)}). Literal evidence has an independent retention budget and is never displaced by this limit.`,
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
        "hybrid",
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
          "Ordinary search defaults to auto; summary/matches request explicit pages. files uses query, structure uses an AST pattern, concept uses natural-language query, and hybrid uses one query for exact literal plus concept evidence in a single snapshot. definitions/references/implementations/callers/callees require a workspace path and exact line+column or unique symbol; dependencies/dependents require only a workspace file path. inspect/outline/imports/tests/impact retain their documented location selectors. tests supports JS/TS/TSX sources; Python supports outline, not related-test navigation. Compiler results are static evidence; concept and related-test results remain candidates.",
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
    Type.Array(
      Type.Object({
        path: Type.String({ maxLength: MAX_PATH_CHARACTERS }),
        line: Type.Integer({ minimum: 1 }),
      }),
      {
        minItems: 1,
        maxItems: MAX_INSPECT_TARGETS,
        description:
          "Inspect known path/line locations together without a cursor. The complete batch shares one 16 KiB response budget.",
      },
    ),
  ),
  cursor: Type.Optional(
    Type.String({ description: "Opaque cursor from a previous stable search snapshot." }),
  ),
});
