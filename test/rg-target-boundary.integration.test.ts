import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeRequest } from "../src/request.js";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";

const roots = new Set<string>();

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "baoer_signal_grep-target-boundary-"));
  roots.add(root);
  return root;
}

describe("resolved search target and excerpt boundaries", () => {
  test.skipIf(process.platform === "win32")(
    "rejects a symbolic link into Git internals but preserves ordinary in-workspace links",
    async () => {
      const root = await fixture();
      await mkdir(join(root, ".git"));
      await writeFile(join(root, ".git", "config"), "needle internal\n");
      await writeFile(join(root, "source.ts"), "needle ordinary\n");
      await symlink(".git/config", join(root, "git-alias.txt"));
      await symlink("source.ts", join(root, "source-alias.ts"));
      const runner = createRipgrepRunner();
      let failure: unknown;
      try {
        await runner(normalizeRequest({ pattern: "needle", path: "git-alias.txt" }), root);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ message: "Git internals are excluded from search" });
      const scan = await runner(
        normalizeRequest({ pattern: "needle", path: "source-alias.ts" }),
        root,
      );
      expect(scan.totalMatches).toBe(1);
      expect(scan.matches[0]?.lineContent).toBe("needle ordinary");
      expect(scan.sourceRevisions.size).toBe(1);
    },
    10_000,
  );

  test("rejects a case alias when it resolves to the actual Git directory", async () => {
    const root = await fixture();
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git", "config"), "needle internal\n");
    const alias = join(root, ".GIT", "config");
    try {
      await realpath(alias);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    let failure: unknown;
    try {
      await createRipgrepRunner()(normalizeRequest({ pattern: "needle", path: alias }), root);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ message: "Git internals are excluded from search" });
  }, 10_000);

  test("centers non-UTF-8 long lines using decoded prefixes while retaining raw byte ranges", async () => {
    const root = await fixture();
    await writeFile(
      join(root, "invalid.txt"),
      Buffer.concat([
        Buffer.from([0xff]),
        Buffer.from(`${"界".repeat(1_000)}\rneedle${"x".repeat(1_000)}\n`),
      ]),
    );
    const runner = createRipgrepRunner();
    const scan = await runner(normalizeRequest({ pattern: "needle", path: "invalid.txt" }), root);
    const match = scan.matches[0];
    expect(scan.totalMatches).toBe(1);
    expect(match?.lineContent).toContain("needle");
    expect(match?.occurrences[0]).toEqual({
      byteStart: 3_002,
      byteEnd: 3_008,
      range: {
        encoding: "utf-8",
        start: { line: 0, character: 3_002 },
        end: { line: 0, character: 3_008 },
      },
    });
    const result = await new SignalGrepService({ runRipgrep: runner }).search(
      { pattern: "needle", path: "invalid.txt", mode: "matches" },
      root,
    );
    expect(result.text).toContain("needle");
    expect(result.text).toContain("3003-3008b");
    expect(result.text).toContain("{match #1}");
    expect(result.details.status).toBe("complete");
  }, 10_000);
});
