# Pi Signal Grep

[![CI](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/pi-plugin-signal-grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · English

Signal Grep is a code-search plugin for the [Pi coding agent](https://pi.dev).

It behaves like a boyfriend or girlfriend who genuinely understands what you are asking. Ask a small question and it gives you the answer. Ask something broad and it does not drop a pile of unorganized material in your lap: it sorts out the important parts first, then stays with you as you look more closely. It remembers what it just found and knows when an old answer is no longer safe to trust.

## How it helps an AI find code

### Small questions get direct answers

When the result is small, Signal Grep gives the AI the complete result at once. It does not split a few useful lines across several unnecessary follow-up requests.

### Big questions get organized first

When the result is large, it first tells the AI how many matches it found, which files contain them, and roughly how many belong to each file, together with real excerpts. It is like asking, “Have we ever talked about taking a trip?” Instead of handing you years of chat history, your partner points to the conversations where it came up and opens the one you choose.

Files are ordered by how often the text actually appears, not by a claim that one file matters more than another. An excerpt is presented as a small piece of the original, never as the whole file.

### Several requests stay separate

The AI can ask for several things at the same time. Signal Grep keeps a separate account for every requested term instead of finding one and forgetting the rest.

When the request says that every condition must appear together, only files that really satisfy every condition remain. When those conditions must appear inside the same function, scattered mentions elsewhere in the file cannot be used to make up an answer.

### A shared name is not mistaken for a shared identity

The same name in code may be a definition, a call, an import, an export, a comment, or ordinary text. Signal Grep separates those uses so the AI does not have to judge from spelling alone.

When the AI wants to investigate one function or class, Signal Grep prepares a small dossier: where the target is, how same-named occurrences are used, and which tests may be related. It offers those items as leads. It never turns “same spelling” into “definitely the same thing,” or “a related test exists” into “this is covered and passing.”

### It knows whether you mean the whole project or only the current change

The AI can ask it to look only at files or lines changed in the current work. It can also list the main parts of a file, follow clear import relationships, or gather tests that may be related. It reports what it actually saw instead of dressing a guess up as a fact.

### “The one we just saw” does not start a new search

After a search, Signal Grep keeps that result safely for follow-up. The AI can open one file, move to the next page, or inspect up to five found locations together without searching again.

If the source changes in the meantime, Signal Grep will not combine an old location with new content. It tells the AI that the source must be checked again. Expired, mistyped, or unrelated follow-ups fail clearly instead of quietly becoming a different search.

### When everything cannot fit, it says so

Signal Grep limits how much material it puts into one response so a single search does not crowd out the rest of the conversation. When the retained result is complete, it says so. When only part could be retained, it says that the result is partial and gives the reason.

Long code is not presented as complete merely because the display ran out of room. Signal Grep gives the AI a next step that can continue reading the original until it has the part it needs.

## Install it and let it work quietly

The plugin adds one Pi tool named `signal_grep`. It does not replace or reconfigure another search tool, and it adds no commands for the user to remember. The AI uses it when appropriate. Expired results, memory housekeeping, search-process cleanup, and end-of-session cleanup are handled automatically.

After the first query, Pi shows one short session note:

```text
Signal Grep: handled 8 queries; all results complete; 3 results automatically organized by file
```

It records only three things that actually happened in the current session: how many new queries were handled, whether their results were complete, and how often results were automatically organized by file. Turning pages and continuing a source read do not count again. The note resets when the session ends and causes no extra search.

## Your code stays on your machine

Searching, organizing, and reading happen locally. The plugin has no telemetry and does not send queries, code, or session figures over the network. It builds no background index and downloads no model.

Search stays inside the current working directory and always excludes `.git` internals, while ordinary hidden files remain searchable. Signal Grep calls the installed `rg` program directly and never builds a shell command from the search text.

## Installation

Install from npm:

```bash
pi install npm:pi-plugin-signal-grep
```

Or install the current code from GitHub:

```bash
pi install git:github.com/xcjy8bao/pi-plugin-signal-grep
```

Restart Pi after installation.

Before using it, make sure Pi is 0.84.3 or newer, `rg` is available on the system, and the runtime is Node.js 22.19+ or Bun 1.4+. The plugin already includes the code-recognition components it needs for JS, TS, TSX, and Go, so there is no separate model download. Universal Ctags is optional when finer code ranges are wanted for other languages, and Signal Grep never downloads it automatically.

## Simplified Chinese interface

The session note and interactive result display use English by default. To use Simplified Chinese, put this in `~/.pi/agent/signal-grep.json`:

```json
{
  "locale": "zh-CN"
}
```

Then restart Pi. Retired settings in an existing configuration are ignored and do not affect search.

## More information

- [Security and privacy](SECURITY.md)
- [Complete behavior and boundaries](docs/ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)

## License

[GNU AGPL v3.0 only](LICENSE)
