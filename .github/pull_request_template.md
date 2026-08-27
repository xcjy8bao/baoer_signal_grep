## Summary

<!-- What observable outcome does this PR deliver? -->

## Motivation

<!-- Why is this change needed now? Link the issue when applicable. -->

## Public contract

<!-- Describe tool schema, defaults, output, error, cursor, or compatibility changes. Write "No public contract change" when applicable. -->

## Design and ownership

<!-- Which component owns the behavior, and why does that preserve single responsibility and one source of truth? -->

## Validation

- [ ] `bun install --frozen-lockfile`
- [ ] `bun run check`
- [ ] `bun run pack:check`
- [ ] Real ripgrep integration behavior was tested when search semantics changed

Paste concise command results or link CI evidence:

```text

```

## Negative paths and invariants

- [ ] No retained match can be silently omitted or duplicated
- [ ] Partial, truncated, expired, cancelled, and failed states remain observable
- [ ] Process and snapshot lifecycle cleanup is covered
- [ ] `.git`, hidden-file, ignore, regex/literal, case, and glob behavior remains intentional
- [ ] Not applicable; explain why below

## Risk and rollback

<!-- Material risks, migration impact, and how to revert safely. -->

## Documentation

- [ ] English README or docs updated
- [ ] Simplified Chinese README updated when user-facing behavior changed
- [ ] Changelog updated
- [ ] No documentation change required

## AI provenance

- **AI agent/model family:**
- **Human final-diff review:** Yes / No
- **Validation executed by AI:**
- **Unverified claims or remaining uncertainty:**

## Final review

- [ ] The branch is focused and contains no unrelated changes
- [ ] The final diff was reviewed
- [ ] No generated artifacts, credentials, private source, or logs are committed
- [ ] This PR does not publish, release, or merge itself
