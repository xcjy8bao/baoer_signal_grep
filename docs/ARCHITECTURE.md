# Architecture

Signal Grep is intentionally a composition of single-purpose components. It optimizes the quality and shape of code evidence, not ripgrep itself. Version 0.5.2 adds responsive, human-facing Pi TUI views over the existing 0.5.1 search contract without changing model-facing text, structured details, cursor state, or search policy.

## Data flow

```text
config.ts ─── selects tool mode and the human-facing interface locale
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

index.ts ───── owns the Pi adapter boundary
    └─► tui/ ───── safely recognizes existing text/details for Pi-only responsive rendering
```

`index.ts` is the Pi adapter entry point. It defines the schema, registers exactly one Signal Grep tool, and composes the runtime with `extension-controls.ts`. The controls module registers human-facing commands and lifecycle cleanup; it also owns conflict checks performed during command transitions so override and Metrics enablement cannot drift into duplicate policies. `runtime.ts` owns the service/metrics/cursor coordination used by the tool and contains no search algorithm. Additive mode uses `signal_grep`; explicit override mode uses `grep` and replaces Pi's built-in implementation. When metrics are enabled, `service.ts` derives both Signal Grep and normal-format text from the same snapshot and passes them to `metrics.ts`. `messages.ts` is the single catalog for human-facing command and notification text in English and Simplified Chinese. Its typed keys enforce catalog completeness, and message formatting rejects missing parameters or translated placeholder drift. Model-facing tool response text is intentionally not routed through it.

## Responsibilities

### Persistent tool mode

`config.ts` owns the complete user-global `signal-grep.json` contract and staged writes. Missing config means additive mode with the English interface; a legacy config without `locale` also defaults to English. The only accepted locales are `en` and `zh-CN`. A one-shot `startMetricsOnNextLoad` handoff lets `/signal-grep-metrics on` persist the override, reload, clear the handoff, and start session-local Metrics without requiring a second command. Commands update config from the complete validated object, so changing override or handoff state cannot discard locale or another field. Invalid JSON, a mistyped value, an unsupported locale, or an inconsistent handoff fails clearly instead of silently changing behavior. Override commands inspect the active grep source and refuse to persist when another extension already owns it.

Because Pi's extension loader rejects duplicate `grep` registrations at load time and fails the whole extension set, config intent alone cannot decide the effective tool name. `conflicts.ts` keeps the data table of packages known to register their own public `grep` tool and detects them in the agent package directory on every load. When the override is configured but such a package is installed, the override degrades to additive `signal_grep` for that session with a visible notice, the config value is never rewritten, and removing the conflicting package restores the override on the next load. Metrics enablement requires an actually active override and is refused while degraded. If conflict detection itself fails, the extension degrades to additive mode and names the detection failure instead of treating it as "no conflict".

The same package detection runs in additive mode to compose prompt guidance. When the known owner is `pi-hashline-edit-pro`, `index.ts` adds one model-facing guideline to retrieve served anchors through hashline before editing Signal Grep evidence. This is advisory composition only: Signal Grep neither mutates hashline's private state nor repeats the hint in result text. Detection failure leaves additive search behavior intact and does not fabricate an interoperability claim.

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

`SnapshotStore` owns snapshot identity, cursor encoding, expiry, memory bounds, and eviction. A cursor contains only a snapshot id, page offset, cursor kind (`summary` or `matches`), and an optional canonical path-selection signature; it never encodes a command to rerun. Summary cursors page the count-ranked file distribution and can independently start details at match offset zero. Match cursors continue only their bound file selection, preventing a later request from silently changing the sequence. The original summary cursor remains reusable for repeated single- or multi-file selections. Retained files also carry revision metadata so context and `mode=inspect` can reject stale current-source evidence.

Snapshots are session-local and are cleared at shutdown. Cursorless results are released immediately. Snapshots with only forward match cursors are released after the final page; snapshots that expose a reusable summary cursor remain available until TTL eviction, memory/count eviction, explicit clear, or shutdown. No state is persisted or dual-written.

### Context budget policy

`context-budget.ts` converts Pi's pre-call context usage into one immutable `ContextBudget`. Thresholds and result-text targets live only in `types.ts`: `full` above 40% remainder targets 2,000 estimated tokens, `tight` from 12% through 40% targets 1,000, and `critical` below 12% targets 500. Missing, null, or invalid host usage produces no decision, preserving the default policy without claiming an adjustment. The service applies a decision only to an implicit `auto` detail-fit trial; explicit limits, `matches`, inspection, and cursor continuation remain on the default page budget.

### Policy composition

`SignalGrepService` composes a runner, a snapshot store, and formatters. Its policy is:

