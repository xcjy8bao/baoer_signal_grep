export type SearchKind = "content" | "files";
export type ShellLanguage = "bash" | "powershell";

export interface CommandDecision {
  kind?: SearchKind;
  nested?: { command: string; language: ShellLanguage };
}

const contentCommands = new Set([
  "rg",
  "ripgrep",
  "grep",
  "egrep",
  "fgrep",
  "ag",
  "ack",
  "ack-grep",
  "ugrep",
  "pt",
  "sift",
  "findstr",
]);
const fileCommands = new Set(["find", "fd", "fdfind", "locate", "mlocate", "plocate"]);

export function executableName(value: string): string {
  return (
    value
      .split(/[\\/]/u)
      .at(-1)
      ?.replace(/\.(?:exe|cmd|bat)$/iu, "") ?? value
  );
}

function afterOptions(args: readonly (string | null)[], valueOptions: ReadonlySet<string>): number {
  let index = 0;
  while (index < args.length) {
    const value = args[index];
    if (value === null || value === undefined) return args.length;
    if (value === "--") return index + 1;
    if (!value.startsWith("-")) return index;
    index += valueOptions.has(value) ? 2 : 1;
  }
  return index;
}

const gitValueOptions = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
]);
const envValueOptions = new Set(["-u", "--unset", "-C", "--chdir"]);
const wrapperValueOptions: Readonly<Record<string, ReadonlySet<string>>> = {
  env: envValueOptions,
  sudo: new Set([
    "-u",
    "--user",
    "-g",
    "--group",
    "-h",
    "--host",
    "-p",
    "--prompt",
    "-C",
    "--close-from",
    "-T",
    "--command-timeout",
    "-r",
    "--role",
    "-t",
    "--type",
  ]),
  nice: new Set(["-n", "--adjustment"]),
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  time: new Set(["-f", "--format", "-o", "--output"]),
  xargs: new Set([
    "-a",
    "--arg-file",
    "-d",
    "--delimiter",
    "-E",
    "-I",
    "-L",
    "-n",
    "--max-args",
    "-P",
    "--max-procs",
    "-s",
    "--max-chars",
  ]),
  exec: new Set(["-a"]),
  command: new Set(),
  nohup: new Set(),
  busybox: new Set(),
};

/** Classify executable positions only; never inspect ordinary argument text as a command. */
export function classifyCommand(
  argv: readonly (string | null)[],
  language: ShellLanguage,
  depth = 0,
): CommandDecision {
  if (depth > 8)
    throw new Error("Search policy wrapper nesting exceeds 8 levels; simplify the command");
  const first = argv[0];
  if (first === null || first === undefined) return {};
  const rawName = executableName(first);
  const name = language === "powershell" ? rawName.toLowerCase() : rawName;
  const args = argv.slice(1);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "--version")) return {};
  if (contentCommands.has(name)) return { kind: "content" };
  if (fileCommands.has(name)) return { kind: "files" };
  if (language === "powershell") {
    if (name === "select-string" || name === "sls") return { kind: "content" };
    if (
      ["get-childitem", "gci", "dir", "ls"].includes(name) &&
      args.some((arg, index) => {
        if (arg === null) return false;
        if (/^-(?:recurse|r|filter|include)(?::|$)/iu.test(arg)) return true;
        // LiteralPath treats brackets and wildcard characters as ordinary path text.
        if (/^-literalpath(?::|$)/iu.test(arg) || /^-literalpath$/iu.test(args[index - 1] ?? ""))
          return false;
        return /[*?[]/u.test(arg);
      })
    )
      return { kind: "files" };
  }
  if (name === "git") {
    return args[afterOptions(args, gitValueOptions)] === "grep" ? { kind: "content" } : {};
  }
  if (["bash", "sh", "zsh", "dash", "ksh"].includes(name)) {
    const index = args.findIndex((arg) => arg !== null && /^-[a-z]*c[a-z]*$/u.test(arg));
    const command = index >= 0 ? args[index + 1] : undefined;
    return typeof command === "string" ? { nested: { command, language: "bash" } } : {};
  }
  if (name === "pwsh" || name === "powershell") {
    const index = args.findIndex((arg) => arg !== null && /^-(?:command|c)$/iu.test(arg));
    const command = index >= 0 ? args[index + 1] : undefined;
    return typeof command === "string" ? { nested: { command, language: "powershell" } } : {};
  }
  if (name === "env") {
    const split = args
      .slice(0, afterOptions(args, envValueOptions))
      .findIndex(
        (arg) => arg === "-S" || arg === "--split-string" || arg?.startsWith("--split-string="),
      );
    const option = split >= 0 ? args[split] : undefined;
    const command = option?.startsWith("--split-string=")
      ? option.slice("--split-string=".length)
      : split >= 0
        ? args[split + 1]
        : undefined;
    if (typeof command === "string") return { nested: { command, language: "bash" } };
  }
  const options = wrapperValueOptions[name];
  if (!options) return {};
  if (name === "command" && args.some((arg) => arg === "-v" || arg === "-V")) return {};
  let start = afterOptions(args, options);
  if (name === "timeout") start += 1;
  if (name === "env") {
    while (typeof args[start] === "string" && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(args[start] ?? ""))
      start += 1;
  }
  return classifyCommand(args.slice(start), language, depth + 1);
}
