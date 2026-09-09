import { readFile } from "node:fs/promises";

export const SIGNAL_GREP_CONFIG_FILE = "baoer_signal_grep.json";

export type SignalGrepLocale = "en" | "zh-CN";
export type SearchEnforcementMode = "hard" | "prefer" | "off";
export type SearchEnforcementSetting = boolean | SearchEnforcementMode;

export const SIGNAL_GREP_ENFORCEMENT_ENV = "BAOER_SIGNAL_GREP_ENFORCE_SEARCH";

export interface SignalGrepConfig {
  locale: SignalGrepLocale;
  enforceSearch?: SearchEnforcementSetting;
}

export const DEFAULT_SIGNAL_GREP_CONFIG: Readonly<SignalGrepConfig> = {
  locale: "en",
  enforceSearch: "hard",
};

interface RawSignalGrepConfig {
  locale?: unknown;
  enforceSearch?: unknown;
}

function hasErrorCode(error: unknown, codes: string[]): boolean {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}

function isMissingFile(error: unknown): boolean {
  return hasErrorCode(error, ["ENOENT"]);
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
  const enforcement = normalizeSearchEnforcement(enforceSearch, `config at ${path}`);
  return {
    locale: locale ?? DEFAULT_SIGNAL_GREP_CONFIG.locale,
    enforceSearch: enforcement,
  };
}

export function normalizeSearchEnforcement(value: unknown, source: string): SearchEnforcementMode {
  if (value === undefined || value === true || value === "hard") return "hard";
  if (value === "prefer") return "prefer";
  if (value === false || value === "off") return "off";
  throw new Error(
    `Invalid baoer_signal_grep ${source}: enforceSearch must be true, false, "hard", "prefer", or "off"`,
  );
}

/** Native hooks inherit this setting from their host process; absent means fail-safe hard mode. */
export function readNativeSearchEnforcement(
  environment: NodeJS.ProcessEnv = process.env,
): SearchEnforcementMode {
  const value = environment[SIGNAL_GREP_ENFORCEMENT_ENV];
  return normalizeSearchEnforcement(value, `environment variable ${SIGNAL_GREP_ENFORCEMENT_ENV}`);
}

/** Read and validate one host-selected config path. */
export async function readSignalGrepConfigFile(path: string): Promise<SignalGrepConfig> {
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
