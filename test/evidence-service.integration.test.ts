import { afterEach, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepRuntime } from "../src/runtime.js";
import { SignalGrepService } from "../src/service.js";
const roots: string[] = [];
const execute = promisify(execFile);
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "signal-evidence-service-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, source]) => {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), source);
    }),
  );
  return root;
}
async function expectFailure(pending: Promise<unknown>, message: string): Promise<void> {
  const failure: unknown = await pending.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}
function service() {
  return new SignalGrepService({ runRipgrep: createRipgrepRunner() });
}
async function git(root: string, ...args: string[]) {
  return execute(
    "git",
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args],
    { cwd: root },
  );
}

test("public AND counts files separately and function AND excludes nested/comment/string evidence", async () => {
  const root = await fixture({
    "a.ts":
      "export function good(){ authorize(); persist(); }\nfunction misleading(){ authorize(); const callback=()=>persist(); }\nfunction quoted(){ authorize(); return 'persist'; }\n",
    "b.ts": "// authorize\nconst text='persist';",
    "c.ts": "authorize();",
  });
  const search = service();
  const files = await search.search({ allOf: ["authorize", "persist"] }, root);
  expect(files.details.analysis?.kind).toBe("file-and");
  expect(files.details.analysis?.unit).toBe("files");
  expect(files.details.analysis?.totalItems).toBe(2);
  expect(files.details.totalMatches).toBe(0);
  const functions = await search.search(
    { allOf: ["authorize", "persist"], within: "function" },
    root,
  );
  expect(functions.details.analysis?.items.map((item) => item.label).join(" ")).toContain("good");
  expect(functions.details.analysis?.totalItems).toBe(1);
  const inspect = functions.details.analysis?.items[0]?.inspect;
  if (!inspect) throw new Error("Missing executable inspect");
  const source = await search.search(inspect, root);
  expect(source.text).toContain("authorize(); persist();");
  await search.shutdown();
}, 10000);

test("anyOf retains exact overlapping terms with one candidate scan and stable term counts", async () => {
  const root = await fixture({
    "a.ts": "const foobar = 'λ+'; // foo FOOBAR λ+\n",
    "b.ts": "export const foo = 'foobar';\n",
  });
  const runner = createRipgrepRunner();
  let scans = 0;
  const search = new SignalGrepService({
    runRipgrep: async (...args) => {
      scans++;
      return runner(...args);
    },
  });
  const found = await search.search({ anyOf: ["foo", "foobar", "λ+"] }, root);
  expect(scans).toBe(1);
  expect(found.details.analysis?.kind).toBe("any-of");
  expect(found.details.analysis?.unit).toBe("occurrences");
  expect(found.details.analysis?.termCounts).toEqual([
    { term: "foo", retainedOccurrences: 4 },
    { term: "foobar", retainedOccurrences: 2 },
    { term: "λ+", retainedOccurrences: 2 },
  ]);
  expect(found.details.analysis?.items.map((item) => item.details?.term)).toEqual([
    "foo",
    "foo",
    "foo",
    "foo",
    "foobar",
    "foobar",
    "λ+",
    "λ+",
  ]);
  expect(found.text).not.toContain('"term":"FOOBAR"');
  const inspect = found.details.analysis?.items.find(
    (item) => item.details?.term === "λ+",
  )?.inspect;
  if (!inspect) throw new Error("Missing anyOf inspection request");
  expect((await search.search(inspect, root)).text).toContain("λ+");
  await writeFile(join(root, "a.ts"), "const changed = true;\n");
  expect((await search.search(inspect, root)).details.structure?.status).toBe("source-changed");
  await search.shutdown();
}, 10000);

