# Architecture

Signal Grep is intentionally a composition of single-purpose components. It optimizes the quality and shape of project evidence, not ripgrep itself. Version 0.6.6 adds project-wide zero-result recovery, parallel exact multi-term evidence, candidate-prefiltered structural analysis, bounded content-addressed syntax reuse, and dimension-specific coverage. Counts and retained evidence remain separate from presentation limits; a complete search snapshot is not a repository-wide atomic read or semantic binding claim.

## Data flow

```text
config.ts ── interface locale
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
  ├─► format.ts ────── bounded detail pages and deduplicated context
  └─► inspect.ts / inspect-batch.ts ── source verification and bounded single/batch inspection
                   ├─► source.ts ───── file revisions, workspace paths, centered source excerpts
                   └─► structure.ts ── optional Ctags symbols, using owned-process.ts

evidence-service.ts ── advanced-operation policy and analysis pagination
  ├─► source-access.ts ── one verified source read/request plus bounded content-hash syntax reuse
  ├─► syntax.ts ───────── owned compiled ast-grep worker with serialized parser ownership
  ├─► multi-term-search.ts / literal-search.ts ── exact any-of expansion and retained term counts
  ├─► impact-target.ts ── reliable JS/TS/TSX target selection and ambiguity failure
  ├─► impact-analysis.ts ── same-spelling classification, test merge, ordering and retained counts
  ├─► source-inspection.ts / source-pages.ts / source-continuations.ts
  ├─► evidence-candidates.ts / git-source.ts ── normal or fixed Git evidence, current privacy rules
  └─► import-navigation.ts / test-navigation.ts ── bounded static links and test candidates

runtime.ts ── session lifecycle, cancellation and query-summary coordination
  └─► session-summary.ts ── plain-language session facts
index.ts ── Pi schema, stable tool registration and lifecycle hooks
  └─► tui/ ── responsive human-only presentation of existing text/details
```

`index.ts` registers exactly one Signal Grep tool named `signal_grep`; it does not register commands or replace another tool. `runtime.ts` owns session coordination rather than search algorithms. Model-facing evidence remains language-neutral or English, while the passive session status follows the configured interface locale.

The tool schema retains the single-target inspection forms and adds `matchIndices` or `targets` arrays of 1–5 entries. These are mutually exclusive request forms, not aliases or a persisted-format migration. `service.ts` dispatches to single or batch inspection; inspection modules validate their own target combinations before source access.

## Responsibilities

### Stable tool and configuration boundary

`config.ts` owns the user-global `signal-grep.json` locale contract. Missing config means an English interface; the only accepted locales are `en` and `zh-CN`. Existing files may retain retired fields, which are ignored rather than changing tool behavior. Invalid JSON, a non-object value, or an unsupported locale fails clearly.

The public tool name is constant. Signal Grep does not inspect installed packages, claim another tool name, persist tool ownership, or expose a session command surface. This keeps registration independent from unrelated extensions and leaves their lifecycle unchanged.

### Request normalization

`request.ts` is the only authority for defaults and numeric bounds. Internal components receive a normalized `SearchRequest` and do not repeat input validation.

### Advanced evidence ownership

`evidence-service.ts` dispatches mutually exclusive advanced requests, creates one request-scoped `SourceAccess`, and stores the final analysis snapshot. It delegates facts instead of deriving them itself. External import, test and impact navigation use the containing Git repository when detected, otherwise the target file's directory; cwd-local navigation retains cwd as its root. `analysis-store.ts` applies the shared 50,000-item/32 MiB bound, recomputes operation summaries from the items actually admitted, pages at most 30 items within the 16 KiB response bound, and owns session-local cursor expiry and eviction.

`multi-term-search.ts` validates 2–64 distinct single-line literals up to 256 UTF-8 bytes. Each group of at most eight terms uses one alternation candidate scan with the ordinary path/ignore/Git policy; independent groups start concurrently and merge in input order into one analysis snapshot. The multi-term module scans verified bytes independently per input term, preserving different-term overlap and deterministic input-term/path/byte ordering. Changed-line admission requires the exact occurrence to be wholly contained in the retained changed range. A source revision mismatch makes the affected coverage partial instead of combining stale evidence with current bytes.

