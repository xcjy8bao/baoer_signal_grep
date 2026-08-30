import { describe, expect, test } from "bun:test";
import { consumeCappedLines } from "../src/capped-lines.js";
import { runOwnedProcess } from "../src/owned-process.js";

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("owned search process", () => {
  test("waits for forced process cleanup after a protocol consumer fails", async () => {
    let pid = 0;
    try {
      const operation = runOwnedProcess(
        {
          executable: process.execPath,
          args: [
            "-e",
            'process.on("SIGTERM", () => {}); process.stdout.write(String(process.pid) + "\\n"); setInterval(() => {}, 1000);',
          ],
          cwd: process.cwd(),
        },
        (stdout) =>
          consumeCappedLines(stdout, (line) => {
            pid = Number(line);
            throw new Error("Invalid test protocol");
          }),
      );

      expect(operation).rejects.toThrow("Invalid test protocol");
      await operation.catch(() => {});
      expect(pid).toBeGreaterThan(0);
      expect(processExists(pid)).toBe(false);
    } finally {
      if (pid > 0 && processExists(pid)) process.kill(pid, "SIGKILL");
    }
  }, 10_000);

  test("cancels and closes a running child that ignores graceful termination", async () => {
    const controller = new AbortController();
    let pid = 0;
    try {
      const operation = runOwnedProcess(
        {
          executable: process.execPath,
          args: [
            "-e",
            'process.on("SIGTERM", () => {}); process.stdout.write(String(process.pid) + "\\n"); setInterval(() => {}, 1000);',
          ],
          cwd: process.cwd(),
          signal: controller.signal,
        },
        (stdout) =>
          consumeCappedLines(stdout, (line) => {
            pid = Number(line);
            controller.abort();
          }),
      );

      expect(operation).rejects.toMatchObject({ name: "AbortError" });
      await operation.catch(() => {});
      expect(pid).toBeGreaterThan(0);
      expect(processExists(pid)).toBe(false);
    } finally {
      if (pid > 0 && processExists(pid)) process.kill(pid, "SIGKILL");
    }
  }, 10_000);

  test("preserves startup failure and bounds stderr by bytes", async () => {
    const missing = runOwnedProcess(
      { executable: "signal-grep-missing-executable", args: [], cwd: process.cwd() },
      (stdout) => consumeCappedLines(stdout, () => {}),
    );
    expect(missing).rejects.toMatchObject({ code: "ENOENT" });
    await missing.catch(() => {});
    const result = await runOwnedProcess(
      {
        executable: process.execPath,
        args: ["-e", 'process.stderr.write("x".repeat(100000));'],
        cwd: process.cwd(),
      },
      (stdout) => consumeCappedLines(stdout, () => {}),
    );
    expect(result.code).toBe(0);
    expect(Buffer.byteLength(result.stderr)).toBe(16 * 1024);
  }, 10_000);
});
