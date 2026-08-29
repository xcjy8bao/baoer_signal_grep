import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  effectiveSignalGrepInput,
  grepOverrideConflictSource,
  registerSignalGrepExtension,
  signalGrepToolName,
  signalGrepPromptGuidelines,
} from "../src/index.js";
import {
  DEFAULT_SIGNAL_GREP_CONFIG,
  readSignalGrepConfig,
  type SignalGrepConfig,
  writeSignalGrepConfig,
} from "../src/config.js";

function testConfig(overrides: Partial<SignalGrepConfig>): SignalGrepConfig {
  return { ...DEFAULT_SIGNAL_GREP_CONFIG, ...overrides };
}

describe("Signal Grep tool mode", () => {
  test("keeps additive signal_grep as the safe default", () => {
    expect(signalGrepToolName({ overrideBuiltinGrep: false })).toBe("signal_grep");
  });

  test("uses the built-in tool name only when override is explicitly enabled", () => {
    expect(signalGrepToolName({ overrideBuiltinGrep: true })).toBe("grep");
  });

  test("allows replacing the builtin grep but identifies another extension owner", () => {
    expect(
      grepOverrideConflictSource([
        { name: "grep", sourceInfo: { source: "builtin" } },
        { name: "read", sourceInfo: { source: "builtin" } },
      ]),
    ).toBeUndefined();
    expect(
      grepOverrideConflictSource([{ name: "grep", sourceInfo: { source: "npm:another-grep" } }]),
    ).toBe("npm:another-grep");
  });

  test("preserves built-in case-sensitive defaults while honoring explicit input", () => {
    const config = { overrideBuiltinGrep: true };
    expect(effectiveSignalGrepInput({ pattern: "todo" }, config)).toEqual({
      pattern: "todo",
      ignoreCase: false,
    });
    expect(effectiveSignalGrepInput({ pattern: "todo", ignoreCase: true }, config)).toEqual({
      pattern: "todo",
      ignoreCase: true,
    });
    expect(effectiveSignalGrepInput({ cursor: "cursor" }, config)).toEqual({
      cursor: "cursor",
    });
  });

  test("degraded override keeps additive case defaults", () => {
    const config = { overrideBuiltinGrep: true };
    expect(effectiveSignalGrepInput({ pattern: "todo" }, config, false)).toEqual({
      pattern: "todo",
    });
  });

  test("adds one hashline handoff guideline only when its grep-owner package is present", () => {
    const base = signalGrepPromptGuidelines("signal_grep");
    const withHashline = signalGrepPromptGuidelines("signal_grep", "pi-hashline-edit-pro");

    expect(base.some((guideline) => guideline.includes("served anchors"))).toBe(false);
    expect(withHashline).toHaveLength(base.length + 1);
    expect(withHashline.at(-1)).toContain("served anchors");
    expect(withHashline.at(-1)).toContain("not imported into its edit state");
  });
});

interface MockNotify {
  message: string;
  type?: string | undefined;
}

type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;
type SessionStartHandler = (event: unknown, ctx: ExtensionContext) => unknown;

function createMockPi(): {
  pi: ExtensionAPI;
  toolNames: string[];
  promptGuidelines: string[][];
  notifications: MockNotify[];
  commands: Map<string, CommandHandler>;
  sessionStartHandlers: SessionStartHandler[];
} {
  const toolNames: string[] = [];
  const promptGuidelines: string[][] = [];
  const notifications: MockNotify[] = [];
  const commands = new Map<string, CommandHandler>();
  const sessionStartHandlers: SessionStartHandler[] = [];
  // Test double: only the API surface this extension actually uses. The single
  // assertion here replaces seven scattered per-call-site assertions.
  // oxlint-disable-next-line no-unsafe-type-assertion -- test double covers only the consumed host surface
  const pi = {
    registerTool: (tool: { name: string; promptGuidelines?: string[] }) => {
      toolNames.push(tool.name);
      promptGuidelines.push(tool.promptGuidelines ?? []);
    },
    registerCommand: (name: string, options: { handler: CommandHandler }) => {
      commands.set(name, options.handler);
    },
    on: (event: string, handler: SessionStartHandler) => {
      if (event === "session_start") sessionStartHandlers.push(handler);
    },
    getAllTools: () => [],
    exec: async () => ({ code: 0, stdout: "ripgrep 15.2.0\n", stderr: "", killed: false }),
  } as unknown as ExtensionAPI;
  return {
    pi,
    toolNames,
    promptGuidelines,
    notifications,
    commands,
    sessionStartHandlers,
  };
}

