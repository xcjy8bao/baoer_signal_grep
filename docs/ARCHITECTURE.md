# Architecture

Signal Grep is intentionally a composition of single-purpose components. It optimizes the quality and shape of code evidence, not ripgrep itself. Version 0.5.8 adds reliable parser-backed source boundaries, source-range continuation, explicit conjunctions and roles, fixed Git scopes, static ESM navigation, related-test candidates, and paged outlines. Counts and retained evidence remain separate from presentation limits; a complete search snapshot is not a repository-wide atomic read.

## Data flow

```text
config.ts / conflicts.ts ── tool ownership, locale, installed-tool conflicts
             │
             ▼
request.ts ── public search defaults and normalization
             │
             ▼
rg.ts ─────── matching arguments, JSON events, exact occurrence ranges
  │          │
  │          ├─► scan-revisions.ts ── names-only enumeration and bounded before/after metadata
  │          └─► owned-process.ts ── spawn, cancellation, termination, stream closure
  ▼
snapshot-store.ts ── bounded session snapshots, stable indices and cursors
  │
  ▼
service.ts ── auto/summary/matches/inspect policy and response composition
  ├─► summary.ts ───── count-ranked file pages and real retained samples
  ├─► format.ts ────── bounded detail pages, deduplicated context and normal-format baseline
  └─► inspect.ts / inspect-batch.ts ── source verification and bounded single/batch inspection
                   ├─► source.ts ───── file revisions, workspace paths, centered source excerpts
                   └─► structure.ts ── optional Ctags symbols, using owned-process.ts

evidence-service.ts ── advanced-operation policy and analysis pagination
  ├─► source-access.ts ── one verified source read and serialized parser ownership per request
  ├─► syntax.ts ───────── owned ast-grep worker; JS/TS/TSX/Go facts only live in the request
  ├─► source-inspection.ts / source-pages.ts / source-continuations.ts
  ├─► evidence-candidates.ts / git-source.ts ── normal or fixed Git evidence, current privacy rules
  └─► import-navigation.ts / test-navigation.ts ── bounded static links and test candidates

runtime.ts ── session lifecycle, cancellation, cursor/metrics coordination
index.ts / extension-controls.ts ── Pi schema, tool registration and commands
  ├─► metrics.ts ── opt-in comparable search-text accounting
  └─► tui/ ─────── responsive human-only presentation of existing text/details
```

`index.ts` registers exactly one Signal Grep tool: additive `signal_grep` or explicit override `grep`. `runtime.ts` owns session coordination rather than search algorithms. `extension-controls.ts` owns commands, conflict checks during transitions, and lifecycle cleanup. `messages.ts` is the typed English/Simplified Chinese catalog for human-facing commands and notifications; model-facing evidence is not translated through that catalog.

The tool schema retains the single-target inspection forms and adds `matchIndices` or `targets` arrays of 1–5 entries. These are mutually exclusive request forms, not aliases or a persisted-format migration. `service.ts` dispatches to single or batch inspection; inspection modules validate their own target combinations before source access.

## Responsibilities

### Persistent tool mode

`config.ts` owns the complete user-global `signal-grep.json` contract and staged writes. Missing config means additive mode with the English interface; a legacy config without `locale` also defaults to English. The only accepted locales are `en` and `zh-CN`. A one-shot `startMetricsOnNextLoad` handoff lets `/signal-grep-metrics on` persist the override, reload, clear the handoff, and start session-local Metrics without requiring a second command. Commands update config from the complete validated object, so changing override or handoff state cannot discard locale or another field. Invalid JSON, a mistyped value, an unsupported locale, or an inconsistent handoff fails clearly instead of silently changing behavior. Override commands inspect the active grep source and refuse to persist when another extension already owns it.

Because Pi's extension loader rejects duplicate `grep` registrations at load time and fails the whole extension set, config intent alone cannot decide the effective tool name. `conflicts.ts` keeps the data table of packages known to register their own public `grep` tool and detects them in the agent package directory on every load. When the override is configured but such a package is installed, the override degrades to additive `signal_grep` for that session with a visible notice, the config value is never rewritten, and removing the conflicting package restores the override on the next load. Metrics enablement requires an actually active override and is refused while degraded. If conflict detection itself fails, the extension degrades to additive mode and names the detection failure instead of treating it as "no conflict".

The same package detection runs in additive mode to compose prompt guidance. When the known owner is `pi-hashline-edit-pro`, `index.ts` adds one model-facing guideline to retrieve served anchors through hashline before editing Signal Grep evidence. This is advisory composition only: Signal Grep neither mutates hashline's private state nor repeats the hint in result text. Detection failure leaves additive search behavior intact and does not fabricate an interoperability claim.

### Request normalization

`request.ts` is the only authority for defaults and numeric bounds. Internal components receive a normalized `SearchRequest` and do not repeat input validation.

### Ripgrep and process boundaries

