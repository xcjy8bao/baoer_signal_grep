# baoer_signal_grep

English · [简体中文](README.zh-CN.md)

**A general-purpose local search plugin that helps agents find files, documents, notes, logs and other text material.**

Think of a patient librarian: describe what you need, and it helps locate the shelf, open the relevant page and follow the next lead. A small search brings the passages straight to you. A broad search starts with a map so you can decide where to look first.

## How it helps

### Find a passage without opening every folder

Looking for an error message, a sentence or a name is like giving a librarian a keyword. When there are only a few matches, the plugin returns their text and locations directly, saving repeated file opening and scrolling.

### Start with a map when the collection is large

“Which documents mention refunds?” can produce a lot of material. The plugin first presents matching files and snippets, like marking promising stops on a map. The agent can choose what to open before filling the conversation with entire documents.

### Keep your bookmark for the next question

“Continue from where we stopped” can follow the existing result to its next page. The agent can also open the surrounding text of a match, like returning to a bookmarked passage to read what came before and after it.

### Give several search conditions together

“Find files mentioning both the customer and a refund” works like selecting documents with two labels. “Any of these words will do” works like handing over a shortlist. Multiple conditions can be expressed together to reduce repeated searches.

### Choose the drawer you want searched

Ask the agent to restrict a search to one folder when that is the scope you need. If you remember only part of a filename, start by finding the file and then inspect its contents—like narrowing a cabinet down to a shelf and then a document.

### Know what has been shown

Long results arrive in pages with a way to continue. When the original material changes, the plugin asks for a fresh check. Like a careful research assistant, it distinguishes the passages already shown from the pages still to come.

## Common uses

Tell your agent what you need, for example:

- “Which documents mention the refund deadline?”
- “Find this error in the logs and show the surrounding messages.”
- “Find files containing both the customer name and the order number.”
- “List matches for any of these keywords.”
- “I remember part of the meeting-notes filename. Help me find it.”
- “Search only this folder; do not expand the scope.”
- “Show me which files contain relevant text, then open two of them.”
- “Continue from the previous page and show the remaining passages.”

The plugin provides file locations and actual text so the agent can answer from the material and you can check the original yourself.

## Install

Have `rg` available in `PATH`. MCP needs Node.js 22.19+; Pi needs Pi 0.84.3+ and Node.js 22.19+ or Bun 1.4+.

### Pi

```bash
pi install npm:baoer_signal_grep
```

Restart Pi after installing or updating. Pi uses this plugin for conventional searches by default; reads, edits, tests, builds and scripts remain available. To turn enforcement off, set `"enforceSearch": false` in `~/.pi/agent/baoer_signal_grep.json` and restart. Set `"locale": "zh-CN"` there for the Chinese interface.

### Claude Code or Codex: MCP connection

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

`@latest` follows the newest published version when MCP starts. Restart the host to load updates. The server searches the active project; `BAOER_SIGNAL_GREP_MCP_CWD` can select a different root. An MCP-only connection adds the tool without disabling other search tools.

### Native plugins

For conventional search enforcement in other hosts:

- **Claude Code:** `/plugin marketplace add xcjy8bao/baoer_signal_grep`, then `/plugin install baoer-signal-grep@baoer-signal-grep`.
- **Codex:** `codex plugin marketplace add xcjy8bao/baoer_signal_grep`, then `codex plugin add baoer-signal-grep@baoer-signal-grep`; review and trust the hook in `/hooks`.
- **Kimi Code:** `/plugins install /absolute/path/plugins/baoer-signal-grep` using the plugin directory from this repository or installed package, then confirm trust and run `/reload`.

Restart after installation. To disable, use Claude Code `/plugin`, Codex `/hooks`, or Kimi `/plugins disable baoer-signal-grep` followed by `/reload`.

Local searches stay on your machine. Only grant access to files your agent is allowed to read. HTTP deployments need an authenticated gateway before public exposure; see [Security](SECURITY.md).

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [AGPL-3.0-only license](LICENSE)
