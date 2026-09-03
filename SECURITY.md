# Security Policy

## Supported versions

Until the first stable release, security fixes target the latest commit on `main`. After releases begin, this table will identify supported release lines.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue with exploit details, sensitive paths, repository contents, or credentials.

Include:

- affected commit or version;
- impact and realistic attack boundary;
- reproduction steps using non-sensitive fixtures;
- expected safe behavior;
- suggested mitigation, if known.

You should receive an acknowledgement within seven days. Remediation timing depends on severity and reproducibility.

## Security model

Signal Grep runs with the same local permissions as Pi. It starts `rg` and optional Universal Ctags directly without a shell, reads source files only for requested context or inspection, stores bounded snapshots in process memory, makes no network requests, and persists no search data. Universal Ctags is optional and is never downloaded automatically.

An omitted path searches the working directory. A zero-result subpath search retries from that project root before reporting project-wide absence. Files inside the project, including hidden files and credential-like paths, are searchable by default. `redact=true` optionally masks common credential values and private-key bodies at the display boundary; it does not alter file admission, matching, counts, or stored pagination evidence.

An explicit absolute path or `..` traversal can select a search or inspection target outside the project for that request; this records tool-request intent, not a separate human permission or sandbox grant. `.git` internals, portable external credential directories such as `.ssh` and `.gnupg`, platform credential/browser stores, and special system trees such as `/dev`, `/proc`, and `/sys` are rejected outside the working directory; canonical-path checks prevent symbolic-link bypass. Descendant protected roots are also excluded from broad external searches. Ordinary Git change comparison remains working-directory-scoped.

These protected-path rules are defense in depth and cannot identify every renamed, copied, or custom-location secret. Do not use external-path access to seek credentials or unrelated private data. The extension does not sandbox Pi, ripgrep, or Universal Ctags, and its restrictions do not constrain other Pi tools. Users remain responsible for the paths, repositories, and executables available to their Pi process.
