import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_SIGNAL_GREP_CONFIG } from "../src/config.js";
import { registerSignalGrepExtension, signalGrepPromptGuidelines } from "../src/index.js";

type ToolExecute = (
  toolCallId: string,
  params: { pattern: string; literal?: boolean },
  signal: AbortSignal | undefined,
  onUpdate: undefined,
  context: {
    cwd: string;
    getContextUsage: () => { tokens: null; percent: null; contextWindow: number };
    ui: { setStatus: (key: string, value: string | undefined) => void };
  },
) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

type LifecycleHandler = (event: unknown, context: ExtensionContext) => unknown;

function harness() {
  const toolNames: string[] = [];
  const commands: string[] = [];
  const guidelines: string[][] = [];
  const lifecycle = new Map<string, LifecycleHandler>();
  let execute: ToolExecute | undefined;
  // oxlint-disable-next-line no-unsafe-type-assertion -- focused test double for the host surface consumed here
  const pi = {
    registerTool: (tool: { name: string; promptGuidelines?: string[]; execute: ToolExecute }) => {
      toolNames.push(tool.name);
      guidelines.push(tool.promptGuidelines ?? []);
      execute = tool.execute;
    },
    registerCommand: (name: string) => commands.push(name),
    on: (event: string, handler: LifecycleHandler) => lifecycle.set(event, handler),
  } as unknown as ExtensionAPI;
  return { pi, toolNames, commands, guidelines, lifecycle, execute: () => execute };
}

const roots = new Set<string>();

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("Signal Grep extension registration", () => {
  test("registers one independent tool without public commands", async () => {
    const testHarness = harness();
    await registerSignalGrepExtension(testHarness.pi, DEFAULT_SIGNAL_GREP_CONFIG);

    expect(testHarness.toolNames).toEqual(["signal_grep"]);
    expect(testHarness.commands).toEqual([]);
    expect(testHarness.guidelines).toEqual([signalGrepPromptGuidelines()]);
    expect(testHarness.guidelines.flat()).toHaveLength(11);
    expect(testHarness.lifecycle.has("session_shutdown")).toBe(true);
  });

  test("updates a plain-language status after a query and clears it at shutdown", async () => {
    const root = await mkdtemp(join(tmpdir(), "signal-grep-extension-"));
    roots.add(root);
    await writeFile(join(root, "source.ts"), "const needle = true;\n", "utf8");
    const testHarness = harness();
    await registerSignalGrepExtension(testHarness.pi, { locale: "zh-CN" });
    const statuses: Array<{ key: string; value: string | undefined }> = [];
    const setStatus = (key: string, value: string | undefined) => statuses.push({ key, value });
    const execute = testHarness.execute();
    if (!execute) throw new Error("Expected registered tool execution");

    await execute("call-1", { pattern: "needle", literal: true }, undefined, undefined, {
      cwd: root,
      getContextUsage: () => ({ tokens: null, percent: null, contextWindow: 100_000 }),
      ui: { setStatus },
    });
    expect(statuses.at(-1)).toEqual({
      key: "signal-grep-session",
      value: "Signal Grep：已处理 1 次查询，结果全部完整",
    });

    const shutdown = testHarness.lifecycle.get("session_shutdown");
    if (!shutdown) throw new Error("Expected shutdown handler");
    // oxlint-disable-next-line no-unsafe-type-assertion -- only setStatus is consumed by shutdown
    await shutdown({}, { ui: { setStatus } } as unknown as ExtensionContext);
    expect(statuses.at(-1)).toEqual({ key: "signal-grep-session", value: undefined });
  }, 10_000);
});
