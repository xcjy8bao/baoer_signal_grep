import type { SearchKind, ShellLanguage } from "./search-policy-commands.js";
import { recoverShellSearch } from "./search-policy-recovery.js";
import { ShellSearchPolicy, type ShellSearchMatch } from "./search-policy-shell.js";

export const SEARCH_POLICY_GUIDANCE =
  "Local content and filename searches must use baoer_signal_grep. Built-in search tools and direct search commands are blocked before execution; filtering output from an unrelated producer at a pipeline tail remains available. Use pattern for contents or mode=files with query for filenames. Keep read/edit/write, tests and builds available. After a denial, call baoer_signal_grep once with the stated repair; do not paste the denial into the request, repeat the blocked call, use another shell/custom script, or weaken the search mode.";
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

function blockedMatch(
  command: string,
  match: ShellSearchMatch,
  workingDirectory: string | undefined,
): SearchPolicyDecision {
  const location =
    match.nestedDepth > 0
      ? `nested ${match.language} command #${match.commandIndex}`
      : `${match.language} subcommand #${match.commandIndex}`;
  const recovered = recoverShellSearch(command, match, workingDirectory);
  const repair =
    recovered.kind === "concrete"
      ? `retry exactly once through baoer_signal_grep (possibly MCP-prefixed) with ${recovered.request}`
      : `an equivalent request was not generated because ${recovered.reason}; manually translate the search, then retry exactly once through baoer_signal_grep (possibly MCP-prefixed) with ${recovery(match.kind)}`;
  return {
    block: true,
    reason: `baoer_signal_grep search policy blocked direct ${match.kind} search at ${location} (${match.command} …, bytes ${match.startByte}-${match.endByte}); the atomic shell call did not run. Split out non-search operations, then ${repair}. Do not include this denial in the retry, repeat it through another shell/script, or weaken the search. If baoer_signal_grep is unavailable, report that connection error once without attempting another search.`,
  };
}

function blockedTool(kind: SearchKind, toolName: string): SearchPolicyDecision {
  return {
    block: true,
    reason: `baoer_signal_grep search policy blocked direct ${kind} tool ${toolName}; it did not run. Retry exactly once through baoer_signal_grep (possibly MCP-prefixed) with ${recovery(kind)}. Do not include this denial in the retry, use another search entry, or weaken the search. If baoer_signal_grep is unavailable, report that connection error once without attempting another search.`,
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
    const workingDirectoryValue = fields.workdir ?? fields.cwd;
    const workingDirectory =
      workingDirectoryValue === undefined
        ? process.cwd()
        : typeof workingDirectoryValue === "string" && workingDirectoryValue.length > 0
          ? workingDirectoryValue
          : undefined;
    const language: ShellLanguage =
      /powershell|pwsh/iu.test(`${toolName} ${shell}`) ||
      (process.platform === "win32" && toolName !== "bash")
        ? "powershell"
        : "bash";
    const match = await this.#shell.inspect(command, language);
    signal?.throwIfAborted();
    return match ? blockedMatch(command, match, workingDirectory) : undefined;
  }
}
