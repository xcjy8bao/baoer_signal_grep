# Contributing

Thank you for improving Signal Grep.

## Workflow

1. Search existing issues and pull requests.
2. Open an issue before large behavioral or public-schema changes.
3. Fork the repository or create a focused branch from `main`.
4. Follow `docs/AI_PULL_REQUEST_GUIDE.md` and `docs/QUALITY_GATES.md`.
5. Add tests and documentation with the implementation.
6. Run `bun run check` and `bun run pack:check`.
7. Open a pull request using the repository template.

Direct pushes to `main` are not accepted. Use Conventional Commits and keep each PR focused on one observable outcome.

## Development environment

```bash
bun install
rg --version
bun run check
```

Runtime code must remain compatible with Node.js 22+ and Bun 1.4+. Development uses TypeScript 7+ and Bun's native test runner.

## Reporting bugs

Use the bug report template and include:

- Pi, Bun or Node.js, and ripgrep versions;
- operating system;
- exact tool input;
- actual text and structured details;
- whether the result reported `complete` or `partial`;
- a minimal repository fixture when possible.

Do not include private source code, credentials, or sensitive paths in public issues.

## Security issues

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).

## Community

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
