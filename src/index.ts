import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { detectGrepOwnerConflict } from "./conflicts.js";
import { readSignalGrepConfig, type SignalGrepConfig, writeSignalGrepConfig } from "./config.js";
import { message } from "./messages.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { METRICS_STATUS_KEY, SignalGrepRuntime } from "./runtime.js";
import { type SignalGrepInput, SignalGrepService } from "./service.js";

const SIGNAL_GREP_LABEL = "Signal Grep";
const SIGNAL_GREP_DESCRIPTION =
  "Context-efficient ripgrep search with exact match ranges and bounded code inspection. Small searches return grouped matches; broad searches return a per-file summary first. Use mode=inspect with path and line to inspect a source block. Cursor pages come from a stable snapshot and explicitly report partial retention.";

export interface SignalGrepExtensionOptions {
  /** Overrides the Pi agent directory used for package conflict detection and config writes (test seam). */
  agentDir?: string;
  /** Overrides conflict detection entirely (test seam). */
  detectConflict?: () => Promise<string | undefined>;
}

function formatMetricsStatus(runtime: SignalGrepRuntime, ctx: ExtensionContext): string {
  const theme = ctx.ui.theme;
  const highlight = (text: string) => theme.fg("accent", theme.bold(text));
  return runtime.formatMetricsStatus({
    signal: highlight,
    normal: (text) => theme.fg("muted", text),
    positive: (text) => theme.fg("success", theme.bold(text)),
    negative: (text) => theme.fg("error", theme.bold(text)),
    neutral: (text) => theme.fg("muted", text),
  });
}