test("anyOf validates its exclusive literal contract", async () => {
  const root = await fixture({ "a.txt": "alpha beta\n" });
  const search = service();
  await expectFailure(search.search({ anyOf: ["alpha"] }, root), "2–8");
  await expectFailure(search.search({ anyOf: ["alpha", "alpha"] }, root), "distinct");
  await expectFailure(search.search({ anyOf: ["alpha", "line\nbreak"] }, root), "single-line");
  await expectFailure(search.search({ anyOf: ["alpha", "\uD800"] }, root), "well-formed");
  await expectFailure(search.search({ anyOf: ["alpha", "é".repeat(129)] }, root), "256");
  await expectFailure(search.search({ anyOf: ["alpha", "beta"], pattern: "alpha" }, root), "omit");
  await expectFailure(search.search({ anyOf: ["alpha", "beta"], mode: "summary" }, root), "mode");
  await search.shutdown();
}, 10000);

test("anyOf preserves a nonempty whitespace-only literal exactly", async () => {
  const root = await fixture({ "a.txt": "alpha beta\n" });
  const search = service();
  const found = await search.search({ anyOf: [" ", "beta"] }, root);
  expect(found.details.analysis?.termCounts).toEqual([
    { term: " ", retainedOccurrences: 1 },
    { term: "beta", retainedOccurrences: 1 },
  ]);
  expect(found.details.analysis?.items.map((item) => item.details?.term)).toEqual([" ", "beta"]);
  await search.shutdown();
}, 10000);

test("anyOf preserves hidden and ignore policy while exclusions still narrow candidates", async () => {
  const root = await fixture({
    ".git/hooks/sample": "alpha beta\n",
    ".gitignore": "ignored.ts\n",
    ".hidden.ts": "alpha beta\n",
    "dist/generated.ts": "alpha beta\n",
    "ignored.ts": "alpha beta\n",
    "src/keep.ts": "alpha beta\n",
  });
  const search = service();
  const visible = await search.search({ anyOf: ["alpha", "beta"], exclude: "dist/**" }, root);
  expect(visible.details.analysis?.items.map((item) => item.path)).toEqual([
    ".hidden.ts",
    "src/keep.ts",
    ".hidden.ts",
    "src/keep.ts",
  ]);
  const withoutHidden = await search.search(
    { anyOf: ["alpha", "beta"], exclude: "dist/**", hidden: false },
    root,
  );
  expect(withoutHidden.details.analysis?.items.map((item) => item.path)).toEqual([
    "src/keep.ts",
    "src/keep.ts",
  ]);
  await search.shutdown();
}, 10000);

test("anyOf rejects cancellation observed after an empty candidate scan", async () => {
  const root = await fixture({ "a.txt": "unrelated\n" });
  const controller = new AbortController();
  const search = new SignalGrepService({
    runRipgrep: async (request) => {
      controller.abort();
      return {
        request,
        matches: [],
        totalMatches: 0,
        fileCounts: new Map(),
        sourceRevisions: new Map(),
        snapshotComplete: true,
        truncatedLines: 0,
      };
    },
  });
  const failure: unknown = await search
    .search({ anyOf: ["alpha", "beta"] }, root, controller.signal)
    .catch((error: unknown) => error);
  expect(failure).toMatchObject({ name: "AbortError", message: "Operation aborted" });
  await search.shutdown();
}, 10000);

test("anyOf changed-line scope retains only wholly contained exact terms", async () => {
  const root = await fixture({ "a.txt": "alpha\nbeta\nstable\n" });
  await git(root, "init", "-q");
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "base");
  await writeFile(join(root, "a.txt"), "alpha changed\nbeta\nstable\n");
  const search = service();
  const found = await search.search(
    { anyOf: ["alpha", "beta"], changes: { scope: "lines", side: "new" } },
    root,
  );
  expect(found.details.analysis?.termCounts).toEqual([
    { term: "alpha", retainedOccurrences: 1 },
    { term: "beta", retainedOccurrences: 0 },
  ]);
  expect(found.details.analysis?.totalItems).toBe(1);
  await search.shutdown();
}, 15000);

