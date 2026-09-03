import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readSignalGrepConfig, type SignalGrepConfig } from "./config.js";
import { resolveContextBudget } from "./context-budget.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SignalGrepRuntime } from "./runtime.js";
import { SESSION_STATUS_KEY } from "./session-summary.js";
import { SignalGrepService } from "./service.js";
import {
  MAX_ANY_OF_TERMS,
  MAX_ANY_OF_TOTAL_TERMS,
  MAX_CONFIGURABLE_STRUCTURE_FILES,
  MAX_LITERAL_TERM_BYTES,
  MIN_ANY_OF_TERMS,
} from "./analysis-limits.js";
import {
  MAX_CONTEXT_LINES,
  MAX_INSPECT_TARGETS,
  MAX_PAGE_SIZE,
  MAX_SELECTED_PATHS,
  type SignalGrepDetails,
} from "./types.js";
import { renderSignalGrepCall, renderSignalGrepResult } from "./tui/renderers.js";

const SIGNAL_GREP_LABEL = "Signal Grep";
const SIGNAL_GREP_DESCRIPTION =
  "Search project content with bounded, verifiable evidence. For an ordinary new search, supply pattern and optional path; a zero-result subpath automatically expands to the project root. Use anyOf for an exact multi-term inventory or mode=impact for one symbol's same-spelling and related-test evidence. Normally omit mode and limit. Auto returns small results directly and broad results as file counts plus real samples. Explicit absolute paths and .. traversal may target locations outside cwd, except protected external system areas and .git internals; ordinary Git changes search remains cwd-scoped. If a matching line answers the question, use its path/line citation directly. For missing source context, inspect selected locations in one batch. Inspection has separate parameters: mode plus path/line, cursor/matchIndices, or targets; never include search pattern or context. Coverage dimensions and source changes are explicit.";

export function signalGrepPromptGuidelines(): string[] {
  return [
    `Use signal_grep for content search. Start with pattern and optional path; omit mode and limit to let auto choose a complete small result or a broad summary. Use literal=true for literal code fragments rather than escaping them as regex.`,
    `An omitted path searches the project cwd. If an explicit subpath has zero matches, ordinary and content-analysis searches retry from cwd and return project-wide matches with an expansion notice. Explicit absolute paths and .. traversal can search outside cwd, except protected external system areas and .git internals. Git changes mode remains cwd-scoped.`,
    `For external source navigation, imports/tests/impact use the containing Git repository when one is detected, otherwise the target file's directory.`,
    `Use sufficient exact-match evidence directly; do not inspect or reread it only to obtain a citation, since returned matches already have path/line numbers. When definitions repeat, follow the relevant imports/callers before choosing the authoritative file.`,
    `Use the file samples in signal_grep summaries to choose evidence. Reuse the visible cursor with path or paths for matching lines; mode=summary pages the remaining files. Match counts are not relevance scores.`,
    `When source context is missing, use one signal_grep batch before reading whole files: {mode:"inspect",cursor:"<returned cursor>",matchIndices:[1,2]} or {mode:"inspect",targets:[{path:"src/example.ts",line:42}]}, at most ${String(MAX_INSPECT_TARGETS)} locations. Copy actual returned selectors. Inspection chooses its own bounded window: omit pattern, context, limit, glob, exclude, literal, ignoreCase and hidden.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND, or add within:"function" for own-implementation JS/TS/TSX code. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrences.`,
    `Use anyOf:["term1","term2"] when every exact occurrence of 2-64 literals is needed in one version-bound result. It is case-sensitive, reports retained counts per input term, and runs requests above eight terms as bounded parallel chunks.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted evidence. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"outline" with path to see symbols, mode:"imports" with path and a binding symbol or line to follow static named/default ESM links, and mode:"tests" with path for related test candidates. Import links do not prove runtime calls; test candidates do not prove coverage or passing tests.`,
    `Before changing one known JS/TS/TSX symbol, use mode:"impact" with path plus symbol or line to retrieve the exact target, every exact same-spelling candidate, and related-test evidence together. Same spelling does not prove binding, and returned tests have not been run.`,
    `If inspection reports missing source, execute its complete nextRequest with sourceCursor. Never treat a partial source excerpt as the complete implementation.`,
    `When status=partial, read details.analysis.coverage to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`,
  ];
}

const searchSchema = Type.Object({
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
    StringEnum(["file", "function"] as const, {
      description:
        "Scope for allOf. function requires JS/TS/TSX and counts only that implementation's own code, excluding nested callbacks, strings/comments/types. Not proof of a shared execution path.",
    }),
  ),
  roles: Type.Optional(
    Type.Array(
      StringEnum([
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
      scope: StringEnum(["files", "lines"] as const, {
        description:
          "Search changed files or only changed lines. With allOf every term must lie on the chosen side's changed lines.",
      }),
      side: StringEnum(["new", "old"] as const, {
        description:
          "Choose final/new content or deleted/old content. Historical inspect and continuation remain bound to its commit/blob.",
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
    StringEnum(
      ["auto", "summary", "matches", "inspect", "outline", "imports", "tests", "impact"] as const,
      {
        description:
          "Normally OMIT for new searches (auto). summary explicitly requests a file overview; matches explicitly requests match pages. inspect requires only location selectors, never pattern/context/limit. outline lists JS/TS/TSX symbols; imports follows static ESM binding links; tests finds related test candidates. impact selects one JS/TS/TSX symbol and inventories exact same-spelling candidates plus related-test evidence without claiming binding. Navigation and impact use path with optional line/symbol, or cursor+matchIndex, without search options.",
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

export async function registerSignalGrepExtension(
  pi: ExtensionAPI,
  config: SignalGrepConfig,
): Promise<void> {
  const runtime = new SignalGrepRuntime(
    new SignalGrepService({
      runRipgrep: createRipgrepRunner(),
      structure: createCtagsStructureProvider(),
    }),
  );
  const { locale } = config;

  pi.registerTool<typeof searchSchema, SignalGrepDetails>({
    name: "signal_grep",
    label: SIGNAL_GREP_LABEL,
    description: SIGNAL_GREP_DESCRIPTION,
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: signalGrepPromptGuidelines(),
    parameters: searchSchema,

    renderCall(params, theme) {
      return renderSignalGrepCall(params, locale, theme);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      return renderSignalGrepResult(
        result,
        { expanded, isPartial, isError: context.isError },
        locale,
        theme,
      );
    },

    async execute(...[_toolCallId, params, signal, _onUpdate, ctx]) {
      const result = await runtime.search(
        params,
        ctx.cwd,
        signal,
        resolveContextBudget(ctx.getContextUsage()),
      );
      ctx.ui.setStatus(SESSION_STATUS_KEY, runtime.formatSessionStatus(locale));

      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.shutdown();
    ctx.ui.setStatus(SESSION_STATUS_KEY, undefined);
  });
}

export default async function signalGrepExtension(pi: ExtensionAPI) {
  await registerSignalGrepExtension(pi, await readSignalGrepConfig());
}
