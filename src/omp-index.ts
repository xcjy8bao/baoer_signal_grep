import { homedir } from "node:os";
import { join } from "node:path";
import {
  readSignalGrepConfigFile,
  SIGNAL_GREP_CONFIG_FILE,
  type SignalGrepConfig,
} from "./config-reader.js";
import { resolveContextBudget } from "./context-budget.js";
import { createRipgrepRunner } from "./rg.js";
import { createCtagsStructureProvider } from "./structure.js";
import { SignalGrepRuntime } from "./runtime.js";
import { SESSION_STATUS_KEY } from "./session-summary.js";
import { SignalGrepService, type SignalGrepInput } from "./service.js";
import { signalGrepPromptGuidelines } from "./prompt-guidelines.js";
import {
  renderSignalGrepCall,
  renderSignalGrepResult,
  type SignalGrepToolResult,
} from "./tui/renderers.js";
import { SEARCH_POLICY_GUIDANCE, SearchPolicy } from "./search-policy.js";
import { signalGrepSchema } from "./tool-schema.js";

const SIGNAL_GREP_LABEL = "baoer_signal_grep";
const OMP_REPLACED_SEARCH_TOOLS = new Set(["grep", "glob"]);

interface OmpTheme {
  bold(value: string): string;
  fg(color: string, value: string): string;
}

interface OmpContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

interface OmpExtensionContext {
  cwd: string;
  getContextUsage(): OmpContextUsage | undefined;
  ui: {
    setStatus(key: string, text: string | undefined): void;
  };
}

interface OmpToolCallEvent {
  toolName: string;
  input: unknown;
}

interface OmpBeforeAgentStartEvent {
  systemPrompt: string[];
}

interface OmpRenderOptions {
  expanded: boolean;
  isPartial: boolean;
}

interface OmpToolDefinition {
  name: string;
  label: string;
  description: string;
  approval?: "read" | "write" | "exec";
  promptSnippet: string;
  promptGuidelines: string[];
  parameters: unknown;
  execute(
    toolCallId: string,
    params: SignalGrepInput,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: OmpExtensionContext,
  ): Promise<SignalGrepToolResult>;
  renderCall?(
    params: SignalGrepInput,
    options: unknown,
    theme: OmpTheme,
  ): ReturnType<typeof renderSignalGrepCall>;
  renderResult?(
    result: SignalGrepToolResult,
    options: OmpRenderOptions,
    theme: OmpTheme,
    args?: SignalGrepInput,
  ): ReturnType<typeof renderSignalGrepResult>;
}

interface OmpExtensionAPI {
  registerTool(tool: OmpToolDefinition): void;
  on(
    event: "session_start",
    handler: (event: unknown, ctx: OmpExtensionContext) => void | Promise<void>,
  ): void;
  on(
    event: "before_agent_start",
    handler: (
      event: OmpBeforeAgentStartEvent,
      ctx: OmpExtensionContext,
    ) => void | { systemPrompt?: string[] } | Promise<void | { systemPrompt?: string[] }>,
  ): void;
  on(
    event: "tool_call",
    handler: (
      event: OmpToolCallEvent,
      ctx: OmpExtensionContext,
    ) => void | { block: true; reason: string } | Promise<void | { block: true; reason: string }>,
  ): void;
  on(
    event: "session_shutdown",
    handler: (event: unknown, ctx: OmpExtensionContext) => void | Promise<void>,
  ): void;
  getActiveTools(): string[];
  setActiveTools(toolNames: string[]): Promise<void>;
}

function expandTilde(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function ompProfile(): string | undefined {
  const value = process.env.OMP_PROFILE ?? process.env.PI_PROFILE;
  if (value === undefined) return undefined;
  const profile = value.trim();
  if (!profile || profile === "default") return undefined;
  // OMP validates this before loading extensions. Keep direct SDK imports safe
  // as well, without allowing an environment value to escape the profile root.
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile) || profile.endsWith(".")) return undefined;
  return profile;
}

/** Resolve the same profile-scoped config directory that OMP exposes to extensions. */
function ompAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (configured) return expandTilde(configured);
  const configDir = process.env.PI_CONFIG_DIR || ".omp";
  const profile = ompProfile();
  return profile
    ? join(homedir(), configDir, "profiles", profile, "agent")
    : join(homedir(), configDir, "agent");
}

function selectSearchTools(pi: OmpExtensionAPI): string[] {
  const current = pi.getActiveTools();
  const next = current.filter((tool) => !OMP_REPLACED_SEARCH_TOOLS.has(tool));
  if (!next.includes(SIGNAL_GREP_LABEL)) next.push(SIGNAL_GREP_LABEL);
  return next;
}

function toolSelectionChanged(current: string[], next: string[]): boolean {
  return current.length !== next.length || next.some((tool, index) => tool !== current[index]);
}

function resultOptions(
  options: OmpRenderOptions,
  result: SignalGrepToolResult,
): OmpRenderOptions & { isError: boolean } {
  return { ...options, isError: result.isError === true };
}

export async function registerOmpSignalGrepExtension(
  pi: OmpExtensionAPI,
  searchPolicyAssets = new URL("../plugins/baoer-signal-grep/hooks/", import.meta.url),
  config?: SignalGrepConfig,
): Promise<void> {
  const runtime = new SignalGrepRuntime(
    new SignalGrepService({
      runRipgrep: createRipgrepRunner(),
      structure: createCtagsStructureProvider(),
    }),
  );
  const policy = new SearchPolicy(searchPolicyAssets);
  const resolvedConfig =
    config ?? (await readSignalGrepConfigFile(join(ompAgentDir(), SIGNAL_GREP_CONFIG_FILE)));
  const { locale } = resolvedConfig;
  let selection = Promise.resolve();
  const updateSelection = async (): Promise<void> => {
    const current = pi.getActiveTools();
    const next = selectSearchTools(pi);
    if (toolSelectionChanged(current, next)) await pi.setActiveTools(next);
  };
  const selectTools = (): Promise<void> => {
    selection = selection.then(updateSelection);
    return selection;
  };

  pi.registerTool({
    name: SIGNAL_GREP_LABEL,
    label: SIGNAL_GREP_LABEL,
    description:
      "Search and navigate code with bounded, verifiable evidence. Use pattern for content or mode=files with query for filenames.",
    approval: "read",
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: signalGrepPromptGuidelines(),
    parameters: signalGrepSchema,

    renderCall(params, _options, theme) {
      return renderSignalGrepCall(params, locale, theme);
    },

    renderResult(result, options, theme) {
      return renderSignalGrepResult(result, resultOptions(options, result), locale, theme);
    },

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
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

  if (resolvedConfig.enforceSearch !== false) {
    pi.on("session_start", selectTools);
    pi.on("before_agent_start", async (event) => {
      await selectTools();
      return { systemPrompt: [...event.systemPrompt, SEARCH_POLICY_GUIDANCE] };
    });
    pi.on("tool_call", (event) => policy.check(event.toolName, event.input));
  }

  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.shutdown();
    ctx.ui.setStatus(SESSION_STATUS_KEY, undefined);
  });
}

export default async function signalGrepOmpExtension(pi: OmpExtensionAPI): Promise<void> {
  await registerOmpSignalGrepExtension(pi);
}
