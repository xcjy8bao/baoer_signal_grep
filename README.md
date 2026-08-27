# Signal Grep for Pi

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · English

Context-efficient, correctness-first content search for the [Pi coding agent](https://pi.dev). Signal Grep keeps broad `ripgrep` output from flooding model context without pretending that truncated results are complete.

> **Latest release:** `0.2.0`.

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

A repository contains 33 `TODO` lines: 30 in `noise.ts` and one each in three relevant files. Instead of sending all 33 lines to the model, the default response is shaped like this:

```text
33 matches across 4 files (complete snapshot).

README.md        1
noise.ts        30
src/app.ts       1
utils.ts         1

Details are available from the stable snapshot with cursor="…".
```

The agent can now narrow by `path`, or request every detail page. With the default page size, exhaustive retrieval is exactly 20 matches followed by 13—without duplicates or omissions.

## Reproducible before/after test

The repository includes a benchmark script that creates the fixture above, executes Pi's real built-in grep implementation and Signal Grep against the same files, and removes the fixture afterward:

```bash
bun run benchmark
```

Measured with Pi 0.84.3, Bun 1.4.0, Node.js 22.22.2, and ripgrep 15.2.0:

| Measurement                        |   Pi built-in grep |                      Signal Grep |
| ---------------------------------- | -----------------: | -------------------------------: |
| Actual matches discovered          |                 33 |                               33 |
| Files containing matches           |                  4 |                                4 |
| Detail lines in the first response |                 33 |                0 (summary first) |
| First model-facing response        |          898 bytes |                        220 bytes |
| First-response reduction           |                  — |                        **75.5%** |
| Exhaustive detail retrieval        | 33 in one response | 20 + 13 from one stable snapshot |
| Combined exhaustive detail text    |          898 bytes |                        830 bytes |

The result confirms the intended effect: the default broad-search response is substantially smaller while the complete 33-match result remains recoverable. Signal Grep's exhaustive detail is also grouped by file, so paths are not repeated on every matching line.

This is a context-shape benchmark, not a search-speed or token-count benchmark. Byte counts cover model-facing tool text only; provider serialization, tool schemas, model tokenization, and the extra tool turn required for exhaustive pagination are intentionally excluded. Run the command on your own platform before using the numbers for capacity planning.

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

## Tool

The extension registers one tool: `signal_grep`.

| Parameter    | Type                         | Default    | Purpose                                             |
| ------------ | ---------------------------- | ---------- | --------------------------------------------------- |
| `pattern`    | string                       | —          | Regex or literal text; required for a new search    |
| `path`       | string                       | `.`        | File or directory relative to the working directory |
| `glob`       | string or string[]           | `[]`       | Include globs                                       |
| `exclude`    | string or string[]           | `[]`       | Exclude globs                                       |
| `literal`    | boolean                      | `false`    | Use fixed-string matching                           |
| `ignoreCase` | boolean                      | smart-case | Force insensitive or sensitive matching             |
| `hidden`     | boolean                      | `true`     | Include hidden files; `.git` is always excluded     |
| `context`    | number                       | `0`        | Before/after context, clamped to 0–20               |
| `limit`      | number                       | `20`       | Detail matches per page, clamped to 1–100           |
| `mode`       | `auto`, `summary`, `matches` | `auto`     | Select adaptive, summary, or detail output          |
| `cursor`     | string                       | —          | Continue a stable retained snapshot                 |

### Modes

- `auto`: grouped detail for up to `limit` matches; otherwise a file summary.
- `summary`: always return file counts first.
- `matches`: return the first detail page immediately.
- `cursor`: continue detail pages from the original snapshot; no search rerun.

## Optional cumulative token comparison

Token comparison is disabled by default and adds no baseline search while disabled. Start a fresh, session-local comparison window with:

```text
/signal-grep-metrics on
```

Pi adds a compact Extension Status below its built-in footer statistics and updates it after each comparable search:

```text
SG 3.2k / normal 11.8k · ↓8.6k (72.9%)
```

`SG` is the cumulative estimated token count of Signal Grep result text. `normal` is the cumulative estimate for Pi's normal grep result text on the same new searches. Cursor pages add to `SG` without rerunning or recounting the normal baseline. If exhaustive pagination costs more than normal grep, the indicator shows an honest increase such as `↑1.3k (11.0%)`.

Counts use Pi's conservative characters-over-four heuristic and cover model-facing result text only—not tool schemas, provider serialization, or the extra model turn needed to request a cursor page. Exact UTF-8 byte totals are retained for the final report. Enabling metrics executes one additional normal grep process for each comparable new search. Searches using multiple include globs, exclude globs, or `hidden=false` are excluded with a visible warning because normal grep cannot represent those inputs equivalently.

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
5. Result pages are bounded by match count and 16 KiB of model-facing text.
6. Lines longer than 500 characters are visibly clipped and counted in details.
7. Context for files larger than 5 MiB, unreadable files, or a single block that exceeds the page byte budget is omitted and reported.
8. Invalid cursors and subprocess failures are errors, never successful empty searches.

See [Architecture](docs/ARCHITECTURE.md) for the ownership and lifecycle model.

## Commands

- `/signal-grep-health` — show the detected ripgrep version and snapshot usage.
- `/signal-grep-clear` — clear snapshots and invalidate existing cursors.
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
