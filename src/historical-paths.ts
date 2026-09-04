import { lstat, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, relative, resolve } from "node:path";
import { MAX_STRUCTURE_BYTES, MAX_STRUCTURE_FILES } from "./analysis-limits.js";
import { abortError, SignalGrepError } from "./errors.js";
import {
  assertExistingPathInsideCwd,
  isPathInsideCwd,
  sameSourceRevision,
  sourceRevisionFromStats,
} from "./source.js";
import { MAX_SOURCE_FILE_BYTES, type SearchRequest } from "./types.js";
import { listWorkspaceFiles, workspaceRelativePath } from "./workspace-files.js";

interface HistoricalPathSelection {
  paths: string[];
  partial: boolean;
  reasons: string[];
  ignoreBytesRead: number;
}

function partitionPaths(paths: string[]): string[][] {
  const groups: string[][] = [];
  for (const path of paths) {
    const group = groups.find(
      (candidate) =>
        !candidate.some((other) => path.startsWith(`${other}/`) || other.startsWith(`${path}/`)),
    );
    if (group) group.push(path);
    else groups.push([path]);
  }
  return groups;
}

function relevantDirectories(cwd: string, paths: string[]): string[] {
  const directories = new Set<string>();
  for (const path of [cwd, ...paths.map((sourcePath) => dirname(resolve(cwd, sourcePath)))]) {
    let current = path;
    for (;;) {
      directories.add(current);
      const parent = dirname(current);
      if (current === parent) break;
      current = parent;
    }
  }
  return [...directories];
}

/** Empty metadata trees let ripgrep itself decide globs and current .ignore/.rgignore precedence. */
/* oxlint-disable no-await-in-loop -- owned temporary trees are built and checked within one cumulative read budget. */
export async function filterHistoricalPaths(
  cwd: string,
  paths: string[],
  request: Pick<SearchRequest, "path" | "glob" | "exclude" | "hidden">,
  signal?: AbortSignal,
): Promise<HistoricalPathSelection> {
  if (!isPathInsideCwd(resolve(cwd, request.path ?? "."), cwd)) {
    throw new SignalGrepError("Historical path filtering requires a path inside cwd");
  }
  const selectedPath = workspaceRelativePath(cwd, request.path ?? ".");
  const candidates = paths.filter(
    (path) =>
      selectedPath.length === 0 || path === selectedPath || path.startsWith(`${selectedPath}/`),
  );
  const reasons = new Set<string>();
  if (candidates.length > MAX_STRUCTURE_FILES)
    reasons.add(
      `Historical path filtering reached the ${String(MAX_STRUCTURE_FILES)} candidate limit`,
    );
  const bounded = candidates.slice(0, MAX_STRUCTURE_FILES);
  if (bounded.length === 0)
    return { paths: [], partial: reasons.size > 0, reasons: [...reasons], ignoreBytesRead: 0 };
  const root = await mkdtemp(join(tmpdir(), "baoer_signal_grep-paths-"));
  const absoluteCwd = resolve(cwd);
  const volumeRoot = parse(absoluteCwd).root;
  const ignoreFiles: { local: string; bytes: Buffer }[] = [];
  let ignoreBytesRead = 0;
  try {
    for (const directory of relevantDirectories(absoluteCwd, bounded)) {
      if (isPathInsideCwd(directory, absoluteCwd))
        await assertExistingPathInsideCwd(directory, absoluteCwd);
      for (const name of [".ignore", ".rgignore"]) {
        if (signal?.aborted) throw abortError();
        const path = join(directory, name);
        let discovered = false;
        try {
          const before = await lstat(path);
          discovered = true;
          if (!before.isFile())
            throw new SignalGrepError(
              "Current ignore rules are not regular files; historical path filtering is unavailable",
            );
          if (
            before.size > MAX_SOURCE_FILE_BYTES ||
            ignoreBytesRead + before.size > MAX_STRUCTURE_BYTES
          )
            throw new SignalGrepError("Current ignore rules exceed the source read budget");
          const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          let bytes: Buffer;
          try {
            if (
              !sameSourceRevision(
                sourceRevisionFromStats(before),
                sourceRevisionFromStats(await handle.stat()),
              )
            )
              throw new SignalGrepError("Current ignore rules changed before reading");
            const buffer = Buffer.alloc(before.size + 1);
            let used = 0;
            while (used < buffer.length) {
              if (signal?.aborted) throw abortError();
              const chunk = await handle.read(
                buffer,
                used,
                Math.min(64 * 1024, buffer.length - used),
                null,
              );
              if (chunk.bytesRead === 0) break;
              used += chunk.bytesRead;
            }
            bytes = buffer.subarray(0, used);
            const after = await lstat(path);
            if (
              used !== before.size ||
              !sameSourceRevision(
                sourceRevisionFromStats(before),
                sourceRevisionFromStats(after),
              ) ||
              !sameSourceRevision(
                sourceRevisionFromStats(before),
                sourceRevisionFromStats(await handle.stat()),
              )
            )
              throw new SignalGrepError(
                "Current ignore rules changed during historical path filtering",
              );
          } finally {
            await handle.close();
          }
          ignoreBytesRead += bytes.length;
          ignoreFiles.push({ local: relative(volumeRoot, path), bytes });
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
          if (discovered)
            throw new SignalGrepError(
              "Current ignore rules disappeared during historical path filtering",
            );
        }
      }
    }
    if (
      ignoreFiles.length === 0 &&
      request.glob.length === 0 &&
      request.exclude.length === 0 &&
      request.hidden
    ) {
      return { paths: bounded, partial: reasons.size > 0, reasons: [...reasons], ignoreBytesRead };
    }
    const visible = new Set<string>();
    for (const [index, group] of partitionPaths(bounded).entries()) {
      const tree = join(root, String(index));
      const target = join(tree, relative(volumeRoot, absoluteCwd));
      await mkdir(target, { recursive: true });
      for (const path of group) {
        const safe = workspaceRelativePath(absoluteCwd, path);
        const placeholder = resolve(target, safe);
        await mkdir(dirname(placeholder), { recursive: true });
        await writeFile(placeholder, "");
      }
      for (const ignore of ignoreFiles) {
        const destination = join(tree, ignore.local);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, ignore.bytes);
      }
      // Privacy filtering happens before explicit globs, which must not revive ignored history.
      const privacy = await listWorkspaceFiles(tree, signal, { ignoreParents: false });
      const prefix = `${relative(tree, target).split("\\").join("/")}/`;
      const allowed = new Set(
        privacy.paths
          .filter((path) => path.startsWith(prefix))
          .map((path) => path.slice(prefix.length)),
      );
      const scoped = await listWorkspaceFiles(target, signal, {
        glob: request.glob,
        exclude: request.exclude,
        hidden: request.hidden,
        ignore: false,
      });
      for (const reason of [...privacy.reasons, ...scoped.reasons]) reasons.add(reason);
      const included = new Set(group);
      for (const path of scoped.paths)
        if (included.has(path) && allowed.has(path)) visible.add(path);
    }
    return {
      paths: [...visible].toSorted(),
      partial: reasons.size > 0,
      reasons: [...reasons],
      ignoreBytesRead,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
/* oxlint-enable no-await-in-loop */
