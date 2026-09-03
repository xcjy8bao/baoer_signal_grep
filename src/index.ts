import { SIGNAL_GREP_DESCRIPTION, signalGrepSchema } from "./tool-schema.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readSignalGrepConfig, type SignalGrepConfig } from "./config.js";
import { resolveContextBudget } from "./context-budget.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SignalGrepRuntime } from "./runtime.js";
import { SESSION_STATUS_KEY } from "./session-summary.js";
import { SignalGrepService } from "./service.js";
import { MAX_INSPECT_TARGETS, type SignalGrepDetails } from "./types.js";
import { renderSignalGrepCall, renderSignalGrepResult } from "./tui/renderers.js";

const SIGNAL_GREP_LABEL = "Signal Grep";

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

  pi.registerTool<typeof signalGrepSchema, SignalGrepDetails>({
    name: "signal_grep",
    label: SIGNAL_GREP_LABEL,
    description: SIGNAL_GREP_DESCRIPTION,
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: signalGrepPromptGuidelines(),
    parameters: signalGrepSchema,

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
