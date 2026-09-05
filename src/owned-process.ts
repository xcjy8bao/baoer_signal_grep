import { spawn } from "node:child_process";
import { abortError, SignalGrepError } from "./errors.js";
import type { Writable } from "node:stream";

const MAX_STDERR_BYTES = 16 * 1024;
const TERMINATE_GRACE_MS = 250;
const TERMINATE_DEADLINE_MS = 2_000;

interface OwnedProcessOptions {
  executable: string;
  args: string[];
  cwd: string;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  input?: Uint8Array;
  interactive?: boolean;
}

/** Own the child until its streams close, including failed protocol consumers. */
export async function runOwnedProcess(
  options: OwnedProcessOptions,
  consumeOutput: (stdout: AsyncIterable<Uint8Array>, stdin: Writable | null) => Promise<void>,
): Promise<{ code: number | null; stderr: string }> {
  const { executable, args, cwd, signal, env, input } = options;
  if (signal?.aborted) throw abortError();
  const spawnOptions = { cwd, windowsHide: true, ...(env ? { env } : {}) };
  const child =
    input === undefined && !options.interactive
      ? spawn(executable, args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] })
      : spawn(executable, args, { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"] });
  // Interactive writes reject their callbacks; keep stream errors observed until child closure.
  if (options.interactive) child.stdin?.on("error", () => undefined);
  const inputComplete = new Promise<void>((resolveInput, rejectInput) => {
    if (input === undefined || child.stdin === null) {
      resolveInput();
      return;
    }
    child.stdin.on("error", rejectInput);
    child.stdin.end(input, (error?: Error | null) => {
      if (error) rejectInput(error);
      else resolveInput();
    });
  });
  let closed = false;
  let spawnError: Error | undefined;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectClose: ((error: Error) => void) | undefined;
  const closePromise = new Promise<number | null>((resolveClose, reject) => {
    rejectClose = reject;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => {
      closed = true;
      resolveClose(code);
    });
  });
  const stderrChunks: Buffer[] = [];
  let stderrBytes = 0;
  child.stderr.on("data", (chunk: Buffer) => {
    const retained = chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes);
    if (retained.length === 0) return;
    stderrChunks.push(retained);
    stderrBytes += retained.length;
  });

  const terminate = () => {
    if (closed || forceTimer) return;
    child.stdin?.destroy();
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => {
      if (!closed) child.kill("SIGKILL");
    }, TERMINATE_GRACE_MS);
    deadlineTimer = setTimeout(() => {
      rejectClose?.(new SignalGrepError("Owned search process did not close after termination"));
    }, TERMINATE_DEADLINE_MS);
  };
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted) terminate();

  try {
    const [code] = await Promise.all([
      closePromise,
      consumeOutput(child.stdout, child.stdin),
      inputComplete,
    ]);
    if (signal?.aborted) throw abortError();
    if (spawnError) throw spawnError;
    return { code, stderr: Buffer.concat(stderrChunks).toString("utf8") };
  } catch (error) {
    terminate();
    await closePromise;
    if (signal?.aborted) throw abortError();
    if (spawnError) throw spawnError;
    throw error;
  } finally {
    if (forceTimer) clearTimeout(forceTimer);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    signal?.removeEventListener("abort", terminate);
  }
}
