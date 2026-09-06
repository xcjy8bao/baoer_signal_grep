import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { SignalGrepError } from "./errors.js";

const OVERRIDE_ENV = "BAOER_SIGNAL_GREP_RG_PATH";
const BUNDLED_REPAIR = `Reinstall baoer_signal_grep with optional dependencies enabled for this platform, or set ${OVERRIDE_ENV} to an absolute ripgrep executable path.`;

/** One executable choice for content, filename and historical-source searches. */
export async function resolveRipgrepExecutable(): Promise<string> {
  const configured = process.env[OVERRIDE_ENV];
  if (configured !== undefined && !isAbsolute(configured))
    throw new SignalGrepError(
      `${OVERRIDE_ENV} must be an absolute executable file path; shell functions, aliases and relative paths are not supported.`,
    );

  let executable: string;
  if (configured !== undefined) {
    executable = configured;
  } else {
    try {
      // Resolve lazily so a broken installation remains a visible tool error and an
      // explicit executable can be used without loading the platform package.
      executable = (await import("@vscode/ripgrep")).rgPath;
    } catch (cause) {
      throw new SignalGrepError(`Bundled ripgrep is unavailable. ${BUNDLED_REPAIR}`, { cause });
    }
  }

  try {
    if (!(await stat(executable)).isFile()) throw new Error("Expected an executable file");
    await access(executable, constants.X_OK);
  } catch (cause) {
    const repair =
      configured === undefined
        ? BUNDLED_REPAIR
        : `Fix ${OVERRIDE_ENV} or unset it to use bundled ripgrep. No fallback was attempted.`;
    throw new SignalGrepError(`ripgrep executable is unavailable: ${executable}. ${repair}`, {
      cause,
    });
  }
  return executable;
}
