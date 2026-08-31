import { syntaxField, syntaxFields, syntaxText } from "./syntax-tree.js";
import type {
  SyntaxAnalysis,
  SyntaxLanguage,
  SyntaxNode,
  SyntaxRole,
  SyntaxRoleName,
  SyntaxSymbol,
} from "./syntax-types.js";

const IMPLEMENTATIONS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "generator_function",
  "arrow_function",
  "method_definition",
  "method_declaration",
  "func_literal",
]);
const SIGNATURES = new Set([
  "function_signature",
  "method_signature",
  "abstract_method_signature",
  "construct_signature",
  "call_signature",
  "method_elem",
]);
const CONTAINERS = new Set([
  "class_declaration",
  "abstract_class_declaration",
  "class",
  "interface_declaration",
]);
const TYPE_SYMBOLS = new Set([
  "type_alias_declaration",
  "enum_declaration",
  "type_spec",
  "type_alias",
]);
const BINDING_IDENTIFIERS = new Set([
  "identifier",
  "shorthand_property_identifier_pattern",
  "private_property_identifier",
  "property_identifier",
  "type_identifier",
  "field_identifier",
]);
const STRINGS = new Set([
  "string",
  "interpreted_string_literal",
  "raw_string_literal",
  "rune_literal",
]);
const TYPE_AREAS = new Set([
  "type_annotation",
  "type_arguments",
  "type_parameters",
  "type_identifier",
  "predefined_type",
  "type_alias_declaration",
  "interface_body",
  "extends_type_clause",
  "implements_clause",
  "array_type",
  "conditional_type",
  "constructor_type",
  "existential_type",
  "flow_maybe_type",
  "function_type",
  "generic_type",
  "index_type_query",
  "infer_type",
  "intersection_type",
  "literal_type",
  "lookup_type",
  "nested_type_identifier",
  "object_type",
  "parenthesized_type",
  "readonly_type",
  "template_literal_type",
  "this_type",
  "tuple_type",
  "type_query",
  "union_type",
]);

interface Interval {
  start: number;
  end: number;
}
type Tree = Pick<SyntaxAnalysis, "nodes" | "children">;

function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  intervals.sort((a, b) => a.start - b.start || b.end - a.end);
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

function subtract(range: Interval, excluded: readonly Interval[]): Interval[] {
  const results: Interval[] = [];
  let low = 0,
    high = excluded.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((excluded[middle]?.end ?? Infinity) <= range.start) low = middle + 1;
    else high = middle;
  }
  let start = range.start;
  for (let i = low; i < excluded.length; i++) {
    const gap = excluded[i];
    if (!gap || gap.start >= range.end) break;
    if (gap.start > start) results.push({ start, end: gap.start });
    start = Math.max(start, gap.end);
  }
  if (start < range.end) results.push({ start, end: range.end });
  return results;
}

function containedIntervals(range: Interval, sorted: readonly Interval[]): Interval[] {
  let low = 0,
    high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((sorted[middle]?.start ?? Infinity) < range.start) low = middle + 1;
    else high = middle;
  }
  const contained: Interval[] = [];
  for (let i = low; i < sorted.length; i++) {
    const item = sorted[i];
    if (!item || item.start >= range.end) break;
    if (item.end <= range.end) contained.push(item);
  }
  return mergeIntervals(contained);
}

function bindingNodes(tree: Tree, index: number): number[] {
  const results: number[] = [];
  const stack = [index];
  while (stack.length) {
    const id = stack.pop();
    if (id === undefined) break;
    const node = tree.nodes[id];
    if (!node) continue;
    if (BINDING_IDENTIFIERS.has(node.kind)) {
      results.push(id);
      continue;
    }
    if (node.kind === "pair_pattern") {
      const value = syntaxField(tree, id, "value");
      if (value !== undefined) stack.push(value);
    } else if (node.kind === "assignment_pattern" || node.kind === "object_assignment_pattern") {
      const left = syntaxField(tree, id, "left");
      if (left !== undefined) stack.push(left);
    } else {
      for (const child of tree.children[id] ?? []) {
        const value = tree.nodes[child];
        if (value?.named && value.field !== "type" && value.field !== "value") stack.push(child);
      }
    }
  }
  return results;
}

function attachedName(tree: Tree, index: number, text: string): string {
  const node = tree.nodes[index];
  if (!node) return "<anonymous>";
  const ownName = syntaxField(tree, index, "name");
  const own = ownName === undefined ? undefined : tree.nodes[ownName];
  if (own) return syntaxText(own, text);
  const parent = node.parent === null ? undefined : tree.nodes[node.parent];
  if (parent && node.parent !== null) {
    const binding =
      syntaxField(tree, node.parent, parent.kind === "pair" ? "key" : "name") ??
      (parent.kind === "assignment_expression"
        ? syntaxField(tree, node.parent, "left")
        : undefined);
    const target = binding === undefined ? undefined : tree.nodes[binding];
    if (target) return syntaxText(target, text);
    if (parent.kind === "export_statement") return "default";
  }
  return `<anonymous@${node.start}>`;
}

