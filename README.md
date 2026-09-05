# baoer_signal_grep

[简体中文](README.zh-CN.md) · English

A project librarian for Pi, Claude Code, Codex and other MCP clients: it helps your agent find the right shelf, open the useful pages and continue from where it left off.

## What it helps with

- **A precise question gets a direct answer.** Like asking for one book, a small search brings back the matching lines with their locations.
- **A broad question gets a map.** Instead of piling every page onto the desk, it shows which files contain the material, with excerpts to help you choose.
- **Follow-up questions keep their place.** The agent can continue through results or open the source it just found, like returning to a bookmark.
- **Names come with context.** Definitions, references and calls help the agent distinguish things that share a name; related tests remain clues to investigate.
- **Missing pages stay visible.** Incomplete results and changed source are called out, so the agent knows when it needs to look again.

## Common ways to use it

Ask your agent naturally:

- “Find where this error message comes from.”
- “Show me which files handle login, then open the relevant code.”
- “Where is this function defined, and who calls it?”
- “Find the tests related to this change.”
- “Continue from the results we just saw.”

## Install

Have `rg` available in `PATH`. MCP needs Node.js 22.19+; Pi needs Pi 0.84.3+ and Node.js 22.19+ or Bun 1.4+.

### Pi

```bash
pi install npm:baoer_signal_grep@1.2.0
```

Restart Pi after installing or updating. Pi uses this plugin for conventional searches by default; reads, edits, tests, builds and scripts remain available. To turn enforcement off, set `"enforceSearch": false` in `~/.pi/agent/baoer_signal_grep.json` and restart. Set `"locale": "zh-CN"` there for the Chinese interface.

### Claude Code or Codex: MCP connection

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.2.0 baoer_signal_grep_mcp --stdio
```

Restart the host after setup or updates. The server searches the active project; `BAOER_SIGNAL_GREP_MCP_CWD` can select a different root. An MCP-only connection adds the tool without disabling other search tools.

### Native plugins

For conventional search enforcement in other hosts:

- **Claude Code:** `/plugin marketplace add xcjy8bao/baoer_signal_grep`, then `/plugin install baoer-signal-grep@baoer-signal-grep`.
- **Codex:** `codex plugin marketplace add xcjy8bao/baoer_signal_grep`, then `codex plugin add baoer-signal-grep@baoer-signal-grep`; review and trust the hook in `/hooks`.
- **Kimi Code:** `/plugins install /absolute/path/plugins/baoer-signal-grep` using the plugin directory from this repository or installed package, then confirm trust and run `/reload`.

Restart after installation. To disable, use Claude Code `/plugin`, Codex `/hooks`, or Kimi `/plugins disable baoer-signal-grep` followed by `/reload`.

Local searches stay on your machine. Only grant access to files your agent is allowed to read. HTTP deployments need an authenticated gateway before public exposure; see [Security](SECURITY.md).

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [AGPL-3.0-only license](LICENSE)
