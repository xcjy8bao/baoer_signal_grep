import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { decodeGitPath, runGitRead, splitGitRecords } from "./git-process.js";
import {
  assertExistingPathInsideCwd,
  isPathInsideCwd,
  sameSourceRevision,
  sourceRevisionFromStats,
} from "./source.js";
import { MAX_SOURCE_FILE_BYTES, MAX_SOURCE_REVISION_FILES, type SourceRevision } from "./types.js";

export interface GitTreeEntry {
  path: string;
  mode: string;
  blob: string;
  size: number;
}

export type GitSourceOrigin =
  | { kind: "git"; commit: string; blob: string }
  | { kind: "worktree"; revision: SourceRevision; contentHash: string };

export interface GitRawSource {
  path: string;
  mode: string;
  sourceStatus: "available" | "absent" | "binary" | "symlink" | "submodule" | "unavailable";
  content?: Buffer;
  contentHash?: string;
  origin?: GitSourceOrigin;
  reason?: string;
}

export interface GitReadBudget {
  bytes: number;
  maxBytes: number;
}

export async function verifyWorktreeRevision(
  cwd: string,
  path: string,
  expected: SourceRevision,
): Promise<void> {
  try {
    const current = await lstat(resolve(cwd, path));
    await assertExistingPathInsideCwd(resolve(cwd, path), cwd);
    if (current.isFile() && sameSourceRevision(sourceRevisionFromStats(current), expected)) return;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  throw new SignalGrepError("Working source changed during Git comparison; retry a new search");
}

export function gitPath(cwd: string, path: string): string {
  if (path.length === 0 || path.includes("\0"))
    throw new SignalGrepError("Git source path is invalid");
  const absolute = resolve(cwd, path);
  const local = relative(resolve(cwd), absolute).split(sep).join("/");
  if (
    !isPathInsideCwd(absolute, cwd) ||
    local.split("/").some((part) => part.toLowerCase() === ".git")
  ) {
    throw new SignalGrepError(
      "Git source path must stay within the working directory and outside .git",
    );
  }
  return local;
}

export async function resolveGitCommit(
  cwd: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string> {
  if (ref.trim().length === 0 || ref.length > 1024 || ref.includes("\0")) {
    throw new SignalGrepError("Git commit reference must be a nonempty bounded string");
  }
  const { output } = await runGitRead(
    cwd,
    "rev-parse",
    ["--verify", "--end-of-options", `${ref}^{commit}`],
    {
      ...(signal ? { signal } : {}),
      maxBytes: 128,
    },
  );
  const commit = output.toString("ascii").trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit))
    throw new SignalGrepError("Git returned an invalid commit identity");
  return commit;
}

export async function readGitTree(
  cwd: string,
  commit: string,
  signal?: AbortSignal,
  path?: string,
): Promise<{ entries: Map<string, GitTreeEntry>; limited: boolean }> {
  const { output } = await runGitRead(
    cwd,
    "ls-tree",
    ["-r", "-z", "-l", commit, ...(path ? ["--", gitPath(cwd, path)] : [])],
    signal ? { signal } : {},
  );
  const entries = new Map<string, GitTreeEntry>();
  for (const record of splitGitRecords(output)) {
    if (entries.size === MAX_SOURCE_REVISION_FILES) return { entries, limited: true };
    const tab = record.indexOf(9);
    const header = record.subarray(0, tab).toString("ascii").trim().split(/\s+/);
    const [mode, type, blob, size] = header;
    if (
      tab < 0 ||
      !mode ||
      !blob ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(blob) ||
      !["blob", "commit"].includes(type ?? "")
    ) {
      throw new SignalGrepError("Git tree returned an invalid raw object entry");
    }
    const local = gitPath(cwd, decodeGitPath(record.subarray(tab + 1)));
    const byteSize = type === "commit" ? 0 : Number(size);
    if (!Number.isSafeInteger(byteSize) || byteSize < 0)
      throw new SignalGrepError("Git tree returned an invalid blob size");
    entries.set(local, { path: local, mode, blob, size: byteSize });
  }
  return { entries, limited: false };
}

export async function worktreeNames(
  cwd: string,
  signal?: AbortSignal,
): Promise<{ paths: string[]; limited: boolean }> {
  const { output } = await runGitRead(
    cwd,
    "ls-files",
    ["-z", "--cached", "--others", "--exclude-standard"],
    signal ? { signal } : {},
  );
  const paths = new Set<string>();
  for (const record of splitGitRecords(output)) {
    if (paths.size === MAX_SOURCE_REVISION_FILES) return { paths: [...paths], limited: true };
    paths.add(gitPath(cwd, decodeGitPath(record)));
  }
  return { paths: [...paths], limited: false };
}

/** --no-index deliberately applies today's privacy rules to historically tracked files as well. */
/* oxlint-disable no-await-in-loop -- batches bound input and process concurrency; predicates may have their own shared budget. */
export async function visibleGitPaths(
  cwd: string,
  paths: string[],
  signal?: AbortSignal,
  includePath?: (path: string) => boolean | Promise<boolean>,
): Promise<string[]> {
  const result: string[] = [];
  for (let start = 0; start < paths.length; start += 128) {
    const batch = paths.slice(start, start + 128);
    const { output } = await runGitRead(cwd, "check-ignore", ["--no-index", "-z", "--stdin"], {
      input: Buffer.from(`${batch.map((path) => `./${path}`).join("\0")}\0`),
      allowedCodes: [0, 1],
      ...(signal ? { signal } : {}),
    });
    const ignored = new Set(
      splitGitRecords(output).map((record) => gitPath(cwd, decodeGitPath(record))),
    );
    for (const path of batch) {
      if (signal?.aborted) throw abortError();
      if (!ignored.has(path) && (!includePath || (await includePath(path)))) result.push(path);
    }
  }
  return result;
}

