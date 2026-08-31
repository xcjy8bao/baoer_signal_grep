import { MAX_IMPORT_FILES } from "./analysis-limits.js";
import { SignalGrepError } from "./errors.js";
import {
  NavigationContext,
  moduleRange,
  navigationError,
  nodeLine,
  type NavigationHost,
  type NavigationInput,
  type NavigationItem,
  type NavigationResult,
} from "./import-model.js";
import {
  STATIC_MODULE_RESOLUTION,
  importStatementExcerpt,
  traceImport,
  tracePaths,
} from "./import-resolution.js";

export type {
  NavigationHost,
  NavigationInput,
  NavigationItem,
  NavigationResult,
} from "./import-model.js";

/** Return only static import/re-export evidence; this is not a call graph. */
export async function navigateImports(
  host: NavigationHost,
  input: NavigationInput,
): Promise<NavigationResult> {
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SignalGrepError("Navigation line must be a positive integer");
  if (input.symbol !== undefined && input.symbol.trim().length === 0)
    throw new SignalGrepError("Navigation symbol must be nonempty");
  const context = new NavigationContext(host, MAX_IMPORT_FILES);
  let facts;
  try {
    facts = await context.module(input.path);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason) throw error;
    context.reasons.add(reason);
    return context.result([]);
  }
  const entries = [...facts.imports, ...facts.exports].filter((binding) => {
    if (input.line !== undefined) {
      const range = moduleRange(facts, binding.statement);
      if (
        input.line < facts.document.lineAt(range.start) ||
        input.line > facts.document.lineAt(Math.max(range.start, range.end - 1))
      )
        return false;
    }
    return (
      input.symbol === undefined ||
      binding.local === input.symbol ||
      ("imported" in binding
        ? binding.imported === input.symbol
        : binding.exported === input.symbol)
    );
  });
  const items: NavigationItem[] = [];
  const affected: string[][] = [];
  for (const binding of entries) {
    context.checkAbort();
    // oxlint-disable-next-line no-await-in-loop -- every path consumes the same bounded source context.
    const trace = await traceImport(context, facts, binding);
    const name = "imported" in binding ? (binding.local ?? binding.imported) : binding.exported;
    items.push({
      path: facts.document.path,
      line: nodeLine(facts, binding.statement),
      source: facts.document.reference,
      range: moduleRange(facts, binding.statement),
      excerpt: importStatementExcerpt(facts, binding.statement),
      label: `Static import/re-export path: ${name} (${trace.status}${trace.reason ? `: ${trace.reason}` : ""})`,
      details: { kind: "import", ...trace, resolutionPolicy: STATIC_MODULE_RESOLUTION },
    });
    affected.push([facts.document.path, ...tracePaths(trace)]);
    if (trace.status === "unresolved") context.reasons.add(trace.reason ?? "import-unresolved");
  }
  if (entries.length === 0) context.reasons.add("no-static-import-export-at-target");
  const invalid = await context.verify();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const reason = affected[index]
      ?.map((path) => invalid.get(path))
      .find((value) => value !== undefined);
    if (!item || reason === undefined) continue;
    item.label = `Static import/re-export path invalidated: ${reason}`;
    item.details = {
      ...item.details,
      status: "unresolved",
      reason,
      destination: undefined,
      module: undefined,
    };
  }
  return context.result(items);
}
