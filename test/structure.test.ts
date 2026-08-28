import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createCtagsStructureProvider } from "../src/structure.js";
import { readSourceRange } from "../src/source.js";

const fixtures = new Set<string>();

afterEach(async () => {
  await Promise.all([...fixtures].map((path) => rm(path, { recursive: true, force: true })));
  fixtures.clear();
});

async function fixture(): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "signal-grep-structure-"));
  fixtures.add(root);
  const file = join(root, "client.ts");
  await writeFile(
    file,
    [
      "export class Client {",
      "  request(url: string) {",
      "    return this.send(url);",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
  return { root, file };
}

describe("Universal Ctags structure provider", () => {
  test("selects the smallest enclosing symbol", async () => {
    const { root, file } = await fixture();
    const provider = createCtagsStructureProvider({
      runCtags: async () => [
        { path: file, name: "Client", kind: "class", language: "TypeScript", line: 1, end: 5 },
        {
          path: file,
          name: "request",
          kind: "method",
          language: "TypeScript",
          scope: "Client",
          line: 2,
          end: 4,
        },
      ],
    });

    const result = await provider.inspect({ absolutePath: file, cwd: root, line: 3 });
    expect(result.details).toEqual({
      status: "available",
      provider: "universal-ctags",
      language: "TypeScript",
      symbol: {
        name: "request",
        kind: "method",
        scope: ["Client"],
        range: { startLine: 2, endLine: 4 },
      },
      range: { startLine: 2, endLine: 4 },
    });
  });

  test("reports a missing provider without failing the search contract", async () => {
    const { root, file } = await fixture();
    const provider = createCtagsStructureProvider({ executable: join(root, "missing-ctags") });
    const result = await provider.inspect({ absolutePath: file, cwd: root, line: 3 });
    expect(result.details).toEqual({ status: "provider-unavailable", provider: "universal-ctags" });
  });

  test("rejects inspection against a changed source revision", async () => {
    const { root, file } = await fixture();
    const before = await stat(file);
    await writeFile(file, "export class Changed {}\n");
    const provider = createCtagsStructureProvider({ runCtags: async () => [] });
    const result = await provider.inspect({
      absolutePath: file,
      cwd: root,
      line: 1,
      expectedRevision: { size: before.size, mtimeMs: before.mtimeMs },
    });
    expect(result.details.status).toBe("source-changed");
  });
});

describe("readSourceRange", () => {
  test("rejects a source line beyond the end of a file", async () => {
    const { file } = await fixture();
    let failure: unknown;
    try {
      await readSourceRange(file, 100, 110);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ message: "Source line 100 is beyond the end of the file" });
  });

  test("reports the requested target line when a bounded range is beyond EOF", async () => {
    const { file } = await fixture();
    let failure: unknown;
    try {
      await readSourceRange(file, 9_989, 10_009, undefined, 9_999);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ message: "Source line 9999 is beyond the end of the file" });
  });

  test("returns a numbered bounded source block", async () => {
    const { root, file } = await fixture();
    const result = await readSourceRange(file, 2, 4);
    expect(result).toEqual({
      text: "2:   request(url: string) {\n3:     return this.send(url);\n4:   }",
      startLine: 2,
      endLine: 4,
      truncated: false,
    });
    expect(root).toContain("signal-grep-structure-");
  });
});
