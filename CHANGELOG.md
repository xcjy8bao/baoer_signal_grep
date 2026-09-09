# Changelog

## [1.4.1] - 2026-09-09

- Fix Concept token-window binary search stalls on UTF-16 surrogate-pair interiors (emoji and other astral characters). `maximumTokenSafeEnd` and `overlapStart` now strictly advance `low`, minimum overlap progress crosses a complete code point, and `tokenSafeWindows` rejects a non-advancing overlap instead of spinning until the 10-minute deadline.
- Add an explicit iteration budget so a future tokenizer or boundary regression fails fast with a clear diagnostic instead of hanging.
- Keep hybrid literal evidence when Concept inference fails: semantic candidates are marked `skipped`, reasons name the failure, and the request returns partial hybrid results instead of discarding an in-flight exact search.
- Allow hosts to bound Concept inference with `BAOER_SIGNAL_GREP_CONCEPT_TIMEOUT_MS` (1s–1h). Missing or empty keeps the 10-minute default; invalid values fail closed with an explicit configuration error.
- Surface Concept admission planning in `counts`/`coverage` (`filesEnumerated`, `filesAdmitted`, `filesSkippedEmpty`, `filesUnavailable`, `passagesQueued`, `admissionPlan`) and warn when interactive Concept enumerates more than 500 files. Empty files remain a normal skip and do not mark Concept coverage partial.

## [1.4.0] - 2026-09-09

- Identify the exact Bash or PowerShell subcommand that triggered strict native search enforcement, including its sequence and bounded source position, while preserving the existing allow/deny policy. Denials now explain that the host call is atomic and instruct agents to split non-search work before routing only the search through `baoer_signal_grep`.
- Add explicit `"hard"`, `"prefer"`, and `"off"` search-enforcement modes while retaining `true` and `false` configuration compatibility. Hard enforcement remains the default; prefer mode keeps the dedicated tool and model guidance without denying conventional searches.
- Let Claude Code, Codex and Kimi native hooks select enforcement through `BAOER_SIGNAL_GREP_ENFORCE_SEARCH=hard|prefer|off`. Missing configuration remains hard, and unsupported values fail closed with a visible configuration error.
- Document why output-only pipeline filters remain available while direct content searches and pipelines containing another search producer remain blocked.

## [1.3.2] - 2026-09-09

- Reduce the native model-host MCP description and workflow instructions while preserving ordinary search, strict scope, completeness, cursor and inspection recovery guidance. Structured and text consumers retain the full compatibility instructions.
- Make invalid new-search `paths` requests explain the scope-preserving repair: run one request per path instead of copying a request that was never returned or silently widening to a common parent.
- Inspect Markdown through a bounded line window without invoking or repeatedly warning about an unavailable Universal Ctags provider; code structure provider failures remain explicit.
- State that a blocked search denies the entire tool call before execution, so no preceding or following compound-shell operation can be mistaken for completed work.

## [1.3.1] - 2026-09-09

- Rank every Concept passage admitted by the documented source budget instead of stopping after 128 candidates. Token-overlong passages now use overlapping tokenizer-verified windows and max-pooled similarity, so no ranking relies on a silently truncated prefix.
- Reuse offline query and passage embeddings through a model/chunking-versioned, content-addressed 512 MiB cache. Cache hits, misses, ranked windows and cache maintenance failures are observable; changed content invalidates naturally.
- Allow ordinary compound shell commands containing unsupported zsh argument syntax while continuing to block recognized search executables recovered from the same syntax tree.

## [1.3.0] - 2026-09-08

- Add fixed `mode=hybrid` retrieval that always runs exact literal and local Concept searches under one cancellation owner, ranks exact evidence first, removes overlapping semantic passages and retains a configurable top semantic supplement (default 3, maximum 20).
- Store hybrid evidence in one version-checked pageable snapshot with an exact-plus-semantic preview, shared source references and one inspection cursor. Counts distinguish ranked, deduplicated, selected and omitted semantic candidates, while literal, Concept, deduplication, inspection and retention coverage remain independently observable.
- Keep hybrid model output below equivalent separate literal and Concept responses by sharing metadata and continuation instructions, limiting the initial preview and deferring exhaustive exact-first evidence to the same snapshot's match pages.

## [1.2.3-7] - 2026-09-08

- Add opt-in MCP text and model output modes for hosts that serialize both readable and structured results into model context. Model mode selects the smaller of the standard page and a compact analysis view without repeated paths, inspect requests or outline excerpts while preserving counts, coverage, partial state and continuations; the existing structured result remains the default.

## [1.2.3-6] - 2026-09-08

- Expose bounded Concept score profiles so broad candidate results remain distinguishable without treating similarity as a relevance threshold.
- Label syntax-fallback source windows explicitly and provide executable continuation requests after parser errors so large TSX inspections do not imply semantic completeness.
- Make Concept field-validation errors list the accepted request fields.

## [1.2.3-5] - 2026-09-08

- Clarify that `within` is only valid with `allOf`, so ordinary single-pattern MCP calls omit it and receive an actionable repair message when a host re-injects it.
- Document the project-local Kimi Code MCP `cwd` workaround for web sessions that launch servers from the CLI installation directory.

## [1.2.3-4] - 2026-09-07

- Keep impact and related-test navigation inside the target's containing Git repository instead of a broad MCP cwd.
- Preserve readable matches when ripgrep skips inaccessible descendants, reporting skipped paths as partial coverage while keeping root access failures fatal.
- Advertise that related-test navigation supports JS/TS/TSX only and return an actionable partial result for Python sources.

## [1.2.3-3] - 2026-09-07

- Recover from oversized ripgrep match lines during impact and broad searches, retaining partial status and source diagnostics instead of aborting the search.

## [1.2.3-2] - 2026-09-06

- Fix redaction coverage for suffixed and compound sensitive variable names, including service keys and access-token variants.
- Make large test and impact discovery scans filterable and degrade to explicit partial search results when file-summary metadata reaches its budget.
- Limit semantic navigation stability checks to admitted source and module-resolution files, so unrelated workspace artifacts do not invalidate a query while relevant changes still request a retry.
- Classify nested Python functions by their nearest declaration scope and suppress concept-worker stack traces in user-facing diagnostics.

## [1.2.3-1] - 2026-09-06

- Scope semantic project snapshots and stability checks to the target's containing project boundary, so unrelated files outside that project do not invalidate navigation.
- Make file-discovery validation errors name the valid discovery modes and show the `mode="files"` plus `query` repair shape.
- Rank file-discovery candidates relative to the requested root, so the root's own path cannot create false filename matches.

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
