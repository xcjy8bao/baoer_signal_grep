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

Bun 1.4 is the primary test runner. Tests cover pure boundaries and real ripgrep integration, including cursor completeness, cancellation, ignore behavior, byte limits, and partial snapshots.

## Node compatibility smoke test

```bash
bun run test:node
```

The smoke test builds a temporary Node-targeted bundle, imports it with the configured Node.js executable, and removes the artifact. It verifies that Bun-first development does not introduce Bun-only runtime behavior into the Pi extension.

## Package boundary

```bash
bun run pack:check
```

The package dry run verifies exactly which files would be published. It does not publish anything.

## Pull-request enforcement

GitHub Actions runs the same commands on Linux, macOS, and Windows with Node.js 22 and 24. CodeQL adds an independent security analysis.

CI cannot prevent someone from opening a pull request. Repository rules prevent a non-compliant pull request from merging. Local hooks are intentionally not the authority because they can be bypassed and differ by contributor environment.

Required checks and pull-request rules are configured on `main` after the initial workflow checks exist. Maintainers must not bypass a failed gate merely to merge faster.
