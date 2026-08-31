# Signal Grep for Pi

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · English

Context-efficient, correctness-first content search and bounded code inspection for the [Pi coding agent](https://pi.dev). Signal Grep turns broad `ripgrep` output into file counts, real matching-line samples, and explicit follow-up requests while preserving retained evidence and reporting limits.

> **Latest release:** `0.5.8`. Publisher: **宝儿**.

## Why Signal Grep?

For a broad query, the next useful step is often to choose the right files and inspect their code. Signal Grep supports that path directly:

- **Small search:** return all grouped matching lines in one call when they fit.
- **Broad search:** return exact per-file counts before bounded, labeled source-preview windows.
- **Direct follow-up:** copy the cursor from the result text to retrieve selected files or inspect up to five visible match numbers together.
- **Stable evidence:** cursor pages use the retained snapshot; current-file context and inspection require verified source revisions.
- **Explicit limits:** distinguish retained matches, displayed previews, missing source ranges, and partial retention.

## 0.5.8 evidence operations

Ordinary content search remains the default. The following operations add evidence that a plain grep response cannot establish:

- `allOf: ["authorize", "persist"]` proves that every literal term occurs in one file. Add `within: "function"` to require JS/TS/TSX own implementation code; nested callbacks, comments, static strings, regex literals and type areas do not count.
- `roles: ["declaration"]` or `roles: ["call"]` filters each individual occurrence by syntax role in JS/TS/TSX/Go. Go call-versus-conversion and short-declaration cases remain explicit candidates.
- `changes: { "base": "HEAD", "scope": "lines", "side": "new" }` uses a fixed Git comparison. With `allOf`, every term must be wholly inside the selected side's changed lines. Historical output stays bound to commit/blob source; it does not switch to the worktree.
- `mode: "outline"` returns paged JS/TS/TSX symbols. `mode: "imports"` follows bounded static named/default ESM bindings and named re-exports. `mode: "tests"` returns direct, indirect and weak related-test candidates; it never claims coverage or a passing test run.

Use the complete JSON shown after `Next request:`. A `sourceCursor` continues only missing raw-byte source ranges from the exact same source version; replaying the same token is safe, while changed, expired or modified tokens fail explicitly.

The samples are examples of matching text, not relevance scores or complete file contents. File order follows match counts, not an estimate of which file will solve the task. The plugin has no fuzzy fallback, background index, database, telemetry, or network requests.

## Example: choose files, then inspect code

For illustration, a broad `TODO` query can return counts, bounded source previews, and a usable cursor in one model-facing response:

```text
N matches across M files (complete snapshot).
Files 1-M of M, ordered by match count.

broad.ts     200
noise.ts      30
README.md       1
src/app.ts       1
utils.ts       1

Source previews are bounded, not relevance-ranked or exhaustive.
broad.ts:1 {match #34} // TODO broad 0
noise.ts:1 {match #4} // TODO fix 1
README.md:1 {match #3} TODO readme
src/app.ts:1 {match #1} // TODO app
utils.ts:1 {match #2} // TODO utils

Snapshot cursor="<returned-cursor>".
Inspect samples: mode="inspect", cursor, matchIndices=[one or more visible match numbers, max 5].
Retrieve matching lines: cursor with path or paths selecting exact files, no mode.
```

The cursor is represented here by `<returned-cursor>`. Match numbers belong to that snapshot and can differ in a new search. Use the actual cursor and visible match numbers from your own response:

```json
{ "mode": "inspect", "cursor": "<returned-cursor>", "matchIndices": [1, 2] }
```

This inspects the selected source locations in one bounded call. To retrieve matching lines from the two selected files instead:

```json
{ "cursor": "<returned-cursor>", "paths": ["src/app.ts", "utils.ts"] }
```

Summary rows use descending match counts and path-order ties. A summary page shows at most 30 files and may show fewer to fit its text budget; sample omissions are explicit. Use the returned cursor with `mode="summary"` for later file pages. The original summary cursor remains reusable for details, repeated single-file selections, or up to 20 exact retained `paths`, without rescanning. A match cursor must keep its bound selection.

Compact complete searches return details directly, avoiding a summary-and-cursor round trip. Each matching line has a stable `{match #N}` marker; a summary cursor plus `matchIndex=N` remains the single-target inspection form. Long matching lines and cursor-scoped inspection keep the primary occurrence visible; other excerpts and occurrence ranges have explicit display limits.

For implicit `auto` searches without `limit`, Pi's reported context remainder controls only the initial detail-fit trial: `full` above 40% targets 2,000 estimated result-text tokens, `tight` from 12% through 40% targets 1,000, and `critical` below 12% targets 500. Unknown usage preserves the default. Explicit limits, `matches`, inspection, and cursor continuation are never downshifted.

## Human-readable Pi TUI

In Pi's interactive terminal, Signal Grep presents the same result as a responsive evidence view: ranked bars for summaries, grouped file evidence for match pages, explicit partial-retention warnings, and bounded inspection status. The collapsed view adapts to narrow, medium, and wide terminals; expanding the tool row shows the complete original result.

This is a display-only boundary. The renderer does not change model-facing text, structured `details`, cursors, search policy, Metrics accounting, JSON/RPC/print output, or persisted state. If the current text/details shape cannot be recognized safely—or custom rendering fails—the Pi row falls back to the original result text.

## Local verification

Run the repository quality gates before contributing:

```bash
bun run check
bun run pack:check
```

These commands validate contracts and package contents. They do not measure model performance, task-level token use, cost, coverage, or test success in a user repository.

## Requirements

### Runtime

- Pi 0.84.3 or newer
- Node.js 22.19+ or Bun 1.4+
- [`ripgrep`](https://github.com/BurntSushi/ripgrep) available as `rg` on `PATH`
- Optional [Universal Ctags](https://docs.ctags.io/) with JSON output on `PATH` for symbol-level inspection
- Pinned `@ast-grep/napi` and `@ast-grep/lang-go` packages installed with the plugin for JS/TS/TSX/Go syntax. No Go compiler, Ctags or network request is required for these parser-backed operations.

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

When `pi-hashline-edit-pro` is installed, Signal Grep adds one system prompt guideline telling the model to obtain served anchors through hashline's `grep` or `read` before editing a location found by `signal_grep`. The hint is not repeated in each search response, does not alter Metrics accounting, and does not claim that Signal Grep can write hashline's private served-state.
Use `/signal-grep-override status` to inspect the active mode. Override is deliberately opt-in because another extension may also replace `grep`; Pi reports tool collisions at startup.

## Interface language

Human-facing command descriptions, notifications, health output, and Metrics status/report text default to English. To use Simplified Chinese, set `locale` in `~/.pi/agent/signal-grep.json` and restart Pi:

```json
{
  "overrideBuiltinGrep": false,
  "startMetricsOnNextLoad": false,
  "locale": "zh-CN"
}
```

Supported values are `"en"` and `"zh-CN"`. Existing config files without `locale` continue to use English. Signal Grep commands preserve the complete config object when they update override or Metrics handoff state. Search evidence, tool parameters, cursor details, and model-facing prompt guidelines remain language-neutral or English so localization cannot change search semantics or Metrics accounting.

## Tool

The extension registers one tool: `signal_grep` by default, or `grep` in override mode.

| Parameter      | Type                                                                   | Default    | Purpose                                                                                       |
| -------------- | ---------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `pattern`      | string                                                                 | —          | Regex or literal text; required for a new search                                              |
| `path`         | string                                                                 | `.`        | File or directory relative to the working directory; with a cursor, selects one retained file |
| `paths`        | string[]                                                               | —          | Select 1–20 exact retained files together; valid only with a cursor                           |
| `glob`         | string or string[]                                                     | `[]`       | Include globs                                                                                 |
| `exclude`      | string or string[]                                                     | `[]`       | Exclude globs                                                                                 |
| `literal`      | boolean                                                                | `false`    | Use fixed-string matching                                                                     |
| `ignoreCase`   | boolean                                                                | mode-aware | Force insensitive or sensitive matching                                                       |
| `hidden`       | boolean                                                                | `true`     | Include hidden files; `.git` is always excluded                                               |
| `context`      | number                                                                 | `0`        | Before/after context, clamped to 0–20                                                         |
| `limit`        | number                                                                 | adaptive   | Maximum matches per page, clamped to 1–100                                                    |
| `allOf`        | string[]                                                               | —          | Two or three distinct, case-sensitive literal terms; mutually exclusive with `pattern`/roles  |
| `within`       | `file` or `function`                                                   | `file`     | Scope for `allOf`; function is JS/TS/TSX own-code only                                        |
| `roles`        | role[]                                                                 | —          | Syntax-role filter for one ordinary pattern in JS/TS/TSX/Go                                   |
| `changes`      | Git comparison object                                                  | —          | Fixed base/target, file/line scope and old/new side                                           |
| `mode`         | `auto`, `summary`, `matches`, `inspect`, `outline`, `imports`, `tests` | `auto`     | Select search, source inspection or structural navigation                                     |
| `line`         | number                                                                 | —          | 1-indexed source line for single-target `path` inspection                                     |
| `matchIndex`   | number                                                                 | —          | Stable 1-based retained match selected by cursor-scoped `inspect`; replaces `path` and `line` |
| `matchIndices` | number[]                                                               | —          | Inspect 1–5 visible match numbers together; requires `cursor` and `mode="inspect"`            |
| `targets`      | `{path: string, line: number}[]`                                       | —          | Inspect 1–5 known source locations with `mode="inspect"`, without a cursor                    |
| `cursor`       | string                                                                 | —          | Continue or select from a stable retained snapshot                                            |
| `sourceCursor` | string                                                                 | —          | Continue missing source ranges with `mode="inspect"`                                          |
| `symbol`       | string                                                                 | —          | Optional binding name for `imports` or `tests`                                                |

When `ignoreCase` is omitted, additive `signal_grep` uses smart-case; override `grep` preserves Pi's built-in case-sensitive default.

### Modes

- `auto`: for an implicit search, use the current context tier for the initial detail-fit trial and return all grouped details when they fit; honor an explicit `limit` with an immediate default-budget detail page; otherwise return a file summary.
- `summary`: return a count-ranked file page with bounded first-retained-match samples and a cursor in the text. Continue with `mode="summary"` when more files remain.
- `matches`: return the first default-budget detail page immediately.
- `inspect`: inspect one `path`/`line` or cursor-bound `matchIndex`; use `targets` or `matchIndices` for a batch of up to five. Inspection returns bounded source even without a structure provider, but never fabricates symbol boundaries or accepts unverified snapshot revisions.
- `cursor`: continue from the original snapshot without rerunning. A summary cursor starts details at match 1, remains reusable for repeated `path`/`paths` selections, and pages later file summaries when combined with `mode="summary"`. A match cursor must keep the same path selection.

When Pi reports usable context data for an eligible `auto` search, structured details include `budgetTier`, `contextRemainderPercent`, and `resultTokenBudget`. Tight and critical responses also include the same attribution in model-facing text. These targets use the same conservative character estimate as existing metrics; source text and paths may contain CJK, so they are not exact tokenizer guarantees.

## Optional cumulative token comparison

Token comparison is disabled by default and adds no baseline rendering while disabled. Start a fresh, session-local comparison window with:

```text
/signal-grep-metrics on
```

Starting Metrics clears existing Signal Grep snapshots so a cursor created before the comparison window cannot succeed without being accounted for. If override mode is not active, this single command persists the override, reloads Pi, and automatically starts Metrics after reload so subsequent comparable Pi searches enter the window. Inspection calls are excluded. `/signal-grep-metrics off` closes only the comparison window; the override remains active until `/signal-grep-override off` restores Pi's built-in implementation.

Pi adds a compact, color-coded Extension Status below its built-in footer statistics and updates it after each comparable search. The `SG` card uses the theme accent, `NORMAL` uses a light dim color, and the delta card uses success/error colors:

```text
[ SG 3.2k ]  [ NORMAL 11.8k ]  [ ↓ 8.6k · 72.9% ]
```

`SG` is the cumulative estimated token count of comparable Signal Grep **search-result text**. Single and batch `mode="inspect"` calls are not counted. `normal` reproduces Pi's normal grep formatting from the exact same stable match snapshot. Cursor pages add to `SG` without rerunning or recounting the normal baseline. If exhaustive pagination costs more than normal output, the indicator shows an honest increase such as `↑1.3k (11.0%)`.

Counts use Pi's conservative characters-over-four heuristic. They exclude inspection and read output, tool schemas, provider serialization, model input/output outside these search results, and the extra model turns needed to choose or retrieve evidence. **Metrics are not task-total tokens or API cost, and the displayed percentage is not a task-level saving.** Exact UTF-8 byte totals are retained for the final report. Metrics do not add a content search, and every comparable Pi search query—including empty or whitespace-sensitive patterns, multiple globs, exclusions, and `hidden=false`—uses the same matched set on both sides. Shell commands such as `bash`-invoked `rg`, and search tools owned by other extensions, are outside this tool boundary and are not counted.

Stop the window, remove only Signal Grep's status, and show the final cumulative report with:

```text
/signal-grep-metrics off
```

Use `/signal-grep-metrics status` to inspect the active window without closing it. Metrics stay in memory, are reset on the next enable, and are never persisted or transmitted.

## Correctness contract

1. A `complete` search snapshot retains every matching line discovered by `rg`; it is not a claim that the entire repository was read atomically.
2. Matching lines paginate exactly once, including when neighboring lines match and context is enabled. Cursor pages never rerun the query or silently change a bound file selection.
3. Count-ranked file pages expose their cursor in text and `details`. Samples come from retained matching lines and report any omitted previews.
4. Before content search, a names-only traversal applies the same path, ignore, hidden, and glob rules and records up to 50,000 candidate file revisions with bounded concurrency. Only unchanged before/after revisions become trusted snapshot evidence. This adds a traversal and metadata reads, not a second content search.
5. Changed, newly discovered, unreadable, or uncached source revisions remain unverified. Their matching lines and counts are retained; `sourceUnverifiedFileCount` and text explain why current-file context and snapshot-scoped inspection are unavailable. Later source changes are also rejected.
6. Retention above 50,000 matching lines is explicitly `partial`. The candidate-revision cap is separate and never truncates the matching set.
7. Detail pages retain their match-count and 16 KiB limits. At most 20 occurrence ranges per matching line are displayed; all retained ranges remain in the snapshot, and text plus `occurrenceRangesOmitted`/`occurrenceMatchesTruncated` report display omissions. A dense line must not discard its path or stable match marker to fit.
8. Parser-backed inspection returns full valid UTF-8 source ranges whenever they fit. Larger ranges use raw-byte fragments and an executable version-bound `sourceCursor`; non-UTF-8 content is explicitly a lossy preview and cannot be continued. Source reads are limited to 5 MiB.
9. Single and batch inspection share the same source-validation rules. An entire batch has one 16 KiB response limit, per-target outcomes, and deduplicated source ranges. A partial returned target includes a complete `sourceCursor` follow-up request.
10. `.git` exclusions take precedence over user globs; explicit Git-internal search paths are rejected. Meaningful hidden files remain searchable by default.
11. Invalid cursors or requests and runtime failures fail explicitly. Cancellation and protocol failures terminate and await owned subprocesses; cleanup failure is an error, not a successful empty result.

The [architecture](docs/ARCHITECTURE.md) explains ownership and lifecycle boundaries.

## Commands

- `/signal-grep-health` — show ripgrep availability, capability-validated Universal Ctags status, and snapshot usage.
- `/signal-grep-clear` — clear snapshots and invalidate existing cursors.
- `/signal-grep-override on|off|status` — persist or inspect the optional built-in grep override.
- `/signal-grep-metrics on|off|status` — control or inspect cumulative Status Line token estimates.

## Code evidence and structure

`mode="inspect"` preserves the existing single-target forms: `path` plus 1-based `line`, or a cursor plus 1-based `matchIndex`. To inspect several locations:

```json
{ "mode": "inspect", "cursor": "<returned-cursor>", "matchIndices": [1, 2, 3] }
```

```json
{
  "mode": "inspect",
  "targets": [
    { "path": "src/app.ts", "line": 1 },
    { "path": "utils.ts", "line": 1 }
  ]
}
```

Use one form at a time. `matchIndices` requires a cursor; `targets` forbids one. Batch fields cannot be combined with the single-target `path`, `line`, or `matchIndex`. Both arrays accept 1–5 entries. No configuration migration is required.

The whole batch shares 16 KiB. Each `details.inspections` entry preserves its input index and reports `returned` or `error`; returned entries identify a displayed source block. Overlapping ranges from the same verified file revision appear once. When a valid UTF-8 block does not fit, its text and details include a complete `sourceCursor` request for precisely the missing raw-byte ranges. Invalid requests fail before source access; cancellation and unexpected runtime failures fail the call instead of appearing as successful items.

`complete` for a batch means every target's selected source range was returned. Each target's `source` describes returned and remaining byte ranges and, where applicable, the next complete request. Missing or changed snapshot revisions require refreshing the search; a current `path`/`line` request is a separate current-source inspection, not a substitute for snapshot verification.

For JS/TS/TSX, the installed parser determines implementation ranges without an external tool. Universal Ctags remains optional for unsupported worktree languages and is never downloaded automatically. Missing parsers or providers, parse errors, oversized files, unavailable source, and changed source have distinct statuses. Direct inspections recheck the source revision after parsing and reading.

Match columns are UTF-16 positions for valid UTF-8 text; `b`-suffixed ranges use raw byte offsets for non-UTF-8 data. Raw ripgrep/Ctags protocol output is never sent to the model. Session shutdown clears retained snapshots.

## Security and privacy

- Search stays local.
- The extension makes no network requests and has no telemetry.
- `rg`, the parser worker, and optional Universal Ctags are spawned directly with argument arrays; no shell is involved.
- Search and inspection paths are confined to the working directory.
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

## License

[GNU AGPL v3.0 only](LICENSE)
