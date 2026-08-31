import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { NavigationHost } from "../src/import-model.js";
import { findRelatedTests } from "../src/test-navigation.js";
import { SourceDocument, readWorkspaceDocument } from "../src/source-document.js";
import { parseSyntax } from "../src/syntax.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(files: Record<string, string>): Promise<NavigationHost> {
  const cwd = await mkdtemp(join(tmpdir(), "signal-grep-tests-"));
  roots.push(cwd);
  await Promise.all(
    Object.entries(files).map(async ([path, text]) => {
      await mkdir(dirname(join(cwd, path)), { recursive: true });
      await writeFile(join(cwd, path), text);
    }),
  );
  return {
    cwd,
    listFiles: async () => Object.keys(files),
    load: (path, expected) => readWorkspaceDocument(path, cwd, undefined, expected?.origin),
    syntax: (source) => parseSyntax(source.path, source.text),
  };
}

test("test candidates separate direct, indirect and weak evidence while preserving imported aliases", async () => {
  const host = await fixture({
    "src/math.ts": "export function add(a:number,b:number){return a+b}",
    "src/barrel.ts": 'export { add as sum } from "./math";',
    "direct.test.ts":
      'import { test as check } from "node:test"; import { add as plus } from "./src/math"; check.only("addition", {timeout:100}, ()=> { plus(1,2); });',
    "indirect.spec.ts":
      'import { it } from "vitest"; import { sum } from "./src/barrel"; it.skip("sum", ()=> { sum(1,2); });',
    "unrelated/math.test.ts": 'test("same file name", ()=> { const add = 4; });',
  });
  const result = await findRelatedTests(host, { path: "src/math.ts", symbol: "add" });
  const cases = result.items.filter((item) => item.details.kind === "test-case");
  expect(cases.map((item) => item.details.association)).toEqual(["direct", "indirect", "weak"]);
  expect(cases[0]?.details.test).toMatchObject({
    name: "addition",
    framework: "node:test",
    modifiers: ["only"],
  });
  expect(cases[1]?.details.test).toMatchObject({
    name: "sum",
    framework: "Vitest",
    modifiers: ["skip"],
  });
  expect(cases[2]?.details.status).toBe("syntax-candidate");
  expect(
    result.items
      .filter((item) => item.details.kind === "test-use")
      .map((item) => item.details.binding),
  ).toEqual(["plus", "sum"]);
  expect(result.counts).toEqual({
    candidateFiles: 3,
    testCases: 3,
    useSites: 2,
    moduleRelations: 3,
  });
  expect(result.partial).toBe(false);
}, 20_000);

test("Windows-style source references retain direct test associations", async () => {
  const host = await fixture({
    "src/subject.ts": "export const subject=()=>1;",
    "tests/subject.test.ts":
      'import {test} from "node:test"; import {subject} from "../src/subject"; test("uses subject",()=>{subject();});',
  });
  const load = host.load;
  host.load = async (path, expected) => {
    const source = await load(path, expected);
    return new SourceDocument(
      { ...source.reference, path: source.path.replaceAll("/", "\\\\") },
      source.bytes,
    );
  };
  const result = await findRelatedTests(host, { path: "src/subject.ts", symbol: "subject" });
  expect(result.items.find((item) => item.details.kind === "test-case")?.details).toMatchObject({
    association: "direct",
    useCount: 1,
  });
}, 20_000);

test("only-imported modules and lexical shadowing do not prove target-function usage", async () => {
  const host = await fixture({
    "target.ts": "export function actual(){return 1}; export function other(){return 2}",
    "target.test.ts":
      'import {test} from "bun:test"; import {actual as subject, other} from "./target"; test("unused",()=>{other()}); test("shadowed",(subject)=>{subject()}); test("local shadow",()=>{const subject=()=>0;subject()}); test("real",()=>{subject()});',
  });
  const result = await findRelatedTests(host, { path: "target.ts", symbol: "actual" });
  const cases = result.items.filter((item) => item.details.kind === "test-case");
  expect(cases.map((item) => item.details.useCount)).toEqual([0, 0, 0, 1]);
  expect(result.items.filter((item) => item.details.kind === "test-use")).toHaveLength(1);
  expect(
    cases.every(
      (item) =>
        item.details.assertionCoverage === "not-evaluated" && item.details.execution === "not-run",
    ),
  ).toBe(true);
}, 20_000);

test("constructing a class or using an enclosing function does not prove use of its nested implementation", async () => {
  const host = await fixture({
    "target.ts":
      "export class Service { run(){return 1} }\nexport function outer(){function inner(){return 2} return inner;}\nexport const direct=()=>3;",
    "target.test.ts":
      'import {test} from "node:test"; import {Service,outer,direct} from "./target"; test("constructor",()=>{new Service()}); test("outer",()=>{outer()}); test("direct",()=>{direct()});',
  });
  const method = await findRelatedTests(host, { path: "target.ts", symbol: "run" });
  expect(method.counts?.useSites).toBe(0);
  expect(
    method.items
      .filter((item) => item.details.kind === "test-relation")
      .every((item) => item.details.targetBindingProven === false),
  ).toBe(true);
  const nested = await findRelatedTests(host, { path: "target.ts", symbol: "inner" });
  expect(nested.counts?.useSites).toBe(0);
  const direct = await findRelatedTests(host, { path: "target.ts", symbol: "direct" });
  expect(direct.counts?.useSites).toBe(1);
  expect(direct.items.find((item) => item.details.kind === "test-use")?.details.binding).toBe(
    "direct",
  );
}, 20_000);

