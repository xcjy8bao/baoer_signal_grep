import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSignalGrepConfig, signalGrepConfigPath } from "../src/config.js";

const roots = new Set<string>();

async function agentDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "baoer_signal_grep-config-"));
  roots.add(root);
  return join(root, "agent");
}

async function writeConfig(agentDirectory: string, content: string): Promise<void> {
  await mkdir(agentDirectory, { recursive: true });
  await writeFile(signalGrepConfigPath(agentDirectory), content, "utf8");
}

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("baoer_signal_grep config", () => {
  test("defaults to English when no config exists", async () => {
    expect(await readSignalGrepConfig(await agentDir())).toEqual({ locale: "en" });
  });

  test("reads the supported interface locales", async () => {
    const directory = await agentDir();
    await writeConfig(directory, '{"locale":"zh-CN"}');
    expect(await readSignalGrepConfig(directory)).toEqual({ locale: "zh-CN" });
  });

  test("ignores retired settings in existing config files", async () => {
    const directory = await agentDir();
    await writeConfig(
      directory,
      '{"overrideBuiltinGrep":true,"startMetricsOnNextLoad":true,"locale":"zh-CN"}',
    );
    expect(await readSignalGrepConfig(directory)).toEqual({ locale: "zh-CN" });
  });

  test("rejects unsupported locales", async () => {
    const directory = await agentDir();
    await writeConfig(directory, '{"locale":"fr"}');
    expect(readSignalGrepConfig(directory)).rejects.toThrow('locale must be "en" or "zh-CN"');
  });

  test("rejects malformed or non-object config", async () => {
    const directory = await agentDir();
    await writeConfig(directory, "{");
    expect(readSignalGrepConfig(directory)).rejects.toThrow("Invalid baoer_signal_grep config");
    await writeConfig(directory, "[]");
    expect(readSignalGrepConfig(directory)).rejects.toThrow("expected a JSON object");
  });
});
