import { resolve } from "node:path";

export interface RipgrepUnreadableDiagnostic {
  message: string;
  path?: string;
}

export interface RipgrepDiagnostics {
  unreadable: RipgrepUnreadableDiagnostic[];
  other: string[];
}

const UNREADABLE_SUFFIX = /:\s+Permission denied(?:\s+\(os error 13\))?\s*$/iu;
const UNREADABLE_CODE = /\(os error 13\)\s*$/iu;

function diagnosticLines(stderr: string): string[] {
  return stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function unreadablePath(line: string, suffix: RegExp): string | undefined {
  const match = suffix.exec(line);
  if (!match || match.index === undefined) return undefined;
  const prefix = line.slice(0, match.index).trim();
  const separator = prefix.indexOf(": ");
  const path = (separator < 0 ? prefix : prefix.slice(separator + 2)).trim();
  return path.replace(/^['"]|['"]$/gu, "") || undefined;
}

export function classifyRipgrepDiagnostics(stderr: string): RipgrepDiagnostics {
  const unreadable: RipgrepUnreadableDiagnostic[] = [];
  const other: string[] = [];
  for (const line of diagnosticLines(stderr)) {
    const path = unreadablePath(line, UNREADABLE_SUFFIX);
    if (path !== undefined || UNREADABLE_CODE.test(line)) {
      unreadable.push({ message: line, ...(path ? { path } : {}) });
    } else {
      other.push(line);
    }
  }
  return { unreadable, other };
}

export function hasRequestedRootUnreadable(
  diagnostics: readonly RipgrepUnreadableDiagnostic[],
  cwd: string,
  searchPath: string,
): boolean {
  const expected = resolve(cwd, searchPath);
  return diagnostics.some(
    (diagnostic) => diagnostic.path === undefined || resolve(cwd, diagnostic.path) === expected,
  );
}

export function describeUnreadableDiagnostics(
  diagnostics: readonly RipgrepUnreadableDiagnostic[],
): string {
  const messages = [...new Set(diagnostics.map((diagnostic) => diagnostic.message))];
  return `Ripgrep skipped ${String(messages.length)} unreadable path(s); search coverage is partial: ${messages.join("; ")}`;
}
