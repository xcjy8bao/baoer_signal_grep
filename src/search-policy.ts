import type { SearchKind, ShellLanguage } from "./search-policy-commands.js";
import { ShellSearchPolicy, type ShellSearchMatch } from "./search-policy-shell.js";

export const SEARCH_POLICY_GUIDANCE =
  "Local content and filename searches must use baoer_signal_grep. Built-in search tools and direct search commands are blocked before execution; filtering output from an unrelated producer at a pipeline tail remains available. Use pattern for contents or mode=files with query for filenames. Keep read/edit/write, tests and builds available. Do not retry a blocked search through another shell or a custom script.";
export const PI_REPLACED_SEARCH_TOOLS = new Set(["grep", "find"]);
export const PREFERRED_SEARCH_GUIDANCE =
  "Prefer baoer_signal_grep for local content and filename searches because it provides bounded evidence, coverage and continuation details. Conventional search entries remain available in advisory mode.";
const contentTools = new Set(["grep", "Grep", "SearchFileContent"]);
const fileTools = new Set(["find", "glob", "Glob", "GlobFile", "SearchFiles"]);
const shellTools = new Set([
  "bash",
  "Bash",
  "powershell",
  "PowerShell",
  "Shell",
  "exec_command",
  "shell_command",
  "shell",
]);

export interface SearchPolicyDecision {
  block: true;
  reason: string;
}

function isInputRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function recovery(kind: SearchKind): string {
  return kind === "files"
    ? '{"mode":"files","query":"<filename or path>","path":"<scope>"}'
    : '{"pattern":"<search text>","path":"<scope>","scope":"strict"}';
}

function blockedMatch(match: ShellSearchMatch): SearchPolicyDecision {
  const location =
    match.nestedDepth > 0
      ? `nested ${match.language} command #${match.commandIndex}`
      : `${match.language} subcommand #${match.commandIndex}`;
  const request = recovery(match.kind);
  return {
    block: true,
    reason: `baoer_signal_grep search policy blocked ${location} (${match.command} …, bytes ${match.startByte}-${match.endByte}) as a direct ${match.kind} search. The host shell call is atomic: the entire tool call was denied before execution, so none of its commands or operations ran. Split non-search operations into a separate shell call, then route only the detected search through the available baoer_signal_grep tool (possibly MCP-prefixed) with ${request}. Do not repeat the blocked search through another shell or custom script. If the plugin is unavailable, report the connection error instead of bypassing the policy.`,
  };
}

function blockedTool(kind: SearchKind, toolName: string): SearchPolicyDecision {
  return {
    block: true,
    reason: `baoer_signal_grep search policy blocked direct ${kind} tool ${toolName}. The entire tool call was denied before execution. Route the search through the available baoer_signal_grep tool (possibly MCP-prefixed) with ${recovery(kind)}. If the plugin is unavailable, report the connection error instead of bypassing the policy.`,
  };
}

export class SearchPolicy {
  readonly #shell: ShellSearchPolicy;
  constructor(assets: URL) {
    this.#shell = new ShellSearchPolicy(assets);
  }

  async check(
    toolName: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<SearchPolicyDecision | undefined> {
    signal?.throwIfAborted();
    if (contentTools.has(toolName)) return blockedTool("content", toolName);
    if (fileTools.has(toolName)) return blockedTool("files", toolName);
    if (!shellTools.has(toolName)) return undefined;
    if (!isInputRecord(input)) throw new Error("Search policy expected a tool input object");
    const fields = input;
    const command = fields.command ?? fields.cmd;
    if (typeof command !== "string")
      throw new Error("Search policy expected a shell command string");
    const shell = typeof fields.shell === "string" ? fields.shell : "";
    const language: ShellLanguage =
      /powershell|pwsh/iu.test(`${toolName} ${shell}`) ||
      (process.platform === "win32" && toolName !== "bash")
        ? "powershell"
        : "bash";
    const match = await this.#shell.inspect(command, language);
    signal?.throwIfAborted();
    return match ? blockedMatch(match) : undefined;
  }
}
