# Security Policy

## Reporting vulnerabilities

Use this repository's GitHub private vulnerability reporting. Include the affected version, impact and reproduction steps with non-sensitive examples. Do not publish credentials, private source or exploit details in an issue.

Security fixes target the latest released version. An acknowledgement is normally provided within seven days; remediation depends on severity and reproducibility.

## Access and privacy

The tool runs with the permissions of its host process. It is read-only, but it is not a filesystem sandbox. Explicit absolute paths and `..` can access other readable locations. `.git` internals and known external credential and special-system paths are blocked; these checks cannot identify every renamed, copied or custom-location secret. Hidden files inside the project remain searchable.

`redact: true` optionally masks common credential values in returned output. It does not change which files are searched and cannot guarantee removal of every sensitive value. Only connect the tool to repositories and paths that the agent is authorized to read.

Local searches have no telemetry and do not upload source or queries. Package installation can access npm. Explicit installation of the optional concept model downloads public assets; concept searches then run offline. Remote HTTP connections transmit requests and results to the configured server.

## HTTP deployments

The HTTP server has no built-in authentication. Keep the default loopback binding or place it behind an authenticated gateway. Browser clients require an explicitly allowed origin; CORS is not authentication. Restrict the server account's filesystem permissions to the data intended for its clients.

## Search enforcement

Version 1.2.0 enables conventional search enforcement by default in Pi. Claude Code, Codex and Kimi Code require the native plugin; MCP alone cannot disable other tools. Codex also requires the user to trust its hook.

Enforcement depends on an enabled, trusted, runnable host hook. Disabled hooks, process failures and host error handling can prevent interception. Custom programs can still search. The policy preserves ordinary reads, edits, directory browsing, tests, builds and scripts, and does not change the model, memory or existing host permissions. See the [README](README.md) for disabling it.
