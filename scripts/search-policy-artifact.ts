import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import packageJson from "../package.json" with { type: "json" };

const repository = resolve(import.meta.dirname, "..");
export const searchPluginRoot = join(repository, "plugins/baoer-signal-grep");
export const SEARCH_PLUGIN_FILES = [
  "LICENSE",
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
  ".mcp.json",
  "kimi.plugin.json",
  "hooks/hooks.json",
  "hooks/search-policy.mjs",
  "hooks/tree-sitter.wasm",
  "hooks/tree-sitter-bash.wasm",
  "hooks/tree-sitter-powershell.wasm",
  "hooks/THIRD_PARTY_NOTICES.txt",
];

export async function buildSearchPlugin(root: string): Promise<void> {
  const hooks = join(root, "hooks");
  await mkdir(hooks, { recursive: true });
  await copyFile(join(repository, "LICENSE"), join(root, "LICENSE"));
  const result = await Bun.build({
    entrypoints: [join(repository, "src/search-policy-hook.ts")],
    outdir: hooks,
    naming: "search-policy.mjs",
    root: repository,
    target: "node",
    format: "esm",
    sourcemap: "none",
  });
  if (!result.success) throw new AggregateError(result.logs, "Search policy hook build failed");
  const notices = await Promise.all(
    [
      ["web-tree-sitter", "tree-sitter.wasm"],
      ["tree-sitter-bash", "tree-sitter-bash.wasm"],
      ["tree-sitter-powershell", "tree-sitter-powershell.wasm"],
    ].map(async ([dependency, file]) => {
      if (!dependency || !file) throw new Error("Invalid search policy artifact dependency");
      const directory = join(repository, "node_modules", dependency);
      await copyFile(join(directory, file), join(hooks, file));
      return `${dependency}\n${await readFile(join(directory, "LICENSE"), "utf8")}`;
    }),
  );
  await writeFile(join(hooks, "THIRD_PARTY_NOTICES.txt"), notices.join("\n\n"));
  const identity = {
    name: "baoer-signal-grep",
    version: packageJson.version,
    description:
      "Require baoer_signal_grep for conventional local searches while keeping development tools available.",
    author: { name: packageJson.author },
    homepage: packageJson.homepage,
    license: packageJson.license,
  };
  const mcp = {
    baoer_signal_grep: {
      command: "npx",
      args: [
        "--yes",
        "--package",
        `${packageJson.name}@latest`,
        "baoer_signal_grep_mcp",
        "--stdio",
      ],
      env: { npm_config_ignore_scripts: "true", ONNXRUNTIME_NODE_INSTALL_CUDA: "skip" },
    },
  };
  const files: Record<string, unknown> = {
    ".codex-plugin/plugin.json": {
      ...identity,
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "baoer_signal_grep",
        shortDescription: "Enforced local code search",
        longDescription: identity.description,
        defaultPrompt: "Search this project's code using baoer_signal_grep.",
        developerName: packageJson.author,
        category: "Productivity",
        capabilities: [],
      },
    },
    ".claude-plugin/plugin.json": identity,
    ".mcp.json": { mcpServers: mcp },
    "hooks/hooks.json": {
      hooks: {
        PreToolUse: [
          {
            matcher:
              "^(?:Bash|bash|PowerShell|powershell|Shell|shell|shell_command|exec_command|Grep|grep|Glob|GlobFile|SearchFileContent|SearchFiles|find)$",
            hooks: [
              {
                type: "command",
                command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/search-policy.mjs"',
                timeout: 5,
              },
            ],
          },
        ],
      },
    },
    "kimi.plugin.json": {
      ...identity,
      mcpServers: mcp,
      systemPrompt:
        "Use baoer_signal_grep for local content and filename searches. The plugin blocks conventional alternative search entries. Ordinary reads, edits, tests and builds remain available.",
      hooks: [
        {
          event: "PreToolUse",
          matcher: "^(?:Bash|Grep|Glob|Shell|SearchFileContent|SearchFiles|GlobFile)$",
          command: 'node "./hooks/search-policy.mjs"',
          timeout: 5,
        },
      ],
    },
  };
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), `${JSON.stringify(content, null, 2)}\n`);
    }),
  );
}