`syntax-worker.ts` is the TypeScript source of the isolated parser boundary. Release packages execute the checked-in `syntax-worker.mjs` bundle because Node deliberately refuses to strip TypeScript inside `node_modules`. `check:worker` rebuilds the bundle and compares its exact bytes before lint, type checking, tests, and publication, so the executable artifact cannot drift from its source. Only the pinned ast-grep runtime packages remain external to the bundle.

`impact-target.ts` selects one reliable JS/TS/TSX source symbol before a workspace scan. A line chooses the smallest enclosing symbol; a symbol-only overload set chooses its sole implementation, otherwise ambiguity fails. Anonymous/default-export parser placeholders are not searched as source binding names.

`impact-analysis.ts` never filters an exact same-spelling occurrence. It classifies successfully parsed JS/TS/TSX/Go source with the existing syntax facts, retains unsupported or parser-failed source as unclassified, preserves role certainty, and states that binding is unproven. It merges the unchanged related-test evidence contract after structural occurrences, derives all counts from stored items, and stops test augmentation explicitly when exact occurrences consume the shared budget. Test execution remains `not-run` and assertion coverage `not-evaluated`.

### Ripgrep and process boundaries

`rg.ts` owns the matching engine boundary: argument arrays, request-selected search roots, JSON match validation, matching-line counts, and exact occurrence ranges. `service.ts` retries an ordinary zero-result subpath from cwd; `evidence-service.ts` applies the same recovery to content-analysis candidates. The expanded search keeps explicit glob, exclusion, case, literal, and hidden-file semantics and records both requested and effective roots. `path-policy.ts` keeps cwd as the default root while allowing explicit absolute or `..` targets outside it, rejects `.git`, known external credential stores and special system areas after both lexical and canonical resolution, and supplies descendant exclusions for broad external scans. Candidate enumeration and content search receive the same protected-root and file-scope arguments, while cwd-relative targets preserve root-relative user-glob semantics. Git exclusions follow user globs so they cannot be overridden. Ordinary Git change comparison remains cwd-scoped because historical paths and refs belong to that repository boundary.

`git-process.ts` caches the installed Git capability per executable environment. Git 2.45 and newer receives `--no-lazy-fetch`; older Git omits the unsupported option for full repositories and rejects partial/promisor repositories with a focused capability error. Every object read remains non-interactive and does not invoke lazy fetch, replacement objects, filters, hooks, or user execution helpers.

`scan-revisions.ts` first runs `rg --files --null` and streams candidate names with backpressure. It records revisions for at most `MAX_SOURCE_REVISION_FILES` (50,000) candidates, with at most 16 concurrent metadata reads, before content search starts. NUL framing preserves newline-containing names. After content search it checks retained files again and only binds revisions that match both observations. File size, modification time, identity and available change time are compared by `source.ts`.

Changed files, files discovered after enumeration, unreadable metadata, lossy path decoding, and files outside the metadata cache remain unverified. They still contribute matching text and exact counts. `service.ts` derives `sourceUnverifiedFileCount` from retained paths missing a trusted revision and explains the consequence in text. No second state list is maintained. The metadata cap does not reduce the matching set or change snapshot-retention completeness. This policy costs an extra names-only traversal and metadata reads; it does not claim to make search faster or to provide an atomic repository snapshot.

`owned-process.ts` is the shared ripgrep/Ctags subprocess owner. It spawns without a shell, bounds captured stderr by bytes, checks cancellation across spawn, and awaits stdout consumption and child closure. Cancellation or a protocol-consumer failure sends termination, escalates to a forced kill after 250 ms, and reports failure if closure has not completed within two seconds. Startup errors retain their original cause rather than being hidden by a stream-close error. Cleanup failures remain runtime failures.

