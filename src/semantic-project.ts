import { resolve } from "node:path";
import type { AnalysisResultSet } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import { SourceAccess, SourceBudgetError } from "./source-access.js";
import { SourceDocumentError, type SourceDocument } from "./source-document.js";
import { listWorkspaceFiles } from "./workspace-files.js";
import { syntaxLanguage } from "./syntax.js";

/** Only admitted, verified worktree source can become executable navigation evidence. */
export async function semanticProject(access: SourceAccess, targetPath: string) {
  const files = await listWorkspaceFiles(access.cwd, access.signal);
  const paths = files.paths.filter((path) => {
    const language = syntaxLanguage(path);
    return language && language !== "go";
  });
  const target = resolve(access.cwd, targetPath);
  if (!paths.some((path) => resolve(access.cwd, path) === target))
    throw new SignalGrepError(
      "Semantic target must be an admitted JS/TS workspace file under current ignore rules",
    );
  paths.sort(
    (a, b) =>
      Number(resolve(access.cwd, b) === target) - Number(resolve(access.cwd, a) === target) ||
      a.localeCompare(b),
  );
  const documents = new Map<string, SourceDocument>();
  const reasons = [...files.reasons];
  const metadata: SourceDocument[] = [];
  for (const path of [
    ...paths,
    ...files.paths.filter((candidate) =>
      /(?:^|\/)(?:[tj]sconfig[^/]*\.json|package\.json)$/.test(candidate),
    ),
  ]) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one shared source budget, deterministic target-first admission.
      const document = await access.load(path);
      if (!document.utf8)
        throw new SourceDocumentError("encoding", `Non-UTF-8 semantic source: ${path}`);
      if (paths.includes(path)) documents.set(resolve(access.cwd, path), document);
      else metadata.push(document);
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        reasons.push(error.message);
        break;
      }
      if (!(error instanceof SourceDocumentError)) throw error;
      reasons.push(`${path}: ${error.message}`);
    }
  }
  const primary = documents.get(target);
  if (!primary)
    throw new SignalGrepError("Semantic target could not be read within the source budget");
  const recheck = async () => {
    for (const document of [...documents.values(), ...metadata]) {
      if (document.reference.origin.kind !== "worktree")
        throw new Error("Expected worktree semantic source");
      // oxlint-disable-next-line no-await-in-loop -- reread each captured version without doubling retained source memory.
      await access.refresh(document.path, document.reference);
    }
    const after = await listWorkspaceFiles(access.cwd, access.signal);
    if (JSON.stringify(after) !== JSON.stringify(files))
      throw new SignalGrepError("Workspace file set changed during semantic query; retry");
  };
  const result: AnalysisResultSet = {
    kind: "references",
    unit: "relationships",
    items: [],
    partial: reasons.length > 0,
    reasons,
    filesRead: access.filesRead,
    bytesRead: access.bytesRead,
    coverage: {
      admittedSources: reasons.length ? "partial" : "complete",
      runtimeDispatch: "not-applicable",
    },
    stats: { filesEnumerated: paths.length, filesSkipped: paths.length - documents.size },
  };
  return { documents, primary, result, recheck };
}
