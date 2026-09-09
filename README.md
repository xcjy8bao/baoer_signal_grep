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

### Recover when the remembered wording is not exact

Use `mode: "hybrid"` with one natural-language `query` when a sentence may have been remembered with different wording. Hybrid always runs an exact literal search and the installed local Concept model under one owned request. Exact evidence appears first; semantic candidates are clearly labeled, ranked only by similarity and removed when they overlap an exact match. The initial page shares counts, coverage, source references, one inspection cursor and a compact preview instead of concatenating two complete responses. `conceptLimit` changes only the non-overlapping semantic supplement (default 3, maximum 20); it never displaces literal evidence. The returned matches request opens the same snapshot's complete exact-first pagination without rerunning either search.

Concept ranking covers every UTF-8 passage admitted by the request's documented source budget; it no longer samples a fixed prefix of the scope. Passages that exceed the model token window are ranked through overlapping token-safe windows, so later text is not silently discarded. Offline embeddings are cached by content, model revision and chunking revision in a bounded 512 MiB local cache. Repeated content is reused, changed content misses naturally, and cache write or cleanup failures remain visible in the result.

If Concept inference fails or times out, hybrid still returns the exact literal page with `coverage.conceptCandidates` set to `skipped` and an explicit reason; it does not discard a completed literal search. Bound interactive Concept latency with `BAOER_SIGNAL_GREP_CONCEPT_TIMEOUT_MS` (integer milliseconds from 1000 through 3600000; default 600000). Admission planning counts (`filesEnumerated`, `filesAdmitted`, `filesExcludedBeforeInference`, `passagesQueued`) stay visible so large libraries can be narrowed with `path` or `glob` before another attempt.

### Give several search conditions together

“Find files mentioning both the customer and a refund” works like selecting documents with two labels. “Any of these words will do” works like handing over a shortlist. Multiple conditions can be expressed together to reduce repeated searches.

### Choose the drawer you want searched

Ask the agent to restrict a search to one folder when that is the scope you need. If you remember only part of a filename, start by finding the file and then inspect its contents—like narrowing a cabinet down to a shelf and then a document.

### Know what has been shown

Long results arrive in pages with a way to continue. When the original material changes, the plugin asks for a fresh check. Like a careful research assistant, it distinguishes the passages already shown from the pages still to come.

### Narrow by file age or inspect code structure

Worktree searches can use `modifiedAfter` and `modifiedBefore` as Unix millisecond bounds. The lower bound is inclusive and the upper bound is exclusive, so a time window can be expressed without changing the search pattern. The same filter applies to content and filename searches; unavailable file metadata is reported as incomplete evidence rather than silently treated as a match.

Use `mode: "outline"` with a file path to see bounded symbol ranges. JavaScript and TypeScript use the syntax provider; Python files use indentation-based class, function and method evidence. Python outline results are useful for finding a range to inspect, but do not claim compiler bindings, runtime calls or test coverage. `mode: "tests"` currently supports related-test candidates for JavaScript and TypeScript sources; Python requests return an explicit partial unsupported result and should use `mode: "outline"` instead.

The readable result keeps the main evidence compact. Per-item ranges, counts, coverage and continuation requests remain in structured `details`, so a client can use the structured fields without requiring a second search.

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
- “Search files modified since this Unix millisecond timestamp.”
- “I may remember this sentence incorrectly; search exact and semantic evidence together.”
- “Show the Python classes and functions in this file, then inspect the method that matters.”

The plugin provides file locations and actual text so the agent can answer from the material and you can check the original yourself.

## Install

MCP needs Node.js 22.19+; Pi needs Pi 0.84.3+ and Node.js 22.19+ or Bun 1.4+. The package installs a platform-specific ripgrep binary through pinned `@vscode/ripgrep`; no system `rg`, shell function or `PATH` setup is required. Keep optional dependencies enabled during installation. Ripgrep installation works with lifecycle scripts disabled, and searches do not download executables.

To use your own ripgrep, set `BAOER_SIGNAL_GREP_RG_PATH` in the MCP server or Pi process environment to the absolute executable file path (for example `/opt/homebrew/bin/rg`), then restart the host. This applies to content, filename and Git-source searches. Paths containing spaces are supported; aliases, shell functions, relative paths and `~` expansion are not. An invalid override fails explicitly without selecting another executable. If the platform package is missing or unusable, reinstall with optional dependencies enabled or configure your own binary. Native search enforcement remains active during dependency failures; use the host's plugin controls below if you need to disable it while repairing the installation.

### Pi

```bash
pi install npm:baoer_signal_grep
```

