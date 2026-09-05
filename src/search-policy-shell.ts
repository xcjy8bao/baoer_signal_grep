import { fileURLToPath } from "node:url";
import { Language, Parser, type Node } from "web-tree-sitter";
import { classifyCommand, type SearchKind, type ShellLanguage } from "./search-policy-commands.js";

export const MAX_POLICY_COMMAND_BYTES = 64 * 1024;
const MAX_SHELL_NESTING = 4;

function literalWord(node: Node, language: ShellLanguage): string | null {
  const text = node.text;
  if (language === "powershell") {
    if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
    if (node.descendantsOfType(["variable", "sub_expression"]).length > 0) return null;
    const unquoted = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    return unquoted.replace(/`([`"'$])/gu, "$1");
  }
  if (node.type === "raw_string") return text.slice(1, -1);
  if (node.type === "word" || node.type === "string_content" || node.type === "number")
    return text.replace(/\\(.)/gsu, "$1");
  if (["command_name", "concatenation", "string"].includes(node.type)) {
    let result = "";
    for (const child of node.namedChildren) {
      if (!child) continue;
      const part = literalWord(child, language);
      if (part === null) return null;
      result += part;
    }
    return result;
  }
  return null;
}

function commandWords(node: Node, language: ShellLanguage): Array<string | null> {
  const name = node.childForFieldName(language === "bash" ? "name" : "command_name");
  if (!name) return [];
  const args =
    language === "bash"
      ? node.childrenForFieldName("argument").filter((child): child is Node => child !== null)
      : (node
          .childForFieldName("command_elements")
          ?.namedChildren.filter(
            (child): child is Node =>
              child !== null && !["command_argument_sep", "redirection"].includes(child.type),
          ) ?? []);
  return [literalWord(name, language), ...args.map((arg) => literalWord(arg, language))];
}

/** WASM grammars are shipped with the hook; parsing never reads shell scripts or executes code. */
export class ShellSearchPolicy {
  readonly #assets: URL;
  #initialization: Promise<void> | undefined;
  readonly #languages = new Map<ShellLanguage, Promise<Language>>();

  constructor(assets: URL) {
    this.#assets = assets;
  }

  async inspect(command: string, language: ShellLanguage): Promise<SearchKind | undefined> {
    if (Buffer.byteLength(command, "utf8") > MAX_POLICY_COMMAND_BYTES)
      throw new Error("Search policy command exceeds 64 KiB; split the shell request");
    this.#initialization ??= Parser.init({
      locateFile: () => fileURLToPath(new URL("tree-sitter.wasm", this.#assets)),
    });
    await this.#initialization;
    // Both grammars are needed for literal bash -c / pwsh -Command wrappers.
    for (const shell of ["bash", "powershell"] as const) {
      if (!this.#languages.has(shell))
        this.#languages.set(
          shell,
          Language.load(fileURLToPath(new URL(`tree-sitter-${shell}.wasm`, this.#assets))),
        );
    }
    const [bash, powershell] = await Promise.all([
      this.#languages.get("bash"),
      this.#languages.get("powershell"),
    ]);
    if (!bash || !powershell) throw new Error("Search policy grammar initialization failed");
    return this.#inspect(command, language, { bash, powershell }, 0);
  }

  #inspect(
    command: string,
    language: ShellLanguage,
    grammars: Record<ShellLanguage, Language>,
    depth: number,
  ): SearchKind | undefined {
    if (depth > MAX_SHELL_NESTING)
      throw new Error("Search policy shell nesting exceeds 4 levels; simplify the command");
    const parser = new Parser();
    try {
      parser.setLanguage(grammars[language]);
      const deadline = performance.now() + 100;
      const tree = parser.parse(command, null, {
        progressCallback: () => performance.now() > deadline,
      });
      if (!tree)
        throw new Error("Search policy parsing exceeded its time budget; simplify the command");
      try {
        const commands = tree.rootNode.descendantsOfType("command");
        for (const node of commands) {
          if (!node) continue;
          const decision = classifyCommand(commandWords(node, language), language);
          if (decision.kind) return decision.kind;
          if (decision.nested) {
            const nested = this.#inspect(
              decision.nested.command,
              decision.nested.language,
              grammars,
              depth + 1,
            );
            if (nested) return nested;
          }
        }
        if (tree.rootNode.hasError)
          throw new Error(
            `Search policy cannot parse this ${language} command; use a supported shell command or invoke a script file`,
          );
        return undefined;
      } finally {
        tree.delete();
      }
    } finally {
      parser.delete();
    }
  }
}