`rg.ts` owns the matching engine boundary: argument arrays, workspace-scoped search roots, JSON match validation, matching-line counts, and exact occurrence ranges. One shared file-scope argument builder applies hidden-file, include, exclude, and ignore behavior to candidate enumeration and content search. Git exclusions follow user globs so they cannot be overridden; explicit Git-internal search paths are rejected.

`scan-revisions.ts` first runs `rg --files --null` and streams candidate names with backpressure. It records revisions for at most `MAX_SOURCE_REVISION_FILES` (50,000) candidates, with at most 16 concurrent metadata reads, before content search starts. NUL framing preserves newline-containing names. After content search it checks retained files again and only binds revisions that match both observations. File size, modification time, identity and available change time are compared by `source.ts`.

Changed files, files discovered after enumeration, unreadable metadata, lossy path decoding, and files outside the metadata cache remain unverified. They still contribute matching text and exact counts. `service.ts` derives `sourceUnverifiedFileCount` from retained paths missing a trusted revision and explains the consequence in text. No second state list is maintained. The metadata cap does not reduce the matching set or change snapshot-retention completeness. This policy costs an extra names-only traversal and metadata reads; it does not claim to make search faster or to provide an atomic repository snapshot.

`owned-process.ts` is the shared ripgrep/Ctags subprocess owner. It spawns without a shell, bounds captured stderr by bytes, checks cancellation across spawn, and awaits stdout consumption and child closure. Cancellation or a protocol-consumer failure sends termination, escalates to a forced kill after 250 ms, and reports failure if closure has not completed within two seconds. Startup errors retain their original cause rather than being hidden by a stream-close error. Cleanup failures remain runtime failures.

`capped-lines.ts` bounds LF-delimited protocol records and preserves Unicode U+2028/U+2029 inside JSON strings. The source-name protocol is separately NUL-delimited. Neither raw protocol is model output.

### Snapshot ownership

`SnapshotStore` owns snapshot identity, cursor encoding, expiry, memory bounds, and eviction. A cursor contains only a snapshot id, page offset, cursor kind (`summary` or `matches`), and an optional canonical path-selection signature; it never encodes a command to rerun. Summary cursors page the count-ranked file distribution and can independently start details at match offset zero. Match cursors continue only their bound file selection, preventing a later request from silently changing the sequence. The original summary cursor remains reusable for repeated single- or multi-file selections. Retained files also carry revision metadata so context and `mode=inspect` can reject stale current-source evidence.

Snapshots are session-local and are cleared at shutdown. Cursorless results are released immediately. Snapshots with only forward match cursors are released after the final page; snapshots that expose a reusable summary cursor remain available until TTL eviction, memory/count eviction, explicit clear, or shutdown. No state is persisted or dual-written.

### Context budget policy

`context-budget.ts` converts Pi's pre-call context usage into one immutable `ContextBudget`. Thresholds and result-text targets live only in `types.ts`: `full` above 40% remainder targets 2,000 estimated tokens, `tight` from 12% through 40% targets 1,000, and `critical` below 12% targets 500. Missing, null, or invalid host usage produces no decision, preserving the default policy without claiming an adjustment. The service applies a decision only to an implicit `auto` detail-fit trial; explicit limits, `matches`, inspection, and cursor continuation remain on the default page budget.

### Policy composition

`SignalGrepService` composes a runner, a snapshot store, and formatters. Its policy is:

1. no matches → explicit complete empty result;
2. `summary` → a count-ranked file page, bounded source-preview windows that fit the budget, and a cursor in the text and details;
3. implicit `auto` complete result fits its resolved context budget → return every grouped detail directly;
4. `auto` with an explicit `limit` → honor the request with an immediate detail page and cursor if needed;
5. other `auto` results that exceed the adaptive budget or retention is partial → return a summary first;
6. `matches` or a summary cursor → return one default-budget detail page, optionally filtered to one canonical set of retained files;
7. a match cursor → continue only its bound selection;
8. single or batch `inspect` → resolve one target or 1–5 targets, verify revisions, parse supported source once per request, and return complete source ranges or version-bound byte continuations;
9. retention bound exceeded → explicit partial result.

### Output formatting

`summary.ts` owns count-ranked file rows and bounded previews. File rows are emitted first; preview selection is limited to five files, two non-overlapping windows per file and seven lines per window. Preview markers retain the path, line and stable match number, but they are not relevance ranking, syntax interpretation, or exhaustive code coverage. The service exposes `summaryPreviewsShown`/`summaryPreviewsOmitted` and never assumes that structured-only cursor metadata reaches the model.

`format.ts` owns detail and normal-baseline output. Detail pages stop at the match-count, character or 16 KiB hard byte boundary. Every rendered matching line keeps its path, original line number, and stable snapshot index. At most `MAX_DISPLAYED_OCCURRENCES` (20) ranges are displayed per line; excess range counts are explicit in text and `occurrenceRangesOmitted`/`occurrenceMatchesTruncated`. The snapshot retains all parsed ranges. Dense same-line matches therefore cannot consume the budget until their identifying evidence disappears.