`capped-lines.ts` bounds LF-delimited protocol records and preserves Unicode U+2028/U+2029 inside JSON strings. The source-name protocol is separately NUL-delimited. Neither raw protocol is model output.

### Snapshot ownership

`SnapshotStore` owns snapshot identity, cursor encoding, expiry, memory bounds, and eviction. A cursor contains only a snapshot id, page offset, cursor kind (`summary` or `matches`), and an optional canonical path-selection signature; it never encodes a command to rerun. Summary cursors page the count-ranked file distribution and can independently start details at match offset zero. Match cursors continue only their bound file selection, preventing a later request from silently changing the sequence. The original summary cursor remains reusable for repeated single- or multi-file selections. Retained files also carry revision metadata so context and `mode=inspect` can reject stale current-source evidence.

Snapshots are session-local and are cleared at shutdown. Cursorless results are released immediately. Snapshots with only forward match cursors are released after the final page; snapshots that expose a reusable summary cursor remain available until TTL eviction, memory/count eviction, or shutdown. No state is persisted or dual-written.

### Context budget policy

`context-budget.ts` converts Pi's pre-call context usage into one immutable `ContextBudget`. Thresholds and result-text targets live only in `types.ts`: `full` above 40% remainder targets 2,000 estimated tokens, `tight` from 12% through 40% targets 1,000, and `critical` below 12% targets 500. Missing, null, or invalid host usage produces no decision, preserving the default policy without claiming an adjustment. The service applies a decision only to an implicit `auto` detail-fit trial; explicit limits, `matches`, inspection, and cursor continuation remain on the default page budget.

### Policy composition

`SignalGrepService` composes a runner, a snapshot store, and formatters. Its policy is:

1. no matches in an explicit subpath → retry from the project root; only a project-wide zero becomes an explicit complete empty result;
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

`format.ts` owns detail output. Detail pages stop at the match-count, character or 16 KiB hard byte boundary. Every rendered matching line keeps its path, original line number, and stable snapshot index. At most `MAX_DISPLAYED_OCCURRENCES` (20) ranges are displayed per line; excess range counts are explicit in text and `occurrenceRangesOmitted`/`occurrenceMatchesTruncated`. The snapshot retains all parsed ranges. Dense same-line matches therefore cannot consume the budget until their identifying evidence disappears.

Lines over 500 source characters use occurrence-centered excerpts while columns remain absolute. Current-file context requires a trusted retained revision and another revision check around reading. Context deduplication also respects matches not yet emitted on a future page, so context cannot display a future match early and duplicate it later. Unavailable or changed context is attributed explicitly.

### Interactive TUI rendering

`tui/presentation.ts` is the fail-open recognition boundary for the existing model-facing text and `SignalGrepDetails`; it does not create durable presentation data. `tui/layout.ts` owns responsive, ANSI/CJK-aware call and collapsed-result layouts. `tui/renderers.ts` adapts those pure views to Pi components, returns the complete original text when expanded, and falls back to the original text for unrecognized shapes or renderer failures. Pi ignores these renderers outside interactive TUI mode, so JSON, RPC, print, session accounting, and stored tool results retain the original contract.

### Source ranges and structure inspection

`source-document.ts` owns the bounded (5 MiB) raw-byte document, UTF-8/UTF-16 offset mapping and revision binding. `source.ts` applies the shared path policy before opening worktree content, including canonical external-path checks. `source-access.ts` caches each verified document for one request and uses a service-level parser queue whose syntax results are keyed by language plus worktree content hash or Git blob. The cache is bounded to 256 entries and one million syntax nodes, evicts least-recently-used entries, and naturally misses after content changes. Structural candidate discovery always precedes the configurable 1–2,000 file parse budget, whose default is 200. For JS/TS/TSX, `syntax.ts` uses its owned ast-grep worker to identify complete implementation boundaries; unsupported languages can use optional Universal Ctags only for a worktree symbol range. Parser/provider absence, parse errors, oversized files, unavailable source and changed source remain distinct statuses.

