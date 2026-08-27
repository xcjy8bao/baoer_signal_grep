# Architecture

Signal Grep is intentionally a small composition of single-purpose components. It optimizes the shape of search information, not ripgrep itself.

## Data flow

```text
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
```

`index.ts` is the Pi adapter. It defines the schema, registers the tool and commands, and wires lifecycle cleanup. It contains no search algorithm.

## Responsibilities

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

Snapshots are session-local and are cleared at shutdown. No state is persisted or dual-written.

### Policy composition

`SignalGrepService` composes a runner, a snapshot store, and formatters. Its policy is:

1. no matches → explicit complete empty result;
2. `summary`, or broad `auto` → file distribution plus detail cursor;
3. small `auto`, `matches`, or cursor → bounded detail page;
4. retention bound exceeded → explicit partial result.

### Output formatting

`format.ts` owns only presentation boundaries. Detail pages stop before either the match count or byte budget is exceeded. Context is read lazily for files represented on the current page and is omitted explicitly for files over 5 MiB or files that can no longer be read.

## Core invariants

- Completed retained snapshots paginate without omission or duplication.
- Partial retention is observable in text and structured details.
- A cursor never silently reruns a search.
- Process errors never become an empty successful result.
- Limits have one source of truth in `types.ts`.
- Runtime source uses Node.js 22+ APIs and remains executable under Bun 1.4+.

## Deliberate non-goals

- Replacing ripgrep's matching engine.
- Frecency, fuzzy search, or relevance ranking.
- Persistent indexes or databases.
- Cross-session cursors.
- Shell command construction.
- Compatibility aliases for deprecated schemas.

These exclusions keep the correctness boundary small and auditable.
