import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  CONFLICT_DETECTION_FAILED,
  detectGrepOwnerConflict,
  HASHLINE_PACKAGE,
} from "./conflicts.js";
export { grepOverrideConflictSource } from "./conflicts.js";
import { readSignalGrepConfig, type SignalGrepConfig } from "./config.js";
import { resolveContextBudget } from "./context-budget.js";
import { formatMetricsStatus, registerSignalGrepControls } from "./extension-controls.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { METRICS_STATUS_KEY, SignalGrepRuntime } from "./runtime.js";
import { type SignalGrepInput, SignalGrepService } from "./service.js";
import { MAX_INSPECT_TARGETS, MAX_SELECTED_PATHS, type SignalGrepDetails } from "./types.js";
import { renderSignalGrepCall, renderSignalGrepResult } from "./tui/renderers.js";

const SIGNAL_GREP_LABEL = "Signal Grep";
const SIGNAL_GREP_DESCRIPTION =
  "Search code with bounded, verifiable evidence. For a new search, supply pattern and optional path; normally omit mode and limit. Auto returns small results directly and broad results as file counts plus real samples. If a matching line answers the question, use its path/line citation directly. For missing source context, inspect selected locations in one batch. Inspection has separate parameters: mode plus path/line, cursor/matchIndices, or targets; never include search pattern or context. Partial evidence and source changes are explicit.";

export interface SignalGrepExtensionOptions {
  /** Overrides the Pi agent directory used for package conflict detection and config writes (test seam). */
  agentDir?: string;
  /** Overrides conflict detection entirely (test seam). */
  detectConflict?: () => Promise<string | undefined>;
}

export function signalGrepPromptGuidelines(
  toolName: "grep" | "signal_grep",
  grepOwnerPackage?: string,
): string[] {
  const guidelines = [
    `Use ${toolName} for content search. Start with pattern and optional path; omit mode and limit to let auto choose a complete small result or a broad summary. Use literal=true for literal code fragments rather than escaping them as regex.`,
    `Use sufficient exact-match evidence directly; do not inspect or reread it only to obtain a citation, since returned matches already have path/line numbers. When definitions repeat, follow the relevant imports/callers before choosing the authoritative file.`,
    `Use the file samples in ${toolName} summaries to choose evidence. Reuse the visible cursor with path or paths for matching lines; mode=summary pages the remaining files. Match counts are not relevance scores.`,
    `When source context is missing, use one ${toolName} batch before reading whole files: {mode:"inspect",cursor:"<returned cursor>",matchIndices:[1,2]} or {mode:"inspect",targets:[{path:"src/example.ts",line:42}]}, at most ${String(MAX_INSPECT_TARGETS)} locations. Copy actual returned selectors. Inspection chooses its own bounded window: omit pattern, context, limit, glob, exclude, literal, ignoreCase and hidden.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND, or add within:"function" for own-implementation JS/TS/TSX code. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrences.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted evidence. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"outline" with path to see symbols, mode:"imports" with path and a binding symbol or line to follow static named/default ESM links, and mode:"tests" with path for related test candidates. Import links do not prove runtime calls; test candidates do not prove coverage or passing tests.`,
    `If inspection reports missing source, execute its complete nextRequest with sourceCursor. Never treat a partial source excerpt as the complete implementation.`,
    `Treat ${toolName} status=partial as incomplete and narrow the query before drawing conclusions.`,
  ];
  if (grepOwnerPackage === HASHLINE_PACKAGE) {
    guidelines.push(
      `Before editing a location found by ${toolName}, use ${HASHLINE_PACKAGE}'s grep or read tool to obtain served anchors; ${toolName} evidence is not imported into its edit state.`,
    );
  }
  return guidelines;
}

