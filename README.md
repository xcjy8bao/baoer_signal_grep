# baoer_signal_grep

[![CI](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/ci.yml/badge.svg)](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/ci.yml)
[![CodeQL](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/codeql.yml/badge.svg)](https://github.com/xcjy8bao/baoer_signal_grep/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)

[简体中文](README.zh-CN.md) · English

baoer_signal_grep is a search tool for [Pi](https://pi.dev), Claude Code, Codex, and other MCP clients.

It behaves like a boyfriend or girlfriend who genuinely understands what you are asking. Ask a small question and it gives you the answer. Ask something broad and it does not drop a pile of unorganized material in your lap: it sorts out the important parts first, then stays with you as you look more closely. It remembers what it just found and knows when an old answer is no longer safe to trust.

## How it helps an AI find code

### Small questions get direct answers

When the result is small, baoer_signal_grep gives the AI the complete result at once. It does not split a few useful lines across several unnecessary follow-up requests.

### Big questions get organized first

When the result is large, it first tells the AI how many matches it found, which files contain them, and roughly how many belong to each file, together with real excerpts. It is like asking, “Have we ever talked about taking a trip?” Instead of handing you years of chat history, your partner points to the conversations where it came up and opens the one you choose.

Files are ordered by how often the text actually appears, not by a claim that one file matters more than another. An excerpt is presented as a small piece of the original, never as the whole file.

### Several requests stay separate

The AI can ask for several things at the same time. baoer_signal_grep keeps a separate account for every requested term instead of finding one and forgetting the rest.

When the request says that every condition must appear together, only files that really satisfy every condition remain. When those conditions must appear inside the same function, scattered mentions elsewhere in the file cannot be used to make up an answer.

### A shared name is not mistaken for a shared identity

The same name in code may be a definition, a call, an import, an export, a comment, or ordinary text. baoer_signal_grep separates those uses so the AI does not have to judge from spelling alone.

When the AI wants to investigate one function or class, baoer_signal_grep prepares a small dossier: where the target is, how same-named occurrences are used, and which tests may be related. It offers those items as leads. It never turns “same spelling” into “definitely the same thing,” or “a related test exists” into “this is covered and passing.”

### It knows whether you mean the whole project or only the current change

The AI can ask it to look only at files or lines changed in the current work. It can also list the main parts of a file, follow clear import relationships, or gather tests that may be related. It reports what it actually saw instead of dressing a guess up as a fact.

### “The one we just saw” does not start a new search

After a search, baoer_signal_grep keeps that result safely for follow-up. The AI can open one file, move to the next page, or inspect up to five found locations together without searching again.

If the source changes in the meantime, baoer_signal_grep will not combine an old location with new content. It tells the AI that the source must be checked again. Expired, mistyped, or unrelated follow-ups fail clearly instead of quietly becoming a different search.

### When everything cannot fit, it says so

baoer_signal_grep limits how much material it puts into one response so a single search does not crowd out the rest of the conversation. When the retained result is complete, it says so. When only part could be retained, it says that the result is partial and gives the reason.

Long code is not presented as complete merely because the display ran out of room. baoer_signal_grep gives the AI a next step that can continue reading the original until it has the part it needs.

## Install it and let it work quietly

The plugin adds one Pi tool named `baoer_signal_grep`. It does not replace or reconfigure another search tool, and it adds no commands for the user to remember. The AI uses it when appropriate. Expired results, memory housekeeping, search-process cleanup, and end-of-session cleanup are handled automatically.

After the first query, Pi shows one short session note:

```text
baoer_signal_grep: handled 8 queries; all results complete; 3 results automatically organized by file
```

It records only three things that actually happened in the current session: how many new queries were handled, whether their results were complete, and how often results were automatically organized by file. Turning pages and continuing a source read do not count again. The note resets when the session ends and causes no extra search.

## Your code stays on your machine

When used as a local Pi extension or a local stdio MCP server, searching, organizing, and reading happen on the client machine. baoer_signal_grep has no telemetry and does not send queries, code, or session figures over the network. It builds no background index and downloads no model. `npx` may contact the configured npm registry when it installs the package. When the optional HTTP MCP server is used remotely, requests and returned evidence travel over the connection configured by the deployment.

When no path is given, search stays inside the current working directory. An explicit absolute path or `..` traversal may search or inspect outside it, but `.git` internals, known credential stores, and special system areas are rejected; these protections are defense in depth, not a promise to identify every sensitive file. Ordinary Git change comparisons remain scoped to the current working directory. Hidden files otherwise remain searchable. baoer_signal_grep calls the installed `rg` program directly and never builds a shell command from the search text.

## Claude Code and Codex

The npm package includes a local stdio MCP transport. It requires Node.js 22.19+ and `rg` in `PATH`; Pi and Bun are not required. Each client starts its own process, owns an independent cursor store, and shuts it down when the MCP connection closes.

Add it to the current Claude Code project:

```bash
claude mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.0.0 baoer_signal_grep_mcp --stdio
```

Claude Code supplies its stable project root through `CLAUDE_PROJECT_DIR`. The command above uses Claude Code's default local scope and does not change another project. Use `--scope project` only when you deliberately want Claude Code to write a shared `.mcp.json`.

Add it to Codex:

```bash
codex mcp add baoer_signal_grep -- npx -y --package baoer_signal_grep@1.0.0 baoer_signal_grep_mcp --stdio
```

Codex starts the server in the active project working directory. In either client, `BAOER_SIGNAL_GREP_MCP_CWD` can explicitly override the default root. The stdio transport opens no listening port and writes protocol messages only to stdout; startup diagnostics go to stderr. The MCP initialization instructions and tool schema carry the same search workflow guidance used by the Pi extension.

If the package is already installed globally, `baoer_signal_grep_mcp --stdio` can replace the `npx` command.

## Remote HTTP MCP server

The package can expose the same `baoer_signal_grep` capability to a remote agent through an MCP server. The server reads the filesystem where it runs; it does not SSH into another machine or execute caller-supplied shell commands.

Install the standalone server on the remote host; Pi and Bun are not required for this mode:

```bash
npm install --global baoer_signal_grep
```

The MCP executable requires Node.js 22.19+ and `rg` in `PATH`. Prebuilt JS, TS, and TSX recognition is included for x64 and ARM64 Linux, macOS, and Windows. Prebuilt Go recognition is included for x64 on all three systems and ARM64 on Linux and macOS; on Windows ARM64, ordinary search still works but Go structure-aware modes need a locally buildable Go parser. Universal Ctags remains optional.

Build the checked-in Node-compatible server artifact during development:

```bash
bun run build:mcp
```

On Linux or macOS, run the server against the remote project:

```bash
BAOER_SIGNAL_GREP_MCP_CWD=/path/to/project baoer_signal_grep_mcp --http
```

On Windows PowerShell:

```powershell
$env:BAOER_SIGNAL_GREP_MCP_CWD = "C:\path\to\project"
baoer_signal_grep_mcp --http
```

The endpoint is `/mcp` and listens on `127.0.0.1:3000` by default. Running `baoer_signal_grep_mcp` without an argument remains an alias for `--http`. The server has no built-in authentication; do not bind it to a public interface without an authenticated gateway. A deployment gateway may expose it to authenticated remote clients. Set `BAOER_SIGNAL_GREP_MCP_HOST`, `BAOER_SIGNAL_GREP_MCP_PORT`, and `BAOER_SIGNAL_GREP_MCP_CWD` when the host requires different values.

Standard MCP clients do not send a browser `Origin` header and need no additional configuration. Browser-based clients must be allowed explicitly with a comma-separated `BAOER_SIGNAL_GREP_MCP_ALLOWED_ORIGINS` list; an allowed origin receives the preflight and exposed session headers needed for direct browser access. The server keeps at most 100 sessions and expires an idle session after 10 minutes by default; deployments can tune these operational bounds with `BAOER_SIGNAL_GREP_MCP_MAX_SESSIONS` and `BAOER_SIGNAL_GREP_MCP_SESSION_IDLE_MS`. Each request body is limited to 16 MiB.

Remote calls preserve the local tool contract, including bounded results, cursors, source inspection, static analysis clues, display redaction, and protected-path checks. The default search root is the configured working directory; explicit absolute and `..` paths can reach other non-protected paths readable by the server process. Git change searches remain scoped to the current repository.

## Pi installation

Install from npm:

```bash
pi install npm:baoer_signal_grep
```

Or install the current code from GitHub:

```bash
pi install git:github.com/xcjy8bao/baoer_signal_grep
```

Restart Pi after installation.

For Pi usage, make sure Pi is 0.84.3 or newer, `rg` is available on the system, and the runtime is Node.js 22.19+ or Bun 1.4+. The plugin already includes the code-recognition components it needs for JS, TS, TSX, and Go, so there is no separate model download. Universal Ctags is optional when finer code ranges are wanted for other languages, and baoer_signal_grep never downloads it automatically.

## Simplified Chinese interface

The session note and interactive result display use English by default. To use Simplified Chinese, put this in `~/.pi/agent/baoer_signal_grep.json`:

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
