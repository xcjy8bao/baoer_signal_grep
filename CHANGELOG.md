# Changelog

## [1.2.3] - 2026-09-06

- Add native OMP (Oh My Pi) compatibility with the `baoer_signal_grep` tool, profile-aware configuration, direct-search enforcement, lifecycle cleanup and a self-contained published extension bundle.
- Keep the existing Pi, Claude Code, Codex CLI/App, Kimi Code and MCP integrations unchanged while sharing configuration and search-policy behavior across hosts.

## [1.2.2] - 2026-09-06

- Add inclusive `modifiedAfter` and exclusive `modifiedBefore` Unix-millisecond filters for worktree searches, with the same verified metadata behavior for content and filename discovery.
- Add bounded Python `mode="outline"` support for indentation-based class, function and method ranges. The result explicitly remains outline evidence rather than compiler bindings or runtime call relationships.
- Validate path, pattern and file-filter sizes before starting search processes, and explain effective scope and modification-time bounds in returned details.
- Keep analysis bodies concise while retaining per-item evidence in structured `details`, and make missing Universal Ctags actionable with a supported outline alternative.
- Calibrate native search enforcement so output-only `grep`/`egrep`/`fgrep` (and PowerShell `Select-String`/`sls`) filters remain usable while alternate search producers and wrappers stay blocked.

## [1.2.1] - 2026-09-06

- Bundle platform-specific ripgrep through a pinned dependency so MCP and Pi searches work without `rg` in `PATH`, including installations with lifecycle scripts disabled. Use one executable resolver for content, filename and Git-source searches, with an explicit `BAOER_SIGNAL_GREP_RG_PATH` override and actionable dependency errors.
- Make every MCP installation command follow the latest published version when the server starts.

## [1.2.0] - 2026-09-05

- Fix missing file maps and matching lines in MCP clients that select structured results.
- Make `baoer_signal_grep` the default conventional search tool in Pi; add native enforcement plugins for Claude Code, Codex and Kimi Code. MCP-only connections remain non-enforcing.
- Add filename discovery, whole-word and strict-scope searches, JS/TS symbol and call navigation, module relationships, and code-pattern search.
- Add optional offline natural-language code discovery after explicit model installation.
- Improve large-result pagination, partial-result reporting and cancellation handling.

## [1.0.0] - 2026-09-04

- Add local stdio MCP connections for Claude Code, Codex and compatible clients.
- Rename the package, tool, executable and Pi configuration to the `baoer_signal_grep` family. MCP environment variables now use `BAOER_SIGNAL_GREP_MCP_*`; old names are not aliases.

## [0.7.0] - 2026-09-03

- Add an HTTP MCP server with configurable browser origins and session limits.

## [0.6.6] - 2026-09-03

- Add optional display redaction, clearer search coverage and continuation errors, and broader multi-term searches.

## [0.6.2] - 2026-09-03

- Allow explicitly requested external paths with protected-path restrictions.

## [0.6.0] - 2026-09-02

- Expand code analysis, source inspection and multi-term search.

## Earlier releases

Versions 0.1–0.5 introduced the Pi extension, automatic file summaries, matching-line pagination and bounded source inspection, with subsequent search and display fixes.
