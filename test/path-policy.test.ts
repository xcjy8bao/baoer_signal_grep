import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { SearchPathPolicy, isPathInsideRoot } from "../src/path-policy.js";

describe("search path policy", () => {
  test("does not confuse a sibling sharing the cwd prefix with cwd", () => {
    const root = join(tmpdir(), "signal-grep-prefix");
    expect(isPathInsideRoot(join(root, "project-copy"), join(root, "project"))).toBe(false);
  });

  test("rejects Git internals and known external credential directories", () => {
    const cwd = join(tmpdir(), "signal-grep-workspace");
    const policy = new SearchPathPolicy(cwd);
    expect(() => policy.assertPath(join(cwd, ".git", "config"))).toThrow(
      "Git internals are excluded from search",
    );
    expect(() => policy.assertPath(join(homedir(), ".ssh", "id_ed25519"))).toThrow(
      "protected credential or system area",
    );
    expect(() => policy.assertPath(join(homedir(), ".netrc"))).toThrow(
      "protected credential or system area",
    );
  });

  test("rejects a symlink whose canonical target is protected", async () => {
    const root = await mkdtemp(join(tmpdir(), "signal-grep-path-policy-"));
    const cwd = join(root, "workspace");
    const protectedRoot = join(root, ".ssh");
    const target = join(protectedRoot, "token.txt");
    const link = join(cwd, "reference.txt");
    try {
      await mkdir(cwd);
      await mkdir(protectedRoot);
      await writeFile(target, "secret\n");
      await symlink(target, link);
      const policy = new SearchPathPolicy(cwd, [protectedRoot]);
      expect(policy.resolveExistingPath(link)).rejects.toThrow(
        "protected credential or system area",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("excludes protected descendants from broad external scans", () => {
    const root = join(tmpdir(), "signal-grep-external-root");
    const policy = new SearchPathPolicy(join(root, "workspace"), [join(root, "credentials")]);
    const args = policy.ripgrepGlobArguments(root);
    expect(args).toContain("!credentials");
    expect(args).toContain("!credentials/**");
    expect(args).toContain("!**/.ssh/**");
  });
});
