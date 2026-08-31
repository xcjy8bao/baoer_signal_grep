import { describe, expect, test } from "bun:test";
import { contentHash, SourceDocument, type ByteRange } from "../src/source-document.js";
import {
  filterRoleOccurrences,
  findFunctionConjunctions,
  ownImplementationRanges,
} from "../src/syntax-search.js";
import { parseSyntax } from "../src/syntax.js";

async function source(text: string, path = "fixture.ts") {
  const bytes = Buffer.from(text);
  const document = new SourceDocument(
    {
      path,
      origin: {
        kind: "worktree",
        revision: { size: bytes.length, mtimeMs: 1 },
        contentHash: contentHash(bytes),
      },
    },
    bytes,
  );
  return { document, analysis: await parseSyntax(path, text) };
}

function occurrences(document: SourceDocument, term: string): ByteRange[] {
  const needle = Buffer.from(term);
  const ranges: ByteRange[] = [];
  for (
    let start = document.bytes.indexOf(needle);
    start >= 0;
    start = document.bytes.indexOf(needle, start + needle.length)
  ) {
    ranges.push({ start, end: start + needle.length });
  }
  return ranges;
}

describe("role occurrence filtering", () => {
  test("filters raw UTF-8 occurrences individually and deduplicates a role union", async () => {
    const { document, analysis } = await source(
      "/*界😀*/\r\nfunction token(){ token(); /*token*/ const s='token'; }",
    );
    const matches = occurrences(document, "token");
    const selected = filterRoleOccurrences(
      document,
      analysis,
      [...matches, ...matches],
      ["declaration", "call"],
    );
    expect(selected.partial).toBe(false);
    expect(selected.items).toHaveLength(2);
    expect(selected.items.map((item) => item.range)).toEqual(matches.slice(0, 2));
    expect(selected.items.map((item) => item.line)).toEqual([2, 2]);
    expect(selected.items[0]?.details).toMatchObject({
      roles: [{ role: "declaration", certainty: "syntax", range: matches[0] }],
    });
    expect(selected.items[1]?.details).toMatchObject({
      roles: [{ role: "call", certainty: "syntax", range: matches[1] }],
    });
    expect(selected.items[0]?.source).toEqual(document.reference);
    expect(selected.items[0]?.range?.start).not.toBe(document.text.indexOf("token"));
  }, 10_000);

  test("a mixed-role interval cannot be attributed to just its first call", async () => {
    const { document, analysis } = await source("token(); /* token */");
    const matches = occurrences(document, "token");
    const first = matches[0],
      last = matches[1];
    if (!first || !last) throw new Error("Missing fixture occurrence");
    expect(
      filterRoleOccurrences(document, analysis, [{ start: first.start, end: last.end }], ["call"])
        .items,
    ).toHaveLength(0);
    expect(filterRoleOccurrences(document, analysis, matches, ["comment"]).items).toHaveLength(1);
  }, 10_000);

  test("Go call/conversion candidates keep their evidence strength", async () => {
    const { document, analysis } = await source(
      "package p\nfunc F[T any](x T) T { return T(x) }",
      "fixture.go",
    );
    const start = document.bytes.indexOf(Buffer.from("T(x)"));
    const result = filterRoleOccurrences(document, analysis, [{ start, end: start + 1 }], ["call"]);
    expect(result.partial).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.details).toMatchObject({
      roles: [{ role: "call", certainty: "candidate", subkind: "call-or-conversion" }],
    });
  }, 10_000);

  test("unsupported/error analysis and byte-fragment matches remain explicitly unknown", async () => {
    const bad = await source("function broken() {");
    const unsupported = await source("def token(): pass", "fixture.py");
    for (const fixture of [bad, unsupported]) {
      const result = filterRoleOccurrences(fixture.document, fixture.analysis, [], ["call"]);
      expect(result.partial).toBe(true);
      expect(result.reasons.join(" ")).toContain(fixture.analysis.status);
    }
    const valid = await source("function 界词(){}");
    const byte = valid.document.bytes.indexOf(Buffer.from("界"));
    const split = filterRoleOccurrences(
      valid.document,
      valid.analysis,
      [{ start: byte + 1, end: byte + 2 }],
      ["declaration"],
    );
    expect(split.items).toHaveLength(0);
    expect(split.partial).toBe(true);
    expect(split.reasons.join(" ")).toContain("split UTF-8");
  }, 10_000);
});