test("anyOf pages retained evidence without changing snapshot counts", async () => {
  const root = await fixture({
    "many.txt": Array.from({ length: 40 }, (_, index) =>
      index % 2 === 0 ? `alpha ${index}` : `beta ${index}`,
    ).join("\n"),
  });
  const search = service();
  const first = await search.search({ anyOf: ["alpha", "beta"] }, root);
  const next = first.details.nextRequest;
  if (!next) throw new Error("Missing anyOf continuation");
  const second = await search.search(next, root);
  expect(second.details.analysis?.termCounts).toEqual(first.details.analysis?.termCounts);
  expect(
    new Set([
      ...(first.details.analysis?.items.map((item) => item.index) ?? []),
      ...(second.details.analysis?.items.map((item) => item.index) ?? []),
    ]).size,
  ).toBe(40);
  await search.shutdown();
}, 10000);

test("impact selects one target and merges exact role candidates with related-test evidence", async () => {
  const root = await fixture({
    "src/core.ts":
      "export function calculate(value:number){ return value + 1; }\ncalculate(1);\nconst reference = calculate;\nexport { calculate as compute };\nconst text = 'calculate'; // calculate\nconst expression = /calculate/;\n",
    "src/client.ts": "import { calculate } from './core';\nexport const result = calculate(2);\n",
    "src/view.tsx": "export const View = () => <div>calculate</div>;\n",
    "src/notes.md": "calculate is documented here\n",
    "src/use.go": "package sample\nfunc use(){ calculate() }\n",
    "test/core.test.ts":
      "import {test} from 'node:test';\nimport {calculate} from '../src/core';\ntest('calculates',()=>{ calculate(1); });\n",
  });
  const search = service();
  const found = await search.search(
    { mode: "impact", path: "src/core.ts", symbol: "calculate" },
    root,
  );
  expect(found.details.mode).toBe("impact");
  expect(found.details.analysis?.kind).toBe("impact");
  expect(found.details.analysis?.unit).toBe("impact-candidates");
  expect(found.details.analysis?.items[0]?.details?.kind).toBe("impact-target");
  expect(found.details.analysis?.items[0]?.details?.scope).toBe("<module>");
  expect(found.details.analysis?.counts?.targets).toBe(1);
  expect(found.details.analysis?.counts?.retainedExactOccurrences).toBeGreaterThanOrEqual(10);
  for (const category of [
    "declaration",
    "import",
    "export",
    "call",
    "code",
    "comment",
    "string",
    "jsx-text",
    "unknown",
    "unclassified",
  ])
    expect(found.details.analysis?.counts?.[category]).toBeGreaterThan(0);
  const categories = [
    "declaration",
    "import",
    "export",
    "call",
    "code",
    "comment",
    "string",
    "jsx-text",
    "unknown",
    "unclassified",
  ];
  const retainedExactOccurrences = found.details.analysis?.counts?.retainedExactOccurrences;
  if (retainedExactOccurrences === undefined) throw new Error("Missing retained impact count");
  expect(
    categories.reduce(
      (total, category) => total + (found.details.analysis?.counts?.[category] ?? 0),
      0,
    ),
  ).toBe(retainedExactOccurrences);
  expect(found.details.analysis?.counts?.testUses).toBeGreaterThan(0);
  expect(found.details.analysis?.counts?.testCases).toBeGreaterThan(0);
  expect(found.details.analysis?.counts?.testRelations).toBeGreaterThan(0);
  expect(found.text).toContain("binding unproven");
  expect(found.text).toContain('"execution":"not-run"');
  expect(found.text).toContain('"assertionCoverage":"not-evaluated"');
  expect(
    found.details.analysis?.items.some(
      (item) =>
        item.path === "src/use.go" &&
        Array.isArray(item.details?.roles) &&
        item.details.roles.some(
          (role) =>
            typeof role === "object" &&
            role !== null &&
            "certainty" in role &&
            role.certainty === "candidate",
        ),
    ),
  ).toBe(true);
  const targetInspect = found.details.analysis?.items[0]?.inspect;
  if (!targetInspect) throw new Error("Missing impact target inspection");
  const inspected = await search.search(targetInspect, root);
  expect(inspected.text).toContain("function calculate");
  expect(inspected.text).toContain("return value + 1");
  await writeFile(join(root, "src/core.ts"), "export function changed(){ return 0; }\n");
  expect((await search.search(targetInspect, root)).details.structure?.status).toBe(
    "source-changed",
  );
  await search.shutdown();
}, 20000);

