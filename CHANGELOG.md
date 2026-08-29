# Changelog

All notable changes will be documented in this file. The project follows [Semantic Versioning](https://semver.org/) and uses Conventional Commits during development.

## [Unreleased]

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
- Installations with `pi-hashline-edit-pro` receive one conditional prompt guideline to obtain hashline-served anchors before editing Signal Grep evidence, without repeating the hint in every result or pretending to share private plugin state.
- Human-facing command descriptions, notifications, health output, and Metrics status/reports support the persisted `locale` values `en` and `zh-CN`; English remains the default for existing configs.

### Fixed

- Load-time conflict detection: when the built-in `grep` override is configured but a package that owns the public `grep` tool name is installed (for example `pi-hashline-edit-pro`), Signal Grep now degrades to additive `signal_grep` for that session with a visible notice instead of failing the whole extension set at startup. The config value is never rewritten, and removing the conflicting package restores the override on the next load.
- `/signal-grep-metrics on` and the `startMetricsOnNextLoad` handoff no longer persist an override that cannot take effect: they refuse with a clear notice while a conflicting package is installed.

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
- Reproducible built-in-versus-Signal-Grep context-shape benchmark.
- English and Simplified Chinese documentation.
- AI-specific pull request and review protocol.
