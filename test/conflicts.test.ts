import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { detectGrepOwnerConflict } from "../src/conflicts.js";

const tempDirs: string[] = [];

async function createAgentDir(structure: string[] = []): Promise<string> {
  const agentDir = await mkdtemp(join(tmpdir(), "signal-grep-conflicts-"));
  tempDirs.push(agentDir);
  const nodeModules = join(agentDir, "npm", "node_modules");
  await mkdir(nodeModules, { recursive: true });
  await Promise.all(structure.map((entry) => mkdir(join(nodeModules, entry), { recursive: true })));
  return agentDir;
}

afterEach(async () => {
  const dirs = tempDirs.splice(0, tempDirs.length);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("detectGrepOwnerConflict", () => {
  test("returns undefined when the npm package directory is missing", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "signal-grep-conflicts-"));
    tempDirs.push(agentDir);
    expect(await detectGrepOwnerConflict(agentDir)).toBeUndefined();
  }, 5_000);

  test("returns undefined when no known grep owner is installed", async () => {
    const agentDir = await createAgentDir(["pi-lens", "@juicesharp/rpiv-todo"]);
    expect(await detectGrepOwnerConflict(agentDir)).toBeUndefined();
  }, 5_000);

  test("detects an installed top-level grep owner package", async () => {
    const agentDir = await createAgentDir(["pi-lens", "pi-hashline-edit-pro"]);
    expect(await detectGrepOwnerConflict(agentDir)).toBe("pi-hashline-edit-pro");
  }, 5_000);

  test("detects an installed scoped grep owner package", async () => {
    const agentDir = await createAgentDir(["@example/grep-owner"]);
    const packages = ["@example/grep-owner"];
    expect(await detectGrepOwnerConflict(agentDir, packages)).toBe("@example/grep-owner");
  }, 5_000);

  test("does not match packages outside the owner table", async () => {
    const agentDir = await createAgentDir(["pi-hashline-edit-pro-extras", "@example/other"]);
    expect(await detectGrepOwnerConflict(agentDir)).toBeUndefined();
    expect(await detectGrepOwnerConflict(agentDir, ["@example/grep-owner"])).toBeUndefined();
  }, 5_000);
});
