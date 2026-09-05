# Contributing

Bug reports and focused pull requests are welcome. Check existing issues first and describe the observable problem and intended behavior.

For a source checkout, use Bun 1.4+, Node.js 22.19+ and `rg`:

```bash
bun install --frozen-lockfile
bun run check
bun run pack:check
```

`check` validates formatting, lint, types and builds the shipped artifacts. Public CI also checks that rebuilding leaves those artifacts unchanged. This does not claim that the private regression suite ran; report any additional validation you actually performed.

Keep changes focused, preserve existing behavior outside the intended change, and include concise reproduction steps or validation evidence in the pull request. Use Conventional Commits and update user documentation when usage changes.

For bug reports, include the package and host versions, operating system, exact tool request, expected behavior, actual result and a minimal non-sensitive example. Do not post private source, credentials or sensitive paths.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Participation follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
