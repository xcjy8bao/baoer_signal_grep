import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourceDocument, readWorkspaceDocument } from "../src/source-document.js";
import { SourceContinuations } from "../src/source-continuations.js";
import { mergeByteRanges, sourcePage } from "../src/source-pages.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function document(text: string): SourceDocument {
  return new SourceDocument(
    { path: "fixture.ts", origin: { kind: "git", commit: "commit", blob: "blob" } },
    Buffer.from(text),
  );
}

async function expectFailure(pending: Promise<unknown>, message: string): Promise<void> {
  const failure: unknown = await pending.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}

describe("verified source documents", () => {
  test("maps UTF-16 parser offsets to original UTF-8 bytes without normalizing CRLF or BOM", () => {
    const text = "\ufeff/*界😀*/\r\nconst café = '值';\r\n";
    const source = document(text);
    const character = text.indexOf("const");
    const byte = Buffer.byteLength(text.slice(0, character));
    expect(source.toByteOffset(character)).toBe(byte);
    expect(source.toCharacterOffset(byte)).toBe(character);
    expect(source.positionAt(byte)).toEqual({ line: 2, column: 1 });
    expect(source.slice({ start: 0, end: source.bytes.length })).toBe(text);
    expect(() => source.toByteOffset(text.indexOf("😀") + 1)).toThrow("splits");
    expect(() => source.toCharacterOffset(1)).toThrow("splits");
  });

  test("binds a bounded file read to its revision and content, rejecting stale references", async () => {
    const root = await mkdtemp(join(tmpdir(), "signal-grep-document-"));
    roots.push(root);
    await writeFile(join(root, "example.ts"), "export const value = 1;\n");
    const first = await readWorkspaceDocument("example.ts", root);
    expect(
      (await readWorkspaceDocument("example.ts", root, undefined, first.reference.origin)).text,
    ).toBe(first.text);
    await writeFile(join(root, "example.ts"), "export const value = 2;\n");
    await expectFailure(
      readWorkspaceDocument("example.ts", root, undefined, first.reference.origin),
      "changed",
    );
    await expectFailure(readWorkspaceDocument("../outside.ts", root), "stay in cwd");
    const aborted: unknown = await readWorkspaceDocument(
      "example.ts",
      root,
      AbortSignal.abort(),
    ).catch((error: unknown) => error);
    expect(aborted).toBeInstanceOf(Error);
    expect(aborted).toMatchObject({ name: "AbortError" });
  });

  test("does not call lossy decoding complete source", () => {
    const source = new SourceDocument(
      { path: "bad.ts", origin: { kind: "git", commit: "commit", blob: "blob" } },
      Buffer.from([0xff, 0x61]),
    );
    expect(source.utf8).toBe(false);
    expect(() => source.slice({ start: 0, end: 2 })).toThrow("UTF-8");
  });
});

describe("source range pagination", () => {
  test("returns a 1200-character single-line function without the preview's 500-character clipping", () => {
    const text = `function value() { return '${"x".repeat(1200)}'; }`;
    const source = document(text);
    const page = sourcePage(source, [{ start: 0, end: source.bytes.length }], 16000);
    expect(page.fragment.text).toBe(text);
    expect(page.remaining).toEqual([]);
  });

  test("reconstructs original Unicode source from focused initial evidence and replayable missing-range pages", () => {
    const text = `\ufefffunction value() { return '${"界😀\r\n".repeat(1000)}'; }\n`;
    const source = document(text);
    const target = { start: 0, end: source.bytes.length };
    const first = sourcePage(source, [target], 600, source.toByteOffset(text.indexOf("界", 1200)));
    const fragments = [first.fragment];
    const store = new SourceContinuations();
    let cursor: string | undefined = store.create(source.reference, [target], first.remaining);
    let pages = 0;
    while (cursor) {
      expect(pages++).toBeLessThan(100);
      const selection = store.resolve(cursor);
      const page = sourcePage(source, selection.remaining, 600);
      expect(sourcePage(source, store.resolve(cursor).remaining, 600)).toEqual(page);
      expect(Buffer.byteLength(page.text)).toBeLessThanOrEqual(600);
      fragments.push(page.fragment);
      cursor = store.advance(cursor, page.fragment);
    }
    const ordered = fragments.toSorted((a, b) => a.start - b.start);
    expect(ordered.map((fragment) => fragment.text).join("")).toBe(text);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]?.start).toBe(ordered[index - 1]?.end);
    }
    expect(mergeByteRanges(ordered)).toEqual([target]);
  });

  test("expires metadata and rejects the wrong cursor family or out-of-order advancement", () => {
    let now = 0;
    const source = document("abcde");
    const store = new SourceContinuations(() => now);
    const cursor = store.create(source.reference, [{ start: 0, end: 5 }], [{ start: 1, end: 5 }]);
    expect(() => store.advance(cursor, { start: 2, end: 3 })).toThrow("next missing");
    expect(() => store.resolve("other.matches.0.all")).toThrow("Invalid");
    now = 600001;
    expect(() => store.resolve(cursor)).toThrow("expired");
  });

  test("rejects a forged in-range continuation offset", () => {
    const source = document("abcdefghij");
    const store = new SourceContinuations();
    const cursor = store.create(source.reference, [{ start: 0, end: 10 }], [{ start: 0, end: 10 }]);
    const forged = cursor.replace(/\.0$/, ".1");
    expect(() => store.resolve(forged)).toThrow("outside its missing ranges");
  });
});
