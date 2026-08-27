import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readSignalGrepConfig,
  signalGrepConfigPath,
  writeSignalGrepConfig,
} from "../src/config.js";

const roots = new Set<string>();

async function agentDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-config-"));
  roots.add(root);
  return join(root, "agent");
}

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("Signal Grep config", () => {
  test("defaults to additive mode when no config exists", async () => {
    expect(await readSignalGrepConfig(await agentDir())).toEqual({
      overrideBuiltinGrep: false,
      startMetricsOnNextLoad: false,
    });
  });

  test("persists, replaces, and reads override mode through a staged file", async () => {
    const dir = await agentDir();
    await writeSignalGrepConfig({ overrideBuiltinGrep: true }, dir);
    expect(await readSignalGrepConfig(dir)).toEqual({
      overrideBuiltinGrep: true,
      startMetricsOnNextLoad: false,
    });

    await writeSignalGrepConfig({ overrideBuiltinGrep: false }, dir);
    expect(await readSignalGrepConfig(dir)).toEqual({
      overrideBuiltinGrep: false,
      startMetricsOnNextLoad: false,
    });
    expect(JSON.parse(await readFile(signalGrepConfigPath(dir), "utf8"))).toEqual({
      overrideBuiltinGrep: false,
    });
  });

  test("persists the one-shot metrics handoff across reload", async () => {
    const dir = await agentDir();
    await writeSignalGrepConfig({ overrideBuiltinGrep: true, startMetricsOnNextLoad: true }, dir);
    expect(await readSignalGrepConfig(dir)).toEqual({
      overrideBuiltinGrep: true,
      startMetricsOnNextLoad: true,
    });
  });

  test("rejects malformed or mistyped config instead of silently changing tool mode", async () => {
    const dir = await agentDir();
    await writeSignalGrepConfig({ overrideBuiltinGrep: false }, dir);
    await writeFile(signalGrepConfigPath(dir), "{", "utf8");
    let malformed: unknown;
    try {
      await readSignalGrepConfig(dir);
    } catch (error) {
      malformed = error;
    }
    expect(malformed).toBeInstanceOf(Error);
    expect(malformed instanceof Error ? malformed.message : "").toContain(
      "Invalid Signal Grep config",
    );

    await writeFile(signalGrepConfigPath(dir), '{"overrideBuiltinGrep":"yes"}', "utf8");
    let mistyped: unknown;
    try {
      await readSignalGrepConfig(dir);
    } catch (error) {
      mistyped = error;
    }
    expect(mistyped).toBeInstanceOf(Error);
    expect(mistyped instanceof Error ? mistyped.message : "").toContain(
      "overrideBuiltinGrep must be boolean",
    );

    await writeFile(
      signalGrepConfigPath(dir),
      '{"overrideBuiltinGrep":false,"startMetricsOnNextLoad":true}',
      "utf8",
    );
    let inconsistent: unknown;
    try {
      await readSignalGrepConfig(dir);
    } catch (error) {
      inconsistent = error;
    }
    expect(inconsistent instanceof Error ? inconsistent.message : "").toContain(
      "startMetricsOnNextLoad requires overrideBuiltinGrep",
    );
  });
});
