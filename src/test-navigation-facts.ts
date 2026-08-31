import { literalText, nodeText, type ModuleFacts } from "./import-model.js";
import { syntaxField } from "./syntax-tree.js";

const FUNCTIONS = new Set([
  "function_declaration",
  "function_expression",
  "generator_function_declaration",
  "generator_function",
  "arrow_function",
  "method_definition",
]);
const SCOPES = new Set([
  ...FUNCTIONS,
  "program",
  "statement_block",
  "catch_clause",
  "for_statement",
  "for_in_statement",
  "class_body",
]);
const TEST_NAMES = new Set(["test", "it", "describe"]);
const FRAMEWORKS = new Map([
  ["node:test", "node:test"],
  ["bun:test", "bun:test"],
  ["vitest", "Vitest"],
  ["@jest/globals", "Jest"],
]);

export interface TestCaseFact {
  node: number;
  name?: string;
  callback?: number;
  framework?: string;
  testKind: string;
  modifiers: string[];
  status: "recognized" | "syntax-candidate";
  notes: string[];
}
interface LocalBinding {
  name: string;
  node: number;
  scope: number;
}

function nearestScope(
  facts: ModuleFacts,
  node: number | null | undefined,
  functionOnly = false,
): number {
  let current = node;
  while (current !== null && current !== undefined) {
    const value = facts.syntax.nodes[current];
    if (!value) break;
    if (
      functionOnly ? FUNCTIONS.has(value.kind) || value.kind === "program" : SCOPES.has(value.kind)
    )
      return current;
    current = value.parent;
  }
  return 0;
}

function patternIdentifiers(facts: ModuleFacts, root: number | undefined): number[] {
  if (root === undefined) return [];
  const output: number[] = [];
  const pending = [root];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined) break;
    const node = facts.syntax.nodes[id];
    if (
      !node ||
      node.field === "type" ||
      (node.field === "value" && facts.syntax.nodes[node.parent ?? -1]?.kind !== "pair_pattern") ||
      node.field === "right" ||
      node.field === "key" ||
      node.kind === "type_annotation"
    )
      continue;
    if (node.kind === "identifier" || node.kind === "shorthand_property_identifier_pattern")
      output.push(id);
    else pending.push(...(facts.syntax.children[id] ?? []));
  }
  return output;
}

/** Lexical ownership only. This intentionally makes no type/runtime binding claim. */
export class TestBindings {
  readonly facts: ModuleFacts;
  #bindings = new Map<string, LocalBinding[]>();
  #declarations = new Set<number>();
  constructor(facts: ModuleFacts) {
    this.facts = facts;
    const add = (ids: number[], scope: number): void => {
      for (const node of ids) {
        this.#declarations.add(node);
        const name = nodeText(facts, node) ?? "";
        const values = this.#bindings.get(name) ?? [];
        values.push({ name, node, scope });
        this.#bindings.set(name, values);
      }
    };
    for (let id = 0; id < facts.syntax.nodes.length; id++) {
      const node = facts.syntax.nodes[id];
      if (!node) continue;
      if (node.kind === "variable_declarator") {
        const parent = node.parent === null ? undefined : facts.syntax.nodes[node.parent];
        add(
          patternIdentifiers(facts, syntaxField(facts.syntax, id, "name")),
          nearestScope(facts, node.parent, parent?.kind === "variable_declaration"),
        );
      }
      if (FUNCTIONS.has(node.kind)) {
        add(
          patternIdentifiers(
            facts,
            syntaxField(facts.syntax, id, "parameters") ??
              syntaxField(facts.syntax, id, "parameter"),
          ),
          id,
        );
        const name = syntaxField(facts.syntax, id, "name");
        if (name !== undefined && node.kind !== "method_definition")
          add([name], node.kind.endsWith("declaration") ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "class_declaration" || node.kind === "class") {
        const name = syntaxField(facts.syntax, id, "name");
        if (name !== undefined)
          add([name], node.kind === "class_declaration" ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "catch_clause")
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "parameter")), id);
    }
  }
  shadowed(name: string, occurrence: number): boolean {
    const local = this.#bindings.get(name);
    if (!local?.length) return false;
    const ancestors = new Set<number>();
    let current: number | null = occurrence;
    while (current !== null) {
      ancestors.add(current);
      current = this.facts.syntax.nodes[current]?.parent ?? null;
    }
    return local.some((binding) => ancestors.has(binding.scope));
  }
  isReference(node: number): boolean {
    const value = this.facts.syntax.nodes[node];
    if (
      !value ||
      this.#declarations.has(node) ||
      !["identifier", "shorthand_property_identifier"].includes(value.kind)
    )
      return false;
    let current: number | null = value.parent;
    while (current !== null) {
      const ancestor = this.facts.syntax.nodes[current];
      if (!ancestor) break;
      if (
        [
          "import_statement",
          "export_statement",
          "type_annotation",
          "type_arguments",
          "type_parameters",
          "type_alias_declaration",
          "interface_declaration",
        ].includes(ancestor.kind)
      )
        return false;
      current = ancestor.parent;
    }
    return true;
  }
}