`source-inspection.ts` validates one cursor-bound or direct target, or a batch of 1–5 targets. It merges same-document ranges before allocating the single 16 KiB response budget, reads and parses each document only once, and reports one `details.inspections` item per input. Valid UTF-8 content is emitted as raw-byte fragments without line clipping. If a range remains, `source-continuations.ts` produces an executable version-bound `sourceCursor` for exactly those missing offsets; it rejects forged, expired or source-changed tokens, while valid replay is idempotent. Non-UTF-8 data is an explicit lossy preview and has no continuation. Cancellation, invalid request combinations and unexpected runtime failures reject rather than fabricate empty source.

A batch is complete when every selected source range has been returned. Source errors remain item-specific where the protocol defines them; overlapping same-version ranges appear once.

### Passive session summary

`session-summary.ts` owns three session-local counters: returned new queries, complete new queries, and implicit `auto` queries whose result was organized by file. A new query has neither a search cursor nor a source continuation cursor. Explicit summaries are not described as automatic work, and cursor pages cannot inflate the total. Completion comes only from the returned `details.status`; the summary never infers task success.

The formatter produces one plain-language English or Simplified Chinese status after the first returned new query. It performs no search, stores no result text or paths, persists nothing, and is cleared from the UI at shutdown. Failed tool calls remain observable as tool errors and are not converted into a successful session fact.

## Core invariants

- Completed retained match snapshots paginate without omission or duplication.
- A zero-result subpath cannot become project-wide negative evidence until cwd has also been searched with the same explicit filters.
- Completed file-summary pages cover every retained file in deterministic count-ranked order.
- Partial retention is observable in text and structured details.
- Analysis top-level counts use analysis items; exact-occurrence, syntax, test/navigation, and retention coverage remain independently observable.
- A cursor never silently reruns a search or changes a bound file selection.
- An original summary cursor remains reusable independently of filtered detail continuations.
- A cursor-scoped inspection never accepts a missing or changed retained source revision; a direct inspection also checks provider/read revision consistency.
- Current-file context is never mixed with retained matching text from another revision.
- Every retained occurrence has a precise range, and every matching line has a stable index. Range display limits never delete retained occurrences or identifying evidence; long excerpts keep the primary occurrence visible.
- Process and protocol errors never become an empty successful result; failure and cancellation await owned subprocess cleanup.
- Cursor errors expose stable malformed, missing, expired, wrong-kind, option-conflict, and offset categories after cursor validity is checked first.
- Structure provider absence or parse failure is explicit and does not corrupt ordinary search.
- Limits have one source of truth in `types.ts` or `analysis-limits.ts`, according to their owner.
- Exact multi-term and impact counts are derived from retained stored items; partial counts never become repository totals.
- Multi-term requests above eight terms use bounded parallel chunks and retain one input-term/path/byte order across pagination.
- Impact retains every admitted exact same-spelling occurrence and never upgrades it into a semantic binding or test-coverage claim.
- Runtime source uses Node.js 22+ APIs and remains executable under Bun 1.4+.
- Signal Grep registers only `signal_grep` and exposes no public commands.
- Session facts count only returned new queries; cursor and source continuation pages never inflate them.
- Session status never claims model performance, task success, token savings, or cost savings.
- Compact complete searches return directly; adaptive policy and the candidate-revision cache never change the underlying match set.
- Summary samples are retained source evidence, not relevance ranking; their cursor and follow-up instructions are visible in model-facing text.
- Batch inspection has one byte budget, per-input outcomes, and no duplicate same-revision source lines.
- Context-aware budgeting never downshifts explicit limits, `matches`, inspection, or cursor continuation.
- Optional display redaction never changes admission, matching, counts, coverage, stored evidence, or continuation policy; project files remain searchable by default.
- A known context adjustment is attributed in structured details; tight and critical adjustments are also explicit in model-facing text.
- TUI rendering never mutates or replaces model-facing text, structured details, cursor state, session accounting, or non-interactive output; unknown or failed presentation paths expose the original text.
