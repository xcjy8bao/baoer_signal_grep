import { posix } from "node:path";
import { MAX_ANALYSIS_RESULTS, MAX_ANALYSIS_STORAGE_BYTES } from "./analysis-limits.js";
import { SignalGrepError } from "./errors.js";
import {
  NavigationContext,
  moduleRange,
  navigationError,
  nodeLine,
  nodeText,
  type ImportBinding,
  type ModuleFacts,
  type NavigationHost,
  type NavigationInput,
  type NavigationItem,
  type NavigationResult,
} from "./import-model.js";
import {
  importStatementExcerpt,
  resolveStaticModule,
  traceImport,
  tracePaths,
  type ImportTrace,
} from "./import-resolution.js";
import { TestBindings, collectTestCases, type TestCaseFact } from "./test-navigation-facts.js";
import type { SyntaxSymbol } from "./syntax-types.js";
import { syntaxField } from "./syntax-tree.js";

type Association = "direct" | "indirect" | "weak";
interface Relation {
  association: Association;
  binding?: ImportBinding;
  trace?: ImportTrace;
  reason: string;
  targetBinding: boolean;
  paths: string[];
}
interface UseEvidence {
  path: string;
  line: number;
  range: { start: number; end: number };
  binding: string;
  excerpt: string;
  excerptTruncated: boolean;
}
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const TEST_FILENAME =
  /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/i;
export const TEST_DISCOVERY_PATTERN = String.raw`\b(?:describe|it|test)\s*\(|\b(?:from\s*|require\s*\(\s*)["'](?:node:test|bun:test|vitest|@jest/globals)["']`;

export function isLikelyTestPath(path: string): boolean {
  return TEST_FILENAME.test(path);
}

export interface TestNavigationOptions {
  entryPaths?: readonly string[];
}

function basenameStem(path: string): string {
  return posix
    .basename(path)
    .replace(SOURCE_EXTENSION, "")
    .replace(/\.(?:test|spec)$/i, "");
}
interface TestTargetSymbol extends SyntaxSymbol {
  directBinding?: { start: number; end: number };
}

function targetSymbol(facts: ModuleFacts, input: NavigationInput): TestTargetSymbol | undefined {
  if (input.line === undefined && input.symbol === undefined) return undefined;
  const symbols = facts.syntax.symbols
    .filter((symbol) => {
      if (!symbol.hasBody) return false;
      if (input.symbol !== undefined && symbol.name !== input.symbol) return false;
      const start = facts.document.lineAt(facts.document.toByteOffset(symbol.start));
      const end = facts.document.lineAt(
        Math.max(
          facts.document.toByteOffset(symbol.start),
          facts.document.toByteOffset(symbol.end) - 1,
        ),
      );
      return input.line === undefined || (start <= input.line && input.line <= end);
    })
    .toSorted((a, b) => a.end - a.start - (b.end - b.start));
  if (symbols.length === 0)
    throw new SignalGrepError(
      "Test navigation target does not identify an implemented function/method",
    );
  if (input.line === undefined && symbols.length > 1)
    throw new SignalGrepError("Test navigation symbol is ambiguous; include its source line");
  const symbol = symbols[0];
  if (!symbol) throw new Error("Missing selected test target symbol");
  let carrier = symbol.node;
  let parent = facts.syntax.nodes[carrier]?.parent;
  while (
    parent !== null &&
    parent !== undefined &&
    [
      "parenthesized_expression",
      "as_expression",
      "satisfies_expression",
      "type_assertion",
      "non_null_expression",
    ].includes(facts.syntax.nodes[parent]?.kind ?? "")
  ) {
    carrier = parent;
    parent = facts.syntax.nodes[carrier]?.parent;
  }
  const directBinding =
    parent !== null &&
    parent !== undefined &&
    facts.syntax.nodes[parent]?.kind === "variable_declarator" &&
    syntaxField(facts.syntax, parent, "value") === carrier
      ? moduleRange(facts, parent)
      : undefined;
  return { ...symbol, ...(directBinding ? { directBinding } : {}) };
}

function traceTargetsSymbol(
  context: NavigationContext,
  trace: ImportTrace,
  target: ModuleFacts,
  symbol: TestTargetSymbol | undefined,
): boolean {
  if (!symbol) return trace.status === "resolved" || trace.status === "module";
  const destination = trace.destination;
  if (
    trace.status !== "resolved" ||
    !destination ||
    context.normalizePath(destination.source.path) !== context.normalizePath(target.document.path)
  )
    return false;
  const start = target.document.toByteOffset(symbol.start);
  const end = target.document.toByteOffset(symbol.end);
  return (
    (destination.range.start === start && destination.range.end === end) ||
    (destination.kind === "variable_declarator" &&
      symbol.directBinding !== undefined &&
      destination.range.start === symbol.directBinding.start &&
      destination.range.end === symbol.directBinding.end)
  );
}

