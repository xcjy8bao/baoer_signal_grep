import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { MAX_SYNTAX_NODES } from "../src/analysis-limits.js";
import {
  classifySyntaxRange,
  parseSyntax,
  syntaxField,
  type SyntaxAnalysis,
} from "../src/syntax.js";
import { MAX_SOURCE_FILE_BYTES } from "../src/types.js";

function occurrences(source: string, word: string): number[] {
  const result: number[] = [];
  for (
    let start = source.indexOf(word);
    start >= 0;
    start = source.indexOf(word, start + word.length)
  )
    result.push(start);
  return result;
}

function rolesAt(analysis: SyntaxAnalysis, source: string, word: string, occurrence = 0) {
  const start = occurrences(source, word)[occurrence];
  if (start === undefined) throw new Error("Missing fixture occurrence");
  return classifySyntaxRange(analysis, start, start + word.length);
}

describe("isolated syntax facts", () => {
  test("preserves private/static/accessor and Unicode implementation ranges without 500-character clipping", async () => {
    const source =
      "\uFEFF/*界😀*/\r\nexport class Box<T> { #value: T; constructor(v:T){this.#value=v;} static async *items(){ yield 1; } #read(){return this.#value;} get value(){return this.#value;} set value(v:T){this.#value=v;} }\r\nconst long = () => '" +
      "界".repeat(1200) +
      "';\r\n";
    const analysis = await parseSyntax("box.ts", source);
    expect(analysis.status).toBe("ok");
    expect(analysis.symbols.filter((symbol) => symbol.kind === "class_declaration")).toHaveLength(
      1,
    );
    const read = analysis.symbols.find((symbol) => symbol.name === "#read");
    expect(read).toMatchObject({ hasBody: true, scope: "Box", exported: false });
    if (!read) throw new Error("Missing private method");
    expect(source.slice(read.start, read.end)).toBe("#read(){return this.#value;}");
    expect(read.start).toBe(source.indexOf("#read"));
    expect(read.start).not.toBe(Buffer.byteLength(source.slice(0, read.start)));
    const long = analysis.symbols.find((symbol) => symbol.name === "long");
    if (!long) throw new Error("Missing arrow");
    expect(long.hasBody).toBe(true);
    expect(source.slice(long.start, long.end)).toHaveLength(1208);
    expect(analysis.symbols.filter((symbol) => symbol.name === "value")).toHaveLength(2);
  }, 10_000);

  test("separates bodyless overloads, interfaces, and concrete implementations", async () => {
    const source =
      "function f(x:string):string; function f(x:number):number; function f(x:unknown){return x;} interface API { read(x:string):void }";
    const analysis = await parseSyntax("api.ts", source);
    expect(analysis.status).toBe("ok");
    expect(
      analysis.symbols.filter((symbol) => symbol.name === "f").map((symbol) => symbol.hasBody),
    ).toEqual([false, false, true]);
    expect(analysis.symbols.find((symbol) => symbol.name === "read")).toMatchObject({
      hasBody: false,
      scope: "API",
    });
    expect(analysis.symbols.some((symbol) => symbol.name === "string")).toBe(false);
    expect(rolesAt(analysis, source, "string").some((role) => role.role === "string")).toBe(false);
  }, 10_000);

  test("supports JS object methods, generators and nested expression arrows with lexical scopes", async () => {
    const source =
      "const object = { run(){ const inner = x => x.trim(); return inner('x'); }, *items(){yield 1;} }; const f = function named(){ return 1; };";
    const analysis = await parseSyntax("code.js", source);
    expect(analysis.status).toBe("ok");
    expect(analysis.symbols.find((symbol) => symbol.name === "run")).toMatchObject({
      hasBody: true,
      scope: "object",
    });
    expect(analysis.symbols.find((symbol) => symbol.name === "inner")).toMatchObject({
      hasBody: true,
      scope: "run",
    });
    expect(analysis.symbols.find((symbol) => symbol.name === "named")).toMatchObject({
      hasBody: true,
    });
    expect(rolesAt(analysis, source, "trim").some((role) => role.role === "call")).toBe(true);
  }, 10_000);

  test("classifies real occurrences, not whole lines or enclosing call arguments", async () => {
    const source =
      "function f(){ needle(); /*needle*/ const s='needle'; outer(inner()); factory(needle).method(needle); }";
    const analysis = await parseSyntax("roles.js", source);
    expect(analysis.status).toBe("ok");
    expect(rolesAt(analysis, source, "needle", 0).some((role) => role.role === "call")).toBe(true);
    expect(rolesAt(analysis, source, "needle", 1).map((role) => role.role)).toContain("comment");
    expect(rolesAt(analysis, source, "needle", 2).map((role) => role.role)).toContain("string");
    for (const index of [1, 2, 3, 4])
      expect(rolesAt(analysis, source, "needle", index).some((role) => role.role === "call")).toBe(
        false,
      );
    expect(rolesAt(analysis, source, "inner").some((role) => role.role === "call")).toBe(true);
    expect(rolesAt(analysis, source, "method").some((role) => role.role === "call")).toBe(true);
    expect(
      classifySyntaxRange(
        analysis,
        source.indexOf("needle"),
        source.indexOf("/*needle*/") + 10,
      ).some((role) => role.role === "call"),
    ).toBe(false);
  }, 10_000);

  test("keeps JSX text, strings, interpolation, types and regex literals distinct", async () => {
    const source =
      "export const View = <T,>(p:{value:T}) => <div title='needle'>needle{needle()}</div>; const s = `needle ${needle()}`; const r = /needle/; const x: Needle = value;";
    const analysis = await parseSyntax("view.tsx", source);
    expect(analysis.status).toBe("ok");
    expect(rolesAt(analysis, source, "needle", 0).map((role) => role.role)).toContain("string");
    expect(rolesAt(analysis, source, "needle", 1).map((role) => role.role)).toContain("jsx-text");
    expect(rolesAt(analysis, source, "needle", 2).map((role) => role.role)).toContain("call");
    expect(rolesAt(analysis, source, "needle", 3).map((role) => role.role)).toContain("string");
    expect(rolesAt(analysis, source, "needle", 4).map((role) => role.role)).toContain("call");
    expect(rolesAt(analysis, source, "needle", 5).map((role) => role.subkind)).toContain(
      "regex-literal",
    );
    expect(rolesAt(analysis, source, "needle", 5).some((role) => role.role === "code")).toBe(false);
    expect(rolesAt(analysis, source, "Needle").some((role) => role.subkind === "type")).toBe(true);
    expect(analysis.symbols.find((symbol) => symbol.name === "View")).toMatchObject({
      hasBody: true,
      exported: true,
    });
  }, 10_000);

  test("distinguishes normal, optional and constructor syntax without claiming binding", async () => {
    const source = "f(); object?.run?.(); new Box();";
    const analysis = await parseSyntax("calls.js", source);
    expect(rolesAt(analysis, source, "f").map((role) => role.subkind)).toContain("call");
    expect(rolesAt(analysis, source, "run").map((role) => role.subkind)).toContain("optional-call");
    expect(rolesAt(analysis, source, "Box").map((role) => role.subkind)).toContain("constructor");
  }, 10_000);

  test("exposes static import/re-export fields for downstream analysis", async () => {
    const source =
      "import { original as local } from './a.js'; export { local as publicName }; export { name as other } from './b.js';";
    const analysis = await parseSyntax("imports.ts", source);
    expect(analysis.status).toBe("ok");
    const specifier = analysis.nodes.findIndex((node) => node.kind === "import_specifier");
    const name = syntaxField(analysis, specifier, "name");
    const alias = syntaxField(analysis, specifier, "alias");
    expect(name).toBeDefined();
    expect(alias).toBeDefined();
    if (name === undefined || alias === undefined) throw new Error("Missing fields");
    expect(source.slice(analysis.nodes[name]?.start, analysis.nodes[name]?.end)).toBe("original");
    expect(source.slice(analysis.nodes[alias]?.start, analysis.nodes[alias]?.end)).toBe("local");
    expect(rolesAt(analysis, source, "original").map((role) => role.role)).toContain("import");
    expect(rolesAt(analysis, source, "publicName").map((role) => role.role)).toContain("export");
  }, 10_000);

  test("supports Go package evidence, exact export syntax and ambiguous calls/short declarations", async () => {
    const source =
      'package p\nimport (alias "fmt"; . "math"; _ "unsafe")\ntype Box[T any] struct { Value T; hidden int }\nfunc Exported[T any](x T) T { var Local int; old := 1; old, Fresh := 2, 3; _ = Local; _ = Fresh; alias.Println(old); go alias.Println(x); defer alias.Println(x); return T(x) }\nfunc (b *Box[T]) Read() T { return b.Value }\nvar Text = `raw text`\nconst Rune = \'界\'\n';
    const analysis = await parseSyntax("code.go", source);
    expect(analysis.status).toBe("ok");
    for (const name of ["Exported", "Box", "Value", "Read", "Text", "Rune"]) {
      expect(rolesAt(analysis, source, name).some((role) => role.role === "export")).toBe(true);
    }
    expect(rolesAt(analysis, source, "Local").some((role) => role.role === "export")).toBe(false);
    expect(rolesAt(analysis, source, "hidden").some((role) => role.role === "export")).toBe(false);
    expect(
      rolesAt(analysis, source, "old", 1)
        .filter((role) => role.role === "declaration")
        .every((role) => role.certainty === "candidate"),
    ).toBe(true);
    const conversion = source.lastIndexOf("T(x)");
    expect(classifySyntaxRange(analysis, conversion, conversion + 1)).toContainEqual(
      expect.objectContaining({
        role: "call",
        certainty: "candidate",
        subkind: "call-or-conversion",
      }),
    );
    expect(rolesAt(analysis, source, "alias").some((role) => role.role === "import")).toBe(true);
    expect(
      rolesAt(analysis, source, "raw text").some((role) => role.subkind === "raw_string_literal"),
    ).toBe(true);
    expect(rolesAt(analysis, source, "界").some((role) => role.subkind === "rune_literal")).toBe(
      true,
    );
  }, 10_000);

  test("rejects recovery nodes even when there is no ERROR node", async () => {
    const analysis = await parseSyntax("broken.js", "function f() {");
    expect(analysis.status).toBe("parse-error");
    expect(analysis.diagnostics).toContainEqual(expect.objectContaining({ kind: "missing-token" }));
    expect(analysis.symbols).toHaveLength(0);
    expect(analysis.roles).toHaveLength(0);
    expect((await parseSyntax("empty.ts", "")).status).toBe("ok");
    expect((await parseSyntax("broken.go", "package p\nfunc F() {")).status).toBe("parse-error");
  }, 10_000);

  test("unsupported, oversized and capped trees are explicit without fabricated facts", async () => {
    expect((await parseSyntax("f.py", "def f(): pass")).status).toBe("unsupported");
    const oversized = await parseSyntax("f.js", " ".repeat(MAX_SOURCE_FILE_BYTES + 1));
    expect(oversized.status).toBe("limit");
    expect(oversized.nodes).toHaveLength(0);
    const capped = await parseSyntax("dense.js", ";".repeat(MAX_SYNTAX_NODES));
    expect(capped.status).toBe("limit");
    expect(capped.nodes).toHaveLength(MAX_SYNTAX_NODES);
    expect(capped.roles).toHaveLength(0);
    expect(capped.symbols).toHaveLength(0);
  }, 15_000);

  test("cancellation interrupts owned native work and leaves subsequent parsing usable", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(parseSyntax("f.ts", "function f(){}", controller.signal), {
      name: "AbortError",
    });
    const running = new AbortController();
    const promise = parseSyntax("dense.ts", ";".repeat(MAX_SOURCE_FILE_BYTES), running.signal);
    const timer = setTimeout(() => running.abort(), 30);
    try {
      await assert.rejects(promise, { name: "AbortError" });
    } finally {
      clearTimeout(timer);
    }
    expect((await parseSyntax("f.ts", "function f(){}")).status).toBe("ok");
  }, 10_000);
});
