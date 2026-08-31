import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { collectEvidenceCandidates } from "../src/evidence-candidates.js";
import { readGitSource } from "../src/git-source.js";
import { gitReadEnvironment } from "../src/git-process.js";
import { normalizeRequest } from "../src/request.js";
import { createRipgrepRunner } from "../src/rg.js";
import { readWorkspaceDocument } from "../src/source-document.js";
import { listWorkspaceFiles } from "../src/workspace-files.js";

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
      encoding: "utf8",
      env: { ...gitReadEnvironment(), GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

async function fixture(action: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "signal-grep-candidates-"));
  try {
    git(cwd, "init", "-q");
    await writeFile(join(cwd, "source.ts"), "foo initial\nbar unchanged\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "baseline");
    await action(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function access(cwd: string) {
  return { load: (path: string) => readWorkspaceDocument(path, cwd) };
}

describe("verified source query candidates", () => {
  test(
    "uses one ordinary scan and maps BOM, Unicode and CRLF to raw bytes",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "source.ts"), Buffer.from("\uFEFFαfoo\r\nβfoo\n"));
        const runner = createRipgrepRunner();
        let scans = 0;
        const result = await collectEvidenceCandidates({
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "foo", literal: true }),
          runRipgrep: (...args) => {
            scans += 1;
            return runner(...args);
          },
        });
        expect(scans).toBe(1);
        expect(result.partial).toBe(false);
        expect(result.files[0]?.occurrences).toEqual([
          { start: 5, end: 8 },
          { start: 12, end: 15 },
        ]);
        expect(result.files[0]?.document.bytes.subarray(5, 8).toString()).toBe("foo");
      }),
    10_000,
  );

  test(
    "never binds matches to a later workspace revision",
    () =>
      fixture(async (cwd) => {
        const runner = createRipgrepRunner();
        const result = await collectEvidenceCandidates({
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "foo" }),
          runRipgrep: async (...args) => {
            const scan = await runner(...args);
            await writeFile(join(cwd, "source.ts"), "changed after search\n");
            return scan;
          },
        });
        expect(result.files).toEqual([]);
        expect(result.partial).toBe(true);
        expect(result.reasons.join(" ")).toContain("Source changed");
      }),
    10_000,
  );

  test(
    "runs real regex matching on fixed Git source and intersects only changed lines",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "source.ts"), "foo changed\nbar unchanged\n");
        const options = {
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "f.o|bar", ignoreCase: false }),
          runRipgrep: createRipgrepRunner(),
        };
        const lines = await collectEvidenceCandidates({
          ...options,
          changes: { scope: "lines", side: "new" },
        });
        expect(lines.partial).toBe(false);
        expect(lines.files).toHaveLength(1);
        expect(lines.files[0]?.occurrences).toEqual([{ start: 0, end: 3 }]);
        expect(lines.files[0]?.changedRanges).toEqual([{ start: 0, end: 12 }]);
        const whole = await collectEvidenceCandidates({
          ...options,
          changes: { scope: "files", side: "new" },
        });
        expect(whole.files[0]?.occurrences).toHaveLength(2);
        const zero = await collectEvidenceCandidates({
          ...options,
          request: normalizeRequest({ pattern: "^" }),
          changes: { scope: "lines", side: "new" },
        });
        expect(zero.files[0]?.occurrences).toEqual([{ start: 0, end: 0 }]);
      }),
    10_000,
  );

  test(
    "raw Git stdin matching preserves UTF-8 BOM offsets",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "bom.ts"), "\uFEFFfoo\n");
        const result = await collectEvidenceCandidates({
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "foo", literal: true }),
          runRipgrep: createRipgrepRunner(),
          changes: { scope: "files", side: "new" },
        });
        expect(result.files.find((file) => file.document.path === "bom.ts")?.occurrences).toEqual([
          { start: 3, end: 6 },
        ]);
      }),
    10_000,
  );

  test(
    "current .ignore/.rgignore privacy excludes deleted history even with positive globs",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "private.ts"), "foo private\n");
        await writeFile(join(cwd, "hidden.ts"), "foo hidden\n");
        git(cwd, "add", ".");
        git(cwd, "commit", "-qm", "historical files");
        await rm(join(cwd, "private.ts"));
        await rm(join(cwd, "hidden.ts"));
        await rm(join(cwd, "source.ts"));
        await writeFile(join(cwd, ".rgignore"), "private.ts\n");
        await writeFile(join(cwd, ".ignore"), "hidden.ts\n");
        const result = await collectEvidenceCandidates({
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "foo", glob: "*.ts" }),
          runRipgrep: createRipgrepRunner(),
          changes: { scope: "files", side: "old" },
        });
        expect(result.partial).toBe(false);
        expect(result.files.map((file) => file.document.path)).toEqual(["source.ts"]);
        let blocked: unknown;
        try {
          await readGitSource(cwd, { commit: "HEAD", path: "private.ts" });
        } catch (error) {
          blocked = error;
        }
        expect(blocked).toBeInstanceOf(Error);
      }),
    10_000,
  );

  test(
    "historical glob braces, exclusions and hidden rules use ripgrep's path semantics",
    () =>
      fixture(async (cwd) => {
        await mkdir(join(cwd, "sub"));
        await Promise.all(
          ["a1.ts", "a2.go", "a3.ts", ".hidden.ts"].map((name) =>
            writeFile(join(cwd, "sub", name), "foo\n"),
          ),
        );
        git(cwd, "add", ".");
        git(cwd, "commit", "-qm", "glob paths");
        await rm(join(cwd, "sub"), { recursive: true });
        const result = await collectEvidenceCandidates({
          cwd,
          access: access(cwd),
          request: normalizeRequest({
            pattern: "foo",
            path: "sub",
            glob: "**/a[12].{ts,go}",
            exclude: "**/*.go",
          }),
          runRipgrep: createRipgrepRunner(),
          changes: { scope: "files", side: "old" },
        });
        expect(result.files.map((file) => file.document.path)).toEqual(["sub/a1.ts"]);
        const hidden = await collectEvidenceCandidates({
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "foo", path: "sub", hidden: false }),
          runRipgrep: createRipgrepRunner(),
          changes: { scope: "files", side: "old" },
        });
        expect(hidden.files.some((file) => file.document.path.includes(".hidden"))).toBe(false);
      }),
    10_000,
  );

  test(
    "bounded file enumeration excludes Git internals and preserves meaningful hidden paths",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, ".visible"), "foo\n");
        await writeFile(join(cwd, ".ignore"), "excluded.ts\n");
        await writeFile(join(cwd, "excluded.ts"), "foo\n");
        const names = await listWorkspaceFiles(cwd);
        expect(names.paths).toContain(".visible");
        expect(names.paths).not.toContain("excluded.ts");
        expect(names.paths.some((path) => path.startsWith(".git/"))).toBe(false);
        const limited = await listWorkspaceFiles(cwd, undefined, { maxFiles: 1 });
        expect(limited.paths).toHaveLength(1);
        expect(limited.partial).toBe(true);
      }),
    10_000,
  );

  test(
    "inherits current parent ignore rules for deleted nested-repository files",
    () =>
      fixture(async (cwd) => {
        const nested = join(cwd, "inner");
        await mkdir(nested);
        git(nested, "init", "-q");
        await writeFile(join(nested, "allowed.ts"), "foo\n");
        await writeFile(join(nested, "private.ts"), "foo\n");
        git(nested, "add", ".");
        git(nested, "commit", "-qm", "nested baseline");
        await writeFile(join(cwd, ".ignore"), "/inner/private.ts\n");
        expect((await listWorkspaceFiles(nested)).paths).not.toContain("private.ts");
        await rm(join(nested, "allowed.ts"));
        await rm(join(nested, "private.ts"));
        const result = await collectEvidenceCandidates({
          cwd: nested,
          access: access(nested),
          request: normalizeRequest({ pattern: "foo" }),
          runRipgrep: createRipgrepRunner(),
          changes: { scope: "files", side: "old" },
        });
        expect(result.files.map((file) => file.document.path)).toEqual(["allowed.ts"]);
      }),
    10_000,
  );

  test(
    "supports historical file-to-directory path changes without losing either side",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "shape"), "foo old\n");
        git(cwd, "add", ".");
        git(cwd, "commit", "-qm", "old shape");
        const base = git(cwd, "rev-parse", "HEAD");
        await rm(join(cwd, "shape"));
        await mkdir(join(cwd, "shape"));
        await writeFile(join(cwd, "shape", "nested.ts"), "foo new\n");
        git(cwd, "add", ".");
        git(cwd, "commit", "-qm", "new shape");
        const options = {
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "foo", glob: "**" }),
          runRipgrep: createRipgrepRunner(),
        };
        const old = await collectEvidenceCandidates({
          ...options,
          changes: { base, target: "HEAD", scope: "files", side: "old" },
        });
        const fresh = await collectEvidenceCandidates({
          ...options,
          changes: { base, target: "HEAD", scope: "files", side: "new" },
        });
        expect(old.files.map((file) => file.document.path)).toEqual(["shape"]);
        expect(fresh.files.map((file) => file.document.path)).toEqual(["shape/nested.ts"]);
      }),
    10_000,
  );

  test(
    "rejects invalid regex and explicitly limits transcoded raw offsets",
    () =>
      fixture(async (cwd) => {
        await writeFile(join(cwd, "source.ts"), "changed\n");
        let invalid: unknown;
        try {
          await collectEvidenceCandidates({
            cwd,
            access: access(cwd),
            request: normalizeRequest({ pattern: "(" }),
            runRipgrep: createRipgrepRunner(),
            changes: { scope: "files", side: "new" },
          });
        } catch (error) {
          invalid = error;
        }
        expect(invalid).toBeInstanceOf(Error);
        await writeFile(
          join(cwd, "utf16.ts"),
          Buffer.concat([Buffer.from([255, 254]), Buffer.from("foo\n", "utf16le")]),
        );
        const result = await collectEvidenceCandidates({
          cwd,
          access: access(cwd),
          request: normalizeRequest({ pattern: "foo" }),
          runRipgrep: createRipgrepRunner(),
        });
        expect(result.files).toHaveLength(0);
        expect(result.partial).toBe(true);
        expect(result.reasons.join(" ")).toContain("UTF-16");
      }),
    10_000,
  );

  test.skipIf(process.platform === "win32")(
    "ignores executable preprocessing in RIPGREP_CONFIG_PATH",
    () =>
      fixture(async (cwd) => {
        const helper = join(cwd, "helper.sh");
        const marker = join(cwd, "helper-ran");
        const config = join(cwd, "rg-config");
        await writeFile(helper, `#!/bin/sh\ntouch '${marker}'\ncat "$1"\n`);
        await chmod(helper, 0o755);
        await writeFile(config, `--pre\n${helper}\n`);
        const script = `import {createRipgrepRunner} from ${JSON.stringify(new URL("../src/rg.ts", import.meta.url).href)}; import {normalizeRequest} from ${JSON.stringify(new URL("../src/request.ts", import.meta.url).href)}; const result=await createRipgrepRunner()(normalizeRequest({pattern:'foo'}),${JSON.stringify(cwd)}); process.stdout.write(String(result.totalMatches));`;
        expect(
          execFileSync(process.execPath, ["-e", script], {
            cwd,
            env: { ...process.env, RIPGREP_CONFIG_PATH: config },
            encoding: "utf8",
            timeout: 8000,
          }),
        ).toBe("1");
        let missing: unknown;
        try {
          await readFile(marker);
        } catch (error) {
          missing = error;
        }
        expect(missing).toMatchObject({ code: "ENOENT" });
      }),
    10_000,
  );
});
