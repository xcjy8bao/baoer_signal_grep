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

Signal Grep runs with the same local permissions as Pi. It starts `rg` and optional Universal Ctags directly without a shell, reads source files only for requested context or inspection, stores bounded snapshots in process memory, confines search and inspection paths to the working directory, makes no network requests, and persists no search data. Universal Ctags is optional and is never downloaded automatically.

The extension does not sandbox Pi, ripgrep, or Universal Ctags. Users remain responsible for the repositories and executables available to their Pi process.
