# AI Pull Request Guide

This document is the authoritative pull-request protocol for AI contributors and humans supervising AI-generated changes. `AGENTS.md` contains the concise always-loaded rules; this guide defines the evidence expected in review.

## 1. Before editing

1. Read `AGENTS.md`, this guide, the architecture document, and `QUALITY_GATES.md`.
2. Confirm the issue or requested outcome in observable terms.
3. Identify the public contract, failure semantics, and lifecycle boundaries touched.
4. Inspect current implementation and tests before proposing a new abstraction.
5. Create one focused branch from updated `main`.

Do not broaden scope to unrelated cleanup. Do not add compatibility aliases, fallback behavior, persistent state, or dependencies without a current requirement.

## 2. Design standard

A change must preserve these principles:

- **SOLID with evidence:** introduce an interface or abstraction only for a real external boundary, ownership boundary, or test seam.
- **Single responsibility:** a module owns one stable reason to change.
- **Composition over inheritance:** behavior is assembled from runner, store, policy, and formatter components.
- **One source of truth:** defaults, limits, schemas, and durable state are not duplicated.
- **No silent degradation:** incomplete, truncated, evicted, cancelled, and failed states remain visible.
- **No speculative architecture:** solve the current vertical slice completely, then stop.

Prefer modern erasable TypeScript 7 syntax and Node.js 22 APIs. Do not use enums, namespaces, legacy decorators, CommonJS, or shell-composed commands.

## 3. Search-specific review checklist

Every search behavior change must answer:

- Can any retained match be omitted or duplicated across pages?
- Is total match count still exact when retention is partial?
- Is every bound reflected in text and structured details?
- Does cancellation terminate the owned process and reject observably?
- Are `.gitignore`, hidden-file, glob, case, literal, and regex semantics preserved?
- Can repository mutation invalidate cursor correctness?
- Are snapshot eviction and session cleanup deterministic?
- Does output remain inside both match-count and byte budgets?

A test that only checks an internal helper is insufficient when the public tool behavior changed. Add a real ripgrep integration test where practical.

## 4. Required validation

Run from the repository root:

```bash
bun install --frozen-lockfile
bun run check
bun run pack:check
```

For bug fixes, include a failing regression test before or with the fix. Async and process tests need deterministic completion and an explicit test timeout.

Before committing, inspect:

```bash
git diff --check
git diff --stat
git diff
```

Do not commit `node_modules`, coverage, temporary Node smoke output, package tarballs, logs, or credentials.

## 5. Commit protocol

Use Conventional Commits:

```text
feat: summarize broad searches before returning matches
fix: preserve every retained match across byte-limited pages
test: cover cursor eviction after snapshot expiry
docs: explain partial snapshot semantics
```

Keep commits reviewable and logically coherent. Do not hide functional changes inside formatting commits. Do not rewrite shared branch history without explicit maintainer approval.

## 6. Pull request body

Every PR must use `.github/pull_request_template.md` and include:

- user-visible outcome and motivation;
- public contract or schema changes;
- implementation ownership boundaries;
- exact validation commands and results;
- negative-path evidence;
- material risks and rollback;
- AI provenance.

### AI provenance

State:

- the AI agent or model family used;
- whether a human reviewed the final diff;
- which validation the AI actually executed;
- any unverified claims or remaining uncertainty.

AI assistance is welcome. Concealing unreviewed AI-generated changes is not.

## 7. Review and delivery

A PR is ready only when:

- CI is green;
- review comments are resolved with code or evidence;
- the diff contains no unrelated changes;
- documentation matches actual defaults and limits;
- package contents are verified;
- no known material correctness issue remains.

Opening a PR is not permission to merge, publish, or release. Those actions require explicit maintainer authorization.
