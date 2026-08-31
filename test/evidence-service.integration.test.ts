import { afterEach, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

test("new operations are excluded from ordinary output-byte Metrics", async () => {
  const root = await fixture({ "a.ts": "export function a(){ first(); second(); }\n" });
  const runtime = new SignalGrepRuntime(service());
  runtime.enableMetrics();
  const before = runtime.metricsSnapshot;
  await runtime.search({ allOf: ["first", "second"] }, root);
  await runtime.search({ mode: "outline", path: "a.ts" }, root);
  expect(runtime.metricsSnapshot).toEqual(before);
  await runtime.shutdown();
}, 10000);
