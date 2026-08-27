# Signal Grep for Pi

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · English

Context-efficient, correctness-first content search for the [Pi coding agent](https://pi.dev). Signal Grep keeps broad `ripgrep` output from flooding model context without pretending that truncated results are complete.

> **Project status:** pre-release. The initial implementation is under review and has not been published to npm yet.

## Why Signal Grep?

A coding agent usually does not need 100 matching lines immediately. It first needs to know where the signal is.

Signal Grep applies an adaptive response policy:

- **Small search:** return grouped matches in one call.
- **Broad search:** return an exact per-file match summary first.
- **Exhaustive follow-up:** page through one stable in-memory snapshot.
- **Bound reached:** report `partial` explicitly and ask the agent to narrow the query.

No fuzzy fallback, silent truncation, background index, database, telemetry, or network request is involved.

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

Install from GitHub after the initial pull request is merged:

```bash
pi install git:github.com/xcjy8bao/pi-plugin-signal-grep
```

Then restart Pi. During local development:

```bash
pi -e ./src/index.ts
```

The planned npm package name is `pi-plugin-signal-grep`; no npm release exists yet.

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

## Correctness contract

Signal Grep treats search completeness as a public contract:

1. A `complete` snapshot retains every matching line discovered by `rg`.
2. Cursor pages preserve snapshot order and do not duplicate or omit retained matches.
3. A snapshot that exceeds 50,000 retained matches is marked `partial` in both text and structured details.
4. Result pages are bounded by match count and 16 KiB of model-facing text.
5. Lines longer than 500 characters are visibly clipped and counted in details.
6. Context for files larger than 5 MiB, unreadable files, or a single block that exceeds the page byte budget is omitted and reported.
7. Invalid cursors and subprocess failures are errors, never successful empty searches.

See [Architecture](docs/ARCHITECTURE.md) for the ownership and lifecycle model.

## Commands

- `/signal-grep-health` — show the detected ripgrep version and snapshot usage.
- `/signal-grep-clear` — clear snapshots and invalidate existing cursors.

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

[MIT](LICENSE)