describe("same-function literal conjunction", () => {
  test("nested callbacks are independent candidates and cannot complete their parent", async () => {
    const { document, analysis } = await source(
      "function parent(){ alpha(); const callback = () => { beta(); gamma(); }; } function sibling(){ beta(); } function matched(){ alpha(); if (flag) beta(); else gamma(); }",
    );
    const parentTerms = findFunctionConjunctions(document, analysis, ["alpha", "beta"]);
    expect(parentTerms.partial).toBe(false);
    expect(parentTerms.items.map((item) => item.label)).toEqual(["matched"]);
    const innerTerms = findFunctionConjunctions(document, analysis, ["beta", "gamma"]);
    expect(innerTerms.items.map((item) => item.label)).toEqual(["parent.callback", "matched"]);
    const parent = analysis.symbols.find((symbol) => symbol.name === "parent");
    if (!parent) throw new Error("Missing parent");
    const owned = ownImplementationRanges(document, analysis, parent)
      .map((range) => document.slice(range))
      .join("");
    expect(owned).toContain("alpha");
    expect(owned).not.toContain("beta");
    expect(owned).not.toContain("gamma");
  }, 10_000);

  test("comments, static strings, regex and type declarations cannot satisfy code terms", async () => {
    const { document, analysis } = await source(
      "function falseHit(){ alpha(); const s='beta'; /*beta*/ const r=/beta/; type beta = number; } function template(){ return `alpha static ${alpha() + beta()}`; }",
    );
    const result = findFunctionConjunctions(document, analysis, ["alpha", "beta"]);
    expect(result.partial).toBe(false);
    expect(result.items.map((item) => item.label)).toEqual(["template"]);
    expect(result.items[0]?.details).toMatchObject({
      terms: [
        { term: "alpha", count: 1 },
        { term: "beta", count: 1 },
      ],
    });
  }, 10_000);

  test("one term in each function or in a bodyless signature is not a result", async () => {
    const { document, analysis } = await source(
      "declare function alpha(beta:string):void; function one(){ alpha(); } function two(){ beta(); }",
    );
    const result = findFunctionConjunctions(document, analysis, ["alpha", "beta"]);
    expect(result.partial).toBe(false);
    expect(result.items).toHaveLength(0);
  }, 10_000);

  test("assertion and satisfies type expressions are excluded even without type annotations", async () => {
    const { document, analysis } = await source(
      "function query(){ alpha(); const x = value as typeof beta; } function shape(){ alpha(); const x = value satisfies { beta:string }; } function constant(){ alpha(); const x = value as const; }",
    );
    expect(findFunctionConjunctions(document, analysis, ["alpha", "beta"]).items).toHaveLength(0);
    expect(
      findFunctionConjunctions(document, analysis, ["alpha", "const"]).items.map(
        (item) => item.label,
      ),
    ).toEqual(["query", "shape", "constant"]);
    const constant = analysis.symbols.find((symbol) => symbol.name === "constant");
    if (!constant) throw new Error("Missing constant function");
    const text = ownImplementationRanges(document, analysis, constant)
      .map((range) => document.slice(range))
      .join("");
    expect(text).not.toContain("as const");
    expect(text).toContain("const x");
  }, 10_000);

  test("expression arrows and different branches count lexically, without execution claims", async () => {
    const { document, analysis } = await source(
      "const expr = () => alpha() + beta(); function branch(flag){ if(flag) alpha(); else beta(); } const outer = () => () => alpha() + beta();",
    );
    const result = findFunctionConjunctions(document, analysis, ["alpha", "beta"]);
    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.label).slice(0, 2)).toEqual(["expr", "branch"]);
    expect(result.items.some((item) => item.label === "outer")).toBe(false);
    expect(result.items[0]?.details?.relation).toContain("not proof of a shared execution path");
  }, 10_000);

  test("counts literal Unicode and case-sensitive terms and retains one bounded proof each", async () => {
    const { document, analysis } = await source(
      "/*😀*/ function f(){ 界词(); 界词(); Beta(); beta(); }",
    );
    const result = findFunctionConjunctions(document, analysis, ["界词", "Beta"]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.details).toMatchObject({
      terms: [
        {
          term: "界词",
          count: 2,
          omittedOccurrenceEvidence: 1,
          evidence: { range: occurrences(document, "界词")[0] },
        },
        {
          term: "Beta",
          count: 1,
          omittedOccurrenceEvidence: 0,
          evidence: { range: occurrences(document, "Beta")[0] },
        },
      ],
    });
    expect(findFunctionConjunctions(document, analysis, ["界词", "BETA"]).items).toHaveLength(0);
    const item = result.items[0];
    if (!item?.range) throw new Error("Missing inspect range");
    expect(document.slice(item.range)).toBe("function f(){ 界词(); 界词(); Beta(); beta(); }");
    expect(item.source).toEqual(document.reference);
  }, 10_000);

  test("changed-line conjunction requires every complete term inside the selected lines", async () => {
    const { document, analysis } = await source(
      "function changed(){\r\n  alpha();\r\n  beta();\r\n}\r\n",
    );
    const alphaLine = document.lineRange(2),
      betaLine = document.lineRange(3);
    expect(
      findFunctionConjunctions(document, analysis, ["alpha", "beta"], [alphaLine]).items,
    ).toHaveLength(0);
    const result = findFunctionConjunctions(
      document,
      analysis,
      ["alpha", "beta"],
      [betaLine, alphaLine, alphaLine],
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.details?.scope).toBe("implementation-code-intersect-changed-ranges");
    expect(findFunctionConjunctions(document, analysis, ["alpha", "beta"], []).items).toHaveLength(
      0,
    );
    const alpha = occurrences(document, "alpha")[0];
    if (!alpha) throw new Error("Missing alpha");
    expect(
      findFunctionConjunctions(
        document,
        analysis,
        ["alpha", "beta"],
        [{ start: alpha.start, end: alpha.end - 1 }, betaLine],
      ).items,
    ).toHaveLength(0);
  }, 10_000);

  test("excluded gaps are never concatenated into an invented literal match", async () => {
    const { document, analysis } = await source("function f(){ foo/* gap */bar; beta(); }");
    expect(findFunctionConjunctions(document, analysis, ["foobar", "beta"]).items).toHaveLength(0);
  }, 10_000);

  test("Go and incomplete syntax do not masquerade as complete empty function searches", async () => {
    const go = await source("package p\nfunc F(){alpha();beta()}", "fixture.go");
    expect(findFunctionConjunctions(go.document, go.analysis, ["alpha", "beta"])).toMatchObject({
      partial: true,
      items: [],
    });
    const bad = await source("function f(){alpha();beta()");
    expect(findFunctionConjunctions(bad.document, bad.analysis, ["alpha", "beta"])).toMatchObject({
      partial: true,
      items: [],
    });
  }, 10_000);
});
