import type { SearchKind, ShellLanguage } from "./search-policy-commands.js";
import { ShellSearchPolicy } from "./search-policy-shell.js";

export const SEARCH_POLICY_GUIDANCE =
  "Local content and filename searches must use baoer_signal_grep. Built-in search tools and direct search commands are blocked before execution. Use pattern for contents or mode=files with query for filenames. Keep read/edit/write, tests and builds available. Do not retry a blocked search through another shell or a custom script.";
export const PI_REPLACED_SEARCH_TOOLS = new Set(["grep", "find"]);
const contentTools = new Set(["grep", "Grep", "SearchFileContent"]);
const fileTools = new Set(["find", "Glob", "GlobFile", "SearchFiles"]);
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

function blocked(kind: SearchKind): SearchPolicyDecision {
  const request =
    kind === "files"
      ? '{"mode":"files","query":"<filename or path>","path":"<scope>"}'
      : '{"pattern":"<search text>","path":"<scope>","scope":"strict"}';
  return {
    block: true,
    reason: `baoer_signal_grep search policy: this search entry is disabled. Call the available baoer_signal_grep tool (possibly MCP-prefixed) with ${request}. Do not repeat this command. If the plugin is unavailable, report the connection error instead of bypassing the policy.`,
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
    if (contentTools.has(toolName)) return blocked("content");
    if (fileTools.has(toolName)) return blocked("files");
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
    const kind = await this.#shell.inspect(command, language);
    signal?.throwIfAborted();
    return kind ? blocked(kind) : undefined;
  }
}