const searchSchema = Type.Object({
  pattern: Type.Optional(
    Type.String({ description: "Regex or literal text. Required unless cursor is provided." }),
  ),
  path: Type.Optional(
    Type.String({ description: "File or directory to search, relative to the working directory." }),
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
  cursor: Type.Optional(
    Type.String({ description: "Opaque cursor from a previous stable search snapshot." }),
  ),
});

export function signalGrepToolName(config: SignalGrepConfig): "grep" | "signal_grep" {
  return config.overrideBuiltinGrep ? "grep" : "signal_grep";
}

export function grepOverrideConflictSource(
  tools: ReadonlyArray<{ name: string; sourceInfo: { source: string } }>,
): string | undefined {
  const source = tools.find((tool) => tool.name === "grep")?.sourceInfo.source;
  return source && source !== "builtin" ? source : undefined;
}

export function effectiveSignalGrepInput(
  input: SignalGrepInput,
  config: SignalGrepConfig,
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
 */
export async function resolveOverrideActive(
  config: SignalGrepConfig,
  options: SignalGrepExtensionOptions = {},
): Promise<{ overrideActive: boolean; conflict: string | undefined }> {
  if (!config.overrideBuiltinGrep) return { overrideActive: false, conflict: undefined };
  const fallbackDetect = (): Promise<string | undefined> =>
    detectGrepOwnerConflict(options.agentDir ?? getAgentDir());
  const detect = options.detectConflict ?? fallbackDetect;
  try {
    const conflict = await detect();
    return { overrideActive: conflict === undefined, conflict };
  } catch {
    // Fail safe: additive mode always loads cleanly, and the notice names the
    // detection failure instead of pretending no conflict exists.
    return { overrideActive: false, conflict: "unknown (conflict detection failed)" };
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

  pi.registerTool({
    name: toolName,
    label: SIGNAL_GREP_LABEL,
    description: SIGNAL_GREP_DESCRIPTION,
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: [
      `Use ${toolName} for content search instead of unbounded rg output.`,
      `When ${toolName} returns a summary, narrow with path or use its cursor only when exhaustive detail is required.`,
      `Use ${toolName} mode=inspect with path and line when a matching location needs its enclosing code block.`,
      `Treat ${toolName} status=partial as incomplete and narrow the query before drawing conclusions.`,
    ],
    parameters: searchSchema,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const result = await runtime.search(
        effectiveSignalGrepInput(params, config, overrideActive),
        ctx.cwd,
        signal,
      );
      if (runtime.metricsEnabled) {
        ctx.ui.setStatus(METRICS_STATUS_KEY, formatMetricsStatus(runtime, ctx));
      }

      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  });

  pi.registerCommand("signal-grep-health", {
    description: "Show ripgrep, structure-provider availability, and in-memory snapshot usage",
    handler: async (_args, ctx) => {
      const result = await pi.exec("rg", ["--version"], { timeout: 5_000 });
      if (result.code !== 0) {
        ctx.ui.notify(`Signal Grep cannot run ripgrep: ${result.stderr.trim()}`, "error");
        return;
      }
      const version = result.stdout.split("\n")[0] ?? "ripgrep (unknown version)";
      const ctags = await pi.exec("ctags", ["--version"], { timeout: 5_000 });
      const ctagsVersion =
        ctags.code === 0 && /Universal Ctags/i.test(ctags.stdout)
          ? (ctags.stdout.split("\n")[0] ?? "Universal Ctags (unknown version)")
          : "Universal Ctags unavailable";
      const tools = pi.getAllTools();
      const searchTools = tools
        .map((tool) => tool.name)
        .filter((name) => name === "grep" || name === "signal_grep")
        .toSorted();
      const activeGrepOwner =
        tools.find((tool) => tool.name === "grep")?.sourceInfo.source ?? "missing";
      const effectiveMode = overrideActive
        ? "override built-in grep"
        : degradedOverride
          ? message("healthDegradedMode", { source: conflict ?? "unknown" })
          : "additive signal_grep";
      ctx.ui.notify(
        `${version}\nStructure provider: ${ctagsVersion}\nTool mode (effective): ${effectiveMode}\nSearch tools: ${searchTools.join(", ")}\nActive grep owner: ${activeGrepOwner}\nSnapshots: ${runtime.snapshotCount}\nRetained matches: ${runtime.storedMatches}`,
        "info",
      );
    },
  });

  pi.registerCommand("signal-grep-clear", {
    description: "Clear all in-memory Signal Grep snapshots and invalidate their cursors",
    handler: async (_args, ctx) => {
      runtime.clear();
      ctx.ui.notify("Signal Grep snapshots cleared", "info");
    },
  });

  pi.registerCommand("signal-grep-override", {
    description: "Enable, disable, or inspect the persistent built-in grep override",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "status" || action.length === 0) {
        ctx.ui.notify(
          `Signal Grep override is ${config.overrideBuiltinGrep ? "enabled" : "disabled"}.`,
          "info",
        );
        return;
      }
      if (action !== "on" && action !== "off") {
        ctx.ui.notify("Usage: /signal-grep-override on|off|status", "warning");
        return;
      }

      const overrideBuiltinGrep = action === "on";
      if (overrideBuiltinGrep === config.overrideBuiltinGrep) {
        ctx.ui.notify(
          `Signal Grep override is already ${overrideBuiltinGrep ? "enabled" : "disabled"}.`,
          "info",
        );
        return;
      }

      if (overrideBuiltinGrep) {
        const packageConflict = await detectGrepOwnerConflict(agentDir);
        if (packageConflict) {
          ctx.ui.notify(message("overrideEnableRefused", { source: packageConflict }), "error");
          return;
        }
        const conflictSource = grepOverrideConflictSource(pi.getAllTools());
        if (conflictSource) {
          ctx.ui.notify(
            `Cannot enable Signal Grep override because grep is already owned by ${conflictSource}.`,
            "error",
          );
          return;
        }
      }

      await writeSignalGrepConfig(
        {
          overrideBuiltinGrep,
          startMetricsOnNextLoad: false,
        },
        agentDir,
      );
      ctx.ui.notify(
        `Signal Grep override ${overrideBuiltinGrep ? "enabled" : "disabled"}; reloading tools.`,
        "info",
      );
      await ctx.reload();
    },
  });

  pi.registerCommand("signal-grep-metrics", {
    description: "Toggle or inspect cumulative Signal Grep versus normal grep token estimates",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on") {
        if (runtime.metricsEnabled) {
          ctx.ui.notify("Signal Grep metrics are already enabled", "info");
          return;
        }
        if (degradedOverride) {
          ctx.ui.notify(
            message("metricsRequiresOverride", { source: conflict ?? "unknown" }),
            "warning",
          );
          return;
        }
        if (!config.overrideBuiltinGrep) {
          const packageConflict = await detectGrepOwnerConflict(agentDir);
          if (packageConflict) {
            ctx.ui.notify(
              message("metricsRequiresOverride", { source: packageConflict }),
              "warning",
            );
            return;
          }
          const conflictSource = grepOverrideConflictSource(pi.getAllTools());
          if (conflictSource) {
            ctx.ui.notify(
              `Signal Grep metrics cannot start because grep is already owned by ${conflictSource}.`,
              "error",
            );
            return;
          }
          await writeSignalGrepConfig(
            {
              overrideBuiltinGrep: true,
              startMetricsOnNextLoad: true,
            },
            agentDir,
          );
          ctx.ui.notify(
            "Enabling the grep override and reloading before Signal Grep metrics start.",
            "info",
          );
          await ctx.reload();
          return;
        }
        runtime.enableMetrics();
        ctx.ui.setStatus(METRICS_STATUS_KEY, formatMetricsStatus(runtime, ctx));
        ctx.ui.notify(
          "Signal Grep metrics enabled. Every successful Pi grep call will be compared from one shared snapshot.",
          "info",
        );
        return;
      }

      if (action === "off") {
        if (!runtime.metricsEnabled) {
          ctx.ui.notify("Signal Grep metrics are already disabled", "info");
          return;
        }
        const report = runtime.formatMetricsReport();
        runtime.disableMetrics();
        ctx.ui.setStatus(METRICS_STATUS_KEY, undefined);
        ctx.ui.notify(report, "info");
        return;
      }

      if (action === "status" || action.length === 0) {
        ctx.ui.notify(
          runtime.metricsEnabled
            ? runtime.formatMetricsReport()
            : "Signal Grep metrics are disabled. Use /signal-grep-metrics on to enable the grep override if needed and start a new comparison window.",
          "info",
        );
        return;
      }

      ctx.ui.notify("Usage: /signal-grep-metrics on|off|status", "warning");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (degradedOverride) {
      ctx.ui.notify(message("overrideDegraded", { source: conflict ?? "unknown" }), "warning");
    }
    if (!config.startMetricsOnNextLoad) return;
    await writeSignalGrepConfig(
      {
        overrideBuiltinGrep: true,
        startMetricsOnNextLoad: false,
      },
      agentDir,
    );
    if (degradedOverride) {
      ctx.ui.notify(
        message("metricsRequiresOverride", { source: conflict ?? "unknown" }),
        "warning",
      );
      return;
    }
    runtime.enableMetrics();
    ctx.ui.setStatus(METRICS_STATUS_KEY, formatMetricsStatus(runtime, ctx));
    ctx.ui.notify(
      "Signal Grep override and metrics enabled. Every successful Pi grep call will be compared.",
      "info",
    );
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    runtime.clear();
    runtime.disableMetrics();
    ctx.ui.setStatus(METRICS_STATUS_KEY, undefined);
  });
}

export default async function signalGrepExtension(pi: ExtensionAPI) {
  await registerSignalGrepExtension(pi, await readSignalGrepConfig());
}
