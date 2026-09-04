import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRipgrepRunner } from "../src/rg.js";
import { normalizeRequest } from "../src/request.js";
import { SignalGrepService } from "../src/service.js";

const roots = new Set<string>();

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

async function fixture(): Promise<{ root: string; workspace: string }> {
  const root = await mkdtemp(join(tmpdir(), "baoer_signal_grep-lifecycle-"));
  roots.add(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  return { root, workspace };
}

async function wrapper(root: string, afterCommand: string): Promise<string> {
  const rg = Bun.which("rg");
  if (!rg) throw new Error("ripgrep is required for this integration test");
  const executable = join(root, "rg-wrapper");
  await writeFile(
    executable,
    `#!${process.execPath}\nimport { spawnSync } from "node:child_process";\nimport { writeFileSync } from "node:fs";\nconst args = process.argv.slice(2);\nconst result = spawnSync(${JSON.stringify(rg)}, args, { encoding: "utf8" });\nprocess.stdout.write(result.stdout);\nprocess.stderr.write(result.stderr);\n${afterCommand}\nprocess.exitCode = result.status;\n`,
    { mode: 0o755 },
  );
  return executable;
}

describe("ripgrep scan revision boundary", () => {
  // These fixtures wrap the real rg in an executable script to control process-close timing.
  test.skipIf(process.platform === "win32")(
    "does not bind a post-scan revision to earlier matching text or mix in changed context",
    async () => {
      const { root, workspace } = await fixture();
      const file = join(workspace, "moving.ts");
      await writeFile(file, "old-before\nneedle old\nold-after\n");
      const executable = await wrapper(
        root,
        `if (!args.includes("--files")) writeFileSync(${JSON.stringify(file)}, "new-before\\nreplacement\\nnew-after\\n");`,
      );
      const runner = createRipgrepRunner({ executable });
      const service = new SignalGrepService({ runRipgrep: runner });
      const result = await service.search(
        { pattern: "needle", path: "moving.ts", mode: "matches", context: 1 },
        workspace,
      );

      expect(result.text).toContain("needle old");
      expect(result.text).not.toContain("new-before");
      expect(result.text).not.toContain("new-after");
      expect(result.details.contextOmittedFiles).toEqual(["moving.ts"]);
    },
    10_000,
  );

  test.skipIf(process.platform === "win32")(
    "rejects a changed whole-file revision even when the retained match line is unchanged",
    async () => {
      const { root, workspace } = await fixture();
      const file = join(workspace, "moving.ts");
      await writeFile(file, "old-before\nneedle\nold-after\n");
      const executable = await wrapper(
        root,
        `if (!args.includes("--files")) writeFileSync(${JSON.stringify(file)}, "new-before\\nneedle\\nnew-after\\n");`,
      );
      const scan = await createRipgrepRunner({ executable })(
        normalizeRequest({ pattern: "needle", path: "moving.ts" }),
        workspace,
      );

      expect(scan.matches[0]?.lineContent).toBe("needle");
      expect(scan.sourceRevisions.has(file)).toBe(false);
    },
    10_000,
  );

  test.skipIf(process.platform === "win32")(
    "retains newly discovered matches without inventing a pre-scan file revision",
    async () => {
      const { root, workspace } = await fixture();
      await writeFile(join(workspace, "existing.ts"), "needle existing\n");
      const added = join(workspace, "added.ts");
      const executable = await wrapper(
        root,
        `if (args.includes("--files")) writeFileSync(${JSON.stringify(added)}, "needle added\\n");`,
      );
      const scan = await createRipgrepRunner({ executable })(
        normalizeRequest({ pattern: "needle" }),
        workspace,
      );

      expect(scan.totalMatches).toBe(2);
      expect(scan.snapshotComplete).toBe(true);
      expect(scan.sourceRevisions.has(added)).toBe(false);
      expect(scan.sourceRevisions.has(join(workspace, "existing.ts"))).toBe(true);
    },
    10_000,
  );

  test.skipIf(process.platform === "win32")(
    "keeps newline-containing file names intact in the revision enumeration",
    async () => {
      const { workspace } = await fixture();
      const file = join(workspace, "line\nbreak.ts");
      await writeFile(file, "needle\n");
      const scan = await createRipgrepRunner()(normalizeRequest({ pattern: "needle" }), workspace);

      expect(scan.totalMatches).toBe(1);
      expect(scan.sourceRevisions.has(file)).toBe(true);
      expect(await readFile(file, "utf8")).toBe("needle\n");
    },
  );
});
