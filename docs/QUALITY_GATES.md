# Quality Gates

Signal Grep separates formatting, linting, type checking, behavioral testing, and repository policy. Each gate has one responsibility; no tool duplicates another tool's authority.

## Local command

Run the complete gate before every pull request update:

```bash
bun run check
bun run pack:check
```

`bun run check` executes the following gates in order.

## Oxfmt: deterministic code style

```bash
bun run format:check
```

Oxfmt is the only formatting authority. It checks TypeScript, JSON, Markdown, and YAML for stable whitespace, quoting, line width, trailing commas, and related presentation rules. Contributors can apply the canonical style with:

```bash
bun run format
```

Formatting does not decide program correctness.

## Oxlint: static correctness and maintainability

```bash
bun run lint
```

Oxlint runs with TypeScript type awareness through `oxlint-tsgolint`. Warnings are denied, and unused suppression directives fail the gate.

The repository enables these rule categories as errors:

- `correctness`: code that is wrong, unreachable, or useless;
- `suspicious`: patterns likely to be bugs or misleading;
- `perf`: avoidable performance hazards with a clear replacement.

Enabled plugins add focused analysis for:

- TypeScript and typed promise usage;
- ESM imports and module boundaries;
- Node.js 22 runtime APIs;
- Oxc-native correctness rules;
- Unicorn modern JavaScript rules.

The project does not enable every pedantic, style, restriction, or nursery rule. Oxfmt owns style, and unstable or opinion-only lint rules would create noise instead of protecting the public contract. A local suppression requires a precise reason; unused suppressions are rejected.

## TypeScript: compilation contract

```bash
bun run typecheck
```

TypeScript 7 runs in strict, no-emit mode with erasable syntax only. This gate owns compiler diagnostics and prevents legacy runtime TypeScript features such as enums, namespaces, legacy decorators, and CommonJS drift.

## Bun tests: behavioral contract

```bash
bun test
```

Bun 1.4 is the primary test runner. Tests cover pure boundaries and real ripgrep integration, including:

- exact retained occurrences and bounded range display without losing path/line/match identity;
- Unicode-safe JSON and NUL-delimited candidate paths, workspace confinement, cwd-relative
  include/exclude semantics, and Git exclusions that user globs cannot override;
- scan-before/after revision binding, unchanged-match-line mutations, newly discovered files, and the candidate-metadata cap without lost matches;
- text-visible cursors, first-retained-match samples, selected-file continuation, complete pagination, and cross-page context deduplication;
- cancellation and protocol-failure cleanup, including children that ignore graceful termination and executable startup errors;
- adaptive result budgets, explicit limits, long-line inspection focus, single/batch byte bounds, per-target failures, retries, deduplication, and source revision rechecks;
- provider absence and parse failure, partial snapshots, plain-language session accounting, actual service-output TUI recognition, independent raw-`rg` parity, and medium-repository exhaustive/parallel runtime stress;
- one-scan `anyOf` expansion with Unicode, metacharacters, different-term overlap, case, hidden/
  ignore/exclude policy, Git changed-line containment, pagination, retained counts, invalid shapes,
  and executable inspection;
- impact target selection by name, line, and ordinary snapshot; same-owner compatible-overload
  preference and scope/kind/other ambiguity, unsupported, or anonymous failure before scanning;
  every syntax category, unsupported-file retention, Go candidate certainty, related-test
  non-claims, target-first pagination, stored counts, and source-change failure closure.
- analysis retention prioritization, stable impact test identity, bounded high-cardinality diagnostics, and post-scan cancellation checks.

Controlled process wrappers make the scan-mutation timing deterministic and invoke real ripgrep; these executable-script fixtures run on POSIX. Portable process lifecycle tests and the remaining real-ripgrep matrix also run on Windows. Every asynchronous/process test needs a completion condition and an explicit timeout. Missing optional Ctags must not turn ordinary search into a failure.

## Node compatibility smoke test

```bash
bun run test:node
```

The smoke test builds a temporary Node-targeted bundle, imports it with the configured Node.js executable, and removes the artifact. It verifies that Bun-first development does not introduce Bun-only runtime behavior into the Pi extension.

## Context-shape benchmark

```bash
bun run benchmark
```

The benchmark uses synthetic contract fixtures to verify direct detail, bounded summary, context-budget and cursor-reconstruction behavior. It removes its fixture after execution. Its byte and token-estimate diagnostics are local development evidence, not a release claim or a measure of model performance, task success, cost savings, coverage, or test success in a user repository.

## Package boundary

```bash
bun run pack:check
```

The package dry run verifies exactly which files would be published. It does not publish anything.

## Pull-request enforcement

GitHub Actions runs the same commands on Linux, macOS, and Windows with Node.js 22 and 24. CodeQL adds an independent security analysis.

CI cannot prevent someone from opening a pull request. Repository rules prevent a non-compliant pull request from merging. Local hooks are intentionally not the authority because they can be bypassed and differ by contributor environment.

Required checks and pull-request rules are configured on `main` and apply to administrators. Maintainers must not bypass a failed gate merely to merge faster.

## Publication boundary

The manual publication workflow validates a release tag against the current `main` commit and package metadata, reruns the quality/package gates, and publishes with npm provenance from GitHub Actions. Publication remains a separately authorized action; local validation is not permission to publish.