function createContext(
  notifications: MockNotify[],
  onReload?: () => Promise<void>,
): ExtensionCommandContext {
  // oxlint-disable-next-line no-unsafe-type-assertion -- test double covers only the consumed context surface
  return {
    ui: {
      notify: (text: string, kind?: string) => {
        notifications.push({ message: text, type: kind });
      },
      setStatus: () => {},
    },
    reload: onReload ?? (async () => {}),
  } as unknown as ExtensionCommandContext;
}

const tempDirs: string[] = [];

async function createAgentDir(withConflict: boolean): Promise<string> {
  const agentDir = await mkdtemp(join(tmpdir(), "signal-grep-ext-"));
  tempDirs.push(agentDir);
  const nodeModules = join(agentDir, "npm", "node_modules");
  await mkdir(nodeModules, { recursive: true });
  if (withConflict) {
    await mkdir(join(nodeModules, "pi-hashline-edit-pro"), { recursive: true });
  }
  return agentDir;
}

afterEach(async () => {
  const dirs = tempDirs.splice(0, tempDirs.length);
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Signal Grep extension registration", () => {
  test("degrades override to additive signal_grep when a conflict package is installed", async () => {
    const agentDir = await createAgentDir(true);
    await writeSignalGrepConfig(testConfig({ overrideBuiltinGrep: true }), agentDir);
    const configBefore = await readFile(join(agentDir, "signal-grep.json"), "utf8");
    const harness = createMockPi();

    await registerSignalGrepExtension(harness.pi, testConfig({ overrideBuiltinGrep: true }), {
      agentDir,
    });

    expect(harness.toolNames).toEqual(["signal_grep"]);
    expect(harness.promptGuidelines[0]?.some((line) => line.includes("served anchors"))).toBe(true);
    const ctx = createContext(harness.notifications);
    await Promise.all(
      harness.sessionStartHandlers.map((handler) =>
        handler({ type: "session_start", reason: "startup" }, ctx),
      ),
    );
    const degraded = harness.notifications.filter((entry) =>
      entry.message.includes("pi-hashline-edit-pro"),
    );
    expect(degraded.length).toBeGreaterThan(0);
    expect(degraded[0]?.type).toBe("warning");
    const configAfter = await readFile(join(agentDir, "signal-grep.json"), "utf8");
    expect(configAfter).toBe(configBefore);
  }, 10_000);

  test("adds hashline handoff guidance in configured additive mode", async () => {
    const agentDir = await createAgentDir(true);
    const harness = createMockPi();

    await registerSignalGrepExtension(harness.pi, testConfig({ overrideBuiltinGrep: false }), {
      agentDir,
    });

    expect(harness.toolNames).toEqual(["signal_grep"]);
    expect(harness.promptGuidelines[0]?.some((line) => line.includes("served anchors"))).toBe(true);
  }, 10_000);

  test("keeps additive registration usable when optional handoff detection fails", async () => {
    const harness = createMockPi();

    await registerSignalGrepExtension(harness.pi, testConfig({ overrideBuiltinGrep: false }), {
      detectConflict: async () => {
        throw new Error("fs unavailable");
      },
    });

    expect(harness.toolNames).toEqual(["signal_grep"]);
    expect(harness.promptGuidelines[0]?.some((line) => line.includes("served anchors"))).toBe(
      false,
    );
  }, 10_000);

  test("keeps the grep override active when no conflict package is installed", async () => {
    const agentDir = await createAgentDir(false);
    const harness = createMockPi();

    await registerSignalGrepExtension(harness.pi, testConfig({ overrideBuiltinGrep: true }), {
      agentDir,
    });

    expect(harness.toolNames).toEqual(["grep"]);
    expect(harness.promptGuidelines[0]?.some((line) => line.includes("served anchors"))).toBe(
      false,
    );
    const ctx = createContext(harness.notifications);
    await Promise.all(
      harness.sessionStartHandlers.map((handler) =>
        handler({ type: "session_start", reason: "startup" }, ctx),
      ),
    );
    expect(harness.notifications.some((entry) => entry.type === "warning")).toBe(false);
  }, 10_000);

  test("degrades safely to additive mode when conflict detection fails", async () => {
    const agentDir = await createAgentDir(false);
    const harness = createMockPi();

    await registerSignalGrepExtension(harness.pi, testConfig({ overrideBuiltinGrep: true }), {
      agentDir,
      detectConflict: async () => {
        throw new Error("fs unavailable");
      },
    });

    expect(harness.toolNames).toEqual(["signal_grep"]);
    const ctx = createContext(harness.notifications);
    await Promise.all(
      harness.sessionStartHandlers.map((handler) =>
        handler({ type: "session_start", reason: "startup" }, ctx),
      ),
    );
    const degraded = harness.notifications.filter((entry) =>
      entry.message.includes("conflict detection failed"),
    );
    expect(degraded.length).toBeGreaterThan(0);
  }, 10_000);

  test("clears the metrics handoff without enabling metrics when degraded", async () => {
    const agentDir = await createAgentDir(true);
    const configPath = join(agentDir, "signal-grep.json");
    await writeSignalGrepConfig(
      testConfig({ overrideBuiltinGrep: true, startMetricsOnNextLoad: true }),
      agentDir,
    );
    const harness = createMockPi();

    await registerSignalGrepExtension(
      harness.pi,
      testConfig({ overrideBuiltinGrep: true, startMetricsOnNextLoad: true }),
      { agentDir },
    );
    const ctx = createContext(harness.notifications);
    await Promise.all(
      harness.sessionStartHandlers.map((handler) =>
        handler({ type: "session_start", reason: "startup" }, ctx),
      ),
    );

    const config = await readSignalGrepConfig(agentDir);
    expect(config.startMetricsOnNextLoad).toBe(false);
    expect(
      harness.notifications.some((entry) => entry.message.includes("Metrics were not enabled")),
    ).toBe(true);
    expect(configPath.length).toBeGreaterThan(0);
  }, 10_000);

  test("refuses to enable metrics through the command when a conflict package is installed", async () => {
    const agentDir = await createAgentDir(true);
    const configPath = join(agentDir, "signal-grep.json");
    await writeSignalGrepConfig(testConfig({ overrideBuiltinGrep: false }), agentDir);
    const configBefore = await readFile(configPath, "utf8");
    const harness = createMockPi();

    await registerSignalGrepExtension(harness.pi, testConfig({ overrideBuiltinGrep: false }), {
      agentDir,
    });
    const metricsCommand = harness.commands.get("signal-grep-metrics");
    expect(metricsCommand).toBeDefined();
    const ctx = createContext(harness.notifications);
    await metricsCommand?.("on", ctx);

    expect(
      harness.notifications.some((entry) => entry.message.includes("Metrics were not enabled")),
    ).toBe(true);
    expect(await readFile(configPath, "utf8")).toBe(configBefore);
  }, 10_000);

  test("metrics command keeps its existing handoff behavior without conflicts", async () => {
    const agentDir = await createAgentDir(false);
    let reloaded = false;
    const harness = createMockPi();

    await registerSignalGrepExtension(
      harness.pi,
      testConfig({ overrideBuiltinGrep: false, locale: "zh-CN" }),
      { agentDir },
    );
    const metricsCommand = harness.commands.get("signal-grep-metrics");
    const ctx = createContext(harness.notifications, async () => {
      reloaded = true;
    });
    await metricsCommand?.("on", ctx);

    const config = await readSignalGrepConfig(agentDir);
    expect(config.overrideBuiltinGrep).toBe(true);
    expect(config.startMetricsOnNextLoad).toBe(true);
    expect(config.locale).toBe("zh-CN");
    expect(reloaded).toBe(true);
  }, 10_000);

  test("refuses to enable the override through the command when a conflict package is installed", async () => {
    const agentDir = await createAgentDir(true);
    const configPath = join(agentDir, "signal-grep.json");
    await writeSignalGrepConfig(testConfig({ overrideBuiltinGrep: false }), agentDir);
    const configBefore = await readFile(configPath, "utf8");
    const harness = createMockPi();

    await registerSignalGrepExtension(harness.pi, testConfig({ overrideBuiltinGrep: false }), {
      agentDir,
    });
    const overrideCommand = harness.commands.get("signal-grep-override");
    expect(overrideCommand).toBeDefined();
    const ctx = createContext(harness.notifications);
    await overrideCommand?.("on", ctx);

    expect(
      harness.notifications.some((entry) =>
        entry.message.includes('owns the public "grep" tool name'),
      ),
    ).toBe(true);
    expect(await readFile(configPath, "utf8")).toBe(configBefore);
  }, 10_000);
  test("localizes command notifications in Simplified Chinese", async () => {
    const agentDir = await createAgentDir(false);
    const harness = createMockPi();
    await registerSignalGrepExtension(harness.pi, testConfig({ locale: "zh-CN" }), { agentDir });
    const ctx = createContext(harness.notifications);

    await harness.commands.get("signal-grep-clear")?.("", ctx);
    await harness.commands.get("signal-grep-override")?.("status", ctx);
    await harness.commands.get("signal-grep-metrics")?.("status", ctx);
    await harness.commands.get("signal-grep-health")?.("", ctx);

    expect(harness.notifications.map((entry) => entry.message)).toEqual([
      "Signal Grep 快照已清空",
      "Signal Grep 覆盖已停用。",
      "Signal Grep Metrics 已停用。如有需要，请使用 /signal-grep-metrics on 启用 grep 覆盖并开始新的对比区间。",
      expect.stringContaining("工具模式（实际）：附加 signal_grep"),
    ]);
  }, 10_000);
});
