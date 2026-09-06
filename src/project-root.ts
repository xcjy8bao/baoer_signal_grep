import { readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { abortError } from "./errors.js";
import { findGitRepository } from "./git-repository.js";
import { isPathInsideCwd } from "./path-policy.js";

const TYPESCRIPT_CONFIG_FILE = /^[tj]sconfig[^/]*\.json$/i;

function isMissingPath(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

async function projectConfig(
  directory: string,
  signal?: AbortSignal,
): Promise<"typescript" | "package" | undefined> {
  if (signal?.aborted) throw abortError();
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() || entry.isSymbolicLink());
    if (files.some((entry) => TYPESCRIPT_CONFIG_FILE.test(entry.name))) return "typescript";
    if (files.some((entry) => entry.name.toLowerCase() === "package.json")) return "package";
    return undefined;
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
}

async function gitRootWithinCwd(cwd: string, gitRoot: string): Promise<string | undefined> {
  const absoluteCwd = resolve(cwd);
  const [canonicalCwd, canonicalRoot] = await Promise.all([
    realpath(absoluteCwd),
    realpath(gitRoot),
  ]);
  if (!isPathInsideCwd(canonicalRoot, canonicalCwd)) return undefined;
  return resolve(absoluteCwd, relative(canonicalCwd, canonicalRoot));
}

/**
 * Resolve the smallest stable project boundary available for semantic work.
 * Git remains the authoritative boundary when it is inside the requested cwd;
 * otherwise the nearest TypeScript configuration, then package marker, or the
 * target directory is used. TypeScript configuration takes precedence so a
 * package manifest nested inside a configured workspace does not hide the
 * workspace's compiler project. The cwd bound is retained so semantic
 * navigation cannot widen an existing request into an unrelated parent
 * workspace.
 */
export async function resolveSemanticProjectRoot(
  cwd: string,
  targetPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const absoluteCwd = resolve(cwd);
  const absoluteTarget = resolve(absoluteCwd, targetPath);
  if (!isPathInsideCwd(absoluteTarget, absoluteCwd)) return absoluteCwd;

  const targetDirectory = dirname(absoluteTarget);
  const gitRoot = await findGitRepository(targetDirectory, signal);
  if (gitRoot) {
    const localGitRoot = await gitRootWithinCwd(absoluteCwd, gitRoot);
    if (localGitRoot) return localGitRoot;
  }

  let packageRoot: string | undefined;
  let current = targetDirectory;
  while (isPathInsideCwd(current, absoluteCwd)) {
    // oxlint-disable-next-line no-await-in-loop -- nearest ancestor order is the project-boundary contract.
    const marker = await projectConfig(current, signal);
    if (marker === "typescript") return current;
    if (marker === "package" && packageRoot === undefined) packageRoot = current;
    if (current === absoluteCwd) break;
    const parent = dirname(current);
    if (parent === current || !isPathInsideCwd(parent, absoluteCwd)) break;
    current = parent;
  }
  return packageRoot ?? targetDirectory;
}
