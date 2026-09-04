import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { readGitChanges, readGitSource } from "../src/git-source.js";
import { gitReadEnvironment } from "../src/git-process.js";

async function assertRejects(
  operation: Promise<unknown>,
  expected: string | Record<string, string>,
): Promise<void> {
  let failure: unknown;
  try {
    await operation;
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject(
    typeof expected === "string" ? { message: expect.stringContaining(expected) } : expected,
  );
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    {
      cwd,
      env: { ...gitReadEnvironment(), GIT_CONFIG_NOSYSTEM: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

async function fixture(action: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "baoer_signal_grep-git-"));
  try {
    git(cwd, "init", "-q");
    await writeFile(join(cwd, ".gitignore"), "ignored.txt\nAGENTS.md\nsecret*\n");
    await writeFile(join(cwd, "source.ts"), "first\nmiddle\nlast\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "fixture baseline");
    await action(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

describe("read-only Git sources", () => {
  test(
    "rejects corrupted object bytes instead of assigning the requested blob identity",
    () =>
      fixture(async (cwd) => {
        const blob = git(cwd, "rev-parse", "HEAD:source.ts");
        const object = join(cwd, ".git", "objects", blob.slice(0, 2), blob.slice(2));
        const corrupted = Buffer.from("FIRST\nmiddle\nlast\n");
        await chmod(object, 0o644);
        await writeFile(
          object,
          deflateSync(
            Buffer.concat([Buffer.from(`blob ${String(corrupted.length)}\0`), corrupted]),
          ),
        );
        await assertRejects(
          readGitSource(cwd, { commit: "HEAD", path: "source.ts" }),
          "immutable object identity",
        );
      }),
    10_000,
  );
  test(
    "compares final disk contents with HEAD rather than the staged snapshot",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "source.ts"), "staged\nmiddle\nlast\n");
        git(cwd, "add", "source.ts");
        await writeFile(join(cwd, "source.ts"), "disk\nmiddle\nlast\n");
        const index = await readFile(join(cwd, ".git", "index"));
        const result = await readGitChanges(cwd, { scope: "lines", side: "new" });
        expect(result.partial).toBe(false);
        expect(result.files).toHaveLength(1);
        expect(result.files[0]?.content?.toString()).toBe("disk\nmiddle\nlast\n");
        expect(result.files[0]?.ranges).toEqual([{ startLine: 1, endLine: 1 }]);
        expect(result.files[0]?.origin?.kind).toBe("worktree");
        expect(await readFile(join(cwd, ".git", "index"))).toEqual(index);
        const old = await readGitChanges(cwd, { scope: "lines", side: "old" });
        expect(old.files[0]?.content?.toString()).toBe("first\nmiddle\nlast\n");
      }),
    10_000,
  );

  test(
    "includes untracked special paths while respecting current privacy rules for tracked history",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "AGENTS.md"), "private historical text\n");
        git(cwd, "add", "-f", "AGENTS.md");
        git(cwd, "commit", "-qm", "historical ignored file");
        const special = process.platform === "win32" ? "-new file.ts" : "-new\nfile\t.ts";
        await writeFile(join(cwd, special), "new evidence\n");
        await writeFile(join(cwd, "ignored.txt"), "ignored evidence\n");
        await writeFile(join(cwd, "AGENTS.md"), "changed private text\n");
        const result = await readGitChanges(cwd, { scope: "files", side: "new" });
        expect(result.files.map((file) => file.path)).toEqual([special]);
        expect(result.files[0]?.change).toBe("added");
        await assertRejects(readGitSource(cwd, { commit: "HEAD", path: "AGENTS.md" }), "privacy");
      }),
    10_000,
  );

  test(
    "recognizes exact renames without inventing changed lines and retains deleted-side evidence",
    () =>
      fixture(async (cwd) => {
        await rename(join(cwd, "source.ts"), join(cwd, "renamed.ts"));
        const result = await readGitChanges(cwd, { scope: "lines", side: "new" });
        expect(result.files).toHaveLength(1);
        expect(result.files[0]).toMatchObject({
          change: "renamed",
          oldPath: "source.ts",
          newPath: "renamed.ts",
          ranges: [],
          rename: { method: "identical-content", similarity: 100 },
        });
        const old = await readGitChanges(cwd, { scope: "files", side: "old" });
        expect(old.files[0]?.path).toBe("source.ts");
        await rm(join(cwd, "renamed.ts"));
        const deleted = await readGitChanges(cwd, { scope: "lines", side: "old" });
        expect(deleted.files[0]).toMatchObject({
          change: "deleted",
          ranges: [{ startLine: 1, endLine: 3 }],
        });
      }),
    10_000,
  );

  test(
    "labels modified rename heuristics and does not arbitrarily pair ambiguous sources",
    () =>
      fixture(async (cwd) => {
        await rename(join(cwd, "source.ts"), join(cwd, "renamed.ts"));
        await writeFile(join(cwd, "renamed.ts"), "first\nmiddle\nchanged\n");
        const result = await readGitChanges(cwd, { scope: "lines", side: "new" });
        expect(result.files[0]?.rename?.method).toBe("line-similarity");
        expect(result.files[0]?.ranges).toEqual([{ startLine: 3, endLine: 3 }]);
        await writeFile(join(cwd, "another.ts"), "first\nmiddle\nchanged\n");
        const ambiguous = await readGitChanges(cwd, { scope: "files", side: "new" });
        expect(ambiguous.files.some((file) => file.change === "renamed")).toBe(false);
        expect(ambiguous.reasons.join(" ")).toContain("Ambiguous");
      }),
    10_000,
  );

  test(
    "binds historical sources to immutable commits and checks blob/path membership",
    () =>
      fixture(async (cwd) => {
        const base = git(cwd, "rev-parse", "HEAD");
        await writeFile(join(cwd, "source.ts"), "committed\nmiddle\nlast\n");
        git(cwd, "add", ".");
        git(cwd, "commit", "-qm", "target");
        const result = await readGitChanges(cwd, {
          base,
          target: "HEAD",
          scope: "lines",
          side: "new",
        });
        const source = result.files[0];
        expect(source?.origin?.kind).toBe("git");
        if (source?.origin?.kind !== "git") throw new Error("Missing historical identity");
        await writeFile(join(cwd, "source.ts"), "later disk\n");
        const read = await readGitSource(cwd, { path: source.path, ...source.origin });
        expect(read.content?.toString()).toBe("committed\nmiddle\nlast\n");
        await assertRejects(
          readGitSource(cwd, {
            path: source.path,
            commit: source.origin.commit,
            blob: "0".repeat(40),
          }),
          "does not match",
        );
        await assertRejects(
          readGitSource(cwd, { path: "../outside", commit: base }),
          "working directory",
        );
      }),
    10_000,
  );

  test(
    "confines subdirectory searches and makes binary and resource limitations explicit",
    () =>
      fixture(async (cwd) => {
        await mkdir(join(cwd, "sub"));
        await writeFile(join(cwd, "sub", "nested.ts"), "nested\n");
        await writeFile(join(cwd, "binary.bin"), Buffer.from([1, 0, 2]));
        await writeFile(join(cwd, "source.ts"), "modified\n");
        const nested = await readGitChanges(join(cwd, "sub"), { scope: "files", side: "new" });
        expect(nested.files.map((file) => file.path)).toEqual(["nested.ts"]);
        const result = await readGitChanges(cwd, { scope: "files", side: "new" });
        expect(result.files.find((file) => file.path === "binary.bin")).toMatchObject({
          sourceStatus: "binary",
          change: "added",
        });
        const limited = await readGitChanges(cwd, { scope: "lines", side: "new" }, undefined, {
          maxFiles: 1,
        });
        expect(limited.partial).toBe(true);
        expect(limited.omittedFiles).toBeGreaterThan(0);
        const diffLimited = await readGitChanges(cwd, { scope: "lines", side: "new" }, undefined, {
          maxDiffWork: 1,
        });
        expect(diffLimited.partial).toBe(true);
        expect(diffLimited.reasons.join(" ")).toContain("step limit");
      }),
    10_000,
  );

  test.skipIf(process.platform === "win32")(
    "does not execute configured helpers or follow symlinks",
    () =>
      fixture(async (cwd) => {
        const marker = join(cwd, "helper-ran");
        const helper = join(cwd, "helper.sh");
        await writeFile(helper, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
        await chmod(helper, 0o755);
        git(cwd, "config", "core.fsmonitor", helper);
        git(cwd, "config", "diff.external", helper);
        git(cwd, "config", "diff.fixture.textconv", helper);
        git(cwd, "config", "filter.fixture.clean", helper);
        git(cwd, "config", "filter.fixture.smudge", helper);
        git(cwd, "config", "filter.fixture.process", helper);
        await writeFile(join(cwd, ".gitattributes"), "*.ts filter=fixture diff=fixture\n");
        await writeFile(join(cwd, "source.ts"), "changed\n");
        await symlink(join(cwd, "source.ts"), join(cwd, "linked.ts"));
        const result = await readGitChanges(cwd, { scope: "files", side: "new" });
        expect(result.files.find((file) => file.path === "source.ts")?.content?.toString()).toBe(
          "changed\n",
        );
        expect(result.files.find((file) => file.path === "linked.ts")?.sourceStatus).toBe(
          "symlink",
        );
        await assertRejects(readFile(marker), { code: "ENOENT" });
      }),
    10_000,
  );

  test(
    "fails clearly for invalid refs, missing HEAD and cancellation",
    () =>
      fixture(async (cwd) => {
        await assertRejects(
          readGitChanges(cwd, { base: "--malicious-option", scope: "files", side: "new" }),
          "Git rev-parse failed",
        );
        await assertRejects(
          readGitChanges(cwd, { target: "HEAD", scope: "files", side: "new" }),
          "explicit base",
        );
        await assertRejects(
          readGitChanges(cwd, { scope: "files", side: "new" }, AbortSignal.abort()),
          { name: "AbortError" },
        );
        const empty = join(cwd, "empty");
        await mkdir(empty);
        git(empty, "init", "-q");
        await assertRejects(
          readGitChanges(empty, { scope: "files", side: "new" }),
          "Git rev-parse failed",
        );
      }),
    10_000,
  );

  test.skipIf(process.platform === "win32")(
    "never lazily fetches a missing promisor object",
    () =>
      fixture(async (cwd) => {
        const blob = git(cwd, "rev-parse", "HEAD:source.ts");
        const marker = join(cwd, "fetch-ran");
        const helper = join(cwd, "fetch.sh");
        await writeFile(helper, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
        await chmod(helper, 0o755);
        git(cwd, "config", "remote.fixture.url", `ext::${helper}`);
        git(cwd, "config", "remote.fixture.promisor", "true");
        git(cwd, "config", "extensions.partialClone", "fixture");
        git(cwd, "config", "protocol.ext.allow", "always");
        await rm(join(cwd, ".git", "objects", blob.slice(0, 2), blob.slice(2)));
        await assertRejects(readGitChanges(cwd, { scope: "files", side: "new" }), "Git");
        await assertRejects(readFile(marker), { code: "ENOENT" });
      }),
    10_000,
  );

  test.skipIf(process.platform === "win32")(
    "detects source mutation after reading but before the comparison finishes",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "z.ts"), "last source\n");
        git(cwd, "add", "z.ts");
        git(cwd, "commit", "-qm", "second source");
        const zBlob = git(cwd, "rev-parse", "HEAD:z.ts");
        await writeFile(join(cwd, "source.ts"), "changed first\n");
        await writeFile(join(cwd, "z.ts"), "changed last\n");
        const wrapperDirectory = join(cwd, "secret-wrapper");
        await mkdir(wrapperDirectory);
        const realGit = Bun.which("git");
        if (!realGit) throw new Error("Git executable unavailable");
        const wrapper = join(wrapperDirectory, "git");
        await writeFile(
          wrapper,
          `#!/bin/sh\ncase "$*" in *'cat-file blob ${zBlob}'*) printf 'changed during comparison\\n' > '${join(cwd, "source.ts")}' ;; esac\nexec '${realGit}' "$@"\n`,
        );
        await chmod(wrapper, 0o755);
        const script = `import {readGitChanges} from ${JSON.stringify(new URL("../src/git-source.ts", import.meta.url).href)}; try { await readGitChanges(${JSON.stringify(cwd)}, {scope:'files',side:'new'}); process.stdout.write('unexpected success'); } catch(error) { process.stdout.write(error.message); }`;
        const output = execFileSync(process.execPath, ["-e", script], {
          cwd,
          env: { ...gitReadEnvironment(), PATH: `${wrapperDirectory}:${process.env.PATH ?? ""}` },
          encoding: "utf8",
          timeout: 8000,
        });
        expect(output).toContain("Working source changed during Git comparison");
      }),
    10_000,
  );
});
