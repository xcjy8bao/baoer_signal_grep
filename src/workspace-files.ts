import { isAbsolute, relative, resolve, sep } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { fileScopeArguments } from "./rg.js";
import { assertExistingPathInsideCwd } from "./source.js";
import { MAX_PROTOCOL_LINE_BYTES, MAX_SOURCE_REVISION_FILES } from "./types.js";

export interface WorkspaceFileOptions {
  path?: string;
  glob?: string[];
  exclude?: string[];
  hidden?: boolean;
  maxFiles?: number;
  /** Internal metadata-tree scans can control parent-rule traversal without changing user search defaults. */
  ignore?: boolean;
  ignoreParents?: boolean;
}

export interface WorkspaceFileList {
  paths: string[];
  partial: boolean;
  reasons: string[];
}

class EnumerationLimit extends Error {}

export function workspaceRelativePath(cwd: string, path: string): string {
  const local = relative(resolve(cwd), resolve(cwd, path));
  if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local))
    throw new SignalGrepError("Path must stay within the working directory");
  if (local.split(sep).some((part) => part.toLowerCase() === ".git"))
    throw new SignalGrepError("Git internals are excluded from source candidates");
  return local.split(sep).join("/");
}

/** Names-only enumeration with the same ripgrep include/exclude and ignore rules as search. */
export async function listWorkspaceFiles(
  cwd: string,
  signal?: AbortSignal,
  options: WorkspaceFileOptions = {},
): Promise<WorkspaceFileList> {
  const path = workspaceRelativePath(cwd, options.path ?? ".");
  await assertExistingPathInsideCwd(resolve(cwd, path), cwd);
  const maxFiles = options.maxFiles ?? MAX_SOURCE_REVISION_FILES;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1)
    throw new SignalGrepError("Candidate file limit must be a positive integer");
  const paths = new Set<string>();
  const reasons = new Set<string>();
  let bytes = 0;
  try {
    const result = await runOwnedProcess(
      {
        executable: "rg",
        args: [
          "--no-config",
          "--files",
          "--null",
          ...(options.ignore === false ? ["--no-ignore"] : []),
          ...(options.ignoreParents === false ? ["--no-ignore-parent"] : []),
          ...fileScopeArguments({
            hidden: options.hidden ?? true,
            glob: options.glob ?? [],
            exclude: options.exclude ?? [],
          }),
          "--",
          resolve(cwd, path),
        ],
        cwd,
        ...(signal ? { signal } : {}),
      },
      async (stdout) => {
        let pending = Buffer.alloc(0);
        for await (const chunk of stdout) {
          if (signal?.aborted) throw abortError();
          bytes += chunk.byteLength;
          if (bytes > MAX_PROTOCOL_LINE_BYTES)
            throw new EnumerationLimit(
              `Candidate enumeration exceeds the ${String(MAX_PROTOCOL_LINE_BYTES)} byte protocol limit`,
            );
          pending = Buffer.concat([pending, chunk]);
          let delimiter = pending.indexOf(0);
          while (delimiter >= 0) {
            const raw = pending.subarray(0, delimiter);
            const decoded = raw.toString("utf8");
            if (!Buffer.from(decoded).equals(raw))
              reasons.add("Some candidate paths are not valid UTF-8");
            else {
              const local = workspaceRelativePath(cwd, decoded);
              if (!paths.has(local) && paths.size >= maxFiles)
                throw new EnumerationLimit(
                  `Candidate enumeration reached the ${String(maxFiles)} file limit`,
                );
              paths.add(local);
            }
            pending = pending.subarray(delimiter + 1);
            delimiter = pending.indexOf(0);
          }
        }
        if (pending.length > 0)
          throw new SignalGrepError("Candidate enumeration ended without a NUL delimiter");
      },
    );
    if (result.code !== 0 && result.code !== 1)
      throw new SignalGrepError(
        result.stderr.trim() || `Candidate enumeration exited ${String(result.code)}`,
      );
  } catch (error) {
    if (!(error instanceof EnumerationLimit)) throw error;
    reasons.add(error.message);
  }
  return { paths: [...paths].toSorted(), partial: reasons.size > 0, reasons: [...reasons] };
}
