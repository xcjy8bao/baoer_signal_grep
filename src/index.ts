import { SIGNAL_GREP_DESCRIPTION, signalGrepSchema } from "./tool-schema.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readSignalGrepConfig, type SignalGrepConfig } from "./config.js";
import { resolveContextBudget } from "./context-budget.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SignalGrepRuntime } from "./runtime.js";
import { SESSION_STATUS_KEY } from "./session-summary.js";
import { SignalGrepService } from "./service.js";
import { signalGrepPromptGuidelines } from "./prompt-guidelines.js";
import type { SignalGrepDetails } from "./types.js";
import { renderSignalGrepCall, renderSignalGrepResult } from "./tui/renderers.js";

const SIGNAL_GREP_LABEL = "baoer_signal_grep";

export { signalGrepPromptGuidelines };

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
    name: "baoer_signal_grep",
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
