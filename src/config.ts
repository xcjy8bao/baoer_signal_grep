import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILE = "signal-grep.json";

export interface SignalGrepConfig {
  overrideBuiltinGrep: boolean;
  startMetricsOnNextLoad?: boolean;
}

export const DEFAULT_SIGNAL_GREP_CONFIG: Readonly<Required<SignalGrepConfig>> = {
  overrideBuiltinGrep: false,
  startMetricsOnNextLoad: false,
};

function hasErrorCode(error: unknown, codes: string[]): boolean {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}

function isMissingFile(error: unknown): boolean {
  return hasErrorCode(error, ["ENOENT"]);
}

function parseConfig(value: unknown, path: string): SignalGrepConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid Signal Grep config at ${path}: expected a JSON object`);
  }
  const overrideBuiltinGrep = Reflect.get(value, "overrideBuiltinGrep");
  if (overrideBuiltinGrep !== undefined && typeof overrideBuiltinGrep !== "boolean") {
    throw new Error(`Invalid Signal Grep config at ${path}: overrideBuiltinGrep must be boolean`);
  }
  const startMetricsOnNextLoad = Reflect.get(value, "startMetricsOnNextLoad");
  if (startMetricsOnNextLoad !== undefined && typeof startMetricsOnNextLoad !== "boolean") {
    throw new Error(
      `Invalid Signal Grep config at ${path}: startMetricsOnNextLoad must be boolean`,
    );
  }
  const parsed = {
    overrideBuiltinGrep: overrideBuiltinGrep ?? DEFAULT_SIGNAL_GREP_CONFIG.overrideBuiltinGrep,
    startMetricsOnNextLoad:
      startMetricsOnNextLoad ?? DEFAULT_SIGNAL_GREP_CONFIG.startMetricsOnNextLoad,
  };
  if (parsed.startMetricsOnNextLoad && !parsed.overrideBuiltinGrep) {
    throw new Error(
      `Invalid Signal Grep config at ${path}: startMetricsOnNextLoad requires overrideBuiltinGrep`,
    );
  }
  return parsed;
}

export function signalGrepConfigPath(agentDir = getAgentDir()): string {
  return join(agentDir, CONFIG_FILE);
}

export async function readSignalGrepConfig(agentDir = getAgentDir()): Promise<SignalGrepConfig> {
  const path = signalGrepConfigPath(agentDir);
  try {
    const content = await readFile(path, "utf8");
    return parseConfig(JSON.parse(content), path);
  } catch (error) {
    if (isMissingFile(error)) return { ...DEFAULT_SIGNAL_GREP_CONFIG };
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid Signal Grep config at ${path}: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

export async function writeSignalGrepConfig(
  config: SignalGrepConfig,
  agentDir = getAgentDir(),
): Promise<void> {
  const path = signalGrepConfigPath(agentDir);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(agentDir, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      await rename(temporaryPath, path);
    } catch (error) {
      if (!hasErrorCode(error, ["EEXIST", "EPERM"])) throw error;
      // Windows cannot atomically replace an existing destination with rename().
      // The staged file still prevents a partially written JSON document.
      await rm(path, { force: true });
      await rename(temporaryPath, path);
    }
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
