import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourceAccess, SyntaxQueue } from "../src/source-access.js";
import { SourceContinuations } from "../src/source-continuations.js";
import { continueSource, inspectDocuments } from "../src/source-inspection.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(source: string) {
  const root = await mkdtemp(join(tmpdir(), "signal-source-inspection-"));
  roots.push(root);
  await writeFile(join(root, "code.ts"), source);
  return root;
}

async function expectFailure(pending: Promise<unknown>, message: string): Promise<void> {
  const failure: unknown = await pending.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}

test("actual parser returns a whole long-line implementation without 500-character clipping", async () => {
  const source = `export function calculate() { return '${"x".repeat(1200)}'; }\r\n`;
  const root = await fixture(source);
  const queue = new SyntaxQueue();
  const result = await inspectDocuments(
    [{ path: "code.ts", line: 1 }],
    new SourceAccess(root, queue),
    new SourceContinuations(),
  );
  expect(result.details.structure?.provider).toBe("tree-sitter");
  expect(result.details.source?.complete).toBe(true);
  expect(result.details.source?.fragments?.[0]?.text).toContain("x".repeat(1200));
  expect(result.details.source?.truncatedLines).toEqual([]);
  await queue.shutdown();
}, 10000);

test("batch merges overlapping function ranges before allocating and reads each file once", async () => {
  const source = `function calculate() {\n const a = '${"x".repeat(6000)}';\n return a;\n}\n`;
  const root = await fixture(source);
  const queue = new SyntaxQueue();
  const access = new SourceAccess(root, queue);
  const result = await inspectDocuments(
    [1, 2, 3, 2, 1].map((line) => ({ path: "code.ts", line })),
    access,
    new SourceContinuations(),
  );
  expect(access.filesRead).toBe(1);
  expect(access.bytesRead).toBe(Buffer.byteLength(source));
  expect(result.details.sourceBlocks).toHaveLength(1);
  expect(result.details.sourceBlocks?.[0]?.source.complete).toBe(true);
  expect(result.details.inspections?.every((item) => item.block === 1)).toBe(true);
  expect(result.text.match(/x{6000}/g)).toHaveLength(1);
  expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16384);
  await queue.shutdown();
}, 10000);

test("a small block gives unused shared output capacity to a later large block", async () => {
  const small = "export function small(){return 1;}\n";
  const large = `export function large(){\n${Array.from({ length: 85 }, (_, index) => `const line${index} = "${"x".repeat(120)}";`).join("\n")}\n}`;
  const root = await fixture(small);
  await writeFile(join(root, "large.ts"), large);
  const queue = new SyntaxQueue();
  const result = await inspectDocuments(
    [
      { path: "code.ts", line: 1 },
      { path: "large.ts", line: 20 },
    ],
    new SourceAccess(root, queue),
    new SourceContinuations(),
  );
  expect(result.details.status).toBe("complete");
  expect(result.details.sourceBlocks?.every((block) => block.source.complete)).toBe(true);
  expect(result.text).toContain("function small()");
  expect(result.text).toContain("function large()");
  expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
  await queue.shutdown();
}, 10_000);

test("focused initial source plus replayable missing pages reconstruct exact Unicode CRLF bytes", async () => {
  const source = `function calculate() {\r\n return '${"中😀".repeat(7000)}';\r\n}\r\n`;
  const root = await fixture(source);
  const queue = new SyntaxQueue();
  const continuations = new SourceContinuations();
  const initial = await inspectDocuments(
    [{ path: "code.ts", line: 2, focus: Buffer.byteLength(" return '") + 21000 }],
    new SourceAccess(root, queue),
    continuations,
  );
  const expected = initial.details.source?.targetRanges?.[0];
  if (!expected) throw new Error("Missing target range");
  const fragments = [...(initial.details.source?.fragments ?? [])];
  expect(initial.details.source?.complete).toBe(false);
  const collectPages = async (cursor: string | undefined, pages = 0): Promise<void> => {
    if (!cursor) return;
    if (pages >= 20) throw new Error("Continuation did not terminate");
    const first = await continueSource(cursor, new SourceAccess(root, queue), continuations);
    const replay = await continueSource(cursor, new SourceAccess(root, queue), continuations);
    expect(replay.text).toBe(first.text);
    expect(Buffer.byteLength(first.text)).toBeLessThanOrEqual(16384);
    fragments.push(...(first.details.source?.fragments ?? []));
    await collectPages(first.details.nextRequest?.sourceCursor, pages + 1);
  };
  await collectPages(initial.details.nextRequest?.sourceCursor);
  const ordered = fragments.toSorted((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i++) expect(ordered[i - 1]?.end).toBe(ordered[i]?.start);
  expect(Buffer.from(ordered.map((fragment) => fragment.text).join(""))).toEqual(
    Buffer.from(source).subarray(expected.start, expected.end),
  );
  await queue.shutdown();
}, 10000);

test("continuations refuse changed worktree source and cleared sessions", async () => {
  const root = await fixture(`function a(){return '${"a".repeat(25000)}';}`);
  const queue = new SyntaxQueue();
  const cursors = new SourceContinuations();
  const result = await inspectDocuments(
    [{ path: "code.ts", line: 1 }],
    new SourceAccess(root, queue),
    cursors,
  );
  const cursor = result.details.nextRequest?.sourceCursor;
  if (!cursor) throw new Error("Expected missing source");
  await writeFile(join(root, "code.ts"), "function changed(){}");
  await expectFailure(continueSource(cursor, new SourceAccess(root, queue), cursors), "changed");
  cursors.clear();
  await expectFailure(continueSource(cursor, new SourceAccess(root, queue), cursors), "expired");
  await queue.shutdown();
}, 10000);