async function relations(
  context: NavigationContext,
  test: ModuleFacts,
  target: ModuleFacts,
  symbol: TestTargetSymbol | undefined,
): Promise<Relation[]> {
  const output: Relation[] = [];
  for (const binding of test.imports) {
    if (!binding.source?.startsWith(".")) continue;
    // oxlint-disable-next-line no-await-in-loop -- resolution and tracing share one source/read budget.
    const resolved = await resolveStaticModule(context, test.document.path, binding.source);
    const targetPath = context.normalizePath(target.document.path);
    const direct = resolved.path === targetPath;
    // oxlint-disable-next-line no-await-in-loop -- dependencies are parsed serially within the bounded request.
    const trace = await traceImport(context, test, binding);
    if (trace.reason === "structural-read-budget-exhausted") {
      context.reasons.add(trace.reason);
      break;
    }
    const paths = tracePaths(trace).map((path) => context.normalizePath(path));
    const indirect = !direct && paths.includes(targetPath) && trace.status !== "unresolved";
    if (!direct && !indirect) {
      if (
        trace.reason &&
        [
          "hop-budget-exhausted",
          "file-budget-exhausted",
          "byte-budget-exhausted",
          "source-changed",
          "syntax-timeout",
          "syntax-limit",
        ].includes(trace.reason)
      )
        context.reasons.add(`${test.document.path}: ${trace.reason}`);
      continue;
    }
    output.push({
      association: direct ? "direct" : "indirect",
      binding,
      trace,
      reason: direct ? "static-import-target-module" : "static-import-re-export-path-to-target",
      targetBinding: !binding.typeOnly && traceTargetsSymbol(context, trace, target, symbol),
      paths: [...new Set([context.normalizePath(test.document.path), targetPath, ...paths])],
    });
  }
  if (output.length) return output;
  const stem = basenameStem(target.document.path);
  const nameSimilar = basenameStem(test.document.path) === stem;
  const textSimilar = symbol
    ? test.document.text.includes(symbol.name)
    : stem.length > 0 && test.document.text.includes(stem);
  if (nameSimilar || textSimilar)
    output.push({
      association: "weak",
      reason: nameSimilar ? "filename-similarity-only" : "source-text-similarity-only",
      targetBinding: false,
      paths: [
        context.normalizePath(test.document.path),
        context.normalizePath(target.document.path),
      ],
    });
  return output;
}

function usesInCases(
  facts: ModuleFacts,
  bindings: TestBindings,
  cases: TestCaseFact[],
  related: Relation[],
): Map<number, UseEvidence[]> {
  const names = new Set(
    related
      .filter((relation) => relation.targetBinding && relation.binding?.local)
      .map((relation) => relation.binding?.local),
  );
  const uses = new Map<number, UseEvidence[]>();
  const callbacks = new Map(
    cases.flatMap((test) => (test.callback === undefined ? [] : [[test.callback, test] as const])),
  );
  const owners: (TestCaseFact | undefined)[] = [];
  for (let id = 0; id < facts.syntax.nodes.length; id++) {
    const node = facts.syntax.nodes[id];
    if (!node) continue;
    const test = callbacks.get(id) ?? (node.parent === null ? undefined : owners[node.parent]);
    owners[id] = test;
    const callback = test?.callback === undefined ? undefined : facts.syntax.nodes[test.callback];
    if (!test || !callback) continue;
    const name = nodeText(facts, id);
    if (!name || !names.has(name) || !bindings.isReference(id) || bindings.shadowed(name, id))
      continue;
    let excerptNode = id;
    let parent = node.parent;
    while (parent !== null) {
      const value = facts.syntax.nodes[parent];
      if (!value || value.start < callback.start || value.end > callback.end) break;
      excerptNode = parent;
      if (
        value.kind === "expression_statement" ||
        value.kind === "return_statement" ||
        value.kind === "variable_declarator"
      )
        break;
      parent = value.parent;
    }
    const text = nodeText(facts, excerptNode) ?? name;
    const evidence = uses.get(test.node) ?? [];
    evidence.push({
      path: facts.document.path,
      line: nodeLine(facts, id),
      range: moduleRange(facts, id),
      binding: name,
      excerpt: text.length > 500 ? `${text.slice(0, 500)}…` : text,
      excerptTruncated: text.length > 500,
    });
    uses.set(test.node, evidence);
  }
  return uses;
}

