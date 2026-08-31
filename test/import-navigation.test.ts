import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { navigateImports, type NavigationHost } from "../src/import-navigation.js";
import { readWorkspaceDocument } from "../src/source-document.js";
import { parseSyntax } from "../src/syntax.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(files: Record<string, string>): Promise<NavigationHost> {
  const cwd = await mkdtemp(join(tmpdir(), "signal-grep-imports-"));
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

test("static ESM navigation retains each alias through named re-exports and local imported exports", async () => {
  const host = await fixture({
    "use.ts": 'import { publicName as localUse } from "./barrel.js";',
    "barrel.ts": 'export { local as publicName } from "./bridge";',
    "bridge.ts": 'import { actual as local } from "./origin"; export { local };',
    "origin.ts": "export function actual() { return 1; }",
  });
  const result = await navigateImports(host, { path: "use.ts", symbol: "localUse" });
  expect(result.partial).toBe(false);
  const item = result.items[0];
  expect(item?.details.status).toBe("resolved");
  expect(item?.details.destination).toMatchObject({
    source: { path: "origin.ts" },
    name: "actual",
    kind: "function_declaration",
  });
  expect(item?.details.chain).toMatchObject([
    { imported: "publicName", local: "localUse", to: { path: "barrel.ts" } },
    { imported: "local", exported: "publicName", to: { path: "bridge.ts" } },
    { local: "local", exported: "local" },
    { imported: "actual", local: "local", to: { path: "origin.ts" } },
  ]);
}, 20_000);

test("default expressions remain expressions and namespace/side effects only prove a module", async () => {
  const host = await fixture({
    "use.ts":
      'import Value from "./value"; import * as everything from "./value"; import "./value";',
    "value.tsx": "export default <section>value</section>;",
  });
  const result = await navigateImports(host, { path: "use.ts" });
  expect(result.items.map((item) => item.details.status)).toEqual(["resolved", "module", "module"]);
  expect(result.items[0]?.details.destination).toMatchObject({
    name: "default",
    kind: "jsx_element",
  });
}, 20_000);

test("arrow/function-valued variables and destructured exports have one real binding declaration", async () => {
  const host = await fixture({
    "use.ts": 'import {run, renamed, rest} from "./value";',
    "value.ts": "export const run=()=>1; export const {a:renamed,...rest}=value;",
  });
  const result = await navigateImports(host, { path: "use.ts" });
  expect(result.items.map((item) => item.details.status)).toEqual([
    "resolved",
    "resolved",
    "resolved",
  ]);
  expect(result.items[0]?.details.destination).toMatchObject({
    kind: "variable_declarator",
    name: "run",
  });
}, 20_000);

test("ambiguous source mappings, external aliases, wildcard exports and cycles terminate distinctly", async () => {
  const host = await fixture({
    "use.ts":
      'import {x} from "./both"; import {y} from "@alias/source"; import {z} from "./wild"; import {loop} from "./a";',
    "both.ts": "export const x = 1;",
    "both.js": "export const x = 2;",
    "wild.ts": 'export * from "./both";',
    "a.ts": 'export {loop} from "./b";',
    "b.ts": 'export {loop} from "./a";',
  });
  const result = await navigateImports(host, { path: "use.ts" });
  expect(result.items.map((item) => item.details.reason)).toEqual([
    "ambiguous-module-candidates",
    "external-package-or-path-alias-unsupported",
    "export-star-unsupported",
    "circular-re-export",
  ]);
  expect(result.partial).toBe(true);
}, 20_000);

test("version changes invalidate the affected confirmed relation", async () => {
  const host = await fixture({
    "use.ts": 'import {x} from "./value";',
    "value.ts": "export const x = 1;",
  });
  const load = host.load;
  host.load = async (path, expected) => {
    if (expected && path === "value.ts")
      await writeFile(join(host.cwd, path), "export const x = 2;");
    return load(path, expected);
  };
  const result = await navigateImports(host, { path: "use.ts" });
  expect(result.items[0]?.details.status).toBe("unresolved");
  expect(result.items[0]?.details.reason).toBe("source-changed");
  expect(result.items[0]?.details.destination).toBeUndefined();
}, 20_000);

test("hop limit and syntax failures never fabricate declarations", async () => {
  const files: Record<string, string> = { "use.ts": 'import {x} from "./file0";' };
  for (let index = 0; index < 9; index++)
    files[`file${index}.ts`] = `export {x} from "./file${index + 1}";`;
  files["file9.ts"] = "export const x = 1;";
  const host = await fixture(files);
  const result = await navigateImports(host, { path: "use.ts" });
  expect(result.items[0]?.details.reason).toBe("hop-budget-exhausted");
  expect(result.filesRead).toBe(9);
  const error: unknown = await navigateImports(
    { ...host, signal: AbortSignal.abort() },
    { path: "use.ts" },
  ).catch((failure: unknown) => failure);
  expect(error).toHaveProperty("name", "AbortError");
}, 20_000);
