import { posix } from "node:path";
import { MAX_IMPORT_FILES, MAX_IMPORT_HOPS } from "./analysis-limits.js";
import { SignalGrepError } from "./errors.js";
import type { SourceReference } from "./source-document.js";
import {
  NavigationContext,
  NavigationFailure,
  moduleRange,
  navigationError,
  nodeLine,
  nodeText,
  type ExportBinding,
  type ImportBinding,
  type ModuleFacts,
} from "./import-model.js";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
/** These are static source candidates, not Node/bundler runtime-resolution claims. */
export const STATIC_MODULE_RESOLUTION =
  "Exact relative path; extensionless source and index candidates (.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs); .js→.ts/.tsx, .jsx→.tsx, .mjs→.mts, .cjs→.cts source candidates. Every existing candidate is considered; multiple candidates are ambiguous. No configuration is executed.";

export interface ImportStep {
  from: SourceReference;
  line: number;
  range: { start: number; end: number };
  kind: "import" | "re-export" | "local-export";
  specifier?: string;
  imported?: string;
  local?: string;
  exported?: string;
  to?: SourceReference;
  resolution?: string;
}
export interface ImportDestination {
  source: SourceReference;
  line: number;
  range: { start: number; end: number };
  name: string;
  kind: string;
}
export interface ImportTrace {
  status: "resolved" | "module" | "unresolved";
  reason?: string;
  chain: ImportStep[];
  destination?: ImportDestination;
  module?: SourceReference;
  candidates?: string[];
}

