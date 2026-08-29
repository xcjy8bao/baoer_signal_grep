import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
      locale: "en",
    });
  });

  test("persists, replaces, and reads override mode through a staged file", async () => {
    const dir = await agentDir();
    await writeSignalGrepConfig(
      { overrideBuiltinGrep: true, startMetricsOnNextLoad: false, locale: "en" },
      dir,
    );
    expect(await readSignalGrepConfig(dir)).toEqual({
      overrideBuiltinGrep: true,
      startMetricsOnNextLoad: false,
      locale: "en",
    });

    await writeSignalGrepConfig(
      { overrideBuiltinGrep: false, startMetricsOnNextLoad: false, locale: "en" },
      dir,
    );
    expect(await readSignalGrepConfig(dir)).toEqual({
      overrideBuiltinGrep: false,
      startMetricsOnNextLoad: false,
      locale: "en",
    });
    expect(JSON.parse(await readFile(signalGrepConfigPath(dir), "utf8"))).toEqual({
      overrideBuiltinGrep: false,
      startMetricsOnNextLoad: false,
      locale: "en",
    });
  });

  test("persists the one-shot metrics handoff across reload", async () => {
    const dir = await agentDir();
    await writeSignalGrepConfig(
      { overrideBuiltinGrep: true, startMetricsOnNextLoad: true, locale: "zh-CN" },
      dir,
    );
    expect(await readSignalGrepConfig(dir)).toEqual({
      overrideBuiltinGrep: true,
      startMetricsOnNextLoad: true,
      locale: "zh-CN",
    });
  });

  test("defaults locale for legacy config files that predate localization", async () => {
    const dir = await agentDir();
    await mkdir(dir, { recursive: true });
    await writeFile(signalGrepConfigPath(dir), '{"overrideBuiltinGrep":true}', "utf8");
    expect(await readSignalGrepConfig(dir)).toEqual({
      overrideBuiltinGrep: true,
      startMetricsOnNextLoad: false,
      locale: "en",
    });
  });

  test("rejects unsupported locales instead of silently choosing a language", async () => {
    const dir = await agentDir();
    await mkdir(dir, { recursive: true });
    await writeFile(
      signalGrepConfigPath(dir),
      '{"overrideBuiltinGrep":false,"locale":"fr"}',
      "utf8",
    );
    let failure: unknown;
    try {
      await readSignalGrepConfig(dir);
    } catch (error) {
      failure = error;
    }
    expect(failure instanceof Error ? failure.message : "").toContain(
      'locale must be "en" or "zh-CN"',
    );
  });

  test("rejects malformed or mistyped config instead of silently changing tool mode", async () => {
    const dir = await agentDir();
    await writeSignalGrepConfig(
      { overrideBuiltinGrep: false, startMetricsOnNextLoad: false, locale: "en" },
      dir,
    );
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
