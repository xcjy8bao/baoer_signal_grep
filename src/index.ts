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
import { MAX_SELECTED_PATHS } from "./types.js";

const SIGNAL_GREP_LABEL = "Signal Grep";
const SIGNAL_GREP_DESCRIPTION =
  "Context-efficient ripgrep search with exact match ranges and bounded code inspection. Small searches return grouped matches; broad searches return a per-file summary first. Use mode=inspect with path and line to inspect a source block. Cursor pages come from a stable snapshot and explicitly report partial retention.";

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
    `Use ${toolName} for content search instead of unbounded rg output.`,
    `When ${toolName} returns a summary, narrow with path or use its cursor only when exhaustive detail is required.`,
    `Use ${toolName} mode=inspect with path and line when a matching location needs its enclosing code block.`,
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
  pattern: Type.Optional(
    Type.String({ description: "Regex or literal text. Required unless cursor is provided." }),
  ),
  path: Type.Optional(
    Type.String({ description: "File or directory to search, relative to the working directory." }),
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
  context: Type.Optional(Type.Number({ description: "Context lines before and after (0-20)." })),
  limit: Type.Optional(
    Type.Number({ description: "Maximum matches per adaptive detail page (max 100)." }),
  ),
  mode: Type.Optional(
    StringEnum(["auto", "summary", "matches", "inspect"] as const, {
      description:
        "auto summarizes broad searches; matches returns details; inspect returns a code block.",
    }),
  ),
  line: Type.Optional(
    Type.Number({ description: "1-indexed source line required by mode=inspect." }),
  ),
  matchIndex: Type.Optional(
    Type.Number({
      description:
        "1-based retained match index for cursor-scoped inspect; replaces path and line.",
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
  if (!overrideActive || input.cursor || input.ignoreCase !== undefined) return input;
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

  pi.registerTool({
    name: toolName,
    label: SIGNAL_GREP_LABEL,
    description: SIGNAL_GREP_DESCRIPTION,
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: signalGrepPromptGuidelines(toolName, conflict),
    parameters: searchSchema,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
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
