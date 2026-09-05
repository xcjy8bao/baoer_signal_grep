// src/syntax-worker.ts
import { parse, registerDynamicLanguage } from "@ast-grep/napi";
import go from "@ast-grep/lang-go";

// src/analysis-limits.ts
var MAX_STRUCTURE_BYTES = 32 * 1024 * 1024;
var MAX_SYNTAX_NODES = 1e5;
var MAX_ANALYSIS_STORAGE_BYTES = 32 * 1024 * 1024;
var ANALYSIS_METADATA_RESERVE_BYTES = 64 * 1024;
var MAX_ANALYSIS_REASON_BYTES = 4 * 1024;
var ANALYSIS_TTL_MS = 10 * 60 * 1000;
var MAX_SOURCE_CONTINUATION_BYTES = 1024 * 1024;

// src/syntax-fields.ts
var JAVASCRIPT_FIELDS = {
  arrow_function: ["body", "parameter", "parameters", "return_type", "type_parameters"],
  assignment_expression: ["left", "right"],
  assignment_pattern: ["left", "right"],
  augmented_assignment_expression: ["left", "operator", "right"],
  binary_expression: ["left", "operator", "right"],
  break_statement: ["label"],
  call_expression: ["arguments", "function", "optional_chain", "type_arguments"],
  catch_clause: ["body", "parameter", "type"],
  class: ["body", "decorator", "name", "type_parameters"],
  class_body: ["decorator", "member"],
  class_declaration: ["body", "decorator", "name", "type_parameters"],
  class_static_block: ["body"],
  continue_statement: ["label"],
  do_statement: ["body", "condition"],
  export_specifier: ["alias", "name"],
  export_statement: ["declaration", "decorator", "source", "value"],
  field_definition: ["decorator", "property", "value"],
  finally_clause: ["body"],
  for_in_statement: ["body", "kind", "left", "operator", "right", "value"],
  for_statement: ["body", "condition", "increment", "initializer"],
  function_declaration: ["body", "name", "parameters", "return_type", "type_parameters"],
  function_expression: ["body", "name", "parameters", "return_type", "type_parameters"],
  generator_function: ["body", "name", "parameters", "return_type", "type_parameters"],
  generator_function_declaration: ["body", "name", "parameters", "return_type", "type_parameters"],
  if_statement: ["alternative", "condition", "consequence"],
  import_specifier: ["alias", "name"],
  import_statement: ["source"],
  jsx_closing_element: ["name"],
  jsx_element: ["close_tag", "open_tag"],
  jsx_opening_element: ["attribute", "name", "type_arguments"],
  jsx_self_closing_element: ["attribute", "name", "type_arguments"],
  labeled_statement: ["body", "label"],
  lexical_declaration: ["kind"],
  member_expression: ["object", "optional_chain", "property"],
  method_definition: ["body", "decorator", "name", "parameters", "return_type", "type_parameters"],
  new_expression: ["arguments", "constructor", "type_arguments"],
  object_assignment_pattern: ["left", "right"],
  pair: ["key", "value"],
  pair_pattern: ["key", "value"],
  regex: ["flags", "pattern"],
  subscript_expression: ["index", "object", "optional_chain"],
  switch_case: ["body", "value"],
  switch_default: ["body"],
  switch_statement: ["body", "value"],
  ternary_expression: ["alternative", "condition", "consequence"],
  try_statement: ["body", "finalizer", "handler"],
  unary_expression: ["argument", "operator"],
  update_expression: ["argument", "operator"],
  using_declaration: ["kind"],
  variable_declarator: ["name", "type", "value"],
  while_statement: ["body", "condition"],
  with_statement: ["body", "object"],
  abstract_class_declaration: ["body", "decorator", "name", "type_parameters"],
  abstract_method_signature: ["name", "parameters", "return_type", "type_parameters"],
  call_signature: ["parameters", "return_type", "type_parameters"],
  conditional_type: ["alternative", "consequence", "left", "right"],
  construct_signature: ["parameters", "type", "type_parameters"],
  constructor_type: ["parameters", "type", "type_parameters"],
  enum_assignment: ["name", "value"],
  enum_body: ["name"],
  enum_declaration: ["body", "name"],
  extends_clause: ["type_arguments", "value"],
  extends_type_clause: ["type"],
  function_signature: ["name", "parameters", "return_type", "type_parameters"],
  function_type: ["parameters", "return_type", "type_parameters"],
  generic_type: ["name", "type_arguments"],
  import_require_clause: ["source"],
  index_signature: ["index_type", "name", "sign", "type"],
  instantiation_expression: ["function", "type_arguments"],
  interface_declaration: ["body", "name", "type_parameters"],
  internal_module: ["body", "name"],
  mapped_type_clause: ["alias", "name", "type"],
  method_signature: ["name", "parameters", "return_type", "type_parameters"],
  module: ["body", "name"],
  nested_identifier: ["object", "property"],
  nested_type_identifier: ["module", "name"],
  optional_parameter: ["decorator", "name", "pattern", "type", "value"],
  parenthesized_expression: ["type"],
  property_signature: ["name", "type"],
  public_field_definition: ["decorator", "name", "type", "value"],
  required_parameter: ["decorator", "name", "pattern", "type", "value"],
  type_alias_declaration: ["name", "type_parameters", "value"],
  type_parameter: ["constraint", "name", "value"],
  type_predicate: ["name", "type"]
};
var GO_FIELDS = {
  array_type: ["element", "length"],
  assignment_statement: ["left", "operator", "right"],
  binary_expression: ["left", "operator", "right"],
  call_expression: ["arguments", "function", "type_arguments"],
  channel_type: ["value"],
  communication_case: ["communication"],
  composite_literal: ["body", "type"],
  const_spec: ["name", "type", "value"],
  expression_case: ["value"],
  expression_switch_statement: ["initializer", "value"],
  field_declaration: ["name", "tag", "type"],
  for_clause: ["condition", "initializer", "update"],
  for_statement: ["body"],
  func_literal: ["body", "parameters", "result"],
  function_declaration: ["body", "name", "parameters", "result", "type_parameters"],
  function_type: ["parameters", "result"],
  generic_type: ["type", "type_arguments"],
  if_statement: ["alternative", "condition", "consequence", "initializer"],
  implicit_length_array_type: ["element"],
  import_spec: ["name", "path"],
  index_expression: ["index", "operand"],
  keyed_element: ["key", "value"],
  labeled_statement: ["label"],
  map_type: ["key", "value"],
  method_declaration: ["body", "name", "parameters", "receiver", "result"],
  method_elem: ["name", "parameters", "result"],
  parameter_declaration: ["name", "type"],
  qualified_type: ["name", "package"],
  range_clause: ["left", "right"],
  receive_statement: ["left", "right"],
  selector_expression: ["field", "operand"],
  send_statement: ["channel", "value"],
  short_var_declaration: ["left", "right"],
  slice_expression: ["capacity", "end", "operand", "start"],
  slice_type: ["element"],
  type_alias: ["name", "type", "type_parameters"],
  type_assertion_expression: ["operand", "type"],
  type_case: ["type"],
  type_conversion_expression: ["operand", "type"],
  type_instantiation_expression: ["type"],
  type_parameter_declaration: ["name", "type"],
  type_spec: ["name", "type", "type_parameters"],
  type_switch_statement: ["alias", "initializer", "value"],
  unary_expression: ["operand", "operator"],
  var_spec: ["name", "type", "value"],
  variadic_parameter_declaration: ["name", "type"]
};

