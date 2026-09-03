import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGitRead, supportsNoLazyFetch } from "../src/git-process.js";

async function fakeGit(version: string, partial: boolean) {
  const root = await mkdtemp(join(tmpdir(), "signal-git-capability-"));
  const executable = join(root, "git");
  const log = join(root, "calls.log");
  await writeFile(
    executable,
    `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
if [ "$1" = "--version" ]; then
  printf '%s\\n' ${JSON.stringify(version)}
  exit 0
fi
case " $* " in
  *" config "*) exit ${partial ? "0" : "1"} ;;
esac
printf '%s\\n' '.git'
`,
  );
  await chmod(executable, 0o755);
  return { root, executable, log };
}

describe("Git read capability", () => {
  test("recognizes the 2.45 no-lazy-fetch boundary", () => {
    expect(supportsNoLazyFetch("git version 2.34.1")).toBe(false);
    expect(supportsNoLazyFetch("git version 2.44.9 (Apple Git-999)")).toBe(false);
    expect(supportsNoLazyFetch("git version 2.45.0")).toBe(true);
    expect(supportsNoLazyFetch("git version 3.0.0")).toBe(true);
  });

  test("rejects an unrecognized version instead of assuming safe capability", () => {
    expect(() => supportsNoLazyFetch("unknown git")).toThrow("unrecognized version");
  });

  test.skipIf(process.platform === "win32")(
    "uses old Git for full repositories without passing an unknown option",
    async () => {
      const fixture = await fakeGit("git version 2.34.1", false);
      try {
        const result = await runGitRead(fixture.root, "rev-parse", ["--git-dir"], {
          executable: fixture.executable,
        });
        expect(result.output.toString()).toBe(".git\n");
        const calls = await readFile(fixture.log, "utf8");
        expect(calls).toContain(" config ");
        expect(calls).not.toContain("--no-lazy-fetch");
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  test.skipIf(process.platform === "win32")(
    "keeps non-fetching reads on modern Git and rejects old partial clones",
    async () => {
      const modern = await fakeGit("git version 2.45.0", false);
      const partial = await fakeGit("git version 2.34.1", true);
      try {
        await runGitRead(modern.root, "rev-parse", ["--git-dir"], {
          executable: modern.executable,
        });
        expect(await readFile(modern.log, "utf8")).toContain("--no-lazy-fetch");
        expect(
          runGitRead(partial.root, "rev-parse", ["--git-dir"], {
            executable: partial.executable,
          }),
        ).rejects.toThrow("Git 2.45 or newer");
      } finally {
        await Promise.all(
          [modern.root, partial.root].map((root) => rm(root, { recursive: true, force: true })),
        );
      }
    },
  );
});