interface Callee {
  root: string;
  rootNode: number;
  properties: string[];
}
function callee(facts: ModuleFacts, node: number | undefined): Callee | undefined {
  if (node === undefined) return undefined;
  const value = facts.syntax.nodes[node];
  if (!value) return undefined;
  if (value.kind === "identifier")
    return { root: nodeText(facts, node) ?? "", rootNode: node, properties: [] };
  if (value.kind !== "member_expression") return undefined;
  const object = callee(facts, syntaxField(facts.syntax, node, "object"));
  const property = syntaxField(facts.syntax, node, "property");
  if (
    !object ||
    property === undefined ||
    facts.syntax.nodes[property]?.kind !== "property_identifier"
  )
    return undefined;
  return { ...object, properties: [...object.properties, nodeText(facts, property) ?? ""] };
}

export function collectTestCases(facts: ModuleFacts, bindings: TestBindings): TestCaseFact[] {
  const cases: TestCaseFact[] = [];
  for (let id = 0; id < facts.syntax.nodes.length; id++) {
    if (facts.syntax.nodes[id]?.kind !== "call_expression") continue;
    const call = callee(facts, syntaxField(facts.syntax, id, "function"));
    if (!call) continue;
    const imported = facts.imports.find((binding) => binding.local === call.root);
    const properties = [...call.properties];
    let kind = call.root;
    let framework: string | undefined;
    const notes: string[] = [];
    if (imported && !imported.typeOnly && !bindings.shadowed(call.root, call.rootNode)) {
      framework = FRAMEWORKS.get(imported.source ?? "");
      if (imported.kind === "namespace") kind = properties.shift() ?? "";
      else if (imported.kind === "default" && imported.source === "node:test") kind = "test";
      else kind = imported.imported;
    } else if (imported) notes.push("test-binding-shadowed-or-type-only");
    if (!TEST_NAMES.has(kind)) continue;
    if (!framework) notes.push("framework-binding-unresolved");
    const modifiers = properties.filter((property) => property === "skip" || property === "only");
    if (modifiers.length !== properties.length || modifiers.length > 1)
      notes.push("parameterized-or-custom-test-wrapper-unsupported");
    const argumentsNode = syntaxField(facts.syntax, id, "arguments");
    const argumentsList =
      argumentsNode === undefined
        ? []
        : (facts.syntax.children[argumentsNode] ?? []).filter(
            (child) =>
              facts.syntax.nodes[child]?.named && facts.syntax.nodes[child]?.kind !== "comment",
          );
    const nameNode = argumentsList[0];
    const nameKind = nameNode === undefined ? undefined : facts.syntax.nodes[nameNode]?.kind;
    const name =
      nameKind === "string" || nameKind === "template_string"
        ? literalText(nodeText(facts, nameNode))
        : undefined;
    if (name === undefined) notes.push("dynamic-or-missing-test-name");
    const last = argumentsList.at(-1);
    const callback =
      last !== undefined &&
      ["arrow_function", "function_expression", "generator_function"].includes(
        facts.syntax.nodes[last]?.kind ?? "",
      )
        ? last
        : undefined;
    if (callback === undefined) notes.push("explicit-test-callback-unavailable");
    const supportedArguments =
      argumentsList.length === 2 ||
      (argumentsList.length === 3 && facts.syntax.nodes[argumentsList[1] ?? -1]?.kind === "object");
    if (!supportedArguments) notes.push("test-arguments-unsupported");
    cases.push({
      node: id,
      ...(name !== undefined ? { name } : {}),
      ...(callback !== undefined ? { callback } : {}),
      ...(framework !== undefined ? { framework } : {}),
      testKind: kind,
      modifiers,
      status: notes.length === 0 ? "recognized" : "syntax-candidate",
      notes,
    });
  }
  return cases;
}