// src/types.ts
var MAX_SEARCH_STORAGE_BYTES = 32 * 1024 * 1024;
var MAX_RESULT_BYTES = 16 * 1024;
var MAX_PROTOCOL_LINE_BYTES = 16 * 1024 * 1024;
var MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;

// src/syntax-worker.ts
function fieldsFor(node, language) {
  const fields = new Map;
  const names = (language === "go" ? GO_FIELDS : JAVASCRIPT_FIELDS)[node.kind()] ?? [];
  for (const name of names) {
    for (const child of node.fieldChildren(name))
      fields.set(child.id(), name);
  }
  return fields;
}
function languageName(value) {
  if (value === "javascript" || value === "typescript" || value === "tsx" || value === "go") {
    return value;
  }
  throw new Error("Invalid syntax worker language");
}
function parseInput(input) {
  if (!input || typeof input !== "object" || !("language" in input) || !("text" in input)) {
    throw new Error("Invalid syntax worker input");
  }
  const language = languageName(input.language);
  if (typeof input.text !== "string" || !input.text.isWellFormed()) {
    throw new Error("Syntax worker input must be well-formed Unicode");
  }
  if (Buffer.byteLength(input.text) > MAX_SOURCE_FILE_BYTES) {
    throw new Error("Syntax worker source exceeds the file limit");
  }
  if ("pattern" in input && (typeof input.pattern !== "string" || Buffer.byteLength(input.pattern) > 4096))
    throw new Error("Invalid AST pattern");
  return {
    language,
    text: input.text,
    ..."pattern" in input && typeof input.pattern === "string" ? { pattern: input.pattern } : {}
  };
}
function extract(language, text, pattern) {
  if (language === "go")
    registerDynamicLanguage({ go });
  const names = { javascript: "JavaScript", typescript: "TypeScript", tsx: "Tsx", go: "go" };
  if (pattern !== undefined) {
    const prepared = language === "go" ? pattern.replaceAll("$", "µ") : pattern;
    const templates = language === "go" ? [
      prepared,
      `package pattern
${prepared}`,
      `package pattern
func pattern() {
${prepared}
}`
    ] : [prepared];
    const valid = templates.some((candidate) => {
      const template = parse(names[language], candidate).root();
      return template.kind() !== "ERROR" && !template.find({ rule: { kind: "ERROR" } });
    });
    if (!valid)
      throw new Error("Malformed structural pattern for selected language");
  }
  const root = parse(names[language], text).root();
  const rootRange = root.range();
  const nodes = [
    {
      kind: String(root.kind()),
      start: rootRange.start.index,
      end: rootRange.end.index,
      parent: null,
      named: root.isNamed()
    }
  ];
  const stack = [{ node: root, index: 0, next: 0, fields: fieldsFor(root, language) }];
  let malformed = root.kind() === "ERROR";
  while (stack.length > 0) {
    const frame = stack.at(-1);
    if (!frame)
      break;
    const child = frame.node.child(frame.next++);
    if (!child) {
      stack.pop();
      continue;
    }
    if (nodes.length === MAX_SYNTAX_NODES)
      return { status: "limit", nodes };
    const range = child.range();
    const kind = String(child.kind());
    const field = frame.fields.get(child.id());
    const node = {
      kind,
      start: range.start.index,
      end: range.end.index,
      parent: frame.index,
      named: child.isNamed(),
      ...field ? { field } : {}
    };
    if (kind === "ERROR" || node.start === node.end)
      malformed = true;
    const index = nodes.length;
    nodes.push(node);
    stack.push({ node: child, index, next: 0, fields: fieldsFor(child, language) });
  }
  const patternMatches = pattern === undefined || malformed ? undefined : root.findAll(pattern).map((node) => ({ start: node.range().start.index, end: node.range().end.index }));
  return {
    status: malformed ? "parse-error" : "ok",
    nodes,
    ...patternMatches ? { patternMatches } : {}
  };
}
async function main() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STRUCTURE_BYTES)
      throw new Error("Syntax worker input exceeds protocol limit");
    chunks.push(buffer);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const { language, text, pattern } = parseInput(input);
  const output = JSON.stringify(extract(language, text, pattern));
  if (Buffer.byteLength(output) > MAX_STRUCTURE_BYTES) {
    throw new Error("Syntax worker output exceeds protocol limit");
  }
  process.stdout.write(output);
}
await main();
