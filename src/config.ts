import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  readSignalGrepConfigFile,
  SIGNAL_GREP_CONFIG_FILE,
  type SignalGrepConfig,
} from "./config-reader.js";

export {
  DEFAULT_SIGNAL_GREP_CONFIG,
  type SignalGrepConfig,
  type SignalGrepLocale,
} from "./config-reader.js";

export function signalGrepConfigPath(agentDir = getAgentDir()): string {
  return join(agentDir, SIGNAL_GREP_CONFIG_FILE);
}

export async function readSignalGrepConfig(agentDir = getAgentDir()): Promise<SignalGrepConfig> {
  return readSignalGrepConfigFile(signalGrepConfigPath(agentDir));
}
