import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  CONFLICT_DETECTION_FAILED,
  detectGrepOwnerConflict,
  grepOverrideConflictSource,
} from "./conflicts.js";
import { type SignalGrepConfig, writeSignalGrepConfig } from "./config.js";
import { message } from "./messages.js";
import { METRICS_STATUS_KEY, SignalGrepRuntime } from "./runtime.js";

export interface SignalGrepControlsOptions {
  pi: ExtensionAPI;
  runtime: SignalGrepRuntime;
  config: SignalGrepConfig;
  agentDir: string;
  overrideActive: boolean;
  degradedOverride: boolean;
  conflict: string | undefined;
}

interface GrepConflict {
  kind: "installed-package" | "active-tool";
  source: string;
}

function localizedConflictSource(
  locale: SignalGrepConfig["locale"],
  source: string | undefined,
): string {
  if (source === CONFLICT_DETECTION_FAILED) return message(locale, "conflictDetectionFailed");
  return source ?? message(locale, "unknownSource");
}

function effectiveModeMessage(options: SignalGrepControlsOptions): string {
  const { config, conflict, degradedOverride, overrideActive } = options;
  if (overrideActive) return message(config.locale, "healthOverrideMode");
  if (degradedOverride) {
    return message(config.locale, "healthDegradedMode", {
      source: localizedConflictSource(config.locale, conflict),
    });
  }
  return message(config.locale, "healthAdditiveMode");
}

export function formatMetricsStatus(
  runtime: SignalGrepRuntime,
  ctx: ExtensionContext,
  locale: SignalGrepConfig["locale"],
): string {
  const theme = ctx.ui.theme;
  const highlight = (text: string) => theme.fg("accent", theme.bold(text));
  return runtime.formatMetricsStatus(
    {
      signal: highlight,
      normal: (text) => theme.fg("muted", text),
      positive: (text) => theme.fg("success", theme.bold(text)),
      negative: (text) => theme.fg("error", theme.bold(text)),
      neutral: (text) => theme.fg("muted", text),
    },
    locale,
  );
}

async function currentGrepConflict(
  options: SignalGrepControlsOptions,
): Promise<GrepConflict | undefined> {
  const packageConflict = await detectGrepOwnerConflict(options.agentDir);
  if (packageConflict) return { kind: "installed-package", source: packageConflict };
  const activeOwner = grepOverrideConflictSource(options.pi.getAllTools());
  return activeOwner ? { kind: "active-tool", source: activeOwner } : undefined;
}

function registerHealthCommand(options: SignalGrepControlsOptions): void {
  const { config, pi, runtime } = options;
  const { locale } = config;
  pi.registerCommand("signal-grep-health", {
    description: message(locale, "commandHealthDescription"),
    handler: async (_args, ctx) => {
      const result = await pi.exec("rg", ["--version"], { timeout: 5_000 });
      if (result.code !== 0) {
        ctx.ui.notify(
          message(locale, "healthRipgrepFailure", { error: result.stderr.trim() }),
          "error",
        );
        return;
      }
      const version =
        result.stdout.split("\n")[0] ?? message(locale, "healthUnknownRipgrepVersion");
      const ctags = await pi.exec("ctags", ["--version"], { timeout: 5_000 });
      const ctagsVersion =
        ctags.code === 0 && /Universal Ctags/i.test(ctags.stdout)
          ? (ctags.stdout.split("\n")[0] ?? message(locale, "healthUnknownCtagsVersion"))
          : message(locale, "healthCtagsUnavailable");
      const tools = pi.getAllTools();
      const searchTools = tools
        .map((tool) => tool.name)
        .filter((name) => name === "grep" || name === "signal_grep")
        .toSorted((left, right) => left.localeCompare(right));
      const activeGrepOwner =
        tools.find((tool) => tool.name === "grep")?.sourceInfo.source ??
        message(locale, "missingSource");
      ctx.ui.notify(
        message(locale, "healthReport", {
          ripgrepVersion: version,
          structureVersion: ctagsVersion,
          effectiveMode: effectiveModeMessage(options),
          searchTools: searchTools.join(", "),
          activeGrepOwner,
          snapshots: runtime.snapshotCount,
          retainedMatches: runtime.storedMatches,
        }),
        "info",
      );
    },
  });
}

function registerClearCommand(options: SignalGrepControlsOptions): void {
  const { config, pi, runtime } = options;
  pi.registerCommand("signal-grep-clear", {
    description: message(config.locale, "commandClearDescription"),
    handler: (_args, ctx) => {
      runtime.clear();
      ctx.ui.notify(message(config.locale, "snapshotsCleared"), "info");
      return Promise.resolve();
    },
  });
}

async function changeOverride(
  options: SignalGrepControlsOptions,
  overrideBuiltinGrep: boolean,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const { agentDir, config } = options;
  const { locale } = config;
  if (overrideBuiltinGrep) {
    const conflict = await currentGrepConflict(options);
    if (conflict) {
      const key =
        conflict.kind === "installed-package" ? "overrideEnableRefused" : "overrideActiveOwner";
      ctx.ui.notify(message(locale, key, { source: conflict.source }), "error");
      return;
    }
  }
  await writeSignalGrepConfig(
    { ...config, overrideBuiltinGrep, startMetricsOnNextLoad: false },
    agentDir,
  );
  ctx.ui.notify(
    message(locale, overrideBuiltinGrep ? "overrideReloadEnabled" : "overrideReloadDisabled"),
    "info",
  );
  await ctx.reload();
}