Restart Pi after installing or updating. Pi uses this plugin for conventional searches by default; reads, edits, tests, builds and scripts remain available. `enforceSearch` accepts `"hard"` (the default), `"prefer"` (keep the dedicated tool and guidance without denying alternative searches), or `"off"`. Existing `true` and `false` values remain aliases for `"hard"` and `"off"`. Configure it in `~/.pi/agent/baoer_signal_grep.json`, then restart. Set `"locale": "zh-CN"` there for the Chinese interface.

### OMP (Oh My Pi)

```bash
omp install npm:baoer_signal_grep@latest
```

Restart OMP after installing or updating. The package declares its native OMP extension and registers `baoer_signal_grep`. In the default hard mode it removes OMP's built-in `grep` and `glob` entries from the active tool set and blocks direct search commands while leaving reads, edits, tests, builds and other development tools available. Prefer mode keeps both the dedicated and alternative tools active, adds model guidance, and does not deny shell searches. OMP's active profile is respected; the default configuration file is `~/.omp/agent/baoer_signal_grep.json`, and a named profile uses `~/.omp/profiles/<profile>/agent/baoer_signal_grep.json`. Set `enforceSearch` to `"hard"` (default), `"prefer"`, or `"off"` in the active file, then restart OMP. Existing `true` and `false` values remain compatible. Set `"locale": "zh-CN"` to use the Chinese interface.

### Claude Code or Codex: MCP connection

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@latest baoer_signal_grep_mcp --stdio
```

`@latest` follows the newest published version when MCP starts. Restart the host to load updates. The server searches the active project; `BAOER_SIGNAL_GREP_MCP_CWD` can select a different root. An MCP-only connection adds the tool without disabling other search tools.

MCP returns readable text plus structured evidence by default. If a host serializes both forms into the model context, set `BAOER_SIGNAL_GREP_MCP_OUTPUT_MODE=model` in that MCP server's environment and restart it. Model mode omits `structuredContent` and its advertised output schema, advertises concise workflow guidance, and selects the smaller of the standard page and a compact view of the same retained analysis snapshot. Repeated paths and inspect requests are shared, hybrid does not concatenate separate literal and Concept bodies, and outline excerpts are deferred to version-checked inspection. Counts, coverage, partial status, reasons and continuation requests remain visible. Use `text` to omit structured output while preserving the complete standard text and full compatibility guidance, or retain the default `structured` mode for programmatic consumers and clients that expose only structured results. Any other value fails at startup. The bundled Claude Code, Codex and Kimi native plugins select `model`; direct MCP connections retain the compatible default unless configured explicitly.

`paths` selects exact retained files from an existing cursor; a new search accepts one `path`. Split unrelated roots into separate requests rather than replacing them with a broader common parent. Markdown inspection uses a bounded line window and does not require Universal Ctags; missing structure providers remain visible when they affect code structure inspection.

### Native plugins

For conventional search enforcement in other hosts:

- **Claude Code:** `/plugin marketplace add xcjy8bao/baoer_signal_grep`, then `/plugin install baoer-signal-grep@baoer-signal-grep`.
- **Codex:** `codex plugin marketplace add xcjy8bao/baoer_signal_grep`, then `codex plugin add baoer-signal-grep@baoer-signal-grep`; review and trust the hook in `/hooks`.
- **Kimi Code:** `/plugins install /absolute/path/plugins/baoer-signal-grep` using the plugin directory from this repository or installed package, then confirm trust and run `/reload`.

Kimi Code's web mode can start plugin MCP servers from its installation directory. If relative MCP searches resolve to the wrong project, keep the native plugin for search enforcement and add a project-local `.kimi-code/mcp.json` entry with the same `baoer_signal_grep` server and an explicit absolute `cwd` for that project.

Restart after installation. Native hooks use hard enforcement by default. To keep the native plugin, MCP tool and model guidance without denying conventional searches, start the host with `BAOER_SIGNAL_GREP_ENFORCE_SEARCH=prefer`; use `off` to disable only hook enforcement. Accepted values are `hard`, `prefer`, and `off`; an unsupported value fails closed instead of silently allowing a search. The setting is inherited from the host process, so a project cannot lower a user's policy merely by committing a repository configuration file. You can still disable the complete integration through Claude Code `/plugin`, Codex `/hooks`, or Kimi `/plugins disable baoer-signal-grep` followed by `/reload`.

In hard mode, a direct search such as `grep warning report.txt` is denied. A trailing filter such as `cat report.txt | grep warning` remains available because it filters output from a non-search producer; `find src | grep test` and `rg warning src | grep result` remain denied because their pipelines already contain a direct search producer. If one subcommand in a compound shell call is denied, the host executes none of that call. The denial identifies the detected search and tells the agent to retry non-search operations separately.

Local searches stay on your machine. Only grant access to files your agent is allowed to read. HTTP deployments need an authenticated gateway before public exposure; see [Security](SECURITY.md).

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [AGPL-3.0-only license](LICENSE)