test("impact resolves an ordinary snapshot match and rejects analysis cursors", async () => {
  const root = await fixture({
    "src/core.ts": "export function calculate(){\n  return 42;\n}\n",
  });
  const search = service();
  const ordinary = await search.search({ pattern: "return 42", mode: "summary" }, root);
  const cursor = ordinary.details.cursor;
  if (!cursor) throw new Error("Missing ordinary snapshot cursor");
  const impact = await search.search({ mode: "impact", cursor, matchIndex: 1 }, root);
  expect(impact.details.analysis?.items[0]?.details?.name).toBe("calculate");
  const analysisCursor = impact.details.cursor;
  if (!analysisCursor) throw new Error("Missing impact analysis cursor");
  await expectFailure(
    search.search({ mode: "impact", cursor: analysisCursor, matchIndex: 1 }, root),
    "ordinary search snapshot",
  );
  await search.shutdown();
}, 15000);

test("impact rejects invalid target shapes and anonymous placeholders before scanning", async () => {
  const root = await fixture({
    "named.ts": "export function named(){ return 1; }\n",
    "anonymous.ts": "export default () => 1;\n",
  });
  const runner = createRipgrepRunner();
  let scans = 0;
  const search = new SignalGrepService({
    runRipgrep: async (...args) => {
      scans++;
      return runner(...args);
    },
  });
  await expectFailure(search.search({ mode: "impact", path: "named.ts" }, root), "at least one");
  await expectFailure(
    search.search({ mode: "impact", path: "named.ts", symbol: "named", pattern: "named" }, root),
    "does not accept",
  );
  await expectFailure(
    search.search({ mode: "impact", path: "named.ts", line: 99 }, root),
    "does not identify",
  );
  await expectFailure(
    search.search({ mode: "impact", path: "anonymous.ts", line: 1 }, root),
    "stable source binding name",
  );
  expect(scans).toBe(0);
  await search.shutdown();
}, 10000);

test("impact pagination preserves target-first order, counts, and unique item indices", async () => {
  const root = await fixture({
    "many.ts": `export function calculate(){ return 1; }\n${Array.from(
      { length: 45 },
      (_, index) => `const value${index} = calculate();`,
    ).join("\n")}\n`,
  });
  const search = service();
  const first = await search.search({ mode: "impact", path: "many.ts", symbol: "calculate" }, root);
  expect(first.details.analysis?.items[0]?.details?.kind).toBe("impact-target");
  const next = first.details.nextRequest;
  if (!next) throw new Error("Missing impact continuation");
  const second = await search.search(next, root);
  expect(second.details.analysis?.counts).toEqual(first.details.analysis?.counts);
  const indices = [
    ...(first.details.analysis?.items.map((item) => item.index) ?? []),
    ...(second.details.analysis?.items.map((item) => item.index) ?? []),
  ];
  const totalItems = first.details.analysis?.totalItems;
  if (totalItems === undefined) throw new Error("Missing impact total");
  expect(new Set(indices).size).toBe(totalItems);
  await search.shutdown();
}, 15000);