/* oxlint-enable no-await-in-loop */

function limitedSource(path: string, mode: string, reason: string): GitRawSource {
  return { path, mode, sourceStatus: "unavailable", reason };
}

export async function readGitBlob(
  cwd: string,
  commit: string,
  entry: GitTreeEntry,
  budget: GitReadBudget,
  signal?: AbortSignal,
): Promise<GitRawSource> {
  const { path, mode, blob, size } = entry;
  if (mode === "120000" || mode === "160000") {
    return {
      path,
      mode,
      sourceStatus: mode === "120000" ? "symlink" : "submodule",
      reason: "Symlink and submodule contents are not followed",
    };
  }
  if (size > MAX_SOURCE_FILE_BYTES)
    return limitedSource(
      path,
      mode,
      `Source exceeds the ${String(MAX_SOURCE_FILE_BYTES)} byte file limit`,
    );
  if (budget.bytes + size > budget.maxBytes)
    return limitedSource(
      path,
      mode,
      `Source reads exceed the ${String(budget.maxBytes)} byte request limit`,
    );
  const { output } = await runGitRead(cwd, "cat-file", ["blob", blob], {
    maxBytes: size,
    ...(signal ? { signal } : {}),
  });
  budget.bytes += output.length;
  if (output.length !== size)
    throw new SignalGrepError("Git blob size does not match its immutable tree entry");
  const verifiedBlob = createHash(blob.length === 40 ? "sha1" : "sha256")
    .update(`blob ${String(output.length)}\0`)
    .update(output)
    .digest("hex");
  if (verifiedBlob !== blob)
    throw new SignalGrepError("Git blob bytes do not match their immutable object identity");
  return {
    path,
    mode,
    sourceStatus: output.includes(0) ? "binary" : "available",
    ...(output.includes(0) ? { reason: "Binary source contains NUL bytes" } : { content: output }),
    origin: { kind: "git", commit, blob },
    contentHash: createHash("sha256").update(output).digest("hex"),
  };
}

/* oxlint-disable no-await-in-loop -- bounded positional reads consume one file handle in order. */
export async function readWorktreeSource(
  cwd: string,
  path: string,
  budget: GitReadBudget,
  signal?: AbortSignal,
): Promise<GitRawSource> {
  const absolute = resolve(cwd, path);
  if (signal?.aborted) throw abortError();
  let discovered = false;
  try {
    const before = await lstat(absolute);
    discovered = true;
    if (before.isSymbolicLink())
      return {
        path,
        mode: "120000",
        sourceStatus: "symlink",
        reason: "Symlink source is not followed",
      };
    if (!before.isFile())
      return {
        path,
        mode: "160000",
        sourceStatus: before.isDirectory() ? "submodule" : "unavailable",
        reason: "Non-regular source is not read",
      };
    const mode = (before.mode & 0o111) === 0 ? "100644" : "100755";
    if (before.size > MAX_SOURCE_FILE_BYTES)
      return limitedSource(
        path,
        mode,
        `Source exceeds the ${String(MAX_SOURCE_FILE_BYTES)} byte file limit`,
      );
    if (budget.bytes + before.size > budget.maxBytes)
      return limitedSource(
        path,
        mode,
        `Source reads exceed the ${String(budget.maxBytes)} byte request limit`,
      );
    await assertExistingPathInsideCwd(absolute, cwd);
    const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (
        !sameSourceRevision(
          sourceRevisionFromStats(before),
          sourceRevisionFromStats(await handle.stat()),
        )
      )
        throw new SignalGrepError("Working source changed before reading");
      const buffer = Buffer.alloc(before.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        if (signal?.aborted) throw abortError();
        const { bytesRead } = await handle.read(
          buffer,
          bytes,
          Math.min(64 * 1024, buffer.length - bytes),
          null,
        );
        if (bytesRead === 0) break;
        bytes += bytesRead;
      }
      budget.bytes += bytes;
      const after = await lstat(absolute);
      await assertExistingPathInsideCwd(absolute, cwd);
      if (
        bytes !== before.size ||
        !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after)) ||
        !sameSourceRevision(
          sourceRevisionFromStats(before),
          sourceRevisionFromStats(await handle.stat()),
        )
      ) {
        throw new SignalGrepError(
          "Working source changed while reading; Git ranges and source cannot be mixed",
        );
      }
      const content = buffer.subarray(0, bytes);
      return {
        path,
        mode,
        sourceStatus: content.includes(0) ? "binary" : "available",
        ...(content.includes(0) ? { reason: "Binary source contains NUL bytes" } : { content }),
        origin: {
          kind: "worktree",
          revision: sourceRevisionFromStats(after),
          contentHash: createHash("sha256").update(content).digest("hex"),
        },
        contentHash: createHash("sha256").update(content).digest("hex"),
      };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "ENOENT") {
        if (discovered)
          throw new SignalGrepError("Working source disappeared while reading; retry a new search");
        return { path, mode: "000000", sourceStatus: "absent" };
      }
      if (["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(String(error.code)))
        return limitedSource(path, "000000", `Source unavailable: ${String(error.code)}`);
    }
    throw error;
  }
}

/* oxlint-enable no-await-in-loop */