function directlyExported(tree: Tree, index: number): boolean {
  let current: number | null = tree.nodes[index]?.parent ?? null;
  while (current !== null) {
    const node: SyntaxNode | undefined = tree.nodes[current];
    if (!node) return false;
    if (node.kind === "export_statement") return true;
    if (
      ![
        "variable_declarator",
        "lexical_declaration",
        "variable_declaration",
        "ambient_declaration",
      ].includes(node.kind)
    )
      return false;
    current = node.parent;
  }
  return false;
}

function goExported(tree: Tree, index: number, name: string, inFunction: boolean): boolean {
  if (!/^\p{Lu}/u.test(name)) return false;
  const kind = tree.nodes[index]?.kind;
  if (kind === "method_declaration" || kind === "field_declaration" || kind === "method_elem")
    return true;
  return (
    !inFunction &&
    ["function_declaration", "type_spec", "type_alias", "var_spec", "const_spec"].includes(
      kind ?? "",
    )
  );
}

/** Derive bounded facts once; no downstream consumer needs another native parse. */
export function deriveSyntaxFacts(
  tree: Tree,
  language: SyntaxLanguage,
  text: string,
): { symbols: SyntaxSymbol[]; roles: SyntaxRole[] } {
  const { nodes, children } = tree;
  const roles: SyntaxRole[] = [];
  const symbols: SyntaxSymbol[] = [];
  const lexical: Interval[] = [];
  const comments: Interval[] = [];
  const nestedCallContent: Interval[] = [];
  const scopes: (string | undefined)[] = [];
  const functionScopes: boolean[] = [];
  const semanticCalls: { node: number; range: SyntaxNode; subkind: string; candidate: boolean }[] =
    [];
  const semanticImports: { node: number; range: SyntaxNode; role: "import" | "export" }[] = [];
  const add = (id: number, role: SyntaxRoleName, subkind?: string, candidate = false) => {
    const node = nodes[id];
    if (!node || node.start === node.end) return;
    roles.push({
      start: node.start,
      end: node.end,
      role,
      certainty: candidate ? "candidate" : "syntax",
      node: id,
      ...(subkind ? { subkind } : {}),
    });
  };

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (!node) continue;
    const parent = node.parent === null ? undefined : nodes[node.parent];
    const outerScope = node.parent === null ? undefined : scopes[node.parent];
    const inFunction = node.parent === null ? false : (functionScopes[node.parent] ?? false);
    scopes[index] = outerScope;
    functionScopes[index] = inFunction || IMPLEMENTATIONS.has(node.kind);

    if (node.kind === "comment") {
      add(index, "comment");
      lexical.push(node);
      comments.push(node);
    } else if (node.named && STRINGS.has(node.kind)) {
      add(index, "string", node.kind);
      lexical.push(node);
    } else if (node.kind === "template_string") {
      const substitutions = (children[index] ?? [])
        .map((child) => nodes[child])
        .filter((child): child is SyntaxNode => child?.kind === "template_substitution");
      for (const range of subtract(node, mergeIntervals(substitutions))) {
        roles.push({
          ...range,
          role: "string",
          certainty: "syntax",
          subkind: "template-static",
          node: index,
        });
        lexical.push(range);
      }
    } else if (node.kind === "jsx_text") {
      add(index, "jsx-text");
      lexical.push(node);
    } else if (node.kind === "regex" || node.kind === "regex_pattern") {
      add(index, "unknown", "regex-literal");
      lexical.push(node);
    } else if (language !== "go" && TYPE_AREAS.has(node.kind)) {
      add(index, "unknown", "type");
      lexical.push(node);
    }
    if (node.kind === "as_expression" || node.kind === "satisfies_expression") {
      let afterOperator = false;
      for (const child of children[index] ?? []) {
        const target = nodes[child];
        if (!target) continue;
        if (target.kind === "as" || target.kind === "satisfies") afterOperator = true;
        else if (afterOperator) {
          add(child, "unknown", "type");
          lexical.push(target);
        }
      }
    }

    if (["arguments", "argument_list", "formal_parameters", "parameter_list"].includes(node.kind)) {
      nestedCallContent.push(node);
    }
    if (IMPLEMENTATIONS.has(node.kind)) {
      const bodyId = syntaxField(tree, index, "body");
      const body = bodyId === undefined ? undefined : nodes[bodyId];
      if (body) nestedCallContent.push(body);
    }

    const isImplementation = IMPLEMENTATIONS.has(node.kind);
    const isStructure =
      node.named &&
      (isImplementation ||
        SIGNATURES.has(node.kind) ||
        CONTAINERS.has(node.kind) ||
        TYPE_SYMBOLS.has(node.kind));
    const isVariable =
      node.named && ["variable_declarator", "var_spec", "const_spec"].includes(node.kind);
    const isField =
      node.named &&
      [
        "public_field_definition",
        "field_definition",
        "field_declaration",
        "property_signature",
      ].includes(node.kind);
    if (isStructure || isVariable || isField) {
      const nameIds = syntaxFields(tree, index, "name").flatMap((name) => bindingNodes(tree, name));
      for (const id of nameIds) {
        if (syntaxText(nodes[id]!, text) !== "_") {
          add(id, "declaration", node.kind);
          const name = syntaxText(nodes[id]!, text);
          if (
            language === "go"
              ? goExported(tree, index, name, inFunction)
              : directlyExported(tree, index)
          ) {
            add(id, "export", language === "go" ? "exported-identifier" : "exported-declaration");
          }
        }
      }
      const valueId = syntaxField(tree, index, "value");
      const value = valueId === undefined ? undefined : nodes[valueId];
      const variableHasOwnImplementation = value && IMPLEMENTATIONS.has(value.kind);
      if (isStructure || (isVariable && !inFunction && !variableHasOwnImplementation) || isField) {
        const name = attachedName(tree, index, text);
        const bodyId = syntaxField(tree, index, "body");
        const body = bodyId === undefined ? undefined : nodes[bodyId];
        const hasBody = isImplementation && body !== undefined;
        const symbol: SyntaxSymbol = {
          name,
          kind: node.kind,
          start: node.start,
          end: node.end,
          hasBody,
          exported:
            language === "go"
              ? goExported(tree, index, name, inFunction)
              : directlyExported(tree, index),
          node: index,
          ...(outerScope ? { scope: outerScope } : {}),
          ...(hasBody && body ? { bodyStart: body.start, bodyEnd: body.end } : {}),
        };
        symbols.push(symbol);
        if (isImplementation || CONTAINERS.has(node.kind)) scopes[index] = name;
      }
    } else if (node.kind === "object" && parent?.kind === "variable_declarator") {
      scopes[index] = attachedName(tree, index, text);
    } else if (language === "go" && node.kind === "short_var_declaration") {
      const left = syntaxField(tree, index, "left");
      if (left !== undefined) {
        for (const id of bindingNodes(tree, left)) {
          if (syntaxText(nodes[id]!, text) !== "_")
            add(id, "declaration", "short-variable-candidate", true);
        }
      }
    }

    if (node.kind === "call_expression" || node.kind === "new_expression") {
      const field = node.kind === "new_expression" ? "constructor" : "function";
      const calleeId = syntaxField(tree, index, field);
      const callee = calleeId === undefined ? undefined : nodes[calleeId];
      if (callee) {
        const optional = (children[index] ?? []).some(
          (child) => nodes[child]?.kind === "optional_chain",
        );
        semanticCalls.push({
          node: index,
          range: callee,
          subkind:
            language === "go"
              ? callee.kind === "func_literal"
                ? "call"
                : "call-or-conversion"
              : node.kind === "new_expression"
                ? "constructor"
                : optional
                  ? "optional-call"
                  : "call",
          candidate: language === "go" && callee.kind !== "func_literal",
        });
      }
    }
    if (["import_statement", "import_spec", "export_statement"].includes(node.kind)) {
      const role = node.kind === "export_statement" ? "export" : "import";
      for (const child of children[index] ?? []) {
        const target = nodes[child];
        if (
          target &&
          (["source", "path", "name"].includes(target.field ?? "") ||
            ["import_clause", "export_clause", "import", "export", "default"].includes(target.kind))
        )
          semanticImports.push({ node: child, range: target, role });
      }
    }
    if (language === "go" && node.kind === "import") add(index, "import", "import-keyword");
  }

  const excluded = mergeIntervals(lexical);
  nestedCallContent.sort((a, b) => a.start - b.start);
  const commentExcluded = mergeIntervals(comments);
  for (const call of semanticCalls) {
    const callExcluded = containedIntervals(call.range, nestedCallContent);
    for (const lexicalRange of subtract(call.range, excluded)) {
      for (const range of subtract(lexicalRange, callExcluded)) {
        roles.push({
          ...range,
          role: "call",
          certainty: call.candidate ? "candidate" : "syntax",
          subkind: call.subkind,
          node: call.node,
        });
      }
    }
  }
  for (const item of semanticImports) {
    for (const range of subtract(item.range, commentExcluded)) {
      roles.push({ ...range, role: item.role, certainty: "syntax", node: item.node });
    }
  }
  for (const range of subtract({ start: 0, end: text.length }, excluded)) {
    roles.push({ ...range, role: "code", certainty: "syntax", node: 0 });
  }
  roles.sort((a, b) => a.start - b.start || a.end - b.end || a.role.localeCompare(b.role));
  return { symbols, roles };
}

/** Whole-occurrence classification; crossing a role boundary is not a role match. */
export function classifySyntaxRange(
  analysis: SyntaxAnalysis,
  start: number,
  end: number,
): SyntaxRole[] {
  if (analysis.status !== "ok" || start < 0 || end < start) return [];
  return analysis.roles.filter(
    (role) => role.start <= start && end <= role.end && start < role.end,
  );
}