test("Jest aliases, namespace framework imports and dynamic/global test candidates remain distinct", async () => {
  const host = await fixture({
    "subject.ts": "export const value=1;",
    "jest.test.ts":
      'import { test as verify, describe as suite } from "@jest/globals"; import {value} from "./subject"; suite("suite",()=>{ verify("case",()=>{value;}); });',
    "namespace.test.ts":
      'import * as check from "vitest"; import {value} from "./subject"; check.test.skip("namespace",()=>{value;});',
    "dynamic.test.ts":
      'import test from "node:test"; import {value} from "./subject"; test("case"+value,()=>{value;});',
    "global.test.ts": 'import {value} from "./subject"; test("global",()=>{value;});',
  });
  const result = await findRelatedTests(host, { path: "subject.ts" });
  const cases = result.items.filter((item) => item.details.kind === "test-case");
  expect(cases.find((item) => item.path === "dynamic.test.ts")?.details.notes).toContain(
    "dynamic-or-missing-test-name",
  );
  expect(cases.find((item) => item.path === "global.test.ts")?.details.status).toBe(
    "syntax-candidate",
  );
  expect(cases.find((item) => item.path === "namespace.test.ts")?.details.test).toMatchObject({
    framework: "Vitest",
    name: "namespace",
    modifiers: ["skip"],
  });
  expect(
    cases.filter((item) => item.path === "jest.test.ts").map((item) => item.details.useCount),
  ).toEqual([0, 1]);
}, 20_000);

test("missing candidates are not reported as absent tests and source changes invalidate affected paths", async () => {
  const host = await fixture({
    "source.ts": "export const source=1;",
    "different.test.ts": 'test("other",()=>{});',
  });
  const result = await findRelatedTests(host, { path: "source.ts" });
  expect(result.items).toEqual([]);
  expect(result.partial).toBe(false);
  const changing = await fixture({
    "target.ts": "export const target=1;",
    "target.test.ts":
      'import {test} from "node:test"; import {target} from "./target"; test("value",()=>{target;});',
  });
  const load = changing.load;
  changing.load = async (path, expected) => {
    if (expected && path === "target.ts")
      await writeFile(join(changing.cwd, path), "export const target=2;");
    return load(path, expected);
  };
  const stale = await findRelatedTests(changing, { path: "target.ts" });
  expect(stale.partial).toBe(true);
  expect(
    stale.items.every(
      (item) => item.details.status === "invalidated" && item.details.association === "unresolved",
    ),
  ).toBe(true);
}, 20_000);

test("many use snippets are individually pageable evidence rather than one oversized test item", async () => {
  const host = await fixture({
    "source.ts": "export const source=1;",
    "source.test.ts": `import {test} from "node:test"; import {source} from "./source"; test("many",()=>{${"source;\n".repeat(200)}});`,
  });
  const result = await findRelatedTests(host, { path: "source.ts" });
  expect(result.counts?.useSites).toBe(200);
  expect(result.items.every((item) => Buffer.byteLength(JSON.stringify(item)) < 10_000)).toBe(true);
  expect(
    result.items
      .filter((item) => item.details.kind === "test-use")
      .every((item) => item.details.caseIndex === 2),
  ).toBe(true);
}, 20_000);

test("navigation releases syntax trees per file and handles final budget exhaustion explicitly", async () => {
  const host = await fixture({
    "source.ts": "export const source=()=>1;",
    "source.test.ts":
      'import {test} from "node:test"; import {source} from "./source"; test("use",()=>{source()});',
  });
  const active = new Set<string>();
  const syntax = host.syntax.bind(host);
  host.syntax = async (document) => {
    active.add(document.path);
    return syntax(document);
  };
  host.releaseSyntax = (document) => {
    active.delete(document.path);
  };
  const normal = await findRelatedTests(host, { path: "source.ts", symbol: "source" });
  expect(normal.counts?.useSites).toBe(1);
  expect(active.size).toBe(0);
  const load = host.load;
  let verifications = 0;
  host.load = async (path, expected) => {
    if (expected) {
      verifications++;
      throw Object.assign(new Error("budget"), { reason: "structural-read-budget-exhausted" });
    }
    return load(path, expected);
  };
  const limited = await findRelatedTests(host, { path: "source.ts" });
  expect(limited.partial).toBe(true);
  expect(verifications).toBe(1);
  expect(
    limited.items.every((item) => item.details.reason === "structural-read-budget-exhausted"),
  ).toBe(true);
}, 20_000);

test("parse errors and invalid target selections release the host syntax cache", async () => {
  const host = await fixture({
    "source.ts": "export function source(){return 1}",
    "source.test.ts": 'import {test} from "node:test"; test("unfinished",()=>{',
  });
  const active = new Set<string>();
  const syntax = host.syntax.bind(host);
  host.syntax = async (document) => {
    active.add(document.path);
    return syntax(document);
  };
  host.releaseSyntax = (document) => {
    active.delete(document.path);
  };
  const partial = await findRelatedTests(host, { path: "source.ts" });
  expect(partial.partial).toBe(true);
  expect(partial.reasons).toContain("source.test.ts: syntax-parse-error");
  expect(active.size).toBe(0);
  const invalid: unknown = await findRelatedTests(host, {
    path: "source.ts",
    symbol: "missing",
  }).catch((error: unknown) => error);
  expect(invalid).toBeInstanceOf(Error);
  expect(active.size).toBe(0);
  host.syntax = async (document) => {
    active.add(document.path);
    throw new Error("worker transport failed");
  };
  const workerFailure: unknown = await findRelatedTests(host, { path: "source.ts" }).catch(
    (error: unknown) => error,
  );
  expect(workerFailure).toHaveProperty("message", "worker transport failed");
  expect(active.size).toBe(0);
}, 20_000);
