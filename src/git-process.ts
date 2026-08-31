import { SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { MAX_PROTOCOL_LINE_BYTES } from "./types.js";

const GIT_READ_ARGUMENTS = [
  "--no-pager",
  "--no-replace-objects",
  "--no-lazy-fetch",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
  "-c",
  "submodule.recurse=false",
] as const;

type GitReadCommand = "rev-parse" | "ls-tree" | "cat-file" | "ls-files" | "check-ignore";

interface GitReadOptions {
  signal?: AbortSignal;
  input?: Uint8Array;
  maxBytes?: number;
  allowedCodes?: readonly number[];
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
      executable: "git",
      args: [
        ...GIT_READ_ARGUMENTS,
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