test("impact prefers one implemented overload and fails unresolved target ambiguity before scanning", async () => {
  const root = await fixture({
    "overload.ts":
      "export function select(value:string):string;\nexport function select(value:number):number;\nexport function select(value:unknown){ return value; }\n",
    "method-overload.ts":
      "class API { select(value:string):string; select(value:unknown){ return String(value); } }\n",
    "ambiguous.ts":
      "function duplicate(){ return 1; }\nfunction duplicate(value:number){ return value; }\n",
    "unrelated.ts":
      "interface API { select(value:string): string }\nfunction select(value:unknown){ return String(value); }\n",
    "scope-collision.ts":
      "interface API { select(value:string): string }\nclass API { select(value:unknown){ return String(value); } }\n",
    "kind-collision.ts": "interface select {}\nfunction select(){ return 1; }\n",
    "unsupported.go": "package sample\nfunc Select() {}\n",
  });
  const runner = createRipgrepRunner();
  let scans = 0;
  const search = new SignalGrepService({
    runRipgrep: async (...args) => {
      scans++;
      return runner(...args);
    },
  });
  const selected = await search.search(
    { mode: "impact", path: "overload.ts", symbol: "select" },
    root,
  );
  expect(selected.details.analysis?.items[0]?.details?.hasBody).toBe(true);
  expect(scans).toBe(1);
  const selectedMethod = await search.search(
    { mode: "impact", path: "method-overload.ts", symbol: "select" },
    root,
  );
  expect(selectedMethod.details.analysis?.items[0]?.details).toMatchObject({
    hasBody: true,
    scope: "API",
  });
  expect(scans).toBe(2);
  await expectFailure(
    search.search({ mode: "impact", path: "ambiguous.ts", symbol: "duplicate" }, root),
    "ambiguous",
  );
  expect(scans).toBe(2);
  await expectFailure(
    search.search({ mode: "impact", path: "unrelated.ts", symbol: "select" }, root),
    "ambiguous",
  );
  expect(scans).toBe(2);
  await expectFailure(
    search.search({ mode: "impact", path: "scope-collision.ts", symbol: "select" }, root),
    "ambiguous",
  );
  expect(scans).toBe(2);
  await expectFailure(
    search.search({ mode: "impact", path: "kind-collision.ts", symbol: "select" }, root),
    "ambiguous",
  );
  expect(scans).toBe(2);
  await expectFailure(
    search.search({ mode: "impact", path: "unsupported.go", symbol: "Select" }, root),
    "JS/TS/TSX",
  );
  expect(scans).toBe(2);
  await search.shutdown();
}, 15000);

test("impact line targeting chooses the smallest enclosing symbol and bodyless targets skip tests", async () => {
  const root = await fixture({
    "nested.ts":
      "export function outer(){\n  function inner(){\n    return 1;\n  }\n  return inner();\n}\ninterface API { read(value:string): void }\n",
  });
  const search = service();
  const nested = await search.search({ mode: "impact", path: "nested.ts", line: 3 }, root);
  expect(nested.details.analysis?.items[0]?.details?.name).toBe("inner");
  const bodyless = await search.search({ mode: "impact", path: "nested.ts", symbol: "read" }, root);
  expect(bodyless.details.status).toBe("complete");
  expect(bodyless.details.analysis?.items[0]?.details?.hasBody).toBe(false);
  expect(bodyless.details.analysis?.reasons.join(" ")).toContain("no implementation body");
  expect(bodyless.details.analysis?.counts?.testCases).toBe(0);
  await search.shutdown();
}, 15000);

test("public role filter is per occurrence for JS and Go", async () => {
  const root = await fixture({
    "a.ts": "function run(){}; run(); const text='run'; // run\n",
    "b.go": "package example\nfunc Run() {}\nfunc local() { Run() }\n",
  });
  const search = service();
  const declared = await search.search(
    { pattern: "run", literal: true, ignoreCase: false, roles: ["declaration"] },
    root,
  );
  expect(declared.details.analysis?.totalItems).toBe(1);
  const calls = await search.search(
    { pattern: "Run", literal: true, ignoreCase: false, roles: ["call"] },
    root,
  );
  expect(
    calls.details.analysis?.items.some((item) => item.path === "b.go" && item.line === 3),
  ).toBe(true);
  await expectFailure(search.search({ allOf: ["a", "b"], roles: ["call"] }, root), "omit");
  await search.shutdown();
}, 10000);