1. no matches → explicit complete empty result;
2. `summary` → one match-count-ranked file-distribution page plus separate summary/detail continuations as needed;
3. implicit `auto` complete result fits its resolved context budget → return every grouped detail directly;
4. `auto` with an explicit `limit` → honor the request with an immediate detail page and cursor if needed;
5. other `auto` results that exceed the adaptive budget or retention is partial → return a summary first;
6. `matches` or a summary cursor → return one default-budget detail page, optionally filtered to one canonical set of retained files;
7. a match cursor → continue only its bound selection;
8. cursor-scoped `inspect` → resolve a stable match index, verify revision, and return a centered bounded source range with the smallest proven enclosing symbol;
9. retention bound exceeded → explicit partial result.

### Output formatting

`format.ts` owns presentation boundaries. File summaries are sorted by descending count with path-order ties, then paged by the public file limit. Detail formatting accepts an internal result-text target for the initial implicit `auto` trial and defaults every other page to about 2,000 estimated tokens. It stops before the match-count, character, or 16 KiB hard byte budget is exceeded. Every match carries its stable snapshot index. Lines over 500 characters use an occurrence-centered excerpt while rendering columns from the untruncated snapshot line. Overlapping context windows are merged, and current-file context is included only when its source revision still equals the retained revision; changed context is omitted and attributed. Retained matching-line text always comes from the snapshot. The normal-format metrics baseline is rendered separately from the same retained matches, reproduces Pi grep's path, context, match-limit, byte-limit, and long-line formatting, and never starts a process.

### Interactive TUI rendering

`tui/presentation.ts` is the fail-open recognition boundary for the existing model-facing text and `SignalGrepDetails`; it does not create durable presentation data. `tui/layout.ts` owns responsive, ANSI/CJK-aware call and collapsed-result layouts. `tui/renderers.ts` adapts those pure views to Pi components, returns the complete original text when expanded, and falls back to the original text for unrecognized shapes or renderer failures. Pi ignores these renderers outside interactive TUI mode, so JSON, RPC, print, Metrics, and stored tool results retain the original contract.

### Source ranges and structure inspection

`source.ts` owns bounded current-file reads, revision metadata, workspace containment, and numbered source ranges. Its centered range builder reserves the model-facing header and omission-marker budget before selecting lines, so an oversized symbol still keeps the requested line in view without exceeding the 16 KiB response contract. It is intentionally separate from `structure.ts`: reading source is valid for every text language, while symbol structure requires a capability provider.

`structure.ts` defines the `CodeStructureProvider` boundary and implements optional Universal Ctags support. The provider validates the exact JSON, line/end field, and extras options used by inspection; `--version` alone is insufficient evidence. It invokes Ctags with a workspace-relative file argument and no unsupported `--` separator, then selects the smallest tag with a proven enclosing range. It never infers ranges from braces or turns provider absence into an ordinary-search failure. Provider statuses such as `provider-unavailable`, `source-unavailable`, `parse-error`, `file-too-large`, `source-changed`, and `no-symbol` remain explicit.

### Opt-in comparison metrics

`metrics.ts` owns one session-local comparison window, the characters-over-four token estimate, exact byte totals, and compact Status Line/report formatting. It is disabled by default. Every new search contributes one Signal Grep result and one normal-format rendering of the exact same snapshot; tracked cursor pages contribute only their Signal Grep result. Locale changes only the human-facing labels and prose after accounting is complete. Metrics never run a second search, alter model-facing search text, persist state, or transmit data.

## Core invariants

- Completed retained match snapshots paginate without omission or duplication.
- Completed file-summary pages cover every retained file in deterministic count-ranked order.
- Partial retention is observable in text and structured details.
- A cursor never silently reruns a search or changes a bound file selection.
- An original summary cursor remains reusable independently of filtered detail continuations.
- A cursor-scoped inspection never silently reads a changed source revision.
- Current-file context is never mixed with retained matching text from another revision.
- Every retained occurrence has a precise range and stable match index; long excerpts keep the occurrence visible.
- Process and protocol errors never become an empty successful result.
- Structure provider absence or parse failure is explicit and does not corrupt ordinary search.
- Limits have one source of truth in `types.ts`.
- Runtime source uses Node.js 22+ APIs and remains executable under Bun 1.4+.
- Disabled metrics render no normal-format baseline and add no status.
- Metrics never recount a normal baseline for cursor continuation and never hide negative savings.
- Additive and override modes each register exactly one Signal Grep-owned public tool.
- Config updates preserve the complete validated object; locale and Metrics handoff state are never dual-written.
- Compact complete searches return directly; adaptive policy never changes the underlying match set.
- Context-aware budgeting never downshifts explicit limits, `matches`, inspection, or cursor continuation.
- A known context adjustment is attributed in structured details; tight and critical adjustments are also explicit in model-facing text.
- TUI rendering never mutates or replaces model-facing text, structured details, cursor state, Metrics accounting, or non-interactive output; unknown or failed presentation paths expose the original text.

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
