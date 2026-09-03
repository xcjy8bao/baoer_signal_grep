import { SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { MAX_PROTOCOL_LINE_BYTES } from "./types.js";

const GIT_READ_ARGUMENTS = [
  "--no-pager",
  "--no-replace-objects",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
  "-c",
  "submodule.recurse=false",
] as const;

const MINIMUM_NO_LAZY_FETCH_VERSION = [2, 45, 0] as const;
const gitCapabilities = new Map<string, boolean>();

type GitReadCommand = "rev-parse" | "ls-tree" | "cat-file" | "ls-files" | "check-ignore";

interface GitReadOptions {
  signal?: AbortSignal;
  input?: Uint8Array;
  maxBytes?: number;
  allowedCodes?: readonly number[];
  executable?: string;
}

/** Retain ordinary ignore configuration, but never inherit Git repository or execution overrides. */
export function gitReadEnvironment(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_")),
    ),
    GIT_CONFIG_COUNT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PROTOCOL_FROM_USER: "0",
    LC_ALL: "C",
  };
}

export function supportsNoLazyFetch(version: string): boolean {
  const match = /^git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match) throw new SignalGrepError("Git returned an unrecognized version string");
  const actual = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  for (let index = 0; index < MINIMUM_NO_LAZY_FETCH_VERSION.length; index += 1) {
    const difference = (actual[index] ?? 0) - (MINIMUM_NO_LAZY_FETCH_VERSION[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

async function gitReadArguments(
  executable: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const capabilityKey = `${executable}\0${process.env.PATH ?? ""}`;
  let supports = gitCapabilities.get(capabilityKey);
  if (supports === undefined) {
    const versionChunks: Buffer[] = [];
    const version = await runOwnedProcess(
      {
        executable,
        args: ["--version"],
        cwd,
        env: gitReadEnvironment(),
        ...(signal ? { signal } : {}),
      },
      async (stdout) => {
        for await (const chunk of stdout) versionChunks.push(Buffer.from(chunk));
      },
    );
    if (version.code !== 0) throw new SignalGrepError("Unable to determine the Git version");
    supports = supportsNoLazyFetch(Buffer.concat(versionChunks).toString("utf8"));
    gitCapabilities.set(capabilityKey, supports);
  }
  if (supports) {
    return [...GIT_READ_ARGUMENTS, "--no-lazy-fetch"];
  }

  const partial = await runOwnedProcess(
    {
      executable,
      args: [
        ...GIT_READ_ARGUMENTS,
        "config",
        "--local",
        "--get-regexp",
        "^(extensions\\.partialClone|remote\\..*\\.promisor)$",
      ],
      cwd,
      env: gitReadEnvironment(),
      ...(signal ? { signal } : {}),
    },
    async (stdout) => {
      for await (const chunk of stdout) {
        // Presence is represented by the exit code; content is intentionally discarded.
        void chunk;
      }
    },
  );
  if (partial.code === 0) {
    throw new SignalGrepError(
      "Git 2.45 or newer is required for non-fetching reads from a partial/promisor clone",
    );
  }
  if (partial.code !== 1) {
    throw new SignalGrepError("Unable to verify whether this older Git repository is partial");
  }
  return [...GIT_READ_ARGUMENTS];
}

/** Only raw-object and names-only builtins are allowed at this boundary. */
export async function runGitRead(
  cwd: string,
  command: GitReadCommand,
  args: string[],
  options: GitReadOptions = {},
): Promise<{ output: Buffer; code: number }> {
  const chunks: Buffer[] = [];
  if (options.input && options.input.byteLength > MAX_PROTOCOL_LINE_BYTES) {
    throw new SignalGrepError(
      `Git input exceeds the ${String(MAX_PROTOCOL_LINE_BYTES)} byte protocol limit`,
    );
  }
  let bytes = 0;
  const maxBytes = options.maxBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const result = await runOwnedProcess(
    {
      executable: options.executable ?? "git",
      args: [
        ...(await gitReadArguments(options.executable ?? "git", cwd, options.signal)),
        ...(command === "ls-tree" ? ["--literal-pathspecs"] : []),
        command,
        ...args,
      ],
      cwd,
      env: gitReadEnvironment(),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.input ? { input: options.input } : {}),
    },
    async (stdout) => {
      for await (const chunk of stdout) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) {
          throw new SignalGrepError(
            `Git ${command} output exceeds the ${String(maxBytes)} byte limit`,
          );
        }
        chunks.push(Buffer.from(chunk));
      }
    },
  );
  if (result.code === null || !(options.allowedCodes ?? [0]).includes(result.code)) {
    throw new SignalGrepError(
      `Git ${command} failed: ${result.stderr.trim() || `exit ${String(result.code)}`}`,
    );
  }
  return { output: Buffer.concat(chunks), code: result.code };
}

export function decodeGitPath(bytes: Buffer): string {
  const value = bytes.toString("utf8");
  if (!Buffer.from(value, "utf8").equals(bytes)) {
    throw new SignalGrepError(
      "Git path is not valid UTF-8; path-based source access is unavailable",
    );
  }
  return value;
}

export function splitGitRecords(output: Buffer): Buffer[] {
  if (output.length === 0) return [];
  if (output[output.length - 1] !== 0) {
    throw new SignalGrepError("Git names protocol ended without a NUL delimiter");
  }
  const records: Buffer[] = [];
  let offset = 0;
  for (let delimiter = output.indexOf(0); delimiter !== -1; delimiter = output.indexOf(0, offset)) {
    records.push(output.subarray(offset, delimiter));
    offset = delimiter + 1;
  }
  return records;
}