function registerOverrideCommand(options: SignalGrepControlsOptions): void {
  const { config, pi } = options;
  const { locale } = config;
  pi.registerCommand("signal-grep-override", {
    description: message(locale, "commandOverrideDescription"),
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "status" || action.length === 0) {
        ctx.ui.notify(
          message(locale, config.overrideBuiltinGrep ? "overrideEnabled" : "overrideDisabled"),
          "info",
        );
        return;
      }
      if (action !== "on" && action !== "off") {
        ctx.ui.notify(message(locale, "overrideUsage"), "warning");
        return;
      }
      const overrideBuiltinGrep = action === "on";
      if (overrideBuiltinGrep === config.overrideBuiltinGrep) {
        ctx.ui.notify(
          message(
            locale,
            overrideBuiltinGrep ? "overrideAlreadyEnabled" : "overrideAlreadyDisabled",
          ),
          "info",
        );
        return;
      }
      await changeOverride(options, overrideBuiltinGrep, ctx);
    },
  });
}

async function enableMetrics(
  options: SignalGrepControlsOptions,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const { agentDir, config, conflict, degradedOverride, runtime } = options;
  const { locale } = config;
  if (runtime.metricsEnabled) {
    ctx.ui.notify(message(locale, "metricsAlreadyEnabled"), "info");
    return;
  }
  if (degradedOverride) {
    ctx.ui.notify(
      message(locale, "metricsRequiresOverride", {
        source: localizedConflictSource(locale, conflict),
      }),
      "warning",
    );
    return;
  }
  if (!config.overrideBuiltinGrep) {
    const activeConflict = await currentGrepConflict(options);
    if (activeConflict) {
      const key =
        activeConflict.kind === "installed-package"
          ? "metricsRequiresOverride"
          : "metricsActiveOwner";
      const severity = activeConflict.kind === "installed-package" ? "warning" : "error";
      ctx.ui.notify(message(locale, key, { source: activeConflict.source }), severity);
      return;
    }
    await writeSignalGrepConfig(
      { ...config, overrideBuiltinGrep: true, startMetricsOnNextLoad: true },
      agentDir,
    );
    ctx.ui.notify(message(locale, "metricsReloading"), "info");
    await ctx.reload();
    return;
  }
  runtime.enableMetrics();
  ctx.ui.setStatus(METRICS_STATUS_KEY, formatMetricsStatus(runtime, ctx, locale));
  ctx.ui.notify(message(locale, "metricsEnabled"), "info");
}

function disableMetrics(options: SignalGrepControlsOptions, ctx: ExtensionCommandContext): void {
  const { config, runtime } = options;
  if (!runtime.metricsEnabled) {
    ctx.ui.notify(message(config.locale, "metricsAlreadyDisabled"), "info");
    return;
  }
  const report = runtime.formatMetricsReport(config.locale);
  runtime.disableMetrics();
  ctx.ui.setStatus(METRICS_STATUS_KEY, undefined);
  ctx.ui.notify(report, "info");
}

function reportMetricsStatus(
  options: SignalGrepControlsOptions,
  ctx: ExtensionCommandContext,
): void {
  const { config, runtime } = options;
  ctx.ui.notify(
    runtime.metricsEnabled
      ? runtime.formatMetricsReport(config.locale)
      : message(config.locale, "metricsDisabledStatus"),
    "info",
  );
}

function registerMetricsCommand(options: SignalGrepControlsOptions): void {
  const { config, pi } = options;
  pi.registerCommand("signal-grep-metrics", {
    description: message(config.locale, "commandMetricsDescription"),
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on") {
        await enableMetrics(options, ctx);
        return;
      }
      if (action === "off") {
        disableMetrics(options, ctx);
        return;
      }
      if (action === "status" || action.length === 0) {
        reportMetricsStatus(options, ctx);
        return;
      }
      ctx.ui.notify(message(config.locale, "metricsUsage"), "warning");
    },
  });
}

function registerLifecycle(options: SignalGrepControlsOptions): void {
  const { agentDir, config, conflict, degradedOverride, pi, runtime } = options;
  const { locale } = config;
  pi.on("session_start", async (_event, ctx) => {
    if (degradedOverride) {
      ctx.ui.notify(
        message(locale, "overrideDegraded", {
          source: localizedConflictSource(locale, conflict),
        }),
        "warning",
      );
    }
    if (!config.startMetricsOnNextLoad) return;
    await writeSignalGrepConfig(
      { ...config, overrideBuiltinGrep: true, startMetricsOnNextLoad: false },
      agentDir,
    );
    if (degradedOverride) {
      ctx.ui.notify(
        message(locale, "metricsRequiresOverride", {
          source: localizedConflictSource(locale, conflict),
        }),
        "warning",
      );
      return;
    }
    runtime.enableMetrics();
    ctx.ui.setStatus(METRICS_STATUS_KEY, formatMetricsStatus(runtime, ctx, locale));
    ctx.ui.notify(message(locale, "overrideAndMetricsEnabled"), "info");
  });
  pi.on("session_shutdown", (_event, ctx) => {
    runtime.clear();
    runtime.disableMetrics();
    ctx.ui.setStatus(METRICS_STATUS_KEY, undefined);
  });
}

export function registerSignalGrepControls(options: SignalGrepControlsOptions): void {
  registerHealthCommand(options);
  registerClearCommand(options);
  registerOverrideCommand(options);
  registerMetricsCommand(options);
  registerLifecycle(options);
}