Lines over 500 source characters use occurrence-centered excerpts while columns remain absolute. Current-file context requires a trusted retained revision and another revision check around reading. Context deduplication also respects matches not yet emitted on a future page, so context cannot display a future match early and duplicate it later. Unavailable or changed context is attributed explicitly.

The normal-format Metrics baseline is rendered from the same retained matches, reproducing Pi grep's path, context, match-limit, byte-limit and long-line formatting. It does not run a separate search. Its bounded prefix and limit notices are preserved, not described as a claim of completeness.

### Interactive TUI rendering

`tui/presentation.ts` is the fail-open recognition boundary for the existing model-facing text and `SignalGrepDetails`; it does not create durable presentation data. `tui/layout.ts` owns responsive, ANSI/CJK-aware call and collapsed-result layouts. `tui/renderers.ts` adapts those pure views to Pi components, returns the complete original text when expanded, and falls back to the original text for unrecognized shapes or renderer failures. Pi ignores these renderers outside interactive TUI mode, so JSON, RPC, print, Metrics, and stored tool results retain the original contract.

### Source ranges and structure inspection

`source-document.ts` owns the bounded (5 MiB) raw-byte document, UTF-8/UTF-16 offset mapping, revision binding and workspace containment. `source-access.ts` caches that document and serializes parser use for one request. For JS/TS/TSX, `syntax.ts` uses its owned ast-grep worker to identify complete implementation boundaries; unsupported languages can use optional Universal Ctags only for a worktree symbol range. Parser/provider absence, parse errors, oversized files, unavailable source and changed source remain distinct statuses.

`source-inspection.ts` validates one cursor-bound or direct target, or a batch of 1–5 targets. It merges same-document ranges before allocating the single 16 KiB response budget, reads and parses each document only once, and reports one `details.inspections` item per input. Valid UTF-8 content is emitted as raw-byte fragments without line clipping. If a range remains, `source-continuations.ts` produces an executable version-bound `sourceCursor` for exactly those missing offsets; it rejects forged, expired or source-changed tokens, while valid replay is idempotent. Non-UTF-8 data is an explicit lossy preview and has no continuation. Cancellation, invalid request combinations and unexpected runtime failures reject rather than fabricate empty source.

A batch is complete when every selected source range has been returned. Source errors remain item-specific where the protocol defines them; overlapping same-version ranges appear once.

### Opt-in comparison metrics

`metrics.ts` owns one session-local comparison window, the characters-over-four token estimate, exact byte totals, and compact Status Line/report formatting. It is disabled by default. Every comparable new search contributes one Signal Grep result and one normal-format rendering of the same snapshot; tracked cursor pages contribute only their Signal Grep result. Single and batch inspections are excluded. This is search-result-text accounting, not task-total tokens, model reasoning cost, API billing, or an estimate of inspection/read output. Locale changes only the human-facing labels and prose after accounting is complete. Metrics never run a second search, alter model-facing search text, persist state, or transmit data.

For truncated matching lines within the normal baseline's first page, `rg.ts` retains the original normalized first 500 characters separately from the match-centered excerpt. `formatNormalBlock` uses that scan-time prefix to reproduce normal grep's head truncation without reading a changed source file. Only the first `pageSize` matches can carry this extra prefix: public requests cap that page at 100, bounding additional retained text to 50,000 UTF-16 code units per snapshot, excluding runtime/object overhead. Missing required prefix evidence fails explicitly.

## Core invariants

- Completed retained match snapshots paginate without omission or duplication.
- Completed file-summary pages cover every retained file in deterministic count-ranked order.
- Partial retention is observable in text and structured details.
- A cursor never silently reruns a search or changes a bound file selection.
- An original summary cursor remains reusable independently of filtered detail continuations.
- A cursor-scoped inspection never accepts a missing or changed retained source revision; a direct inspection also checks provider/read revision consistency.
- Current-file context is never mixed with retained matching text from another revision.
- Every retained occurrence has a precise range, and every matching line has a stable index. Range display limits never delete retained occurrences or identifying evidence; long excerpts keep the primary occurrence visible.
- Process and protocol errors never become an empty successful result; failure and cancellation await owned subprocess cleanup.
- Structure provider absence or parse failure is explicit and does not corrupt ordinary search.
- Limits have one source of truth in `types.ts`.
- Runtime source uses Node.js 22+ APIs and remains executable under Bun 1.4+.
- Disabled metrics render no normal-format baseline and add no status.
- Metrics never recount a normal baseline for cursor continuation and never hide negative savings.
- Additive and override modes each register exactly one Signal Grep-owned public tool.
- Config updates preserve the complete validated object; locale and Metrics handoff state are never dual-written.
- Compact complete searches return directly; adaptive policy and the candidate-revision cache never change the underlying match set.
- Summary samples are retained source evidence, not relevance ranking; their cursor and follow-up instructions are visible in model-facing text.
- Batch inspection has one byte budget, per-input outcomes, and no duplicate same-revision source lines.
- Inspection output is excluded from Metrics and must not be represented as task-level token savings.
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
