import { rangeEvidence } from "./analysis-evidence.js";
import type { AnalysisResultSet } from "./analysis-types.js";
import { MAX_ANALYSIS_RESULTS, MAX_ANALYSIS_STORAGE_BYTES } from "./analysis-limits.js";
import { SignalGrepError } from "./errors.js";
import type { SignalGrepInput } from "./service.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import { SourceDocumentError } from "./source-document.js";
import { syntaxLanguage } from "./syntax.js";
import { normalizeRequest } from "./request.js";
import { listWorkspaceFiles } from "./workspace-files.js";

export async function structuralSearch(
  input: SignalGrepInput,
  access: SourceAccess,
): Promise<AnalysisResultSet> {
  if (
    !input.pattern?.trim() ||
    Buffer.byteLength(input.pattern) > 4_096 ||
    !input.pattern.isWellFormed()
  )
    throw new SignalGrepError(
      "Structural pattern must be nonempty, well-formed and at most 4 KiB; ast-grep $NAME/$$$ARGS metavariables are supported",
    );
  const request = normalizeRequest({ ...input, pattern: "" });
  const files = await listWorkspaceFiles(access.cwd, access.signal, {
    ...(request.path ? { path: request.path } : {}),
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
  });
  const result: AnalysisResultSet = {
    kind: "structure",
    unit: "occurrences",
    items: [],
    partial: files.partial,
    reasons: [...files.reasons],
    redact: input.redact ?? false,
  };
  let retainedBytes = 0;
  const supported = files.paths.filter((path) => syntaxLanguage(path));
  if (files.paths.length && !supported.length)
    throw new SignalGrepError(
      "Structural patterns require admitted JS/TS/TSX/Go source; no supported source files were found",
    );
  result.stats = {
    filesEnumerated: files.paths.length,
    filesSkipped: files.paths.length - supported.length,
  };
  for (const path of files.paths) {
    if (!syntaxLanguage(path)) continue;
    try {
      // oxlint-disable-next-line no-await-in-loop -- sequential parser admission shares the source and output budgets.
      const document = await access.load(path);
      // oxlint-disable-next-line no-await-in-loop -- parser execution is owned by the serialized syntax queue.
      const syntax = await access.pattern(document, input.pattern);
      if (syntax.status !== "ok") {
        result.partial = true;
        result.reasons.push(`${path}: syntax ${syntax.status}; structural matches withheld`);
        continue;
      }
      for (const match of syntax.patternMatches ?? []) {
        const range = {
          start: document.toByteOffset(match.start),
          end: document.toByteOffset(match.end),
        };
        const evidence = rangeEvidence(document, range);
        const item = {
          path: document.path,
          line: document.lineAt(range.start),
          source: document.reference,
          range,
          label: "AST pattern match",
          excerpt: evidence.excerpt,
          details: {
            kind: "structural-match",
            certainty: "syntax",
            score: 90,
            rankingReason: "AST structure and repeated metavariable equality",
            excerptRange: evidence.excerptRange,
            excerptTruncated: evidence.excerptTruncated,
          },
        };
        const bytes = Buffer.byteLength(JSON.stringify(item));
        if (
          result.items.length >= MAX_ANALYSIS_RESULTS ||
          retainedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES - 65_536
        ) {
          result.partial = true;
          result.reasons.push("Structural evidence storage limit reached: 50,000 items / 32 MiB");
          break;
        }
        result.items.push(item);
        retainedBytes += bytes;
      }
      if (
        result.items.length >= MAX_ANALYSIS_RESULTS ||
        result.reasons.at(-1)?.startsWith("Structural evidence storage")
      )
        break;
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        result.partial = true;
        result.reasons.push(error.message);
        break;
      }
      if (!(error instanceof SourceDocumentError)) throw error;
      result.partial = true;
      result.reasons.push(`${path}: ${error.message}`);
    }
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.coverage = { astPatterns: result.partial ? "partial" : "complete" };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
  };
  return result;
}