interface Resolution {
  path?: string;
  reason?: string;
  candidates?: string[];
}
export async function resolveStaticModule(
  context: NavigationContext,
  from: string,
  specifier: string | undefined,
): Promise<Resolution> {
  context.checkAbort();
  // Navigation hosts can return native relative paths; resolution is always POSIX-based.
  from = context.normalizePath(from);
  if (specifier === undefined) return { reason: "nonliteral-module-specifier" };
  if (!specifier.startsWith("./") && !specifier.startsWith("../"))
    return { reason: "external-package-or-path-alias-unsupported" };
  if (specifier.includes("\\") || specifier.includes("\0") || /[?#]/.test(specifier))
    return { reason: "module-specifier-unsupported" };
  const joined = posix.normalize(posix.join(posix.dirname(from), specifier));
  let path: string;
  try {
    path = context.normalizePath(joined);
  } catch (error) {
    if (error instanceof SignalGrepError) return { reason: "outside-workspace" };
    throw error;
  }
  const candidates = new Set([path]);
  const extension = posix.extname(path);
  if (!extension) {
    for (const suffix of EXTENSIONS) {
      candidates.add(context.normalizePath(`${path}${suffix}`));
      candidates.add(context.normalizePath(posix.join(path, `index${suffix}`)));
    }
  } else {
    const mappings: Record<string, string[]> = {
      ".js": [".ts", ".tsx"],
      ".jsx": [".tsx"],
      ".mjs": [".mts"],
      ".cjs": [".cts"],
    };
    for (const suffix of mappings[extension] ?? [])
      candidates.add(context.normalizePath(path.slice(0, -extension.length) + suffix));
  }
  const files = await context.files();
  const existing = [...candidates].filter((candidate) => files.has(candidate)).toSorted();
  if (existing.length === 0)
    return { reason: "missing-or-excluded-module", candidates: [...candidates] };
  if (existing.length > 1) return { reason: "ambiguous-module-candidates", candidates: existing };
  const unique = existing[0];
  if (unique === undefined) throw new Error("Missing unique module candidate");
  return { path: unique };
}

function declaration(facts: ModuleFacts, node: number, name: string): ImportDestination {
  return {
    source: facts.document.reference,
    line: nodeLine(facts, node),
    range: moduleRange(facts, node),
    name,
    kind: facts.locations.get(node)?.kind ?? "unknown",
  };
}

/** One path has its own hop/file budget even when E reuses a larger request context. */
export async function traceImport(
  context: NavigationContext,
  initial: ModuleFacts,
  binding: ImportBinding | ExportBinding,
): Promise<ImportTrace> {
  const chain: ImportStep[] = [];
  const visited = new Set<string>();
  const paths = new Set([initial.document.path]);
  let hops = 0;
  const unresolved = (reason: string, candidates?: string[]): ImportTrace => ({
    status: "unresolved",
    reason,
    chain,
    ...(candidates ? { candidates } : {}),
  });
  const visit = (facts: ModuleFacts, name: string): void => {
    const key = JSON.stringify([facts.document.path, name]);
    if (visited.has(key)) throw new NavigationFailure("circular-re-export");
    visited.add(key);
  };
  const followModule = async (
    facts: ModuleFacts,
    source: string | undefined,
    step: ImportStep,
  ): Promise<ModuleFacts | ImportTrace> => {
    if (hops >= MAX_IMPORT_HOPS) return unresolved("hop-budget-exhausted");
    hops++;
    chain.push(step);
    const resolved = await resolveStaticModule(context, facts.document.path, source);
    if (!resolved.path)
      return unresolved(resolved.reason ?? "module-unresolved", resolved.candidates);
    paths.add(resolved.path);
    if (paths.size > MAX_IMPORT_FILES) return unresolved("file-budget-exhausted");
    const next = await context.module(resolved.path);
    step.to = next.document.reference;
    step.resolution = "static-source-candidates";
    return next;
  };
  const followImport = async (facts: ModuleFacts, current: ImportBinding): Promise<ImportTrace> => {
    const next = await followModule(facts, current.source, {
      from: facts.document.reference,
      line: nodeLine(facts, current.statement),
      range: moduleRange(facts, current.statement),
      kind: "import",
      ...(current.source !== undefined ? { specifier: current.source } : {}),
      imported: current.imported,
      ...(current.local !== undefined ? { local: current.local } : {}),
    });
    if (!("document" in next)) return next;
    if (current.kind === "namespace" || current.kind === "side-effect")
      return { status: "module", chain, module: next.document.reference };
    return followExportName(next, current.imported);
  };
  const followLocal = async (facts: ModuleFacts, name: string): Promise<ImportTrace> => {
    const imported = facts.imports.filter((current) => current.local === name);
    const declared = facts.declarations.get(name) ?? [];
    if (imported.length + declared.length > 1) return unresolved("ambiguous-local-binding");
    if (imported[0]) return followImport(facts, imported[0]);
    if (declared[0] !== undefined)
      return { status: "resolved", chain, destination: declaration(facts, declared[0], name) };
    return unresolved("local-binding-unresolved");
  };
  const followExport = async (facts: ModuleFacts, current: ExportBinding): Promise<ImportTrace> => {
    if (current.kind === "star") return unresolved("export-star-unsupported");
    if (current.definition !== undefined)
      return {
        status: "resolved",
        chain,
        destination: declaration(facts, current.definition, current.exported),
      };
    const step: ImportStep = {
      from: facts.document.reference,
      line: nodeLine(facts, current.statement),
      range: moduleRange(facts, current.statement),
      kind: current.source !== undefined ? "re-export" : "local-export",
      exported: current.exported,
      ...(current.local !== undefined ? { local: current.local, imported: current.local } : {}),
      ...(current.source !== undefined ? { specifier: current.source } : {}),
    };
    if (current.source !== undefined) {
      const next = await followModule(facts, current.source, step);
      if (!("document" in next)) return next;
      if (current.kind === "namespace")
        return { status: "module", chain, module: next.document.reference };
      if (current.local === undefined) return unresolved("export-binding-unresolved");
      return followExportName(next, current.local);
    }
    chain.push(step);
    if (current.local === undefined) return unresolved("export-binding-unresolved");
    return followLocal(facts, current.local);
  };
  const followExportName = async (facts: ModuleFacts, name: string): Promise<ImportTrace> => {
    visit(facts, name);
    const exported = facts.exports.filter(
      (current) => current.exported === name && current.kind !== "star",
    );
    if (exported.length > 1) return unresolved("ambiguous-export-binding");
    if (!exported[0])
      return unresolved(
        facts.exports.some((current) => current.kind === "star")
          ? "export-star-unsupported"
          : "export-not-found",
      );
    return followExport(facts, exported[0]);
  };
  try {
    if ("imported" in binding) return await followImport(initial, binding);
    visit(initial, binding.exported);
    return await followExport(initial, binding);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason) throw error;
    return unresolved(reason);
  }
}

export function tracePaths(trace: ImportTrace): string[] {
  const paths = trace.chain.flatMap((step) => [step.from.path, ...(step.to ? [step.to.path] : [])]);
  if (trace.destination) paths.push(trace.destination.source.path);
  if (trace.module) paths.push(trace.module.path);
  return [...new Set(paths)];
}

export function importStatementExcerpt(facts: ModuleFacts, statement: number): string {
  const text = nodeText(facts, statement) ?? "";
  return text.length > 500 ? `${text.slice(0, 500)}… [statement excerpt truncated]` : text;
}