test("a role-result inspection expands to the verified enclosing implementation", async () => {
  const root = await fixture({
    "a.ts": "function needle(){return 1;} export function calculate(){ return needle(); }\n",
  });
  const search = service();
  const found = await search.search({ pattern: "needle", literal: true, roles: ["call"] }, root);
  const request = found.details.analysis?.items[0]?.inspect;
  if (!request) throw new Error("Missing role inspection request");
  const inspected = await search.search(request, root);
  expect(inspected.text).toContain("function calculate()");
  expect(inspected.text).toContain("return needle();");
  expect(inspected.details.source?.targetRanges?.[0]?.end).toBeGreaterThan("needle".length);
  await search.shutdown();
}, 10000);

test("cursor navigation rejects an unverified snapshot instead of reading a newer file", async () => {
  const root = await fixture({ "a.ts": "export function before(){return 1;}\n" });
  const runner = createRipgrepRunner();
  const search = new SignalGrepService({
    runRipgrep: async (...args) => {
      const scan = await runner(...args);
      scan.sourceRevisions.clear();
      return scan;
    },
  });
  const summary = await search.search({ pattern: "before", mode: "summary" }, root);
  const cursor = summary.details.cursor;
  if (!cursor) throw new Error("Missing snapshot cursor");
  await writeFile(join(root, "a.ts"), "export function after(){return 2;}\n");
  await expectFailure(
    search.search({ mode: "outline", cursor, matchIndex: 1 }, root),
    "unverified",
  );
  await search.shutdown();
}, 10000);

test("outline pages stable version-bound symbols with executable inspection", async () => {
  const root = await fixture({
    "many.ts": Array.from(
      { length: 45 },
      (_, i) => `export function item${i}(){ return ${i}; }`,
    ).join("\n"),
  });
  const search = service();
  const first = await search.search({ mode: "outline", path: "many.ts" }, root);
  expect(first.details.analysis?.totalItems).toBe(45);
  const next = first.details.nextRequest;
  if (!next) throw new Error("Missing next page");
  const second = await search.search(next, root);
  const indices = [
    ...(first.details.analysis?.items ?? []),
    ...(second.details.analysis?.items ?? []),
  ].map((item) => item.index);
  expect(new Set(indices).size).toBe(45);
  const request = first.details.analysis?.items[0]?.inspect;
  if (!request) throw new Error("Missing source selector");
  expect((await search.search(request, root)).details.source?.complete).toBe(true);
  await writeFile(join(root, "many.ts"), "function replacement(){}\n");
  expect((await search.search(request, root)).details.structure?.status).toBe("source-changed");
  await search.shutdown();
}, 10000);

test("changed-lines AND requires every term in the selected side; old source stays historical", async () => {
  const root = await fixture({
    "a.ts": "export function update(){\n authorize();\n persist();\n}\n",
  });
  await git(root, "init", "-q");
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "base");
  await writeFile(join(root, "a.ts"), "export function update(){\n authorize();\n publish();\n}\n");
  const search = service();
  const no = await search.search(
    {
      allOf: ["authorize", "publish"],
      within: "function",
      changes: { scope: "lines", side: "new" },
    },
    root,
  );
  expect(no.details.analysis?.totalItems).toBe(0);
  const old = await search.search(
    { pattern: "persist", literal: true, changes: { scope: "lines", side: "old" } },
    root,
  );
  expect(old.details.analysis?.totalItems).toBe(1);
  const follow = old.details.analysis?.items[0]?.inspect;
  if (!follow) throw new Error("No old-source inspect");
  await writeFile(join(root, "a.ts"), "unrelated worktree\n");
  const historical = await search.search(follow, root);
  expect(historical.text).toContain("persist");
  expect(historical.text).not.toContain("unrelated worktree");
  expect(historical.details.source?.reference?.origin.kind).toBe("git");
  const outline = await search.search({ ...follow, mode: "outline" }, root);
  expect(outline.details.analysis?.items.some((item) => item.label.includes("update"))).toBe(true);
  const imported = await search.search({ ...follow, mode: "imports" }, root);
  expect(imported.details.status).toBe("partial");
  expect(imported.text).toContain("historical sources are not switched");
  await search.shutdown();
}, 15000);