const searchSchema = Type.Object({
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
        "Optional binding name for imports or tests navigation; never a whole-program call graph.",
    }),
  ),
  pattern: Type.Optional(
    Type.String({
      description:
        "New search only: regex, or plain text with literal=true. Required for ordinary search; use allOf instead for explicit AND. Omit for inspect, outline, imports, tests and cursor continuation.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description: "Working-directory-relative search root, or the file to inspect with line.",
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
      description:
        "true for insensitive, false for sensitive; omitted uses smart-case in additive mode and built-in case-sensitive behavior in override mode.",
    }),
  ),
  hidden: Type.Optional(
    Type.Boolean({ description: "Search hidden files (default true; .git is always excluded)." }),
  ),
  context: Type.Optional(
    Type.Number({
      description:
        "New search only: nearby lines (0-20). MUST be omitted for inspect, which selects its own bounded source window.",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description:
        "New search only: explicit detail-page match limit (max 100). Normally omit to preserve automatic summarization; not valid for inspect.",
    }),
  ),
  mode: Type.Optional(
    StringEnum(["auto", "summary", "matches", "inspect", "outline", "imports", "tests"] as const, {
      description:
        "Normally OMIT for new searches (auto). summary explicitly requests a file overview; matches explicitly requests match pages. inspect requires only location selectors, never pattern/context/limit. outline lists JS/TS/TSX symbols; imports follows static ESM binding links; tests finds related test candidates. These three use path, optional line/symbol, or cursor+matchIndex, without search options.",
    }),
  ),
  line: Type.Optional(
    Type.Number({
      description:
        "1-indexed source line for path+line inspection only. Omit with matchIndex, matchIndices or targets.",
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

type OverrideConfig = Pick<SignalGrepConfig, "overrideBuiltinGrep">;

export function signalGrepToolName(config: OverrideConfig): "grep" | "signal_grep" {
  return config.overrideBuiltinGrep ? "grep" : "signal_grep";
}

export function effectiveSignalGrepInput(
  input: SignalGrepInput,
  config: OverrideConfig,
  overrideActive: boolean = config.overrideBuiltinGrep,
): SignalGrepInput {
  if (
    !overrideActive ||
    input.mode === "inspect" ||
    input.mode === "outline" ||
    input.mode === "imports" ||
    input.mode === "tests" ||
    input.allOf !== undefined ||
    input.cursor ||
    input.ignoreCase !== undefined
  )
    return input;
  return { ...input, ignoreCase: false };
}

/**
 * Resolve whether Signal Grep override mode can actually own "grep" in this
 * session. Config intent alone is not enough: when a package from the known
 * conflict table is installed, Pi's loader would reject the duplicate "grep"
 * registration and refuse to start the whole extension set, so the override
 * degrades to additive "signal_grep" with a visible notice instead. The config
 * value is never rewritten: removing the conflicting package restores the
 * override on the next load.
 * Detection also runs in additive mode so prompt guidance can describe an
 * installed grep-owner handoff without changing the effective tool mode.
 */
export async function resolveOverrideActive(
  config: OverrideConfig,
  options: SignalGrepExtensionOptions = {},
): Promise<{ overrideActive: boolean; conflict: string | undefined }> {
  const fallbackDetect = (): Promise<string | undefined> =>
    detectGrepOwnerConflict(options.agentDir ?? getAgentDir());
  const detect = options.detectConflict ?? fallbackDetect;
  try {
    const conflict = await detect();
    return { overrideActive: config.overrideBuiltinGrep && conflict === undefined, conflict };
  } catch {
    // Fail safe: additive mode always loads cleanly, and the notice names the
    // detection failure instead of pretending no conflict exists.
    return { overrideActive: false, conflict: CONFLICT_DETECTION_FAILED };
  }
}

export async function registerSignalGrepExtension(
  pi: ExtensionAPI,
  config: SignalGrepConfig,
  options: SignalGrepExtensionOptions = {},
): Promise<void> {
  const runtime = new SignalGrepRuntime(
    new SignalGrepService({
      runRipgrep: createRipgrepRunner(),
      structure: createCtagsStructureProvider(),
    }),
  );
  const agentDir = options.agentDir ?? getAgentDir();
  const { overrideActive, conflict } = await resolveOverrideActive(config, options);
  const degradedOverride = config.overrideBuiltinGrep && !overrideActive;
  const toolName = overrideActive ? "grep" : "signal_grep";
  const { locale } = config;

  pi.registerTool<typeof searchSchema, SignalGrepDetails>({
    name: toolName,
    label: SIGNAL_GREP_LABEL,
    description: SIGNAL_GREP_DESCRIPTION,
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: signalGrepPromptGuidelines(toolName, conflict),
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
        effectiveSignalGrepInput(params, config, overrideActive),
        ctx.cwd,
        signal,
        resolveContextBudget(ctx.getContextUsage()),
      );
      if (runtime.metricsEnabled) {
        ctx.ui.setStatus(METRICS_STATUS_KEY, formatMetricsStatus(runtime, ctx, locale));
      }

      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  });

  registerSignalGrepControls({
    pi,
    runtime,
    config,
    agentDir,
    overrideActive,
    degradedOverride,
    conflict,
  });
}

export default async function signalGrepExtension(pi: ExtensionAPI) {
  await registerSignalGrepExtension(pi, await readSignalGrepConfig());
}