function relationDetails(facts: ModuleFacts, relation: Relation): Record<string, unknown> {
  return {
    association: relation.association,
    reason: relation.reason,
    ...(relation.binding
      ? {
          imported: relation.binding.imported,
          local: relation.binding.local,
          typeOnly: relation.binding.typeOnly,
          importLine: nodeLine(facts, relation.binding.statement),
          importRange: moduleRange(facts, relation.binding.statement),
          importExcerpt: importStatementExcerpt(facts, relation.binding.statement),
        }
      : {}),
    ...(relation.trace
      ? {
          chain: relation.trace.chain,
          importStatus: relation.trace.status,
          importReason: relation.trace.reason,
        }
      : {}),
    targetBindingProven: relation.targetBinding,
  };
}

/** Candidates and static uses only: no tests run, no coverage or passing assertion claims. */
export async function findRelatedTests(
  host: NavigationHost,
  input: NavigationInput,
  options: TestNavigationOptions = {},
): Promise<NavigationResult> {
  const started = performance.now();
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SignalGrepError("Test target line must be a positive integer");
  if (input.symbol !== undefined && input.symbol.trim().length === 0)
    throw new SignalGrepError("Test target symbol must be nonempty");
  const context = new NavigationContext(host);
  let target;
  try {
    target = await context.module(input.path, true);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason) throw error;
    context.reasons.add(reason);
    return context.result([]);
  }
  let symbol: TestTargetSymbol | undefined;
  try {
    symbol = targetSymbol(target, input);
  } finally {
    context.release(target);
  }
  const allFiles = [...(await context.files())];
  const selectedEntries = options.entryPaths
    ? new Set(options.entryPaths.map((path) => context.normalizePath(path)))
    : undefined;
  const targetPath = context.normalizePath(target.document.path);
  const eligibleEntries = allFiles.filter(
    (path) => path !== targetPath && SOURCE_EXTENSION.test(path),
  );
  const files = allFiles
    .filter(
      (path) =>
        path !== targetPath &&
        SOURCE_EXTENSION.test(path) &&
        (!selectedEntries || selectedEntries.has(path)),
    )
    .toSorted(
      (a, b) => Number(TEST_FILENAME.test(b)) - Number(TEST_FILENAME.test(a)) || a.localeCompare(b),
    );
  const items: NavigationItem[] = [];
  const affected: string[][] = [];
  let serializedBytes = 0;
  const append = (item: NavigationItem, dependencies: string[]): boolean => {
    const bytes = Buffer.byteLength(JSON.stringify(item));
    if (
      serializedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES ||
      items.length >= MAX_ANALYSIS_RESULTS
    ) {
      context.reasons.add(
        serializedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES
          ? "serialized-result-budget-exhausted"
          : "result-item-budget-exhausted",
      );
      return false;
    }
    serializedBytes += bytes;
    items.push(item);
    affected.push(dependencies);
    return true;
  };
  for (const path of files) {
    context.checkAbort();
    let facts;
    try {
      // oxlint-disable-next-line no-await-in-loop -- the configured file and 32 MiB limits apply before each file.
      facts = await context.module(path, true);
    } catch (error) {
      const reason = navigationError(error);
      if (!reason) throw error;
      context.reasons.add(`${path}: ${reason}`);
      if (
        reason === "file-budget-exhausted" ||
        reason === "byte-budget-exhausted" ||
        reason === "structural-read-budget-exhausted"
      )
        break;
      continue;
    }
    try {
      const bindings = new TestBindings(facts);
      const cases = collectTestCases(facts, bindings);
      const filename = TEST_FILENAME.test(path);
      const frameworkImport = facts.imports.some((binding) =>
        ["node:test", "bun:test", "vitest", "@jest/globals"].includes(binding.source ?? ""),
      );
      if (!filename && !frameworkImport && cases.length === 0) continue;
      // oxlint-disable-next-line no-await-in-loop -- relation traversal consumes the same request context.
      const related = await relations(context, facts, target, symbol);
      if (context.reasons.has("structural-read-budget-exhausted")) break;
      if (!related.length) continue;
      const association: Association = related.some((relation) => relation.association === "direct")
        ? "direct"
        : related.some((relation) => relation.association === "indirect")
          ? "indirect"
          : "weak";
      const dependencies = [...new Set(related.flatMap((relation) => relation.paths))];
      const usesByCase = usesInCases(facts, bindings, cases, related);
      const relationIndices: number[] = [];
      for (const relation of related) {
        const node = relation.binding?.statement ?? 0;
        const item: NavigationItem = {
          path,
          line: nodeLine(facts, node),
          label: `${relation.association} related test module: ${relation.reason}`,
          source: facts.document.reference,
          range: moduleRange(facts, node),
          ...(relation.binding
            ? { excerpt: importStatementExcerpt(facts, relation.binding.statement) }
            : {}),
          details: {
            kind: "test-relation",
            target: target.document.reference,
            ...relationDetails(facts, relation),
            execution: "not-run",
            assertionCoverage: "not-evaluated",
          },
        };
        if (!append(item, dependencies)) break;
        relationIndices.push(items.length);
      }
      if (
        context.reasons.has("result-item-budget-exhausted") ||
        context.reasons.has("serialized-result-budget-exhausted")
      )
        break;
      const selections: (TestCaseFact | undefined)[] = cases.length ? cases : [undefined];
      for (const test of selections) {
        if (items.length >= MAX_ANALYSIS_RESULTS) {
          context.reasons.add("result-item-budget-exhausted");
          break;
        }
        const uses = test ? (usesByCase.get(test.node) ?? []) : [];
        const notes = [
          ...(test?.notes ?? ["no-statically-readable-test-case"]),
          ...(uses.length === 0 ? ["no-target-binding-use-in-case"] : []),
        ];
        const node =
          test?.node ?? related.find((relation) => relation.binding)?.binding?.statement ?? 0;
        const range = moduleRange(facts, node);
        const testName = test?.name;
        const label = `${association} related test candidate: ${testName ?? (test ? "<dynamic or unavailable name>" : path)}`;
        const caseId = JSON.stringify([path, range.start]);
        const item: NavigationItem = {
          path,
          line: nodeLine(facts, node),
          label,
          source: facts.document.reference,
          range,
          ...(uses[0] ? { excerpt: uses[0].excerpt } : {}),
          details: {
            kind: "test-case",
            caseId,
            association,
            status: test?.status ?? "syntax-candidate",
            target: target.document.reference,
            ...(symbol
              ? { targetSymbol: { name: symbol.name, range: moduleRange(target, symbol.node) } }
              : {}),
            ...(test
              ? {
                  test: {
                    ...(testName !== undefined ? { name: testName } : {}),
                    framework: test.framework,
                    kind: test.testKind,
                    modifiers: test.modifiers,
                    range,
                  },
                }
              : {}),
            relationItems: {
              first: relationIndices[0],
              last: relationIndices.at(-1),
              count: relationIndices.length,
            },
            useCount: uses.length,
            notes,
            assertionCoverage: "not-evaluated",
            execution: "not-run",
          },
        };
        if (!append(item, dependencies)) break;
        const caseIndex = items.length;
        for (const use of uses) {
          const evidence: NavigationItem = {
            path,
            line: use.line,
            label: `Static binding use in test candidate: ${testName ?? "<dynamic or unavailable name>"}`,
            source: facts.document.reference,
            range: use.range,
            excerpt: use.excerpt,
            details: {
              kind: "test-use",
              caseId,
              caseIndex,
              association,
              target: target.document.reference,
              binding: use.binding,
              excerptTruncated: use.excerptTruncated,
              execution: "not-run",
              assertionCoverage: "not-evaluated",
            },
          };
          if (!append(evidence, dependencies)) break;
        }
        if (
          context.reasons.has("result-item-budget-exhausted") ||
          context.reasons.has("serialized-result-budget-exhausted")
        )
          break;
      }
      if (
        context.reasons.has("result-item-budget-exhausted") ||
        context.reasons.has("serialized-result-budget-exhausted")
      )
        break;
    } finally {
      context.release(facts);
    }
  }
  const invalid = await context.verify();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const reason = affected[index]
      ?.map((path) => invalid.get(path))
      .find((value) => value !== undefined);
    if (!item || reason === undefined) continue;
    item.label = `Related test candidate invalidated: ${reason}`;
    item.details = {
      ...item.details,
      status: "invalidated",
      reason,
      association: "unresolved",
      uses: [],
    };
  }
  return {
    ...context.result(items),
    counts: {
      candidateFiles: new Set(items.map((item) => item.path)).size,
      testCases: items.filter((item) => item.details.kind === "test-case").length,
      useSites: items.filter((item) => item.details.kind === "test-use").length,
      moduleRelations: items.filter((item) => item.details.kind === "test-relation").length,
    },
    stats: {
      filesParsed: context.modules.size,
      filesSkipped: Math.max(0, eligibleEntries.length - files.length),
      parseMs: Math.round(performance.now() - started),
      budgetExhausted: [...context.reasons].some((reason) => reason.includes("budget-exhausted")),
    },
  };
}
