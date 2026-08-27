# AI Contributor Instructions

This repository is developed through pull requests, including AI-authored changes. Read this file, `docs/AI_PULL_REQUEST_GUIDE.md`, and `docs/QUALITY_GATES.md` before editing.

## Engineering principles

- Apply SOLID where it reduces coupling at a real boundary.
- Keep each module and function focused on one responsibility.
- Prefer composition over inheritance.
- Use the simplest design pattern that makes current ownership and invariants explicit.
- Do not create large catch-all files. Split by stable responsibility, not arbitrary line count.
- Maintain one source of truth. Do not dual-write state or add compatibility layers without a documented public obligation.
- Do not over-engineer hypothetical features.
- Use Bun 1.4+ as the primary package manager and test runner, TypeScript 7+, and Node.js 22+ compatible runtime APIs.
- Oxfmt is the only formatting authority. Oxlint is the only lint authority; keep type-aware lint enabled and deny warnings.
- Use modern, erasable TypeScript. Do not introduce enums, namespaces, legacy decorators, CommonJS, or avoidable type assertions.
- Do not suppress a lint rule without a precise local reason. Unused suppression directives fail CI.

## Search correctness invariants

- A completed snapshot never omits or duplicates retained matches across cursor pages.
- Any storage, line, byte, file-summary, or output limit is explicit in tool text and structured details.
- A partial snapshot must never be presented as complete.
- Search subprocess cancellation and session shutdown release owned resources.
- `.git` internals are excluded while meaningful hidden files remain searchable by default.
- Runtime failures fail clearly; never replace them with an empty successful search.

## Required workflow

1. Start from updated `main` and create a focused branch using `feat/`, `fix/`, `docs/`, `test/`, `refactor/`, or `chore/`.
2. State the observable contract and identify the smallest complete vertical slice.
3. Add or update tests for behavior and negative paths.
4. Run `bun run check` and `bun run pack:check`.
5. Review the final diff for unrelated changes, silent fallback, duplicated truth, and generated artifacts.
6. Commit with Conventional Commits and open a pull request using the repository template.
7. Never push directly to `main`, force-push shared branches, merge, publish, or release unless explicitly authorized.

The empty repository bootstrap commit is the only direct-to-`main` exception.
