import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { SignalGrepError } from "./errors.js";

const POSIX_SPECIAL_ROOTS = ["/dev", "/proc", "/sys"] as const;
const PORTABLE_CREDENTIAL_DIRECTORY_NAMES = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".docker",
  ".password-store",
] as const;

const HOME_CREDENTIAL_DIRECTORIES = [
  [".ssh"],
  [".gnupg"],
  [".aws"],
  [".azure"],
  [".kube"],
  [".docker"],
  [".password-store"],
  [".config", "gcloud"],
  [".config", "gh"],
  [".local", "share", "keyrings"],
] as const;
const HOME_CREDENTIAL_FILES = [[".netrc"], [".npmrc"], [".pypirc"], [".git-credentials"]] as const;

const DARWIN_CREDENTIAL_DIRECTORIES = [
  ["Library", "Keychains"],
  ["Library", "Application Support", "Google", "Chrome"],
  ["Library", "Application Support", "Chromium"],
  ["Library", "Application Support", "Firefox"],
  ["Library", "Application Support", "Microsoft Edge"],
  ["Library", "Application Support", "BraveSoftware", "Brave-Browser"],
] as const;

const LINUX_CREDENTIAL_DIRECTORIES = [
  [".mozilla", "firefox"],
  [".config", "google-chrome"],
  [".config", "chromium"],
  [".config", "microsoft-edge"],
  [".config", "BraveSoftware", "Brave-Browser"],
] as const;

function pathKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function directoryNameKey(name: string): string {
  return process.platform === "win32" || process.platform === "darwin" ? name.toLowerCase() : name;
}

const PORTABLE_CREDENTIAL_DIRECTORY_KEYS = new Set(
  PORTABLE_CREDENTIAL_DIRECTORY_NAMES.map(directoryNameKey),
);

function isGitInternal(path: string): boolean {
  return resolve(path)
    .split(sep)
    .some((part) => part.toLowerCase() === ".git");
}

export function isPathInsideRoot(path: string, root: string): boolean {
  const local = relative(pathKey(root), pathKey(path));
  return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

export function isPathInsideCwd(path: string, cwd: string): boolean {
  return isPathInsideRoot(resolve(cwd, path), resolve(cwd));
}

function defaultSensitiveRoots(): string[] {
  const home = homedir();
  const roots = [...HOME_CREDENTIAL_DIRECTORIES, ...HOME_CREDENTIAL_FILES].map((parts) =>
    join(home, ...parts),
  );
  if (process.platform !== "win32") roots.push(...POSIX_SPECIAL_ROOTS);
  if (process.platform === "darwin") {
    roots.push(...DARWIN_CREDENTIAL_DIRECTORIES.map((parts) => join(home, ...parts)));
  } else if (process.platform === "linux") {
    roots.push(...LINUX_CREDENTIAL_DIRECTORIES.map((parts) => join(home, ...parts)));
  } else if (process.platform === "win32") {
    const { APPDATA, LOCALAPPDATA, ProgramData, SystemRoot } = process.env;
    if (APPDATA) {
      roots.push(
        join(APPDATA, "Microsoft", "Credentials"),
        join(APPDATA, "Microsoft", "Protect"),
        join(APPDATA, "gnupg"),
      );
    }
    if (LOCALAPPDATA) {
      roots.push(
        join(LOCALAPPDATA, "Google", "Chrome", "User Data"),
        join(LOCALAPPDATA, "Chromium", "User Data"),
        join(LOCALAPPDATA, "Microsoft", "Edge", "User Data"),
        join(LOCALAPPDATA, "BraveSoftware", "Brave-Browser", "User Data"),
      );
    }
    if (ProgramData) roots.push(join(ProgramData, "Microsoft", "Crypto", "RSA", "MachineKeys"));
    if (SystemRoot) roots.push(join(SystemRoot, "System32", "config"));
  }
  return [...new Set(roots.map((root) => resolve(root)))];
}

const DEFAULT_SENSITIVE_ROOTS = defaultSensitiveRoots();

function escapeGlobPath(path: string): string {
  return path.replaceAll("\\", "/").replaceAll(/([*?[\]{}])/g, "\\$1");
}

function blockedPathMessage(path: string): string {
  return `Path is inside a protected credential or system area: ${path}`;
}

export class SearchPathPolicy {
  readonly cwd: string;
  readonly protectedRoots: readonly string[];

  constructor(cwd: string, protectedRoots: readonly string[] = DEFAULT_SENSITIVE_ROOTS) {
    this.cwd = resolve(cwd);
    this.protectedRoots = [...new Set(protectedRoots.map((root) => resolve(root)))];
  }

  isProtected(path: string): boolean {
    const absolute = resolve(this.cwd, path);
    if (isPathInsideRoot(absolute, this.cwd)) return false;
    return (
      absolute
        .split(sep)
        .some((part) => PORTABLE_CREDENTIAL_DIRECTORY_KEYS.has(directoryNameKey(part))) ||
      this.protectedRoots.some((root) => isPathInsideRoot(absolute, root))
    );
  }

  assertPath(path: string): void {
    const absolute = resolve(this.cwd, path);
    if (isGitInternal(absolute))
      throw new SignalGrepError("Git internals are excluded from search");
    if (this.isProtected(absolute)) throw new SignalGrepError(blockedPathMessage(absolute));
  }

  async resolveExistingPath(path: string): Promise<string | undefined> {
    const absolute = resolve(this.cwd, path);
    this.assertPath(absolute);
    let canonical: string;
    try {
      canonical = await realpath(absolute);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
      throw error;
    }
    this.assertPath(canonical);
    return canonical;
  }

  async assertExistingPath(path: string): Promise<void> {
    await this.resolveExistingPath(path);
  }

  async resolveSearchTarget(path: string): Promise<string> {
    const absolute = resolve(this.cwd, path);
    const [canonical, canonicalCwd] = await Promise.all([
      this.resolveExistingPath(absolute),
      realpath(this.cwd),
    ]);
    return canonical &&
      (!isPathInsideRoot(absolute, this.cwd) || !isPathInsideRoot(canonical, canonicalCwd))
      ? canonical
      : absolute;
  }

  ripgrepGlobArguments(searchPath: string): string[] {
    const absolute = resolve(this.cwd, searchPath);
    if (isPathInsideRoot(absolute, this.cwd)) return [];
    const args: string[] = [];
    const globFlag =
      process.platform === "win32" || process.platform === "darwin" ? "--iglob" : "--glob";
    for (const name of PORTABLE_CREDENTIAL_DIRECTORY_NAMES) {
      args.push(
        globFlag,
        `!${name}`,
        globFlag,
        `!${name}/**`,
        globFlag,
        `!**/${name}`,
        globFlag,
        `!**/${name}/**`,
      );
    }
    for (const root of this.protectedRoots) {
      if (!isPathInsideRoot(root, absolute)) continue;
      const local = relative(absolute, root);
      if (!local || local === ".") continue;
      const escaped = escapeGlobPath(local);
      args.push(globFlag, `!${escaped}`, globFlag, `!${escaped}/**`);
    }
    return args;
  }
}