test("public static imports preserve aliases and tests report candidates without coverage claims", async () => {
  const root = await fixture({
    "src/core.ts": "export function calculate(){return 2;}\n",
    "src/barrel.ts": "export {calculate as evaluate} from './core';\n",
    "src/client.ts":
      "import {evaluate as run} from './barrel';\nexport function invoke(){return run();}\n",
    "tests/core.test.ts":
      "import {test as check} from 'node:test';\nimport {calculate as run} from '../src/core';\ncheck('calculates',()=>{run();});\n",
  });
  const search = service();
  const imports = await search.search(
    { mode: "imports", path: "src/client.ts", symbol: "run" },
    root,
  );
  expect(imports.details.status).toBe("complete");
  expect(imports.text).toContain("src/core.ts");
  expect(imports.text).toContain("calculate");
  const tests = await search.search(
    { mode: "tests", path: "src/core.ts", symbol: "calculate" },
    root,
  );
  expect(tests.text).toContain("calculates");
  expect(tests.details.analysis?.counts?.candidateFiles).toBeGreaterThan(0);
  expect(tests.details.analysis?.unit).toBe("evidence-items");
  await search.shutdown();
}, 15000);

test("external repository paths support import, test, and impact navigation", async () => {
  const root = await fixture({
    "src/core.ts": "export function calculate(){return 2;}\n",
    "src/client.ts":
      "import {calculate} from './core';\nexport function invoke(){return calculate();}\n",
    "tests/core.test.ts":
      "import {test} from 'node:test';\nimport {calculate} from '../src/core';\ntest('calculates',()=>{calculate();});\n",
  });
  await git(root, "init", "-q");
  const canonicalRoot = await realpath(root);
  const cwd = join(root, "workspace");
  await mkdir(cwd);
  await symlink("../src/client.ts", join(cwd, "client-link.ts"));
  await symlink("../src/core.ts", join(cwd, "core-link.ts"));
  const search = service();
  const imports = await search.search(
    { mode: "imports", path: "client-link.ts", symbol: "calculate" },
    cwd,
  );
  expect(imports.details.status).toBe("complete");
  expect(imports.text).toContain(join(canonicalRoot, "src/core.ts"));
  const tests = await search.search(
    { mode: "tests", path: "core-link.ts", symbol: "calculate" },
    cwd,
  );
  expect(tests.text).toContain("calculates");
  const impact = await search.search(
    { mode: "impact", path: "core-link.ts", symbol: "calculate" },
    cwd,
  );
  expect(impact.details.analysis?.kind).toBe("impact");
  expect(impact.text).toContain(join(canonicalRoot, "tests/core.test.ts"));
  await expectFailure(
    search.search(
      { pattern: "calculate", path: "../src", changes: { scope: "files", side: "new" } },
      cwd,
    ),
    "Git changes for paths outside cwd are not supported",
  );
  await search.shutdown();
}, 15_000);

test("new operations contribute only complete session facts", async () => {
  const root = await fixture({ "a.ts": "export function a(){ first(); second(); }\n" });
  const runtime = new SignalGrepRuntime(service());
  await runtime.search({ allOf: ["first", "second"] }, root);
  await runtime.search({ mode: "outline", path: "a.ts" }, root);
  expect(runtime.sessionSummary).toEqual({
    queries: 2,
    completeQueries: 2,
    organizedQueries: 0,
  });
  await runtime.shutdown();
}, 10000);
