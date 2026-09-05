# baoer_signal_grep

[简体中文](README.zh-CN.md) · English

Local code search and navigation for Pi, Claude Code, Codex and other MCP clients. Small searches return matching lines directly; broad searches return a file map with excerpts. Follow-up requests can page through matches or inspect the source.

**Upgrading:** version 1.2.0 fixes search text missing in some MCP clients. Update the package and restart your host. Since 1.0.0, the tool is `baoer_signal_grep` and MCP variables use `BAOER_SIGNAL_GREP_MCP_*`; retired names are not aliases.

## Install

Requires `rg` in `PATH`. MCP requires Node.js 22.19+; Pi requires Pi 0.84.3+ and Node.js 22.19+ or Bun 1.4+.

JS/TS/TSX and Go recognition is included. Go structure-aware modes on Windows ARM64 require a locally buildable Go parser; ordinary search remains available. Universal Ctags is optional for additional language ranges.

### Pi

```bash
pi install npm:baoer_signal_grep
```

Restart Pi. **Conventional searches use this tool by default:** built-in grep/find and direct search commands are blocked. Reading, editing, directory browsing, tests, builds and scripts remain available.

To use the Chinese interface, create `~/.pi/agent/baoer_signal_grep.json`:

```json
{ "locale": "zh-CN" }
```

Add `"enforceSearch": false` to that configuration and restart Pi to disable search enforcement.

### Claude Code and Codex: MCP only

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_mcp --stdio
```

The server searches the active project. Set `BAOER_SIGNAL_GREP_MCP_CWD` to override its root. MCP-only installation adds the search tool without disabling other tools. Pi and Bun are not required for MCP.

### Native plugins with search enforcement

- **Claude Code:** run `/plugin marketplace add xcjy8bao/baoer_signal_grep`, then `/plugin install baoer-signal-grep@baoer-signal-grep`.
- **Codex:** run `codex plugin marketplace add xcjy8bao/baoer_signal_grep`, then `codex plugin add baoer-signal-grep@baoer-signal-grep`. Review and trust the plugin hook through `/hooks`.
- **Kimi Code:** run `/plugins install /absolute/path/plugins/baoer-signal-grep` using the plugin directory from this repository or installed package, confirm trust, then `/reload`.

Restart the host after installation or an update. These plugins include the MCP connection and block conventional alternate search entries. Enforcement requires an enabled, trusted, working hook; it is not an OS sandbox and does not prevent custom programs from searching.

To disable: use Claude Code `/plugin`; Codex `/hooks` or `codex plugin remove baoer-signal-grep@baoer-signal-grep`; or Kimi `/plugins disable baoer-signal-grep` followed by `/reload`.

## Usage

Ask the agent to find code normally, or call `baoer_signal_grep` with a request such as:

```json
{ "pattern": "authorize", "literal": true, "path": "src" }
```

| Task                                  | Request options                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Match text                            | `pattern`; optional `literal`, `ignoreCase`, `wholeWord`, `glob`, `exclude`                        |
| Require several terms / find any term | `allOf: ["first", "second"]` / `anyOf: ["first", "second"]`                                        |
| File map or matching lines            | `mode: "summary"` / `mode: "matches"`; omit mode for automatic selection                           |
| Restrict search to a path             | `path: "src/api", scope: "strict"`                                                                 |
| Continue results                      | Copy the returned `nextRequest` or `cursor`                                                        |
| Inspect source                        | `mode: "inspect", path: "src/api.ts", line: 12`; batches accept up to five `targets`               |
| Find filenames                        | `mode: "files", query: "request handler"`                                                          |
| Find code shapes                      | `mode: "structure", pattern: "compare($X, $X)"`                                                    |
| Locate symbols and uses               | `definitions`, `references`, `implementations`, `callers`, `callees` with `path`, `line`, `column` |
| Explore modules                       | `dependencies`, `dependents`, `outline`, `imports`, `tests` or `impact`                            |
| Search a Git change                   | `changes: {"base":"HEAD","scope":"lines","side":"new"}`                                            |
| Natural-language discovery            | `mode: "concept", query: "Where is access denied?"` after installing the optional model            |

Positions are one-based; columns use UTF-16. JS/TS compiler navigation follows static code relationships. Related tests and similarity-ranked candidates are leads, not proof of runtime behavior or passing tests. The tool's input schema describes each mode's accepted parameters.

Content search with no path starts at the project root. A zero-result subpath search can retry from that root; use `scope: "strict"` to prevent expansion. `exclude` contains file/path globs. Hidden files are searchable; `.git` internals are excluded.

Results show partial coverage or truncation when applicable. Copy returned continuation requests instead of assuming one page contains everything. Source changes can invalidate a continuation. Hosts may apply their own output limits.

### Optional local concept model

```bash
npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_model --install-model
```

This explicit installation downloads about 129 MiB of public model assets to `~/.cache/baoer_signal_grep/models/`. Set `SIGNAL_GREP_MODEL_DIR` to choose the parent directory. Concept searches then run offline; ordinary searches need no model. Missing model assets produce an error rather than an automatic download.

## HTTP MCP

For clients that need HTTP, install the server on the machine containing the project:

```bash
npm install --global baoer_signal_grep@1.2.0
BAOER_SIGNAL_GREP_MCP_CWD=/path/to/project baoer_signal_grep_mcp --http
```

On PowerShell, set `$env:BAOER_SIGNAL_GREP_MCP_CWD = "C:\path\to\project"` before running the executable.

The default endpoint is `http://127.0.0.1:3000/mcp`. Configure `BAOER_SIGNAL_GREP_MCP_HOST`, `BAOER_SIGNAL_GREP_MCP_PORT` and `BAOER_SIGNAL_GREP_MCP_CWD` as needed. Browser clients also require `BAOER_SIGNAL_GREP_MCP_ALLOWED_ORIGINS` with a comma-separated origin list. Session limits can be configured with `BAOER_SIGNAL_GREP_MCP_MAX_SESSIONS` and `BAOER_SIGNAL_GREP_MCP_SESSION_IDLE_MS`.

**HTTP has no built-in authentication.** Keep it on loopback or place it behind an authenticated gateway. The server reads files where it runs; it does not SSH to another machine.

## Privacy and access

Local searches run on your machine without telemetry or uploading source. Installing the package or optional model can access the network; remote HTTP requests carry searches and results to the configured server.

Explicit absolute paths and `..` can access other paths readable by the process, with protected-path restrictions. Files inside a project can contain secrets; optional `redact: true` masks common credential values but cannot identify every sensitive value. See [Security](SECURITY.md).

[Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [AGPL-3.0-only license](LICENSE)
