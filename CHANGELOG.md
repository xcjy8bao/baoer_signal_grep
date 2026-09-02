# Changelog

All notable changes will be documented in this file. The project follows [Semantic Versioning](https://semver.org/) and uses Conventional Commits during development.

## [Unreleased]

## [0.6.0] - 2026-09-02

### Added

- `anyOf` accepts 2–8 distinct, case-sensitive, single-line literals and returns every retained exact occurrence in one version-bound analysis snapshot. Different input terms may overlap; ordered per-term counts, changed-line containment, pagination, and executable inspection remain explicit.
- `mode="impact"` selects one reliably parsed JS/TS/TSX symbol by direct source target or ordinary search match, returns it first, inventories every exact same-spelling workspace candidate by syntax role, and appends existing related-test evidence.

### Changed

- Analysis storage now derives `anyOf` and impact counts after applying the shared 50,000-item/32 MiB retention bound, so partial counts describe only pageable evidence.
- Analysis call rendering identifies multi-term and impact requests while result rendering keeps the existing fail-open original-text boundary.
- Tool registration is fixed to the independent `signal_grep` name. The extension no longer changes another search tool or exposes user commands.
- The session status now reports returned queries, complete results, partial results, and automatic file organization in plain language. Cursor pages and source continuations do not inflate the query count.
- Existing configuration files keep their interface locale; retired settings are ignored.

### Removed

- Removed token-comparison accounting and its normal-format baseline text.
- Removed the health, snapshot-clear, tool-override, and metrics command surfaces. Snapshot and process cleanup remain automatic and session-bound.

### Correctness

- The syntax parser now runs from a published JavaScript worker, so Node can execute parser-backed operations when the npm package is installed under `node_modules`. The release gate rebuilds the worker and fails if the published artifact differs from its TypeScript source.
- Impact rejects ambiguous, unsupported, stale, anonymous, and anonymous-default targets before its workspace content scan. Same-spelling candidates explicitly do not prove binding; related tests remain `not-run` with assertion coverage `not-evaluated`.
- Unsupported occurrence files remain visible as unclassified evidence. Supported parser failures retain exact occurrences, mark the result partial, and never become an empty success.
- Impact storage retains exact target/occurrence evidence before derived test candidates, merged tests use stable case identity instead of stale page indices, and high-cardinality diagnostics remain within an explicit 64-reason/4 KiB bound.
- Workspace search targets are passed to ripgrep relative to the request cwd, so root-relative
  include/exclude globs apply identically during candidate revision enumeration and content
  matching instead of being defeated by an absolute search-root prefix.

## [0.5.8] - 2026-08-31

### Added

- Reliable JS/TS/TSX source parsing now identifies concrete implementations, including methods, private/static/accessor members, arrows, generics and JSX-adjacent syntax. Go syntax roles are also supported without requiring a Go toolchain at query time.
- `mode="inspect"` returns complete UTF-8 source whenever the selected implementation fits. Larger source is represented as raw byte fragments with an executable `sourceCursor` continuation that remains bound to the same worktree revision or Git commit/blob.
- Batched inspection merges same-file overlapping ranges before assigning the shared 16 KiB output budget, reads/parses a file once per request, and gives unused budget to later source blocks.
- Explicit `allOf` accepts two or three case-sensitive literal terms. It can require the terms in one file or, for JS/TS/TSX, in one implementation's own code while excluding nested functions, comments, static strings, regular expressions and type areas.
- A single-pattern `roles` filter distinguishes declaration, call, import, export, comment, string, JSX text, code and unknown occurrences in JS/TS/TSX/Go. Go call-versus-conversion and short-declaration ambiguity are labelled as candidates.
- `changes` searches a fixed Git comparison across changed files or only one side's changed lines. Worktree comparisons use final working-tree content and include unignored untracked files; historical inspection stays pinned to commit/blob evidence.
- `mode="outline"` pages version-bound JS/TS/TSX symbols. `mode="imports"` follows bounded static named/default ESM import and named re-export links. `mode="tests"` reports direct, indirect and weak related-test candidates without claiming coverage or test success.

### Changed

- Broad summaries now reserve file navigation first, then show bounded source preview windows: at most 30 file rows, five previewed files, two non-overlapping windows per file and seven lines per window.
- Advanced analysis output uses its own units (`files`, `functions`, `symbols`, relationships or evidence items).
- Runtime parsing uses installed, pinned ast-grep native packages in an owned short-lived process. Runtime configuration cannot preload code, load environment files, or install missing parsers.

### Fixed

- Empty and whitespace-only cursors fail before scanning. Every returned follow-up is complete JSON with its required cursor and retained path selection.
- Source continuation rejects changed, expired, malformed and forged offsets; replaying the same valid token returns the same page.
- Historical Git reads do not invoke repository hooks, external diff/text conversion, filters, lazy fetches or user ripgrep configuration. Current ignore rules continue to protect historical content.

## [0.5.6] - 2026-08-31

### Added

- Broad summaries now show bounded real first-retained-match samples across displayed files, with stable match numbers and explicit sample-omission counts. Samples are not relevance ranking.
- `mode="inspect"` accepts either cursor-bound `matchIndices` or cursorless `targets`, each containing 1–5 entries. The complete batch shares 16 KiB, reports every target's outcome, deduplicates same-revision source lines, and provides explicit single-target retry requests for budget-limited evidence.

### Fixed

- Summary cursors and follow-up instructions are included in model-facing text rather than only structured details.
- Context windows no longer emit future matching lines early and duplicate them on later cursor pages.
- Snapshot source revisions are bound only when metadata collected before and after the content scan agrees; changed, new, unreadable, and uncached files retain matching evidence but are explicitly unverified for context and inspection.
- Git exclusions now take precedence over positive user globs, and explicit Git-internal search paths are rejected after resolving symbolic links and filesystem case aliases.
- Human-facing summary rendering recognizes actual service responses, including their blank-line layout, samples, and cursor instructions.
- Ctags and ripgrep share owned-process cleanup that terminates and awaits children after cancellation or protocol failures, preserving startup errors and failing explicitly when cleanup cannot finish.
- Cursor inspection keeps a late occurrence visible in a long source line and reports source-range and clipped-line omissions in text and details; direct source inspection also rechecks revisions.
- Dense same-line matches retain their path, line and stable match marker within bounded output; displayed occurrence ranges are capped at 20 per line with explicit omitted-range counts, without deleting snapshot occurrences.
- Search and inspection excerpts preserve distant matches in non-UTF-8 files. Inspection and context keep ripgrep's LF-based line numbers when source contains bare carriage returns.
- Implicit auto mode returns a navigable summary when one matching line exceeds its estimated-token detail target; hard byte limits and execution failures remain explicit errors.

### Changed

- Candidate source metadata is bounded to 50,000 files with 16 concurrent reads. The extra names-only traversal and metadata reads do not limit the matching set or imply a search-speed improvement.
- Summary formatting has a dedicated module; detail formatting, process ownership, source verification, and batch composition each have explicit responsibilities.
- Existing single-target request forms remain valid.
- Tool guidance distinguishes ordinary auto searches from deliberate detail paging, explains when exact matching evidence is sufficient, and gives inspection-only selectors and corrective errors instead of leaving models to guess which search parameters must be omitted.

Publisher: **宝儿**.

## [0.5.2] - 2026-08-30

### Added

- Responsive Pi TUI renderers for search calls, ranked summaries, grouped matches, bounded inspection, partial-retention warnings, and errors in English and Simplified Chinese.
- Collapsed result views adapt across narrow, medium, and wide terminals while expanded views preserve the complete original tool text.

### Changed

- Human-facing rendering now fails open to the original result when details or text are not safely recognized, or when custom layout rendering fails; search text, structured details, cursors, and non-TUI behavior remain unchanged.

## [0.5.1] - 2026-08-29

### Added

- Count-ranked, cursor-paged file summaries expose every file distribution page without rerunning ripgrep.
- One summary cursor can repeatedly select exact retained files, including bounded `paths` batches, while selection-bound match cursors fail closed if a continuation changes its file set.
- Every rendered match carries a stable 1-based `{match #N}` marker; cursor-scoped `mode=inspect` accepts `matchIndex` instead of manually repeating `path` and `line`.

### Changed

- Long matching lines use occurrence-centered excerpts so the reported match remains visible while absolute UTF-16 or byte ranges stay unchanged.
- Oversized enclosing symbols return a byte-bounded source window centered on the requested line and report omitted line counts before and after it.
- Surrounding context is revision-safe: changed files keep their retained matching lines but omit current-file context with explicit text and structured `contextChangedFiles`.

### Fixed

- Universal Ctags invocation no longer passes an unsupported `--` separator, and health checks now validate the exact JSON/field options used by inspection instead of checking only `ctags --version`.
- File summaries rank by descending match count before applying the per-page file limit, preventing a dominant late-alphabet file from being hidden.
- Completing one filtered selection no longer destroys the underlying summary snapshot; the original summary cursor remains reusable until TTL eviction, bounds eviction, explicit clear, or session shutdown.
- Inspection output now reserves response metadata space so the complete result remains within the documented 16 KiB boundary.

## [0.5.0] - 2026-08-29

### Added

- Context-aware implicit `auto` detail budgets use Pi's reported context remainder: full (2,000 estimated tokens), tight (1,000), or critical (500). Compact complete results still return directly, while explicit limits, `matches`, inspection, and cursor pages retain the default budget.
- Search details expose `budgetTier`, `contextRemainderPercent`, and `resultTokenBudget` when a context decision is available; tight and critical responses also attribute the adjustment in model-facing text.
- Human-facing interface text supports the persisted `locale` values `en` and `zh-CN`; English remains the default for existing configs.

### Fixed

- Tool-name conflicts fail visibly instead of changing the requested search behavior silently.

## [0.4.0] - 2026-08-28

### Added

- Exact per-occurrence byte and UTF-16 match ranges derived from ripgrep JSON submatches.
- `mode=inspect` for bounded source inspection with optional enclosing-symbol details from Universal Ctags.
- Cursor continuation can select one retained file without rerunning the original search.
- Source revision checks reject stale cursor-scoped inspections.

### Changed

- Merged overlapping context windows so adjacent matches do not repeat source lines.
- Replaced unbounded JSON-line buffering with an explicit bounded LF reader that preserves valid Unicode separators.
- Search and inspection paths are confined to the working directory.

## [0.3.0] - 2026-08-27

### Added

- Opt-in persistent mode that overrides Pi's built-in `grep` with Signal Grep while registering exactly one public search tool; enabling Metrics performs the override/reload handoff automatically.
- Independent differential tests that verify match parity with raw `rg` across case, literal, glob, exclusion, hidden-file, ignore, and Unicode semantics.

### Changed

- Replaced the fixed 20-match default with an adaptive result budget: compact complete searches return directly, while oversized searches summarize before detail.
- Metrics now derive an exact Pi-style normal baseline from the same stable search snapshot, eliminating duplicate scans and unsupported-comparison warnings.
- Explicit `limit` requests return detail immediately in auto mode, while completed or cursorless snapshots are released as soon as they become inaccessible.
- Empty and whitespace-sensitive patterns, paths, globs, and exclusions are preserved instead of being trimmed, matching ripgrep semantics.

## [0.2.0] - 2026-08-27

### Added

- Opt-in, session-local Status Line metrics comparing cumulative Signal Grep result-text token estimates with Pi's normal grep baseline.
- Honest cumulative accounting for cursor pages, negative savings, and searches that normal grep cannot represent equivalently.

## [0.1.1] - 2026-08-27

### Fixed

- Included the contributor documentation referenced by the packaged README so npm and Pi Gallery links resolve.

## [0.1.0] - 2026-08-27

### Changed

- Relicensed the project from MIT to GNU AGPL v3.0 only.

### Added

- Adaptive `signal_grep` tool with summary-first broad search.
- Stable in-memory cursor snapshots with explicit partial-state reporting.
- Bun 1.4 and Node.js 22 compatibility validation.
- Type-aware Oxlint and deterministic Oxfmt quality gates.
- Synthetic context-shape contract benchmark.
- English and Simplified Chinese documentation.
- AI-specific pull request and review protocol.
