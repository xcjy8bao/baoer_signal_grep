# Architecture

Signal Grep is intentionally a small composition of single-purpose components. It optimizes the shape of search information, not ripgrep itself.

## Data flow

```text
config.ts ─── selects additive `signal_grep` or opt-in built-in `grep` override
    │
    ▼
Pi tool input
    │
    ▼
request.ts ── validates and normalizes the public request
    │
    ▼
rg.ts ─────── owns the ripgrep child process and JSON protocol parsing
    │
    ▼
snapshot-store.ts ── owns bounded, stable, session-local snapshots and cursors
    │
    ▼
service.ts ── chooses auto/summary/matches behavior and composes results
    │
    ▼
format.ts ─── owns model-facing summary, page, byte, and context formatting
    │
    └─► metrics.ts ── optionally compares cumulative result text with normal grep
```

`index.ts` is the Pi adapter. It defines the schema, registers exactly one Signal Grep tool, registers commands, and wires lifecycle cleanup. `runtime.ts` owns the service/metrics/cursor coordination used by the tool. It contains no search algorithm. Additive mode uses `signal_grep`; explicit override mode uses `grep` and replaces Pi's built-in implementation. When metrics are enabled, `service.ts` derives both Signal Grep and normal-format text from the same snapshot and passes them to `metrics.ts`.

## Responsibilities

### Persistent tool mode

`config.ts` owns the user-global `signal-grep.json` contract and staged writes. Missing config means additive mode. A one-shot `startMetricsOnNextLoad` handoff lets `/signal-grep-metrics on` persist the override, reload, clear the handoff, and start session-local Metrics without requiring a second command. Invalid JSON or a mistyped value fails clearly instead of silently changing which public tool owns `grep`. Override commands inspect the active grep source and refuse to persist when another extension already owns it. Pi's extension loader also rejects duplicate `grep` registrations, so conflicts fail closed rather than creating ambiguous ownership.

### Request normalization

`request.ts` is the only authority for defaults and numeric bounds. Internal components receive a normalized `SearchRequest` and do not repeat input validation.

### Ripgrep process boundary

`rg.ts` is the only component that starts a process. It:

- builds an argument array without a shell;
- excludes `.git` while preserving meaningful hidden files;
- parses `rg --json` events;
- counts every match even after the retention bound is reached;
- propagates startup, protocol, exit, and cancellation failures.

It never formats model output or owns cursor state.

### Snapshot ownership

`SnapshotStore` owns cursor identity, expiry, memory bounds, and eviction. Cursors reference a snapshot and offset; they never encode a command to rerun. This makes pagination stable even if files change after the initial search.

Snapshots are session-local and are cleared at shutdown. Results without a cursor are released immediately, and a paginated snapshot is released after its final page, so inaccessible compact results cannot evict active cursors. No state is persisted or dual-written.

### Policy composition

`SignalGrepService` composes a runner, a snapshot store, and formatters. Its policy is:

1. no matches → explicit complete empty result;
2. `summary` → file distribution plus detail cursor;
3. `auto` complete result fits the adaptive budget → return every grouped detail directly;
4. `auto` with an explicit `limit` → honor the request with an immediate detail page and cursor if needed;
5. other `auto` results that exceed the adaptive budget or retention is partial → return a summary first;
6. `matches` or cursor → return one adaptive-budget detail page;
7. retention bound exceeded → explicit partial result.

### Output formatting

`format.ts` owns only presentation boundaries. Detail pages target about 2,000 estimated result-text tokens and stop before the match-count, character, or hard byte budget is exceeded. Retained matching-line text always comes from the snapshot. Optional surrounding context is read lazily for files represented on the current page, may reflect edits made after the snapshot, and is omitted explicitly for files over 5 MiB or files that can no longer be read. The normal-format metrics baseline is also rendered here from the same retained matches, reproduces Pi grep's path, context, match-limit, byte-limit, and long-line formatting, and never starts a process.

### Opt-in comparison metrics

`metrics.ts` owns one session-local comparison window, the characters-over-four token estimate, exact byte totals, and compact Status Line/report formatting. It is disabled by default. Every new search contributes one Signal Grep result and one normal-format rendering of the exact same snapshot; tracked cursor pages contribute only their Signal Grep result. Metrics never run a second search, alter model-facing search text, persist state, or transmit data.

## Core invariants

- Completed retained snapshots paginate without omission or duplication.
- Partial retention is observable in text and structured details.
- A cursor never silently reruns a search.
- Process errors never become an empty successful result.
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
- Shell command construction.
- Compatibility aliases for deprecated schemas.

These exclusions keep the correctness boundary small and auditable.
