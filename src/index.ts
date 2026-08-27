import { StringEnum } from "@earendil-works/pi-ai";
import { createGrepTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createNormalGrepInput, METRICS_STATUS_KEY, SearchMetrics } from "./metrics.js";
import { createRipgrepRunner } from "./rg.js";
import { SignalGrepService } from "./service.js";

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
      description: "true for insensitive, false for sensitive, omitted for smart-case.",
    }),
  ),
  hidden: Type.Optional(
    Type.Boolean({ description: "Search hidden files (default true; .git is always excluded)." }),
  ),
  context: Type.Optional(Type.Number({ description: "Context lines before and after (0-20)." })),
  limit: Type.Optional(
    Type.Number({ description: "Matches per detail page (default 20, max 100)." }),
  ),
  mode: Type.Optional(
    StringEnum(["auto", "summary", "matches"] as const, {
      description: "auto summarizes broad searches; matches forces a detail page.",
    }),
  ),
  cursor: Type.Optional(
    Type.String({ description: "Opaque cursor from a previous stable search snapshot." }),
  ),
});

function resultText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter(
      (item): item is { type: "text"; text: string } =>
        item.type === "text" && typeof item.text === "string",
    )
    .map((item) => item.text)
    .join("\n");
}

export default function signalGrepExtension(pi: ExtensionAPI) {
  const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
  const metrics = new SearchMetrics();
  const trackedCursors = new Set<string>();

  pi.registerTool({
    name: "signal_grep",
    label: "Signal Grep",
    description:
      "Context-efficient ripgrep search. Small searches return grouped matches; broad searches return a per-file summary first. Cursor pages come from a stable snapshot and explicitly report partial retention.",
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: [
      "Use signal_grep for content search instead of unbounded rg output.",
      "When signal_grep returns a summary, narrow with path or use its cursor only when exhaustive detail is required.",
      "Treat signal_grep status=partial as incomplete and narrow the query before drawing conclusions.",
    ],
    parameters: searchSchema,

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const inputCursor = params.cursor;
      const trackedCursor = inputCursor ? trackedCursors.has(inputCursor) : false;
      const result = await service.search(params, ctx.cwd, signal);

      if (metrics.enabled) {
        if (trackedCursor && inputCursor) {
          trackedCursors.delete(inputCursor);
          metrics.recordCursorPage(result.text);
          if (result.details.cursor) trackedCursors.add(result.details.cursor);
        } else if (!inputCursor) {
          const normalInput = createNormalGrepInput(params);
          if (!normalInput.supported) {
            metrics.recordSkippedSearch();
            ctx.ui.notify(
              `Signal Grep metrics skipped this search: ${normalInput.reason}`,
              "warning",
            );
          } else {
            try {
              const normalResult = await createGrepTool(ctx.cwd).execute(
                "signal-grep-normal-baseline",
                normalInput.input,
                signal,
              );
              metrics.recordComparison(result.text, resultText(normalResult.content));
              if (result.details.cursor) trackedCursors.add(result.details.cursor);
            } catch (error) {
              if (signal?.aborted) throw error;
              metrics.recordSkippedSearch();
              const message = error instanceof Error ? error.message : String(error);
              ctx.ui.notify(`Signal Grep metrics baseline failed: ${message}`, "warning");
            }
          }
        }
        ctx.ui.setStatus(METRICS_STATUS_KEY, metrics.formatStatus());
      }

      return {
        content: [{ type: "text", text: result.text }],
        details: result.details,
      };
    },
  });

  pi.registerCommand("signal-grep-health", {
    description: "Show ripgrep availability and in-memory snapshot usage",
    handler: async (_args, ctx) => {
      const result = await pi.exec("rg", ["--version"], { timeout: 5_000 });
      if (result.code !== 0) {
        ctx.ui.notify(`Signal Grep cannot run ripgrep: ${result.stderr.trim()}`, "error");
        return;
      }
      const version = result.stdout.split("\n")[0] ?? "ripgrep (unknown version)";
      ctx.ui.notify(
        `${version}\nSnapshots: ${service.snapshotCount}\nRetained matches: ${service.storedMatches}`,
        "info",
      );
    },
  });

  pi.registerCommand("signal-grep-clear", {
    description: "Clear all in-memory Signal Grep snapshots and invalidate their cursors",
    handler: async (_args, ctx) => {
      service.clear();
      trackedCursors.clear();
      ctx.ui.notify("Signal Grep snapshots cleared", "info");
    },
  });

  pi.registerCommand("signal-grep-metrics", {
    description: "Toggle or inspect cumulative Signal Grep versus normal grep token estimates",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on") {
        if (metrics.enabled) {
          ctx.ui.notify("Signal Grep metrics are already enabled", "info");
          return;
        }
        metrics.enable();
        trackedCursors.clear();
        ctx.ui.setStatus(METRICS_STATUS_KEY, metrics.formatStatus());
        ctx.ui.notify(
          "Signal Grep metrics enabled. Token counts are estimated from model-facing result text.",
          "info",
        );
        return;
      }

      if (action === "off") {
        if (!metrics.enabled) {
          ctx.ui.notify("Signal Grep metrics are already disabled", "info");
          return;
        }
        const report = metrics.formatReport();
        metrics.disable();
        trackedCursors.clear();
        ctx.ui.setStatus(METRICS_STATUS_KEY, undefined);
        ctx.ui.notify(report, "info");
        return;
      }

      if (action === "status" || action.length === 0) {
        ctx.ui.notify(
          metrics.enabled
            ? metrics.formatReport()
            : "Signal Grep metrics are disabled. Use /signal-grep-metrics on to start a new comparison window.",
          "info",
        );
        return;
      }

      ctx.ui.notify("Usage: /signal-grep-metrics on|off|status", "warning");
    },
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    service.clear();
    trackedCursors.clear();
    metrics.disable();
    ctx.ui.setStatus(METRICS_STATUS_KEY, undefined);
  });
}
