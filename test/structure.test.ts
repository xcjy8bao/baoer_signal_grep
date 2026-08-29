import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CTAGS_CAPABILITY_ARGUMENTS, createCtagsStructureProvider } from "../src/structure.js";
import { readSourceRange } from "../src/source.js";

const fixtures = new Set<string>();

afterEach(async () => {
  await Promise.all([...fixtures].map((path) => rm(path, { recursive: true, force: true })));
  fixtures.clear();
});

async function fixture(): Promise<{ root: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-structure-"));
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

  test("uses capability-validated arguments without an unsupported separator", () => {
    expect(CTAGS_CAPABILITY_ARGUMENTS).toEqual([
      "--output-format=json",
      "--fields=+ne",
      "--extras=-p",
    ]);
    expect(CTAGS_CAPABILITY_ARGUMENTS).not.toContain("--");
  });

  test("inspects a real source file when Universal Ctags is installed", async () => {
    const executable = Bun.which("ctags");
    if (!executable) return;
    const version = Bun.spawnSync([executable, "--version"]);
    const versionText = new TextDecoder().decode(version.stdout);
    if (version.exitCode !== 0 || !/Universal Ctags/i.test(versionText)) return;
    const root = await mkdtemp(join(tmpdir(), "signal-grep-real-ctags-"));
    fixtures.add(root);
    const file = join(root, "main.go");
    await writeFile(file, "package main\nfunc answer() int {\n  return 42\n}\n");
    const provider = createCtagsStructureProvider({ executable });

    const result = await provider.inspect({ absolutePath: file, cwd: root, line: 3 });

    expect(result.details).toMatchObject({
      status: "available",
      provider: "universal-ctags",
      symbol: { name: "answer", range: { startLine: 2, endLine: 4 } },
    });
  }, 10_000);
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
      omittedBefore: 0,
      omittedAfter: 0,
    });
    expect(root).toContain("signal-grep-structure-");
  });

  test("centers an oversized source range on the requested target line", async () => {
    const { file } = await fixture();
    await writeFile(
      file,
      `${Array.from({ length: 1_000 }, (_, index) => `line ${String(index + 1)} ${"x".repeat(100)}`).join("\n")}\n`,
    );

    const result = await readSourceRange(file, 1, 1_000, undefined, 950);

    expect(result.text).toContain("950: line 950");
    expect(result.text).not.toContain("1: line 1 ");
    expect(result.truncated).toBe(true);
    expect(result.omittedBefore).toBeGreaterThan(0);
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
  });
});
