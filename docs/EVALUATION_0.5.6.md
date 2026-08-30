# 0.5.6 real-agent evaluation

This evaluation compares complete repository investigation tasks using the actual Pi CLI and a real model. It does not substitute scripted tool calls for model decisions, expose hidden `details` to the model, or compare a summary with an unfinished baseline investigation.

## Frozen tasks and environment

The [task manifest](evaluation/0.5.6/tasks.json) fixes twelve tasks before measured runs: two broad investigations, one cross-file relationship, and one exact lookup in each of three public repositories. Each arm repeats every task three times, for 36 vanilla and 36 candidate runs.

| Repository  | Frozen revision                            |
| ----------- | ------------------------------------------ |
| Signal Grep | `215b9d35ba5431676671c211b27b5532dd579df2` |
| Pi          | `853a80d26c90a14c1886f0ebb8ffaae133ca2185` |
| ripgrep     | `3fce3b5bb0236da2df6d99672afb8a719642eca7` |

Both arms use `openai-codex/gpt-5.6-luna`, thinking `high`, the same frozen task prompts, and the same public repository files. Vanilla enables Pi's `grep`, `read`, `bash`, `find`, and `ls`. Candidate additionally enables Signal Grep in its default additive mode. The model chooses its tools and may issue parallel calls; candidate runs are not forced to use the plugin.

The measured host uses Pi CLI 0.84.4, Node.js 22.22.2, Bun 1.4.0, ripgrep 15.2.0 with PCRE2 10.45, and Universal Ctags 6.2.1 with JSON support on macOS ARM64. The Pi repository revision in the table is investigation material, not the installed CLI version. The candidate's package dependencies remain those of the reviewed project.

The CLI disables extension discovery, skills, prompt templates, AGENTS/CLAUDE context-file discovery, and session persistence. In Pi 0.84.4, `--no-context-files` does **not** disable discovery of the global `APPEND_SYSTEM.md`; both arms retain the same existing append. This is a comparison in the user's actual prompt environment, not a completely blank system-prompt environment. The append is 298 bytes with SHA-256 `e80eb9255bbb4c7241010265f2b5780b5483e5368721fb8c3b8bd0e9d35bc643`; its contents are private and are not published. A limited topic check identifies language and general engineering/tool guidance, with no explicit Signal Grep mention; this is not a claim that the append has no other effects. No global `SYSTEM.md` is present. Exact reproduction requires the same append or a separately declared new environment.

Candidate loads only an explicit wrapper that registers additive configuration against an empty, isolated Signal Grep configuration directory, using real conflict detection. It does not alter user-global settings. Neither arm loads unrelated installed extensions. The local Pi authentication is used without exporting or recording credentials. Candidate source, package metadata, lockfile, and a complete copy of its installed dependencies are frozen outside the working tree before measured candidate runs.

The frozen per-run limits are 240 seconds, 18 model turns, 48 tool calls, 250,000 cumulative reported usage tokens, and 32 MiB of CLI output. At most three runs execute concurrently. Hitting a limit records a failed run; the run is not silently dropped or retried. A separate, unscored vanilla smoke task confirmed real API access before the task matrix started.

## Measurement and grading

[The runner](../scripts/agent-eval.ts) records actual completed model messages and all tool-result text, including shell and read output. Multiple tool calls issued by one assistant message count as one model-to-tool round. Result bytes count UTF-8 text returned by every tool, not just Signal Grep. Usage records include input, output, cache, reasoning, total tokens, and the provider's reported cost. Wall time includes CLI startup and model execution.

The frozen rubric requires the requested implementation paths, symbols, behavioral points, line citations, a final answer, and successful uncapped execution. It measures necessary evidence coverage, not a semantic proof of every statement. Qualitative mistakes and lexical near-misses must be reported separately without changing the frozen questions or scoring rules after results are visible.

The comparison reports all task outcomes, including failures. Efficiency targets apply to broad-task pairs where both arms pass the frozen rubric, pairing the same task and repetition. The targets are a median reduction of at least 30% in model-to-tool rounds and 40% in cumulative tool-result bytes, with candidate correctness no lower than vanilla. The number of eligible pairs and the actual Signal Grep call rate must accompany these figures. Exact-lookups and relationship tasks are reported separately so a broad-search benefit cannot conceal regression elsewhere.

Sanitized local traces retain tool arguments, tool-result text, and assistant answer text for review. The runner never records thinking blocks, provider signatures, response identifiers, or credentials. Published result records contain usage, tool counts, byte totals, limits, rubric gaps, and qualitative decisions. Complete answers and tool-output traces remain local because they can reproduce substantial third-party source text. Byte accounting happens before sanitization.

## Reproduction

Export or clone the three revisions into `FIXTURE_ROOT/signal-grep`, `FIXTURE_ROOT/pi`, and `FIXTURE_ROOT/ripgrep`. The wrapper supplied for the candidate must import the reviewed candidate revision, call `registerSignalGrepExtension` with additive configuration, and avoid user-global writes.

```bash
bun scripts/agent-eval.ts vanilla FIXTURE_ROOT OUTPUT_ROOT
bun scripts/agent-eval.ts candidate FIXTURE_ROOT OUTPUT_ROOT CANDIDATE_WRAPPER
```

Each result records the SHA-256 of the exact manifest bytes. Measured outcomes and the resulting acceptance decision are added only after the fixed matrix completes.
