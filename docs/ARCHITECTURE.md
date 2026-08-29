# Architecture

Signal Grep is intentionally a composition of single-purpose components. It optimizes the quality and shape of code evidence, not ripgrep itself. Version 0.4 adds precise match ranges, targeted snapshot selection, bounded source inspection, and an optional structure provider without turning the core into a background index or language server.

## Data flow

```text
config.ts ─── selects additive `signal_grep` or opt-in built-in `grep` override
    │
    ▼
conflicts.ts ─ detects installed packages that own the public "grep" tool name
    │
    ▼
Pi tool input
    │
    ▼
request.ts ── validates and normalizes the public request
    │
    ▼
rg.ts ─────── owns the ripgrep child process, bounded JSON-line parsing, and match ranges
    │
    ▼
snapshot-store.ts ── owns bounded, stable, session-local snapshots, cursors, and revisions
    │
    ▼
service.ts ── chooses auto/summary/matches/inspect behavior and composes results
    │          │
    │          └─► source.ts ── owns bounded source ranges, revisions, and workspace paths
    │
    ▼
format.ts ─── owns model-facing summary, page, byte, and deduplicated context formatting
    │
    ├─► structure.ts ── optionally maps a source location to an enclosing symbol
    │
    └─► metrics.ts ── optionally compares cumulative result text with normal grep
```

`index.ts` is the Pi adapter. It defines the schema, registers exactly one Signal Grep tool, registers commands, and wires lifecycle cleanup. `runtime.ts` owns the service/metrics/cursor coordination used by the tool. It contains no search algorithm. Additive mode uses `signal_grep`; explicit override mode uses `grep` and replaces Pi's built-in implementation. When metrics are enabled, `service.ts` derives both Signal Grep and normal-format text from the same snapshot and passes them to `metrics.ts`. `messages.ts` owns the templates for human-facing command and notification text; model-facing tool response text is intentionally not routed through it.

## Responsibilities

### Persistent tool mode

`config.ts` owns the user-global `signal-grep.json` contract and staged writes. Missing config means additive mode. A one-shot `startMetricsOnNextLoad` handoff lets `/signal-grep-metrics on` persist the override, reload, clear the handoff, and start session-local Metrics without requiring a second command. Invalid JSON or a mistyped value fails clearly instead of silently changing which public tool owns `grep`. Override commands inspect the active grep source and refuse to persist when another extension already owns it.

Because Pi's extension loader rejects duplicate `grep` registrations at load time and fails the whole extension set, config intent alone cannot decide the effective tool name. `conflicts.ts` keeps the data table of packages known to register their own public `grep` tool and detects them in the agent package directory on every load. When the override is configured but such a package is installed, the override degrades to additive `signal_grep` for that session with a visible notice, the config value is never rewritten, and removing the conflicting package restores the override on the next load. Metrics enablement requires an actually active override and is refused while degraded. If conflict detection itself fails, the extension degrades to additive mode and names the detection failure instead of treating it as "no conflict".

### Request normalization

`request.ts` is the only authority for defaults and numeric bounds. Internal components receive a normalized `SearchRequest` and do not repeat input validation.

### Ripgrep process boundary

`rg.ts` is the only component that starts the ripgrep process. It:

- builds an argument array without a shell;
- confines the search root to the working directory;
- excludes `.git` while preserving meaningful hidden files;
- parses `rg --json` events through a bounded LF reader;
- retains every occurrence range while counting matching lines;
- captures source revision metadata for retained files;
- propagates startup, protocol, exit, and cancellation failures.

It never formats model output or owns cursor state. `capped-lines.ts` deliberately treats only LF as a delimiter so valid Unicode separators inside JSON strings cannot corrupt the protocol.

### Snapshot ownership

`SnapshotStore` owns cursor identity, expiry, memory bounds, and eviction. Cursors reference a snapshot and offset; they never encode a command to rerun. This makes pagination stable even if files change after the initial search. A cursor continuation can select one retained file without rerunning the scan. Retained files also carry revision metadata so `mode=inspect` can reject stale evidence before reading a structure block.

