import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

const CONFIG_FILE = "baoer_signal_grep.json";

export type SignalGrepLocale = "en" | "zh-CN";

export interface SignalGrepConfig {
  locale: SignalGrepLocale;
  enforceSearch?: boolean;
}

export const DEFAULT_SIGNAL_GREP_CONFIG: Readonly<SignalGrepConfig> = {
  locale: "en",
  enforceSearch: true,
};

function hasErrorCode(error: unknown, codes: string[]): boolean {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}

function isMissingFile(error: unknown): boolean {
  return hasErrorCode(error, ["ENOENT"]);
}

interface RawSignalGrepConfig {
  locale?: unknown;
  enforceSearch?: unknown;
}

function isRawSignalGrepConfig(value: unknown): value is RawSignalGrepConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfig(value: unknown, path: string): SignalGrepConfig {
  if (!isRawSignalGrepConfig(value)) {
    throw new Error(`Invalid baoer_signal_grep config at ${path}: expected a JSON object`);
  }
  const { locale, enforceSearch } = value;
  if (locale !== undefined && locale !== "en" && locale !== "zh-CN") {
    throw new Error(`Invalid baoer_signal_grep config at ${path}: locale must be "en" or "zh-CN"`);
  }
  if (enforceSearch !== undefined && typeof enforceSearch !== "boolean")
    throw new Error(`Invalid baoer_signal_grep config at ${path}: enforceSearch must be boolean`);
  return {
    locale: locale ?? DEFAULT_SIGNAL_GREP_CONFIG.locale,
    enforceSearch: enforceSearch ?? true,
  };
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
      throw new Error(`Invalid baoer_signal_grep config at ${path}: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }
}
