# Signal Grep for Pi

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · English

Context-efficient, correctness-first content search for the [Pi coding agent](https://pi.dev). Signal Grep keeps broad `ripgrep` output from flooding model context without pretending that truncated results are complete.

> **Latest release:** `0.3.0`.

## Why Signal Grep?

A coding agent usually does not need 100 matching lines immediately. It first needs to know where the signal is.

Signal Grep applies an adaptive response policy:

- **Small search:** return grouped matches in one call.
- **Broad search:** return an exact per-file match summary first.
- **Exhaustive follow-up:** page through one stable in-memory snapshot.
- **Bound reached:** report `partial` explicitly and ask the agent to narrow the query.

No fuzzy fallback, silent truncation, background index, database, telemetry, or network request is involved.

## A simple analogy: a research librarian, not a photocopier

Imagine asking a librarian:

> Show me every page in this library that contains `TODO`.

Traditional grep behaves like a photocopier. It finds a matching page, copies it, and places every copy on your desk. If one noisy book contains the same term 30 times, those 30 pages can bury the three pages you actually needed.

The desk is the model's context window. Every irrelevant page consumes space that could have been used to understand code, reason about behavior, or produce a correct change. Returning only the first 20 copies is not a complete solution either: it creates a cleaner desk by potentially throwing useful pages away.

Signal Grep behaves like a research librarian. For a broad request, it first gives the model a catalog:

```text
33 matches across 4 files

README.md       1
noise.ts       30
src/app.ts      1
utils.ts        1
```

The model can immediately see where the noise is and request only the relevant file. If it truly needs every matching page, the librarian provides a numbered claim ticket—the cursor—for a sealed cart of results. Each page continues from the same cart, so later batches do not silently repeat or skip retained matches even if repository files change after the original search.

If the cart exceeds the retention bound, Signal Grep labels it `partial`. It never discards material and then claims the search was complete.

| Library analogy              | Signal Grep concept       |
| ---------------------------- | ------------------------- |
| Library                      | Repository                |
| Book                         | File                      |
| Matching page                | Grep match                |
| Limited desk space           | Model context window      |
| Catalog with per-book counts | Per-file search summary   |
| Sealed result cart           | Stable in-memory snapshot |
| Numbered claim ticket        | Cursor                    |
| Capacity warning             | Explicit `partial` status |

In one sentence: **traditional grep puts every photocopy on the model's desk; Signal Grep gives the model a catalog first, then retrieves exactly the material it asks for.**

## Example

A repository contains 233 `TODO` lines, including 200 in one generated-looking file and 30 in another noisy file. Returning normal grep details would hit its 100-match boundary without revealing the real total. Signal Grep instead returns:

```text
233 matches across 5 files (complete snapshot).

README.md        1
broad.ts       200
noise.ts        30
src/app.ts       1
utils.ts         1

Details are available from the stable snapshot with cursor="…".
```

For a compact complete result, Signal Grep returns grouped details directly—even when there are more than the former fixed 20-match threshold—so simple searches do not pay for an unnecessary summary-and-cursor turn.

## Reproducible before/after test

The repository includes a benchmark script that creates the fixture above, executes Pi's real built-in grep implementation and Signal Grep against the same files, and removes the fixture afterward:

```bash
bun run benchmark
```

Measured with Pi 0.84.3, Bun 1.4.0, Node.js 22.22.2, and ripgrep 15.2.0:

| Scenario                               |           Pi built-in grep |                 Signal Grep |
| -------------------------------------- | -------------------------: | --------------------------: |
| Compact search: actual matches         |                         33 |                          33 |
| Compact search: first response         |                  898 bytes |               **715 bytes** |
| Compact search: extra detail turn      |                         no |                      **no** |
| Broad search: actual matches           | not observable after limit |                     **233** |
| Broad search: detail lines shown first |                        100 | **0 (exact summary first)** |
| Broad search: first response           |                9,728 bytes |               **238 bytes** |
| Broad search: first-response reduction |                          — |                   **97.6%** |

The compact case confirms that adaptive budgeting can return every result directly with less repeated path text and no extra turn. The broad case confirms that Signal Grep exposes the exact total and file distribution instead of presenting a 100-match prefix as if it represented the whole search. Explicit `limit=20` pagination still reconstructs the 33-match fixture as 20 + 13 without duplication or omission.

This is a context-shape benchmark, not a speed or exact tokenizer benchmark. Byte counts cover model-facing tool text only; provider serialization, tool schemas, and model tokenization are intentionally excluded. Run the command on your own platform before using the numbers for capacity planning.

## Requirements

### Runtime

- Pi 0.84.3 or newer
- Node.js 22+ or Bun 1.4+
- [`ripgrep`](https://github.com/BurntSushi/ripgrep) available as `rg` on `PATH`

### Development

- Bun 1.4+
- TypeScript 7+
- Node.js 22+ for compatibility checks

## Installation

Install the latest release from npm:

```bash
pi install npm:pi-plugin-signal-grep
```

You can also install the current GitHub version:

```bash
pi install git:github.com/xcjy8bao/pi-plugin-signal-grep
```

Then restart Pi. During local development:

```bash
pi -e ./src/index.ts
```

## Optional built-in grep override

Signal Grep defaults to additive mode and registers `signal_grep` alongside Pi's built-in `grep`. To route every normal grep call through Signal Grep while exposing exactly one public search tool, run:

```text
/signal-grep-override on
```

The command safely persists a user-global setting through a staged file at `~/.pi/agent/signal-grep.json` and reloads Pi resources. Override mode registers Signal Grep as `grep`, accepts the built-in grep parameter shape, preserves built-in case-sensitive behavior when `ignoreCase` is omitted, and keeps the richer glob, exclusion, adaptive summary, and cursor controls. `/signal-grep-health` reports the active grep source. Before persisting an override, Signal Grep refuses the transition if another extension already owns `grep`; Pi also rejects duplicate registrations while loading extensions. A conflict therefore fails clearly without changing config or silently splitting search ownership. Disable it and restore Pi's built-in implementation with:

```text
/signal-grep-override off
```

Use `/signal-grep-override status` to inspect the active mode. Override is deliberately opt-in because another extension may also replace `grep`; Pi reports tool collisions at startup.

## Tool

The extension registers one tool: `signal_grep` by default, or `grep` in override mode.

| Parameter    | Type                         | Default    | Purpose                                             |
| ------------ | ---------------------------- | ---------- | --------------------------------------------------- |
| `pattern`    | string                       | —          | Regex or literal text; required for a new search    |
| `path`       | string                       | `.`        | File or directory relative to the working directory |
| `glob`       | string or string[]           | `[]`       | Include globs                                       |
| `exclude`    | string or string[]           | `[]`       | Exclude globs                                       |
| `literal`    | boolean                      | `false`    | Use fixed-string matching                           |
| `ignoreCase` | boolean                      | mode-aware | Force insensitive or sensitive matching             |
| `hidden`     | boolean                      | `true`     | Include hidden files; `.git` is always excluded     |
| `context`    | number                       | `0`        | Before/after context, clamped to 0–20               |
| `limit`      | number                       | adaptive   | Maximum matches per page, clamped to 1–100          |
| `mode`       | `auto`, `summary`, `matches` | `auto`     | Select adaptive, summary, or detail output          |
| `cursor`     | string                       | —          | Continue a stable retained snapshot                 |

When `ignoreCase` is omitted, additive `signal_grep` uses smart-case; override `grep` preserves Pi's built-in case-sensitive default.

### Modes

- `auto`: return all grouped details when the complete result fits the adaptive budget; honor an explicit `limit` with an immediate detail page; otherwise return a file summary.
- `summary`: always return file counts first.
- `matches`: return the first adaptive-budget detail page immediately.
- `cursor`: continue detail pages from the original snapshot; no search rerun.

## Optional cumulative token comparison

Token comparison is disabled by default and adds no baseline rendering while disabled. Start a fresh, session-local comparison window with:

```text
/signal-grep-metrics on
```

Starting Metrics clears existing Signal Grep snapshots so a cursor created before the comparison window cannot succeed without being accounted for. If override mode is not active, this single command persists the override, reloads Pi, and automatically starts Metrics after reload so every successful Pi `grep` call is covered. `/signal-grep-metrics off` closes only the comparison window; the override remains active until `/signal-grep-override off` restores Pi's built-in implementation.

Pi adds a compact Extension Status below its built-in footer statistics and updates it after each comparable search:

```text
SG 3.2k / normal 11.8k · ↓8.6k (72.9%)
```

`SG` is the cumulative estimated token count of Signal Grep result text. `normal` reproduces Pi's normal grep formatting from the exact same stable match snapshot. Cursor pages add to `SG` without rerunning or recounting the normal baseline. If exhaustive pagination costs more than normal output, the indicator shows an honest increase such as `↑1.3k (11.0%)`.

Counts use Pi's conservative characters-over-four heuristic and cover model-facing result text only—not tool schemas, provider serialization, or the extra model turn needed to request a cursor page. Exact UTF-8 byte totals are retained for the final report. Metrics do not execute a second search, and every successful Pi `grep` query—including empty or whitespace-sensitive patterns, multiple globs, exclusions, and `hidden=false`—uses the same matched set on both sides. Shell commands such as `bash`-invoked `rg`, and search tools owned by other extensions, are outside this tool boundary and are not counted.

Stop the window, remove only Signal Grep's status, and show the final cumulative report with:

```text
/signal-grep-metrics off
```

Use `/signal-grep-metrics status` to inspect the active window without closing it. Metrics stay in memory, are reset on the next enable, and are never persisted or transmitted.

## Correctness contract

Signal Grep treats search completeness as a public contract:

1. A `complete` snapshot retains every matching line discovered by `rg`.
2. Cursor pages preserve snapshot order and do not duplicate or omit retained matches.
3. Retained matching-line text is snapshot-stable. Optional surrounding context is read when a page is formatted and may reflect later file edits.
4. A snapshot that exceeds 50,000 retained matches is marked `partial` in both text and structured details.
5. Adaptive pages target about 2,000 estimated result-text tokens and remain bounded by 100 matches and a 16 KiB hard limit.
6. Lines longer than 500 characters are visibly clipped and counted in details.
7. Context for files larger than 5 MiB, unreadable files, or a single block that exceeds the page byte budget is omitted and reported.
8. Invalid cursors and subprocess failures are errors, never successful empty searches.

See [Architecture](docs/ARCHITECTURE.md) for the ownership and lifecycle model.

## Commands

- `/signal-grep-health` — show the detected ripgrep version and snapshot usage.
- `/signal-grep-clear` — clear snapshots and invalidate existing cursors.
- `/signal-grep-override on|off|status` — persist or inspect the optional built-in grep override.
- `/signal-grep-metrics on|off|status` — control or inspect cumulative Status Line token estimates.

Snapshots are also cleared on Pi session shutdown.

## Security and privacy

- Search stays local.
- The extension makes no network requests and has no telemetry.
- `rg` is spawned directly with an argument array; no shell is involved.
- `.git` internals are always excluded.
- Pi extensions run with the user's full permissions. Review third-party extension source before installation.

See [SECURITY.md](SECURITY.md) for reporting instructions and supported versions.

## Development

```bash
bun install
bun run check
bun run pack:check
```

The test suite uses Bun's native test runner and includes real ripgrep integration tests. `bun run test:node` builds a temporary Node-targeted bundle, imports it with Node.js, and removes the artifact.

All changes—including AI-authored changes—must use pull requests. Read:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [AI Pull Request Guide](docs/AI_PULL_REQUEST_GUIDE.md)
- [Quality Gates](docs/QUALITY_GATES.md)
- [AGENTS.md](AGENTS.md)

## License

[GNU AGPL v3.0 only](LICENSE)
