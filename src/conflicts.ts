import { readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Packages known to register their own public "grep" tool. Signal Grep override
 * mode cannot own "grep" while any of these is installed, because Pi's extension
 * loader rejects duplicate tool registrations and the whole extension set fails
 * to load. Extend this table as the ecosystem grows; do not add ad hoc checks.
 */
export const GREP_OWNER_PACKAGES: readonly string[] = ["pi-hashline-edit-pro"];

function hasErrorCode(error: unknown, codes: string[]): boolean {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}

/**
 * Detect an installed package that owns the public "grep" tool name by scanning
 * the Pi agent package directory (top-level and @scope entries). Returns the
 * conflicting package name, or undefined when none is installed. A missing
 * package directory means no conflict; any other read failure propagates to the
 * caller so it is never silently treated as "no conflict".
 */
export async function detectGrepOwnerConflict(
  agentDir: string,
  packages: readonly string[] = GREP_OWNER_PACKAGES,
): Promise<string | undefined> {
  const nodeModules = join(agentDir, "npm", "node_modules");
  let entries: string[];
  try {
    entries = await readdir(nodeModules);
  } catch (error) {
    if (hasErrorCode(error, ["ENOENT"])) return undefined;
    throw error;
  }

  const installed = new Set<string>();
  const scopedEntries = entries.filter((entry) => entry.startsWith("@"));
  const topLevelEntries = entries.filter((entry) => !entry.startsWith("@"));
  for (const entry of topLevelEntries) installed.add(entry);
  const scopedGroups = await Promise.all(
    scopedEntries.map(async (scope) => {
      const names = await readdir(join(nodeModules, scope)).catch(() => []);
      return names.map((name) => `${scope}/${name}`);
    }),
  );
  for (const group of scopedGroups) {
    for (const name of group) installed.add(name);
  }
  return packages.find((candidate) => installed.has(candidate));
}