Snapshots are session-local and are cleared at shutdown. Results without a cursor are released immediately, and a paginated snapshot is released after its final page, so inaccessible compact results cannot evict active cursors. No state is persisted or dual-written.

### Policy composition

`SignalGrepService` composes a runner, a snapshot store, and formatters. Its policy is:

1. no matches → explicit complete empty result;
2. `summary` → file distribution plus detail cursor;
3. `auto` complete result fits the adaptive budget → return every grouped detail directly;
4. `auto` with an explicit `limit` → honor the request with an immediate detail page and cursor if needed;
5. other `auto` results that exceed the adaptive budget or retention is partial → return a summary first;
6. `matches` or cursor → return one adaptive-budget detail page, optionally filtered to one retained file;
7. `inspect` → return a bounded source range and the smallest proven enclosing symbol when a provider can supply it;
8. retention bound exceeded → explicit partial result.

### Output formatting

`format.ts` owns only presentation boundaries. Detail pages target about 2,000 estimated result-text tokens and stop before the match-count, character, or hard byte budget is exceeded. Matching columns are rendered from the untruncated snapshot line. Overlapping context windows are merged so a source line is emitted once per page, while every matching line remains represented. Retained matching-line text always comes from the snapshot. Optional surrounding context is read lazily for files represented on the current page and is omitted explicitly for files over 5 MiB or files that can no longer be read. The normal-format metrics baseline is also rendered here from the same retained matches, reproduces Pi grep's path, context, match-limit, byte-limit, and long-line formatting, and never starts a process.

### Source ranges and structure inspection

`source.ts` owns bounded current-file reads, revision metadata, workspace containment, and numbered source ranges. It is intentionally separate from `structure.ts`: reading source is valid for every text language, while symbol structure requires a capability provider.

`structure.ts` defines the `CodeStructureProvider` boundary and currently implements an optional Universal Ctags provider. It selects the smallest tag with a proven enclosing range. It does not infer ranges from braces, silently rank symbols, or make a missing external executable fatal to ordinary search. Provider failures are returned as explicit statuses such as `provider-unavailable`, `source-unavailable`, `parse-error`, `file-too-large`, or `source-changed`.

### Opt-in comparison metrics

`metrics.ts` owns one session-local comparison window, the characters-over-four token estimate, exact byte totals, and compact Status Line/report formatting. It is disabled by default. Every new search contributes one Signal Grep result and one normal-format rendering of the exact same snapshot; tracked cursor pages contribute only their Signal Grep result. Metrics never run a second search, alter model-facing search text, persist state, or transmit data.

## Core invariants

- Completed retained snapshots paginate without omission or duplication.
- Partial retention is observable in text and structured details.
- A cursor never silently reruns a search.
- A cursor-scoped inspection never silently reads a changed source revision.
- Every retained occurrence has a precise range; matching-line pagination semantics remain unchanged.
- Process and protocol errors never become an empty successful result.
- Structure provider absence or parse failure is explicit and does not corrupt ordinary search.
- Limits have one source of truth in `types.ts`.
- Runtime source uses Node.js 22+ APIs and remains executable under Bun 1.4+.
- Disabled metrics render no normal-format baseline and add no status.
- Metrics never recount a normal baseline for cursor continuation and never hide negative savings.
- Additive and override modes each register exactly one Signal Grep-owned public tool.
- Compact complete searches return directly; adaptive policy never changes the underlying match set.

## Deliberate non-goals

- Replacing ripgrep's matching engine.
- Frecency, fuzzy search, or relevance ranking.
- Persistent indexes or databases.
- Cross-session cursors.
- Full LSP definition/reference/call-graph semantics.
- Claiming syntax structure for unsupported languages.
- Shell command construction.
- Compatibility aliases for deprecated schemas.

These exclusions keep the correctness boundary small and auditable.
