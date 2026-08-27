# Changelog

All notable changes will be documented in this file. The project follows [Semantic Versioning](https://semver.org/) and uses Conventional Commits during development.

## [Unreleased]

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
