// @bun
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name2, newValue) {
  this[name2] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, {
      get: all[name2],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name2)
    });
};
var __esm = (fn, res, err2) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err2 = [e];
    }
  if (err2)
    throw err2[0];
  return res;
};

// node_modules/@vscode/ripgrep/lib/index.js
var exports_lib = {};
__export(exports_lib, {
  rgPath: () => rgPath
});
import { createRequire } from "module";
var require2, arch, binaryName, platformPkg, resolved, rgPath;
var init_lib = __esm(() => {
  require2 = createRequire(import.meta.url);
  arch = process.env.npm_config_arch || process.arch;
  binaryName = process.platform === "win32" ? "rg.exe" : "rg";
  platformPkg = `@vscode/ripgrep-${process.platform}-${arch}`;
  try {
    resolved = require2.resolve(`${platformPkg}/bin/${binaryName}`);
  } catch {
    throw new Error(`Could not find ${platformPkg}. ` + `Ensure optionalDependencies are installed for this platform (${process.platform}-${arch}).`);
  }
  rgPath = resolved;
});

// src/omp-index.ts
import { homedir as homedir2 } from "os";
import { join as join4 } from "path";

// src/config-reader.ts
import { readFile } from "fs/promises";
var SIGNAL_GREP_CONFIG_FILE = "baoer_signal_grep.json";
var DEFAULT_SIGNAL_GREP_CONFIG = {
  locale: "en",
  enforceSearch: "hard"
};
function hasErrorCode(error, codes) {
  return error instanceof Error && "code" in error && codes.includes(String(error.code));
}
function isMissingFile(error) {
  return hasErrorCode(error, ["ENOENT"]);
}
function isRawSignalGrepConfig(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseConfig(value, path) {
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
    enforceSearch: enforcement
  };
}
function normalizeSearchEnforcement(value, source) {
  if (value === undefined || value === true || value === "hard")
    return "hard";
  if (value === "prefer")
    return "prefer";
  if (value === false || value === "off")
    return "off";
  throw new Error(`Invalid baoer_signal_grep ${source}: enforceSearch must be true, false, "hard", "prefer", or "off"`);
}
async function readSignalGrepConfigFile(path) {
  try {
    const content = await readFile(path, "utf8");
    return parseConfig(JSON.parse(content), path);
  } catch (error) {
    if (isMissingFile(error))
      return { ...DEFAULT_SIGNAL_GREP_CONFIG };
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid baoer_signal_grep config at ${path}: ${error.message}`, {
        cause: error
      });
    }
    throw error;
  }
}

// src/types.ts
var DEFAULT_PAGE_SIZE = 100;
var MAX_PAGE_SIZE = 100;
var DEFAULT_RESULT_TOKEN_BUDGET = 2000;
var CONTEXT_BUDGET_POLICY = {
  fullAboveRemainderPercent: 40,
  criticalBelowRemainderPercent: 12,
  resultTokenBudgets: {
    full: DEFAULT_RESULT_TOKEN_BUDGET,
    tight: 1000,
    critical: 500
  }
};
var ESTIMATED_CHARACTERS_PER_TOKEN = 4;
var DEFAULT_SUMMARY_FILE_LIMIT = 30;
var MAX_SELECTED_PATHS = 20;
var MAX_INSPECT_TARGETS = 5;
var MAX_DISPLAYED_OCCURRENCES = 20;
var MAX_STORED_MATCHES = 50000;
var MAX_STORED_OCCURRENCES = 200000;
var MAX_SEARCH_STORAGE_BYTES = 32 * 1024 * 1024;
var MAX_LINE_CHARACTERS = 500;
var MAX_RESULT_BYTES = 16 * 1024;
var MAX_CONTEXT_LINES = 20;
var MAX_PROTOCOL_LINE_BYTES = 16 * 1024 * 1024;
var MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
var MAX_PATH_CHARACTERS = 4096;
var MAX_PATTERN_CHARACTERS = 64 * 1024;
var MAX_FILE_FILTER_ITEMS = 64;
var MAX_SOURCE_REVISION_CONCURRENCY = 16;
var MAX_SOURCE_REVISION_FILES = 50000;

// src/context-budget.ts
function budgetTier(contextRemainderPercent) {
  if (contextRemainderPercent > CONTEXT_BUDGET_POLICY.fullAboveRemainderPercent) {
    return "full";
  }
  if (contextRemainderPercent < CONTEXT_BUDGET_POLICY.criticalBelowRemainderPercent) {
    return "critical";
  }
  return "tight";
}
function resolveContextBudget(usage) {
  if (!usage || usage.tokens === null || usage.percent === null)
    return;
  if (!Number.isFinite(usage.percent) || usage.percent < 0 || usage.percent > 100)
    return;
  const contextRemainderPercent = Number((100 - usage.percent).toFixed(1));
  const tier = budgetTier(contextRemainderPercent);
  return {
    tier,
    contextRemainderPercent,
    resultTokenBudget: CONTEXT_BUDGET_POLICY.resultTokenBudgets[tier]
  };
}

// src/rg.ts
import { isAbsolute as isAbsolute3, relative as relative2, resolve as resolve4 } from "path";

// src/errors.ts
class SignalGrepError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SignalGrepError";
  }
}

class ConceptUnavailableError extends SignalGrepError {
  constructor(message, options) {
    super(message, options);
    this.name = "ConceptUnavailableError";
  }
}

class CursorError extends SignalGrepError {
  code;
  constructor(message, code = "E_CURSOR_MALFORMED") {
    super(`${code}: ${message}`);
    this.name = "CursorError";
    this.code = code;
  }
}
function abortError() {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

// src/excerpt.ts
function boundedCharacter(value, maximum) {
  if (!Number.isFinite(value))
    return 0;
  return Math.min(maximum, Math.max(0, Math.floor(value)));
}
function excerptText(text, focusStart = 0, focusEnd = focusStart, maximumCharacters = MAX_LINE_CHARACTERS) {
  if (!Number.isSafeInteger(maximumCharacters) || maximumCharacters <= 0) {
    throw new Error("Excerpt size must be a positive safe integer");
  }
  if (text.length <= maximumCharacters) {
    return {
      text,
      truncated: false,
      startCharacter: 0,
      endCharacter: text.length
    };
  }
  const boundedStart = boundedCharacter(focusStart, text.length);
  const boundedEnd = Math.max(boundedStart, boundedCharacter(focusEnd, text.length));
  const focusLength = boundedEnd - boundedStart;
  const startCharacter = focusLength >= maximumCharacters ? Math.min(boundedStart, text.length - maximumCharacters) : Math.min(Math.max(0, boundedStart - Math.floor((maximumCharacters - focusLength) / 2)), text.length - maximumCharacters);
  const endCharacter = startCharacter + maximumCharacters;
  const prefix = startCharacter > 0 ? "\u2026" : "";
  const suffix = endCharacter < text.length ? "\u2026" : "";
  return {
    text: `${prefix}${text.slice(startCharacter, endCharacter)}${suffix}`,
    truncated: true,
    startCharacter,
    endCharacter
  };
}

// src/search-retention.ts
class SearchRetention {
  #bytes = 0;
  #metadataBytes = 0;
  #metadataLimitReached = false;
  #occurrences = 0;
  #reasons = new Set;
  maxBytes;
  maxOccurrences;
  constructor(maxBytes = MAX_SEARCH_STORAGE_BYTES, maxOccurrences = MAX_STORED_OCCURRENCES) {
    this.maxBytes = maxBytes;
    this.maxOccurrences = maxOccurrences;
    for (const value of [maxBytes, maxOccurrences]) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new SignalGrepError("Search retention limits must be positive safe integers");
    }
  }
  file(displayPath, absolutePath) {
    if (this.#metadataLimitReached)
      return false;
    const bytes = Buffer.byteLength(JSON.stringify([displayPath, absolutePath])) + 512;
    const metadataLimit = Math.floor(this.maxBytes / 4);
    if (this.#metadataBytes + bytes > metadataLimit) {
      this.#metadataLimitReached = true;
      this.#reasons.add(`File-summary retention reached its ${String(metadataLimit)}-byte share of the search budget; file summaries are partial; narrow the path or filters`);
      return false;
    }
    this.#bytes += bytes;
    this.#metadataBytes += bytes;
    return true;
  }
  canRetainOccurrences(count) {
    if (this.#occurrences + count <= this.maxOccurrences)
      return true;
    this.#reasons.add(`Occurrence retention reached the ${String(this.maxOccurrences)} limit`);
    return false;
  }
  retain(match) {
    if (!this.canRetainOccurrences(match.occurrences.length))
      return false;
    const bytes = Buffer.byteLength(JSON.stringify(match)) + 1;
    if (this.#bytes - this.#metadataBytes + bytes > this.maxBytes - Math.floor(this.maxBytes / 4)) {
      this.#reasons.add(`Search evidence retention reached the ${String(this.maxBytes)}-byte limit`);
      return false;
    }
    this.#bytes += bytes;
    this.#occurrences += match.occurrences.length;
    return true;
  }
  noteLimit(reason) {
    this.#reasons.add(reason);
  }
  get details() {
    return {
      accountedBytes: this.#bytes,
      retainedOccurrences: this.#occurrences,
      maxBytes: this.maxBytes,
      maxOccurrences: this.maxOccurrences,
      reasons: [...this.#reasons]
    };
  }
}

// src/capped-lines.ts
var MAX_DIAGNOSTIC_PREFIX_BYTES = 8 * 1024;
async function consumeCappedLines(stream, onLine, options = {}) {
  const maxLineBytes = options.maxLineBytes ?? MAX_PROTOCOL_LINE_BYTES;
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1)
    throw new Error("Capped line byte limit must be a positive safe integer");
  let lineChunks = [];
  let lineBytes = 0;
  let discarding = false;
  const resetLine = () => {
    lineChunks = [];
    lineBytes = 0;
  };
  const lastLineByte = () => {
    const chunk = lineChunks.at(-1);
    return chunk && chunk.length > 0 ? chunk[chunk.length - 1] : undefined;
  };
  const prefixFor = (segment, totalBytes) => {
    const prefixBytes = Math.min(MAX_DIAGNOSTIC_PREFIX_BYTES, totalBytes);
    const prefix = Buffer.allocUnsafe(prefixBytes);
    let copied = 0;
    for (const chunk of lineChunks) {
      if (copied === prefixBytes)
        break;
      const length = Math.min(chunk.length, prefixBytes - copied);
      prefix.set(chunk.subarray(0, length), copied);
      copied += length;
    }
    if (copied < prefixBytes) {
      const length = Math.min(segment.length, prefixBytes - copied);
      prefix.set(segment.subarray(0, length), copied);
    }
    return prefix.toString("utf8");
  };
  const lineText = (withoutTrailingCarriageReturn) => {
    const contentBytes = lineBytes - (withoutTrailingCarriageReturn && lineBytes > 0 ? 1 : 0);
    const bytes = Buffer.concat(lineChunks, lineBytes);
    return bytes.toString("utf8", 0, contentBytes);
  };
  const reportOverflow = (segment, observedBytes, final) => {
    if (!options.onLineTooLong)
      throw new Error(`Input line exceeds the ${String(maxLineBytes)}-byte limit${final ? " at end of stream" : ""}`);
    options.onLineTooLong({
      prefix: prefixFor(segment, observedBytes),
      observedBytes
    });
  };
  const consumeChunk = (chunk, final) => {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline >= 0 ? newline : chunk.length;
      const segment = chunk.subarray(offset, end);
      if (discarding) {
        if (newline < 0)
          return;
        discarding = false;
        resetLine();
        offset = newline + 1;
        continue;
      }
      const observedBytes = lineBytes + segment.length;
      const hasTrailingCarriageReturn = newline >= 0 && observedBytes > 0 && (segment.at(-1) ?? lastLineByte()) === 13;
      const contentBytes = observedBytes - (hasTrailingCarriageReturn ? 1 : 0);
      if (contentBytes > maxLineBytes) {
        reportOverflow(segment, observedBytes, final && newline < 0);
        resetLine();
        if (newline < 0)
          discarding = true;
        else
          offset = newline + 1;
        continue;
      }
      if (segment.length > 0)
        lineChunks.push(segment);
      lineBytes = observedBytes;
      if (newline < 0)
        return;
      onLine(lineText(hasTrailingCarriageReturn));
      resetLine();
      offset = newline + 1;
    }
  };
  for await (const chunk of stream)
    consumeChunk(chunk, false);
  if (discarding)
    return;
  consumeChunk(new Uint8Array, true);
  if (lineBytes > 0)
    onLine(lineText(false));
}

// src/path-policy.ts
import { realpath } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, join, relative, resolve, sep } from "path";
var POSIX_SPECIAL_ROOTS = ["/dev", "/proc", "/sys"];
var PORTABLE_CREDENTIAL_DIRECTORY_NAMES = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".docker",
  ".password-store"
];
var HOME_CREDENTIAL_DIRECTORIES = [
  [".ssh"],
  [".gnupg"],
  [".aws"],
  [".azure"],
  [".kube"],
  [".docker"],
  [".password-store"],
  [".config", "gcloud"],
  [".config", "gh"],
  [".local", "share", "keyrings"]
];
var HOME_CREDENTIAL_FILES = [[".netrc"], [".npmrc"], [".pypirc"], [".git-credentials"]];
var DARWIN_CREDENTIAL_DIRECTORIES = [
  ["Library", "Keychains"],
  ["Library", "Application Support", "Google", "Chrome"],
  ["Library", "Application Support", "Chromium"],
  ["Library", "Application Support", "Firefox"],
  ["Library", "Application Support", "Microsoft Edge"],
  ["Library", "Application Support", "BraveSoftware", "Brave-Browser"]
];
var LINUX_CREDENTIAL_DIRECTORIES = [
  [".mozilla", "firefox"],
  [".config", "google-chrome"],
  [".config", "chromium"],
  [".config", "microsoft-edge"],
  [".config", "BraveSoftware", "Brave-Browser"]
];
function pathKey(path) {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
function directoryNameKey(name2) {
  return process.platform === "win32" || process.platform === "darwin" ? name2.toLowerCase() : name2;
}
var PORTABLE_CREDENTIAL_DIRECTORY_KEYS = new Set(PORTABLE_CREDENTIAL_DIRECTORY_NAMES.map(directoryNameKey));
function isGitInternal(path) {
  return resolve(path).split(sep).some((part) => part.toLowerCase() === ".git");
}
function isPathInsideRoot(path, root) {
  const local = relative(pathKey(root), pathKey(path));
  return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}
function isPathInsideCwd(path, cwd) {
  return isPathInsideRoot(resolve(cwd, path), resolve(cwd));
}
function defaultSensitiveRoots() {
  const home = homedir();
  const roots = [...HOME_CREDENTIAL_DIRECTORIES, ...HOME_CREDENTIAL_FILES].map((parts2) => join(home, ...parts2));
  if (process.platform !== "win32")
    roots.push(...POSIX_SPECIAL_ROOTS);
  if (process.platform === "darwin") {
    roots.push(...DARWIN_CREDENTIAL_DIRECTORIES.map((parts2) => join(home, ...parts2)));
  } else if (process.platform === "linux") {
    roots.push(...LINUX_CREDENTIAL_DIRECTORIES.map((parts2) => join(home, ...parts2)));
  } else if (process.platform === "win32") {
    const { APPDATA, LOCALAPPDATA, ProgramData, SystemRoot } = process.env;
    if (APPDATA) {
      roots.push(join(APPDATA, "Microsoft", "Credentials"), join(APPDATA, "Microsoft", "Protect"), join(APPDATA, "gnupg"));
    }
    if (LOCALAPPDATA) {
      roots.push(join(LOCALAPPDATA, "Google", "Chrome", "User Data"), join(LOCALAPPDATA, "Chromium", "User Data"), join(LOCALAPPDATA, "Microsoft", "Edge", "User Data"), join(LOCALAPPDATA, "BraveSoftware", "Brave-Browser", "User Data"));
    }
    if (ProgramData)
      roots.push(join(ProgramData, "Microsoft", "Crypto", "RSA", "MachineKeys"));
    if (SystemRoot)
      roots.push(join(SystemRoot, "System32", "config"));
  }
  return [...new Set(roots.map((root) => resolve(root)))];
}
var DEFAULT_SENSITIVE_ROOTS = defaultSensitiveRoots();
function escapeGlobPath(path) {
  const normalized = path.split(sep).join("/");
  return normalized.replaceAll(/([\\*?[\]{}])/g, "\\$1");
}
function blockedPathMessage(path) {
  return `Path is inside a protected credential or system area: ${path}`;
}

class SearchPathPolicy {
  cwd;
  protectedRoots;
  constructor(cwd, protectedRoots = DEFAULT_SENSITIVE_ROOTS) {
    this.cwd = resolve(cwd);
    this.protectedRoots = [...new Set(protectedRoots.map((root) => resolve(root)))];
  }
  isProtected(path) {
    const absolute = resolve(this.cwd, path);
    if (isPathInsideRoot(absolute, this.cwd))
      return false;
    return absolute.split(sep).some((part) => PORTABLE_CREDENTIAL_DIRECTORY_KEYS.has(directoryNameKey(part))) || this.protectedRoots.some((root) => isPathInsideRoot(absolute, root));
  }
  assertPath(path) {
    const absolute = resolve(this.cwd, path);
    if (isGitInternal(absolute))
      throw new SignalGrepError("Git internals are excluded from search");
    if (this.isProtected(absolute))
      throw new SignalGrepError(blockedPathMessage(absolute));
  }
  async resolveExistingPath(path) {
    const absolute = resolve(this.cwd, path);
    this.assertPath(absolute);
    let canonical;
    try {
      canonical = await realpath(absolute);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return;
      throw error;
    }
    this.assertPath(canonical);
    return canonical;
  }
  async assertExistingPath(path) {
    await this.resolveExistingPath(path);
  }
  async resolveSearchTarget(path) {
    const absolute = resolve(this.cwd, path);
    const [canonical, canonicalCwd] = await Promise.all([
      this.resolveExistingPath(absolute),
      realpath(this.cwd)
    ]);
    return canonical && (!isPathInsideRoot(absolute, this.cwd) || !isPathInsideRoot(canonical, canonicalCwd)) ? canonical : absolute;
  }
  ripgrepGlobArguments(searchPath) {
    const absolute = resolve(this.cwd, searchPath);
    if (isPathInsideRoot(absolute, this.cwd))
      return [];
    const args2 = [];
    const globFlag = process.platform === "win32" || process.platform === "darwin" ? "--iglob" : "--glob";
    for (const name2 of PORTABLE_CREDENTIAL_DIRECTORY_NAMES) {
      args2.push(globFlag, `!${name2}`, globFlag, `!${name2}/**`, globFlag, `!**/${name2}`, globFlag, `!**/${name2}/**`);
    }
    for (const root of this.protectedRoots) {
      if (!isPathInsideRoot(root, absolute))
        continue;
      const local = relative(absolute, root);
      if (!local || local === ".")
        continue;
      const escaped = escapeGlobPath(local);
      args2.push(globFlag, `!${escaped}`, globFlag, `!${escaped}/**`);
    }
    return args2;
  }
}

// src/owned-process.ts
import { spawn } from "child_process";
var MAX_STDERR_BYTES = 16 * 1024;
var TERMINATE_GRACE_MS = 250;
var TERMINATE_DEADLINE_MS = 2000;
async function runOwnedProcess(options, consumeOutput) {
  const { executable, args: args2, cwd, signal, env, input } = options;
  if (signal?.aborted)
    throw abortError();
  const spawnOptions = { cwd, windowsHide: true, ...env ? { env } : {} };
  const child = input === undefined && !options.interactive ? spawn(executable, args2, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] }) : spawn(executable, args2, { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"] });
  if (options.interactive)
    child.stdin?.on("error", () => {
      return;
    });
  const inputComplete = new Promise((resolveInput, rejectInput) => {
    if (input === undefined || child.stdin === null) {
      resolveInput();
      return;
    }
    child.stdin.on("error", rejectInput);
    child.stdin.end(input, (error) => {
      if (error)
        rejectInput(error);
      else
        resolveInput();
    });
  });
  let closed = false;
  let spawnError;
  let forceTimer;
  let deadlineTimer;
  let rejectClose;
  const closePromise = new Promise((resolveClose, reject) => {
    rejectClose = reject;
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => {
      closed = true;
      resolveClose(code);
    });
  });
  const stderrChunks = [];
  let stderrBytes = 0;
  child.stderr.on("data", (chunk) => {
    const retained = chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes);
    if (retained.length === 0)
      return;
    stderrChunks.push(retained);
    stderrBytes += retained.length;
  });
  const terminate = () => {
    if (closed || forceTimer)
      return;
    child.stdin?.destroy();
    child.kill("SIGTERM");
    forceTimer = setTimeout(() => {
      if (!closed)
        child.kill("SIGKILL");
    }, TERMINATE_GRACE_MS);
    deadlineTimer = setTimeout(() => {
      rejectClose?.(new SignalGrepError("Owned search process did not close after termination"));
    }, TERMINATE_DEADLINE_MS);
  };
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted)
    terminate();
  try {
    const [code] = await Promise.all([
      closePromise,
      consumeOutput(child.stdout, child.stdin),
      inputComplete
    ]);
    if (signal?.aborted)
      throw abortError();
    if (spawnError)
      throw spawnError;
    return { code, stderr: Buffer.concat(stderrChunks).toString("utf8") };
  } catch (error) {
    terminate();
    await closePromise;
    if (signal?.aborted)
      throw abortError();
    if (spawnError)
      throw spawnError;
    throw error;
  } finally {
    if (forceTimer)
      clearTimeout(forceTimer);
    if (deadlineTimer)
      clearTimeout(deadlineTimer);
    signal?.removeEventListener("abort", terminate);
  }
}

// src/ripgrep-executable.ts
import { constants } from "fs";
import { access, stat } from "fs/promises";
import { isAbsolute as isAbsolute2 } from "path";
var OVERRIDE_ENV = "BAOER_SIGNAL_GREP_RG_PATH";
var BUNDLED_REPAIR = `Reinstall baoer_signal_grep with optional dependencies enabled for this platform, or set ${OVERRIDE_ENV} to an absolute ripgrep executable path.`;
async function resolveRipgrepExecutable() {
  const configured = process.env[OVERRIDE_ENV];
  if (configured !== undefined && !isAbsolute2(configured))
    throw new SignalGrepError(`${OVERRIDE_ENV} must be an absolute executable file path; shell functions, aliases and relative paths are not supported.`);
  let executable;
  if (configured !== undefined) {
    executable = configured;
  } else {
    try {
      executable = (await Promise.resolve().then(() => (init_lib(), exports_lib))).rgPath;
    } catch (cause) {
      throw new SignalGrepError(`Bundled ripgrep is unavailable. ${BUNDLED_REPAIR}`, { cause });
    }
  }
  try {
    if (!(await stat(executable)).isFile())
      throw new Error("Expected an executable file");
    await access(executable, constants.X_OK);
  } catch (cause) {
    const repair = configured === undefined ? BUNDLED_REPAIR : `Fix ${OVERRIDE_ENV} or unset it to use bundled ripgrep. No fallback was attempted.`;
    throw new SignalGrepError(`ripgrep executable is unavailable: ${executable}. ${repair}`, {
      cause
    });
  }
  return executable;
}

// src/ripgrep-diagnostics.ts
import { resolve as resolve2 } from "path";
var UNREADABLE_SUFFIX = /:\s+Permission denied(?:\s+\(os error 13\))?\s*$/iu;
var UNREADABLE_CODE = /\(os error 13\)\s*$/iu;
function diagnosticLines(stderr) {
  return stderr.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
}
function unreadablePath(line, suffix) {
  const match = suffix.exec(line);
  if (!match || match.index === undefined)
    return;
  const prefix = line.slice(0, match.index).trim();
  const separator = prefix.indexOf(": ");
  const path = (separator < 0 ? prefix : prefix.slice(separator + 2)).trim();
  return path.replace(/^['"]|['"]$/gu, "") || undefined;
}
function classifyRipgrepDiagnostics(stderr) {
  const unreadable = [];
  const other = [];
  for (const line of diagnosticLines(stderr)) {
    const path = unreadablePath(line, UNREADABLE_SUFFIX);
    if (path !== undefined || UNREADABLE_CODE.test(line)) {
      unreadable.push({ message: line, ...path ? { path } : {} });
    } else {
      other.push(line);
    }
  }
  return { unreadable, other };
}
function hasRequestedRootUnreadable(diagnostics, cwd, searchPath) {
  const expected = resolve2(cwd, searchPath);
  return diagnostics.some((diagnostic) => diagnostic.path === undefined || resolve2(cwd, diagnostic.path) === expected);
}
function describeUnreadableDiagnostics(diagnostics) {
  const messages = [...new Set(diagnostics.map((diagnostic) => diagnostic.message))];
  return `Ripgrep skipped ${String(messages.length)} unreadable path(s); search coverage is partial: ${messages.join("; ")}`;
}

// src/source.ts
import { readFile as readFile2, realpath as realpath2, stat as stat2 } from "fs/promises";
var SOURCE_RANGE_METADATA_RESERVE_BYTES = 1024;
var MAX_SOURCE_RANGE_BYTES = MAX_RESULT_BYTES - SOURCE_RANGE_METADATA_RESERVE_BYTES;
async function getSourceRevision(path) {
  try {
    const metadata2 = await stat2(path);
    return sourceRevisionFromStats(metadata2);
  } catch {
    return;
  }
}
function sourceRevisionFromStats(metadata2) {
  return {
    size: metadata2.size,
    mtimeMs: metadata2.mtimeMs,
    ctimeMs: metadata2.ctimeMs,
    ...metadata2.ino !== 0 ? { inode: metadata2.ino } : {},
    ...metadata2.dev !== 0 ? { device: metadata2.dev } : {}
  };
}
function sameSourceRevision(left, right) {
  return left.size === right.size && left.mtimeMs === right.mtimeMs && (left.ctimeMs === undefined || right.ctimeMs === undefined || left.ctimeMs === right.ctimeMs) && left.inode === right.inode && left.device === right.device;
}
function matchesModificationTime(revision, modifiedAfterMs, modifiedBeforeMs) {
  return (modifiedAfterMs === undefined || revision.mtimeMs >= modifiedAfterMs) && (modifiedBeforeMs === undefined || revision.mtimeMs < modifiedBeforeMs);
}
function modificationTimeDisplay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? `${String(value)} Unix ms` : JSON.stringify(date.toISOString());
}
function modificationTimeBoundsText(modifiedAfterMs, modifiedBeforeMs) {
  if (modifiedAfterMs === undefined && modifiedBeforeMs === undefined)
    return "";
  const bounds = [
    modifiedAfterMs === undefined ? undefined : `mtime >= ${modificationTimeDisplay(modifiedAfterMs)}`,
    modifiedBeforeMs === undefined ? undefined : `mtime < ${modificationTimeDisplay(modifiedBeforeMs)}`
  ].filter((value) => value !== undefined);
  return ` [Modification-time filter: ${bounds.join("; ")}.]`;
}
async function assertExistingPathInsideCwd(path, cwd) {
  if (!isPathInsideCwd(path, cwd)) {
    throw new SignalGrepError("Path must stay within the working directory");
  }
  const canonical = await new SearchPathPolicy(cwd).resolveExistingPath(path);
  if (canonical && !isPathInsideCwd(canonical, await realpath2(cwd))) {
    throw new SignalGrepError("Path must stay within the working directory");
  }
}
class SourceBudgetTooSmallError extends SignalGrepError {
  constructor() {
    super("Source target line exceeds the available byte budget");
    this.name = "SourceBudgetTooSmallError";
  }
}

class SourceLineUnavailableError extends SignalGrepError {
  constructor(line) {
    super(`Source line ${String(line)} is beyond the end of the file`);
    this.name = "SourceLineUnavailableError";
  }
}
function sourceLineBytes(line) {
  return Buffer.byteLength(`${String(line.line)}: ${line.text}`, "utf8");
}
function selectSourceWindow(rendered, targetIndex, maxBytes) {
  let startIndex = targetIndex;
  let endIndex = targetIndex;
  const target = rendered[targetIndex];
  if (!target)
    throw new Error("Source target line is unavailable");
  let bytes = sourceLineBytes(target);
  if (bytes > maxBytes)
    throw new SourceBudgetTooSmallError;
  let canGrowBefore = true;
  let canGrowAfter = true;
  while (canGrowBefore || canGrowAfter) {
    let grew = false;
    if (canGrowBefore) {
      const candidate = rendered[startIndex - 1];
      if (candidate === undefined) {
        canGrowBefore = false;
      } else if (bytes + 1 + sourceLineBytes(candidate) <= maxBytes) {
        startIndex -= 1;
        bytes += 1 + sourceLineBytes(candidate);
        grew = true;
      } else {
        canGrowBefore = false;
      }
    }
    if (canGrowAfter) {
      const candidate = rendered[endIndex + 1];
      if (candidate === undefined) {
        canGrowAfter = false;
      } else if (bytes + 1 + sourceLineBytes(candidate) <= maxBytes) {
        endIndex += 1;
        bytes += 1 + sourceLineBytes(candidate);
        grew = true;
      } else {
        canGrowAfter = false;
      }
    }
    if (!grew && !canGrowBefore && !canGrowAfter)
      break;
  }
  return { lines: rendered.slice(startIndex, endIndex + 1), startIndex, endIndex };
}
function sourceRangeFromBytes(content, startLine, endLine, targetLine = startLine, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_SOURCE_RANGE_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_SOURCE_RANGE_BYTES)
    throw new Error("Source range byte budget must be within the result body limit");
  const lines = [];
  let lineStart = 0;
  for (let newline = content.indexOf(10);newline >= 0; newline = content.indexOf(10, lineStart)) {
    lines.push(content.subarray(lineStart, newline));
    lineStart = newline + 1;
  }
  lines.push(content.subarray(lineStart));
  const boundedStart = Math.max(1, startLine);
  if (boundedStart > lines.length) {
    throw new SourceLineUnavailableError(targetLine);
  }
  const boundedEnd = Math.min(lines.length, Math.max(boundedStart, endLine));
  if (targetLine < 1 || targetLine > lines.length) {
    throw new SourceLineUnavailableError(targetLine);
  }
  const boundedTarget = Math.min(boundedEnd, Math.max(boundedStart, targetLine));
  const rendered = Array.from({ length: boundedEnd - boundedStart + 1 }, (_, index) => {
    const lineNumber = boundedStart + index;
    const raw = lines[lineNumber - 1];
    if (!raw)
      throw new Error("Source line is unavailable");
    const focus = lineNumber === targetLine ? options.focus : undefined;
    const start2 = focus?.range.start.character ?? 0;
    const end = focus?.range.end.character ?? start2;
    const bytes = focus?.range.encoding === "utf-8" ? raw : undefined;
    const excerpt = excerptText(raw.toString("utf8").replaceAll("\r", ""), bytes ? bytes.subarray(0, start2).toString("utf8").replaceAll("\r", "").length : start2, bytes ? bytes.subarray(0, end).toString("utf8").replaceAll("\r", "").length : end);
    return { line: lineNumber, text: excerpt.text, truncated: excerpt.truncated };
  });
  const selected = selectSourceWindow(rendered, boundedTarget - boundedStart, maxBytes);
  const omittedBefore = selected.startIndex;
  const omittedAfter = rendered.length - selected.endIndex - 1;
  return {
    text: selected.lines.map((line) => `${String(line.line)}: ${line.text}`).join(`
`),
    lines: selected.lines,
    startLine: boundedStart + selected.startIndex,
    endLine: boundedStart + selected.endIndex,
    truncated: omittedBefore > 0 || omittedAfter > 0,
    omittedBefore,
    omittedAfter,
    truncatedLines: selected.lines.filter((line) => line.truncated).map((line) => line.line)
  };
}

// src/scan-revisions.ts
import { resolve as resolve3 } from "path";
async function captureBatch(paths, revisions, signal) {
  if (signal?.aborted)
    throw abortError();
  await Promise.all(paths.map(async (path) => {
    const revision = await getSourceRevision(path);
    if (revision)
      revisions.set(path, revision);
  }));
  if (signal?.aborted)
    throw abortError();
}
async function captureCandidateRevisions(executable, args2, cwd, maxFiles, signal) {
  const revisions = new Map;
  let candidateCount = 0;
  const result = await runOwnedProcess({ executable, args: args2, cwd, ...signal ? { signal } : {} }, async (stdout) => {
    let pending = Buffer.alloc(0);
    let batch = [];
    for await (const chunk of stdout) {
      if (signal?.aborted)
        throw abortError();
      pending = Buffer.concat([pending, chunk]);
      let delimiter = pending.indexOf(0);
      while (delimiter >= 0) {
        const rawPath = pending.subarray(0, delimiter);
        if (rawPath.length > MAX_PROTOCOL_LINE_BYTES) {
          throw new SignalGrepError("ripgrep file path exceeds the protocol byte limit");
        }
        if (candidateCount < maxFiles) {
          const path = rawPath.toString("utf8");
          if (Buffer.from(path, "utf8").equals(rawPath)) {
            candidateCount += 1;
            batch.push(resolve3(cwd, path));
          }
          if (batch.length === MAX_SOURCE_REVISION_CONCURRENCY) {
            await captureBatch(batch, revisions, signal);
            batch = [];
          }
        }
        pending = pending.subarray(delimiter + 1);
        delimiter = pending.indexOf(0);
      }
      if (pending.length > MAX_PROTOCOL_LINE_BYTES) {
        throw new SignalGrepError("ripgrep file path exceeds the protocol byte limit");
      }
    }
    if (pending.length > 0) {
      throw new SignalGrepError("ripgrep file enumeration ended without a NUL delimiter");
    }
    await captureBatch(batch, revisions, signal);
  });
  const diagnostics = classifyRipgrepDiagnostics(result.stderr);
  if (result.code === 2 && diagnostics.other.length === 0 && diagnostics.unreadable.length > 0)
    return { revisions, unreadable: diagnostics.unreadable };
  if (result.code !== 0 && result.code !== 1) {
    throw new SignalGrepError(result.stderr.trim() || `ripgrep file enumeration exited with status ${String(result.code)}`);
  }
  return { revisions, unreadable: diagnostics.unreadable };
}
async function retainStableSourceRevisions(paths, before, signal) {
  const after = new Map;
  const candidates = [...paths].filter((path) => before.has(path));
  for (let offset = 0;offset < candidates.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    await captureBatch(candidates.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY), after, signal);
  }
  return new Map([...after].filter(([path, revision]) => {
    const initial = before.get(path);
    return initial !== undefined && sameSourceRevision(initial, revision);
  }));
}

// src/rg.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isRgText(value) {
  return isRecord(value) && (typeof value.text === "string" || typeof value.bytes === "string");
}
function isRgSubmatch(value) {
  if (!isRecord(value))
    return false;
  return isRgText(value.match) && typeof value.start === "number" && Number.isSafeInteger(value.start) && typeof value.end === "number" && Number.isSafeInteger(value.end) && value.start >= 0 && value.end >= value.start;
}
function isRgMatchEvent(value) {
  if (!isRecord(value) || value.type !== "match" || !isRecord(value.data))
    return false;
  const submatches = value.data.submatches;
  return isRgText(value.data.path) && isRgText(value.data.lines) && typeof value.data.line_number === "number" && Number.isSafeInteger(value.data.line_number) && value.data.line_number > 0 && (submatches === undefined || Array.isArray(submatches) && submatches.every(isRgSubmatch));
}
function decodeRgText(value, field) {
  if (typeof value.text === "string") {
    return { text: value.text, bytes: Buffer.from(value.text, "utf8"), encoding: "utf-16" };
  }
  if (typeof value.bytes === "string") {
    const bytes = Buffer.from(value.bytes, "base64");
    return { text: bytes.toString("utf8"), bytes, encoding: "utf-8" };
  }
  throw new SignalGrepError(`ripgrep JSON event omitted ${field}`);
}
function displayPath(rawPath, cwd) {
  const absolutePath = isAbsolute3(rawPath) ? rawPath : resolve4(cwd, rawPath);
  const localPath = relative2(cwd, absolutePath).replaceAll("\\", "/");
  const isInsideCwd = localPath !== ".." && !localPath.startsWith("../") && !isAbsolute3(localPath);
  return {
    absolutePath,
    displayPath: isInsideCwd && localPath.length > 0 ? localPath : absolutePath
  };
}
function jsonObjectEnd(value, start2, end) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start2;index < end; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped)
        escaped = false;
      else if (character === "\\")
        escaped = true;
      else if (character === '"')
        inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}")
      continue;
    depth -= 1;
    if (depth === 0)
      return index + 1;
  }
  return;
}
function jsonObjectStringProperty(value, property, pathStart) {
  let offset = pathStart + '"path"'.length;
  while (/\s/.test(value[offset] ?? ""))
    offset += 1;
  if (value[offset] !== ":")
    return;
  offset += 1;
  while (/\s/.test(value[offset] ?? ""))
    offset += 1;
  if (value[offset] !== "{")
    return;
  const objectEnd = jsonObjectEnd(value, offset, value.length);
  if (objectEnd === undefined)
    return;
  try {
    const parsed = JSON.parse(value.slice(offset, objectEnd));
    if (!isRecord(parsed))
      return;
    const candidate = parsed[property];
    return typeof candidate === "string" ? candidate : undefined;
  } catch {
    return;
  }
}
function oversizedMatchPath(prefix, cwd) {
  const pathStart = prefix.indexOf('"path"');
  if (pathStart < 0)
    return;
  const text = jsonObjectStringProperty(prefix, "text", pathStart);
  if (text !== undefined)
    return displayPath(text, cwd);
  const encoded = jsonObjectStringProperty(prefix, "bytes", pathStart);
  if (encoded === undefined)
    return;
  const bytes = Buffer.from(encoded, "base64");
  const decoded = bytes.toString("utf8");
  return Buffer.from(decoded, "utf8").equals(bytes) ? displayPath(decoded, cwd) : undefined;
}
async function assertSearchTargetIdentity(policy, path, expectedCanonical) {
  const currentCanonical = await policy.resolveExistingPath(path);
  if (currentCanonical !== expectedCanonical) {
    throw new SignalGrepError("Search target changed during validation; retry the search");
  }
}
async function assertRetainedPathsAllowed(policy, paths, signal) {
  for (let offset = 0;offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted)
      throw abortError();
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    await Promise.all(batch.map((path) => policy.resolveExistingPath(path)));
  }
}
function utf16Length(value) {
  return value.length;
}
function byteOffsetToCharacter(bytes, byteOffset, encoding) {
  if (byteOffset < 0 || byteOffset > bytes.length) {
    throw new SignalGrepError("ripgrep emitted a submatch outside its matching line");
  }
  if (encoding === "utf-8")
    return byteOffset;
  const prefix = bytes.subarray(0, byteOffset).toString("utf8").replaceAll("\r", "");
  return utf16Length(prefix);
}
function createOccurrences(lineNumber, decodedLine, submatches) {
  const range = {
    start: { line: lineNumber - 1, character: 0 },
    end: { line: lineNumber - 1, character: 0 },
    encoding: decodedLine.encoding
  };
  const occurrences = [];
  for (const submatch of submatches) {
    if (submatch.end > decodedLine.bytes.length) {
      throw new SignalGrepError("ripgrep emitted a submatch outside its matching line");
    }
    occurrences.push({
      byteStart: submatch.start,
      byteEnd: submatch.end,
      range: {
        start: {
          ...range.start,
          character: byteOffsetToCharacter(decodedLine.bytes, submatch.start, range.encoding)
        },
        end: {
          ...range.end,
          character: byteOffsetToCharacter(decodedLine.bytes, submatch.end, range.encoding)
        },
        encoding: range.encoding
      }
    });
  }
  return occurrences;
}
function fileScopeArguments(request) {
  const args2 = [];
  if (request.hidden)
    args2.push("--hidden");
  for (const glob of request.glob)
    args2.push("--glob", glob);
  for (const excluded of request.exclude) {
    const normalized = excluded.startsWith("!") ? excluded : `!${excluded}`;
    args2.push("--glob", normalized);
  }
  args2.push("--iglob", "!.git", "--iglob", "!.git/**", "--iglob", "!**/.git/**");
  return args2;
}
function buildRipgrepArguments(request, cwd, validatedSearchPath) {
  const searchPath = validatedSearchPath ?? resolve4(cwd, request.path ?? ".");
  const policy = new SearchPathPolicy(cwd);
  policy.assertPath(searchPath);
  const args2 = [
    "--no-config",
    "--json",
    "--line-number",
    "--color=never",
    "--no-heading",
    ...fileScopeArguments(request),
    ...policy.ripgrepGlobArguments(searchPath)
  ];
  args2.push(...patternArguments(request));
  const searchTarget = isPathInsideCwd(searchPath, cwd) ? relative2(resolve4(cwd), searchPath) || "." : searchPath;
  args2.push("--", request.pattern, searchTarget);
  return args2;
}
function patternArguments(request) {
  return [
    ...request.wholeWord ? ["--word-regexp"] : [],
    ...request.literal ? ["--fixed-strings"] : [],
    request.ignoreCase === true ? "--ignore-case" : request.ignoreCase === false ? "--case-sensitive" : "--smart-case"
  ];
}
function createRipgrepRunner(options = {}) {
  const maxStoredMatches = options.maxStoredMatches ?? MAX_STORED_MATCHES;
  const maxEventBytes = options.maxEventBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const maxSourceRevisionFiles = options.maxSourceRevisionFiles ?? MAX_SOURCE_REVISION_FILES;
  return async function runRipgrep(request, cwd, signal) {
    if (signal?.aborted)
      throw abortError();
    const executable = options.executable ?? await resolveRipgrepExecutable();
    const searchPath = resolve4(cwd, request.path ?? ".");
    const policy = new SearchPathPolicy(cwd);
    const validatedSearchPath = await policy.resolveSearchTarget(searchPath);
    const expectedSearchTarget = await policy.resolveExistingPath(validatedSearchPath);
    const searchTarget = isPathInsideCwd(validatedSearchPath, cwd) ? relative2(resolve4(cwd), validatedSearchPath) || "." : validatedSearchPath;
    const args2 = buildRipgrepArguments(request, cwd, validatedSearchPath);
    if (signal?.aborted)
      throw abortError();
    const matches = [];
    const retention = new SearchRetention(options.maxStoredBytes, options.maxStoredOccurrences);
    const fileCounts = new Map;
    const lossyPaths = new Set;
    const oversizedPathReasons = new Set;
    let totalMatches = 0;
    let truncatedLines = 0;
    let modificationTimeFilterIncomplete = false;
    let candidateRevisions = new Map;
    const onLine = (line) => {
      if (line.length === 0)
        return;
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        throw new SignalGrepError("Failed to parse ripgrep JSON output", { cause: error });
      }
      if (!isRecord(event) || event.type !== "match")
        return;
      if (!isRgMatchEvent(event)) {
        throw new SignalGrepError("ripgrep emitted an invalid match event");
      }
      const rawPath = decodeRgText(event.data.path, "path");
      const rawContent = decodeRgText(event.data.lines, "line content");
      const normalizedContent = rawContent.text.replaceAll("\r", "").replace(/\n$/, "");
      const path = displayPath(rawPath.text, cwd);
      if (request.modifiedAfterMs !== undefined || request.modifiedBeforeMs !== undefined) {
        const revision = candidateRevisions.get(path.absolutePath);
        if (!revision) {
          modificationTimeFilterIncomplete = true;
          retention.noteLimit(`Modification time could not be verified for ${path.displayPath}; matching evidence was retained`);
        } else if (!matchesModificationTime(revision, request.modifiedAfterMs, request.modifiedBeforeMs)) {
          return;
        }
      }
      if (rawPath.encoding === "utf-8")
        lossyPaths.add(path.absolutePath);
      const submatches = event.data.submatches ?? [];
      if (submatches.some((match) => match.end > rawContent.bytes.length))
        throw new SignalGrepError("ripgrep emitted a submatch outside its matching line");
      const primaryOccurrence = submatches[0];
      let focusStart = 0;
      let focusEnd = 0;
      if (primaryOccurrence) {
        focusStart = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.start, "utf-16");
        focusEnd = byteOffsetToCharacter(rawContent.bytes, primaryOccurrence.end, "utf-16");
      }
      const excerpt = excerptText(normalizedContent, focusStart, focusEnd);
      const { text: lineContent, truncated: lineTruncated } = excerpt;
      totalMatches += 1;
      if (!fileCounts.has(path.displayPath)) {
        if (retention.file(path.displayPath, path.absolutePath))
          fileCounts.set(path.displayPath, 0);
      }
      if (fileCounts.has(path.displayPath))
        fileCounts.set(path.displayPath, (fileCounts.get(path.displayPath) ?? 0) + 1);
      if (lineTruncated)
        truncatedLines += 1;
      if (matches.length >= maxStoredMatches)
        retention.noteLimit(`Matching-line retention reached the ${String(maxStoredMatches)} limit`);
      if (matches.length < maxStoredMatches && retention.canRetainOccurrences(submatches.length)) {
        const match = {
          ...path,
          lineNumber: event.data.line_number,
          lineContent,
          lineTruncated,
          occurrences: createOccurrences(event.data.line_number, rawContent, submatches)
        };
        if (retention.retain(match))
          matches.push(match);
      }
    };
    try {
      const before = await captureCandidateRevisions(executable, [
        "--no-config",
        "--files",
        "--null",
        ...fileScopeArguments(request),
        ...policy.ripgrepGlobArguments(validatedSearchPath),
        "--",
        searchTarget
      ], cwd, maxSourceRevisionFiles, signal);
      if (hasRequestedRootUnreadable(before.unreadable, cwd, validatedSearchPath))
        throw new SignalGrepError(describeUnreadableDiagnostics(before.unreadable));
      candidateRevisions = before.revisions;
      if (before.unreadable.length > 0)
        retention.noteLimit(describeUnreadableDiagnostics(before.unreadable));
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const { code, stderr } = await runOwnedProcess({ executable, args: args2, cwd, ...signal ? { signal } : {} }, (stdout) => consumeCappedLines(stdout, onLine, {
        maxLineBytes: maxEventBytes,
        onLineTooLong: ({ prefix, observedBytes }) => {
          const source = oversizedMatchPath(prefix, cwd);
          const label = source?.displayPath ?? "unknown source";
          if (oversizedPathReasons.has(label))
            return;
          oversizedPathReasons.add(label);
          retention.noteLimit(`Skipped oversized ripgrep match line in ${JSON.stringify(label)}; observed at least ${String(observedBytes)} bytes, limit is ${String(maxEventBytes)} bytes`);
        }
      }));
      const diagnostics = classifyRipgrepDiagnostics(stderr);
      if (hasRequestedRootUnreadable(diagnostics.unreadable, cwd, validatedSearchPath))
        throw new SignalGrepError(describeUnreadableDiagnostics(diagnostics.unreadable));
      if (diagnostics.unreadable.length > 0)
        retention.noteLimit(describeUnreadableDiagnostics(diagnostics.unreadable));
      if (code === 2 && (diagnostics.other.length > 0 || diagnostics.unreadable.length === 0)) {
        throw new SignalGrepError(stderr.trim() || `ripgrep exited with status ${String(code)}`);
      }
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const retainedPaths = new Set(matches.map((match) => match.absolutePath).filter((path) => !lossyPaths.has(path)));
      await assertRetainedPathsAllowed(policy, [...retainedPaths], signal);
      const sourceRevisions = await retainStableSourceRevisions(retainedPaths, before.revisions, signal);
      if (signal?.aborted)
        throw abortError();
      return {
        request,
        matches,
        totalMatches,
        fileCounts,
        sourceRevisions,
        snapshotComplete: matches.length === totalMatches && !modificationTimeFilterIncomplete && retention.details.reasons.length === 0,
        truncatedLines,
        retention: retention.details
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        throw abortError();
      const cause = error instanceof Error ? error : new Error(String(error));
      const executableMissing = "code" in cause && cause.code === "ENOENT";
      const message = executableMissing ? `ripgrep executable not found: ${executable}` : cause.message;
      throw new SignalGrepError(message, { cause });
    }
  };
}

// src/structure.ts
import { isAbsolute as isAbsolute4, resolve as resolve5 } from "path";
var CTAGS_CAPABILITY_ARGUMENTS = [
  "--output-format=json",
  "--fields=+ne",
  "--extras=-p"
];

class CtagsCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = "CtagsCommandError";
  }
}

class CtagsProtocolError extends SignalGrepError {
}
function hasCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function asOptionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function asOptionalPositiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
function parseCtagsTag(value) {
  if (!isRecord2(value))
    return;
  const hasTagType = Object.entries(value).some(([key, entry]) => key === "_type" && entry === "tag");
  if (!hasTagType)
    return;
  const path = asOptionalString(value.path);
  const name2 = asOptionalString(value.name);
  const language = asOptionalString(value.language);
  const kind = asOptionalString(value.kind);
  const scope = asOptionalString(value.scope);
  const line = asOptionalPositiveInteger(value.line);
  const end = asOptionalPositiveInteger(value.end);
  if (!path || !name2)
    return;
  return {
    path,
    name: name2,
    ...language ? { language } : {},
    ...kind ? { kind } : {},
    ...scope ? { scope } : {},
    ...line ? { line } : {},
    ...end ? { end } : {}
  };
}
async function runCtagsCommand(executable, absolutePath, cwd, signal) {
  const tags = [];
  const { code, stderr } = await runOwnedProcess({
    executable,
    args: [...CTAGS_CAPABILITY_ARGUMENTS, absolutePath],
    cwd,
    ...signal ? { signal } : {}
  }, async (stdout) => {
    try {
      await consumeCappedLines(stdout, (line) => {
        if (line.length === 0)
          return;
        let value;
        try {
          value = JSON.parse(line);
        } catch (error) {
          throw new CtagsProtocolError("Failed to parse Universal Ctags JSON output", {
            cause: error
          });
        }
        const tag = parseCtagsTag(value);
        if (tag)
          tags.push(tag);
      }, { maxLineBytes: MAX_PROTOCOL_LINE_BYTES });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Input line exceeds the ")) {
        throw new CtagsProtocolError(error.message, { cause: error });
      }
      throw error;
    }
  });
  if (code !== 0) {
    throw new CtagsCommandError(stderr.trim() || `ctags exited with status ${String(code)}`);
  }
  return tags;
}
function pathMatches(tagPath, absolutePath, cwd) {
  return resolve5(isAbsolute4(tagPath) ? tagPath : resolve5(cwd, tagPath)) === resolve5(absolutePath);
}
function symbolFromTag(tag) {
  if (tag.line === undefined || tag.end === undefined || tag.end < tag.line)
    return;
  return {
    name: tag.name,
    kind: tag.kind ?? "unknown",
    scope: tag.scope ? [tag.scope] : [],
    range: { startLine: tag.line, endLine: tag.end }
  };
}
function chooseEnclosingSymbol(tags, absolutePath, cwd, line) {
  const candidates = tags.filter((tag) => pathMatches(tag.path, absolutePath, cwd)).map(symbolFromTag).filter((symbol) => symbol !== undefined).filter((symbol) => symbol.range.startLine <= line && line <= symbol.range.endLine).toSorted((left, right) => {
    const leftSize = left.range.endLine - left.range.startLine;
    const rightSize = right.range.endLine - right.range.startLine;
    if (leftSize !== rightSize)
      return leftSize - rightSize;
    return right.scope.length - left.scope.length;
  });
  return candidates[0];
}
function createCtagsStructureProvider(options = {}) {
  const executable = options.executable ?? "ctags";
  const maxFileBytes = options.maxFileBytes ?? MAX_SOURCE_FILE_BYTES;
  const runCtags = options.runCtags ?? ((absolutePath, cwd, signal) => runCtagsCommand(executable, absolutePath, cwd, signal));
  return {
    async inspect(request, signal) {
      if (signal?.aborted)
        throw abortError();
      const currentRevision = await getSourceRevision(request.absolutePath);
      if (!currentRevision) {
        return { details: { status: "source-unavailable", provider: "universal-ctags" } };
      }
      if (request.expectedRevision && !sameSourceRevision(request.expectedRevision, currentRevision)) {
        return {
          details: { status: "source-changed", provider: "universal-ctags" },
          currentRevision
        };
      }
      if (currentRevision.size > maxFileBytes) {
        return {
          details: { status: "file-too-large", provider: "universal-ctags" },
          currentRevision
        };
      }
      let tags;
      try {
        tags = await runCtags(request.absolutePath, request.cwd, signal);
      } catch (error) {
        if (signal?.aborted || error instanceof Error && error.name === "AbortError") {
          throw abortError();
        }
        if (hasCode(error, "ENOENT") || error instanceof CtagsCommandError) {
          return {
            details: {
              status: "provider-unavailable",
              provider: "universal-ctags",
              reason: "Universal Ctags is unavailable; install universal-ctags or use JS/TS/Python outline support"
            },
            currentRevision
          };
        }
        if (error instanceof CtagsProtocolError) {
          return {
            details: {
              status: "parse-error",
              provider: "universal-ctags",
              reason: "Universal Ctags returned invalid JSON output; check the installed provider"
            },
            currentRevision
          };
        }
        throw error;
      }
      const symbol = chooseEnclosingSymbol(tags, request.absolutePath, request.cwd, request.line);
      const language = tags.find((tag) => tag.language)?.language;
      return {
        details: {
          status: symbol ? "available" : "no-symbol",
          provider: "universal-ctags",
          ...language ? { language } : {},
          ...symbol ? { symbol, range: symbol.range } : {}
        },
        currentRevision
      };
    }
  };
}

// src/session-summary.ts
var SESSION_STATUS_KEY = "baoer_signal_grep_session";
function isNewQuery(input) {
  return input.cursor === undefined && input.sourceCursor === undefined;
}
function wasAutomaticallyOrganized(input, result) {
  const autoMode = input.mode === undefined || input.mode === "auto";
  return autoMode && input.limit === undefined && result.details.summaryFilesShown !== undefined;
}

class SessionSummary {
  #snapshot = {
    queries: 0,
    completeQueries: 0,
    organizedQueries: 0
  };
  record(input, result) {
    if (!isNewQuery(input))
      return;
    this.#snapshot.queries += 1;
    if (result.details.status === "complete")
      this.#snapshot.completeQueries += 1;
    if (wasAutomaticallyOrganized(input, result))
      this.#snapshot.organizedQueries += 1;
  }
  get snapshot() {
    return { ...this.#snapshot };
  }
  format(locale) {
    const { completeQueries, organizedQueries, queries } = this.#snapshot;
    if (queries === 0)
      return;
    const partialQueries = queries - completeQueries;
    if (locale === "zh-CN") {
      const completeness = partialQueries === 0 ? "\u7ED3\u679C\u5168\u90E8\u5B8C\u6574" : `${String(completeQueries)} \u6B21\u7ED3\u679C\u5B8C\u6574\uFF1B${String(partialQueries)} \u6B21\u4EC5\u83B7\u5F97\u90E8\u5206\u7ED3\u679C\u5E76\u5DF2\u660E\u786E\u6807\u6CE8`;
      const organized = organizedQueries > 0 ? `\uFF1B${String(organizedQueries)} \u6B21\u7ED3\u679C\u5DF2\u81EA\u52A8\u6309\u6587\u4EF6\u6574\u7406` : "";
      return `baoer_signal_grep\uFF1A\u5DF2\u5904\u7406 ${String(queries)} \u6B21\u67E5\u8BE2\uFF0C${completeness}${organized}`;
    }
    const completeness = partialQueries === 0 ? "all results complete" : `${String(completeQueries)} complete; ${String(partialQueries)} partial and clearly marked`;
    const organized = organizedQueries > 0 ? `; ${String(organizedQueries)} ${organizedQueries === 1 ? "result" : "results"} automatically organized by file` : "";
    return `baoer_signal_grep: handled ${String(queries)} ${queries === 1 ? "query" : "queries"}; ${completeness}${organized}`;
  }
}

// src/runtime.ts
class SignalGrepRuntime {
  #service;
  #summary = new SessionSummary;
  constructor(service) {
    this.#service = service;
  }
  async search(input, cwd, signal, contextBudget) {
    const searchOptions = {};
    if (contextBudget)
      searchOptions.contextBudget = contextBudget;
    const result = await this.#service.search(input, cwd, signal, searchOptions);
    this.#summary.record(input, result);
    return result;
  }
  get sessionSummary() {
    return this.#summary.snapshot;
  }
  formatSessionStatus(locale) {
    return this.#summary.format(locale);
  }
  clear() {
    this.#service.clear();
  }
  async shutdown() {
    await this.#service.shutdown();
  }
  get snapshotCount() {
    return this.#service.snapshotCount;
  }
  get storedMatches() {
    return this.#service.storedMatches;
  }
}

// src/service.ts
import { createHash as createHash3 } from "crypto";

// src/analysis-evidence.ts
function sourceEvidence(document2, range) {
  const line = document2.lineAt(range.start);
  const lineRange = document2.lineRange(line);
  const lineStart = document2.toCharacterOffset(lineRange.start);
  const lineEnd = document2.toCharacterOffset(lineRange.end);
  const focus = document2.toCharacterOffset(range.start);
  const focusEnd = document2.toCharacterOffset(range.end);
  let start2 = Math.max(lineStart, focus - Math.floor(Math.max(0, MAX_LINE_CHARACTERS - (focusEnd - focus)) / 2));
  let end = Math.min(lineEnd, start2 + MAX_LINE_CHARACTERS);
  const startCode = document2.text.charCodeAt(start2);
  const endCode = document2.text.charCodeAt(end);
  if (startCode >= 56320 && startCode <= 57343)
    start2--;
  if (endCode >= 56320 && endCode <= 57343)
    end--;
  const excerptRange = { start: document2.toByteOffset(start2), end: document2.toByteOffset(end) };
  return {
    range: { ...range },
    line,
    excerpt: `${start2 > lineStart ? "\u2026" : ""}${document2.text.slice(start2, end)}${end < lineEnd ? "\u2026" : ""}`,
    excerptRange,
    excerptTruncated: start2 > lineStart || end < lineEnd
  };
}
function rangeEvidence(document2, range) {
  const start2 = document2.toCharacterOffset(range.start);
  const rangeEnd = document2.toCharacterOffset(range.end);
  let end = Math.min(rangeEnd, start2 + MAX_LINE_CHARACTERS);
  const code = document2.text.charCodeAt(end);
  if (code >= 56320 && code <= 57343)
    end -= 1;
  return {
    excerpt: `${document2.text.slice(start2, end)}${end < rangeEnd ? "\u2026" : ""}`,
    excerptRange: { start: range.start, end: document2.toByteOffset(end) },
    excerptTruncated: end < rangeEnd
  };
}

// src/semantic-sources.ts
import { pathToFileURL } from "url";
import { realpath as realpath3 } from "fs/promises";
import { resolve as resolve6 } from "path";
async function semanticSources(cwd, documents) {
  const known = new Map;
  const policy = new SearchPathPolicy(cwd);
  for (const document2 of documents) {
    const absolute = resolve6(cwd, document2.path);
    known.set(absolute, document2);
    known.set(await realpath3(absolute), document2);
  }
  return async (path) => {
    const absolute = resolve6(cwd, path);
    policy.assertPath(absolute);
    const direct = known.get(absolute);
    if (direct)
      return direct;
    try {
      return known.get(await realpath3(absolute));
    } catch (error) {
      if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR"))
        return;
      throw error;
    }
  };
}
async function semanticUri(cwd, path) {
  return pathToFileURL(await realpath3(resolve6(cwd, path))).href;
}

// src/impact-bindings.ts
import { resolve as resolve7 } from "path";

// src/semantic-protocol.ts
import { fileURLToPath } from "url";

// src/owned-json-rpc.ts
var MAX_RPC_FRAME_BYTES = 16 * 1024 * 1024;
var MAX_RPC_TOTAL_BYTES = 64 * 1024 * 1024;
function rpcRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

class JsonRpcChannel {
  #stdin;
  #pending = new Map;
  #onRequest;
  #nextId = 0;
  #closed = false;
  #inputEnded = false;
  constructor(stdin, onRequest) {
    this.#stdin = stdin;
    this.#onRequest = onRequest;
  }
  async#send(message) {
    if (this.#closed)
      throw new SignalGrepError("Language-service connection closed");
    const body2 = Buffer.from(JSON.stringify(message));
    if (body2.length > MAX_RPC_FRAME_BYTES)
      throw new SignalGrepError("Language-service request exceeds the frame budget");
    const frame = Buffer.concat([
      Buffer.from(`Content-Length: ${String(body2.length)}\r
\r
`),
      body2
    ]);
    await new Promise((resolve, reject) => {
      this.#stdin.write(frame, (error) => error ? reject(error) : resolve());
    });
  }
  async request(method, params) {
    if (this.#pending.size >= 32)
      throw new SignalGrepError("Language-service request concurrency exceeded");
    const id = ++this.#nextId;
    const deferred = Promise.withResolvers();
    this.#pending.set(id, deferred);
    try {
      const [, response] = await Promise.all([
        this.#send({ jsonrpc: "2.0", id, method, params }),
        deferred.promise
      ]);
      return response;
    } finally {
      this.#pending.delete(id);
    }
  }
  notify(method, params) {
    return this.#send({ jsonrpc: "2.0", method, ...params === undefined ? {} : { params } });
  }
  async accept(value) {
    if (!rpcRecord(value) || value.jsonrpc !== "2.0")
      throw new SignalGrepError("Invalid language-service JSON-RPC message");
    if (typeof value.method === "string") {
      if (this.#inputEnded)
        return;
      if (value.id === undefined)
        return;
      if (typeof value.id !== "number" && typeof value.id !== "string")
        throw new SignalGrepError("Invalid language-service request id");
      const result = this.#onRequest(value.method, value.params);
      await this.#send({ jsonrpc: "2.0", id: value.id, result });
      return;
    }
    if (typeof value.id !== "number")
      throw new SignalGrepError("Invalid language-service response id");
    const pending = this.#pending.get(value.id);
    if (!pending)
      throw new SignalGrepError("Unexpected language-service response id");
    if (value.error !== undefined) {
      if (!rpcRecord(value.error) || typeof value.error.message !== "string")
        throw new SignalGrepError("Invalid language-service error");
      pending.reject(new SignalGrepError(`Language service: ${value.error.message}`));
    } else if ("result" in value)
      pending.resolve(value.result);
    else
      throw new SignalGrepError("Language-service response omitted its result");
  }
  endInput() {
    if (this.#pending.size)
      throw new Error("Cannot end JSON-RPC input with pending requests");
    this.#inputEnded = true;
    this.#stdin.end();
  }
  close() {
    this.#closed = true;
    for (const pending of this.#pending.values())
      pending.reject(new SignalGrepError("Language service closed before responding"));
    this.#pending.clear();
  }
}
async function readMessages(stdout, channel) {
  let buffered = Buffer.alloc(0);
  let total = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for await (const chunk of stdout) {
      total += chunk.byteLength;
      if (total > MAX_RPC_TOTAL_BYTES)
        throw new SignalGrepError("Language-service output exceeds the 64 MiB protocol budget");
      buffered = Buffer.concat([buffered, chunk]);
      while (buffered.length) {
        const boundary = buffered.indexOf(`\r
\r
`);
        if (boundary < 0) {
          if (buffered.length > 8192)
            throw new SignalGrepError("Language-service header exceeds the framing budget");
          break;
        }
        if (boundary > 8192)
          throw new SignalGrepError("Language-service header exceeds the framing budget");
        const headers = buffered.subarray(0, boundary).toString("ascii");
        const fields = [...headers.matchAll(/^Content-Length:\s*(\d+)\s*$/gim)];
        if (fields.length !== 1)
          throw new SignalGrepError("Invalid language-service frame header");
        const length = Number(fields[0]?.[1]);
        if (!Number.isSafeInteger(length) || length < 0 || length > MAX_RPC_FRAME_BYTES)
          throw new SignalGrepError("Language-service frame exceeds the 16 MiB limit");
        const end = boundary + 4 + length;
        if (buffered.length < end)
          break;
        const value = JSON.parse(decoder.decode(buffered.subarray(boundary + 4, end)));
        buffered = buffered.subarray(end);
        await channel.accept(value);
      }
    }
    if (buffered.length)
      throw new SignalGrepError("Language service closed with an incomplete frame");
  } finally {
    channel.close();
  }
}
async function runOwnedJsonRpc(options, operation, onRequest) {
  let completed;
  const result = await runOwnedProcess({ ...options, interactive: true }, async (stdout, stdin) => {
    if (!stdin)
      throw new Error("Missing interactive language-service stdin");
    const channel = new JsonRpcChannel(stdin, onRequest);
    try {
      await Promise.all([
        readMessages(stdout, channel),
        operation(channel).then((value) => {
          completed = { value };
          return;
        })
      ]);
    } finally {
      channel.close();
    }
  });
  if (result.code !== 0)
    throw new SignalGrepError(`Language-service process failed (${String(result.code)}): ${result.stderr}`);
  if (!completed)
    throw new Error("Language-service operation did not complete");
  return completed.value;
}

// src/semantic-protocol.ts
var SEMANTIC_MODES = [
  "definitions",
  "references",
  "implementations",
  "callers",
  "callees",
  "dependencies",
  "dependents"
];
function isSemanticMode(mode) {
  return SEMANTIC_MODES.some((candidate) => candidate === mode);
}
function readPosition(value) {
  if (!rpcRecord(value) || typeof value.line !== "number" || !Number.isSafeInteger(value.line) || value.line < 0 || typeof value.character !== "number" || !Number.isSafeInteger(value.character) || value.character < 0)
    throw new SignalGrepError("Invalid compiler source position");
  return { line: value.line, character: value.character };
}
function lspRange(value) {
  if (!rpcRecord(value))
    throw new SignalGrepError("Invalid compiler source range");
  const start2 = readPosition(value.start), end = readPosition(value.end);
  if (end.line < start2.line || end.line === start2.line && end.character < start2.character)
    throw new SignalGrepError("Reversed compiler source range");
  return { start: start2, end };
}
function semanticLocation(value) {
  if (!rpcRecord(value))
    throw new SignalGrepError("Invalid compiler location");
  const uri = value.targetUri ?? value.uri;
  if (typeof uri !== "string" || !uri.startsWith("file:"))
    throw new SignalGrepError("Compiler returned a non-file location");
  return {
    path: fileURLToPath(uri),
    range: lspRange(value.targetSelectionRange ?? value.selectionRange ?? value.range)
  };
}
function locations(value) {
  if (value === null)
    return [];
  return (Array.isArray(value) ? value : [value]).map(semanticLocation);
}
function byteAt(document2, position) {
  const line = document2.lineRange(position.line + 1);
  const character = document2.toCharacterOffset(line.start) + position.character;
  const end = document2.toCharacterOffset(line.end);
  if (character > end || position.line + 1 < document2.lineStarts.length && character === end)
    throw new SignalGrepError("Compiler column is outside the source line");
  return document2.toByteOffset(character);
}
function byteRange(document2, range) {
  return { start: byteAt(document2, range.start), end: byteAt(document2, range.end) };
}
function lspPosition(document2, character) {
  const value = document2.positionAt(document2.toByteOffset(character));
  return { line: value.line - 1, character: value.column - 1 };
}

// src/owned-task-queue.ts
class OwnedTaskQueue {
  #tail = Promise.resolve();
  async run(operation, signal) {
    if (signal?.aborted)
      throw abortError();
    const previous = this.#tail;
    const completed = Promise.withResolvers();
    this.#tail = previous.then(() => completed.promise);
    const cancelled = Promise.withResolvers();
    const abort2 = () => cancelled.reject(abortError());
    signal?.addEventListener("abort", abort2, { once: true });
    if (signal?.aborted)
      abort2();
    try {
      await Promise.race([previous, cancelled.promise]);
      if (signal?.aborted)
        throw abortError();
      return await operation();
    } finally {
      signal?.removeEventListener("abort", abort2);
      completed.resolve();
    }
  }
}

// src/typescript-client.ts
import { createRequire as createRequire2 } from "module";
import { dirname, join as join2 } from "path";
var compilerQueue = new OwnedTaskQueue;
var TYPESCRIPT_QUERY_TIMEOUT_MS = 20000;
var preferences = {
  disableAutomaticTypeAcquisition: true,
  tsserver: { automaticTypeAcquisition: { enabled: false } },
  implicitProjectConfig: { checkJs: true, allowJs: true, typeAcquisition: { enabled: false } },
  preferences: { includePackageJsonAutoImports: "off" }
};
function serverRequest(method, params) {
  if (method === "workspace/configuration") {
    if (!rpcRecord(params) || !Array.isArray(params.items))
      throw new SignalGrepError("Invalid language-service configuration request");
    return params.items.map(() => preferences);
  }
  if (method === "client/registerCapability" || method === "client/unregisterCapability" || method === "window/workDoneProgress/create")
    return null;
  if (method === "workspace/applyEdit")
    return { applied: false, failureReason: "Search is read-only" };
  throw new SignalGrepError(`Unsupported language-service client request: ${method}`);
}
function executablePath() {
  const packageName = `@typescript/typescript-${process.platform}-${process.arch}`;
  try {
    const metadata2 = createRequire2(import.meta.url).resolve(`${packageName}/package.json`);
    return join2(dirname(metadata2), "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
  } catch (error) {
    throw new SignalGrepError(`TypeScript semantic provider is unavailable for ${process.platform}/${process.arch}; reinstall with optional dependencies enabled`, { cause: error });
  }
}
async function runTypeScript(cwd, documents, operation, parent, sourceCwd = cwd) {
  const executable = executablePath();
  const deadline = new AbortController;
  const signal = parent ? AbortSignal.any([parent, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(), TYPESCRIPT_QUERY_TIMEOUT_MS);
  try {
    return await runOwnedJsonRpc({
      executable,
      args: ["--lsp", "--stdio"],
      cwd,
      signal,
      env: { ...process.env, PATH: dirname(executable), GOMEMLIMIT: "256MiB" }
    }, async (channel) => {
      const initialized = await channel.request("initialize", {
        processId: process.pid,
        rootUri: await semanticUri(cwd, "."),
        capabilities: {
          workspace: {
            configuration: true,
            didChangeWatchedFiles: { dynamicRegistration: true }
          },
          textDocument: {
            definition: { linkSupport: true },
            implementation: { linkSupport: true },
            callHierarchy: {}
          },
          general: { positionEncodings: ["utf-16"] }
        },
        initializationOptions: { runExternalCode: false, disablePushDiagnostics: true }
      });
      if (!rpcRecord(initialized) || !rpcRecord(initialized.capabilities))
        throw new SignalGrepError("Language service omitted its capabilities");
      await channel.notify("initialized", {});
      await channel.notify("workspace/didChangeConfiguration", {
        settings: { "js/ts": preferences, typescript: preferences, javascript: preferences }
      });
      for (const document2 of documents) {
        const uri = await semanticUri(sourceCwd, document2.path);
        await channel.notify("textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: /\.tsx$/i.test(document2.path) ? "typescriptreact" : /\.jsx$/i.test(document2.path) ? "javascriptreact" : /\.[cm]?ts$/i.test(document2.path) ? "typescript" : "javascript",
            version: 1,
            text: document2.text
          }
        });
      }
      const result = await operation(channel, initialized.capabilities);
      await channel.request("shutdown", undefined);
      channel.endInput();
      return result;
    }, serverRequest);
  } catch (error) {
    if (parent?.aborted)
      throw abortError();
    if (deadline.signal.aborted)
      throw new SignalGrepError(`TypeScript semantic query exceeded the ${String(TYPESCRIPT_QUERY_TIMEOUT_MS)} ms deadline`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function withTypeScript(cwd, documents, operation, parent, sourceCwd = cwd) {
  return compilerQueue.run(() => runTypeScript(cwd, documents, operation, parent, sourceCwd), parent);
}

// src/syntax.ts
import { dirname as dirname2, extname } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/analysis-limits.ts
var MAX_STRUCTURE_FILES = 200;
var MAX_CONFIGURABLE_STRUCTURE_FILES = 2000;
var MAX_STRUCTURE_BYTES = 32 * 1024 * 1024;
var MAX_SYNTAX_CACHE_ENTRIES = 256;
var MAX_SYNTAX_CACHE_NODES = 1e6;
var MAX_GIT_DIFF_WORK = 2000000;
var MAX_SYNTAX_NODES = 1e5;
var MAX_PARSE_TIME_MS = 5000;
var MAX_ANALYSIS_RESULTS = 50000;
var MAX_ANALYSIS_SNAPSHOTS = 20;
var MAX_ANALYSIS_STORAGE_BYTES = 32 * 1024 * 1024;
var ANALYSIS_METADATA_RESERVE_BYTES = 64 * 1024;
var MAX_ANALYSIS_REASONS = 64;
var MAX_ANALYSIS_REASON_BYTES = 4 * 1024;
var MIN_ANY_OF_TERMS = 2;
var MAX_ANY_OF_TERMS = 8;
var MAX_ANY_OF_TOTAL_TERMS = 64;
var MAX_LITERAL_TERM_BYTES = 256;
var ANALYSIS_TTL_MS = 10 * 60 * 1000;
var MAX_SOURCE_CONTINUATIONS = 20;
var MAX_SOURCE_CONTINUATION_BYTES = 1024 * 1024;
var MAX_IMPORT_HOPS = 8;
var MAX_IMPORT_FILES = 20;
var DEFAULT_HYBRID_CONCEPT_LIMIT = 3;
var MAX_HYBRID_CONCEPT_LIMIT = 20;

// src/syntax-tree.ts
function syntaxField(analysis, node, field) {
  return analysis.children[node]?.find((child) => analysis.nodes[child]?.field === field);
}
function syntaxFields(analysis, node, field) {
  return analysis.children[node]?.filter((child) => analysis.nodes[child]?.field === field) ?? [];
}
function syntaxText(node, text) {
  return text.slice(node.start, node.end);
}
function syntaxChildren(nodes) {
  const children = Array.from({ length: nodes.length }, () => []);
  for (let i2 = 0;i2 < nodes.length; i2++) {
    const parent = nodes[i2]?.parent;
    if (parent !== null && parent !== undefined)
      children[parent]?.push(i2);
  }
  return children;
}

// src/syntax-facts.ts
var IMPLEMENTATIONS = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "generator_function",
  "arrow_function",
  "method_definition",
  "method_declaration",
  "func_literal"
]);
var SIGNATURES = new Set([
  "function_signature",
  "method_signature",
  "abstract_method_signature",
  "construct_signature",
  "call_signature",
  "method_elem"
]);
var CONTAINERS = new Set([
  "class_declaration",
  "abstract_class_declaration",
  "class",
  "interface_declaration"
]);
var TYPE_SYMBOLS = new Set([
  "type_alias_declaration",
  "enum_declaration",
  "type_spec",
  "type_alias"
]);
var BINDING_IDENTIFIERS = new Set([
  "identifier",
  "shorthand_property_identifier_pattern",
  "private_property_identifier",
  "property_identifier",
  "type_identifier",
  "field_identifier"
]);
var STRINGS = new Set([
  "string",
  "interpreted_string_literal",
  "raw_string_literal",
  "rune_literal"
]);
var TYPE_AREAS = new Set([
  "type_annotation",
  "type_arguments",
  "type_parameters",
  "type_identifier",
  "predefined_type",
  "type_alias_declaration",
  "interface_body",
  "extends_type_clause",
  "implements_clause",
  "array_type",
  "conditional_type",
  "constructor_type",
  "existential_type",
  "flow_maybe_type",
  "function_type",
  "generic_type",
  "index_type_query",
  "infer_type",
  "intersection_type",
  "literal_type",
  "lookup_type",
  "nested_type_identifier",
  "object_type",
  "parenthesized_type",
  "readonly_type",
  "template_literal_type",
  "this_type",
  "tuple_type",
  "type_query",
  "union_type"
]);
function mergeIntervals(intervals) {
  const merged = [];
  intervals.sort((a, b) => a.start - b.start || b.end - a.end);
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else
      merged.push({ ...interval });
  }
  return merged;
}
function subtract(range, excluded) {
  const results = [];
  let low = 0, high = excluded.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if ((excluded[middle]?.end ?? Infinity) <= range.start)
      low = middle + 1;
    else
      high = middle;
  }
  let start2 = range.start;
  for (let i2 = low;i2 < excluded.length; i2++) {
    const gap = excluded[i2];
    if (!gap || gap.start >= range.end)
      break;
    if (gap.start > start2)
      results.push({ start: start2, end: gap.start });
    start2 = Math.max(start2, gap.end);
  }
  if (start2 < range.end)
    results.push({ start: start2, end: range.end });
  return results;
}
function containedIntervals(range, sorted) {
  let low = 0, high = sorted.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if ((sorted[middle]?.start ?? Infinity) < range.start)
      low = middle + 1;
    else
      high = middle;
  }
  const contained = [];
  for (let i2 = low;i2 < sorted.length; i2++) {
    const item = sorted[i2];
    if (!item || item.start >= range.end)
      break;
    if (item.end <= range.end)
      contained.push(item);
  }
  return mergeIntervals(contained);
}
function bindingNodes(tree, index) {
  const results = [];
  const stack = [index];
  while (stack.length) {
    const id = stack.pop();
    if (id === undefined)
      break;
    const node = tree.nodes[id];
    if (!node)
      continue;
    if (BINDING_IDENTIFIERS.has(node.kind)) {
      results.push(id);
      continue;
    }
    if (node.kind === "pair_pattern") {
      const value = syntaxField(tree, id, "value");
      if (value !== undefined)
        stack.push(value);
    } else if (node.kind === "assignment_pattern" || node.kind === "object_assignment_pattern") {
      const left = syntaxField(tree, id, "left");
      if (left !== undefined)
        stack.push(left);
    } else {
      for (const child of tree.children[id] ?? []) {
        const value = tree.nodes[child];
        if (value?.named && value.field !== "type" && value.field !== "value")
          stack.push(child);
      }
    }
  }
  return results;
}
function attachedName(tree, index, text) {
  const node = tree.nodes[index];
  if (!node)
    return "<anonymous>";
  const ownName = syntaxField(tree, index, "name");
  const own = ownName === undefined ? undefined : tree.nodes[ownName];
  if (own)
    return syntaxText(own, text);
  const parent = node.parent === null ? undefined : tree.nodes[node.parent];
  if (parent && node.parent !== null) {
    const binding = syntaxField(tree, node.parent, parent.kind === "pair" ? "key" : "name") ?? (parent.kind === "assignment_expression" ? syntaxField(tree, node.parent, "left") : undefined);
    const target = binding === undefined ? undefined : tree.nodes[binding];
    if (target)
      return syntaxText(target, text);
    if (parent.kind === "export_statement")
      return "default";
  }
  return `<anonymous@${node.start}>`;
}
function directlyExported(tree, index) {
  let current = tree.nodes[index]?.parent ?? null;
  while (current !== null) {
    const node = tree.nodes[current];
    if (!node)
      return false;
    if (node.kind === "export_statement")
      return true;
    if (![
      "variable_declarator",
      "lexical_declaration",
      "variable_declaration",
      "ambient_declaration"
    ].includes(node.kind))
      return false;
    current = node.parent;
  }
  return false;
}
function goExported(tree, index, name2, inFunction) {
  if (!/^\p{Lu}/u.test(name2))
    return false;
  const kind = tree.nodes[index]?.kind;
  if (kind === "method_declaration" || kind === "field_declaration" || kind === "method_elem")
    return true;
  return !inFunction && ["function_declaration", "type_spec", "type_alias", "var_spec", "const_spec"].includes(kind ?? "");
}
function deriveSyntaxFacts(tree, language, text) {
  const { nodes, children } = tree;
  const roles = [];
  const symbols = [];
  const lexical = [];
  const comments = [];
  const nestedCallContent = [];
  const scopes = [];
  const functionScopes = [];
  const semanticCalls = [];
  const semanticImports = [];
  const add = (id, role, subkind, candidate = false) => {
    const node = nodes[id];
    if (!node || node.start === node.end)
      return;
    roles.push({
      start: node.start,
      end: node.end,
      role,
      certainty: candidate ? "candidate" : "syntax",
      node: id,
      ...subkind ? { subkind } : {}
    });
  };
  for (let index = 0;index < nodes.length; index++) {
    const node = nodes[index];
    if (!node)
      continue;
    const parent = node.parent === null ? undefined : nodes[node.parent];
    const outerScope = node.parent === null ? undefined : scopes[node.parent];
    const inFunction = node.parent === null ? false : functionScopes[node.parent] ?? false;
    scopes[index] = outerScope;
    functionScopes[index] = inFunction || IMPLEMENTATIONS.has(node.kind);
    if (node.kind === "comment") {
      add(index, "comment");
      lexical.push(node);
      comments.push(node);
    } else if (node.named && STRINGS.has(node.kind)) {
      add(index, "string", node.kind);
      lexical.push(node);
    } else if (node.kind === "template_string") {
      const substitutions = (children[index] ?? []).map((child) => nodes[child]).filter((child) => child?.kind === "template_substitution");
      for (const range of subtract(node, mergeIntervals(substitutions))) {
        roles.push({
          ...range,
          role: "string",
          certainty: "syntax",
          subkind: "template-static",
          node: index
        });
        lexical.push(range);
      }
    } else if (node.kind === "jsx_text") {
      add(index, "jsx-text");
      lexical.push(node);
    } else if (node.kind === "regex" || node.kind === "regex_pattern") {
      add(index, "unknown", "regex-literal");
      lexical.push(node);
    } else if (language !== "go" && TYPE_AREAS.has(node.kind)) {
      add(index, "unknown", "type");
      lexical.push(node);
    }
    if (node.kind === "as_expression" || node.kind === "satisfies_expression") {
      let afterOperator = false;
      for (const child of children[index] ?? []) {
        const target = nodes[child];
        if (!target)
          continue;
        if (target.kind === "as" || target.kind === "satisfies")
          afterOperator = true;
        else if (afterOperator) {
          add(child, "unknown", "type");
          lexical.push(target);
        }
      }
    }
    if (["arguments", "argument_list", "formal_parameters", "parameter_list"].includes(node.kind)) {
      nestedCallContent.push(node);
    }
    if (IMPLEMENTATIONS.has(node.kind)) {
      const bodyId = syntaxField(tree, index, "body");
      const body2 = bodyId === undefined ? undefined : nodes[bodyId];
      if (body2)
        nestedCallContent.push(body2);
    }
    const isImplementation = IMPLEMENTATIONS.has(node.kind);
    const isStructure = node.named && (isImplementation || SIGNATURES.has(node.kind) || CONTAINERS.has(node.kind) || TYPE_SYMBOLS.has(node.kind));
    const isVariable = node.named && ["variable_declarator", "var_spec", "const_spec"].includes(node.kind);
    const isField = node.named && [
      "public_field_definition",
      "field_definition",
      "field_declaration",
      "property_signature"
    ].includes(node.kind);
    if (isStructure || isVariable || isField) {
      const nameIds = syntaxFields(tree, index, "name").flatMap((name2) => bindingNodes(tree, name2));
      for (const id of nameIds) {
        if (syntaxText(nodes[id], text) !== "_") {
          add(id, "declaration", node.kind);
          const name2 = syntaxText(nodes[id], text);
          if (language === "go" ? goExported(tree, index, name2, inFunction) : directlyExported(tree, index)) {
            add(id, "export", language === "go" ? "exported-identifier" : "exported-declaration");
          }
        }
      }
      const valueId = syntaxField(tree, index, "value");
      const value = valueId === undefined ? undefined : nodes[valueId];
      const variableHasOwnImplementation = value && IMPLEMENTATIONS.has(value.kind);
      if (isStructure || isVariable && !inFunction && !variableHasOwnImplementation || isField) {
        const name2 = attachedName(tree, index, text);
        const bodyId = syntaxField(tree, index, "body");
        const body2 = bodyId === undefined ? undefined : nodes[bodyId];
        const hasBody = isImplementation && body2 !== undefined;
        const symbol = {
          name: name2,
          kind: node.kind,
          start: node.start,
          end: node.end,
          hasBody,
          exported: language === "go" ? goExported(tree, index, name2, inFunction) : directlyExported(tree, index),
          node: index,
          ...outerScope ? { scope: outerScope } : {},
          ...hasBody && body2 ? { bodyStart: body2.start, bodyEnd: body2.end } : {}
        };
        symbols.push(symbol);
        if (isImplementation || CONTAINERS.has(node.kind))
          scopes[index] = name2;
      }
    } else if (node.kind === "object" && parent?.kind === "variable_declarator") {
      scopes[index] = attachedName(tree, index, text);
    } else if (language === "go" && node.kind === "short_var_declaration") {
      const left = syntaxField(tree, index, "left");
      if (left !== undefined) {
        for (const id of bindingNodes(tree, left)) {
          if (syntaxText(nodes[id], text) !== "_")
            add(id, "declaration", "short-variable-candidate", true);
        }
      }
    }
    if (node.kind === "call_expression" || node.kind === "new_expression") {
      const field = node.kind === "new_expression" ? "constructor" : "function";
      const calleeId = syntaxField(tree, index, field);
      const callee = calleeId === undefined ? undefined : nodes[calleeId];
      if (callee) {
        const optional = (children[index] ?? []).some((child) => nodes[child]?.kind === "optional_chain");
        semanticCalls.push({
          node: index,
          range: callee,
          subkind: language === "go" ? callee.kind === "func_literal" ? "call" : "call-or-conversion" : node.kind === "new_expression" ? "constructor" : optional ? "optional-call" : "call",
          candidate: language === "go" && callee.kind !== "func_literal"
        });
      }
    }
    if (["import_statement", "import_spec", "export_statement"].includes(node.kind)) {
      const role = node.kind === "export_statement" ? "export" : "import";
      for (const child of children[index] ?? []) {
        const target = nodes[child];
        if (target && (["source", "path", "name"].includes(target.field ?? "") || ["import_clause", "export_clause", "import", "export", "default"].includes(target.kind)))
          semanticImports.push({ node: child, range: target, role });
      }
    }
    if (language === "go" && node.kind === "import")
      add(index, "import", "import-keyword");
  }
  const excluded = mergeIntervals(lexical);
  nestedCallContent.sort((a, b) => a.start - b.start);
  const commentExcluded = mergeIntervals(comments);
  for (const call of semanticCalls) {
    const callExcluded = containedIntervals(call.range, nestedCallContent);
    for (const lexicalRange of subtract(call.range, excluded)) {
      for (const range of subtract(lexicalRange, callExcluded)) {
        roles.push({
          ...range,
          role: "call",
          certainty: call.candidate ? "candidate" : "syntax",
          subkind: call.subkind,
          node: call.node
        });
      }
    }
  }
  for (const item of semanticImports) {
    for (const range of subtract(item.range, commentExcluded)) {
      roles.push({ ...range, role: item.role, certainty: "syntax", node: item.node });
    }
  }
  for (const range of subtract({ start: 0, end: text.length }, excluded)) {
    roles.push({ ...range, role: "code", certainty: "syntax", node: 0 });
  }
  roles.sort((a, b) => a.start - b.start || a.end - b.end || a.role.localeCompare(b.role));
  return { symbols, roles };
}
function classifySyntaxRange(analysis, start2, end) {
  if (analysis.status !== "ok" || start2 < 0 || end < start2)
    return [];
  return analysis.roles.filter((role) => role.start <= start2 && end <= role.end && start2 < role.end);
}

// src/syntax.ts
function syntaxLanguage(path) {
  switch (extname(path).toLowerCase()) {
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".ts":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".go":
      return "go";
    default:
      return;
  }
}
function emptyAnalysis(status, language) {
  return {
    status,
    ...language ? { language } : {},
    nodes: [],
    children: [],
    symbols: [],
    roles: [],
    diagnostics: [],
    limited: status === "limit"
  };
}
function invalidProtocol() {
  throw new SignalGrepError("Invalid syntax parser protocol");
}
function readNode(value, index, nodes, length) {
  if (!value || typeof value !== "object")
    return invalidProtocol();
  if (!("kind" in value) || typeof value.kind !== "string" || value.kind.length === 0 || !("start" in value) || typeof value.start !== "number" || !Number.isSafeInteger(value.start) || !("end" in value) || typeof value.end !== "number" || !Number.isSafeInteger(value.end) || value.start < 0 || value.end < value.start || value.end > length || !("named" in value) || typeof value.named !== "boolean" || !("parent" in value))
    return invalidProtocol();
  const parent = value.parent;
  if (index === 0 ? parent !== null : typeof parent !== "number" || !Number.isSafeInteger(parent) || parent < 0 || parent >= index) {
    return invalidProtocol();
  }
  if (typeof parent === "number") {
    const owner = nodes[parent];
    if (!owner || owner.start > value.start || owner.end < value.end)
      return invalidProtocol();
  }
  if ("field" in value && typeof value.field !== "string")
    return invalidProtocol();
  return {
    kind: value.kind,
    start: value.start,
    end: value.end,
    parent: typeof parent === "number" ? parent : null,
    named: value.named,
    ..."field" in value && typeof value.field === "string" ? { field: value.field } : {}
  };
}
function readResult(output, length) {
  const result = JSON.parse(output);
  if (!result || typeof result !== "object" || !("status" in result) || !("nodes" in result) || !["ok", "parse-error", "limit"].includes(String(result.status)) || !Array.isArray(result.nodes) || result.nodes.length === 0 || result.nodes.length > MAX_SYNTAX_NODES) {
    return invalidProtocol();
  }
  const nodes = [];
  for (const value of result.nodes)
    nodes.push(readNode(value, nodes.length, nodes, length));
  if (result.status !== "ok" && result.status !== "parse-error" && result.status !== "limit")
    return invalidProtocol();
  const patternMatches = [];
  if ("patternMatches" in result) {
    if (!Array.isArray(result.patternMatches) || result.patternMatches.length > MAX_SYNTAX_NODES)
      return invalidProtocol();
    for (const match of result.patternMatches) {
      if (!match || typeof match !== "object" || !("start" in match) || !("end" in match) || typeof match.start !== "number" || typeof match.end !== "number" || !Number.isSafeInteger(match.start) || !Number.isSafeInteger(match.end) || match.start < 0 || match.end < match.start || match.end > length)
        return invalidProtocol();
      patternMatches.push({ start: match.start, end: match.end });
    }
  }
  return { status: result.status, nodes, patternMatches };
}
async function parseSyntax(path, text, signal, pattern) {
  if (signal?.aborted)
    throw abortError();
  const language = syntaxLanguage(path);
  if (!language)
    return emptyAnalysis("unsupported");
  if (Buffer.byteLength(text) > MAX_SOURCE_FILE_BYTES)
    return emptyAnalysis("limit", language);
  if (!text.isWellFormed()) {
    return {
      ...emptyAnalysis("parse-error", language),
      diagnostics: [{ kind: "invalid-unicode", start: 0, end: text.length }]
    };
  }
  const worker = fileURLToPath2(new URL("./syntax-worker.mjs", import.meta.url));
  const config = fileURLToPath2(new URL("./syntax-worker.toml", import.meta.url));
  const args2 = process.versions.bun ? [`--config=${config}`, "--no-env-file", "--no-macros", "--no-install", worker] : [worker];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const controller = new AbortController;
  let timedOut = false;
  const abort2 = () => controller.abort();
  signal?.addEventListener("abort", abort2, { once: true });
  if (signal?.aborted)
    controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MAX_PARSE_TIME_MS);
  const chunks = [];
  let bytes = 0;
  try {
    const result = await runOwnedProcess({
      executable: process.execPath,
      args: args2,
      cwd: dirname2(worker),
      env,
      signal: controller.signal,
      input: Buffer.from(JSON.stringify({ language, text, pattern }))
    }, async (stdout) => {
      for await (const chunk of stdout) {
        bytes += chunk.byteLength;
        if (bytes > MAX_STRUCTURE_BYTES)
          throw new SignalGrepError("Syntax parser output exceeds protocol limit");
        chunks.push(Buffer.from(chunk));
      }
    });
    if (signal?.aborted)
      throw abortError();
    if (result.code !== 0) {
      throw new SignalGrepError(`Syntax parser process failed (${String(result.code)}): ${result.stderr.trim()}`);
    }
    const parsed = readResult(Buffer.concat(chunks).toString("utf8"), text.length);
    const children = syntaxChildren(parsed.nodes);
    const diagnostics = parsed.nodes.flatMap((node, index) => node.kind === "ERROR" || index > 0 && node.start === node.end ? [
      {
        kind: node.kind === "ERROR" ? "syntax-error" : "missing-token",
        start: node.start,
        end: node.end
      }
    ] : []);
    const facts = parsed.status === "ok" ? deriveSyntaxFacts({ nodes: parsed.nodes, children }, language, text) : { symbols: [], roles: [] };
    if (signal?.aborted)
      throw abortError();
    return {
      language,
      status: parsed.status,
      nodes: parsed.nodes,
      children,
      ...parsed.patternMatches ? { patternMatches: parsed.patternMatches } : {},
      ...facts,
      diagnostics,
      limited: parsed.status === "limit"
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted && signal?.aborted)
      throw abortError();
    if (aborted && timedOut)
      return emptyAnalysis("timeout", language);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort2);
  }
}

// src/impact-bindings.ts
async function bindImpactCandidates(target, files, occurrences, access) {
  const syntax = await access.syntax(target.document);
  const name2 = syntax.nodes.find((node) => node.start >= target.symbol.start && node.end <= target.symbol.end && target.document.text.slice(node.start, node.end) === target.symbol.name && node.kind.endsWith("identifier"));
  if (!name2)
    throw new SignalGrepError("Impact compiler target has no exact identifier position");
  const documents = new Map(files.filter((file) => file.document.utf8 && ["javascript", "typescript", "tsx"].includes(syntaxLanguage(file.document.path) ?? "")).map((file) => [resolve7(access.cwd, file.document.path), file.document]));
  documents.set(resolve7(access.cwd, target.document.path), target.document);
  const sourceAt = await semanticSources(access.cwd, documents.values());
  const references = await withTypeScript(access.cwd, [...documents.values()], async (channel) => locations(await channel.request("textDocument/references", {
    textDocument: { uri: await semanticUri(access.cwd, target.document.path) },
    position: lspPosition(target.document, name2.start),
    context: { includeDeclaration: true }
  })), access.signal);
  const retained = new Map(occurrences.map((item) => [
    `${resolve7(access.cwd, item.path)}:${String(item.range?.start)}:${String(item.range?.end)}`,
    item
  ]));
  let bound = 0;
  for (const reference of references) {
    const document2 = await sourceAt(reference.path);
    if (!document2)
      continue;
    const range = byteRange(document2, reference.range);
    const key = `${resolve7(access.cwd, document2.path)}:${String(range.start)}:${String(range.end)}`;
    const existing = retained.get(key);
    const line = document2.lineAt(range.start);
    const evidence = sourceEvidence(document2, range);
    const item = existing ?? {
      path: document2.path,
      line,
      source: document2.reference,
      range,
      excerpt: evidence.excerpt
    };
    retained.set(key, {
      ...item,
      label: "Compiler-bound impact reference (static; runtime dispatch unproven)",
      details: {
        ...existing?.details,
        excerptRange: evidence.excerptRange,
        excerptTruncated: evidence.excerptTruncated,
        kind: existing ? "impact-occurrence" : "impact-reference",
        binding: "typescript-compiler",
        bindingScope: "verified-candidate-documents",
        certainty: "static",
        score: 100,
        rankingReason: "compiler reference to the selected symbol"
      }
    });
    bound += 1;
  }
  for (const document2 of documents.values()) {
    await access.refresh(document2.path, document2.reference);
  }
  return { items: [...retained.values()], bound };
}

// src/discovery-errors.ts
var FILE_DISCOVERY_QUERY_PLACEHOLDER = "<filename-or-path>";
function repairQuery(value) {
  return typeof value === "string" && value.length <= 256 && value.isWellFormed() && !/[\r\n\0]/.test(value) ? value : FILE_DISCOVERY_QUERY_PLACEHOLDER;
}
function fileDiscoveryQueryHint(value) {
  return `file discovery uses query; retry with ${JSON.stringify({ mode: "files", query: repairQuery(value) })}`;
}
var DISCOVERY_MODE_REQUIRED_ERROR = 'query requires an explicit discovery mode: use mode=files for filename/path discovery or mode=concept for semantic discovery; for example {"mode":"files","query":"<filename-or-path>"}';

// src/concept-search.ts
import { dirname as dirname4 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";

// src/concept-model.ts
var CONCEPT_MODEL = "Xenova/multilingual-e5-small";
var CONCEPT_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
var MAX_CONCEPT_CHARS = 1000;
var CONCEPT_PASSAGE_OVERLAP_CHARS = 160;
var CONCEPT_CACHE_MAX_BYTES = 512 * 1024 * 1024;
var CONCEPT_TIMEOUT_MS = 10 * 60000;
var MIN_CONCEPT_TIMEOUT_MS = 1000;
var MAX_CONCEPT_TIMEOUT_MS = 60 * 60000;
var CONCEPT_TIMEOUT_ENV = "BAOER_SIGNAL_GREP_CONCEPT_TIMEOUT_MS";
var MAX_CONCEPT_WORKER_INPUT_BYTES = 64 * 1024 * 1024;
var MAX_CONCEPT_WORKER_OUTPUT_BYTES = 4 * 1024 * 1024;
function resolveConceptTimeoutMs(environment = process.env) {
  const raw = environment[CONCEPT_TIMEOUT_ENV];
  if (raw === undefined || raw === "")
    return CONCEPT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_CONCEPT_TIMEOUT_MS || value > MAX_CONCEPT_TIMEOUT_MS) {
    throw new SignalGrepError(`${CONCEPT_TIMEOUT_ENV} must be an integer from ${String(MIN_CONCEPT_TIMEOUT_MS)} through ${String(MAX_CONCEPT_TIMEOUT_MS)}`);
  }
  return value;
}

// src/request.ts
function list(value) {
  if (value === undefined)
    return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item.length > 0);
}
function validateText(value, field, maxCharacters, singleLine = false) {
  if (!value.isWellFormed() || /\0/.test(value) || singleLine && /[\r\n]/.test(value))
    throw new SignalGrepError(`${field} must be well-formed text without NUL or line breaks`);
  if (value.length > maxCharacters)
    throw new SignalGrepError(`${field} is too long (maximum ${String(maxCharacters)} characters); use a shorter value or a narrower working directory`);
}
function validateSearchPath(value, field = "path") {
  validateText(value.replace(/^@/, ""), field, MAX_PATH_CHARACTERS, true);
}
function validateRawSearchInput(input) {
  if (input.pattern !== undefined)
    validateText(input.pattern, "pattern", MAX_PATTERN_CHARACTERS);
  if (input.path !== undefined) {
    validateSearchPath(input.path);
  }
  for (const [field, value] of [
    ["glob", input.glob],
    ["exclude", input.exclude]
  ]) {
    const values = list(value);
    if (values.length > MAX_FILE_FILTER_ITEMS)
      throw new SignalGrepError(`${field} accepts at most ${String(MAX_FILE_FILTER_ITEMS)} entries`);
    values.forEach((item) => validateText(item, field, MAX_PATH_CHARACTERS, true));
  }
  for (const [field, value] of [
    ["modifiedAfter", input.modifiedAfter],
    ["modifiedBefore", input.modifiedBefore]
  ]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new SignalGrepError(`${field} must be a non-negative Unix timestamp in milliseconds`);
  }
  if (input.modifiedAfter !== undefined && input.modifiedBefore !== undefined && input.modifiedAfter > input.modifiedBefore)
    throw new SignalGrepError("modifiedAfter must be earlier than or equal to modifiedBefore");
}
function boundedInteger(value, fallback, minimum, maximum, field) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new SignalGrepError(`${field} must be an integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return candidate;
}
function normalizeRequest(input) {
  validateRawSearchInput(input);
  if (input.scope !== undefined && input.scope !== "strict" && input.scope !== "expand")
    throw new SignalGrepError("scope must be strict or expand");
  const pattern = input.pattern;
  if (pattern === undefined) {
    throw new SignalGrepError("pattern is required when cursor is not provided");
  }
  const path = input.path?.replace(/^@/, "");
  return {
    pattern,
    ...path ? { path } : {},
    glob: list(input.glob),
    exclude: list(input.exclude),
    literal: input.literal ?? false,
    ...input.ignoreCase === undefined ? {} : { ignoreCase: input.ignoreCase },
    hidden: input.hidden ?? true,
    context: boundedInteger(input.context, 0, 0, MAX_CONTEXT_LINES, "context"),
    pageSize: boundedInteger(input.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, "limit"),
    redact: input.redact ?? false,
    ...input.modifiedAfter !== undefined ? { modifiedAfterMs: input.modifiedAfter } : {},
    ...input.modifiedBefore !== undefined ? { modifiedBeforeMs: input.modifiedBefore } : {},
    ...input.scope !== undefined ? { scope: input.scope } : {},
    ...input.wholeWord !== undefined ? { wholeWord: input.wholeWord } : {}
  };
}

// src/source-access.ts
import { extname as extname2, resolve as resolve12 } from "path";

// src/historical-paths.ts
import { lstat, mkdir, mkdtemp, open, rm, writeFile } from "fs/promises";
import { constants as constants2 } from "fs";
import { tmpdir } from "os";
import { dirname as dirname3, join as join3, parse, relative as relative4, resolve as resolve9 } from "path";

// src/workspace-files.ts
import { relative as relative3, resolve as resolve8, sep as sep2 } from "path";
class EnumerationLimit extends Error {
}
function workspaceRelativePath(cwd, path, policy = new SearchPathPolicy(cwd)) {
  const absolute = resolve8(cwd, path);
  policy.assertPath(absolute);
  const local = relative3(resolve8(cwd), absolute);
  if (local.split(sep2).some((part) => part.toLowerCase() === ".git"))
    throw new SignalGrepError("Git internals are excluded from source candidates");
  return isPathInsideCwd(absolute, cwd) ? local.split(sep2).join("/") : absolute.replaceAll("\\", "/");
}
async function listWorkspaceFiles(cwd, signal, options = {}) {
  const absolutePath = resolve8(cwd, options.path ?? ".");
  const policy = new SearchPathPolicy(cwd);
  const searchPath = await policy.resolveSearchTarget(absolutePath);
  const maxFiles = options.maxFiles ?? MAX_SOURCE_REVISION_FILES;
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1)
    throw new SignalGrepError("Candidate file limit must be a positive integer");
  const paths = new Set;
  const reasons = new Set;
  let bytes = 0;
  try {
    const result = await runOwnedProcess({
      executable: await resolveRipgrepExecutable(),
      args: [
        "--no-config",
        "--files",
        "--null",
        ...options.ignore === false ? ["--no-ignore"] : [],
        ...options.ignoreParents === false ? ["--no-ignore-parent"] : [],
        ...fileScopeArguments({
          hidden: options.hidden ?? true,
          glob: options.glob ?? [],
          exclude: options.exclude ?? []
        }),
        ...policy.ripgrepGlobArguments(searchPath),
        "--",
        searchPath
      ],
      cwd,
      ...signal ? { signal } : {}
    }, async (stdout) => {
      let pending = Buffer.alloc(0);
      for await (const chunk of stdout) {
        if (signal?.aborted)
          throw abortError();
        bytes += chunk.byteLength;
        if (bytes > MAX_PROTOCOL_LINE_BYTES)
          throw new EnumerationLimit(`Candidate enumeration exceeds the ${String(MAX_PROTOCOL_LINE_BYTES)} byte protocol limit`);
        pending = Buffer.concat([pending, chunk]);
        let delimiter = pending.indexOf(0);
        while (delimiter >= 0) {
          const raw = pending.subarray(0, delimiter);
          const decoded = raw.toString("utf8");
          if (!Buffer.from(decoded).equals(raw))
            reasons.add("Some candidate paths are not valid UTF-8");
          else {
            const local = workspaceRelativePath(cwd, decoded, policy);
            if (!paths.has(local) && paths.size >= maxFiles)
              throw new EnumerationLimit(`Candidate enumeration reached the ${String(maxFiles)} file limit`);
            paths.add(local);
          }
          pending = pending.subarray(delimiter + 1);
          delimiter = pending.indexOf(0);
        }
      }
      if (pending.length > 0)
        throw new SignalGrepError("Candidate enumeration ended without a NUL delimiter");
    });
    const diagnostics = classifyRipgrepDiagnostics(result.stderr);
    if (hasRequestedRootUnreadable(diagnostics.unreadable, cwd, searchPath))
      throw new SignalGrepError(describeUnreadableDiagnostics(diagnostics.unreadable));
    if (diagnostics.unreadable.length > 0)
      reasons.add(describeUnreadableDiagnostics(diagnostics.unreadable));
    if (result.code === 2 && (diagnostics.other.length > 0 || diagnostics.unreadable.length === 0))
      throw new SignalGrepError(result.stderr.trim() || `Candidate enumeration exited ${String(result.code)}`);
  } catch (error) {
    if (!(error instanceof EnumerationLimit))
      throw error;
    reasons.add(error.message);
  }
  return { paths: [...paths].toSorted(), partial: reasons.size > 0, reasons: [...reasons] };
}

// src/historical-paths.ts
function partitionPaths(paths) {
  const groups = [];
  for (const path of paths) {
    const group = groups.find((candidate) => !candidate.some((other) => path.startsWith(`${other}/`) || other.startsWith(`${path}/`)));
    if (group)
      group.push(path);
    else
      groups.push([path]);
  }
  return groups;
}
function relevantDirectories(cwd, paths) {
  const directories = new Set;
  for (const path of [cwd, ...paths.map((sourcePath) => dirname3(resolve9(cwd, sourcePath)))]) {
    let current = path;
    for (;; ) {
      directories.add(current);
      const parent = dirname3(current);
      if (current === parent)
        break;
      current = parent;
    }
  }
  return [...directories];
}
async function filterHistoricalPaths(cwd, paths, request, signal) {
  if (!isPathInsideCwd(resolve9(cwd, request.path ?? "."), cwd)) {
    throw new SignalGrepError("Historical path filtering requires a path inside cwd");
  }
  const selectedPath = workspaceRelativePath(cwd, request.path ?? ".");
  const candidates = paths.filter((path) => selectedPath.length === 0 || path === selectedPath || path.startsWith(`${selectedPath}/`));
  const reasons = new Set;
  if (candidates.length > MAX_STRUCTURE_FILES)
    reasons.add(`Historical path filtering reached the ${String(MAX_STRUCTURE_FILES)} candidate limit`);
  const bounded = candidates.slice(0, MAX_STRUCTURE_FILES);
  if (bounded.length === 0)
    return { paths: [], partial: reasons.size > 0, reasons: [...reasons], ignoreBytesRead: 0 };
  const root = await mkdtemp(join3(tmpdir(), "baoer_signal_grep-paths-"));
  const absoluteCwd = resolve9(cwd);
  const volumeRoot = parse(absoluteCwd).root;
  const ignoreFiles = [];
  let ignoreBytesRead = 0;
  try {
    for (const directory of relevantDirectories(absoluteCwd, bounded)) {
      if (isPathInsideCwd(directory, absoluteCwd))
        await assertExistingPathInsideCwd(directory, absoluteCwd);
      for (const name2 of [".ignore", ".rgignore"]) {
        if (signal?.aborted)
          throw abortError();
        const path = join3(directory, name2);
        let discovered = false;
        try {
          const before = await lstat(path);
          discovered = true;
          if (!before.isFile())
            throw new SignalGrepError("Current ignore rules are not regular files; historical path filtering is unavailable");
          if (before.size > MAX_SOURCE_FILE_BYTES || ignoreBytesRead + before.size > MAX_STRUCTURE_BYTES)
            throw new SignalGrepError("Current ignore rules exceed the source read budget");
          const handle2 = await open(path, constants2.O_RDONLY | (constants2.O_NOFOLLOW ?? 0));
          let bytes;
          try {
            if (!sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle2.stat())))
              throw new SignalGrepError("Current ignore rules changed before reading");
            const buffer = Buffer.alloc(before.size + 1);
            let used = 0;
            while (used < buffer.length) {
              if (signal?.aborted)
                throw abortError();
              const chunk = await handle2.read(buffer, used, Math.min(64 * 1024, buffer.length - used), null);
              if (chunk.bytesRead === 0)
                break;
              used += chunk.bytesRead;
            }
            bytes = buffer.subarray(0, used);
            const after = await lstat(path);
            if (used !== before.size || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after)) || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle2.stat())))
              throw new SignalGrepError("Current ignore rules changed during historical path filtering");
          } finally {
            await handle2.close();
          }
          ignoreBytesRead += bytes.length;
          ignoreFiles.push({ local: relative4(volumeRoot, path), bytes });
        } catch (error) {
          if (!(error instanceof Error && ("code" in error) && error.code === "ENOENT"))
            throw error;
          if (discovered)
            throw new SignalGrepError("Current ignore rules disappeared during historical path filtering");
        }
      }
    }
    if (ignoreFiles.length === 0 && request.glob.length === 0 && request.exclude.length === 0 && request.hidden) {
      return { paths: bounded, partial: reasons.size > 0, reasons: [...reasons], ignoreBytesRead };
    }
    const visible = new Set;
    for (const [index, group] of partitionPaths(bounded).entries()) {
      const tree = join3(root, String(index));
      const target = join3(tree, relative4(volumeRoot, absoluteCwd));
      await mkdir(target, { recursive: true });
      for (const path of group) {
        const safe = workspaceRelativePath(absoluteCwd, path);
        const placeholder = resolve9(target, safe);
        await mkdir(dirname3(placeholder), { recursive: true });
        await writeFile(placeholder, "");
      }
      for (const ignore of ignoreFiles) {
        const destination = join3(tree, ignore.local);
        await mkdir(dirname3(destination), { recursive: true });
        await writeFile(destination, ignore.bytes);
      }
      const privacy = await listWorkspaceFiles(tree, signal, { ignoreParents: false });
      const prefix = `${relative4(tree, target).split("\\").join("/")}/`;
      const allowed = new Set(privacy.paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length)));
      const scoped = await listWorkspaceFiles(target, signal, {
        glob: request.glob,
        exclude: request.exclude,
        hidden: request.hidden,
        ignore: false
      });
      for (const reason of [...privacy.reasons, ...scoped.reasons])
        reasons.add(reason);
      const included = new Set(group);
      for (const path of scoped.paths)
        if (included.has(path) && allowed.has(path))
          visible.add(path);
    }
    return {
      paths: [...visible].toSorted(),
      partial: reasons.size > 0,
      reasons: [...reasons],
      ignoreBytesRead
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// src/git-diff.ts
import { setImmediate } from "timers/promises";
class GitDiffLimitError extends SignalGrepError {
}

class GitDiffBudget {
  work = 0;
  maxWork;
  signal;
  constructor(maxWork = MAX_GIT_DIFF_WORK, signal) {
    this.maxWork = maxWork;
    this.signal = signal;
  }
  tick() {
    if (this.signal?.aborted)
      throw abortError();
    this.work += 1;
    if (this.work > this.maxWork) {
      throw new GitDiffLimitError(`Git line comparison exceeds the ${String(this.maxWork)} step limit`);
    }
    return this.work % 4096 === 0;
  }
}
async function sourceLines(content, budget) {
  const lines = [];
  for (let start2 = 0;start2 < content.length; ) {
    if (budget.tick())
      await setImmediate();
    const newline = content.indexOf(10, start2);
    const end = newline === -1 ? content.length : newline + 1;
    lines.push(content.toString("latin1", start2, end));
    start2 = end;
  }
  return lines;
}
function sourceLineCount(content) {
  if (content.length === 0)
    return 0;
  let count = content[content.length - 1] === 10 ? 0 : 1;
  for (const byte of content)
    if (byte === 10)
      count += 1;
  return count;
}
function diagonal(vector, distance, k) {
  return vector[k + distance + 1] ?? -1;
}
function prependLine(ranges, line) {
  const last = ranges.at(-1);
  if (last && last.startLine === line + 1)
    last.startLine = line;
  else
    ranges.push({ startLine: line, endLine: line });
}
function reconstruct(trace, oldLength, newLength, prefix) {
  let x = oldLength;
  let y = newLength;
  const oldRanges = [];
  const newRanges = [];
  for (let distance = trace.length - 1;distance > 0; distance -= 1) {
    const previous = trace[distance - 1];
    if (!previous)
      throw new Error("Missing Git line comparison trace");
    const k = x - y;
    const previousK = k === -distance || k !== distance && diagonal(previous, distance - 1, k - 1) < diagonal(previous, distance - 1, k + 1) ? k + 1 : k - 1;
    const previousX = diagonal(previous, distance - 1, previousK);
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x -= 1;
      y -= 1;
    }
    if (x === previousX) {
      prependLine(newRanges, prefix + y);
      y -= 1;
    } else {
      prependLine(oldRanges, prefix + x);
      x -= 1;
    }
  }
  return { oldRanges: oldRanges.toReversed(), newRanges: newRanges.toReversed() };
}
async function changedLineRanges(oldContent, newContent, budget = new GitDiffBudget) {
  if (budget.signal?.aborted)
    throw abortError();
  if (oldContent.equals(newContent))
    return { oldRanges: [], newRanges: [] };
  const oldLines = await sourceLines(oldContent, budget);
  const newLines = await sourceLines(newContent, budget);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    if (budget.tick())
      await setImmediate();
    prefix += 1;
  }
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > prefix && newEnd > prefix && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    if (budget.tick())
      await setImmediate();
    oldEnd -= 1;
    newEnd -= 1;
  }
  const n = oldEnd - prefix;
  const m = newEnd - prefix;
  if (n === 0 || m === 0) {
    return {
      oldRanges: n === 0 ? [] : [{ startLine: prefix + 1, endLine: oldEnd }],
      newRanges: m === 0 ? [] : [{ startLine: prefix + 1, endLine: newEnd }]
    };
  }
  const trace = [];
  for (let distance = 0;distance <= n + m; distance += 1) {
    const current = new Int32Array(2 * distance + 3).fill(-1);
    const previous = trace[distance - 1];
    for (let k = -distance;k <= distance; k += 2) {
      if (budget.tick())
        await setImmediate();
      let x = 0;
      if (previous) {
        x = k === -distance || k !== distance && diagonal(previous, distance - 1, k - 1) < diagonal(previous, distance - 1, k + 1) ? diagonal(previous, distance - 1, k + 1) : diagonal(previous, distance - 1, k - 1) + 1;
      }
      let y = x - k;
      while (x < n && y < m && oldLines[prefix + x] === newLines[prefix + y]) {
        if (budget.tick())
          await setImmediate();
        x += 1;
        y += 1;
      }
      current[k + distance + 1] = x;
      if (x >= n && y >= m) {
        trace.push(current);
        return reconstruct(trace, n, m, prefix);
      }
    }
    trace.push(current);
  }
  throw new Error("Git line comparison did not produce an edit script");
}
async function sourceSimilarity(oldContent, newContent, budget) {
  if (oldContent.equals(newContent))
    return 100;
  const maximum = Math.max(oldContent.length, newContent.length);
  if (maximum === 0 || Math.min(oldContent.length, newContent.length) / maximum < 0.5)
    return 0;
  const counts = new Map;
  for (const line of await sourceLines(oldContent, budget))
    counts.set(line, (counts.get(line) ?? 0) + 1);
  let commonBytes = 0;
  for (const line of await sourceLines(newContent, budget)) {
    const remaining = counts.get(line) ?? 0;
    if (remaining === 0)
      continue;
    counts.set(line, remaining - 1);
    commonBytes += line.length;
  }
  return Math.min(99, Math.floor(100 * commonBytes / maximum));
}

// src/git-repository.ts
import { createHash } from "crypto";
import { constants as constants3 } from "fs";
import { lstat as lstat2, open as open2 } from "fs/promises";
import { isAbsolute as isAbsolute5, relative as relative5, resolve as resolve10, sep as sep3 } from "path";

// src/git-process.ts
var GIT_READ_ARGUMENTS = [
  "--no-pager",
  "--no-replace-objects",
  "--no-optional-locks",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.untrackedCache=false",
  "-c",
  "submodule.recurse=false"
];
var MINIMUM_NO_LAZY_FETCH_VERSION = [2, 45, 0];
var gitCapabilities = new Map;
function gitReadEnvironment() {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("GIT_"))),
    GIT_CONFIG_COUNT: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_PROTOCOL_FROM_USER: "0",
    LC_ALL: "C"
  };
}
function supportsNoLazyFetch(version) {
  const match = /^git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match)
    throw new SignalGrepError("Git returned an unrecognized version string");
  const actual = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  for (let index = 0;index < MINIMUM_NO_LAZY_FETCH_VERSION.length; index += 1) {
    const difference = (actual[index] ?? 0) - (MINIMUM_NO_LAZY_FETCH_VERSION[index] ?? 0);
    if (difference !== 0)
      return difference > 0;
  }
  return true;
}
async function gitReadArguments(executable, cwd, signal) {
  const capabilityKey = `${executable}\x00${process.env.PATH ?? ""}`;
  let supports = gitCapabilities.get(capabilityKey);
  if (supports === undefined) {
    const versionChunks = [];
    const version = await runOwnedProcess({
      executable,
      args: ["--version"],
      cwd,
      env: gitReadEnvironment(),
      ...signal ? { signal } : {}
    }, async (stdout) => {
      for await (const chunk of stdout)
        versionChunks.push(Buffer.from(chunk));
    });
    if (version.code !== 0)
      throw new SignalGrepError("Unable to determine the Git version");
    supports = supportsNoLazyFetch(Buffer.concat(versionChunks).toString("utf8"));
    gitCapabilities.set(capabilityKey, supports);
  }
  if (supports) {
    return [...GIT_READ_ARGUMENTS, "--no-lazy-fetch"];
  }
  const partial = await runOwnedProcess({
    executable,
    args: [
      ...GIT_READ_ARGUMENTS,
      "config",
      "--local",
      "--get-regexp",
      "^(extensions\\.partialClone|remote\\..*\\.promisor)$"
    ],
    cwd,
    env: gitReadEnvironment(),
    ...signal ? { signal } : {}
  }, async (stdout) => {
    for await (const chunk of stdout) {}
  });
  if (partial.code === 0) {
    throw new SignalGrepError("Git 2.45 or newer is required for non-fetching reads from a partial/promisor clone");
  }
  if (partial.code !== 1) {
    throw new SignalGrepError("Unable to verify whether this older Git repository is partial");
  }
  return [...GIT_READ_ARGUMENTS];
}
async function runGitRead(cwd, command, args2, options = {}) {
  const chunks = [];
  if (options.input && options.input.byteLength > MAX_PROTOCOL_LINE_BYTES) {
    throw new SignalGrepError(`Git input exceeds the ${String(MAX_PROTOCOL_LINE_BYTES)} byte protocol limit`);
  }
  let bytes = 0;
  const maxBytes = options.maxBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const result = await runOwnedProcess({
    executable: options.executable ?? "git",
    args: [
      ...await gitReadArguments(options.executable ?? "git", cwd, options.signal),
      ...command === "ls-tree" ? ["--literal-pathspecs"] : [],
      command,
      ...args2
    ],
    cwd,
    env: gitReadEnvironment(),
    ...options.signal ? { signal: options.signal } : {},
    ...options.input ? { input: options.input } : {}
  }, async (stdout) => {
    for await (const chunk of stdout) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        throw new SignalGrepError(`Git ${command} output exceeds the ${String(maxBytes)} byte limit`);
      }
      chunks.push(Buffer.from(chunk));
    }
  });
  if (result.code === null || !(options.allowedCodes ?? [0]).includes(result.code)) {
    throw new SignalGrepError(`Git ${command} failed: ${result.stderr.trim() || `exit ${String(result.code)}`}`);
  }
  return { output: Buffer.concat(chunks), code: result.code };
}
function decodeGitPath(bytes) {
  const value = bytes.toString("utf8");
  if (!Buffer.from(value, "utf8").equals(bytes)) {
    throw new SignalGrepError("Git path is not valid UTF-8; path-based source access is unavailable");
  }
  return value;
}
function splitGitRecords(output) {
  if (output.length === 0)
    return [];
  if (output[output.length - 1] !== 0) {
    throw new SignalGrepError("Git names protocol ended without a NUL delimiter");
  }
  const records = [];
  let offset = 0;
  for (let delimiter = output.indexOf(0);delimiter !== -1; delimiter = output.indexOf(0, offset)) {
    records.push(output.subarray(offset, delimiter));
    offset = delimiter + 1;
  }
  return records;
}

// src/git-repository.ts
async function verifyWorktreeRevision(cwd, path, expected) {
  try {
    const current = await lstat2(resolve10(cwd, path));
    await assertExistingPathInsideCwd(resolve10(cwd, path), cwd);
    if (current.isFile() && sameSourceRevision(sourceRevisionFromStats(current), expected))
      return;
  } catch (error) {
    if (!(error instanceof Error && ("code" in error) && error.code === "ENOENT"))
      throw error;
  }
  throw new SignalGrepError("Working source changed during Git comparison; retry a new search");
}
function gitPath(cwd, path) {
  if (path.length === 0 || path.includes("\x00"))
    throw new SignalGrepError("Git source path is invalid");
  const absolute = resolve10(cwd, path);
  const local = relative5(resolve10(cwd), absolute).split(sep3).join("/");
  if (!isPathInsideCwd(absolute, cwd) || local.split("/").some((part) => part.toLowerCase() === ".git")) {
    throw new SignalGrepError("Git source path must stay within the working directory and outside .git");
  }
  return local;
}
async function resolveGitCommit(cwd, ref, signal) {
  if (ref.trim().length === 0 || ref.length > 1024 || ref.includes("\x00")) {
    throw new SignalGrepError("Git commit reference must be a nonempty bounded string");
  }
  const { output } = await runGitRead(cwd, "rev-parse", ["--verify", "--end-of-options", `${ref}^{commit}`], {
    ...signal ? { signal } : {},
    maxBytes: 128
  });
  const commit = output.toString("ascii").trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit))
    throw new SignalGrepError("Git returned an invalid commit identity");
  return commit;
}
async function resolveGitRepository(cwd, signal) {
  const { output } = await runGitRead(cwd, "rev-parse", ["--show-toplevel"], signal ? { signal, maxBytes: 4096 } : { maxBytes: 4096 });
  const root = decodeGitPath(output).replace(/\r?\n$/, "");
  if (!isAbsolute5(root))
    throw new SignalGrepError("Git returned an invalid repository root");
  return resolve10(root);
}
async function findGitRepository(cwd, signal) {
  try {
    return await resolveGitRepository(cwd, signal);
  } catch (error) {
    if (error instanceof SignalGrepError && error.message.includes("not a git repository")) {
      return;
    }
    throw error;
  }
}
async function readGitTree(cwd, commit, signal, path) {
  const { output } = await runGitRead(cwd, "ls-tree", ["-r", "-z", "-l", commit, ...path ? ["--", gitPath(cwd, path)] : []], signal ? { signal } : {});
  const entries = new Map;
  for (const record of splitGitRecords(output)) {
    if (entries.size === MAX_SOURCE_REVISION_FILES)
      return { entries, limited: true };
    const tab = record.indexOf(9);
    const header = record.subarray(0, tab).toString("ascii").trim().split(/\s+/);
    const [mode, type, blob, size] = header;
    if (tab < 0 || !mode || !blob || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(blob) || !["blob", "commit"].includes(type ?? "")) {
      throw new SignalGrepError("Git tree returned an invalid raw object entry");
    }
    const local = gitPath(cwd, decodeGitPath(record.subarray(tab + 1)));
    const byteSize = type === "commit" ? 0 : Number(size);
    if (!Number.isSafeInteger(byteSize) || byteSize < 0)
      throw new SignalGrepError("Git tree returned an invalid blob size");
    entries.set(local, { path: local, mode, blob, size: byteSize });
  }
  return { entries, limited: false };
}
async function worktreeNames(cwd, signal) {
  const { output } = await runGitRead(cwd, "ls-files", ["-z", "--cached", "--others", "--exclude-standard"], signal ? { signal } : {});
  const paths = new Set;
  for (const record of splitGitRecords(output)) {
    if (paths.size === MAX_SOURCE_REVISION_FILES)
      return { paths: [...paths], limited: true };
    paths.add(gitPath(cwd, decodeGitPath(record)));
  }
  return { paths: [...paths], limited: false };
}
async function visibleGitPaths(cwd, paths, signal, includePath) {
  const result = [];
  for (let start2 = 0;start2 < paths.length; start2 += 128) {
    const batch = paths.slice(start2, start2 + 128);
    const { output } = await runGitRead(cwd, "check-ignore", ["--no-index", "-z", "--stdin"], {
      input: Buffer.from(`${batch.map((path) => `./${path}`).join("\x00")}\x00`),
      allowedCodes: [0, 1],
      ...signal ? { signal } : {}
    });
    const ignored = new Set(splitGitRecords(output).map((record) => gitPath(cwd, decodeGitPath(record))));
    for (const path of batch) {
      if (signal?.aborted)
        throw abortError();
      if (!ignored.has(path) && (!includePath || await includePath(path)))
        result.push(path);
    }
  }
  return result;
}
function limitedSource(path, mode, reason) {
  return { path, mode, sourceStatus: "unavailable", reason };
}
async function readGitBlob(cwd, commit, entry, budget, signal) {
  const { path, mode, blob, size } = entry;
  if (mode === "120000" || mode === "160000") {
    return {
      path,
      mode,
      sourceStatus: mode === "120000" ? "symlink" : "submodule",
      reason: "Symlink and submodule contents are not followed"
    };
  }
  if (size > MAX_SOURCE_FILE_BYTES)
    return limitedSource(path, mode, `Source exceeds the ${String(MAX_SOURCE_FILE_BYTES)} byte file limit`);
  if (budget.bytes + size > budget.maxBytes)
    return limitedSource(path, mode, `Source reads exceed the ${String(budget.maxBytes)} byte request limit`);
  const { output } = await runGitRead(cwd, "cat-file", ["blob", blob], {
    maxBytes: size,
    ...signal ? { signal } : {}
  });
  budget.bytes += output.length;
  if (output.length !== size)
    throw new SignalGrepError("Git blob size does not match its immutable tree entry");
  const verifiedBlob = createHash(blob.length === 40 ? "sha1" : "sha256").update(`blob ${String(output.length)}\x00`).update(output).digest("hex");
  if (verifiedBlob !== blob)
    throw new SignalGrepError("Git blob bytes do not match their immutable object identity");
  return {
    path,
    mode,
    sourceStatus: output.includes(0) ? "binary" : "available",
    ...output.includes(0) ? { reason: "Binary source contains NUL bytes" } : { content: output },
    origin: { kind: "git", commit, blob },
    contentHash: createHash("sha256").update(output).digest("hex")
  };
}
async function readWorktreeSource(cwd, path, budget, signal) {
  const absolute = resolve10(cwd, path);
  if (signal?.aborted)
    throw abortError();
  let discovered = false;
  try {
    const before = await lstat2(absolute);
    discovered = true;
    if (before.isSymbolicLink())
      return {
        path,
        mode: "120000",
        sourceStatus: "symlink",
        reason: "Symlink source is not followed"
      };
    if (!before.isFile())
      return {
        path,
        mode: "160000",
        sourceStatus: before.isDirectory() ? "submodule" : "unavailable",
        reason: "Non-regular source is not read"
      };
    const mode = (before.mode & 73) === 0 ? "100644" : "100755";
    if (before.size > MAX_SOURCE_FILE_BYTES)
      return limitedSource(path, mode, `Source exceeds the ${String(MAX_SOURCE_FILE_BYTES)} byte file limit`);
    if (budget.bytes + before.size > budget.maxBytes)
      return limitedSource(path, mode, `Source reads exceed the ${String(budget.maxBytes)} byte request limit`);
    await assertExistingPathInsideCwd(absolute, cwd);
    const handle2 = await open2(absolute, constants3.O_RDONLY | (constants3.O_NOFOLLOW ?? 0));
    try {
      if (!sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle2.stat())))
        throw new SignalGrepError("Working source changed before reading");
      const buffer = Buffer.alloc(before.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        if (signal?.aborted)
          throw abortError();
        const { bytesRead } = await handle2.read(buffer, bytes, Math.min(64 * 1024, buffer.length - bytes), null);
        if (bytesRead === 0)
          break;
        bytes += bytesRead;
      }
      budget.bytes += bytes;
      const after = await lstat2(absolute);
      await assertExistingPathInsideCwd(absolute, cwd);
      if (bytes !== before.size || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after)) || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle2.stat()))) {
        throw new SignalGrepError("Working source changed while reading; Git ranges and source cannot be mixed");
      }
      const content = buffer.subarray(0, bytes);
      return {
        path,
        mode,
        sourceStatus: content.includes(0) ? "binary" : "available",
        ...content.includes(0) ? { reason: "Binary source contains NUL bytes" } : { content },
        origin: {
          kind: "worktree",
          revision: sourceRevisionFromStats(after),
          contentHash: createHash("sha256").update(content).digest("hex")
        },
        contentHash: createHash("sha256").update(content).digest("hex")
      };
    } finally {
      await handle2.close();
    }
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "ENOENT") {
        if (discovered)
          throw new SignalGrepError("Working source disappeared while reading; retry a new search");
        return { path, mode: "000000", sourceStatus: "absent" };
      }
      if (["EACCES", "EPERM", "ELOOP", "ENOTDIR"].includes(String(error.code)))
        return limitedSource(path, "000000", `Source unavailable: ${String(error.code)}`);
    }
    throw error;
  }
}

// src/git-source.ts
import { setImmediate as setImmediate2 } from "timers/promises";
function absent(path) {
  return { path, mode: "000000", sourceStatus: "absent" };
}
function sameContents(left, right) {
  return left.contentHash !== undefined && left.contentHash === right.contentHash;
}
function wholeFile(content) {
  const lines = sourceLineCount(content);
  return lines === 0 ? [] : [{ startLine: 1, endLine: lines }];
}
function validateLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new SignalGrepError(`${label} must be a positive integer`);
  return value;
}
function rememberBest(best, pair, score) {
  const previous = best.get(pair);
  if (!previous || score > previous.score)
    best.set(pair, { score, count: 1 });
  else if (score === previous.score)
    previous.count += 1;
}
async function pairRenames(pairs, budget, reasons) {
  const removed = pairs.filter((pair) => pair.new.sourceStatus === "absent" && pair.old.content);
  const added = pairs.filter((pair) => pair.old.sourceStatus === "absent" && pair.new.content);
  const scores = [];
  const bestOld = new Map;
  const bestNew = new Map;
  try {
    for (const oldPair of removed) {
      for (const newPair of added) {
        if (!oldPair.old.content || !newPair.new.content)
          continue;
        if (budget.tick())
          await setImmediate2();
        const score = sameContents(oldPair.old, newPair.new) ? 100 : await sourceSimilarity(oldPair.old.content, newPair.new.content, budget);
        if (score >= 50) {
          scores.push({ oldPair, newPair, score });
          rememberBest(bestOld, oldPair, score);
          rememberBest(bestNew, newPair, score);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof GitDiffLimitError))
      throw error;
    reasons.add(error.message);
    reasons.add("Rename comparison is incomplete; unpaired additions/deletions remain explicit");
    return pairs;
  }
  const consumed = new Set;
  const renamed = [];
  for (const entry of scores) {
    const oldBest = bestOld.get(entry.oldPair);
    const newBest = bestNew.get(entry.newPair);
    if (oldBest?.score !== entry.score || newBest?.score !== entry.score || oldBest.count !== 1 || newBest.count !== 1)
      continue;
    consumed.add(entry.oldPair);
    consumed.add(entry.newPair);
    renamed.push({
      old: entry.oldPair.old,
      new: entry.newPair.new,
      rename: {
        method: entry.score === 100 ? "identical-content" : "line-similarity",
        similarity: entry.score
      }
    });
  }
  if (scores.some((entry) => !consumed.has(entry.oldPair) && !consumed.has(entry.newPair))) {
    reasons.add("Ambiguous rename candidates remain separate additions/deletions");
  }
  return [...pairs.filter((pair) => !consumed.has(pair)), ...renamed];
}
async function renderPair(pair, request, budget, reasons) {
  const selected = request.side === "old" ? pair.old : pair.new;
  const oldExists = pair.old.sourceStatus !== "absent";
  const newExists = pair.new.sourceStatus !== "absent";
  let changedRanges = [];
  let rangeReason;
  if (selected.content) {
    try {
      if (!oldExists || !newExists)
        changedRanges = wholeFile(selected.content);
      else if (pair.old.content && pair.new.content) {
        const diff = await changedLineRanges(pair.old.content, pair.new.content, budget);
        changedRanges = request.side === "old" ? diff.oldRanges : diff.newRanges;
      } else {
        rangeReason = "Changed lines unavailable because the opposite source cannot be compared as raw text";
      }
    } catch (error) {
      if (!(error instanceof GitDiffLimitError))
        throw error;
      rangeReason = error.message;
    }
  }
  if (rangeReason)
    reasons.add(rangeReason);
  for (const source of [pair.old, pair.new]) {
    if (source.sourceStatus === "unavailable")
      reasons.add(source.reason ?? "Source unavailable");
  }
  const unsupported = [pair.old, pair.new].some((source) => ["unavailable", "symlink", "submodule"].includes(source.sourceStatus));
  const change = pair.rename ? "renamed" : !oldExists ? "added" : !newExists ? "deleted" : unsupported ? "unknown" : "modified";
  const reason = selected.reason ?? rangeReason;
  return {
    path: selected.sourceStatus === "absent" ? request.side === "old" ? pair.new.path : pair.old.path : selected.path,
    ...oldExists ? { oldPath: pair.old.path } : {},
    ...newExists ? { newPath: pair.new.path } : {},
    change,
    sourceStatus: selected.sourceStatus,
    ...selected.content ? { content: selected.content } : {},
    ...selected.contentHash ? { contentHash: selected.contentHash } : {},
    ...selected.origin ? { origin: selected.origin } : {},
    changedRanges,
    ranges: request.scope === "files" && selected.content ? wholeFile(selected.content) : changedRanges,
    ...reason ? { reason } : {},
    ...pair.rename ? { rename: pair.rename } : {}
  };
}
async function readGitChanges(cwd, request, signal, options = {}) {
  if (!["files", "lines"].includes(request.scope) || !["new", "old"].includes(request.side))
    throw new SignalGrepError("Invalid Git scope or side");
  if (request.target !== undefined && request.base === undefined)
    throw new SignalGrepError("Git commit comparison requires an explicit base and target");
  const maxFiles = validateLimit(options.maxFiles ?? MAX_STRUCTURE_FILES, "Git file limit");
  const maxBytes = validateLimit(options.maxBytes ?? MAX_STRUCTURE_BYTES, "Git byte limit");
  const maxDiffWork = validateLimit(options.maxDiffWork ?? MAX_GIT_DIFF_WORK, "Git diff work limit");
  const base = await resolveGitCommit(cwd, request.base ?? "HEAD", signal);
  const target = request.target === undefined ? undefined : await resolveGitCommit(cwd, request.target, signal);
  const oldTree = await readGitTree(cwd, base, signal);
  const newTree = target ? await readGitTree(cwd, target, signal) : undefined;
  const diskNames = target ? undefined : await worktreeNames(cwd, signal);
  const reasons = new Set;
  if (oldTree.limited || newTree?.limited || diskNames?.limited)
    reasons.add("Git candidate metadata limit reached");
  const candidates = [
    ...new Set([...oldTree.entries.keys(), ...newTree?.entries.keys() ?? diskNames?.paths ?? []])
  ].filter((path) => {
    if (!target)
      return true;
    const oldEntry = oldTree.entries.get(path);
    const newEntry = newTree?.entries.get(path);
    return !oldEntry || !newEntry || oldEntry.blob !== newEntry.blob || oldEntry.mode !== newEntry.mode;
  }).toSorted();
  let visible = await visibleGitPaths(cwd, candidates, signal, options.includePath);
  let filterBytes = 0;
  if (options.filterPaths) {
    const allowed = new Set(visible);
    const filtered = await options.filterPaths(visible);
    visible = filtered.paths;
    filterBytes = filtered.bytesRead ?? 0;
    if (!Number.isSafeInteger(filterBytes) || filterBytes < 0 || filterBytes > maxBytes)
      throw new SignalGrepError("Git path filtering exceeded its shared source read budget");
    if (visible.some((path) => !allowed.has(path)))
      throw new SignalGrepError("Git path filter expanded the authorized candidate set");
    visible = [...new Set(visible)];
  }
  const readBudget = { bytes: filterBytes, maxBytes };
  const diffBudget = new GitDiffBudget(maxDiffWork, signal);
  const pairs = [];
  let filesRead = 0;
  let omittedFiles = 0;
  for (const path of visible) {
    if (signal?.aborted)
      throw abortError();
    const oldEntry = oldTree.entries.get(path);
    const newEntry = newTree?.entries.get(path);
    if (filesRead >= maxFiles || readBudget.bytes >= maxBytes) {
      omittedFiles += 1;
      continue;
    }
    filesRead += 1;
    const oldSource = oldEntry ? await readGitBlob(cwd, base, oldEntry, readBudget, signal) : absent(path);
    const newSource = target ? newEntry ? await readGitBlob(cwd, target, newEntry, readBudget, signal) : absent(path) : await readWorktreeSource(cwd, path, readBudget, signal);
    if (oldSource.sourceStatus === "absent" && newSource.sourceStatus === "absent")
      continue;
    if (sameContents(oldSource, newSource) && (process.platform === "win32" || oldSource.mode === newSource.mode))
      continue;
    pairs.push({ old: oldSource, new: newSource });
  }
  if (omittedFiles > 0)
    reasons.add(`Git read limits omitted ${String(omittedFiles)} candidate files (${String(maxFiles)} files / ${String(maxBytes)} bytes)`);
  const paired = await pairRenames(pairs, diffBudget, reasons);
  const files = [];
  for (const pair of paired)
    files.push(await renderPair(pair, request, diffBudget, reasons));
  for (const pair of paired) {
    if (pair.new.origin?.kind !== "worktree")
      continue;
    await verifyWorktreeRevision(cwd, pair.new.path, pair.new.origin.revision);
  }
  return {
    base,
    target: target ?? "worktree",
    scope: request.scope,
    side: request.side,
    files: files.toSorted((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
    partial: reasons.size > 0,
    reasons: [...reasons],
    filesRead,
    bytesRead: readBudget.bytes,
    diffWork: diffBudget.work,
    omittedFiles
  };
}
async function readGitSource(cwd, identity, signal, options = {}) {
  const path = gitPath(cwd, identity.path);
  if (!(await visibleGitPaths(cwd, [path], signal, options.includePath)).includes(path))
    throw new SignalGrepError("Git source is excluded by current workspace privacy or path rules");
  const selected = await filterHistoricalPaths(cwd, [path], { glob: [], exclude: [], hidden: true }, signal);
  if (selected.partial || !selected.paths.includes(path))
    throw new SignalGrepError("Git source is excluded or unverified by current .ignore/.rgignore rules");
  const commit = await resolveGitCommit(cwd, identity.commit, signal);
  const tree = await readGitTree(cwd, commit, signal, path);
  const entry = tree.entries.get(path);
  if (!entry)
    throw new SignalGrepError("Git source path does not exist in the requested commit");
  if (identity.blob !== undefined && identity.blob !== entry.blob)
    throw new SignalGrepError("Git source blob does not match its commit and path");
  return readGitBlob(cwd, commit, entry, { bytes: selected.ignoreBytesRead, maxBytes: options.maxBytes ?? MAX_STRUCTURE_BYTES }, signal);
}

// src/source-document.ts
import { isUtf8 } from "buffer";
import { createHash as createHash2 } from "crypto";
import { open as open3, realpath as realpath4 } from "fs/promises";
import { relative as relative6, resolve as resolve11 } from "path";
class SourceDocumentError extends SignalGrepError {
  reason;
  constructor(reason, message) {
    super(message);
    this.reason = reason;
    this.name = "SourceDocumentError";
  }
}
function contentHash(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}

class SourceDocument {
  reference;
  bytes;
  text;
  utf8;
  lineStarts = [0];
  #byteOffsets;
  constructor(reference, bytes) {
    this.reference = reference;
    this.bytes = bytes;
    if (bytes.length > MAX_SOURCE_FILE_BYTES) {
      throw new SourceDocumentError("file-too-large", "Source exceeds the 5 MiB file limit");
    }
    this.utf8 = isUtf8(bytes);
    this.text = bytes.toString("utf8");
    for (let index = bytes.indexOf(10);index >= 0; index = bytes.indexOf(10, index + 1)) {
      this.lineStarts.push(index + 1);
    }
  }
  get path() {
    return this.reference.path;
  }
  toByteOffset(character) {
    this.#requireUtf8();
    if (!Number.isSafeInteger(character) || character < 0 || character > this.text.length) {
      throw new SignalGrepError("Source character offset is outside the document");
    }
    const code = this.text.charCodeAt(character);
    if (code >= 56320 && code <= 57343) {
      throw new SignalGrepError("Source character offset splits a Unicode character");
    }
    const value = this.#offsets()[character];
    if (value === undefined)
      throw new Error("Missing source offset");
    return value;
  }
  toCharacterOffset(byte) {
    this.#requireUtf8();
    this.checkRange({ start: byte, end: byte });
    const offsets = this.#offsets();
    let low = 0;
    let high = offsets.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const value = offsets[middle];
      if (value === undefined)
        throw new Error("Missing source offset");
      if (value < byte)
        low = middle + 1;
      else
        high = middle;
    }
    if (offsets[low] !== byte) {
      throw new SignalGrepError("Source byte offset splits a Unicode character");
    }
    return low;
  }
  lineAt(byte) {
    this.checkRange({ start: byte, end: byte });
    let low = 0;
    let high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      const start2 = this.lineStarts[middle];
      if (start2 === undefined)
        throw new Error("Missing source line");
      if (start2 <= byte)
        low = middle;
      else
        high = middle;
    }
    return low + 1;
  }
  positionAt(byte) {
    const line = this.lineAt(byte);
    const start2 = this.lineStarts[line - 1];
    if (start2 === undefined)
      throw new Error("Missing source line");
    return {
      line,
      column: this.toCharacterOffset(byte) - this.toCharacterOffset(start2) + 1
    };
  }
  lineRange(startLine, endLine = startLine) {
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || startLine > this.lineStarts.length) {
      throw new SignalGrepError("Source line range is outside the document");
    }
    const start2 = this.lineStarts[startLine - 1];
    if (start2 === undefined)
      throw new Error("Missing source line");
    return { start: start2, end: this.lineStarts[endLine] ?? this.bytes.length };
  }
  slice(range) {
    this.#requireUtf8();
    this.checkRange(range);
    this.toCharacterOffset(range.start);
    this.toCharacterOffset(range.end);
    return this.bytes.subarray(range.start, range.end).toString("utf8");
  }
  checkRange(range) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end > this.bytes.length) {
      throw new SignalGrepError("Source byte range is outside the document");
    }
  }
  #requireUtf8() {
    if (!this.utf8) {
      throw new SourceDocumentError("encoding", "Source is not losslessly representable as UTF-8");
    }
  }
  #offsets() {
    if (this.#byteOffsets)
      return this.#byteOffsets;
    const offsets = new Uint32Array(this.text.length + 1);
    let character = 0;
    let byte = 0;
    for (const point of this.text) {
      offsets[character] = byte;
      if (point.length === 2)
        offsets[character + 1] = byte;
      character += point.length;
      byte += Buffer.byteLength(point);
    }
    offsets[character] = byte;
    this.#byteOffsets = offsets;
    return offsets;
  }
}
async function readWorkspaceDocument(path, cwd, signal, expected, readBudget = MAX_SOURCE_FILE_BYTES) {
  if (signal?.aborted)
    throw abortError();
  if (expected?.kind === "git") {
    throw new SignalGrepError("A Git source reference cannot be read from the worktree");
  }
  const absolute = resolve11(cwd, path);
  const [canonical, canonicalCwd] = await Promise.all([
    new SearchPathPolicy(cwd).resolveExistingPath(absolute),
    realpath4(cwd)
  ]);
  if (!canonical)
    throw new SourceDocumentError("source-unavailable", "Source is unavailable");
  const before = await getSourceRevision(absolute);
  if (!before)
    throw new SourceDocumentError("source-unavailable", "Source is unavailable");
  if (expected && !sameSourceRevision(before, expected.revision)) {
    throw new SourceDocumentError("source-changed", "Source changed; start a new inspection");
  }
  if (before.size > Math.min(MAX_SOURCE_FILE_BYTES, readBudget)) {
    throw new SourceDocumentError("file-too-large", "Source exceeds the 5 MiB file limit");
  }
  if (signal?.aborted)
    throw abortError();
  const handle2 = await open3(canonical, "r");
  let bytes;
  try {
    const metadata2 = await handle2.stat();
    if (!metadata2.isFile()) {
      throw new SourceDocumentError("source-unavailable", "Source must be a regular file");
    }
    if (!sameSourceRevision(before, sourceRevisionFromStats(metadata2))) {
      throw new SourceDocumentError("source-changed", "Source was replaced before reading");
    }
    const buffer = Buffer.alloc(before.size);
    let used = 0;
    while (used < buffer.length) {
      if (signal?.aborted)
        throw abortError();
      const read = await handle2.read(buffer, used, buffer.length - used, used);
      if (read.bytesRead === 0)
        break;
      used += read.bytesRead;
    }
    if (used !== before.size) {
      throw new SourceDocumentError("source-changed", "Source changed during reading");
    }
    bytes = buffer.subarray(0, used);
  } finally {
    await handle2.close();
  }
  const [after, finalPath] = await Promise.all([getSourceRevision(absolute), realpath4(absolute)]);
  if (!after || canonical !== finalPath || !sameSourceRevision(before, after)) {
    throw new SourceDocumentError("source-changed", "Source changed during reading");
  }
  if (signal?.aborted)
    throw abortError();
  const hash = contentHash(bytes);
  if (expected && expected.contentHash !== hash) {
    throw new SourceDocumentError("source-changed", "Source content changed; start a new inspection");
  }
  return new SourceDocument({
    path: isPathInsideCwd(canonical, canonicalCwd) ? relative6(canonicalCwd, canonical).replaceAll("\\", "/") : canonical.replaceAll("\\", "/"),
    origin: { kind: "worktree", revision: after, contentHash: hash }
  }, bytes);
}

// src/source-access.ts
function noop() {}

class SyntaxQueue {
  #tail = Promise.resolve();
  #generation = new AbortController;
  #cache = new Map;
  #cachedNodes = 0;
  async parse(document2, signal) {
    return (await this.parseWithMetrics(document2, signal)).analysis;
  }
  async parseWithMetrics(document2, signal, pattern) {
    const combined = signal ? AbortSignal.any([signal, this.#generation.signal]) : this.#generation.signal;
    if (combined.aborted)
      throw abortError();
    const predecessor = this.#tail;
    let release = noop;
    this.#tail = new Promise((done) => {
      release = done;
    });
    try {
      await predecessor;
      if (combined.aborted)
        throw abortError();
      if (!document2.utf8)
        throw new SourceDocumentError("encoding", "Syntax requires lossless UTF-8 source");
      const origin = document2.reference.origin;
      const revision = origin.kind === "worktree" ? origin.contentHash : origin.blob;
      const key = `${extname2(document2.path).toLowerCase()}\x00${revision}\x00${pattern ?? ""}`;
      const cached = this.#cache.get(key);
      if (cached) {
        this.#cache.delete(key);
        this.#cache.set(key, cached);
        return { analysis: cached.analysis, cacheHit: true };
      }
      const analysis = await parseSyntax(document2.path, document2.text, combined, pattern);
      const entry = { analysis, nodes: analysis.nodes.length };
      this.#cache.set(key, entry);
      this.#cachedNodes += entry.nodes;
      while (this.#cache.size > MAX_SYNTAX_CACHE_ENTRIES || this.#cachedNodes > MAX_SYNTAX_CACHE_NODES) {
        const oldest = this.#cache.entries().next().value;
        if (!oldest)
          break;
        this.#cache.delete(oldest[0]);
        this.#cachedNodes -= oldest[1].nodes;
      }
      return { analysis, cacheHit: false };
    } finally {
      release();
    }
  }
  clear() {
    this.#generation.abort();
    this.#generation = new AbortController;
    this.#cache.clear();
    this.#cachedNodes = 0;
  }
  async shutdown() {
    this.clear();
    await this.#tail;
  }
}

class SourceBudgetError extends SignalGrepError {
  reason = "structural-read-budget-exhausted";
}

class SourceAccess {
  cwd;
  signal;
  #queue;
  #maxFiles;
  #documents = new Map;
  #syntax = new Map;
  #bytes = 0;
  #syntaxParses = 0;
  #syntaxCacheHits = 0;
  #readTail = Promise.resolve();
  constructor(cwd, queue, signal, options = {}) {
    this.cwd = cwd;
    this.#queue = queue;
    this.signal = signal;
    this.#maxFiles = options.maxFiles ?? MAX_STRUCTURE_FILES;
  }
  get filesRead() {
    return this.#documents.size;
  }
  get bytesRead() {
    return this.#bytes;
  }
  get maxFiles() {
    return this.#maxFiles;
  }
  get syntaxParses() {
    return this.#syntaxParses;
  }
  get syntaxCacheHits() {
    return this.#syntaxCacheHits;
  }
  withSignal(signal) {
    return new SourceAccess(this.cwd, this.#queue, signal, { maxFiles: this.#maxFiles });
  }
  async load(path, expected) {
    if (this.signal?.aborted)
      throw abortError();
    if (expected && resolve12(this.cwd, expected.path) !== resolve12(this.cwd, path)) {
      throw new SignalGrepError("Source reference path does not match the requested file");
    }
    const key = JSON.stringify([resolve12(this.cwd, path), expected?.origin]);
    const existing = this.#documents.get(key);
    if (existing)
      return existing;
    if (this.#documents.size >= this.#maxFiles) {
      throw new SourceBudgetError(`Structural scan reached the ${String(this.#maxFiles)}-file limit`);
    }
    const pending = this.#read(path, expected);
    this.#documents.set(key, pending);
    return pending;
  }
  async#read(path, expected) {
    const predecessor = this.#readTail;
    let release = noop;
    this.#readTail = new Promise((done) => {
      release = done;
    });
    try {
      await predecessor;
      return await this.#readOnce(path, expected);
    } finally {
      release();
    }
  }
  async#readOnce(path, expected) {
    let document2;
    const remaining = MAX_STRUCTURE_BYTES - this.#bytes;
    if (remaining <= 0)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    if (expected?.origin.kind !== "git") {
      const metadata2 = await getSourceRevision(resolve12(this.cwd, path));
      if (metadata2 && metadata2.size > remaining)
        throw new SourceBudgetError("Next source exceeds the remaining 32 MiB structural read budget");
    }
    if (expected?.origin.kind === "git") {
      const origin = expected.origin;
      const raw = await readGitSource(this.cwd, { path, commit: origin.commit, blob: origin.blob }, this.signal, { maxBytes: remaining });
      if (!raw.content || !raw.origin) {
        throw new SourceDocumentError("source-unavailable", raw.reason ?? `Git source is ${raw.sourceStatus}`);
      }
      document2 = new SourceDocument({ path, origin: raw.origin }, raw.content);
    } else {
      document2 = await readWorkspaceDocument(path, this.cwd, this.signal, expected?.origin, remaining);
    }
    this.#bytes += document2.bytes.length;
    if (this.#bytes > MAX_STRUCTURE_BYTES)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    return document2;
  }
  syntax(document2) {
    let pending = this.#syntax.get(document2);
    if (!pending) {
      pending = this.#queue.parseWithMetrics(document2, this.signal).then((parsed) => {
        if (parsed.cacheHit)
          this.#syntaxCacheHits += 1;
        else
          this.#syntaxParses += 1;
        return parsed.analysis;
      });
      this.#syntax.set(document2, pending);
    }
    return pending;
  }
  async pattern(document2, pattern) {
    return (await this.#queue.parseWithMetrics(document2, this.signal, pattern)).analysis;
  }
  releaseSyntax(document2) {
    this.#syntax.delete(document2);
  }
  refresh(path, expected) {
    return this.#read(path, expected);
  }
}

// src/concept-search.ts
var inferenceQueue = new OwnedTaskQueue;
var MAX_CONCEPT_FILES_WARN = 500;
function conciseWorkerError(stderr) {
  const errorLine = stderr.split(/\r?\n/).map((line) => line.trim()).find((line) => /^(?:[A-Za-z_$][\w$]*Error|Error|error):\s*\S/i.test(line));
  if (errorLine)
    return errorLine.replace(/^[^:]+(?:Error|error):\s*/i, "").slice(0, 512);
  const diagnostic = stderr.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (diagnostic)
    return diagnostic.slice(0, 512);
  return "worker returned no concise diagnostic";
}
function scoreProfile(scores) {
  const ordered = scores.toSorted((a, b) => b - a);
  const count = ordered.length;
  const top = ordered[0];
  const min = ordered.at(-1);
  if (top === undefined || min === undefined || count === 0)
    throw new Error("Concept score profile requires at least one score");
  const middle = Math.floor(count / 2);
  const middleValue = ordered[middle] ?? top;
  const median = count % 2 === 1 ? middleValue : ((ordered[middle - 1] ?? top) + middleValue) / 2;
  const second = ordered[1];
  return {
    count,
    top,
    ...second !== undefined ? { second, topMargin: top - second } : {},
    median: median ?? top,
    min,
    spread: top - min
  };
}
function passage(document2, start2) {
  let end = Math.min(document2.text.length, start2 + MAX_CONCEPT_CHARS);
  if (end < document2.text.length) {
    const newline = document2.text.lastIndexOf(`
`, end);
    if (newline > start2 + MAX_CONCEPT_CHARS / 2)
      end = newline + 1;
    const code = document2.text.charCodeAt(end);
    if (code >= 56320 && code <= 57343)
      end -= 1;
  }
  const range = { start: document2.toByteOffset(start2), end: document2.toByteOffset(end) };
  let next = end;
  if (end < document2.text.length) {
    next = Math.max(start2 + 1, end - CONCEPT_PASSAGE_OVERLAP_CHARS);
    const code = document2.text.charCodeAt(next);
    if (code >= 56320 && code <= 57343)
      next += 1;
  }
  return {
    value: {
      document: document2,
      range,
      text: document2.text.slice(start2, end)
    },
    next
  };
}
async function similarities(query, passages, parent) {
  const worker = fileURLToPath3(new URL("./concept-worker.mjs", import.meta.url));
  const config = fileURLToPath3(new URL("./syntax-worker.toml", import.meta.url));
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const buffers = [];
  let bytes = 0;
  try {
    const processResult = await runOwnedProcess({
      executable: process.execPath,
      args: process.versions.bun ? [
        `--config=${config}`,
        "--no-env-file",
        "--no-macros",
        "--no-install",
        worker,
        "--infer"
      ] : [worker, "--infer"],
      cwd: dirname4(worker),
      env,
      ...parent ? { signal: parent } : {},
      input: Buffer.from(JSON.stringify({
        query,
        encodedPassages: passages.map((item) => Buffer.from(item.text).toString("base64"))
      }))
    }, async (stdout) => {
      for await (const chunk of stdout) {
        bytes += chunk.byteLength;
        if (bytes > MAX_CONCEPT_WORKER_OUTPUT_BYTES)
          throw new SignalGrepError("Concept worker exceeded its 4 MiB response budget");
        buffers.push(Buffer.from(chunk));
      }
    });
    if (processResult.code !== 0)
      throw new ConceptUnavailableError(`Local concept inference failed (${String(processResult.code)}): ${conciseWorkerError(processResult.stderr)}`);
    const value = JSON.parse(Buffer.concat(buffers).toString("utf8"));
    if (!rpcRecord(value) || !Array.isArray(value.scores) || value.scores.length !== passages.length || value.scores.some((score) => typeof score !== "number" || !Number.isFinite(score)) || typeof value.cacheHits !== "number" || !Number.isSafeInteger(value.cacheHits) || value.cacheHits < 0 || typeof value.cacheMisses !== "number" || !Number.isSafeInteger(value.cacheMisses) || value.cacheMisses < 0 || typeof value.cacheMaxBytes !== "number" || !Number.isSafeInteger(value.cacheMaxBytes) || value.cacheMaxBytes <= 0 || value.cacheBytes !== undefined && (typeof value.cacheBytes !== "number" || !Number.isSafeInteger(value.cacheBytes) || value.cacheBytes < 0) || typeof value.windowsRanked !== "number" || !Number.isSafeInteger(value.windowsRanked) || value.windowsRanked < passages.length || !Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== "string") || typeof value.peakRssBytes !== "number" || !Number.isFinite(value.peakRssBytes) || value.peakRssBytes < 0)
      throw new SignalGrepError("Invalid concept inference response");
    return {
      scores: value.scores.filter((score) => typeof score === "number"),
      cacheHits: value.cacheHits,
      cacheMisses: value.cacheMisses,
      cacheMaxBytes: value.cacheMaxBytes,
      ...typeof value.cacheBytes === "number" ? { cacheBytes: value.cacheBytes } : {},
      windowsRanked: value.windowsRanked,
      warnings: value.warnings.filter((warning) => typeof warning === "string"),
      peakRssBytes: value.peakRssBytes
    };
  } catch (error) {
    if (parent?.aborted)
      throw abortError();
    if (error instanceof ConceptUnavailableError)
      throw error;
    const message = error instanceof Error ? error.message : "unknown provider failure";
    throw new ConceptUnavailableError(`Local concept inference failed: ${message}`, {
      cause: error
    });
  }
}
function validateConceptQuery(query) {
  if (!query?.trim() || query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError("Concept query requires nonempty, single-line well-formed text of at most 256 characters");
  return query;
}
async function runConceptSearch(input, access, infer) {
  const query = validateConceptQuery(input.query);
  const started = performance.now();
  const request = normalizeRequest({ ...input, pattern: "" });
  const files = await listWorkspaceFiles(access.cwd, access.signal, {
    ...request.path ? { path: request.path } : {},
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden
  });
  const result = {
    kind: "concept",
    unit: "evidence-items",
    items: [],
    partial: files.partial,
    reasons: [...files.reasons],
    redact: input.redact ?? false
  };
  const documents = [];
  let filesSkippedEmpty = 0;
  let filesUnavailable = 0;
  for (const path of files.paths) {
    try {
      const document2 = await access.load(path);
      if (!document2.utf8)
        throw new SourceDocumentError("encoding", "Not lossless UTF-8");
      if (!document2.text.trim()) {
        filesSkippedEmpty += 1;
        continue;
      }
      documents.push({ document: document2, next: 0 });
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        result.partial = true;
        result.reasons.push(error.message);
        filesUnavailable += 1;
        break;
      }
      if (!(error instanceof SourceDocumentError))
        throw error;
      result.partial = true;
      filesUnavailable += 1;
      result.reasons.push(`${path}: ${error.message}`);
    }
  }
  const passages = [];
  while (documents.some((item) => item.next < item.document.text.length)) {
    for (const item of documents) {
      if (item.next >= item.document.text.length)
        continue;
      const chunk = passage(item.document, item.next);
      passages.push(chunk.value);
      item.next = chunk.next;
    }
  }
  const filesAdmitted = documents.length;
  const filesProcessed = filesAdmitted + filesSkippedEmpty + filesUnavailable;
  const filesNotProcessed = Math.max(0, files.paths.length - filesProcessed);
  if (files.paths.length > MAX_CONCEPT_FILES_WARN) {
    result.reasons.push(`Concept enumerated ${String(files.paths.length)} files; narrow path or glob for faster interactive retrieval`);
  }
  result.counts = {
    filesEnumerated: files.paths.length,
    filesAdmitted,
    filesSkippedEmpty,
    filesUnavailable: filesUnavailable + filesNotProcessed,
    passagesQueued: passages.length
  };
  if (passages.length) {
    const inferred = await infer(query, passages, access.signal);
    result.reasons.push(...inferred.warnings);
    result.items = passages.map((item, index) => {
      const similarity = inferred.scores[index];
      if (similarity === undefined)
        throw new Error("Missing concept similarity");
      const evidence = rangeEvidence(item.document, item.range);
      return {
        path: item.document.path,
        line: item.document.lineAt(item.range.start),
        source: item.document.reference,
        range: item.range,
        label: `Concept candidate (cosine ${similarity.toFixed(4)})`,
        excerpt: evidence.excerpt,
        details: {
          kind: "concept-candidate",
          certainty: "candidate",
          score: similarity,
          rankingReason: "local multilingual E5 cosine similarity; relevance candidate, no binding or execution claim",
          model: CONCEPT_MODEL,
          revision: CONCEPT_REVISION,
          tokenTruncated: false,
          excerptRange: evidence.excerptRange,
          excerptTruncated: evidence.excerptTruncated
        }
      };
    }).toSorted((a, b) => b.details.score - a.details.score || a.path.localeCompare(b.path) || a.line - b.line);
    result.stats = {
      inferencePeakRssBytes: inferred.peakRssBytes,
      passagesRanked: passages.length,
      conceptWindowsRanked: inferred.windowsRanked,
      conceptCacheHits: inferred.cacheHits,
      conceptCacheMisses: inferred.cacheMisses,
      conceptCacheMaxBytes: inferred.cacheMaxBytes,
      ...inferred.cacheBytes === undefined ? {} : { conceptCacheBytes: inferred.cacheBytes },
      scoreProfile: scoreProfile(inferred.scores)
    };
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.stats = {
    ...result.stats,
    elapsedMs: Math.round(performance.now() - started),
    filesEnumerated: files.paths.length,
    filesAdmitted
  };
  result.coverage = {
    conceptCandidates: result.partial ? "partial" : "complete",
    admissionPlan: result.partial ? "partial" : "complete",
    compilerBindings: "not-applicable"
  };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide"
  };
  return result;
}
function conceptSearch(input, access) {
  return runConceptSearchWithDeadline(input, access, similarities);
}
async function runConceptSearchWithDeadline(input, access, infer, timeout = resolveConceptTimeoutMs) {
  const timeoutMs = timeout();
  const controller = new AbortController;
  const signal = access.signal ? AbortSignal.any([access.signal, controller.signal]) : controller.signal;
  const scopedAccess = access.withSignal(signal);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await inferenceQueue.run(() => runConceptSearch(input, scopedAccess, infer), scopedAccess.signal);
  } catch (error) {
    if (access.signal?.aborted)
      throw abortError();
    if (controller.signal.aborted) {
      throw new ConceptUnavailableError(`Concept request exceeded the ${String(timeoutMs)} ms deadline`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// src/structural-search.ts
async function structuralSearch(input, access) {
  if (!input.pattern?.trim() || Buffer.byteLength(input.pattern) > 4096 || !input.pattern.isWellFormed())
    throw new SignalGrepError("Structural pattern must be nonempty, well-formed and at most 4 KiB; ast-grep $NAME/$$$ARGS metavariables are supported");
  const request = normalizeRequest({ ...input, pattern: "" });
  const files = await listWorkspaceFiles(access.cwd, access.signal, {
    ...request.path ? { path: request.path } : {},
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden
  });
  const result = {
    kind: "structure",
    unit: "occurrences",
    items: [],
    partial: files.partial,
    reasons: [...files.reasons],
    redact: input.redact ?? false
  };
  let retainedBytes = 0;
  const supported = files.paths.filter((path) => syntaxLanguage(path));
  if (files.paths.length && !supported.length)
    throw new SignalGrepError("Structural patterns require admitted JS/TS/TSX/Go source; no supported source files were found");
  result.stats = {
    filesEnumerated: files.paths.length,
    filesSkipped: files.paths.length - supported.length
  };
  for (const path of files.paths) {
    if (!syntaxLanguage(path))
      continue;
    try {
      const document2 = await access.load(path);
      const syntax = await access.pattern(document2, input.pattern);
      if (syntax.status !== "ok") {
        result.partial = true;
        result.reasons.push(`${path}: syntax ${syntax.status}; structural matches withheld`);
        continue;
      }
      for (const match of syntax.patternMatches ?? []) {
        const range = {
          start: document2.toByteOffset(match.start),
          end: document2.toByteOffset(match.end)
        };
        const evidence = rangeEvidence(document2, range);
        const item = {
          path: document2.path,
          line: document2.lineAt(range.start),
          source: document2.reference,
          range,
          label: "AST pattern match",
          excerpt: evidence.excerpt,
          details: {
            kind: "structural-match",
            certainty: "syntax",
            score: 90,
            rankingReason: "AST structure and repeated metavariable equality",
            excerptRange: evidence.excerptRange,
            excerptTruncated: evidence.excerptTruncated
          }
        };
        const bytes = Buffer.byteLength(JSON.stringify(item));
        if (result.items.length >= MAX_ANALYSIS_RESULTS || retainedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES - 65536) {
          result.partial = true;
          result.reasons.push("Structural evidence storage limit reached: 50,000 items / 32 MiB");
          break;
        }
        result.items.push(item);
        retainedBytes += bytes;
      }
      if (result.items.length >= MAX_ANALYSIS_RESULTS || result.reasons.at(-1)?.startsWith("Structural evidence storage"))
        break;
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        result.partial = true;
        result.reasons.push(error.message);
        break;
      }
      if (!(error instanceof SourceDocumentError))
        throw error;
      result.partial = true;
      result.reasons.push(`${path}: ${error.message}`);
    }
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.coverage = { astPatterns: result.partial ? "partial" : "complete" };
  result.scope = {
    path: request.path ?? ".",
    requestedPath: request.path ?? ".",
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden,
    expandedToProjectRoot: false,
    assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide"
  };
  return result;
}

// src/evidence-ranking.ts
function rankEvidence(items, priority) {
  const tiers = new Map;
  const ordered = items.toSorted((a, b) => priority(a) - priority(b) || a.path.localeCompare(b.path) || a.line - b.line || (a.range?.start ?? 0) - (b.range?.start ?? 0));
  for (const item of ordered) {
    const score = priority(item);
    let files = tiers.get(score);
    if (!files) {
      files = new Map;
      tiers.set(score, files);
    }
    let entries = files.get(item.path);
    if (!entries) {
      entries = [];
      files.set(item.path, entries);
    }
    entries.push(item);
  }
  const result = [];
  for (const files of tiers.values()) {
    const groups = [...files.values()];
    const depth = Math.max(0, ...groups.map((group) => group.length));
    for (let index = 0;index < depth; index += 1)
      for (const group of groups) {
        const item = group[index];
        if (item)
          result.push({
            ...item,
            details: {
              ...item.details,
              rankingOrder: "evidence tier, then round-robin files, then source position"
            }
          });
      }
  }
  return result;
}

// src/semantic-navigation.ts
import { resolve as resolve15 } from "path";

// src/semantic-project.ts
import { resolve as resolve14 } from "path";

// src/project-root.ts
import { readdir, realpath as realpath5 } from "fs/promises";
import { dirname as dirname5, relative as relative7, resolve as resolve13 } from "path";
var TYPESCRIPT_CONFIG_FILE = /^[tj]sconfig[^/]*\.json$/i;
function isMissingPath(error) {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
async function projectConfig(directory, signal) {
  if (signal?.aborted)
    throw abortError();
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() || entry.isSymbolicLink());
    if (files.some((entry) => TYPESCRIPT_CONFIG_FILE.test(entry.name)))
      return "typescript";
    if (files.some((entry) => entry.name.toLowerCase() === "package.json"))
      return "package";
    return;
  } catch (error) {
    if (isMissingPath(error))
      return;
    throw error;
  }
}
async function gitRootWithinCwd(cwd, gitRoot) {
  const absoluteCwd = resolve13(cwd);
  const [canonicalCwd, canonicalRoot] = await Promise.all([
    realpath5(absoluteCwd),
    realpath5(gitRoot)
  ]);
  if (!isPathInsideCwd(canonicalRoot, canonicalCwd))
    return;
  return resolve13(absoluteCwd, relative7(canonicalCwd, canonicalRoot));
}
async function resolveSemanticProjectRoot(cwd, targetPath, signal) {
  const absoluteCwd = resolve13(cwd);
  const absoluteTarget = resolve13(absoluteCwd, targetPath);
  if (!isPathInsideCwd(absoluteTarget, absoluteCwd))
    return absoluteCwd;
  const targetDirectory = dirname5(absoluteTarget);
  const gitRoot = await findGitRepository(targetDirectory, signal);
  if (gitRoot) {
    const localGitRoot = await gitRootWithinCwd(absoluteCwd, gitRoot);
    if (localGitRoot)
      return localGitRoot;
  }
  let packageRoot;
  let current = targetDirectory;
  while (isPathInsideCwd(current, absoluteCwd)) {
    const marker = await projectConfig(current, signal);
    if (marker === "typescript")
      return current;
    if (marker === "package" && packageRoot === undefined)
      packageRoot = current;
    if (current === absoluteCwd)
      break;
    const parent = dirname5(current);
    if (parent === current || !isPathInsideCwd(parent, absoluteCwd))
      break;
    current = parent;
  }
  return packageRoot ?? targetDirectory;
}

// src/semantic-project.ts
var semanticMetadataPath = /(?:^|\/)(?:[tj]sconfig[^/]*\.json|package\.json)$/;
function semanticWorkspacePaths(files) {
  return files.paths.filter((path) => {
    const language = syntaxLanguage(path);
    return language !== undefined && language !== "go" || semanticMetadataPath.test(path);
  }).toSorted((left, right) => left.localeCompare(right));
}
async function semanticProject(access, targetPath) {
  const root = await resolveSemanticProjectRoot(access.cwd, targetPath, access.signal);
  const files = await listWorkspaceFiles(access.cwd, access.signal, { path: root });
  const trackedPaths = semanticWorkspacePaths(files);
  const paths = files.paths.filter((path) => {
    const language = syntaxLanguage(path);
    return language && language !== "go";
  });
  const metadataPaths = files.paths.filter((path) => semanticMetadataPath.test(path));
  const target = resolve14(access.cwd, targetPath);
  if (!paths.some((path) => resolve14(access.cwd, path) === target))
    throw new SignalGrepError("Semantic target must be an admitted JS/TS workspace file under current ignore rules");
  paths.sort((a, b) => Number(resolve14(access.cwd, b) === target) - Number(resolve14(access.cwd, a) === target) || a.localeCompare(b));
  const documents = new Map;
  const reasons = [...files.reasons];
  const metadata2 = [];
  for (const path of [...paths, ...metadataPaths]) {
    try {
      const document2 = await access.load(path);
      if (!document2.utf8)
        throw new SourceDocumentError("encoding", `Non-UTF-8 semantic source: ${path}`);
      if (paths.includes(path))
        documents.set(resolve14(access.cwd, path), document2);
      else
        metadata2.push(document2);
    } catch (error) {
      if (error instanceof SourceBudgetError) {
        reasons.push(error.message);
        break;
      }
      if (!(error instanceof SourceDocumentError))
        throw error;
      reasons.push(`${path}: ${error.message}`);
    }
  }
  const primary = documents.get(target);
  if (!primary)
    throw new SignalGrepError("Semantic target could not be read within the source budget");
  const recheck = async () => {
    for (const document2 of [...documents.values(), ...metadata2]) {
      if (document2.reference.origin.kind !== "worktree")
        throw new Error("Expected worktree semantic source");
      await access.refresh(document2.path, document2.reference);
    }
    const after = await listWorkspaceFiles(access.cwd, access.signal, { path: root });
    if (JSON.stringify(semanticWorkspacePaths(after)) !== JSON.stringify(trackedPaths))
      throw new SignalGrepError("Workspace file set changed during semantic query; retry");
  };
  const result = {
    kind: "references",
    unit: "relationships",
    items: [],
    partial: reasons.length > 0,
    reasons,
    filesRead: access.filesRead,
    bytesRead: access.bytesRead,
    coverage: {
      admittedSources: reasons.length ? "partial" : "complete",
      runtimeDispatch: "not-applicable"
    },
    stats: { filesEnumerated: paths.length, filesSkipped: paths.length - documents.size }
  };
  return { documents, primary, result, recheck, root };
}

// src/semantic-navigation.ts
var semanticRequestQueue = new OwnedTaskQueue;
async function selection(input, access, document2) {
  if (input.column !== undefined) {
    if (input.line === undefined || !Number.isSafeInteger(input.column) || input.column < 1 || input.symbol !== undefined)
      throw new SignalGrepError("Semantic column requires line and no symbol; both are 1-based UTF-16 positions");
    const position = { line: input.line - 1, character: input.column - 1 };
    byteAt(document2, position);
    return position;
  }
  const syntax = await access.syntax(document2);
  if (syntax.status !== "ok")
    throw new SignalGrepError("Selecting a semantic symbol requires valid syntax; supply an exact line+column position");
  const candidates = syntax.nodes.filter((node) => /^(?:identifier|property_identifier|type_identifier|shorthand_property_identifier(?:_pattern)?)$/.test(node.kind) && (input.symbol === undefined || document2.text.slice(node.start, node.end) === input.symbol) && (input.line === undefined || document2.lineAt(document2.toByteOffset(node.start)) === input.line));
  if (input.line === undefined && input.symbol === undefined)
    throw new SignalGrepError("Semantic navigation requires path and line+column, or an unambiguous symbol");
  if (candidates.length !== 1)
    throw new SignalGrepError(`Semantic target is ${candidates.length ? "ambiguous" : "absent"}; supply an exact 1-based line and UTF-16 column`);
  const candidate = candidates[0];
  if (!candidate)
    throw new Error("Missing semantic candidate");
  return lspPosition(document2, candidate.start);
}
function itemFor(document2, location, relation) {
  const range = byteRange(document2, location.range);
  const line = document2.lineAt(range.start);
  const evidence = sourceEvidence(document2, range);
  return {
    path: document2.path,
    line,
    range,
    source: document2.reference,
    label: `Compiler-bound ${relation}`,
    excerpt: evidence.excerpt,
    details: {
      kind: "semantic",
      excerptRange: evidence.excerptRange,
      excerptTruncated: evidence.excerptTruncated || range.end > evidence.excerptRange.end,
      relation,
      binding: "typescript-compiler",
      certainty: "static",
      runtimeDispatch: "unproven",
      score: 100,
      rankingReason: "compiler binding with verified source range",
      position: { line: location.range.start.line + 1, column: location.range.start.character + 1 },
      nextRequest: {
        mode: relation === "definitions" ? "references" : "definitions",
        path: document2.path,
        line: location.range.start.line + 1,
        column: location.range.start.character + 1
      }
    }
  };
}
async function queryLocations(channel, mode, params) {
  if (mode === "callers" || mode === "callees") {
    const prepared = await channel.request("textDocument/prepareCallHierarchy", params);
    if (prepared === null)
      return [];
    if (!Array.isArray(prepared))
      throw new SignalGrepError("Invalid compiler call hierarchy");
    const found = [];
    for (const item of prepared) {
      const calls = await channel.request(mode === "callers" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls", { item });
      if (calls === null)
        continue;
      if (!Array.isArray(calls))
        throw new SignalGrepError("Invalid compiler call relationships");
      for (const call of calls) {
        if (!rpcRecord(call))
          throw new SignalGrepError("Invalid compiler call relationship");
        found.push(semanticLocation(mode === "callers" ? call.from : call.to));
      }
    }
    return found;
  }
  const method = mode === "definitions" ? "definition" : mode === "implementations" ? "implementation" : "references";
  if (!rpcRecord(params))
    throw new Error("Expected semantic request parameters");
  return locations(await channel.request(`textDocument/${method}`, {
    ...params,
    ...method === "references" ? { context: { includeDeclaration: true } } : {}
  }));
}
async function runSemanticNavigation(input, access) {
  if (!input.path || !isSemanticMode(input.mode))
    throw new SignalGrepError("Semantic navigation requires a mode and workspace path");
  const project = await semanticProject(access, input.path);
  const { result, documents, primary, root } = project;
  result.kind = input.mode;
  result.redact = input.redact ?? false;
  const mode = input.mode;
  const graph = mode === "dependencies" || mode === "dependents";
  if (graph && (input.line !== undefined || input.column !== undefined || input.symbol !== undefined))
    throw new SignalGrepError("File dependencies/dependents accept path without line, column or symbol");
  const position = graph ? undefined : await selection(input, access, primary);
  const sourceAt = await semanticSources(access.cwd, documents.values());
  const add = async (location, relation) => {
    const document2 = await sourceAt(location.path);
    if (document2)
      result.items.push(itemFor(document2, location, relation));
    else {
      result.partial = true;
      result.reasons.push("Compiler returned a location outside admitted source coverage; dependency/ignored/over-budget source was not exposed");
    }
  };
  await withTypeScript(root, [...documents.values()], async (channel) => {
    if (!graph) {
      const found = await queryLocations(channel, mode, {
        textDocument: { uri: await semanticUri(access.cwd, primary.path) },
        position
      });
      for (const location of found) {
        await add(location, mode);
      }
      return;
    }
    for (const document2 of mode === "dependencies" ? [primary] : documents.values()) {
      const syntax = await access.syntax(document2);
      if (syntax.status !== "ok") {
        result.partial = true;
        result.reasons.push(`${document2.path}: module syntax ${syntax.status}`);
        continue;
      }
      const uri = await semanticUri(access.cwd, document2.path);
      const specifiers = syntax.nodes.filter((node) => node.kind === "string" && node.parent !== null && (() => {
        const parent = syntax.nodes[node.parent];
        if (!parent)
          return false;
        if (parent.kind === "import_statement" || parent.kind === "export_statement")
          return true;
        if (parent.kind !== "arguments" || parent.parent === null)
          return false;
        const call = syntax.nodes[parent.parent];
        return call?.kind === "call_expression" && /^(?:import|require)\s*\(/.test(document2.text.slice(call.start, node.start));
      })());
      for (const specifier of specifiers) {
        const resolved = locations(await channel.request("textDocument/definition", {
          textDocument: { uri },
          position: lspPosition(document2, specifier.start + 1)
        }));
        if (!resolved.length) {
          result.partial = true;
          result.reasons.push(`${document2.path}: unresolved module ${document2.text.slice(specifier.start, specifier.end)}`);
        }
        for (const target of resolved) {
          const targetDocument = await sourceAt(target.path);
          if (mode === "dependencies") {
            await add(target, "dependency");
          } else if (targetDocument === primary) {
            await add({
              path: resolve15(access.cwd, document2.path),
              range: {
                start: lspPosition(document2, specifier.start),
                end: lspPosition(document2, specifier.end)
              }
            }, "dependent");
          }
        }
      }
      access.releaseSyntax(document2);
    }
  }, access.signal, access.cwd);
  await project.recheck();
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.items = rankEvidence([
    ...new Map(result.items.map((item) => [
      `${item.path}:${String(item.range?.start)}:${String(item.range?.end)}`,
      item
    ])).values()
  ], () => 0);
  result.reasons = [...new Set(result.reasons)];
  result.coverage = {
    ...result.coverage,
    compilerBindings: result.partial ? "partial" : "complete"
  };
  return result;
}
function navigateSemantics(input, access) {
  return semanticRequestQueue.run(() => runSemanticNavigation(input, access), access.signal);
}

// src/evidence-service.ts
import { dirname as dirname6, resolve as resolve21 } from "path";

// src/analysis-store.ts
import { randomUUID } from "crypto";

// src/analysis-term-pages.ts
var MAX_INLINE_TERM_COUNT_BYTES = 4 * 1024;
function termCountRequest(id, offset, redact) {
  return {
    cursor: `${id}.analysis-terms.${offset.toString(36)}`,
    ...redact ? { redact: true } : {}
  };
}
function analysisTermPage(result, id, offset) {
  const all = result.termCounts ?? [];
  const terms = [];
  const rows = [];
  let bytes = 0;
  for (let index = offset;index < all.length; index++) {
    const term = all[index];
    if (!term)
      throw new Error("Term inventory index unavailable");
    const row = `Term #${String(index + 1)} ${JSON.stringify(term.term)}: ${String(term.retainedOccurrences)} retained occurrences`;
    const size = Buffer.byteLength(row) + 2;
    if (bytes + size > 8 * 1024)
      break;
    rows.push(row);
    terms.push(term);
    bytes += size;
  }
  const nextOffset = offset + terms.length;
  const nextRequest = nextOffset < all.length ? termCountRequest(id, nextOffset, result.redact) : undefined;
  const matchesRequest = { cursor: `${id}.analysis.0`, ...result.redact ? { redact: true } : {} };
  return {
    text: [
      `Term inventory ${String(offset + 1)}-${String(nextOffset)} of ${String(all.length)} (${result.partial ? "PARTIAL evidence" : "complete evidence"}). Counts refer to retained occurrences.`,
      ...rows,
      ...nextRequest ? [`Next request: ${JSON.stringify(nextRequest)}`] : [],
      `Matches request: ${JSON.stringify(matchesRequest)}`
    ].join(`

`),
    details: {
      version: 1,
      mode: "matches",
      status: result.partial ? "partial" : "complete",
      snapshotComplete: !result.partial,
      totalMatches: result.items.length,
      storedMatches: result.items.length,
      returnedMatches: 0,
      totalFiles: new Set(result.items.map((item) => item.path)).size,
      cursor: nextRequest?.cursor ?? matchesRequest.cursor,
      ...nextRequest ? { nextRequest } : {},
      ...result.redact ? { redactionRequested: true } : {},
      analysis: {
        kind: result.kind,
        unit: result.unit,
        totalItems: result.items.length,
        returnedItems: 0,
        items: [],
        reasons: result.reasons,
        termCounts: terms,
        termCountsOffset: offset,
        totalTerms: all.length,
        ...nextRequest ? { termCountsNextRequest: nextRequest } : {},
        matchesRequest,
        ...result.coverage ? { coverage: result.coverage } : {}
      }
    }
  };
}

// src/analysis-store.ts
function boundedReasons(reasons) {
  const unsupportedSuffix = ": syntax unsupported; this source remains unclassified";
  const unsupported = reasons.filter((reason) => reason.endsWith(unsupportedSuffix)).map((reason) => reason.slice(0, -unsupportedSuffix.length));
  const unique = [
    ...new Set(reasons.filter((reason) => !reason.endsWith(unsupportedSuffix))),
    ...unsupported.length ? [
      `${String(unsupported.length)} matching file(s) skipped because syntax is unsupported${unsupported.length ? `; examples: ${unsupported.slice(0, 3).join(", ")}` : ""}`
    ] : []
  ];
  const retained = [];
  let bytes = 2;
  let omitted = 0;
  for (const reason of unique) {
    const reasonBytes = Buffer.byteLength(JSON.stringify(reason)) + 1;
    if (retained.length >= MAX_ANALYSIS_REASONS || bytes + reasonBytes > MAX_ANALYSIS_REASON_BYTES) {
      omitted += 1;
      continue;
    }
    retained.push(reason);
    bytes += reasonBytes;
  }
  if (omitted === 0)
    return retained;
  let notice = `${String(omitted)} additional analysis reasons omitted within the ${String(MAX_ANALYSIS_REASONS)}-reason / ${String(MAX_ANALYSIS_REASON_BYTES)}-byte diagnostic limit`;
  while (retained.length > 0 && bytes + Buffer.byteLength(JSON.stringify(notice)) + 1 > MAX_ANALYSIS_REASON_BYTES) {
    const removed = retained.pop();
    if (removed === undefined)
      break;
    bytes -= Buffer.byteLength(JSON.stringify(removed)) + 1;
    omitted += 1;
    notice = `${String(omitted)} additional analysis reasons omitted within the ${String(MAX_ANALYSIS_REASONS)}-reason / ${String(MAX_ANALYSIS_REASON_BYTES)}-byte diagnostic limit`;
  }
  retained.push(notice);
  return retained;
}
function hybridPreviewIndices(items) {
  const literal = [];
  const concept = [];
  for (const [index, item] of items.entries()) {
    if (item.details?.source === "literal" && literal.length < 3)
      literal.push(index);
    if (item.details?.source === "concept")
      concept.push(index);
  }
  return [...literal, ...concept];
}

class AnalysisStore {
  #items = new Map;
  #expired = new Set;
  #now;
  constructor(now = Date.now) {
    this.#now = now;
  }
  clear() {
    for (const id of this.#items.keys())
      this.#rememberExpired(id);
    this.#items.clear();
  }
  create(result, summarize, retentionPriority) {
    this.#expire();
    const bounded = {
      ...result,
      reasons: boundedReasons(result.reasons),
      items: [],
      coverage: { ...result.coverage, retention: "complete" }
    };
    let bytes = Buffer.byteLength(JSON.stringify(bounded));
    const candidates = result.items.map((item, index) => ({ item, index })).toSorted((left, right) => (retentionPriority?.(left.item) ?? 0) - (retentionPriority?.(right.item) ?? 0) || left.index - right.index);
    const retainedIndices = [];
    const rebuildItems = () => {
      const retained = new Set(retainedIndices);
      bounded.items = result.items.filter((_item, index) => retained.has(index)).map((item) => structuredClone(item));
    };
    for (const candidate of candidates) {
      const { item } = candidate;
      const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
      if (retainedIndices.length >= MAX_ANALYSIS_RESULTS || bytes + itemBytes > MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES) {
        bounded.partial = true;
        if (bounded.coverage)
          bounded.coverage.retention = "partial";
        bounded.reasons.push("Analysis storage limit: 50,000 items / 32 MiB; narrow the query");
        break;
      }
      retainedIndices.push(candidate.index);
      bytes += itemBytes;
    }
    rebuildItems();
    if (summarize)
      Object.assign(bounded, summarize(bounded.items));
    bytes = Buffer.byteLength(JSON.stringify(bounded));
    while (bytes > MAX_ANALYSIS_STORAGE_BYTES - 1024 && bounded.items.length > 0) {
      retainedIndices.pop();
      rebuildItems();
      bounded.partial = true;
      if (bounded.coverage)
        bounded.coverage.retention = "partial";
      if (!bounded.reasons.includes("Analysis storage limit: 50,000 items / 32 MiB; narrow the query"))
        bounded.reasons.push("Analysis storage limit: 50,000 items / 32 MiB; narrow the query");
      if (summarize)
        Object.assign(bounded, summarize(bounded.items));
      bytes = Buffer.byteLength(JSON.stringify(bounded));
    }
    bounded.reasons = boundedReasons(bounded.reasons);
    bytes = Buffer.byteLength(JSON.stringify(bounded));
    if (bytes > MAX_ANALYSIS_STORAGE_BYTES - 1024)
      throw new SignalGrepError("Analysis metadata exceeds the storage budget");
    while (this.#items.size >= MAX_ANALYSIS_SNAPSHOTS || this.#totalBytes() + bytes > MAX_ANALYSIS_STORAGE_BYTES || this.#totalItems() + bounded.items.length > MAX_ANALYSIS_RESULTS) {
      const oldest = [...this.#items.values()].toSorted((a, b) => a.touched - b.touched)[0];
      if (!oldest)
        throw new SignalGrepError("Analysis metadata exceeds the storage budget");
      this.#items.delete(oldest.id);
      this.#rememberExpired(oldest.id);
    }
    const id = randomUUID();
    this.#items.set(id, { id, result: bounded, bytes, touched: this.#now() });
    return `${id}.${result.kind === "hybrid" ? "analysis-hybrid" : "analysis"}.0`;
  }
  resolve(cursor) {
    this.#expire();
    const match = /^([a-f0-9-]+)\.(analysis|analysis-hybrid|analysis-terms)\.([0-9a-z]+)$/.exec(cursor);
    if (!match)
      throw new CursorError("Invalid analysis cursor");
    const id = match[1];
    const kind = match[2];
    const rawOffset = match[3];
    if (kind !== "analysis" && kind !== "analysis-hybrid" && kind !== "analysis-terms")
      throw new CursorError("Invalid analysis cursor");
    if (!id || !rawOffset)
      throw new CursorError("Invalid analysis cursor");
    const offset = Number.parseInt(rawOffset, 36);
    const stored = this.#items.get(id);
    if (!stored)
      throw new CursorError(this.#expired.has(id) ? "Analysis cursor expired or was evicted; run the query again" : "Analysis cursor was not found; run the query again", this.#expired.has(id) ? "E_CURSOR_EXPIRED" : "E_CURSOR_NOT_FOUND");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset.toString(36) !== rawOffset || (kind === "analysis" ? offset > stored.result.items.length : kind === "analysis-hybrid" ? offset !== 0 || stored.result.kind !== "hybrid" : offset >= (stored.result.termCounts?.length ?? 0)))
      throw new CursorError("Invalid analysis offset", "E_CURSOR_OFFSET_INVALID");
    stored.touched = this.#now();
    return { stored, offset, kind };
  }
  item(cursor, index) {
    const { stored, kind } = this.resolve(cursor);
    if (kind !== "analysis")
      throw new CursorError("Term inventories do not contain source items", "E_CURSOR_WRONG_KIND");
    if (!Number.isSafeInteger(index) || index < 1)
      throw new CursorError("matchIndex must be a positive analysis item index");
    const item = stored.result.items[index - 1];
    if (!item)
      throw new CursorError("Analysis item is outside the retained result");
    return structuredClone(item);
  }
  page(cursor) {
    const { stored, offset, kind } = this.resolve(cursor);
    const { result } = stored;
    if (kind === "analysis-terms")
      return analysisTermPage(result, stored.id, offset);
    const hybridPreview = kind === "analysis-hybrid";
    const hybridMatchesRequest = hybridPreview ? { cursor: `${stored.id}.analysis.0`, ...result.redact ? { redact: true } : {} } : undefined;
    const pagedTerms = result.termCounts && Buffer.byteLength(JSON.stringify(result.termCounts)) > MAX_INLINE_TERM_COUNT_BYTES;
    const inlineTerms = pagedTerms ? undefined : result.termCounts;
    const termsRequest = pagedTerms ? termCountRequest(stored.id, 0, result.redact) : undefined;
    const items = [];
    const sources = [];
    const sourceIds = new Map;
    const hybridInspectCursor = result.kind === "hybrid" ? `${stored.id}.analysis.0` : undefined;
    const scope = result.scope ? ` Scope: ${result.scope.assertion === "project-wide" ? "project root" : "requested path"} ${JSON.stringify(result.scope.path)}${result.scope.expandedToProjectRoot ? `, expanded after ${JSON.stringify(result.scope.requestedPath)} had no matches` : ""}.${modificationTimeBoundsText(result.scope.modifiedAfterMs, result.scope.modifiedBeforeMs)}` : "";
    const coverage = result.coverage ? ` Coverage: ${JSON.stringify(result.coverage)}.` : "";
    const stats = result.stats ? ` Stats: ${JSON.stringify(result.stats)}.` : "";
    const hasItemDetails = result.items.some((item) => item.details !== undefined);
    const header = `${result.kind}: ${result.items.length} retained ${result.unit} (${result.partial ? "PARTIAL" : "complete"}). ${result.counts ? `Counts: ${JSON.stringify(result.counts)}. ` : ""}${inlineTerms ? `Term counts: ${JSON.stringify(inlineTerms)}. ` : ""}${termsRequest ? `Term counts are paginated: ${JSON.stringify(termsRequest)}. ` : ""}Counts use ${result.unit}; they are not ordinary matching-line counts.${hasItemDetails ? " Structured output retains per-item evidence details." : ""}${scope}${coverage}${stats}`;
    const notice = result.reasons.length ? `
${result.reasons.map((reason) => `[${reason}]`).join(`
`)}` : "";
    const rows = [];
    let bytes = Buffer.byteLength(header + notice) + 1200;
    let next = offset;
    const appendItem = (index) => {
      const item = result.items[index];
      if (!item)
        throw new Error("Analysis item unavailable");
      const inspect = item.source && item.range ? {
        mode: "inspect",
        cursor: `${stored.id}.analysis.0`,
        matchIndex: index + 1,
        ...result.redact ? { redact: true } : {}
      } : undefined;
      const row = `#${index + 1} ${item.path}:${item.line} ${item.label}${item.excerpt ? `
${item.excerpt}` : ""}${inspect && !hybridInspectCursor ? `
Inspect: ${JSON.stringify(inspect)}` : ""}`;
      const rowBytes = Buffer.byteLength(row) + 2;
      if (bytes + rowBytes > MAX_RESULT_BYTES) {
        if (items.length === 0)
          throw new SignalGrepError("Analysis item exceeds the response limit; narrow its source");
        return false;
      }
      rows.push(row);
      bytes += rowBytes;
      if (!hybridPreview)
        next = index + 1;
      if (hybridInspectCursor && item.source) {
        const sourceKey = JSON.stringify(item.source);
        let sourceId = sourceIds.get(sourceKey);
        if (sourceId === undefined) {
          sourceId = sources.length;
          sources.push(item.source);
          sourceIds.set(sourceKey, sourceId);
        }
        const { source: _source, ...sharedItem } = item;
        items.push({ ...sharedItem, index: index + 1, sourceId });
      } else {
        items.push({ ...item, index: index + 1, ...inspect ? { inspect } : {} });
      }
      return true;
    };
    if (hybridPreview) {
      for (const index of hybridPreviewIndices(result.items)) {
        if (items.length >= 30 || !appendItem(index))
          break;
      }
    } else {
      for (let index = offset;index < result.items.length && items.length < 30; index += 1) {
        if (!appendItem(index))
          break;
      }
    }
    const nextRequest = hybridMatchesRequest ?? (next < result.items.length ? {
      cursor: `${stored.id}.analysis.${next.toString(36)}`,
      ...result.redact ? { redact: true } : {}
    } : undefined);
    const text = [
      header + notice,
      ...rows,
      ...hybridInspectCursor ? [
        `Inspect item #N: ${JSON.stringify({ mode: "inspect", cursor: hybridInspectCursor, matchIndex: "N" })}`
      ] : [],
      ...nextRequest ? [`Next request: ${JSON.stringify(nextRequest)}`] : []
    ].join(`

`);
    if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
      throw new SignalGrepError("Analysis metadata exceeds the output limit");
    return {
      text,
      details: {
        version: 1,
        mode: isSemanticMode(result.kind) || result.kind === "concept" || result.kind === "hybrid" || result.kind === "structure" || result.kind === "files" || result.kind === "outline" || result.kind === "imports" || result.kind === "tests" || result.kind === "impact" ? result.kind : "matches",
        status: result.partial ? "partial" : "complete",
        snapshotComplete: !result.partial,
        totalMatches: result.items.length,
        storedMatches: result.items.length,
        returnedMatches: items.length,
        totalFiles: new Set(result.items.map((item) => item.path)).size,
        cursor: nextRequest?.cursor ?? `${stored.id}.analysis.0`,
        ...nextRequest ? { nextRequest } : {},
        analysis: {
          kind: result.kind,
          unit: result.unit,
          totalItems: result.items.length,
          returnedItems: items.length,
          items,
          ...sources.length ? { sources } : {},
          ...hybridInspectCursor ? { inspectCursor: hybridInspectCursor } : {},
          reasons: result.reasons,
          ...result.filesRead !== undefined ? { filesRead: result.filesRead } : {},
          ...result.bytesRead !== undefined ? { bytesRead: result.bytesRead } : {},
          ...result.changes ? { changes: result.changes } : {},
          ...result.counts ? { counts: result.counts } : {},
          ...inlineTerms ? { termCounts: inlineTerms } : {},
          ...termsRequest ? { totalTerms: result.termCounts?.length ?? 0, termCountsNextRequest: termsRequest } : {},
          ...result.scope ? { scope: result.scope } : {},
          ...result.chunks !== undefined ? { chunks: result.chunks } : {},
          ...result.coverage ? { coverage: result.coverage } : {},
          ...result.stats ? { stats: result.stats } : {},
          ...hybridMatchesRequest ? { matchesRequest: hybridMatchesRequest } : {}
        },
        ...result.scope ? { scope: result.scope } : {},
        ...result.redact ? { redactionRequested: true } : {}
      }
    };
  }
  #expire() {
    for (const [id, item] of this.#items)
      if (this.#now() - item.touched >= ANALYSIS_TTL_MS) {
        this.#items.delete(id);
        this.#rememberExpired(id);
      }
  }
  #totalBytes() {
    return [...this.#items.values()].reduce((n, item) => n + item.bytes, 0);
  }
  #totalItems() {
    return [...this.#items.values()].reduce((n, item) => n + item.result.items.length, 0);
  }
  #rememberExpired(id) {
    this.#expired.add(id);
    while (this.#expired.size > MAX_ANALYSIS_SNAPSHOTS * 4) {
      const oldest = this.#expired.values().next().value;
      if (oldest === undefined)
        break;
      this.#expired.delete(oldest);
    }
  }
}

// src/inspect.ts
import { resolve as resolve16 } from "path";
function resolveInspectionTarget(input, cwd, snapshots) {
  let path = input.path?.replace(/^@/, "");
  let line = input.line;
  let retainedMatch;
  if (input.matchIndex !== undefined) {
    if (!input.cursor)
      throw new SignalGrepError("matchIndex requires a cursor when mode=inspect");
    if (input.path !== undefined || input.line !== undefined) {
      throw new SignalGrepError("matchIndex replaces path and line when mode=inspect");
    }
    if (!Number.isSafeInteger(input.matchIndex) || input.matchIndex < 1) {
      throw new SignalGrepError("matchIndex must be a positive integer when mode=inspect");
    }
    const { snapshot } = snapshots.resolve(input.cursor);
    retainedMatch = snapshot.matches[input.matchIndex - 1];
    if (!retainedMatch) {
      throw new CursorError(`matchIndex is ${snapshot.snapshotComplete ? "outside this snapshot" : "not retained in this partial snapshot"}.`);
    }
    path = retainedMatch.displayPath;
    line = retainedMatch.lineNumber;
  }
  if (!path)
    throw new SignalGrepError("path is required when mode=inspect");
  if (line === undefined || !Number.isSafeInteger(line) || line < 1) {
    throw new SignalGrepError("line must be a positive integer when mode=inspect");
  }
  const absolutePath = retainedMatch?.absolutePath ?? resolve16(cwd, path);
  new SearchPathPolicy(cwd).assertPath(absolutePath);
  let expectedRevision;
  if (input.cursor) {
    const { snapshot } = snapshots.resolve(input.cursor);
    retainedMatch ??= snapshot.matches.find((match) => match.absolutePath === absolutePath && match.lineNumber === line);
    if (!retainedMatch) {
      throw new CursorError("The requested line is not a retained match in this snapshot.");
    }
    expectedRevision = snapshot.sourceRevisions.get(absolutePath);
  }
  return {
    path,
    absolutePath,
    line,
    unverified: input.cursor !== undefined && expectedRevision === undefined,
    ...retainedMatch ? { retainedMatch } : {},
    ...expectedRevision ? { expectedRevision } : {}
  };
}

// src/evidence-candidates.ts
import { resolve as resolve17 } from "path";
class CandidateLimit extends SignalGrepError {
}
function record(value) {
  return typeof value === "object" && value !== null;
}
function integer(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function eventBytes(value) {
  if (record(value) && typeof value.text === "string")
    return Buffer.from(value.text);
  if (record(value) && typeof value.bytes === "string")
    return Buffer.from(value.bytes, "base64");
  throw new SignalGrepError("Raw ripgrep event omitted source bytes");
}
function occurrenceInsideRanges(range, allowed, document2) {
  return allowed.some((outer) => range.start >= outer.start && range.end <= outer.end && (range.end > range.start || range.start < outer.end || outer.end === document2.bytes.length && document2.bytes.at(-1) !== 10));
}
async function searchRawSource(cwd, document2, request, budget, allowed, signal) {
  const occurrences = [];
  try {
    const result = await runOwnedProcess({
      executable: await resolveRipgrepExecutable(),
      args: [
        "--no-config",
        "--encoding",
        "none",
        "--json",
        "--line-number",
        "--color=never",
        ...patternArguments(request),
        "--",
        request.pattern,
        "-"
      ],
      cwd,
      input: document2.bytes,
      ...signal ? { signal } : {}
    }, (stdout) => consumeCappedLines(stdout, (line) => {
      budget.protocolBytes += Buffer.byteLength(line);
      if (budget.protocolBytes > MAX_STRUCTURE_BYTES)
        throw new CandidateLimit("Raw candidate matching reached the 32 MiB protocol budget");
      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        throw new SignalGrepError("Invalid raw ripgrep JSON", { cause: error });
      }
      if (!record(event) || event.type !== "match")
        return;
      const data = event.data;
      if (!record(data) || !integer(data.absolute_offset) || !integer(data.line_number) || data.line_number < 1 || !Array.isArray(data.submatches))
        throw new SignalGrepError("Invalid raw ripgrep match event");
      const start2 = data.absolute_offset;
      const bytes = eventBytes(data.lines);
      if (document2.lineStarts[data.line_number - 1] !== start2 || start2 + bytes.length > document2.bytes.length || !document2.bytes.subarray(start2, start2 + bytes.length).equals(bytes))
        throw new SignalGrepError("Raw ripgrep evidence does not match its source version and line offset");
      for (const submatch of data.submatches) {
        if (!record(submatch) || !integer(submatch.start) || !integer(submatch.end) || submatch.end < submatch.start || submatch.end > bytes.length || !bytes.subarray(submatch.start, submatch.end).equals(eventBytes(submatch.match)))
          throw new SignalGrepError("Invalid raw ripgrep occurrence bounds or bytes");
        const range = { start: start2 + submatch.start, end: start2 + submatch.end };
        if (allowed && !occurrenceInsideRanges(range, allowed, document2))
          continue;
        if (budget.retained >= MAX_ANALYSIS_RESULTS)
          throw new CandidateLimit(`Candidate matching reached the ${String(MAX_ANALYSIS_RESULTS)} occurrence limit`);
        budget.retained += 1;
        occurrences.push(range);
      }
    }, { maxLineBytes: MAX_PROTOCOL_LINE_BYTES }));
    if (result.code !== 0 && result.code !== 1)
      throw new SignalGrepError(result.stderr.trim() || `Raw ripgrep exited ${String(result.code)}`);
  } catch (error) {
    if (!(error instanceof CandidateLimit))
      throw error;
    return { occurrences, reason: error.message };
  }
  return { occurrences };
}
async function ordinaryCandidates(options) {
  const scan = await options.runRipgrep(options.request, options.cwd, options.signal);
  if (options.signal?.aborted)
    throw abortError();
  const reasons = new Set;
  if (!scan.snapshotComplete) {
    reasons.add("Search retention is partial; only retained matching files can be analyzed");
    for (const reason of scan.retention?.reasons ?? [])
      reasons.add(reason);
  }
  const grouped = new Map;
  for (const match of scan.matches) {
    const existing = grouped.get(match.absolutePath);
    if (existing)
      existing.push(match);
    else
      grouped.set(match.absolutePath, [match]);
  }
  const files = [];
  let filesRead = 0;
  let bytesRead = 0;
  let retained = 0;
  const maxFiles = options.maxFiles ?? MAX_STRUCTURE_FILES;
  for (const [absolute, matches] of grouped) {
    if (options.signal?.aborted)
      throw abortError();
    const revision = scan.sourceRevisions.get(absolute);
    if (!revision) {
      reasons.add("Some matching files lack a verified search revision");
      continue;
    }
    if (filesRead >= maxFiles || bytesRead + revision.size > MAX_STRUCTURE_BYTES) {
      reasons.add(`Candidate analysis reached the ${String(maxFiles)}-file / 32 MiB source limit`);
      continue;
    }
    filesRead += 1;
    let document2;
    try {
      document2 = await options.access.load(absolute);
    } catch (error) {
      if (error instanceof SourceDocumentError || error instanceof SourceBudgetError) {
        reasons.add(error.message);
        continue;
      }
      throw error;
    }
    bytesRead += document2.bytes.length;
    if (document2.reference.origin.kind !== "worktree" || !sameSourceRevision(revision, document2.reference.origin.revision)) {
      reasons.add(`Source changed since search: ${document2.path}`);
      continue;
    }
    if (document2.bytes[0] === 255 && document2.bytes[1] === 254 || document2.bytes[0] === 254 && document2.bytes[1] === 255) {
      reasons.add(`Transcoded search offsets cannot be bound to raw UTF-16 source: ${document2.path}`);
      continue;
    }
    const utf8Bom = document2.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]));
    const occurrences = [];
    for (const match of matches) {
      const lineStart = document2.lineStarts[match.lineNumber - 1];
      if (lineStart === undefined)
        throw new SignalGrepError("Retained match line is outside its verified source");
      const base = lineStart + (utf8Bom && match.lineNumber === 1 ? 3 : 0);
      const lineEnd = document2.lineStarts[match.lineNumber] ?? document2.bytes.length;
      if (match.occurrences.length === 0)
        reasons.add("Some retained matches have no exact occurrence ranges");
      for (const occurrence of match.occurrences) {
        const range = { start: base + occurrence.byteStart, end: base + occurrence.byteEnd };
        document2.checkRange(range);
        if (range.end > lineEnd)
          throw new SignalGrepError("Retained occurrence extends beyond its verified source line");
        if (retained >= MAX_ANALYSIS_RESULTS) {
          reasons.add(`Candidate matching reached the ${String(MAX_ANALYSIS_RESULTS)} occurrence limit`);
          break;
        }
        retained += 1;
        occurrences.push(range);
      }
    }
    if (occurrences.length > 0)
      files.push({ document: document2, occurrences });
  }
  return { files, partial: reasons.size > 0, reasons: [...reasons], filesRead, bytesRead };
}
async function collectEvidenceCandidates(options) {
  if (!options.changes)
    return ordinaryCandidates(options);
  if (options.request.path && !isPathInsideCwd(resolve17(options.cwd, options.request.path), options.cwd)) {
    throw new SignalGrepError("Git changes for paths outside cwd are not supported; relaunch Pi from that repository or a common parent");
  }
  const reasons = new Set;
  const result = await readGitChanges(options.cwd, options.changes, options.signal, {
    filterPaths: async (paths) => {
      const selected = await filterHistoricalPaths(options.cwd, paths, options.request, options.signal);
      for (const reason of selected.reasons)
        reasons.add(reason);
      return { paths: selected.paths, bytesRead: selected.ignoreBytesRead };
    }
  });
  if (options.signal?.aborted)
    throw abortError();
  for (const reason of result.reasons)
    reasons.add(reason);
  const files = [];
  const budget = { retained: 0, protocolBytes: 0 };
  for (const file of result.files) {
    if (options.signal?.aborted)
      throw abortError();
    if (!file.content || !file.origin) {
      if (file.sourceStatus !== "absent")
        reasons.add(`${file.path}: ${file.reason ?? file.sourceStatus}`);
      continue;
    }
    const document2 = new SourceDocument({ path: file.path, origin: file.origin }, file.content);
    const changedRanges = file.changedRanges.map((range) => document2.lineRange(range.startLine, range.endLine));
    if (options.changes.scope === "lines" && changedRanges.length === 0)
      continue;
    const matched = await searchRawSource(options.cwd, document2, options.request, budget, options.changes.scope === "lines" ? changedRanges : undefined, options.signal);
    if (matched.reason)
      reasons.add(matched.reason);
    if (matched.occurrences.length > 0)
      files.push({
        document: document2,
        occurrences: matched.occurrences,
        changedRanges,
        change: file.change
      });
    if (matched.reason) {
      reasons.add("Remaining Git candidate files were not searched after the matching limit");
      break;
    }
  }
  return {
    files,
    partial: reasons.size > 0,
    reasons: [...reasons],
    filesRead: result.filesRead,
    bytesRead: result.bytesRead,
    changes: { base: result.base, target: result.target, scope: result.scope, side: result.side }
  };
}

// src/import-model.ts
import { posix } from "path";
class NavigationFailure extends Error {
  reason;
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
function navigationPath(path) {
  const normalized = posix.normalize(path.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new SignalGrepError("Navigation paths must stay inside the workspace");
  }
  return normalized.replace(/^\.\//, "");
}
function nodeText(facts, node) {
  const value = node === undefined ? undefined : facts.syntax.nodes[node] ?? facts.locations.get(node);
  return value ? facts.document.text.slice(value.start, value.end) : undefined;
}
function literalText(raw) {
  if (!raw || raw.length < 2)
    return;
  const quote = raw[0];
  if (quote !== "'" && quote !== '"' && quote !== "`" || raw.at(-1) !== quote || quote === "`" && raw.includes("${"))
    return;
  const body2 = raw.slice(1, -1);
  let result = "";
  for (let index = 0;index < body2.length; index++) {
    const character = body2[index];
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = body2[++index];
    if (escaped === undefined)
      return;
    if (escaped === `
`)
      continue;
    if (escaped === "\r") {
      if (body2[index + 1] === `
`)
        index++;
      continue;
    }
    const simple = {
      n: `
`,
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      v: "\v",
      "0": "\x00"
    };
    if (escaped in simple) {
      if (escaped === "0" && /[0-9]/.test(body2[index + 1] ?? ""))
        return;
      result += simple[escaped];
      continue;
    }
    if (escaped === "x" || escaped === "u") {
      const brace = escaped === "u" && body2[index + 1] === "{";
      const end = brace ? body2.indexOf("}", index + 2) : index + (escaped === "x" ? 2 : 4) + 1;
      if (end < 0)
        return;
      const digits = body2.slice(index + (brace ? 2 : 1), end);
      if (!/^[\da-fA-F]+$/.test(digits) || !brace && digits.length !== (escaped === "x" ? 2 : 4))
        return;
      const point = Number.parseInt(digits, 16);
      if (point > 1114111)
        return;
      result += String.fromCodePoint(point);
      index = brace ? end : end - 1;
      continue;
    }
    if (/[1-9]/.test(escaped))
      return;
    result += escaped;
  }
  return result;
}
function moduleRange(facts, node) {
  const value = facts.syntax.nodes[node] ?? facts.locations.get(node);
  if (!value)
    throw new Error("Missing syntax node");
  return {
    start: facts.document.toByteOffset(value.start),
    end: facts.document.toByteOffset(value.end)
  };
}
function nodeLine(facts, node) {
  return facts.document.lineAt(moduleRange(facts, node).start);
}
function descendants(syntax, node, kind) {
  const result = [];
  const pending = [...syntax.children[node] ?? []];
  while (pending.length) {
    const current = pending.pop();
    if (current === undefined)
      break;
    if (syntax.nodes[current]?.kind === kind)
      result.push(current);
    else
      pending.push(...syntax.children[current] ?? []);
  }
  return result.toSorted((a, b) => a - b);
}
function topLevel(syntax, node) {
  let parent = syntax.nodes[node]?.parent;
  while (parent !== null && parent !== undefined) {
    const kind = syntax.nodes[parent]?.kind;
    if (kind === "program")
      return true;
    if (kind !== "export_statement" && kind !== "lexical_declaration" && kind !== "variable_declaration" && kind !== "ambient_declaration")
      return false;
    parent = syntax.nodes[parent]?.parent;
  }
  return false;
}
function declaredNames(facts, root) {
  const names = [];
  const pending = [root];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined)
      break;
    const node = facts.syntax.nodes[id];
    if (!node || node.field === "type" || node.field === "right" || node.field === "key")
      continue;
    if (node.kind === "identifier" || node.kind === "shorthand_property_identifier_pattern") {
      const name2 = nodeText(facts, id);
      if (name2)
        names.push(name2);
    } else
      pending.push(...facts.syntax.children[id] ?? []);
  }
  return names;
}
function collectModuleFacts(document2, syntax) {
  const facts = {
    document: document2,
    syntax,
    imports: [],
    exports: [],
    declarations: new Map,
    locations: new Map
  };
  for (const symbol of syntax.symbols) {
    if (!topLevel(syntax, symbol.node))
      continue;
    if ([
      "arrow_function",
      "function_expression",
      "generator_function",
      "class",
      "variable_declarator"
    ].includes(symbol.kind))
      continue;
    const existing = facts.declarations.get(symbol.name) ?? [];
    if (!existing.includes(symbol.node))
      existing.push(symbol.node);
    facts.declarations.set(symbol.name, existing);
  }
  for (let id = 0;id < syntax.nodes.length; id++) {
    if (syntax.nodes[id]?.kind !== "variable_declarator" || !topLevel(syntax, id))
      continue;
    const binding = syntaxField(syntax, id, "name");
    if (binding === undefined)
      continue;
    for (const name2 of declaredNames(facts, binding)) {
      const existing = facts.declarations.get(name2) ?? [];
      if (!existing.includes(id))
        existing.push(id);
      facts.declarations.set(name2, existing);
    }
  }
  for (const [name2, declarations] of facts.declarations) {
    const implementations = declarations.filter((id) => ["function_declaration", "generator_function_declaration"].includes(syntax.nodes[id]?.kind ?? ""));
    if (implementations.length === 1 && declarations.every((id) => id === implementations[0] || syntax.nodes[id]?.kind === "function_signature"))
      facts.declarations.set(name2, implementations);
  }
  for (const statement of syntax.children[0] ?? []) {
    const node = syntax.nodes[statement];
    if (!node)
      continue;
    const source = literalText(nodeText(facts, syntaxField(syntax, statement, "source")));
    const children = syntax.children[statement] ?? [];
    if (node.kind === "import_statement") {
      const clause = children.find((child) => syntax.nodes[child]?.kind === "import_clause");
      const typeOnly = children.some((child) => syntax.nodes[child]?.kind === "type");
      if (clause === undefined) {
        facts.imports.push({
          statement,
          node: statement,
          source,
          imported: "*",
          kind: "side-effect",
          typeOnly
        });
        continue;
      }
      for (const child of syntax.children[clause] ?? []) {
        const kind = syntax.nodes[child]?.kind;
        if (kind === "identifier")
          facts.imports.push({
            statement,
            node: child,
            source,
            local: nodeText(facts, child) ?? "",
            imported: "default",
            kind: "default",
            typeOnly
          });
        if (kind === "namespace_import") {
          const local = (syntax.children[child] ?? []).find((part) => syntax.nodes[part]?.kind === "identifier");
          facts.imports.push({
            statement,
            node: child,
            source,
            local: nodeText(facts, local) ?? "",
            imported: "*",
            kind: "namespace",
            typeOnly
          });
        }
      }
      for (const specifier of descendants(syntax, clause, "import_specifier")) {
        const name2 = nodeText(facts, syntaxField(syntax, specifier, "name"));
        const imported = literalText(name2) ?? name2;
        if (imported === undefined)
          continue;
        const local = nodeText(facts, syntaxField(syntax, specifier, "alias")) ?? imported;
        facts.imports.push({
          statement,
          node: specifier,
          source,
          imported,
          local,
          kind: "named",
          typeOnly: typeOnly || (syntax.children[specifier] ?? []).some((part) => syntax.nodes[part]?.kind === "type")
        });
      }
    }
    if (node.kind !== "export_statement")
      continue;
    const isDefault = children.some((child) => syntax.nodes[child]?.kind === "default");
    const declaration = syntaxField(syntax, statement, "declaration");
    const value = syntaxField(syntax, statement, "value");
    if (isDefault && (declaration !== undefined || value !== undefined)) {
      const definition = declaration ?? value;
      if (definition !== undefined)
        facts.exports.push({
          statement,
          node: statement,
          exported: "default",
          definition,
          kind: "default"
        });
    } else if (declaration !== undefined) {
      for (const [name2, declarations] of facts.declarations) {
        for (const definition of declarations) {
          const current = syntax.nodes[definition];
          const container = syntax.nodes[declaration];
          if (current && container && current.start >= container.start && current.end <= container.end)
            facts.exports.push({
              statement,
              node: definition,
              exported: name2,
              local: name2,
              definition,
              kind: "named"
            });
        }
      }
    }
    for (const specifier of descendants(syntax, statement, "export_specifier")) {
      const raw = nodeText(facts, syntaxField(syntax, specifier, "name"));
      const local = literalText(raw) ?? raw;
      if (local === undefined)
        continue;
      const alias = nodeText(facts, syntaxField(syntax, specifier, "alias"));
      const exported = literalText(alias) ?? alias ?? local;
      facts.exports.push({
        statement,
        node: specifier,
        exported,
        local,
        ...source !== undefined ? { source } : {},
        kind: "named"
      });
    }
    const namespace = children.find((child) => syntax.nodes[child]?.kind === "namespace_export");
    if (namespace !== undefined) {
      const name2 = (syntax.children[namespace] ?? []).find((child) => syntax.nodes[child]?.kind === "identifier");
      facts.exports.push({
        statement,
        node: namespace,
        exported: nodeText(facts, name2) ?? "*",
        ...source !== undefined ? { source } : {},
        kind: "namespace"
      });
    } else if (children.some((child) => syntax.nodes[child]?.kind === "*")) {
      facts.exports.push({
        statement,
        node: statement,
        exported: "*",
        ...source !== undefined ? { source } : {},
        kind: "star"
      });
    }
  }
  const retained = new Set([
    0,
    ...syntax.symbols.map((symbol) => symbol.node),
    ...[...facts.declarations.values()].flat(),
    ...facts.imports.flatMap((binding) => [binding.node, binding.statement]),
    ...facts.exports.flatMap((binding) => [
      binding.node,
      binding.statement,
      ...binding.definition === undefined ? [] : [binding.definition]
    ])
  ]);
  for (const id of retained) {
    const node = syntax.nodes[id];
    if (node)
      facts.locations.set(id, { start: node.start, end: node.end, kind: node.kind });
  }
  return facts;
}
function navigationError(error) {
  if (typeof error === "object" && error !== null && "reason" in error && error.reason === "structural-read-budget-exhausted")
    return error.reason;
  if (error instanceof NavigationFailure)
    return error.reason;
  if (error instanceof SourceDocumentError)
    return error.reason;
  if (typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EISDIR" || error.code === "EACCES"))
    return "source-unavailable";
  return;
}

class NavigationContext {
  host;
  modules = new Map;
  documents = new Map;
  reasons = new Set;
  bytesRead = 0;
  #files;
  #fileLimit;
  #failures = new Map;
  #attempted = new Set;
  constructor(host, fileLimit = host.maxFilesToParse ?? MAX_STRUCTURE_FILES) {
    this.host = host;
    this.#fileLimit = fileLimit;
  }
  checkAbort() {
    if (this.host.signal?.aborted)
      throw abortError();
  }
  normalizePath(path) {
    return this.host.normalizePath?.(path) ?? navigationPath(path);
  }
  async files() {
    this.checkAbort();
    if (this.#files)
      return this.#files;
    const listed = await this.host.listFiles();
    if (!Array.isArray(listed) && listed.partial)
      for (const reason of listed.reasons)
        this.reasons.add(reason);
    this.#files = new Set((Array.isArray(listed) ? listed : listed.paths).map((path) => this.normalizePath(path)));
    return this.#files;
  }
  async module(path, retainSyntax = false) {
    this.checkAbort();
    path = this.normalizePath(path);
    const cached = this.modules.get(path);
    if (cached) {
      if (retainSyntax && cached.syntax.nodes.length === 0) {
        let retained = false;
        try {
          cached.syntax = await this.host.syntax(cached.document);
          if (cached.syntax.status !== "ok")
            throw new NavigationFailure(`syntax-${cached.syntax.status}`);
          retained = true;
        } finally {
          if (!retained)
            this.release(cached);
        }
      }
      return cached;
    }
    const failed = this.#failures.get(path);
    if (failed)
      throw new NavigationFailure(failed);
    if (!this.#attempted.has(path) && this.#attempted.size >= this.#fileLimit)
      throw new NavigationFailure("file-budget-exhausted");
    this.#attempted.add(path);
    const document2 = await this.host.load(path);
    this.documents.set(path, document2);
    let facts;
    let retained = false;
    try {
      if (document2.reference.origin.kind !== "worktree")
        throw new NavigationFailure("historical-navigation-unsupported");
      if (!document2.utf8)
        throw new NavigationFailure("encoding");
      if (this.bytesRead + document2.bytes.length > MAX_STRUCTURE_BYTES)
        throw new NavigationFailure("byte-budget-exhausted");
      this.bytesRead += document2.bytes.length;
      const syntax = await this.host.syntax(document2);
      if (syntax.language === "go" || syntax.status !== "ok") {
        const reason = syntax.language === "go" ? "language-unsupported" : `syntax-${syntax.status}`;
        this.#failures.set(path, reason);
        throw new NavigationFailure(reason);
      }
      facts = collectModuleFacts(document2, syntax);
      this.modules.set(path, facts);
      retained = retainSyntax;
      return facts;
    } finally {
      if (!retained) {
        if (facts)
          this.release(facts);
        else
          this.host.releaseSyntax?.(document2);
      }
    }
  }
  release(facts) {
    this.host.releaseSyntax?.(facts.document);
    const { language, status, limited } = facts.syntax;
    facts.syntax = {
      ...language ? { language } : {},
      status,
      limited,
      nodes: [],
      children: [],
      symbols: [],
      roles: [],
      diagnostics: []
    };
  }
  async verify() {
    const invalid = new Map;
    let exhausted = false;
    for (const [path, document2] of this.documents) {
      this.checkAbort();
      if (exhausted) {
        invalid.set(path, "structural-read-budget-exhausted");
        continue;
      }
      try {
        await this.host.load(path, document2.reference);
      } catch (error) {
        const reason = navigationError(error);
        if (!reason)
          throw error;
        invalid.set(path, reason);
        this.reasons.add(`${path}: ${reason}`);
        exhausted = reason === "structural-read-budget-exhausted";
      }
    }
    return invalid;
  }
  result(items) {
    return {
      items,
      partial: this.reasons.size > 0,
      reasons: [...this.reasons],
      filesRead: this.#attempted.size,
      bytesRead: this.bytesRead
    };
  }
}

// src/import-resolution.ts
import { posix as posix2 } from "path";
var EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
var STATIC_MODULE_RESOLUTION = "Exact relative path; extensionless source and index candidates (.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs); .js\u2192.ts/.tsx, .jsx\u2192.tsx, .mjs\u2192.mts, .cjs\u2192.cts source candidates. Every existing candidate is considered; multiple candidates are ambiguous. No configuration is executed.";
async function resolveStaticModule(context, from, specifier) {
  context.checkAbort();
  from = context.normalizePath(from);
  if (specifier === undefined)
    return { reason: "nonliteral-module-specifier" };
  if (!specifier.startsWith("./") && !specifier.startsWith("../"))
    return { reason: "external-package-or-path-alias-unsupported" };
  if (specifier.includes("\\") || specifier.includes("\x00") || /[?#]/.test(specifier))
    return { reason: "module-specifier-unsupported" };
  const joined = posix2.normalize(posix2.join(posix2.dirname(from), specifier));
  let path;
  try {
    path = context.normalizePath(joined);
  } catch (error) {
    if (error instanceof SignalGrepError)
      return { reason: "outside-workspace" };
    throw error;
  }
  const candidates = new Set([path]);
  const extension = posix2.extname(path);
  if (!extension) {
    for (const suffix of EXTENSIONS) {
      candidates.add(context.normalizePath(`${path}${suffix}`));
      candidates.add(context.normalizePath(posix2.join(path, `index${suffix}`)));
    }
  } else {
    const mappings = {
      ".js": [".ts", ".tsx"],
      ".jsx": [".tsx"],
      ".mjs": [".mts"],
      ".cjs": [".cts"]
    };
    for (const suffix of mappings[extension] ?? [])
      candidates.add(context.normalizePath(path.slice(0, -extension.length) + suffix));
  }
  const files = await context.files();
  const existing = [...candidates].filter((candidate) => files.has(candidate)).toSorted();
  if (existing.length === 0)
    return { reason: "missing-or-excluded-module", candidates: [...candidates] };
  if (existing.length > 1)
    return { reason: "ambiguous-module-candidates", candidates: existing };
  const unique = existing[0];
  if (unique === undefined)
    throw new Error("Missing unique module candidate");
  return { path: unique };
}
function declaration(facts, node, name2) {
  return {
    source: facts.document.reference,
    line: nodeLine(facts, node),
    range: moduleRange(facts, node),
    name: name2,
    kind: facts.locations.get(node)?.kind ?? "unknown"
  };
}
async function traceImport(context, initial, binding) {
  const chain = [];
  const visited = new Set;
  const paths = new Set([initial.document.path]);
  let hops = 0;
  const unresolved = (reason, candidates) => ({
    status: "unresolved",
    reason,
    chain,
    ...candidates ? { candidates } : {}
  });
  const visit = (facts, name2) => {
    const key = JSON.stringify([facts.document.path, name2]);
    if (visited.has(key))
      throw new NavigationFailure("circular-re-export");
    visited.add(key);
  };
  const followModule = async (facts, source, step) => {
    if (hops >= MAX_IMPORT_HOPS)
      return unresolved("hop-budget-exhausted");
    hops++;
    chain.push(step);
    const resolved = await resolveStaticModule(context, facts.document.path, source);
    if (!resolved.path)
      return unresolved(resolved.reason ?? "module-unresolved", resolved.candidates);
    paths.add(resolved.path);
    if (paths.size > MAX_IMPORT_FILES)
      return unresolved("file-budget-exhausted");
    const next = await context.module(resolved.path);
    step.to = next.document.reference;
    step.resolution = "static-source-candidates";
    return next;
  };
  const followImport = async (facts, current) => {
    const next = await followModule(facts, current.source, {
      from: facts.document.reference,
      line: nodeLine(facts, current.statement),
      range: moduleRange(facts, current.statement),
      kind: "import",
      ...current.source !== undefined ? { specifier: current.source } : {},
      imported: current.imported,
      ...current.local !== undefined ? { local: current.local } : {}
    });
    if (!("document" in next))
      return next;
    if (current.kind === "namespace" || current.kind === "side-effect")
      return { status: "module", chain, module: next.document.reference };
    return followExportName(next, current.imported);
  };
  const followLocal = async (facts, name2) => {
    const imported = facts.imports.filter((current) => current.local === name2);
    const declared = facts.declarations.get(name2) ?? [];
    if (imported.length + declared.length > 1)
      return unresolved("ambiguous-local-binding");
    if (imported[0])
      return followImport(facts, imported[0]);
    if (declared[0] !== undefined)
      return { status: "resolved", chain, destination: declaration(facts, declared[0], name2) };
    return unresolved("local-binding-unresolved");
  };
  const followExport = async (facts, current) => {
    if (current.kind === "star")
      return unresolved("export-star-unsupported");
    if (current.definition !== undefined)
      return {
        status: "resolved",
        chain,
        destination: declaration(facts, current.definition, current.exported)
      };
    const step = {
      from: facts.document.reference,
      line: nodeLine(facts, current.statement),
      range: moduleRange(facts, current.statement),
      kind: current.source !== undefined ? "re-export" : "local-export",
      exported: current.exported,
      ...current.local !== undefined ? { local: current.local, imported: current.local } : {},
      ...current.source !== undefined ? { specifier: current.source } : {}
    };
    if (current.source !== undefined) {
      const next = await followModule(facts, current.source, step);
      if (!("document" in next))
        return next;
      if (current.kind === "namespace")
        return { status: "module", chain, module: next.document.reference };
      if (current.local === undefined)
        return unresolved("export-binding-unresolved");
      return followExportName(next, current.local);
    }
    chain.push(step);
    if (current.local === undefined)
      return unresolved("export-binding-unresolved");
    return followLocal(facts, current.local);
  };
  const followExportName = async (facts, name2) => {
    visit(facts, name2);
    const exported = facts.exports.filter((current) => current.exported === name2 && current.kind !== "star");
    if (exported.length > 1)
      return unresolved("ambiguous-export-binding");
    if (!exported[0])
      return unresolved(facts.exports.some((current) => current.kind === "star") ? "export-star-unsupported" : "export-not-found");
    return followExport(facts, exported[0]);
  };
  try {
    if ("imported" in binding)
      return await followImport(initial, binding);
    visit(initial, binding.exported);
    return await followExport(initial, binding);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason)
      throw error;
    return unresolved(reason);
  }
}
function tracePaths(trace) {
  const paths = trace.chain.flatMap((step) => [step.from.path, ...step.to ? [step.to.path] : []]);
  if (trace.destination)
    paths.push(trace.destination.source.path);
  if (trace.module)
    paths.push(trace.module.path);
  return [...new Set(paths)];
}
function importStatementExcerpt(facts, statement) {
  const text = nodeText(facts, statement) ?? "";
  return text.length > 500 ? `${text.slice(0, 500)}\u2026 [statement excerpt truncated]` : text;
}

// src/import-navigation.ts
async function navigateImports(host, input) {
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SignalGrepError("Navigation line must be a positive integer");
  if (input.symbol !== undefined && input.symbol.trim().length === 0)
    throw new SignalGrepError("Navigation symbol must be nonempty");
  const context = new NavigationContext(host, MAX_IMPORT_FILES);
  let facts;
  try {
    facts = await context.module(input.path);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason)
      throw error;
    context.reasons.add(reason);
    return context.result([]);
  }
  const entries = [...facts.imports, ...facts.exports].filter((binding) => {
    if (input.line !== undefined) {
      const range = moduleRange(facts, binding.statement);
      if (input.line < facts.document.lineAt(range.start) || input.line > facts.document.lineAt(Math.max(range.start, range.end - 1)))
        return false;
    }
    return input.symbol === undefined || binding.local === input.symbol || ("imported" in binding ? binding.imported === input.symbol : binding.exported === input.symbol);
  });
  const items = [];
  const affected = [];
  for (const binding of entries) {
    context.checkAbort();
    const trace = await traceImport(context, facts, binding);
    const name2 = "imported" in binding ? binding.local ?? binding.imported : binding.exported;
    items.push({
      path: facts.document.path,
      line: nodeLine(facts, binding.statement),
      source: facts.document.reference,
      range: moduleRange(facts, binding.statement),
      excerpt: importStatementExcerpt(facts, binding.statement),
      label: `Static import/re-export path: ${name2} (${trace.status}${trace.reason ? `: ${trace.reason}` : ""})`,
      details: { kind: "import", ...trace, resolutionPolicy: STATIC_MODULE_RESOLUTION }
    });
    affected.push([facts.document.path, ...tracePaths(trace)]);
    if (trace.status === "unresolved")
      context.reasons.add(trace.reason ?? "import-unresolved");
  }
  if (entries.length === 0)
    context.reasons.add("no-static-import-export-at-target");
  const invalid = await context.verify();
  for (let index = 0;index < items.length; index++) {
    const item = items[index];
    const reason = affected[index]?.map((path) => invalid.get(path)).find((value) => value !== undefined);
    if (!item || reason === undefined)
      continue;
    item.label = `Static import/re-export path invalidated: ${reason}`;
    item.details = {
      ...item.details,
      status: "unresolved",
      reason,
      destination: undefined,
      module: undefined
    };
  }
  return context.result(items);
}

// src/test-navigation.ts
import { posix as posix3 } from "path";

// src/test-navigation-facts.ts
var FUNCTIONS = new Set([
  "function_declaration",
  "function_expression",
  "generator_function_declaration",
  "generator_function",
  "arrow_function",
  "method_definition"
]);
var SCOPES = new Set([
  ...FUNCTIONS,
  "program",
  "statement_block",
  "catch_clause",
  "for_statement",
  "for_in_statement",
  "class_body"
]);
var TEST_NAMES = new Set(["test", "it", "describe"]);
var FRAMEWORKS = new Map([
  ["node:test", "node:test"],
  ["bun:test", "bun:test"],
  ["vitest", "Vitest"],
  ["@jest/globals", "Jest"]
]);
function nearestScope(facts, node, functionOnly = false) {
  let current = node;
  while (current !== null && current !== undefined) {
    const value = facts.syntax.nodes[current];
    if (!value)
      break;
    if (functionOnly ? FUNCTIONS.has(value.kind) || value.kind === "program" : SCOPES.has(value.kind))
      return current;
    current = value.parent;
  }
  return 0;
}
function patternIdentifiers(facts, root) {
  if (root === undefined)
    return [];
  const output = [];
  const pending = [root];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined)
      break;
    const node = facts.syntax.nodes[id];
    if (!node || node.field === "type" || node.field === "value" && facts.syntax.nodes[node.parent ?? -1]?.kind !== "pair_pattern" || node.field === "right" || node.field === "key" || node.kind === "type_annotation")
      continue;
    if (node.kind === "identifier" || node.kind === "shorthand_property_identifier_pattern")
      output.push(id);
    else
      pending.push(...facts.syntax.children[id] ?? []);
  }
  return output;
}

class TestBindings {
  facts;
  #bindings = new Map;
  #declarations = new Set;
  constructor(facts) {
    this.facts = facts;
    const add = (ids, scope) => {
      for (const node of ids) {
        this.#declarations.add(node);
        const name2 = nodeText(facts, node) ?? "";
        const values = this.#bindings.get(name2) ?? [];
        values.push({ name: name2, node, scope });
        this.#bindings.set(name2, values);
      }
    };
    for (let id = 0;id < facts.syntax.nodes.length; id++) {
      const node = facts.syntax.nodes[id];
      if (!node)
        continue;
      if (node.kind === "variable_declarator") {
        const parent = node.parent === null ? undefined : facts.syntax.nodes[node.parent];
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "name")), nearestScope(facts, node.parent, parent?.kind === "variable_declaration"));
      }
      if (FUNCTIONS.has(node.kind)) {
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "parameters") ?? syntaxField(facts.syntax, id, "parameter")), id);
        const name2 = syntaxField(facts.syntax, id, "name");
        if (name2 !== undefined && node.kind !== "method_definition")
          add([name2], node.kind.endsWith("declaration") ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "class_declaration" || node.kind === "class") {
        const name2 = syntaxField(facts.syntax, id, "name");
        if (name2 !== undefined)
          add([name2], node.kind === "class_declaration" ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "catch_clause")
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "parameter")), id);
    }
  }
  shadowed(name2, occurrence) {
    const local = this.#bindings.get(name2);
    if (!local?.length)
      return false;
    const ancestors = new Set;
    let current = occurrence;
    while (current !== null) {
      ancestors.add(current);
      current = this.facts.syntax.nodes[current]?.parent ?? null;
    }
    return local.some((binding) => ancestors.has(binding.scope));
  }
  isReference(node) {
    const value = this.facts.syntax.nodes[node];
    if (!value || this.#declarations.has(node) || !["identifier", "shorthand_property_identifier"].includes(value.kind))
      return false;
    let current = value.parent;
    while (current !== null) {
      const ancestor = this.facts.syntax.nodes[current];
      if (!ancestor)
        break;
      if ([
        "import_statement",
        "export_statement",
        "type_annotation",
        "type_arguments",
        "type_parameters",
        "type_alias_declaration",
        "interface_declaration"
      ].includes(ancestor.kind))
        return false;
      current = ancestor.parent;
    }
    return true;
  }
}
function callee(facts, node) {
  if (node === undefined)
    return;
  const value = facts.syntax.nodes[node];
  if (!value)
    return;
  if (value.kind === "identifier")
    return { root: nodeText(facts, node) ?? "", rootNode: node, properties: [] };
  if (value.kind !== "member_expression")
    return;
  const object = callee(facts, syntaxField(facts.syntax, node, "object"));
  const property = syntaxField(facts.syntax, node, "property");
  if (!object || property === undefined || facts.syntax.nodes[property]?.kind !== "property_identifier")
    return;
  return { ...object, properties: [...object.properties, nodeText(facts, property) ?? ""] };
}
function collectTestCases(facts, bindings) {
  const cases = [];
  for (let id = 0;id < facts.syntax.nodes.length; id++) {
    if (facts.syntax.nodes[id]?.kind !== "call_expression")
      continue;
    const call = callee(facts, syntaxField(facts.syntax, id, "function"));
    if (!call)
      continue;
    const imported = facts.imports.find((binding) => binding.local === call.root);
    const properties = [...call.properties];
    let kind = call.root;
    let framework;
    const notes = [];
    if (imported && !imported.typeOnly && !bindings.shadowed(call.root, call.rootNode)) {
      framework = FRAMEWORKS.get(imported.source ?? "");
      if (imported.kind === "namespace")
        kind = properties.shift() ?? "";
      else if (imported.kind === "default" && imported.source === "node:test")
        kind = "test";
      else
        kind = imported.imported;
    } else if (imported)
      notes.push("test-binding-shadowed-or-type-only");
    if (!TEST_NAMES.has(kind))
      continue;
    if (!framework)
      notes.push("framework-binding-unresolved");
    const modifiers = properties.filter((property) => property === "skip" || property === "only");
    if (modifiers.length !== properties.length || modifiers.length > 1)
      notes.push("parameterized-or-custom-test-wrapper-unsupported");
    const argumentsNode = syntaxField(facts.syntax, id, "arguments");
    const argumentsList = argumentsNode === undefined ? [] : (facts.syntax.children[argumentsNode] ?? []).filter((child) => facts.syntax.nodes[child]?.named && facts.syntax.nodes[child]?.kind !== "comment");
    const nameNode = argumentsList[0];
    const nameKind = nameNode === undefined ? undefined : facts.syntax.nodes[nameNode]?.kind;
    const name2 = nameKind === "string" || nameKind === "template_string" ? literalText(nodeText(facts, nameNode)) : undefined;
    if (name2 === undefined)
      notes.push("dynamic-or-missing-test-name");
    const last = argumentsList.at(-1);
    const callback = last !== undefined && ["arrow_function", "function_expression", "generator_function"].includes(facts.syntax.nodes[last]?.kind ?? "") ? last : undefined;
    if (callback === undefined)
      notes.push("explicit-test-callback-unavailable");
    const supportedArguments = argumentsList.length === 2 || argumentsList.length === 3 && facts.syntax.nodes[argumentsList[1] ?? -1]?.kind === "object";
    if (!supportedArguments)
      notes.push("test-arguments-unsupported");
    cases.push({
      node: id,
      ...name2 !== undefined ? { name: name2 } : {},
      ...callback !== undefined ? { callback } : {},
      ...framework !== undefined ? { framework } : {},
      testKind: kind,
      modifiers,
      status: notes.length === 0 ? "recognized" : "syntax-candidate",
      notes
    });
  }
  return cases;
}

// src/test-navigation.ts
var SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
var TEST_FILENAME = /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/i;
var TEST_DISCOVERY_PATTERN = String.raw`\b(?:describe|it|test)\s*\(|\b(?:from\s*|require\s*\(\s*)["'](?:node:test|bun:test|vitest|@jest/globals)["']`;
function isLikelyTestPath(path) {
  return TEST_FILENAME.test(path);
}
function basenameStem(path) {
  return posix3.basename(path).replace(SOURCE_EXTENSION, "").replace(/\.(?:test|spec)$/i, "");
}
function targetSymbol(facts, input) {
  if (input.line === undefined && input.symbol === undefined)
    return;
  const symbols = facts.syntax.symbols.filter((symbol) => {
    if (!symbol.hasBody)
      return false;
    if (input.symbol !== undefined && symbol.name !== input.symbol)
      return false;
    const start2 = facts.document.lineAt(facts.document.toByteOffset(symbol.start));
    const end = facts.document.lineAt(Math.max(facts.document.toByteOffset(symbol.start), facts.document.toByteOffset(symbol.end) - 1));
    return input.line === undefined || start2 <= input.line && input.line <= end;
  }).toSorted((a, b) => a.end - a.start - (b.end - b.start));
  if (symbols.length === 0)
    throw new SignalGrepError("Test navigation target does not identify an implemented function/method");
  if (input.line === undefined && symbols.length > 1)
    throw new SignalGrepError("Test navigation symbol is ambiguous; include its source line");
  const symbol = symbols[0];
  if (!symbol)
    throw new Error("Missing selected test target symbol");
  let carrier = symbol.node;
  let parent = facts.syntax.nodes[carrier]?.parent;
  while (parent !== null && parent !== undefined && [
    "parenthesized_expression",
    "as_expression",
    "satisfies_expression",
    "type_assertion",
    "non_null_expression"
  ].includes(facts.syntax.nodes[parent]?.kind ?? "")) {
    carrier = parent;
    parent = facts.syntax.nodes[carrier]?.parent;
  }
  const directBinding = parent !== null && parent !== undefined && facts.syntax.nodes[parent]?.kind === "variable_declarator" && syntaxField(facts.syntax, parent, "value") === carrier ? moduleRange(facts, parent) : undefined;
  return { ...symbol, ...directBinding ? { directBinding } : {} };
}
function traceTargetsSymbol(context, trace, target, symbol) {
  if (!symbol)
    return trace.status === "resolved" || trace.status === "module";
  const destination = trace.destination;
  if (trace.status !== "resolved" || !destination || context.normalizePath(destination.source.path) !== context.normalizePath(target.document.path))
    return false;
  const start2 = target.document.toByteOffset(symbol.start);
  const end = target.document.toByteOffset(symbol.end);
  return destination.range.start === start2 && destination.range.end === end || destination.kind === "variable_declarator" && symbol.directBinding !== undefined && destination.range.start === symbol.directBinding.start && destination.range.end === symbol.directBinding.end;
}
async function relations(context, test, target, symbol) {
  const output = [];
  for (const binding of test.imports) {
    if (!binding.source?.startsWith("."))
      continue;
    const resolved = await resolveStaticModule(context, test.document.path, binding.source);
    const targetPath = context.normalizePath(target.document.path);
    const direct = resolved.path === targetPath;
    const trace = await traceImport(context, test, binding);
    if (trace.reason === "structural-read-budget-exhausted") {
      context.reasons.add(trace.reason);
      break;
    }
    const paths = tracePaths(trace).map((path) => context.normalizePath(path));
    const indirect = !direct && paths.includes(targetPath) && trace.status !== "unresolved";
    if (!direct && !indirect) {
      if (trace.reason && [
        "hop-budget-exhausted",
        "file-budget-exhausted",
        "byte-budget-exhausted",
        "source-changed",
        "syntax-timeout",
        "syntax-limit"
      ].includes(trace.reason))
        context.reasons.add(`${test.document.path}: ${trace.reason}`);
      continue;
    }
    output.push({
      association: direct ? "direct" : "indirect",
      binding,
      trace,
      reason: direct ? "static-import-target-module" : "static-import-re-export-path-to-target",
      targetBinding: !binding.typeOnly && traceTargetsSymbol(context, trace, target, symbol),
      paths: [...new Set([context.normalizePath(test.document.path), targetPath, ...paths])]
    });
  }
  if (output.length)
    return output;
  const stem = basenameStem(target.document.path);
  const nameSimilar = basenameStem(test.document.path) === stem;
  const textSimilar = symbol ? test.document.text.includes(symbol.name) : stem.length > 0 && test.document.text.includes(stem);
  if (nameSimilar || textSimilar)
    output.push({
      association: "weak",
      reason: nameSimilar ? "filename-similarity-only" : "source-text-similarity-only",
      targetBinding: false,
      paths: [
        context.normalizePath(test.document.path),
        context.normalizePath(target.document.path)
      ]
    });
  return output;
}
function usesInCases(facts, bindings, cases, related) {
  const names = new Set(related.filter((relation) => relation.targetBinding && relation.binding?.local).map((relation) => relation.binding?.local));
  const uses = new Map;
  const callbacks = new Map(cases.flatMap((test) => test.callback === undefined ? [] : [[test.callback, test]]));
  const owners = [];
  for (let id = 0;id < facts.syntax.nodes.length; id++) {
    const node = facts.syntax.nodes[id];
    if (!node)
      continue;
    const test = callbacks.get(id) ?? (node.parent === null ? undefined : owners[node.parent]);
    owners[id] = test;
    const callback = test?.callback === undefined ? undefined : facts.syntax.nodes[test.callback];
    if (!test || !callback)
      continue;
    const name2 = nodeText(facts, id);
    if (!name2 || !names.has(name2) || !bindings.isReference(id) || bindings.shadowed(name2, id))
      continue;
    let excerptNode = id;
    let parent = node.parent;
    while (parent !== null) {
      const value = facts.syntax.nodes[parent];
      if (!value || value.start < callback.start || value.end > callback.end)
        break;
      excerptNode = parent;
      if (value.kind === "expression_statement" || value.kind === "return_statement" || value.kind === "variable_declarator")
        break;
      parent = value.parent;
    }
    const text = nodeText(facts, excerptNode) ?? name2;
    const evidence = uses.get(test.node) ?? [];
    evidence.push({
      path: facts.document.path,
      line: nodeLine(facts, id),
      range: moduleRange(facts, id),
      binding: name2,
      excerpt: text.length > 500 ? `${text.slice(0, 500)}\u2026` : text,
      excerptTruncated: text.length > 500
    });
    uses.set(test.node, evidence);
  }
  return uses;
}
function relationDetails(facts, relation) {
  return {
    association: relation.association,
    reason: relation.reason,
    ...relation.binding ? {
      imported: relation.binding.imported,
      local: relation.binding.local,
      typeOnly: relation.binding.typeOnly,
      importLine: nodeLine(facts, relation.binding.statement),
      importRange: moduleRange(facts, relation.binding.statement),
      importExcerpt: importStatementExcerpt(facts, relation.binding.statement)
    } : {},
    ...relation.trace ? {
      chain: relation.trace.chain,
      importStatus: relation.trace.status,
      importReason: relation.trace.reason
    } : {},
    targetBindingProven: relation.targetBinding
  };
}
async function findRelatedTests(host, input, options = {}) {
  const started = performance.now();
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SignalGrepError("Test target line must be a positive integer");
  if (input.symbol !== undefined && input.symbol.trim().length === 0)
    throw new SignalGrepError("Test target symbol must be nonempty");
  const context = new NavigationContext(host);
  let target;
  try {
    target = await context.module(input.path, true);
  } catch (error) {
    const reason = navigationError(error);
    if (!reason)
      throw error;
    context.reasons.add(reason);
    return context.result([]);
  }
  let symbol;
  try {
    symbol = targetSymbol(target, input);
  } finally {
    context.release(target);
  }
  const allFiles = [...await context.files()];
  const selectedEntries = options.entryPaths ? new Set(options.entryPaths.map((path) => context.normalizePath(path))) : undefined;
  const targetPath = context.normalizePath(target.document.path);
  const eligibleEntries = allFiles.filter((path) => path !== targetPath && SOURCE_EXTENSION.test(path));
  const files = allFiles.filter((path) => path !== targetPath && SOURCE_EXTENSION.test(path) && (!selectedEntries || selectedEntries.has(path))).toSorted((a, b) => Number(TEST_FILENAME.test(b)) - Number(TEST_FILENAME.test(a)) || a.localeCompare(b));
  const items = [];
  const affected = [];
  let serializedBytes = 0;
  const append = (item, dependencies) => {
    const bytes = Buffer.byteLength(JSON.stringify(item));
    if (serializedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES || items.length >= MAX_ANALYSIS_RESULTS) {
      context.reasons.add(serializedBytes + bytes > MAX_ANALYSIS_STORAGE_BYTES ? "serialized-result-budget-exhausted" : "result-item-budget-exhausted");
      return false;
    }
    serializedBytes += bytes;
    items.push(item);
    affected.push(dependencies);
    return true;
  };
  for (const path of files) {
    context.checkAbort();
    let facts;
    try {
      facts = await context.module(path, true);
    } catch (error) {
      const reason = navigationError(error);
      if (!reason)
        throw error;
      context.reasons.add(`${path}: ${reason}`);
      if (reason === "file-budget-exhausted" || reason === "byte-budget-exhausted" || reason === "structural-read-budget-exhausted")
        break;
      continue;
    }
    try {
      const bindings = new TestBindings(facts);
      const cases = collectTestCases(facts, bindings);
      const filename = TEST_FILENAME.test(path);
      const frameworkImport = facts.imports.some((binding) => ["node:test", "bun:test", "vitest", "@jest/globals"].includes(binding.source ?? ""));
      if (!filename && !frameworkImport && cases.length === 0)
        continue;
      const related = await relations(context, facts, target, symbol);
      if (context.reasons.has("structural-read-budget-exhausted"))
        break;
      if (!related.length)
        continue;
      const association = related.some((relation) => relation.association === "direct") ? "direct" : related.some((relation) => relation.association === "indirect") ? "indirect" : "weak";
      const dependencies = [...new Set(related.flatMap((relation) => relation.paths))];
      const usesByCase = usesInCases(facts, bindings, cases, related);
      const relationIndices = [];
      for (const relation of related) {
        const node = relation.binding?.statement ?? 0;
        const item = {
          path,
          line: nodeLine(facts, node),
          label: `${relation.association} related test module: ${relation.reason}`,
          source: facts.document.reference,
          range: moduleRange(facts, node),
          ...relation.binding ? { excerpt: importStatementExcerpt(facts, relation.binding.statement) } : {},
          details: {
            kind: "test-relation",
            target: target.document.reference,
            ...relationDetails(facts, relation),
            execution: "not-run",
            assertionCoverage: "not-evaluated"
          }
        };
        if (!append(item, dependencies))
          break;
        relationIndices.push(items.length);
      }
      if (context.reasons.has("result-item-budget-exhausted") || context.reasons.has("serialized-result-budget-exhausted"))
        break;
      const selections = cases.length ? cases : [undefined];
      for (const test of selections) {
        if (items.length >= MAX_ANALYSIS_RESULTS) {
          context.reasons.add("result-item-budget-exhausted");
          break;
        }
        const uses = test ? usesByCase.get(test.node) ?? [] : [];
        const notes = [
          ...test?.notes ?? ["no-statically-readable-test-case"],
          ...uses.length === 0 ? ["no-target-binding-use-in-case"] : []
        ];
        const node = test?.node ?? related.find((relation) => relation.binding)?.binding?.statement ?? 0;
        const range = moduleRange(facts, node);
        const testName = test?.name;
        const label = `${association} related test candidate: ${testName ?? (test ? "<dynamic or unavailable name>" : path)}`;
        const caseId = JSON.stringify([path, range.start]);
        const item = {
          path,
          line: nodeLine(facts, node),
          label,
          source: facts.document.reference,
          range,
          ...uses[0] ? { excerpt: uses[0].excerpt } : {},
          details: {
            kind: "test-case",
            caseId,
            association,
            status: test?.status ?? "syntax-candidate",
            target: target.document.reference,
            ...symbol ? { targetSymbol: { name: symbol.name, range: moduleRange(target, symbol.node) } } : {},
            ...test ? {
              test: {
                ...testName !== undefined ? { name: testName } : {},
                framework: test.framework,
                kind: test.testKind,
                modifiers: test.modifiers,
                range
              }
            } : {},
            relationItems: {
              first: relationIndices[0],
              last: relationIndices.at(-1),
              count: relationIndices.length
            },
            useCount: uses.length,
            notes,
            assertionCoverage: "not-evaluated",
            execution: "not-run"
          }
        };
        if (!append(item, dependencies))
          break;
        const caseIndex = items.length;
        for (const use of uses) {
          const evidence = {
            path,
            line: use.line,
            label: `Static binding use in test candidate: ${testName ?? "<dynamic or unavailable name>"}`,
            source: facts.document.reference,
            range: use.range,
            excerpt: use.excerpt,
            details: {
              kind: "test-use",
              caseId,
              caseIndex,
              association,
              target: target.document.reference,
              binding: use.binding,
              excerptTruncated: use.excerptTruncated,
              execution: "not-run",
              assertionCoverage: "not-evaluated"
            }
          };
          if (!append(evidence, dependencies))
            break;
        }
        if (context.reasons.has("result-item-budget-exhausted") || context.reasons.has("serialized-result-budget-exhausted"))
          break;
      }
      if (context.reasons.has("result-item-budget-exhausted") || context.reasons.has("serialized-result-budget-exhausted"))
        break;
    } finally {
      context.release(facts);
    }
  }
  const invalid = await context.verify();
  for (let index = 0;index < items.length; index++) {
    const item = items[index];
    const reason = affected[index]?.map((path) => invalid.get(path)).find((value) => value !== undefined);
    if (!item || reason === undefined)
      continue;
    item.label = `Related test candidate invalidated: ${reason}`;
    item.details = {
      ...item.details,
      status: "invalidated",
      reason,
      association: "unresolved",
      uses: []
    };
  }
  return {
    ...context.result(items),
    counts: {
      candidateFiles: new Set(items.map((item) => item.path)).size,
      testCases: items.filter((item) => item.details.kind === "test-case").length,
      useSites: items.filter((item) => item.details.kind === "test-use").length,
      moduleRelations: items.filter((item) => item.details.kind === "test-relation").length
    },
    stats: {
      filesParsed: context.modules.size,
      filesSkipped: Math.max(0, eligibleEntries.length - files.length),
      parseMs: Math.round(performance.now() - started),
      budgetExhausted: [...context.reasons].some((reason) => reason.includes("budget-exhausted"))
    }
  };
}

// src/impact-target.ts
function lineBounds(document2, symbol) {
  const start2 = document2.lineAt(document2.toByteOffset(symbol.start));
  const byteEnd = document2.toByteOffset(symbol.end);
  const end = document2.lineAt(Math.max(document2.toByteOffset(symbol.start), byteEnd - 1));
  return { start: start2, end };
}
function stableName(name2) {
  return name2 !== "default" && !name2.startsWith("<anonymous");
}
var OVERLOAD_OWNERS = new Set([
  "program",
  "statement_block",
  "class_body",
  "interface_body",
  "object"
]);
function overloadOwner(syntax, symbol) {
  let current = symbol.node;
  while (current !== null) {
    const node = syntax.nodes[current];
    if (!node)
      return;
    if (OVERLOAD_OWNERS.has(node.kind))
      return current;
    current = node.parent;
  }
  return;
}
function isOverloadSignature(implementation, candidate) {
  if (candidate.hasBody)
    return false;
  if (implementation.kind === "function_declaration" || implementation.kind === "generator_function_declaration")
    return candidate.kind === "function_signature";
  if (implementation.kind === "method_definition" || implementation.kind === "method_declaration")
    return candidate.kind === "method_signature";
  return false;
}
function selectImpactTarget(document2, syntax, input) {
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SignalGrepError("Impact target line must be a positive integer");
  if (input.symbol !== undefined && !input.symbol.trim())
    throw new SignalGrepError("Impact target symbol must be nonempty");
  if (syntax.status !== "ok" || syntax.language !== "javascript" && syntax.language !== "typescript" && syntax.language !== "tsx")
    throw new SignalGrepError(`Impact requires reliable JS/TS/TSX syntax (${syntax.language ?? "unsupported"}: ${syntax.status})`);
  const candidates = syntax.symbols.filter((candidate) => {
    if (input.symbol !== undefined && candidate.name !== input.symbol)
      return false;
    if (input.line === undefined)
      return true;
    const bounds = lineBounds(document2, candidate);
    return bounds.start <= input.line && input.line <= bounds.end;
  });
  let selected;
  if (input.line !== undefined) {
    const ordered = candidates.toSorted((left, right) => left.end - left.start - (right.end - right.start) || left.start - right.start);
    selected = ordered[0];
    if (selected && ordered[1] && ordered[1].end - ordered[1].start === selected.end - selected.start)
      throw new SignalGrepError("Impact target is ambiguous at this line; include a unique symbol");
  } else if (candidates.length === 1) {
    selected = candidates[0];
  } else if (candidates.length > 1) {
    const implemented = candidates.filter((candidate) => candidate.hasBody);
    const implementation = implemented[0];
    const owner = implementation ? overloadOwner(syntax, implementation) : undefined;
    if (implemented.length === 1 && implementation && owner !== undefined && candidates.every((candidate) => candidate === implementation || isOverloadSignature(implementation, candidate) && overloadOwner(syntax, candidate) === owner))
      selected = implementation;
  }
  if (!selected)
    throw new SignalGrepError(candidates.length > 1 ? "Impact target symbol is ambiguous; include its source line" : "Impact target does not identify a source symbol");
  if (!stableName(selected.name))
    throw new SignalGrepError("Impact target has no stable source binding name");
  const range = {
    start: document2.toByteOffset(selected.start),
    end: document2.toByteOffset(selected.end)
  };
  const signatureEnd = selected.bodyStart ?? selected.end;
  const signature = document2.text.slice(selected.start, Math.min(signatureEnd, selected.start + 600));
  return {
    document: document2,
    symbol: selected,
    item: {
      path: document2.path,
      line: document2.lineAt(range.start),
      label: `Impact target: ${selected.scope ? `${selected.scope}.` : ""}${selected.name}`,
      excerpt: signature,
      source: document2.reference,
      range,
      details: {
        kind: "impact-target",
        name: selected.name,
        syntaxKind: selected.kind,
        scope: selected.scope ?? "<module>",
        hasBody: selected.hasBody,
        exported: selected.exported,
        signatureTruncated: signatureEnd - selected.start > 600
      }
    }
  };
}

// src/impact-analysis.ts
var CATEGORY_ORDER = [
  "declaration",
  "import",
  "export",
  "call",
  "code",
  "comment",
  "string",
  "jsx-text",
  "unknown",
  "unclassified"
];
var TEST_ORDER = new Map([
  ["test-use", 5],
  ["test-case", 6],
  ["test-relation", 7]
]);
function primaryCategory(roles) {
  for (const category of CATEGORY_ORDER) {
    if (category !== "unclassified" && roles.some((role) => role.role === category))
      return category;
  }
  return "unknown";
}
function roleDetails(roles, document2) {
  return roles.map((role) => ({
    role: role.role,
    certainty: role.certainty,
    subkind: role.subkind,
    range: {
      start: document2.toByteOffset(role.start),
      end: document2.toByteOffset(role.end)
    }
  }));
}
function occurrenceItem(file, range, target, category, roles) {
  const match = file.document.utf8 ? sourceEvidence(file.document, range) : undefined;
  return {
    path: file.document.path,
    line: file.document.lineAt(range.start),
    label: `Exact same-spelling candidate (${category}; binding unproven)`,
    ...match ? { excerpt: match.excerpt } : {},
    source: file.document.reference,
    range,
    details: {
      kind: "impact-occurrence",
      impactCategory: category,
      binding: "unproven",
      score: category === "call" || category === "declaration" ? 70 : category === "comment" || category === "string" ? 20 : 40,
      rankingReason: `exact spelling with ${category} syntax; binding unproven`,
      target: {
        path: target.document.path,
        name: target.symbol.name,
        range: target.item.range
      },
      roles: roleDetails(roles, file.document),
      ...match ? {
        excerptRange: match.excerptRange,
        excerptTruncated: match.excerptTruncated
      } : {}
    }
  };
}
async function classifyImpactOccurrences(files, target, owner) {
  const items = [];
  const reasons = new Set;
  const process2 = async (index) => {
    const file = files[index];
    if (!file)
      return;
    const language = syntaxLanguage(file.document.path);
    let classified = false;
    let syntax;
    if (language && file.document.utf8) {
      try {
        syntax = await owner.syntax(file.document);
        classified = syntax.status === "ok";
        if (!classified)
          reasons.add(`${file.document.path}: syntax ${syntax.status}; exact occurrences remain unclassified`);
      } finally {
        owner.releaseSyntax(file.document);
      }
    } else if (language) {
      reasons.add(`${file.document.path}: syntax classification requires lossless UTF-8 source; exact occurrences remain unclassified`);
    }
    const seen = new Set;
    for (const range of file.occurrences) {
      const key = `${String(range.start)}:${String(range.end)}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      const roles = classified && syntax ? classifySyntaxRange(syntax, file.document.toCharacterOffset(range.start), file.document.toCharacterOffset(range.end)) : [];
      const category = classified ? primaryCategory(roles) : "unclassified";
      items.push(occurrenceItem(file, range, target, category, roles));
    }
    await process2(index + 1);
  };
  await process2(0);
  return { items, partial: reasons.size > 0, reasons: [...reasons] };
}
function itemOrder(item) {
  if (item.details?.kind === "impact-target")
    return -1;
  if (item.details?.binding === "typescript-compiler")
    return -0.5;
  if (item.details?.kind === "impact-occurrence") {
    const category = item.details.impactCategory;
    const index = CATEGORY_ORDER.findIndex((value) => value === category);
    if (index < 5)
      return index;
    return index + 3;
  }
  return TEST_ORDER.get(String(item.details?.kind)) ?? 13;
}
function mergeImpactItems(target, occurrences, tests) {
  const stableTests = tests.map((item) => {
    if (!item.details)
      return item;
    const details = { ...item.details };
    if (details.kind === "test-use")
      delete details.caseIndex;
    if (details.kind === "test-case")
      delete details.relationItems;
    return { ...item, details };
  });
  return rankEvidence([target, ...occurrences, ...stableTests], itemOrder);
}
function impactRetentionPriority(item) {
  return item.details?.kind === "impact-target" || item.details?.kind === "impact-occurrence" || item.details?.kind === "impact-reference" ? 0 : 1;
}
function impactRetentionExhausted(items) {
  if (items.length >= MAX_ANALYSIS_RESULTS)
    return true;
  const bytes = items.reduce((total, item) => total + Buffer.byteLength(JSON.stringify(item)) + 1, 0);
  return bytes >= MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES;
}
function retainedImpactCounts(items) {
  const counts = {
    targets: 0,
    compilerBoundReferences: 0,
    additionalAliasReferences: 0,
    retainedExactOccurrences: 0,
    testUses: 0,
    testCases: 0,
    testRelations: 0
  };
  for (const item of items) {
    const kind = item.details?.kind;
    if (item.details?.binding === "typescript-compiler")
      counts.compilerBoundReferences = (counts.compilerBoundReferences ?? 0) + 1;
    if (kind === "impact-reference")
      counts.additionalAliasReferences = (counts.additionalAliasReferences ?? 0) + 1;
    if (kind === "impact-target")
      counts.targets = (counts.targets ?? 0) + 1;
    else if (kind === "impact-occurrence") {
      counts.retainedExactOccurrences = (counts.retainedExactOccurrences ?? 0) + 1;
      const category = item.details?.impactCategory;
      if (typeof category === "string")
        counts[category] = (counts[category] ?? 0) + 1;
    } else if (kind === "test-use")
      counts.testUses = (counts.testUses ?? 0) + 1;
    else if (kind === "test-case")
      counts.testCases = (counts.testCases ?? 0) + 1;
    else if (kind === "test-relation")
      counts.testRelations = (counts.testRelations ?? 0) + 1;
  }
  return { counts };
}

// src/literal-search.ts
function escapeRegexLiteral(term) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function literalOccurrences(document2, term, allowed) {
  const needle = Buffer.from(term);
  const found = [];
  for (let start2 = document2.bytes.indexOf(needle);start2 >= 0; start2 = document2.bytes.indexOf(needle, start2 + Math.max(1, needle.length))) {
    const range = { start: start2, end: start2 + needle.length };
    if (!allowed || allowed.some((part) => part.start <= range.start && range.end <= part.end))
      found.push(range);
  }
  return found;
}

// src/multi-term-search.ts
function validateAnyOf(value) {
  if (value === undefined)
    return;
  if (!Array.isArray(value) || value.length < MIN_ANY_OF_TERMS || value.length > MAX_ANY_OF_TOTAL_TERMS || value.some((term) => typeof term !== "string" || term.length === 0 || !term.isWellFormed() || /[\r\n\0]/.test(term) || Buffer.byteLength(term) > MAX_LITERAL_TERM_BYTES) || new Set(value).size !== value.length) {
    throw new SignalGrepError(`anyOf requires ${String(MIN_ANY_OF_TERMS)}\u2013${String(MAX_ANY_OF_TOTAL_TERMS)} distinct, nonempty, well-formed, single-line literal terms of at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes; requests above ${String(MAX_ANY_OF_TERMS)} terms are safely chunked`);
  }
  return value;
}
function expandMultiTermCandidates(files, terms, changedLinesOnly) {
  const items = [];
  const reasons = new Set;
  const orderedFiles = files.toSorted((left, right) => left.document.path.localeCompare(right.document.path));
  for (const file of orderedFiles) {
    if (!file.document.utf8) {
      reasons.add(`${file.document.path}: exact multi-term evidence requires lossless UTF-8 source`);
    }
  }
  let serializedBytes = 0;
  let exhausted = false;
  for (let termIndex = 0;termIndex < terms.length && !exhausted; termIndex++) {
    const term = terms[termIndex];
    if (term === undefined)
      throw new Error("Missing validated anyOf term");
    for (const file of orderedFiles) {
      if (!file.document.utf8)
        continue;
      const allowed = changedLinesOnly ? file.changedRanges : undefined;
      for (const range of literalOccurrences(file.document, term, allowed)) {
        const match = sourceEvidence(file.document, range);
        const item = {
          path: file.document.path,
          line: match.line,
          label: `Exact literal occurrence for ${JSON.stringify(term)}`,
          excerpt: match.excerpt,
          source: file.document.reference,
          range,
          details: {
            kind: "literal-term",
            term,
            termIndex,
            excerptRange: match.excerptRange,
            excerptTruncated: match.excerptTruncated
          },
          termIndex
        };
        const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
        if (items.length >= MAX_ANALYSIS_RESULTS || serializedBytes + itemBytes >= MAX_ANALYSIS_STORAGE_BYTES - ANALYSIS_METADATA_RESERVE_BYTES) {
          reasons.add("Exact multi-term retention reached the 50,000-item / 32 MiB analysis limit");
          exhausted = true;
          break;
        }
        items.push(item);
        serializedBytes += itemBytes;
      }
      if (exhausted)
        break;
    }
  }
  return {
    items: items.map(({ termIndex: _termIndex, ...item }) => item),
    partial: reasons.size > 0,
    reasons: [...reasons]
  };
}
function retainedTermCounts(terms, items) {
  const counts = new Map(terms.map((term) => [term, 0]));
  for (const item of items) {
    const term = item.details?.term;
    if (typeof term === "string" && counts.has(term))
      counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return terms.map((term) => ({ term, retainedOccurrences: counts.get(term) ?? 0 }));
}

// src/owned-parallel.ts
async function runOwnedParallel(start2, parent) {
  const controller = new AbortController;
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const operations = start2(signal).map(async (operation) => {
    try {
      return await operation;
    } catch (error) {
      controller.abort();
      throw error;
    }
  });
  try {
    return await Promise.all(operations);
  } catch (error) {
    await Promise.allSettled(operations);
    throw error;
  }
}

// src/file-discovery.ts
import { basename as platformBasename, posix as posix4, relative as relative8, resolve as resolve19, sep as sep4 } from "path";

// src/file-metadata-filter.ts
import { resolve as resolve18 } from "path";
async function filterPathsByModificationTime(cwd, paths, modifiedAfterMs, modifiedBeforeMs, signal) {
  if (modifiedAfterMs === undefined && modifiedBeforeMs === undefined)
    return { paths: [...paths], partial: false, reasons: [] };
  const retained = [];
  const reasons = new Set;
  for (let offset = 0;offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted)
      throw abortError();
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    const revisions = await Promise.all(batch.map(async (path) => {
      const revision = await getSourceRevision(resolve18(cwd, path));
      return revision ? { path, revision } : { path };
    }));
    for (const { path, revision } of revisions) {
      if (!revision) {
        reasons.add(`Modification time unavailable for ${path}; it was excluded from the filtered set`);
        continue;
      }
      if (matchesModificationTime(revision, modifiedAfterMs, modifiedBeforeMs))
        retained.push(path);
    }
  }
  return { paths: retained, partial: reasons.size > 0, reasons: [...reasons] };
}

// src/file-discovery.ts
var graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function subsequenceScore(text, query) {
  const characters = Array.from(graphemes.segment(text), (item) => item.segment);
  const queryCharacters = Array.from(graphemes.segment(query), (item) => item.segment);
  let next = 0;
  let first = -1;
  let last = 0;
  for (const character of queryCharacters) {
    const index = characters.indexOf(character, next);
    if (index < 0)
      return;
    if (first < 0)
      first = index;
    last = index;
    next = index + 1;
  }
  return Math.round(40 * queryCharacters.length / Math.max(1, last - first + 1));
}
function scoreFilePath(path, query) {
  if (!query)
    return { score: 0, reason: "all admitted files" };
  const normalized = path.toLowerCase();
  const needle = query.toLowerCase();
  const basename = posix4.basename(normalized);
  if (basename === needle)
    return { score: 100, reason: "exact filename" };
  if (basename.slice(0, basename.length - posix4.extname(basename).length) === needle)
    return { score: 95, reason: "exact filename stem" };
  if (basename.includes(needle))
    return { score: 85, reason: "filename substring" };
  if (normalized.includes(needle))
    return { score: 70, reason: "path substring" };
  const scores = needle.trim().split(/\s+/).map((term) => subsequenceScore(normalized, term));
  if (scores.some((score) => score === undefined))
    return;
  return {
    score: Math.min(...scores.map((score) => score ?? 0)),
    reason: "ordered fuzzy path characters; candidate, not an exact filename"
  };
}
function pathRelativeToDiscoveryRoot(cwd, root, path) {
  const absoluteRoot = resolve19(cwd, root);
  const absolutePath = resolve19(cwd, path);
  const scoped = relative8(absoluteRoot, absolutePath).split(sep4).join("/");
  return scoped || platformBasename(absolutePath);
}
async function discoverFiles(input, cwd, signal) {
  const query = input.query ?? "";
  if (query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError("File query must be well-formed single-line text of at most 256 characters");
  const request = normalizeRequest({ ...input, pattern: "" });
  const policy = new SearchPathPolicy(cwd);
  const discoveryRoot = request.path ?? ".";
  const scoringRoot = await policy.resolveSearchTarget(discoveryRoot);
  const files = await listWorkspaceFiles(cwd, signal, {
    path: scoringRoot,
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden
  });
  const filtered = await filterPathsByModificationTime(cwd, files.paths, request.modifiedAfterMs, request.modifiedBeforeMs, signal);
  const selected = filtered.paths.flatMap((path) => {
    const rank = scoreFilePath(pathRelativeToDiscoveryRoot(cwd, scoringRoot, path), query);
    return rank ? [{ path, ...rank }] : [];
  }).toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  for (let offset = 0;offset < selected.length; offset += 16) {
    await Promise.all(selected.slice(offset, offset + 16).map((item) => policy.assertExistingPath(item.path)));
    signal?.throwIfAborted();
  }
  return {
    kind: "files",
    unit: "files",
    partial: files.partial || filtered.partial,
    reasons: [...new Set([...files.reasons, ...filtered.reasons])],
    items: selected.map((item) => ({
      path: item.path,
      line: 1,
      label: `File candidate (${item.reason})`,
      details: {
        kind: "file",
        score: item.score,
        rankingReason: item.reason,
        inspect: { mode: "inspect", path: item.path, line: 1 }
      }
    })),
    coverage: { fileEnumeration: files.partial || filtered.partial ? "partial" : "complete" },
    stats: { filesEnumerated: files.paths.length },
    scope: {
      path: request.path ?? ".",
      requestedPath: request.path ?? ".",
      glob: request.glob,
      exclude: request.exclude,
      hidden: request.hidden,
      expandedToProjectRoot: false,
      assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide",
      ...request.modifiedAfterMs !== undefined ? { modifiedAfterMs: request.modifiedAfterMs } : {},
      ...request.modifiedBeforeMs !== undefined ? { modifiedBeforeMs: request.modifiedBeforeMs } : {}
    },
    redact: input.redact ?? false
  };
}

// src/source-continuations.ts
import { randomUUID as randomUUID2 } from "crypto";

// src/source-pages.ts
function mergeByteRanges(ranges) {
  const merged = [];
  for (const range of ranges.toSorted((a, b) => a.start - b.start || a.end - b.end)) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start) {
      throw new SignalGrepError("Invalid source range");
    }
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else
      merged.push({ start: range.start, end: range.end });
  }
  return merged;
}
function subtractByteRange(ranges, returned) {
  const remaining = [];
  for (const range of ranges) {
    if (returned.end <= range.start || returned.start >= range.end) {
      remaining.push({ start: range.start, end: range.end });
      continue;
    }
    if (range.start < returned.start)
      remaining.push({ start: range.start, end: returned.start });
    if (returned.end < range.end)
      remaining.push({ start: returned.end, end: range.end });
  }
  return remaining;
}
function utf8Boundary(document2, offset, direction) {
  let byte = Math.max(0, Math.min(document2.bytes.length, offset));
  while (byte > 0 && byte < document2.bytes.length) {
    const value = document2.bytes[byte];
    if (value === undefined || (value & 192) !== 128)
      break;
    byte += direction;
  }
  return byte;
}
function renderSourceFragment(fragment) {
  const header = `[source bytes ${String(fragment.start)}..${String(fragment.end)}; ${String(fragment.startPosition.line)}:${String(fragment.startPosition.column)}\u2013${String(fragment.endPosition.line)}:${String(fragment.endPosition.column)}; UTF-8, end exclusive]`;
  const lines = fragment.text.split(`
`);
  return [
    header,
    ...lines.map((text, index) => `${String(fragment.startPosition.line + index)}: ${text}`)
  ].join(`
`);
}
function sourcePage(document2, ranges, maxBytes, focus) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) {
    throw new SignalGrepError("Source page budget must allow at least 256 bytes");
  }
  const gaps = mergeByteRanges(ranges);
  const range = gaps.find((item) => focus !== undefined && item.start <= focus && focus < item.end) ?? gaps[0];
  if (!range)
    throw new SignalGrepError("Source range is already complete");
  document2.checkRange(range);
  document2.toCharacterOffset(range.start);
  document2.toCharacterOffset(range.end);
  const target = Math.max(range.start, Math.min(range.end, focus ?? range.start));
  let available = Math.max(4, maxBytes - 160);
  for (;; ) {
    let start2 = range.start;
    if (range.end - range.start > available && target - range.start > available / 2) {
      start2 = utf8Boundary(document2, Math.floor(target - available / 2), 1);
    }
    start2 = Math.max(range.start, start2);
    let end = utf8Boundary(document2, Math.min(range.end, start2 + available), -1);
    if (end <= start2 && range.end > range.start)
      end = utf8Boundary(document2, start2 + 1, 1);
    const fragment = {
      start: start2,
      end,
      text: document2.slice({ start: start2, end }),
      startPosition: document2.positionAt(start2),
      endPosition: document2.positionAt(end)
    };
    const text = renderSourceFragment(fragment);
    if (Buffer.byteLength(text) <= maxBytes) {
      return {
        fragment,
        remaining: subtractByteRange(gaps, fragment).filter((gap) => gap.start < gap.end),
        text
      };
    }
    if (available <= 4)
      throw new SignalGrepError("Source metadata exceeds the page budget");
    available = Math.max(4, Math.floor(available * 0.75));
  }
}

// src/source-continuations.ts
class SourceContinuations {
  #items = new Map;
  #now;
  constructor(now = Date.now) {
    this.#now = now;
  }
  create(source, target, gaps, boundary) {
    this.#sweep();
    const item = {
      id: randomUUID2(),
      source: structuredClone(source),
      target: mergeByteRanges(target),
      gaps: mergeByteRanges(gaps),
      ...boundary ? { boundary } : {},
      accessed: this.#now(),
      issued: new Set([0])
    };
    if (item.gaps.length === 0 || item.gaps.some((gap) => gap.start === gap.end || !item.target.some((range) => range.start <= gap.start && gap.end <= range.end))) {
      throw new CursorError("Source continuation requires missing ranges inside its target");
    }
    this.#items.set(item.id, item);
    while (this.#items.size > MAX_SOURCE_CONTINUATIONS || Buffer.byteLength(JSON.stringify([...this.#items.values()].map((continuation) => Object.assign({
      id: continuation.id,
      source: continuation.source,
      target: continuation.target,
      gaps: continuation.gaps,
      accessed: continuation.accessed,
      issued: [...continuation.issued]
    }, continuation.boundary ? { boundary: continuation.boundary } : {})))) > MAX_SOURCE_CONTINUATION_BYTES) {
      let oldest;
      for (const candidate of this.#items.values()) {
        if (!oldest || candidate.accessed < oldest.accessed)
          oldest = candidate;
      }
      if (!oldest)
        break;
      this.#items.delete(oldest.id);
    }
    if (!this.#items.has(item.id))
      throw new CursorError("Source continuation metadata exceeds its limit");
    return `${item.id}.source.0`;
  }
  resolve(cursor) {
    const { item, consumed } = this.#resolve(cursor);
    return {
      source: structuredClone(item.source),
      target: item.target.map((range) => ({ ...range })),
      remaining: this.#remaining(item, consumed),
      ...item.boundary ? { boundary: item.boundary } : {}
    };
  }
  advance(cursor, returned) {
    const { item, consumed } = this.#resolve(cursor);
    const remaining = this.#remaining(item, consumed);
    const first = remaining[0];
    if (!first || returned.start !== first.start || returned.end <= returned.start || returned.end > first.end) {
      throw new CursorError("Source continuation must advance along its next missing range");
    }
    const next = consumed + returned.end - returned.start;
    item.issued.add(next);
    return this.#remaining(item, next).length > 0 ? `${item.id}.source.${next.toString(36)}` : undefined;
  }
  clear() {
    this.#items.clear();
  }
  #resolve(cursor) {
    this.#sweep();
    const match = /^([0-9a-f-]+)\.source\.([0-9a-z]+)$/.exec(cursor);
    if (!match?.[1] || !match[2])
      throw new CursorError("Invalid source continuation cursor");
    const item = this.#items.get(match[1]);
    if (!item)
      throw new CursorError("Source continuation expired or was evicted; inspect again");
    const consumed = Number.parseInt(match[2], 36);
    const length = item.gaps.reduce((sum, range) => sum + range.end - range.start, 0);
    if (!Number.isSafeInteger(consumed) || consumed < 0 || consumed >= length || !item.issued.has(consumed)) {
      throw new CursorError("Source continuation offset is outside its missing ranges");
    }
    item.accessed = this.#now();
    return { item, consumed };
  }
  #remaining(item, consumed) {
    let left = consumed;
    let ranges = item.gaps.map((range) => ({ ...range }));
    for (const range of item.gaps) {
      if (left === 0)
        break;
      const take = Math.min(left, range.end - range.start);
      ranges = subtractByteRange(ranges, { start: range.start, end: range.start + take });
      left -= take;
    }
    return ranges;
  }
  #sweep() {
    const cutoff = this.#now() - ANALYSIS_TTL_MS;
    for (const item of this.#items.values())
      if (item.accessed < cutoff)
        this.#items.delete(item.id);
  }
}

// src/source-inspection.ts
import { resolve as resolve20 } from "path";
function usesDocumentLineWindow(path) {
  return /\.(?:md|markdown)$/iu.test(path);
}
function legacySourceTarget(target) {
  return {
    path: target.path,
    line: target.line,
    unverified: target.unverified,
    ...target.expectedRevision ? { expectedRevision: target.expectedRevision } : {},
    ...target.retainedMatch?.occurrences[0] ? { focus: target.retainedMatch.occurrences[0].byteStart } : {}
  };
}
function errorStatus(error) {
  if (error instanceof SourceDocumentError)
    return error.reason === "encoding" ? "source-unavailable" : error.reason;
  if (error instanceof Error && "code" in error && ["ENOENT", "EACCES", "EPERM", "EISDIR", "ENOTDIR"].includes(String(error.code)))
    return "source-unavailable";
  return;
}
async function prepare(target, access, structure) {
  if (target.unverified)
    throw new SourceDocumentError("source-unavailable", "Snapshot source revision is unverified; refresh the search");
  const document2 = await access.load(target.path, target.reference);
  if (target.expectedRevision && (document2.reference.origin.kind !== "worktree" || !sameSourceRevision(target.expectedRevision, document2.reference.origin.revision)))
    throw new SourceDocumentError("source-changed", "Source changed; refresh the search");
  if (target.line > document2.lineStarts.length)
    throw new SourceDocumentError("source-unavailable", `Source line ${target.line} is beyond the end of the file`);
  const lineRange = document2.lineRange(target.line);
  const focus = target.range?.start ?? target.absoluteFocus ?? Math.min(lineRange.end, lineRange.start + (target.focus ?? 0));
  let range = target.range;
  let details = { status: "no-symbol" };
  const language = syntaxLanguage(document2.path);
  if (document2.utf8 && language && language !== "go") {
    const syntax = await access.syntax(document2);
    details = {
      status: syntax.status === "ok" ? "no-symbol" : syntax.status === "unsupported" ? "provider-unavailable" : "parse-error",
      provider: "tree-sitter",
      language
    };
    if (syntax.status === "ok") {
      const character = document2.toCharacterOffset(focus);
      const symbols = syntax.symbols.filter((symbol) => symbol.hasBody && symbol.start <= character && character < symbol.end).toSorted((a, b) => a.end - a.start - (b.end - b.start));
      const symbol = symbols[0] ?? syntax.symbols.find((item) => item.hasBody && document2.lineAt(document2.toByteOffset(item.start)) === target.line);
      if (symbol && !target.range) {
        range = {
          start: document2.toByteOffset(symbol.start),
          end: document2.toByteOffset(symbol.end)
        };
        const lines = {
          startLine: document2.lineAt(range.start),
          endLine: document2.lineAt(Math.max(range.start, range.end - 1))
        };
        details = {
          status: "available",
          provider: "tree-sitter",
          language,
          range: lines,
          symbol: {
            name: symbol.name,
            kind: symbol.kind,
            scope: symbol.scope ? [symbol.scope] : [],
            range: lines
          }
        };
      }
    }
  } else if (document2.utf8 && structure && document2.reference.origin.kind === "worktree" && !target.range && !usesDocumentLineWindow(document2.path)) {
    const result = await structure.inspect({
      absolutePath: resolve20(access.cwd, target.path),
      cwd: access.cwd,
      line: target.line,
      expectedRevision: document2.reference.origin.revision
    }, access.signal);
    details = result.details;
    if (["source-changed", "source-unavailable", "file-too-large"].includes(details.status))
      throw new SourceDocumentError(details.status === "source-changed" ? "source-changed" : "source-unavailable", `Source inspection: ${details.status}`);
    if (details.range)
      range = document2.lineRange(details.range.startLine, Math.min(details.range.endLine, document2.lineStarts.length));
  } else if (usesDocumentLineWindow(document2.path)) {
    details = { status: "no-symbol" };
  } else {
    details = { status: "provider-unavailable", ...language ? { language } : {} };
  }
  range ??= document2.lineRange(Math.max(1, target.line - 10), Math.min(document2.lineStarts.length, target.line + 10));
  const boundary = target.range ? "requested-range" : details.status === "available" && details.range ? "syntax" : "line-window";
  document2.checkRange(range);
  return { target, document: document2, range, structure: details, boundary, focus };
}
function boundaryNote(block) {
  if (block.boundary === "line-window" || block.boundary === "mixed") {
    const fallback = block.prepared.find((prepared) => prepared.boundary === "line-window");
    const status = fallback?.structure.status;
    const provider = fallback?.structure.provider;
    const diagnostic = status === "no-symbol" && provider === undefined ? "" : status ? " (" + status + (provider ? " via " + provider : "") + ")" : "";
    return "; syntax boundary unavailable" + diagnostic + "; bounded line window";
  }
  return block.boundary === "requested-range" ? "; requested range; syntax boundary not inferred" : "";
}
function blockDetails(block) {
  const starts = block.fragments.map((fragment) => fragment.start);
  const ends = block.fragments.map((fragment) => fragment.end);
  const start2 = starts.length > 0 ? Math.min(...starts) : block.ranges[0]?.start ?? 0;
  const end = ends.length > 0 ? Math.max(...ends) : start2;
  const nextRequest = block.continuation ? { mode: "inspect", sourceCursor: block.continuation } : undefined;
  return {
    range: {
      startLine: block.document.lineAt(start2),
      endLine: block.document.lineAt(Math.max(start2, end - 1))
    },
    omittedBefore: block.remaining.filter((range) => range.end <= start2).reduce((n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start), 0),
    omittedAfter: block.remaining.filter((range) => range.start >= end).reduce((n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start), 0),
    truncatedLines: [],
    reference: block.document.reference,
    targetRanges: block.ranges,
    fragments: block.fragments,
    remainingRanges: block.remaining,
    complete: block.document.utf8 && block.remaining.length === 0,
    ...block.boundary ? { boundary: block.boundary } : {},
    ...nextRequest ? { nextRequest } : {}
  };
}
function render(items, blocks, single) {
  const rows = items.map((item) => `Target #${item.inputIndex} ${item.path ?? ""}:${item.line ?? ""}: ${item.status}${item.block ? `; Block #${item.block}` : ""}${item.structure && !(item.structure.status === "no-symbol" && item.structure.provider === undefined) ? ` [structure: ${item.structure.status}${item.structure.provider ? ` via ${item.structure.provider}` : ""}${item.structure.reason ? `; ${item.structure.reason}` : ""}]` : ""}${item.structure?.symbol ? ` ${item.structure.symbol.name} (${item.structure.symbol.kind}) lines ${item.structure.symbol.range.startLine}-${item.structure.symbol.range.endLine}` : ""}${item.error ? `; ${item.error}` : ""}${item.retry ? `
Retry: ${JSON.stringify(item.retry)}` : ""}`);
  const sourceRows = blocks.map((block, index) => {
    const origin = block.document.reference.origin.kind === "git" ? "commit " + block.document.reference.origin.commit + "; blob " + block.document.reference.origin.blob : "source sha256 " + block.document.reference.origin.contentHash;
    const completeness = block.remaining.length ? "PARTIAL; missing byte ranges " + JSON.stringify(block.remaining) : "complete for selected range";
    const next = block.continuation ? `
Next request: ` + JSON.stringify({ mode: "inspect", sourceCursor: block.continuation }) : "";
    return "[Block #" + String(index + 1) + "] " + block.document.path + "; " + origin + `
` + block.text.join(`
`) + `
[source ` + completeness + boundaryNote(block) + "; shared 16384-byte output limit]" + next;
  });
  return [
    single ? "Source inspection" : `Batch inspection: ${items.filter((item) => item.status === "returned").length} of ${items.length} targets returned; overlapping ranges merged before the shared 16384-byte budget.`,
    ...rows,
    ...sourceRows
  ].join(`

`);
}
function blockBoundary(block) {
  const boundaries = [...new Set(block.prepared.map((prepared) => prepared.boundary))];
  if (boundaries.length === 1)
    return boundaries[0];
  return boundaries.length > 1 ? "mixed" : undefined;
}
function fallbackContinuationRange(document2, ranges) {
  const last = ranges.at(-1);
  if (!last || last.end >= document2.bytes.length)
    return;
  const nextStartLine = document2.lineAt(last.end);
  const nextFocusLine = Math.min(document2.lineStarts.length, nextStartLine + 10);
  if (nextFocusLine <= nextStartLine)
    return;
  return document2.lineRange(nextStartLine, Math.min(document2.lineStarts.length, nextFocusLine + 10));
}
async function inspectDocuments(targets, access, continuations, structure) {
  const items = [];
  const blocks = [];
  for (const [index, target] of targets.entries()) {
    try {
      const prepared = await prepare(target, access, structure);
      let blockIndex = blocks.findIndex((block) => block.document === prepared.document);
      if (blockIndex < 0) {
        blockIndex = blocks.length;
        blocks.push({
          document: prepared.document,
          ranges: [],
          targets: [],
          prepared: [],
          fragments: [],
          remaining: [],
          text: [],
          boundary: undefined
        });
      }
      const block = blocks[blockIndex];
      if (!block)
        throw new Error("Inspection block is unavailable");
      block.ranges.push(prepared.range);
      block.targets.push(index);
      block.prepared.push(prepared);
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "returned",
        ...target.matchIndex !== undefined ? { matchIndex: target.matchIndex } : {},
        block: blockIndex + 1,
        structure: prepared.structure
      });
    } catch (error) {
      if (access.signal?.aborted || error instanceof Error && error.name === "AbortError")
        throw abortError();
      const status = errorStatus(error);
      if (!status)
        throw error;
      items.push({
        inputIndex: index + 1,
        path: target.path,
        line: target.line,
        status: "error",
        structure: { status },
        error: error instanceof Error ? error.message : status
      });
    }
  }
  for (const block of blocks) {
    block.ranges = mergeByteRanges(block.ranges);
    block.remaining = block.ranges;
    block.boundary = blockBoundary(block);
  }
  const baseBytes = Buffer.byteLength(render(items, blocks, targets.length === 1));
  let remainingResponseBytes = MAX_RESULT_BYTES - baseBytes - blocks.length * 400;
  if (blocks.length && remainingResponseBytes < blocks.length * 256)
    throw new SignalGrepError("Inspection selectors exceed the shared response limit; use fewer targets");
  for (const [index, block] of blocks.entries()) {
    const followingBlocks = blocks.length - index - 1;
    let allowance = remainingResponseBytes - followingBlocks * 256;
    if (!block.document.utf8) {
      const target = block.prepared[0];
      if (!target)
        throw new Error("Missing lossy-source target");
      const lineStart = block.document.lineStarts[target.target.line - 1] ?? 0;
      const relativeFocus = target.focus - lineStart;
      const preview = sourceRangeFromBytes(block.document.bytes, Math.max(1, target.target.line - 10), Math.min(block.document.lineStarts.length, target.target.line + 10), target.target.line, {
        maxBytes: Math.min(MAX_RESULT_BYTES - 1024, Math.max(256, allowance - 300)),
        focus: {
          byteStart: relativeFocus,
          byteEnd: relativeFocus,
          range: {
            start: { line: target.target.line - 1, character: relativeFocus },
            end: { line: target.target.line - 1, character: relativeFocus },
            encoding: "utf-8"
          }
        }
      });
      block.text.push(`[lossy UTF-8 preview only; original bytes are not fully representable; source continuation unavailable; lines may be clipped at 500 characters]
${preview.text}`);
      remainingResponseBytes -= Buffer.byteLength(block.text.at(-1) ?? "") + 1;
      for (const targetIndex of block.targets) {
        const item = items[targetIndex];
        if (item)
          item.source = {
            range: { startLine: preview.startLine, endLine: preview.endLine },
            omittedBefore: preview.omittedBefore,
            omittedAfter: preview.omittedAfter,
            truncatedLines: preview.truncatedLines,
            complete: false,
            ...block.boundary ? { boundary: block.boundary } : {},
            reference: block.document.reference
          };
      }
      continue;
    }
    const focuses = [...new Set(block.prepared.map((prepared) => prepared.focus))];
    for (const [focusIndex, focus] of focuses.entries()) {
      if (!block.remaining.some((range) => range.start <= focus && focus < range.end) || allowance < 256)
        continue;
      const missingBytes = block.remaining.reduce((total, range) => total + range.end - range.start, 0);
      const budget = missingBytes + block.remaining.length * 200 < allowance ? allowance : Math.max(256, Math.floor(allowance / (focuses.length - focusIndex)));
      const page = sourcePage(block.document, block.remaining, budget, focus);
      block.fragments.push(page.fragment);
      block.remaining = page.remaining;
      block.text.push(page.text);
      const pageBytes = Buffer.byteLength(page.text) + 1;
      allowance -= pageBytes;
      remainingResponseBytes -= pageBytes;
    }
    while (block.remaining.length && allowance >= 256) {
      const page = sourcePage(block.document, block.remaining, allowance);
      block.fragments.push(page.fragment);
      block.remaining = page.remaining;
      block.text.push(page.text);
      const pageBytes = Buffer.byteLength(page.text) + 1;
      allowance -= pageBytes;
      remainingResponseBytes -= pageBytes;
    }
    const fallback = block.boundary === "line-window" || block.boundary === "mixed" ? fallbackContinuationRange(block.document, block.ranges) : undefined;
    const continuationTarget = fallback ? [...block.ranges, fallback] : block.ranges;
    const continuationGaps = fallback ? [...block.remaining, fallback] : block.remaining;
    if (continuationGaps.length)
      block.continuation = continuations.create(block.document.reference, continuationTarget, continuationGaps, block.boundary);
    if (block.document.reference.origin.kind === "worktree") {
      const current = await getSourceRevision(resolve20(access.cwd, block.document.path));
      if (!current || !sameSourceRevision(current, block.document.reference.origin.revision)) {
        block.text = [];
        block.fragments = [];
        block.remaining = block.ranges;
        delete block.continuation;
        for (const targetIndex of block.targets) {
          const item = items[targetIndex];
          if (item) {
            item.status = "error";
            item.structure = { status: "source-changed" };
            item.error = "Source changed during inspection; refresh the source";
          }
        }
      }
    }
    for (const targetIndex of block.targets) {
      const item = items[targetIndex];
      if (item?.status === "returned")
        item.source = blockDetails(block);
    }
    if (access.signal?.aborted)
      throw abortError();
    if (index >= 5)
      throw new Error("Inspection target limit was not validated");
  }
  const text = render(items, blocks, targets.length === 1);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SignalGrepError("Inspection metadata exceeds the response byte limit");
  const complete = items.every((item) => item.status === "returned") && blocks.every((block) => block.remaining.length === 0);
  const first = items[0];
  return {
    text,
    details: {
      version: 1,
      mode: "inspect",
      status: complete ? "complete" : "partial",
      snapshotComplete: complete,
      totalMatches: 0,
      storedMatches: 0,
      returnedMatches: 0,
      totalFiles: blocks.length,
      inspections: items,
      sourceBlocks: blocks.map((block) => ({
        path: block.document.path,
        source: blockDetails(block)
      })),
      ...targets.length === 1 && first?.structure ? { structure: first.structure } : {},
      ...targets.length === 1 && first?.source ? {
        source: first.source,
        ...first.source.nextRequest ? { nextRequest: first.source.nextRequest } : {}
      } : {}
    }
  };
}
async function continueSource(cursor, access, continuations) {
  const state = continuations.resolve(cursor);
  const document2 = await access.load(state.source.path, state.source);
  const page = sourcePage(document2, state.remaining, MAX_RESULT_BYTES - 1400);
  const next = continuations.advance(cursor, page.fragment);
  const block = {
    document: document2,
    ranges: state.target,
    targets: [],
    prepared: [],
    fragments: [page.fragment],
    remaining: page.remaining,
    text: [page.text],
    boundary: state.boundary,
    ...next ? { continuation: next } : {}
  };
  const source = blockDetails(block);
  const text = render([], [block], true);
  if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
    throw new SignalGrepError("Source continuation metadata exceeds the output limit");
  return {
    text,
    details: {
      version: 1,
      mode: "inspect",
      status: next ? "partial" : "complete",
      snapshotComplete: !next,
      totalMatches: 0,
      storedMatches: 0,
      returnedMatches: 0,
      totalFiles: 1,
      source,
      sourceBlocks: [{ path: document2.path, source }],
      ...source.nextRequest ? { nextRequest: source.nextRequest } : {}
    }
  };
}

// src/syntax-search.ts
function unavailable(document2, analysis) {
  if (!document2.utf8) {
    return {
      items: [],
      partial: true,
      reasons: [`${document2.path}: syntax classification requires lossless UTF-8 source`]
    };
  }
  if (analysis.status !== "ok") {
    return {
      items: [],
      partial: true,
      reasons: [`${document2.path}: syntax ${analysis.status}; this source remains unclassified`]
    };
  }
  return;
}
function byteBoundary(document2, offset) {
  const byte = document2.bytes[offset];
  return offset === document2.bytes.length || byte !== undefined && (byte & 192) !== 128;
}
function buildRoleIndex(analysis, selected) {
  const groups = new Map;
  for (const role of analysis.roles) {
    if (!selected.has(role.role))
      continue;
    const key = JSON.stringify([role.role, role.certainty, role.subkind]);
    const group = groups.get(key);
    if (group)
      group.push(role);
    else
      groups.set(key, [role]);
  }
  return [...groups.values()].map((roles) => {
    roles.sort((a, b) => a.start - b.start || b.end - a.end);
    const widest = [];
    let best = 0;
    for (let index = 0;index < roles.length; index++) {
      if ((roles[index]?.end ?? 0) > (roles[best]?.end ?? 0))
        best = index;
      widest.push(best);
    }
    return { roles, widest };
  });
}
function roleProofs(indices, start2, end) {
  const proofs = [];
  for (const index of indices) {
    let low = 0, high = index.roles.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if ((index.roles[middle]?.start ?? Infinity) <= start2)
        low = middle + 1;
      else
        high = middle;
    }
    const widest = index.widest[low - 1];
    const role = widest === undefined ? undefined : index.roles[widest];
    if (role && end <= role.end && start2 < role.end)
      proofs.push(role);
  }
  return proofs;
}
function filterRoleOccurrences(document2, analysis, occurrences, roles) {
  const missing = unavailable(document2, analysis);
  if (missing)
    return missing;
  const indices = buildRoleIndex(analysis, new Set(roles));
  const items = [];
  const reasons = [];
  const seen = new Set;
  let splitOccurrences = 0;
  for (const range of occurrences) {
    document2.checkRange(range);
    const key = `${range.start}:${range.end}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    if (!byteBoundary(document2, range.start) || !byteBoundary(document2, range.end)) {
      splitOccurrences++;
      continue;
    }
    const proofs = roleProofs(indices, document2.toCharacterOffset(range.start), document2.toCharacterOffset(range.end));
    if (proofs.length === 0)
      continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      reasons.push(`${document2.path}: role result retention limit reached; additional occurrences are not retained`);
      break;
    }
    const match = sourceEvidence(document2, range);
    items.push({
      path: document2.path,
      line: match.line,
      range: match.range,
      source: document2.reference,
      label: [...new Set(proofs.map((proof) => proof.role))].join(", "),
      excerpt: match.excerpt,
      details: {
        roles: proofs.map((proof) => ({
          role: proof.role,
          certainty: proof.certainty,
          subkind: proof.subkind,
          range: { ...range }
        })),
        excerptRange: match.excerptRange,
        excerptTruncated: match.excerptTruncated
      }
    });
  }
  if (splitOccurrences > 0) {
    reasons.push(`${document2.path}: ${splitOccurrences} occurrence(s) split UTF-8 characters and could not be classified`);
  }
  return { items, partial: reasons.length > 0, reasons };
}
function merge(ranges) {
  const result = [];
  for (const range of ranges.toSorted((a, b) => a.start - b.start || b.end - a.end)) {
    if (range.start === range.end)
      continue;
    const previous = result.at(-1);
    if (previous && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else
      result.push({ ...range });
  }
  return result;
}
function intersect(range, sorted) {
  let low = 0, high = sorted.length;
  while (low < high) {
    const middle = low + high >>> 1;
    if ((sorted[middle]?.end ?? Infinity) <= range.start)
      low = middle + 1;
    else
      high = middle;
  }
  const result = [];
  for (let index = low;index < sorted.length; index++) {
    const other = sorted[index];
    if (!other || other.start >= range.end)
      break;
    const start2 = Math.max(range.start, other.start);
    const end = Math.min(range.end, other.end);
    if (start2 < end)
      result.push({ start: start2, end });
  }
  return result;
}
function subtract2(range, exclusions) {
  const result = [];
  let start2 = range.start;
  for (const excluded of exclusions) {
    if (excluded.end <= start2 || excluded.start >= range.end)
      continue;
    if (excluded.start > start2)
      result.push({ start: start2, end: excluded.start });
    start2 = Math.max(start2, excluded.end);
  }
  if (start2 < range.end)
    result.push({ start: start2, end: range.end });
  return result;
}
function implementationRanges(document2, analysis) {
  const symbols = analysis.symbols.filter((symbol) => symbol.hasBody).toSorted((a, b) => a.start - b.start || b.end - a.end);
  const stack = [];
  const nested = new Map;
  for (const symbol of symbols) {
    let parent = stack.at(-1);
    while (parent && (symbol.start >= parent.end || symbol.end > parent.end)) {
      stack.pop();
      parent = stack.at(-1);
    }
    if (parent) {
      const ranges = nested.get(parent.node) ?? [];
      ranges.push({
        start: document2.toByteOffset(symbol.start),
        end: document2.toByteOffset(symbol.end)
      });
      nested.set(parent.node, ranges);
    }
    stack.push(symbol);
  }
  const code = merge(analysis.roles.filter((role) => role.role === "code").map((role) => ({
    start: document2.toByteOffset(role.start),
    end: document2.toByteOffset(role.end)
  })));
  return { symbols, code, nested };
}
function owned(document2, context, symbol, changed) {
  if (!symbol.hasBody || symbol.bodyStart === undefined || symbol.bodyEnd === undefined)
    return [];
  const body2 = {
    start: document2.toByteOffset(symbol.bodyStart),
    end: document2.toByteOffset(symbol.bodyEnd)
  };
  const withoutNested = subtract2(body2, context.nested.get(symbol.node) ?? []);
  const code = withoutNested.flatMap((range) => intersect(range, context.code));
  return changed ? code.flatMap((range) => intersect(range, changed)) : code;
}
function termEvidence(document2, ranges, term) {
  const needle = Buffer.from(term);
  if (needle.length === 0)
    throw new Error("Function conjunction expects normalized non-empty terms");
  let count = 0;
  let first;
  for (const range of ranges) {
    const bytes = document2.bytes.subarray(range.start, range.end);
    let offset = bytes.indexOf(needle);
    while (offset >= 0) {
      const start2 = range.start + offset;
      count++;
      first ??= { start: start2, end: start2 + needle.length };
      offset = bytes.indexOf(needle, offset + needle.length);
    }
  }
  return first ? {
    term,
    count,
    evidence: sourceEvidence(document2, first),
    omittedOccurrenceEvidence: count - 1
  } : undefined;
}
function findFunctionConjunctions(document2, analysis, terms, changedRanges) {
  const missing = unavailable(document2, analysis);
  if (missing)
    return missing;
  if (analysis.language !== "javascript" && analysis.language !== "typescript" && analysis.language !== "tsx") {
    return {
      items: [],
      partial: true,
      reasons: [`${document2.path}: same-function AND supports JS/TS/TSX only`]
    };
  }
  if (terms.length === 0)
    throw new SignalGrepError("Function conjunction requires normalized terms");
  for (const range of changedRanges ?? [])
    document2.checkRange(range);
  const changed = changedRanges ? merge(changedRanges) : undefined;
  const context = implementationRanges(document2, analysis);
  const items = [];
  for (const symbol of context.symbols) {
    const ranges = owned(document2, context, symbol, changed);
    const matches = terms.map((term) => termEvidence(document2, ranges, term));
    if (matches.some((match) => match === undefined))
      continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      return {
        items,
        partial: true,
        reasons: [`${document2.path}: function result retention limit reached`]
      };
    }
    const range = {
      start: document2.toByteOffset(symbol.start),
      end: document2.toByteOffset(symbol.end)
    };
    items.push({
      path: document2.path,
      line: document2.lineAt(range.start),
      source: document2.reference,
      range,
      label: symbol.scope ? `${symbol.scope}.${symbol.name}` : symbol.name,
      excerpt: matches.map((match) => match?.evidence.excerpt ?? "").join(`
`),
      details: {
        symbol: {
          name: symbol.name,
          kind: symbol.kind,
          scope: symbol.scope,
          range,
          body: symbol.bodyStart !== undefined && symbol.bodyEnd !== undefined ? {
            start: document2.toByteOffset(symbol.bodyStart),
            end: document2.toByteOffset(symbol.bodyEnd)
          } : undefined
        },
        terms: matches,
        relation: "same lexical implementation; not proof of a shared execution path or data flow",
        scope: changed ? "implementation-code-intersect-changed-ranges" : "implementation-own-code"
      }
    });
  }
  return { items, partial: false, reasons: [] };
}

// src/python-outline.ts
function indentation(line) {
  let width = 0;
  for (const character of line) {
    if (character === " ")
      width += 1;
    else if (character === "\t")
      width += 4;
    else
      break;
  }
  return width;
}
function stripStringsAndComments(line, state) {
  const code = line.split("");
  const blank = (start2, end) => {
    for (let index = start2;index < end; index += 1)
      code[index] = " ";
  };
  let index = 0;
  while (index < line.length) {
    if (state.tripleQuote) {
      const delimiter = state.tripleQuote.repeat(3);
      const close = line.indexOf(delimiter, index);
      if (close < 0) {
        blank(index, line.length);
        return code.join("");
      }
      blank(index, close + 3);
      index = close + 3;
      delete state.tripleQuote;
      continue;
    }
    const character = line[index];
    if (character === "#") {
      blank(index, line.length);
      break;
    }
    if (character !== "'" && character !== '"') {
      index += 1;
      continue;
    }
    const delimiter = line.slice(index, index + 3);
    if (delimiter === "'''" || delimiter === '"""') {
      state.tripleQuote = character;
      blank(index, Math.min(line.length, index + 3));
      index += 3;
      continue;
    }
    blank(index, index + 1);
    index += 1;
    while (index < line.length) {
      if (line[index] === "\\") {
        blank(index, Math.min(line.length, index + 2));
        index += 2;
        continue;
      }
      if (line[index] === character) {
        blank(index, index + 1);
        index += 1;
        break;
      }
      blank(index, index + 1);
      index += 1;
    }
  }
  return code.join("");
}
function scanLines(document2) {
  const state = {};
  let depth = 0;
  return document2.text.split(`
`).map((text) => {
    const code = stripStringsAndComments(text, state);
    const depthBefore = depth;
    depth = scanTopLevelColon(code, depth).depth;
    return {
      text,
      code,
      indent: indentation(text),
      meaningful: code.trim().length > 0,
      depthBefore,
      depthAfter: depth
    };
  });
}
function declarations(lines) {
  return lines.flatMap((line, lineIndex) => {
    const match = /^([ \t]*)(?:(?:async)[ \t]+)?(def|class)[ \t]+([\p{ID_Start}_][\p{ID_Continue}]*)[ \t]*(?=[:(])/u.exec(line.code);
    if (!match)
      return [];
    return [
      {
        name: match[3] ?? "",
        kind: match[2] === "class" ? "class" : "function",
        indent: line.indent,
        lineIndex
      }
    ];
  });
}
function endLines(lines) {
  const nextBoundaries = Array.from({ length: lines.length }, () => lines.length);
  const candidates = [];
  for (let lineIndex = lines.length - 1;lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex];
    if (!line?.meaningful || line.depthBefore !== 0)
      continue;
    while (candidates.at(-1) && (candidates.at(-1)?.indent ?? 0) > line.indent) {
      candidates.pop();
    }
    nextBoundaries[lineIndex] = candidates.at(-1)?.lineIndex ?? lines.length;
    candidates.push({ lineIndex, indent: line.indent });
  }
  return nextBoundaries;
}
function scanTopLevelColon(code, initialDepth) {
  let depth = initialDepth;
  let colon = -1;
  for (let index = 0;index < code.length; index += 1) {
    const character = code[index];
    if (character === "(" || character === "[" || character === "{")
      depth += 1;
    else if (character === ")" || character === "]" || character === "}")
      depth = Math.max(0, depth - 1);
    else if (character === ":" && depth === 0 && colon < 0)
      colon = index;
  }
  return { depth, colon };
}
function hasBody(lines, declaration, endLine) {
  let headerEnded = false;
  let depth = 0;
  for (let lineIndex = declaration.lineIndex;lineIndex < endLine; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line)
      continue;
    const scanned = scanTopLevelColon(line.code, depth);
    depth = scanned.depth;
    if (scanned.colon < 0)
      continue;
    headerEnded = true;
    if (line.code.slice(scanned.colon + 1).trim().length > 0)
      return true;
    break;
  }
  if (!headerEnded)
    return false;
  for (let lineIndex = declaration.lineIndex + 1;lineIndex < endLine; lineIndex += 1) {
    const line = lines[lineIndex];
    if (line?.meaningful && line.indent > declaration.indent)
      return true;
  }
  return false;
}
function parsePythonOutline(document2) {
  if (!document2.utf8)
    return [];
  const lines = scanLines(document2);
  const found = declarations(lines);
  const boundaries = endLines(lines);
  const active = [];
  return found.map((declaration) => {
    while (active.at(-1) && (active.at(-1)?.lineIndex ?? 0) >= declaration.lineIndex) {
      active.pop();
    }
    while (active.at(-1) && (active.at(-1)?.indent ?? 0) >= declaration.indent) {
      active.pop();
    }
    const parents = [...active];
    const boundary = boundaries[declaration.lineIndex] ?? lines.length;
    const endLine = boundary === lines.length ? lines.length : boundary;
    const nearestParent = parents.at(-1);
    const kind = declaration.kind === "function" && nearestParent?.kind === "class" ? "method" : declaration.kind;
    const scope = parents.map((item) => item.name);
    const range = document2.lineRange(declaration.lineIndex + 1, endLine);
    const lineStart = document2.toCharacterOffset(range.start);
    const signature = document2.text.slice(lineStart, Math.min(document2.toCharacterOffset(range.end), lineStart + 600)).split(`
`, 1)[0]?.trimEnd() ?? "";
    const item = {
      name: declaration.name,
      kind,
      startLine: declaration.lineIndex + 1,
      endLine,
      scope,
      hasBody: hasBody(lines, declaration, boundary),
      range,
      signature
    };
    active.push(declaration);
    return item;
  });
}

// src/hybrid-search.ts
function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}
function hybridConceptLimit(value) {
  const candidate = value ?? DEFAULT_HYBRID_CONCEPT_LIMIT;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_HYBRID_CONCEPT_LIMIT) {
    throw new SignalGrepError(`conceptLimit must be an integer from 1 through ${String(MAX_HYBRID_CONCEPT_LIMIT)}`);
  }
  return candidate;
}
function absoluteOccurrenceRanges(document2, line, match) {
  const lineRange = document2.lineRange(line);
  return match.occurrences.map((occurrence) => ({
    start: lineRange.start + occurrence.byteStart,
    end: lineRange.start + occurrence.byteEnd
  }));
}
async function literalEvidence(scan, access) {
  const documents = new Map;
  const unavailable = new Map;
  for (const match of scan.matches) {
    if (documents.has(match.absolutePath) || unavailable.has(match.absolutePath))
      continue;
    try {
      const document2 = await access.load(match.absolutePath);
      const expected = scan.sourceRevisions.get(match.absolutePath);
      if (!expected || document2.reference.origin.kind !== "worktree" || !sameSourceRevision(expected, document2.reference.origin.revision)) {
        unavailable.set(match.absolutePath, "source revision was not stable across hybrid search");
        continue;
      }
      documents.set(match.absolutePath, document2);
    } catch (error) {
      if (error instanceof SourceBudgetError || error instanceof SourceDocumentError) {
        unavailable.set(match.absolutePath, error.message);
        continue;
      }
      throw error;
    }
  }
  const rangesByPath = new Map;
  const items = scan.matches.map((match) => {
    const document2 = documents.get(match.absolutePath);
    const path = document2?.path ?? match.displayPath;
    const ranges = document2 ? absoluteOccurrenceRanges(document2, match.lineNumber, match) : [];
    if (ranges.length) {
      const existing = rangesByPath.get(path) ?? [];
      existing.push(...ranges);
      rangesByPath.set(path, existing);
    }
    const primary = ranges[0];
    return {
      path,
      line: match.lineNumber,
      label: `Literal exact match (${String(match.occurrences.length)} occurrence${match.occurrences.length === 1 ? "" : "s"})${document2 && primary ? "" : "; source inspection unavailable"}`,
      excerpt: match.lineContent,
      ...document2 && primary ? { source: document2.reference, range: primary } : {},
      details: {
        kind: "literal-match",
        source: "literal",
        certainty: "exact",
        sourceVerified: Boolean(document2 && primary),
        occurrenceCount: match.occurrences.length,
        ranges,
        lineContentTruncated: match.lineTruncated
      }
    };
  });
  const reasons = [...new Set(unavailable.values())].map((reason) => `Literal source inspection is unavailable for retained evidence: ${reason}`);
  return {
    items,
    rangesByPath,
    sourceCoverage: unavailable.size ? "partial" : "complete",
    reasons
  };
}
function isLiteralOverlap(item, rangesByPath) {
  const itemRange = item.range;
  if (!itemRange)
    return false;
  return (rangesByPath.get(item.path) ?? []).some((range) => rangesOverlap(range, itemRange));
}
async function combineHybridSearch(scan, concept, access, conceptLimit) {
  if (concept.kind !== "concept")
    throw new Error("Hybrid search requires concept evidence");
  const literal = await literalEvidence(scan, access);
  const eligibleConcept = concept.items.filter((item) => !isLiteralOverlap(item, literal.rangesByPath));
  const duplicateConceptCandidates = concept.items.length - eligibleConcept.length;
  const selectedConcept = [];
  for (const item of eligibleConcept.slice(0, conceptLimit)) {
    selectedConcept.push({
      ...item,
      details: { ...item.details, source: "concept" }
    });
  }
  const conceptCandidatesOmitted = Math.max(0, eligibleConcept.length - selectedConcept.length);
  const literalOccurrencesRetained = scan.matches.reduce((total, match) => total + match.occurrences.length, 0);
  const literalCoverage = scan.snapshotComplete ? "complete" : "partial";
  const conceptCoverage = concept.coverage?.conceptCandidates ?? (concept.partial ? "partial" : "complete");
  const deduplicationCoverage = scan.snapshotComplete && literal.sourceCoverage === "complete" ? "complete" : "partial";
  const partial = !scan.snapshotComplete || concept.partial || conceptCoverage === "skipped" || literal.sourceCoverage === "partial" || deduplicationCoverage === "partial";
  const selectionReason = conceptCandidatesOmitted ? `Hybrid concept limit retained the top ${String(selectedConcept.length)} of ${String(eligibleConcept.length)} non-overlapping semantic candidates` : undefined;
  return {
    kind: "hybrid",
    unit: "evidence-items",
    items: [...literal.items, ...selectedConcept],
    partial,
    reasons: [
      ...scan.retention?.reasons ?? [],
      ...concept.reasons,
      ...literal.reasons,
      ...selectionReason ? [selectionReason] : []
    ],
    filesRead: (concept.filesRead ?? 0) + access.filesRead,
    bytesRead: (concept.bytesRead ?? 0) + access.bytesRead,
    counts: {
      ...concept.counts,
      literalMatchingLinesFound: scan.totalMatches,
      literalMatchingLinesPrepared: literal.items.length,
      literalOccurrencesRetained,
      conceptCandidatesRanked: concept.items.length,
      conceptCandidatesDeduplicated: duplicateConceptCandidates,
      conceptCandidatesEligible: eligibleConcept.length,
      conceptCandidatesSelected: selectedConcept.length,
      conceptCandidatesOmitted,
      literalItemsRetained: literal.items.length,
      conceptItemsRetained: selectedConcept.length
    },
    ...concept.scope ? { scope: concept.scope } : {},
    coverage: {
      literalMatches: literalCoverage,
      conceptCandidates: conceptCoverage,
      crossSourceDeduplication: deduplicationCoverage,
      sourceInspection: literal.sourceCoverage,
      retention: "complete"
    },
    ...concept.stats ? { stats: concept.stats } : {},
    ...concept.redact !== undefined ? { redact: concept.redact } : {}
  };
}
function retainedHybridCounts(original, items) {
  let literalItemsRetained = 0;
  let conceptItemsRetained = 0;
  for (const item of items) {
    if (item.details?.source === "literal")
      literalItemsRetained += 1;
    if (item.details?.source === "concept")
      conceptItemsRetained += 1;
  }
  return { ...original, literalItemsRetained, conceptItemsRetained };
}

// src/evidence-service.ts
function isEvidenceRequest(input) {
  return isSemanticMode(input.mode) || input.mode === "concept" || input.mode === "hybrid" || input.mode === "structure" || input.mode === "files" || input.mode === "inspect" || input.mode === "outline" || input.mode === "imports" || input.mode === "tests" || input.mode === "impact" || input.sourceCursor !== undefined || input.anyOf !== undefined || input.allOf !== undefined || input.within !== undefined || input.roles !== undefined || input.changes !== undefined || input.symbol !== undefined || input.conceptLimit !== undefined || (input.cursor?.includes(".analysis") ?? false);
}
function rejectFields(input, fields, operation, cursor = false, repair = "copy the complete returned request unchanged") {
  const present = fields.filter((field) => input[field] !== undefined);
  const message = `${operation} does not accept ${present.join(", ")}. Remove only those fields, then retry once: ${repair}. Keep the requested mode and remaining filters unchanged; do not include this error text in the retry.`;
  if (present.length)
    throw cursor ? new CursorError(message, "E_CURSOR_OPTIONS_CONFLICT") : new SignalGrepError(message);
}
var searchFields = [
  "query",
  "scope",
  "wholeWord",
  "pattern",
  "anyOf",
  "allOf",
  "within",
  "roles",
  "changes",
  "glob",
  "exclude",
  "literal",
  "ignoreCase",
  "hidden",
  "context",
  "limit",
  "modifiedAfter",
  "modifiedBefore",
  "conceptLimit"
];
var navigationFilterFields = new Set(["glob", "exclude", "hidden"]);
var inspectFields = [
  "paths",
  "matchIndices",
  "targets",
  "sourceCursor"
];
function maxFilesToParse(value) {
  const candidate = value ?? MAX_STRUCTURE_FILES;
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > MAX_CONFIGURABLE_STRUCTURE_FILES) {
    throw new SignalGrepError(`maxFilesToParse must be an integer from 1 through ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}`);
  }
  return candidate;
}
function validateTerms(input) {
  const terms = input.allOf;
  if (terms === undefined) {
    if (input.within !== undefined) {
      throw new SignalGrepError("within is only valid with allOf; omit within for ordinary single-pattern searches");
    }
    return;
  }
  if (!Array.isArray(terms) || terms.length < 2 || terms.length > 3 || terms.some((term) => typeof term !== "string" || !term.trim() || /[\r\n\0]/.test(term)) || new Set(terms).size !== terms.length)
    throw new SignalGrepError("allOf requires 2\u20133 distinct, nonempty, single-line literal terms");
  if (input.pattern !== undefined || input.roles !== undefined || input.literal !== undefined || input.ignoreCase !== undefined || input.wholeWord !== undefined)
    throw new SignalGrepError("allOf is an explicit case-sensitive literal conjunction; omit pattern, roles, literal and ignoreCase");
  if (input.within !== undefined && input.within !== "file" && input.within !== "function")
    throw new SignalGrepError("within must be file or function");
  return terms;
}
function fileConjunction(document2, terms, allowed) {
  const evidence = terms.map((term) => ({
    term,
    ranges: literalOccurrences(document2, term, allowed)
  }));
  if (evidence.some((item) => !item.ranges.length))
    return;
  const first = evidence[0]?.ranges[0];
  if (!first)
    throw new Error("Conjunction evidence unavailable");
  return {
    path: document2.path,
    line: document2.lineAt(first.start),
    label: "All terms occur in this file; no cross-file or execution-path claim",
    source: document2.reference,
    range: first,
    details: {
      terms: evidence.map((item) => ({
        term: item.term,
        occurrences: item.ranges.length,
        evidence: item.ranges.slice(0, 3).map((range) => ({
          start: range.start,
          end: range.end,
          line: document2.lineAt(range.start),
          text: document2.slice(document2.lineRange(document2.lineAt(range.start))).slice(0, 500)
        }))
      })),
      scope: allowed ? "changed-lines" : "file",
      unit: "files"
    }
  };
}
function searchScope(request) {
  const path = request.path ?? ".";
  const requestedPath = request.expandedFromPath ?? path;
  return {
    path,
    requestedPath,
    glob: [...request.glob],
    exclude: [...request.exclude],
    hidden: request.hidden,
    expandedToProjectRoot: request.expandedFromPath !== undefined,
    assertion: path === "." ? "project-wide" : "requested-scope",
    ...request.modifiedAfterMs !== undefined ? { modifiedAfterMs: request.modifiedAfterMs } : {},
    ...request.modifiedBeforeMs !== undefined ? { modifiedBeforeMs: request.modifiedBeforeMs } : {}
  };
}
async function navigationRoot(cwd, path, signal) {
  const absolute = resolve21(cwd, path);
  const repository = await findGitRepository(dirname6(absolute), signal);
  if (repository)
    return repository;
  return isPathInsideCwd(absolute, cwd) ? resolve21(cwd) : dirname6(absolute);
}
function navigationFilters(input) {
  const request = normalizeRequest({
    pattern: "",
    ...input.glob !== undefined ? { glob: input.glob } : {},
    ...input.exclude !== undefined ? { exclude: input.exclude } : {},
    ...input.hidden !== undefined ? { hidden: input.hidden } : {}
  });
  return { glob: request.glob, exclude: request.exclude, hidden: request.hidden };
}
function navigationScope(cwd, root, requestedPath, filters) {
  const projectRoot = resolve21(cwd);
  return {
    path: root === projectRoot ? "." : root,
    requestedPath,
    glob: [...filters.glob],
    exclude: [...filters.exclude],
    hidden: filters.hidden,
    expandedToProjectRoot: false,
    assertion: root === projectRoot ? "project-wide" : "requested-scope"
  };
}

class EvidenceService {
  #runner;
  #snapshots;
  #structure;
  #conceptSearch;
  #queue = new SyntaxQueue;
  #analyses = new AnalysisStore;
  #continuations = new SourceContinuations;
  constructor(runner, snapshots, structure, runConceptSearch = conceptSearch) {
    this.#runner = runner;
    this.#snapshots = snapshots;
    this.#structure = structure;
    this.#conceptSearch = runConceptSearch;
  }
  clear() {
    this.#analyses.clear();
    this.#continuations.clear();
    this.#queue.clear();
  }
  async shutdown() {
    this.clear();
    await this.#queue.shutdown();
  }
  async#testEntryPaths(root, files, cwd, filters, signal) {
    const sourceGlobs = ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.mts", "*.cts"];
    const request = normalizeRequest({
      pattern: TEST_DISCOVERY_PATTERN,
      path: root,
      glob: filters.glob.length ? filters.glob : sourceGlobs,
      exclude: filters.exclude,
      hidden: filters.hidden,
      ignoreCase: false
    });
    const scan = await this.#runner(request, cwd, signal);
    const contentCandidates = new Set(scan.fileCounts.keys());
    return files.filter((path) => isLikelyTestPath(path) || contentCandidates.has(workspaceRelativePath(cwd, path)));
  }
  async#candidates(request, input, access) {
    const collect = (candidateRequest) => collectEvidenceCandidates({
      request: candidateRequest,
      ...input.changes ? { changes: input.changes } : {},
      cwd: access.cwd,
      ...access.signal ? { signal: access.signal } : {},
      access,
      runRipgrep: this.#runner,
      maxFiles: access.maxFiles
    });
    const candidates = await collect(request);
    if (input.changes || request.scope === "strict" || request.path === undefined || candidates.files.length > 0 || candidates.partial) {
      return { candidates, request };
    }
    const { path: requestedPath, ...projectRequest } = request;
    const expandedRequest = { ...projectRequest, expandedFromPath: requestedPath };
    return { candidates: await collect(expandedRequest), request: expandedRequest };
  }
  async search(input, cwd, signal) {
    if (signal?.aborted)
      throw abortError();
    if (input.changes && (input.modifiedAfter !== undefined || input.modifiedBefore !== undefined))
      throw new SignalGrepError("modifiedAfter and modifiedBefore apply to worktree searches and cannot be combined with changes");
    const analysisStarted = performance.now();
    const fileLimit = maxFilesToParse(input.maxFilesToParse);
    const access = new SourceAccess(cwd, this.#queue, signal, { maxFiles: fileLimit });
    if (isSemanticMode(input.mode)) {
      rejectFields(input, [...searchFields, ...inspectFields, "cursor", "matchIndex"], `mode=${input.mode}`);
      return this.#analyses.page(this.#analyses.create(await navigateSemantics(input, access)));
    }
    if (input.column !== undefined)
      throw new SignalGrepError("column requires semantic navigation");
    if (input.sourceCursor !== undefined) {
      if (typeof input.sourceCursor !== "string" || !input.sourceCursor.trim())
        throw new CursorError("A nonempty sourceCursor is required");
      if (input.mode !== "inspect")
        throw new SignalGrepError("sourceCursor requires mode=inspect");
      rejectFields(input, [
        ...searchFields,
        "cursor",
        "path",
        "paths",
        "line",
        "matchIndex",
        "matchIndices",
        "targets",
        "symbol",
        "maxFilesToParse"
      ], "Source continuation", true);
      return continueSource(input.sourceCursor, access, this.#continuations);
    }
    if (input.mode === "inspect") {
      rejectFields(input, [...searchFields, "paths", "symbol", "maxFilesToParse"], "mode=inspect");
      const targets = this.#inspectionTargets(input, cwd);
      return inspectDocuments(targets, access, this.#continuations, this.#structure);
    }
    if (input.mode === "concept") {
      rejectFields(input, [
        ...searchFields.filter((field) => !["query", "glob", "exclude", "hidden"].includes(field)),
        ...inspectFields,
        "cursor",
        "line",
        "symbol",
        "matchIndex"
      ], "mode=concept", false, "use only mode, query, path, glob, exclude, hidden and redact");
      return this.#analyses.page(this.#analyses.create(await this.#conceptSearch(input, access)));
    }
    if (input.mode === "hybrid") {
      rejectFields(input, [
        ...searchFields.filter((field) => !["query", "glob", "exclude", "hidden", "conceptLimit"].includes(field)),
        ...inspectFields,
        "cursor",
        "line",
        "symbol",
        "matchIndex",
        "maxFilesToParse"
      ], "mode=hybrid", false, "use only mode, query, path, glob, exclude, hidden, conceptLimit and redact");
      const query = validateConceptQuery(input.query);
      const limit = hybridConceptLimit(input.conceptLimit);
      const literalRequest = normalizeRequest({
        pattern: query,
        ...input.path !== undefined ? { path: input.path } : {},
        ...input.glob !== undefined ? { glob: input.glob } : {},
        ...input.exclude !== undefined ? { exclude: input.exclude } : {},
        ...input.hidden !== undefined ? { hidden: input.hidden } : {},
        literal: true,
        scope: "strict",
        redact: input.redact ?? false
      });
      let literalResult;
      let conceptResult;
      let conceptAccess;
      let conceptFailure;
      await runOwnedParallel((groupSignal) => {
        conceptAccess = new SourceAccess(cwd, this.#queue, groupSignal, { maxFiles: fileLimit });
        return [
          this.#runner(literalRequest, cwd, groupSignal).then((result) => {
            literalResult = result;
            return;
          }),
          this.#conceptSearch(input, conceptAccess).then((result) => {
            conceptResult = result;
            return;
          }).catch((error) => {
            if (signal?.aborted || groupSignal.aborted)
              throw error;
            conceptFailure = error;
            return;
          })
        ];
      }, signal);
      if (!literalResult || !conceptAccess)
        throw new Error("Hybrid search did not settle its owned literal operation");
      if (!conceptResult) {
        const message = conceptFailure instanceof Error ? conceptFailure.message : "concept search failed without a diagnostic";
        conceptResult = {
          kind: "concept",
          unit: "evidence-items",
          items: [],
          partial: true,
          reasons: [`Semantic candidates unavailable: ${message}`],
          coverage: { conceptCandidates: "skipped" }
        };
      }
      const literalAccess = new SourceAccess(cwd, this.#queue, signal, { maxFiles: fileLimit });
      const hybrid = await combineHybridSearch(literalResult, conceptResult, literalAccess, limit);
      const originalCounts = hybrid.counts ?? {};
      const cursor = this.#analyses.create(hybrid, (items) => ({
        counts: retainedHybridCounts(originalCounts, items)
      }));
      return this.#analyses.page(cursor);
    }
    if (input.mode === "structure") {
      rejectFields(input, [
        ...searchFields.filter((field) => !["pattern", "glob", "exclude", "hidden"].includes(field)),
        ...inspectFields,
        "cursor",
        "line",
        "symbol",
        "matchIndex"
      ], "mode=structure");
      return this.#analyses.page(this.#analyses.create(await structuralSearch(input, access)));
    }
    if (input.mode === "files") {
      rejectFields(input, [
        "pattern",
        "cursor",
        "line",
        "matchIndex",
        "symbol",
        "maxFilesToParse",
        "wholeWord",
        "scope",
        "literal",
        "ignoreCase",
        "context",
        "limit",
        "anyOf",
        "allOf",
        "within",
        "roles",
        "changes",
        "conceptLimit",
        ...inspectFields
      ], "mode=files", false, fileDiscoveryQueryHint(input.query ?? input.pattern));
      return this.#analyses.page(this.#analyses.create(await discoverFiles(input, cwd, signal)));
    }
    if (input.mode === "impact")
      return this.#impact(input, access);
    if (input.cursor?.includes(".analysis") && !input.mode?.match(/^(outline|imports|tests)$/)) {
      this.#analyses.resolve(input.cursor);
      rejectFields(input, [
        ...searchFields,
        ...inspectFields,
        "path",
        "line",
        "matchIndex",
        "symbol",
        "maxFilesToParse"
      ], "Analysis continuation", true);
      if (input.mode !== undefined && input.mode !== "matches" && input.mode !== "auto")
        throw new CursorError("Analysis cursor cannot continue in the requested mode", "E_CURSOR_WRONG_KIND");
      return this.#analyses.page(input.cursor);
    }
    if (input.mode === "outline" || input.mode === "imports" || input.mode === "tests")
      return this.#navigate(input, access);
    rejectFields(input, [...inspectFields, "query", "line", "matchIndex", "symbol", "cursor", "conceptLimit"], "Evidence search", false, "a new search accepts one path; split multiple paths into separate requests without widening their scope");
    const anyOf = validateAnyOf(input.anyOf);
    if (anyOf) {
      if (input.pattern !== undefined || input.allOf !== undefined || input.within !== undefined || input.roles !== undefined || input.literal !== undefined || input.ignoreCase !== undefined || input.wholeWord !== undefined)
        throw new SignalGrepError("anyOf is an explicit case-sensitive literal union; omit pattern, allOf, within, roles, literal and ignoreCase");
      if (input.mode !== undefined && input.mode !== "auto" && input.mode !== "matches")
        throw new SignalGrepError("anyOf mode must be omitted, auto, or matches");
      const chunks = Array.from({ length: Math.ceil(anyOf.length / MAX_ANY_OF_TERMS) }, (_, index) => anyOf.slice(index * MAX_ANY_OF_TERMS, (index + 1) * MAX_ANY_OF_TERMS));
      const { path: _inputPath, ...unscopedInput } = input;
      let chunkAccess = access;
      const runChunks = async (expandedFromPath) => runOwnedParallel((groupSignal) => {
        chunkAccess = new SourceAccess(cwd, this.#queue, groupSignal, { maxFiles: fileLimit });
        return chunks.map(async (chunk) => {
          const request = normalizeRequest({
            ...expandedFromPath === undefined ? input : unscopedInput,
            pattern: chunk.map(escapeRegexLiteral).join("|"),
            literal: false,
            ignoreCase: false
          });
          const effectiveRequest = expandedFromPath === undefined ? request : { ...request, expandedFromPath };
          const candidates = await collectEvidenceCandidates({
            request: effectiveRequest,
            ...input.changes ? { changes: input.changes } : {},
            cwd,
            signal: groupSignal,
            access: chunkAccess,
            runRipgrep: this.#runner,
            maxFiles: fileLimit
          });
          return { chunk, request: effectiveRequest, candidates };
        });
      }, signal);
      let chunkResults = await runChunks();
      if (!input.changes && input.path !== undefined && input.scope !== "strict" && chunkResults.every(({ candidates }) => !candidates.partial && candidates.files.length === 0)) {
        chunkResults = await runChunks(input.path.replace(/^@/, ""));
      }
      const reasons = new Set;
      let partial = false;
      let changes;
      const candidateFiles = new Map;
      const invalidatedPaths = new Set;
      for (const { candidates } of chunkResults) {
        partial ||= candidates.partial;
        changes ??= candidates.changes;
        for (const reason of candidates.reasons)
          reasons.add(reason);
        for (const file of candidates.files) {
          if (invalidatedPaths.has(file.document.path))
            continue;
          const existing = candidateFiles.get(file.document.path);
          if (existing && JSON.stringify(existing.document.reference) !== JSON.stringify(file.document.reference)) {
            candidateFiles.delete(file.document.path);
            invalidatedPaths.add(file.document.path);
            partial = true;
            reasons.add(`Source changed across anyOf chunks: ${file.document.path}`);
          } else
            candidateFiles.set(file.document.path, file);
        }
      }
      const expanded = expandMultiTermCandidates([...candidateFiles.values()], anyOf, input.changes?.scope === "lines");
      partial ||= expanded.partial;
      for (const reason of expanded.reasons)
        reasons.add(reason);
      const scope = searchScope(chunkResults[0]?.request ?? normalizeRequest({
        ...input,
        pattern: chunks[0]?.map(escapeRegexLiteral).join("|") ?? "",
        literal: false,
        ignoreCase: false
      }));
      const result = {
        kind: "any-of",
        unit: "occurrences",
        items: expanded.items,
        partial,
        reasons: [...reasons],
        filesRead: chunkAccess.filesRead,
        bytesRead: chunkAccess.bytesRead,
        ...changes ? { changes } : {},
        scope,
        chunks: {
          chunked: chunks.length > 1,
          count: chunks.length,
          maxTermsPerChunk: MAX_ANY_OF_TERMS,
          execution: chunks.length > 1 ? "bounded-parallel" : "single"
        },
        coverage: { exactOccurrences: partial ? "partial" : "complete" },
        redact: input.redact ?? false
      };
      return this.#analyses.page(this.#analyses.create(result, (retainedItems) => ({
        termCounts: retainedTermCounts(anyOf, retainedItems)
      })));
    }
    const terms = validateTerms(input);
    if (input.roles !== undefined && (!input.roles.length || input.roles.some((role) => ![
      "declaration",
      "call",
      "import",
      "export",
      "comment",
      "string",
      "jsx-text",
      "code",
      "unknown"
    ].includes(role))))
      throw new SignalGrepError("roles must contain supported syntactic roles");
    const request = normalizeRequest(terms ? {
      ...input,
      pattern: terms.map(escapeRegexLiteral).join("|"),
      literal: false,
      ignoreCase: false
    } : input);
    const selected = await this.#candidates(request, input, access);
    const candidates = selected.candidates;
    const kind = terms ? input.within === "function" ? "function-and" : "file-and" : input.roles ? "roles" : "changes";
    const result = {
      kind,
      unit: kind === "function-and" ? "functions" : kind === "file-and" ? "files" : "occurrences",
      items: [],
      partial: candidates.partial,
      reasons: [...candidates.reasons],
      filesRead: candidates.filesRead,
      bytesRead: candidates.bytesRead,
      ...candidates.changes ? { changes: candidates.changes } : {},
      scope: searchScope(selected.request),
      coverage: {
        candidateSearch: candidates.partial ? "partial" : "complete",
        ...terms || input.roles ? { syntaxClassification: "complete" } : {}
      },
      redact: input.redact ?? false
    };
    let syntaxCapableFiles = 0;
    const processFile = async (index) => {
      const file = candidates.files[index];
      if (!file)
        return;
      try {
        if (!file.document.utf8) {
          result.partial = true;
          result.reasons.push(`${file.document.path}: non-UTF-8 evidence cannot be reliably classified`);
        } else if (terms && input.within !== "function") {
          const item = fileConjunction(file.document, terms, input.changes?.scope === "lines" ? file.changedRanges : undefined);
          if (item)
            result.items.push(item);
        } else if (terms || input.roles) {
          if (syntaxLanguage(file.document.path))
            syntaxCapableFiles += 1;
          const syntax = await access.syntax(file.document);
          const classified = terms ? findFunctionConjunctions(file.document, syntax, terms, input.changes?.scope === "lines" ? file.changedRanges : undefined) : filterRoleOccurrences(file.document, syntax, file.occurrences, input.roles ?? []);
          result.items.push(...classified.items);
          result.partial ||= classified.partial;
          if (classified.partial && result.coverage)
            result.coverage.syntaxClassification = "partial";
          result.reasons.push(...classified.reasons);
        } else {
          for (const range of file.occurrences) {
            const line = file.document.lineAt(range.start);
            result.items.push({
              path: file.document.path,
              line,
              label: `${file.change ?? "changed"} source occurrence`,
              excerpt: file.document.slice(file.document.lineRange(line)).slice(0, 500),
              source: file.document.reference,
              range,
              details: { change: file.change, byteRange: range }
            });
          }
        }
      } catch (error) {
        if (!(error instanceof SourceBudgetError))
          throw error;
        result.partial = true;
        result.reasons.push(error.message);
        return;
      } finally {
        access.releaseSyntax(file.document);
      }
      await processFile(index + 1);
    };
    await processFile(0);
    result.reasons = [...new Set(result.reasons)];
    if ((input.roles || terms && input.within === "function") && syntaxCapableFiles === 0) {
      throw new SignalGrepError(`${input.roles ? "roles" : "within=function"} requires a supported source language; use ordinary search or file-level allOf for non-code content`);
    }
    if (terms || input.roles) {
      result.stats = {
        filesEnumerated: candidates.files.length,
        filesParsed: access.syntaxParses,
        filesSkipped: Math.max(0, candidates.files.length - syntaxCapableFiles),
        cacheHits: access.syntaxCacheHits,
        parseMs: Math.round(performance.now() - analysisStarted),
        budgetExhausted: result.reasons.some((reason) => reason.includes("limit") || reason.includes("budget-exhausted"))
      };
    }
    return this.#analyses.page(this.#analyses.create(result));
  }
  #inspectionTargets(input, cwd) {
    if (input.targets !== undefined && input.matchIndices !== undefined)
      throw new SignalGrepError("Use targets or matchIndices, not both");
    if (input.targets !== undefined || input.matchIndices !== undefined) {
      rejectFields(input, ["path", "line", "matchIndex"], "Batch inspection");
      const size = input.targets?.length ?? input.matchIndices?.length ?? 0;
      if (size < 1 || size > MAX_INSPECT_TARGETS)
        throw new SignalGrepError("Batch inspection requires 1-5 targets");
      if (input.targets) {
        if (input.cursor !== undefined)
          throw new SignalGrepError("targets cannot be combined with cursor");
        return input.targets.map((target) => legacySourceTarget(resolveInspectionTarget(target, cwd, this.#snapshots)));
      }
      if (!input.cursor)
        throw new SignalGrepError("matchIndices requires a cursor");
      const cursor = input.cursor;
      return (input.matchIndices ?? []).map((matchIndex) => this.#singleTarget({ cursor, matchIndex }, cwd));
    }
    return [this.#singleTarget(input, cwd)];
  }
  #singleTarget(input, cwd) {
    if (input.cursor?.includes(".analysis.")) {
      if (input.path !== undefined || input.line !== undefined || input.matchIndex === undefined)
        throw new CursorError("Analysis inspection requires only cursor and matchIndex");
      const item = this.#analyses.item(input.cursor, input.matchIndex);
      if (!item.source || !item.range)
        throw new CursorError("This analysis item has no verified source range");
      const isStructural = item.details?.kind === "symbol" || item.details?.kind === "function" || item.details?.kind === "impact-target";
      return {
        path: item.path,
        line: item.line,
        reference: item.source,
        ...isStructural ? { range: item.range } : { absoluteFocus: item.range.start }
      };
    }
    return {
      ...legacySourceTarget(resolveInspectionTarget(input, cwd, this.#snapshots)),
      ...input.matchIndex !== undefined ? { matchIndex: input.matchIndex } : {}
    };
  }
  async#impact(input, access) {
    const impactStarted = performance.now();
    rejectFields(input, [...searchFields.filter((field) => !navigationFilterFields.has(field)), ...inspectFields], "mode=impact");
    const filters = navigationFilters(input);
    let path;
    let line = input.line;
    let document2;
    if (input.cursor !== undefined) {
      if (input.cursor.includes(".analysis."))
        throw new CursorError("Impact requires an ordinary search snapshot, not an analysis cursor");
      if (input.matchIndex === undefined || input.path !== undefined || input.line !== undefined || input.symbol !== undefined)
        throw new SignalGrepError("Snapshot impact requires cursor+matchIndex instead of path, line, or symbol");
      const selected = resolveInspectionTarget(input, access.cwd, this.#snapshots);
      if (selected.unverified)
        throw new SignalGrepError("Snapshot source revision is unverified; refresh the search");
      path = selected.path;
      line = selected.line;
      document2 = await access.load(path);
      if (selected.expectedRevision && (document2.reference.origin.kind !== "worktree" || !sameSourceRevision(selected.expectedRevision, document2.reference.origin.revision)))
        throw new SignalGrepError("Source changed; refresh the search");
    } else {
      if (input.matchIndex !== undefined)
        throw new SignalGrepError("matchIndex requires an ordinary search cursor");
      if (!input.path || input.line === undefined && input.symbol === undefined)
        throw new SignalGrepError("Direct impact requires path and at least one of symbol or line");
      path = input.path;
      document2 = await access.load(path);
    }
    if (document2.reference.origin.kind !== "worktree")
      throw new SignalGrepError("Impact currently supports worktree sources only");
    const root = await navigationRoot(access.cwd, document2.path, access.signal);
    const targetSyntax = await access.syntax(document2);
    let target;
    try {
      target = selectImpactTarget(document2, targetSyntax, {
        ...line !== undefined ? { line } : {},
        ...input.symbol !== undefined ? { symbol: input.symbol } : {}
      });
    } finally {
      access.releaseSyntax(document2);
    }
    const request = normalizeRequest({
      pattern: target.symbol.name,
      path: root,
      glob: filters.glob,
      exclude: filters.exclude,
      hidden: filters.hidden,
      literal: true,
      ignoreCase: false
    });
    const candidates = await collectEvidenceCandidates({
      request,
      cwd: access.cwd,
      ...access.signal ? { signal: access.signal } : {},
      access,
      runRipgrep: this.#runner,
      maxFiles: access.maxFiles
    });
    const occurrences = await classifyImpactOccurrences(candidates.files, target, access);
    const bound = await bindImpactCandidates(target, candidates.files, occurrences.items, access);
    occurrences.items = bound.items;
    const reasons = new Set([...candidates.reasons, ...occurrences.reasons]);
    let partial = candidates.partial || occurrences.partial;
    let testItems = [];
    let testStats;
    let relatedTestsCoverage = "skipped";
    const retainedBeforeTests = [target.item, ...occurrences.items];
    if (!target.symbol.hasBody) {
      reasons.add("Related-test augmentation skipped: selected target has no implementation body");
    } else if (impactRetentionExhausted(retainedBeforeTests)) {
      partial = true;
      reasons.add("Related-test augmentation skipped: exact occurrences exhausted the shared analysis budget");
    } else {
      const files = await listWorkspaceFiles(access.cwd, access.signal, {
        path: root,
        glob: filters.glob,
        exclude: filters.exclude,
        hidden: filters.hidden
      });
      const allowed = new Set(files.paths.map((file) => resolve21(access.cwd, file)));
      const primaryPath = resolve21(access.cwd, document2.path);
      allowed.add(primaryPath);
      const host = {
        cwd: access.cwd,
        ...access.signal ? { signal: access.signal } : {},
        normalizePath: (file) => workspaceRelativePath(access.cwd, file),
        load: async (file, expected) => {
          const absolutePath = resolve21(access.cwd, file);
          if (!allowed.has(absolutePath))
            throw new SignalGrepError("Navigation source is excluded by current ignore rules");
          if (absolutePath === primaryPath && expected === undefined)
            return document2;
          return expected ? access.refresh(file, expected) : access.load(file);
        },
        syntax: (source) => access.syntax(source),
        releaseSyntax: (source) => access.releaseSyntax(source),
        listFiles: async () => files,
        maxFilesToParse: access.maxFiles
      };
      const entryPaths = await this.#testEntryPaths(root, files.paths, access.cwd, filters, access.signal);
      const tests = await findRelatedTests(host, {
        path: document2.path,
        line: target.item.line,
        symbol: target.symbol.name
      }, { entryPaths });
      testItems = tests.items;
      testStats = {
        filesEnumerated: files.paths.length,
        ...tests.stats,
        filesParsed: access.syntaxParses,
        cacheHits: access.syntaxCacheHits
      };
      relatedTestsCoverage = tests.partial || files.partial ? "partial" : "complete";
      partial ||= tests.partial || files.partial;
      for (const reason of [...tests.reasons, ...files.reasons])
        reasons.add(reason);
    }
    const result = {
      kind: "impact",
      unit: "impact-candidates",
      items: mergeImpactItems(target.item, occurrences.items, testItems),
      partial,
      reasons: [...reasons],
      filesRead: access.filesRead,
      bytesRead: access.bytesRead,
      stats: {
        ...testStats,
        filesParsed: access.syntaxParses,
        cacheHits: access.syntaxCacheHits,
        parseMs: testStats?.parseMs ?? Math.round(performance.now() - impactStarted),
        budgetExhausted: testStats?.budgetExhausted ?? [...reasons].some((reason) => reason.includes("limit") || reason.includes("budget-exhausted"))
      },
      coverage: {
        compilerCandidateBindings: candidates.partial ? "partial" : "complete",
        exactOccurrences: candidates.partial ? "partial" : "complete",
        syntaxClassification: occurrences.partial ? "partial" : "complete",
        relatedTests: relatedTestsCoverage
      },
      scope: navigationScope(access.cwd, root, document2.path, filters),
      redact: input.redact ?? false
    };
    return this.#analyses.page(this.#analyses.create(result, (items) => retainedImpactCounts(items), impactRetentionPriority));
  }
  async#navigate(input, access) {
    const navigationStarted = performance.now();
    const allowsFilters = input.mode === "imports" || input.mode === "tests";
    rejectFields(input, [
      ...allowsFilters ? searchFields.filter((field) => !navigationFilterFields.has(field)) : searchFields,
      ...inspectFields
    ], `mode=${input.mode}`);
    let path = input.path;
    let reference;
    let line = input.line;
    let loaded;
    if (input.cursor) {
      if (input.path !== undefined || input.line !== undefined || input.matchIndex === undefined)
        throw new SignalGrepError("Snapshot navigation requires cursor+matchIndex instead of path/line");
      const selected = this.#singleTarget(input, access.cwd);
      path = selected.path;
      line = selected.line;
      reference = selected.reference;
      if (selected.unverified)
        throw new SignalGrepError("Snapshot source revision is unverified; refresh the search");
      if (selected.expectedRevision) {
        const doc = await access.load(path);
        if (doc.reference.origin.kind !== "worktree" || !sameSourceRevision(selected.expectedRevision, doc.reference.origin.revision))
          throw new SignalGrepError("Source changed; refresh the search");
        reference = doc.reference;
        loaded = doc;
      }
    } else if (input.matchIndex !== undefined)
      throw new SignalGrepError("matchIndex requires a cursor");
    if (!path)
      throw new SignalGrepError(`${input.mode} requires path or cursor+matchIndex`);
    const document2 = loaded ?? await access.load(path, reference);
    const language = syntaxLanguage(document2.path);
    const isPython = /\.py$/iu.test(document2.path);
    if (!language && !isPython || language === "go") {
      throw new SignalGrepError(`${input.mode} requires reliable JS/TS/TSX or Python outline syntax (${language ?? "unsupported"})`);
    }
    if (input.mode === "outline") {
      const syntax = isPython ? undefined : await access.syntax(document2);
      const supported = isPython || syntax?.status === "ok" && syntax.language !== "go";
      const items = supported ? isPython ? parsePythonOutline(document2).map((symbol) => ({
        path: document2.path,
        line: symbol.startLine,
        label: `${symbol.kind} ${symbol.name}${symbol.hasBody ? "" : " (no implementation body)"}`,
        excerpt: symbol.signature,
        source: document2.reference,
        range: symbol.range,
        details: {
          kind: "symbol",
          language: "python",
          name: symbol.name,
          scope: symbol.scope,
          hasBody: symbol.hasBody,
          exported: false,
          syntax: "indentation-based outline; not compiler binding"
        }
      })) : (syntax?.symbols ?? []).map((symbol) => {
        const range = {
          start: document2.toByteOffset(symbol.start),
          end: document2.toByteOffset(symbol.end)
        };
        const firstLine = document2.lineAt(range.start);
        const signatureEnd = symbol.bodyStart ?? symbol.end;
        const signature = document2.text.slice(symbol.start, Math.min(signatureEnd, symbol.start + 600));
        return {
          path: document2.path,
          line: firstLine,
          label: `${symbol.kind} ${symbol.name}${symbol.hasBody ? "" : " (no implementation body)"}`,
          excerpt: signature,
          source: document2.reference,
          range,
          details: {
            kind: "symbol",
            name: symbol.name,
            scope: symbol.scope,
            hasBody: symbol.hasBody,
            exported: symbol.exported,
            signatureTruncated: signatureEnd - symbol.start > 600
          }
        };
      }) : [];
      return this.#analyses.page(this.#analyses.create({
        kind: "outline",
        unit: "symbols",
        items,
        partial: !supported,
        reasons: supported ? isPython ? [
          "Python outline uses indentation boundaries; it does not prove compiler bindings or runtime call relationships"
        ] : [] : [
          `Outline requires reliable JS/TS/TSX or Python syntax (${syntax?.language ?? "unsupported"}: ${syntax?.status ?? "unsupported"})`
        ],
        filesRead: access.filesRead,
        bytesRead: access.bytesRead,
        stats: {
          filesEnumerated: 1,
          filesParsed: isPython ? 0 : access.syntaxParses,
          filesSkipped: 0,
          cacheHits: isPython ? 0 : access.syntaxCacheHits,
          parseMs: Math.round(performance.now() - navigationStarted),
          budgetExhausted: false
        },
        redact: input.redact ?? false
      }));
    }
    if (document2.reference.origin.kind !== "worktree")
      return this.#analyses.page(this.#analyses.create({
        kind: input.mode === "imports" ? "imports" : "tests",
        unit: input.mode === "imports" ? "relationships" : "evidence-items",
        items: [],
        partial: true,
        reasons: [
          "Import and related-test navigation currently support worktree sources only; historical sources are not switched to the worktree"
        ]
      }));
    const root = await navigationRoot(access.cwd, document2.path, access.signal);
    const filters = navigationFilters(input);
    if (input.mode === "tests" && isPython)
      return this.#analyses.page(this.#analyses.create({
        kind: "tests",
        unit: "evidence-items",
        items: [],
        partial: true,
        reasons: [
          'Python related-test navigation is not supported; use mode="outline" for Python source structure'
        ],
        filesRead: access.filesRead,
        bytesRead: access.bytesRead,
        stats: {
          filesEnumerated: 0,
          filesParsed: 0,
          filesSkipped: 0,
          cacheHits: 0,
          parseMs: Math.round(performance.now() - navigationStarted),
          budgetExhausted: false
        },
        coverage: { navigation: "not-applicable" },
        scope: navigationScope(access.cwd, root, document2.path, filters),
        redact: input.redact ?? false
      }));
    const files = await listWorkspaceFiles(access.cwd, access.signal, {
      path: root,
      glob: filters.glob,
      exclude: filters.exclude,
      hidden: filters.hidden
    });
    const allowed = new Set(files.paths.map((file) => resolve21(access.cwd, file)));
    const primaryPath = resolve21(access.cwd, document2.path);
    allowed.add(primaryPath);
    const host = {
      cwd: access.cwd,
      ...access.signal ? { signal: access.signal } : {},
      normalizePath: (file) => workspaceRelativePath(access.cwd, file),
      load: async (file, expected) => {
        const absolutePath = resolve21(access.cwd, file);
        if (!allowed.has(absolutePath))
          throw new SignalGrepError("Navigation source is excluded by current ignore rules");
        if (absolutePath === primaryPath && expected === undefined)
          return document2;
        return expected ? access.refresh(file, expected) : access.load(file);
      },
      syntax: (doc) => access.syntax(doc),
      releaseSyntax: (doc) => access.releaseSyntax(doc),
      listFiles: async () => files,
      maxFilesToParse: access.maxFiles
    };
    const request = {
      path: document2.path,
      ...line !== undefined ? { line } : {},
      ...input.symbol !== undefined ? { symbol: input.symbol } : {}
    };
    const result = input.mode === "imports" ? await navigateImports(host, request) : await findRelatedTests(host, request, {
      entryPaths: await this.#testEntryPaths(root, files.paths, access.cwd, filters, access.signal)
    });
    return this.#analyses.page(this.#analyses.create({
      ...result,
      partial: result.partial || files.partial,
      reasons: [...result.reasons, ...files.reasons],
      kind: input.mode === "imports" ? "imports" : "tests",
      unit: input.mode === "imports" ? "relationships" : "evidence-items",
      coverage: {
        navigation: result.partial || files.partial ? "partial" : "complete"
      },
      stats: {
        filesEnumerated: files.paths.length,
        ...result.stats,
        filesParsed: access.syntaxParses,
        cacheHits: access.syntaxCacheHits
      },
      scope: navigationScope(access.cwd, root, document2.path, filters),
      redact: input.redact ?? false
    }));
  }
}

// src/service.ts
import { resolve as resolve22 } from "path";

// src/format.ts
import { readFile as readFile3 } from "fs/promises";
var RESULT_METADATA_RESERVE_BYTES = 1024;
var RESULT_METADATA_RESERVE_CHARACTERS = 512;

class MatchPageSoftLimitError extends Error {
  constructor() {
    super("A single match exceeds the estimated-token detail target");
    this.name = "MatchPageSoftLimitError";
  }
}
function pageBodyCharacterLimit(resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET) {
  if (!Number.isSafeInteger(resultTokenBudget) || resultTokenBudget <= 0) {
    throw new Error("Result token budget must be a positive safe integer");
  }
  const limit = resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - RESULT_METADATA_RESERVE_CHARACTERS;
  if (limit <= 0) {
    throw new Error("Result token budget cannot fit reserved response metadata");
  }
  return limit;
}
function compactLine(line) {
  const clean = line.replaceAll("\r", "").trimEnd();
  return excerptText(clean).text;
}
function matchLocationSuffix(match) {
  if (match.occurrences.length === 0)
    return "";
  const displayed = match.occurrences.slice(0, MAX_DISPLAYED_OCCURRENCES);
  const ranges = displayed.map(({ range }) => {
    const start2 = range.start.character + 1;
    const end = Math.max(start2, range.end.character);
    const suffix = range.encoding === "utf-8" ? "b" : "";
    return `${start2}-${end}${suffix}`;
  });
  const omitted = match.occurrences.length - displayed.length;
  const notice = omitted > 0 ? ` [ranges: ${String(displayed.length)} of ${String(match.occurrences.length)} shown; ${String(omitted)} omitted; mode=inspect with this path/line for source]` : "";
  return ` [${ranges.join(",")}]${notice}`;
}
function formatMatchLine(match, matchIndex) {
  return ` ${match.lineNumber}: ${match.lineContent}${matchLocationSuffix(match)} {match #${String(matchIndex)}}`;
}
async function loadContextLines(match, expectedRevision, cache, signal) {
  const cached = cache.get(match.absolutePath);
  if (cached)
    return cached;
  try {
    if (signal?.aborted)
      throw abortError();
    if (!expectedRevision || expectedRevision.size > MAX_SOURCE_FILE_BYTES) {
      const unavailable = { status: "unavailable" };
      cache.set(match.absolutePath, unavailable);
      return unavailable;
    }
    const beforeRevision = await getSourceRevision(match.absolutePath);
    if (!beforeRevision || !sameSourceRevision(expectedRevision, beforeRevision)) {
      const changed = { status: "changed" };
      cache.set(match.absolutePath, changed);
      return changed;
    }
    const content = await readFile3(match.absolutePath, { encoding: "utf8", signal });
    const afterRevision = await getSourceRevision(match.absolutePath);
    if (!afterRevision || !sameSourceRevision(expectedRevision, afterRevision)) {
      const changed = { status: "changed" };
      cache.set(match.absolutePath, changed);
      return changed;
    }
    const available = {
      status: "available",
      lines: content.replaceAll("\r", "").split(`
`)
    };
    cache.set(match.absolutePath, available);
    return available;
  } catch (error) {
    if (signal?.aborted || error instanceof Error && error.name === "AbortError") {
      throw abortError();
    }
    const unavailable = { status: "unavailable" };
    cache.set(match.absolutePath, unavailable);
    return unavailable;
  }
}
function matchContextWindows(snapshot, include) {
  const windows = new Map;
  const context = Math.min(Math.max(0, snapshot.request.context), MAX_CONTEXT_LINES);
  if (context === 0)
    return windows;
  const selectedFiles = new Map;
  for (const [index, match] of snapshot.matches.entries()) {
    if (include && !include(match, index))
      continue;
    const matches = selectedFiles.get(match.absolutePath) ?? [];
    matches.push(match);
    selectedFiles.set(match.absolutePath, matches);
  }
  for (const matches of selectedFiles.values()) {
    const ordered = matches.toSorted((left, right) => left.lineNumber - right.lineNumber);
    for (const [index, match] of ordered.entries()) {
      const previous = ordered[index - 1];
      const next = ordered[index + 1];
      windows.set(match, {
        startLine: Math.max(1, match.lineNumber - context, previous ? Math.floor((previous.lineNumber + match.lineNumber) / 2) + 1 : 1),
        endLine: Math.min(match.lineNumber + context, next ? Math.floor((match.lineNumber + next.lineNumber) / 2) : Number.MAX_SAFE_INTEGER)
      });
    }
  }
  return windows;
}
async function formatBlock(match, matchIndex, expectedRevision, window2, cache, allMatchLines, signal) {
  const matchingLine = formatMatchLine(match, matchIndex);
  if (!window2)
    return { text: matchingLine, contextStatus: "none" };
  const contextLoad = await loadContextLines(match, expectedRevision, cache, signal);
  if (contextLoad.status !== "available") {
    return { text: matchingLine, contextStatus: contextLoad.status };
  }
  const { lines } = contextLoad;
  const output = [];
  for (let lineNumber = window2.startLine;lineNumber <= window2.endLine; lineNumber += 1) {
    if (lineNumber === match.lineNumber) {
      output.push(matchingLine);
    } else if (lineNumber <= lines.length && !allMatchLines.get(match.absolutePath)?.has(lineNumber)) {
      output.push(` ${lineNumber}- ${compactLine(lines[lineNumber - 1] ?? "")}`);
    }
  }
  return { text: output.join(`
`), contextStatus: "available" };
}
async function formatMatchPage(snapshot, offset, signal, options = {}) {
  const maxPageBodyBytes = MAX_RESULT_BYTES - Math.max(RESULT_METADATA_RESERVE_BYTES, options.metadataReserveBytes ?? 0);
  if (maxPageBodyBytes <= 0)
    throw new Error("Continuation metadata exceeds the response byte budget; select fewer paths");
  const maxPageBodyCharacters = pageBodyCharacterLimit(options.resultTokenBudget);
  const cache = new Map;
  const omittedFiles = new Set;
  const changedFiles = new Set;
  const output = [];
  let returnedMatches = 0;
  let nextOffset = offset;
  let currentFile;
  let outputBytes = 0;
  let outputCharacters = 0;
  let firstMatchIndex;
  let lastMatchIndex;
  let hasMatchRanges = false;
  let hasByteRanges = false;
  let occurrenceRangesOmitted = 0;
  let occurrenceMatchesTruncated = 0;
  const contextWindows = matchContextWindows(snapshot, options.include);
  const allMatchLines = new Map;
  if (contextWindows.size > 0) {
    for (const match of snapshot.matches) {
      const lines = allMatchLines.get(match.absolutePath) ?? new Set;
      lines.add(match.lineNumber);
      allMatchLines.set(match.absolutePath, lines);
    }
  }
  while (nextOffset < snapshot.matches.length && returnedMatches < snapshot.request.pageSize) {
    if (signal?.aborted)
      throw abortError();
    const matchIndex = nextOffset;
    const match = snapshot.matches[matchIndex];
    if (!match)
      break;
    nextOffset += 1;
    if (options.include && !options.include(match, matchIndex))
      continue;
    let block = await formatBlock(match, matchIndex + 1, snapshot.sourceRevisions.get(match.absolutePath), contextWindows.get(match), cache, allMatchLines, signal);
    const fileHeader = match.displayPath === currentFile ? "" : `${match.displayPath}
`;
    const separator = output.length === 0 ? "" : fileHeader.length === 0 ? `
` : `

`;
    let addition = `${separator}${fileHeader}${block.text}`;
    let additionBytes = Buffer.byteLength(addition);
    let additionCharacters = addition.length;
    const exceedsBudget = () => outputBytes + additionBytes > maxPageBodyBytes || outputCharacters + additionCharacters > maxPageBodyCharacters;
    if (exceedsBudget()) {
      if (returnedMatches > 0) {
        nextOffset = matchIndex;
        break;
      }
      block = { text: formatMatchLine(match, matchIndex + 1), contextStatus: "unavailable" };
      addition = `${fileHeader}${block.text}`;
      additionBytes = Buffer.byteLength(addition);
      additionCharacters = addition.length;
    }
    if (additionBytes > maxPageBodyBytes) {
      throw new Error("A single match exceeds the reserved result budget");
    }
    if (additionCharacters > maxPageBodyCharacters)
      throw new MatchPageSoftLimitError;
    output.push(addition);
    outputBytes += additionBytes;
    outputCharacters += additionCharacters;
    currentFile = match.displayPath;
    returnedMatches += 1;
    hasMatchRanges ||= match.occurrences.length > 0;
    hasByteRanges ||= match.occurrences.slice(0, MAX_DISPLAYED_OCCURRENCES).some(({ range }) => range.encoding === "utf-8");
    const omittedRanges = Math.max(0, match.occurrences.length - MAX_DISPLAYED_OCCURRENCES);
    occurrenceRangesOmitted += omittedRanges;
    if (omittedRanges > 0)
      occurrenceMatchesTruncated += 1;
    if (block.contextStatus === "changed")
      changedFiles.add(match.displayPath);
    if (block.contextStatus === "unavailable")
      omittedFiles.add(match.displayPath);
    firstMatchIndex ??= matchIndex;
    lastMatchIndex = matchIndex;
  }
  const hasNext = snapshot.matches.slice(nextOffset).some((match, index) => !options.include || options.include(match, nextOffset + index));
  const page = {
    body: output.join(""),
    returnedMatches,
    nextOffset,
    hasNext,
    hasMatchRanges,
    hasByteRanges,
    occurrenceRangesOmitted,
    occurrenceMatchesTruncated,
    contextOmittedFiles: [...omittedFiles].toSorted((left, right) => left.localeCompare(right)),
    contextChangedFiles: [...changedFiles].toSorted((left, right) => left.localeCompare(right))
  };
  if (firstMatchIndex !== undefined)
    page.firstMatchIndex = firstMatchIndex;
  if (lastMatchIndex !== undefined)
    page.lastMatchIndex = lastMatchIndex;
  return page;
}

// src/summary.ts
var METADATA_CHARACTERS = 2400;
var METADATA_BYTES = 3584;
function formatSummary(snapshot, fileLimit, offset = 0, resultTokenBudget = DEFAULT_RESULT_TOKEN_BUDGET) {
  if (!Number.isSafeInteger(fileLimit) || fileLimit <= 0)
    throw new Error("Summary file limit must be a positive safe integer");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.fileCounts.size)
    throw new Error("Summary offset is outside the file summary");
  const files = [...snapshot.fileCounts.entries()].toSorted(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right));
  const firstMatches = new Map;
  for (const [index, match] of snapshot.matches.entries())
    if (!firstMatches.has(match.displayPath))
      firstMatches.set(match.displayPath, { match, index });
  const maxCharacters = Math.max(256, resultTokenBudget * ESTIMATED_CHARACTERS_PER_TOKEN - METADATA_CHARACTERS);
  const maxBytes = MAX_RESULT_BYTES - METADATA_BYTES;
  const rows = [];
  const shownPaths = [];
  let bytes = 0;
  let characters = 0;
  for (const [file, count] of files.slice(offset, offset + Math.min(30, fileLimit))) {
    const row = `${file}  ${String(count).padStart(6)}`;
    if (bytes + Buffer.byteLength(row) + 1 > maxBytes) {
      if (!rows.length)
        throw new Error("A file summary row exceeds the response byte budget; narrow the path");
      break;
    }
    if (rows.length && characters + row.length + 1 > maxCharacters)
      break;
    rows.push(row);
    shownPaths.push(file);
    bytes += Buffer.byteLength(row) + 1;
    characters += row.length + 1;
  }
  const previews = [];
  const sampleIndices = [];
  const sampleBudget = Math.max(0, Math.min(maxBytes - bytes, maxCharacters - characters));
  let sampleBytes = 0;
  for (const path of shownPaths.slice(0, 5)) {
    const retained = firstMatches.get(path);
    if (!retained)
      continue;
    const preview = `${path}:${retained.match.lineNumber} {match #${retained.index + 1}} ${retained.match.lineContent}`;
    if (sampleBytes + Buffer.byteLength(preview) + 1 > sampleBudget)
      continue;
    previews.push(preview);
    sampleIndices.push(retained.index + 1);
    sampleBytes += Buffer.byteLength(preview) + 1;
  }
  const nextOffset = offset + rows.length;
  return {
    body: rows.join(`
`),
    previews: previews.join(`
`),
    previewsShown: previews.length,
    previewsOmitted: shownPaths.length - previews.length,
    shown: rows.length,
    offset,
    nextOffset,
    hasNext: nextOffset < files.length,
    omitted: files.length - nextOffset,
    shownPaths,
    sampleIndices,
    previewByteBudget: sampleBudget
  };
}

// src/summary-previews.ts
async function summarySourcePreviews(snapshot, paths, maxBytes, cwd, signal) {
  const rows = [];
  const indices = [];
  let bytes = 0;
  let filesRead = 0;
  let windows = 0;
  const reasons = [];
  for (const path of paths) {
    if (filesRead >= 5 || maxBytes - bytes < 256)
      break;
    const matches = snapshot.matches.flatMap((match, index) => match.displayPath === path ? [{ match, index }] : []);
    const first = matches[0];
    if (!first)
      continue;
    const revision = snapshot.sourceRevisions.get(first.match.absolutePath);
    if (!revision || revision.size > MAX_SOURCE_FILE_BYTES) {
      reasons.push(`${path}: preview source unverified or over 5 MiB`);
      continue;
    }
    filesRead += 1;
    try {
      const document2 = await readWorkspaceDocument(path, cwd, signal);
      if (document2.reference.origin.kind !== "worktree" || !sameSourceRevision(revision, document2.reference.origin.revision) || !document2.utf8) {
        reasons.push(`${path}: preview source changed or is not lossless UTF-8`);
        continue;
      }
      let lastEnd = 0;
      let perFile = 0;
      for (const { match, index } of matches) {
        if (perFile >= 2)
          break;
        const start2 = Math.max(1, match.lineNumber - 3);
        const end = Math.min(document2.lineStarts.length, start2 + 6);
        if (start2 <= lastEnd)
          continue;
        const lineRows = [];
        for (let line = start2;line <= end; line += 1) {
          const value = document2.slice(document2.lineRange(line)).replace(/\n$/, "");
          const excerpt = excerptText(value);
          lineRows.push(`${line}: ${excerpt.text}${excerpt.truncated ? " [preview line truncated]" : ""}`);
        }
        const row = `${path}:${match.lineNumber} {match #${index + 1}} [source preview lines ${start2}-${end}]
${lineRows.join(`
`)}`;
        if (bytes + Buffer.byteLength(row) + 2 > maxBytes)
          continue;
        rows.push(row);
        indices.push(index + 1);
        bytes += Buffer.byteLength(row) + 2;
        windows += 1;
        perFile += 1;
        lastEnd = end;
      }
    } catch (error) {
      if (signal?.aborted || error instanceof Error && error.name === "AbortError")
        throw abortError();
      if (!(error instanceof Error) || !(("code" in error) || error.name === "SourceDocumentError"))
        throw error;
      reasons.push(`${path}: preview unavailable`);
    }
  }
  return { text: rows.join(`

`), indices, windows, filesRead, reasons };
}

// src/redaction.ts
var PRIVATE_KEY = /-----BEGIN ([^-\r\n]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g;
var SENSITIVE_NAME = String.raw`(?:(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:password|passwd|secret|token|api[_-]?key|access[_-]?(?:key|token)|secret[_-]?access[_-]?key|private[_-]?key|service[_-]?key)(?:[_-][A-Za-z0-9]+)*)`;
var SENSITIVE_ASSIGNMENT = new RegExp(String.raw`((?<![A-Za-z0-9_-])(?:["']?${SENSITIVE_NAME}["']?)\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\r\n]+)`, "gi");
var TYPE_ONLY_VALUES = new Set([
  "boolean",
  "number",
  "string",
  "unknown",
  "never",
  "undefined",
  "null"
]);
function redactString(value) {
  let count = 0;
  let redacted = value.replace(PRIVATE_KEY, (_match, kind) => {
    count += 1;
    return `-----BEGIN ${kind}-----
[REDACTED]
-----END ${kind}-----`;
  });
  redacted = redacted.replace(SENSITIVE_ASSIGNMENT, (match, prefix, rawValue) => {
    const unquoted = rawValue.replace(/^["']|["']$/g, "").toLowerCase();
    if (TYPE_ONLY_VALUES.has(unquoted))
      return match;
    count += 1;
    return `${prefix}"[REDACTED]"`;
  });
  return { value: redacted, count };
}
function redactInPlace(value, seen) {
  if (typeof value !== "object" || value === null)
    return 0;
  if (seen.has(value))
    return 0;
  seen.add(value);
  if (Array.isArray(value)) {
    let count = 0;
    for (let index = 0;index < value.length; index += 1) {
      const item = value[index];
      if (typeof item === "string") {
        const redacted = redactString(item);
        value[index] = redacted.value;
        count += redacted.count;
      } else
        count += redactInPlace(item, seen);
    }
    return count;
  }
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      const redacted = redactString(item);
      Reflect.set(value, key, redacted.value);
      count += redacted.count;
    } else
      count += redactInPlace(item, seen);
  }
  return count;
}
function redactSignalGrepResult(result) {
  const text = redactString(result.text);
  const details = structuredClone(result.details);
  const redactedCount = text.count + redactInPlace(details, new WeakSet);
  return {
    text: text.value,
    details: {
      ...details,
      redactedCount,
      redactionApplied: true
    }
  };
}

// src/snapshot-store.ts
import { randomUUID as randomUUID3 } from "crypto";
class SnapshotStore {
  #snapshots = new Map;
  #expired = new Set;
  #ttlMs;
  #maxSnapshots;
  #maxTotalStoredMatches;
  #maxTotalStoredBytes;
  #maxTotalStoredOccurrences;
  #now;
  constructor(options = {}) {
    this.#ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.#maxSnapshots = options.maxSnapshots ?? 20;
    this.#maxTotalStoredMatches = options.maxTotalStoredMatches ?? 1e5;
    this.#maxTotalStoredBytes = options.maxTotalStoredBytes ?? MAX_SEARCH_STORAGE_BYTES;
    this.#maxTotalStoredOccurrences = options.maxTotalStoredOccurrences ?? MAX_STORED_OCCURRENCES;
    this.#now = options.now ?? Date.now;
  }
  create(scan) {
    this.sweep();
    if (this.#scanBytes(scan) > this.#maxTotalStoredBytes || this.#scanOccurrences(scan) > this.#maxTotalStoredOccurrences)
      throw new SignalGrepError("Search snapshot exceeds the session storage budget");
    const now = this.#now();
    const snapshot = {
      ...scan,
      id: randomUUID3(),
      createdAt: now,
      lastAccessedAt: now
    };
    this.#snapshots.set(snapshot.id, snapshot);
    this.#evictToBounds();
    return snapshot;
  }
  cursor(snapshot, offset, kind = "matches", selectionKey = "all") {
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new CursorError("Cannot create a cursor with an invalid offset", "E_CURSOR_OFFSET_INVALID");
    }
    if (!/^(?:all|[0-9a-f]{16})$/.test(selectionKey)) {
      throw new CursorError("Cannot create a cursor with an invalid selection key");
    }
    return `${snapshot.id}.${kind}.${offset.toString(36)}.${selectionKey}`;
  }
  resolve(cursor) {
    this.sweep();
    const parts2 = cursor.match(/^(.+)\.(matches|summary)\.([0-9a-z]+)\.(all|[0-9a-f]{16})$/);
    if (!parts2) {
      throw new CursorError("Invalid cursor. Start a new search to obtain a fresh cursor.", "E_CURSOR_MALFORMED");
    }
    const [, id, rawKind, rawOffset, selectionKey] = parts2;
    if (!id || !rawKind || !rawOffset || !selectionKey) {
      throw new CursorError("Invalid cursor. Start a new search to obtain a fresh cursor.", "E_CURSOR_MALFORMED");
    }
    const kind = rawKind === "summary" ? "summary" : "matches";
    const offset = Number.parseInt(rawOffset, 36);
    const snapshot = this.#snapshots.get(id);
    if (!snapshot)
      throw new CursorError(this.#expired.has(id) ? "Cursor expired or was evicted. Run the search again." : "Cursor was not found. Run the search again.", this.#expired.has(id) ? "E_CURSOR_EXPIRED" : "E_CURSOR_NOT_FOUND");
    const maximumOffset = kind === "summary" ? snapshot.fileCounts.size : snapshot.matches.length;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > maximumOffset) {
      throw new CursorError("Cursor offset is outside the retained search snapshot.", "E_CURSOR_OFFSET_INVALID");
    }
    snapshot.lastAccessedAt = this.#now();
    return { snapshot, offset, kind, selectionKey };
  }
  delete(snapshot) {
    return this.#snapshots.delete(snapshot.id);
  }
  clear() {
    for (const id of this.#snapshots.keys())
      this.#rememberExpired(id);
    this.#snapshots.clear();
  }
  sweep() {
    const cutoff = this.#now() - this.#ttlMs;
    for (const [id, snapshot] of this.#snapshots) {
      if (snapshot.lastAccessedAt < cutoff) {
        this.#snapshots.delete(id);
        this.#rememberExpired(id);
      }
    }
  }
  get size() {
    this.sweep();
    return this.#snapshots.size;
  }
  get storedMatches() {
    this.sweep();
    return this.#totalStoredMatches();
  }
  #evictToBounds() {
    while (this.#snapshots.size > this.#maxSnapshots || this.#totalStoredMatches() > this.#maxTotalStoredMatches || [...this.#snapshots.values()].reduce((total, scan) => total + this.#scanBytes(scan), 0) > this.#maxTotalStoredBytes || [...this.#snapshots.values()].reduce((total, scan) => total + this.#scanOccurrences(scan), 0) > this.#maxTotalStoredOccurrences) {
      let oldest;
      for (const snapshot of this.#snapshots.values()) {
        if (!oldest || snapshot.lastAccessedAt < oldest.lastAccessedAt)
          oldest = snapshot;
      }
      if (!oldest)
        break;
      this.#snapshots.delete(oldest.id);
      this.#rememberExpired(oldest.id);
    }
  }
  #totalStoredMatches() {
    let total = 0;
    for (const snapshot of this.#snapshots.values())
      total += snapshot.matches.length;
    return total;
  }
  #scanBytes(scan) {
    return scan.retention?.accountedBytes ?? Buffer.byteLength(JSON.stringify({
      matches: scan.matches,
      fileCounts: [...scan.fileCounts],
      sourceRevisions: [...scan.sourceRevisions]
    }));
  }
  #scanOccurrences(scan) {
    return scan.retention?.retainedOccurrences ?? scan.matches.reduce((total, match) => total + match.occurrences.length, 0);
  }
  #rememberExpired(id) {
    this.#expired.add(id);
    while (this.#expired.size > this.#maxSnapshots * 4) {
      const oldest = this.#expired.values().next().value;
      if (oldest === undefined)
        break;
      this.#expired.delete(oldest);
    }
  }
}

// src/service.ts
function cursorPathSelection(input, cwd) {
  if (input.path !== undefined && input.paths !== undefined) {
    throw new SignalGrepError("Use either path or paths with a cursor, not both");
  }
  const rawPaths = input.paths ?? (input.path === undefined ? [] : [input.path]);
  if (input.paths !== undefined && rawPaths.length === 0) {
    throw new SignalGrepError("paths must contain at least one retained file");
  }
  if (rawPaths.length === 0)
    return;
  if (rawPaths.length > MAX_SELECTED_PATHS) {
    throw new SignalGrepError(`paths cannot contain more than ${String(MAX_SELECTED_PATHS)} entries`);
  }
  const labels = [];
  const absolutePaths = new Set;
  const policy = new SearchPathPolicy(cwd);
  for (const rawPath of rawPaths) {
    const label = rawPath.replace(/^@/, "");
    validateSearchPath(label, input.paths !== undefined ? "paths" : "path");
    if (label.length === 0)
      throw new SignalGrepError("Cursor paths cannot be empty");
    const absolutePath = resolve22(cwd, label);
    policy.assertPath(absolutePath);
    if (absolutePaths.has(absolutePath))
      continue;
    absolutePaths.add(absolutePath);
    labels.push(label);
  }
  const key = createHash3("sha256").update([...absolutePaths].toSorted((left, right) => left.localeCompare(right)).join("\x00")).digest("hex").slice(0, 16);
  return { labels, absolutePaths, key };
}
function baseDetails(snapshot, mode) {
  const sourceUnverifiedFileCount = new Set(snapshot.matches.filter((match) => !snapshot.sourceRevisions.has(match.absolutePath)).map((match) => match.absolutePath)).size;
  return {
    version: 1,
    mode,
    status: snapshot.snapshotComplete ? "complete" : "partial",
    totalMatches: snapshot.totalMatches,
    storedMatches: snapshot.matches.length,
    totalFiles: snapshot.fileCounts.size,
    returnedMatches: 0,
    snapshotComplete: snapshot.snapshotComplete,
    ...snapshot.retention ? { retention: snapshot.retention } : {},
    scope: searchScope2(snapshot.request),
    ...snapshot.request.redact ? { redactionRequested: true } : {},
    ...snapshot.truncatedLines > 0 ? { lineContentTruncated: snapshot.truncatedLines } : {},
    ...sourceUnverifiedFileCount > 0 ? { sourceUnverifiedFileCount } : {}
  };
}
function searchScope2(request) {
  const path = request.path ?? ".";
  const requestedPath = request.expandedFromPath ?? path;
  return {
    path,
    requestedPath,
    glob: [...request.glob],
    exclude: [...request.exclude],
    hidden: request.hidden,
    expandedToProjectRoot: request.expandedFromPath !== undefined,
    assertion: path === "." ? "project-wide" : "requested-scope",
    ...request.modifiedAfterMs !== undefined ? { modifiedAfterMs: request.modifiedAfterMs } : {},
    ...request.modifiedBeforeMs !== undefined ? { modifiedBeforeMs: request.modifiedBeforeMs } : {}
  };
}
function emptyResultText(scope) {
  const filters = scope.glob.length || scope.exclude.length || !scope.hidden || scope.modifiedAfterMs !== undefined || scope.modifiedBeforeMs !== undefined ? " Include/exclude and hidden-file filters were applied." : "";
  const expansion = scope.expandedToProjectRoot ? ` after the requested path ${JSON.stringify(scope.requestedPath)} also returned no matches` : "";
  const range = scope.assertion === "project-wide" ? "project root" : "requested path";
  return `No matches found anywhere in ${range} ${JSON.stringify(scope.path)}${expansion}.${filters}${modificationTimeBoundsText(scope.modifiedAfterMs, scope.modifiedBeforeMs)}`;
}
function scopeExpansionNote(scope, totalMatches) {
  if (!scope?.expandedToProjectRoot)
    return "";
  const outcome = totalMatches > 0 ? "returned project-wide matches" : "the project root was also searched and had no matches";
  return `

[Scope expanded: requested path ${JSON.stringify(scope.requestedPath)} had no matches; ${outcome} from ${JSON.stringify(scope.path)}.]`;
}
function completenessNote(snapshot) {
  if (snapshot.snapshotComplete)
    return "complete snapshot";
  const reasons = snapshot.retention?.reasons.join("; ");
  return `PARTIAL snapshot: retained ${snapshot.matches.length} of ${snapshot.totalMatches} matches; ${reasons ? `${reasons}; ` : ""}narrow the search to retrieve all matches`;
}
function sourceVerificationNote(details) {
  return details.sourceUnverifiedFileCount ? `

[Source revision unverified for ${String(details.sourceUnverifiedFileCount)} retained file(s); context and snapshot-scoped inspection require verified source.]` : "";
}
function selectContextBudget(input, mode, candidate) {
  if (mode !== "auto" || input.limit !== undefined || input.cursor)
    return;
  return candidate;
}
function matchPageOptions(budget) {
  if (!budget)
    return {};
  return { resultTokenBudget: budget.resultTokenBudget };
}
function attachContextBudget(result, budget, totalMatches) {
  if (!budget || totalMatches === 0)
    return result;
  let text = result.text;
  if (budget.tier !== "full") {
    text = `${result.text}

[Budget: ${budget.tier}; context remainder ${budget.contextRemainderPercent}%; auto detail target ${budget.resultTokenBudget} estimated tokens.]`;
  }
  return {
    ...result,
    text,
    details: {
      ...result.details,
      budgetTier: budget.tier,
      contextRemainderPercent: budget.contextRemainderPercent,
      resultTokenBudget: budget.resultTokenBudget
    }
  };
}
function rejectCursorOnlyOptions(input) {
  const ignored = [];
  if (input.scope !== undefined)
    ignored.push("scope");
  if (input.wholeWord !== undefined)
    ignored.push("wholeWord");
  if (input.query !== undefined)
    ignored.push("query");
  if (input.pattern !== undefined)
    ignored.push("pattern");
  if (input.glob !== undefined)
    ignored.push("glob");
  if (input.exclude !== undefined)
    ignored.push("exclude");
  if (input.literal !== undefined)
    ignored.push("literal");
  if (input.ignoreCase !== undefined)
    ignored.push("ignoreCase");
  if (input.hidden !== undefined)
    ignored.push("hidden");
  if (input.context !== undefined)
    ignored.push("context");
  if (input.limit !== undefined)
    ignored.push("limit");
  if (input.modifiedAfter !== undefined)
    ignored.push("modifiedAfter");
  if (input.modifiedBefore !== undefined)
    ignored.push("modifiedBefore");
  if (input.line !== undefined)
    ignored.push("line");
  if (input.matchIndex !== undefined)
    ignored.push("matchIndex");
  if (input.matchIndices !== undefined)
    ignored.push("matchIndices");
  if (input.targets !== undefined)
    ignored.push("targets");
  if (ignored.length > 0) {
    throw new CursorError(`The following options cannot be used with cursor: ${ignored.join(", ")}`, "E_CURSOR_OPTIONS_CONFLICT");
  }
}

class SignalGrepService {
  #runRipgrep;
  #snapshots;
  #summaryFileLimit;
  #evidence;
  #lifecycle = new AbortController;
  #active = new Set;
  #reusableSummarySnapshots = new WeakSet;
  constructor(options) {
    this.#runRipgrep = options.runRipgrep;
    this.#snapshots = options.snapshots ?? new SnapshotStore;
    this.#summaryFileLimit = options.summaryFileLimit ?? DEFAULT_SUMMARY_FILE_LIMIT;
    this.#evidence = new EvidenceService(this.#runRipgrep, this.#snapshots, options.structure, options.conceptSearch);
  }
  async search(input, cwd, signal, options = {}) {
    validateRawSearchInput(input);
    for (const path of input.paths ?? [])
      validateSearchPath(path, "paths");
    for (const target of input.targets ?? []) {
      if (target && typeof target.path === "string")
        validateSearchPath(target.path, "targets.path");
    }
    const combined = signal ? AbortSignal.any([signal, this.#lifecycle.signal]) : this.#lifecycle.signal;
    const request = this.#search(input, cwd, combined, options);
    this.#active.add(request);
    try {
      const result = await request;
      return input.redact || result.details.redactionRequested ? redactSignalGrepResult(result) : result;
    } finally {
      this.#active.delete(request);
    }
  }
  async#search(input, cwd, signal, options = {}) {
    if (input.cursor !== undefined && (typeof input.cursor !== "string" || input.cursor.trim().length === 0)) {
      throw new CursorError("Invalid cursor. Copy a nonempty cursor from a previous result.");
    }
    const mode = input.mode ?? "auto";
    const contextBudget = selectContextBudget(input, mode, options.contextBudget);
    if (isEvidenceRequest(input))
      return this.#evidence.search(input, cwd, signal);
    if (input.column !== undefined)
      throw new SignalGrepError("column requires semantic navigation");
    if (input.query !== undefined)
      throw new SignalGrepError(DISCOVERY_MODE_REQUIRED_ERROR);
    if (input.maxFilesToParse !== undefined) {
      throw new SignalGrepError("maxFilesToParse is only valid for structural analysis requests");
    }
    if (input.cursor)
      return this.#continue(input, cwd, signal);
    if (input.paths !== undefined) {
      throw new SignalGrepError("paths can only select retained files from a cursor");
    }
    if (input.matchIndex !== undefined) {
      throw new SignalGrepError("matchIndex requires mode=inspect with a cursor");
    }
    if (input.matchIndices !== undefined || input.targets !== undefined) {
      throw new SignalGrepError("matchIndices and targets require mode=inspect");
    }
    if (input.line !== undefined)
      throw new SignalGrepError("line requires mode=inspect");
    const request = normalizeRequest(input);
    let scan = await this.#runRipgrep(request, cwd, signal);
    if (scan.totalMatches === 0 && request.path !== undefined && request.scope !== "strict") {
      const { path: requestedPath, ...projectRequest } = request;
      scan = await this.#runRipgrep({ ...projectRequest, expandedFromPath: requestedPath }, cwd, signal);
    }
    const snapshot = this.#snapshots.create(scan);
    try {
      let result;
      if (snapshot.totalMatches === 0) {
        const details = baseDetails(snapshot, mode);
        result = {
          text: emptyResultText(details.scope ?? searchScope2(snapshot.request)),
          details
        };
      } else if (snapshot.matches.length === 0) {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "summary") {
        result = await this.#summary(snapshot, mode, cwd, signal);
      } else if (mode === "matches") {
        result = await this.#page(snapshot, 0, mode, signal);
      } else {
        try {
          const page = await formatMatchPage(snapshot, 0, signal, matchPageOptions(contextBudget));
          result = input.limit !== undefined || snapshot.snapshotComplete && page.nextOffset === snapshot.matches.length ? this.#pageResult(snapshot, 0, mode, page) : await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
        } catch (error) {
          if (input.limit !== undefined || !(error instanceof MatchPageSoftLimitError))
            throw error;
          result = await this.#summary(snapshot, mode, cwd, signal, 0, contextBudget);
        }
      }
      result = {
        ...result,
        text: `${result.text}${scopeExpansionNote(result.details.scope, result.details.totalMatches)}`
      };
      const budgetedResult = attachContextBudget(result, contextBudget, snapshot.totalMatches);
      return this.#finalize(snapshot, budgetedResult);
    } catch (error) {
      this.#snapshots.delete(snapshot);
      throw error;
    }
  }
  clear() {
    this.#lifecycle.abort();
    this.#lifecycle = new AbortController;
    this.#snapshots.clear();
    this.#evidence.clear();
  }
  async shutdown() {
    this.clear();
    const pending = [...this.#active];
    await Promise.allSettled(pending);
    await this.#evidence.shutdown();
  }
  get snapshotCount() {
    return this.#snapshots.size;
  }
  get storedMatches() {
    return this.#snapshots.storedMatches;
  }
  async#continue(input, cwd, signal) {
    const cursor = input.cursor;
    if (!cursor)
      throw new CursorError("A cursor is required to continue a search");
    const { snapshot, offset, kind, selectionKey } = this.#snapshots.resolve(cursor);
    rejectCursorOnlyOptions(input);
    const mode = input.mode ?? "auto";
    if (mode === "summary") {
      if (input.path !== undefined || input.paths !== undefined) {
        throw new SignalGrepError("path and paths are not valid while paging a file summary");
      }
      if (kind !== "summary") {
        throw new CursorError("A summary cursor is required to continue a file summary.", "E_CURSOR_WRONG_KIND");
      }
      if (offset >= snapshot.fileCounts.size) {
        throw new CursorError("Cursor is already at the end of the file summary.");
      }
      return this.#summary(snapshot, mode, cwd, signal, offset);
    }
    const selection = cursorPathSelection(input, cwd);
    const requestedSelectionKey = selection?.key ?? "all";
    if (kind === "matches" && selectionKey !== requestedSelectionKey) {
      throw new CursorError("A match cursor must continue with the same path selection.", "E_CURSOR_OPTIONS_CONFLICT");
    }
    const pageOffset = kind === "summary" ? 0 : offset;
    const result = await this.#page(snapshot, pageOffset, "matches", signal, selection);
    return this.#finalize(snapshot, result, kind === "summary" || selection !== undefined);
  }
  #finalize(snapshot, result, retainSnapshot = false) {
    if (!result.details.cursor && !retainSnapshot && !this.#reusableSummarySnapshots.has(snapshot)) {
      this.#snapshots.delete(snapshot);
    }
    return result;
  }
  async#summary(snapshot, mode, cwd, signal, offset = 0, budget) {
    this.#reusableSummarySnapshots.add(snapshot);
    const summary = formatSummary(snapshot, this.#summaryFileLimit, offset, budget?.resultTokenBudget);
    const details = baseDetails(snapshot, mode);
    const cursor = snapshot.fileCounts.size > 0 ? this.#snapshots.cursor(snapshot, summary.nextOffset, "summary") : undefined;
    const fileRange = summary.shown > 0 ? `Files ${String(summary.offset + 1)}-${String(summary.nextOffset)} of ${String(snapshot.fileCounts.size)}, ordered by match count.` : "No retained file summaries are available.";
    const omitted = summary.omitted > 0 ? `
\u2026 ${String(summary.omitted)} lower-ranked files remain.` : "";
    const preview = await summarySourcePreviews(snapshot, summary.shownPaths, summary.previewByteBudget, cwd, signal);
    const sampleText = preview.text || summary.previews;
    const indices = preview.text ? preview.indices : summary.sampleIndices;
    const samples = sampleText ? `

Samples: bounded source windows; not relevance-ranked or exhaustive.
${sampleText}` : "";
    const sampleOmissions = `
[Preview limits: at most 5 source files, 2 non-overlapping windows/file, 7 lines/window. File rows and navigation take priority; shown ${preview.text ? preview.windows : summary.previewsShown} previews.]${preview.reasons.length ? `
[${preview.reasons.map((reason) => reason.slice(0, 200)).join("; ")}]` : ""}`;
    const redaction = snapshot.request.redact ? { redact: true } : {};
    const nextRequest = cursor && summary.hasNext ? { cursor, mode: "summary", ...redaction } : undefined;
    const inspectRequest = cursor && indices.length ? {
      mode: "inspect",
      cursor,
      matchIndices: indices.slice(0, MAX_INSPECT_TARGETS),
      ...redaction
    } : undefined;
    const matchesRequest = cursor && snapshot.matches.length > 0 && summary.shownPaths.length ? { cursor, paths: summary.shownPaths.slice(0, 1), ...redaction } : undefined;
    const followUp = cursor ? `

Snapshot cursor="${cursor}".${inspectRequest ? `
Inspect samples: ${JSON.stringify(inspectRequest)}` : ""}${matchesRequest ? `
Retrieve matching lines: ${JSON.stringify(matchesRequest)}` : ""}${nextRequest ? `
Next request: ${JSON.stringify(nextRequest)}` : ""}` : "";
    const text = `${snapshot.totalMatches} matches across ${snapshot.fileCounts.size} files (${completenessNote(snapshot)}).
${fileRange}

${summary.body}${omitted}${samples}${sampleOmissions}${modificationTimeBoundsText(details.scope?.modifiedAfterMs, details.scope?.modifiedBeforeMs)}${followUp}${sourceVerificationNote(details)}`;
    return {
      text,
      details: {
        ...details,
        ...cursor ? { cursor } : {},
        ...nextRequest ? { nextRequest } : {},
        summaryOffset: summary.offset,
        summaryFilesShown: summary.shown,
        summaryFilesOmitted: summary.omitted,
        summaryPreviewsShown: preview.text ? preview.windows : summary.previewsShown,
        summaryPreviewsOmitted: Math.max(0, summary.shown - (preview.text ? new Set(indices.map((index) => snapshot.matches[index - 1]?.displayPath)).size : summary.previewsShown))
      }
    };
  }
  async#page(snapshot, offset, mode, signal, selection) {
    if (offset === snapshot.matches.length) {
      throw new CursorError("Cursor is already at the end of the retained snapshot.");
    }
    const pageOptions = selection ? {
      metadataReserveBytes: 1536 + Buffer.byteLength(JSON.stringify({ paths: selection.labels })),
      include: (match) => selection.absolutePaths.has(match.absolutePath)
    } : {};
    const page = await formatMatchPage(snapshot, offset, signal, pageOptions);
    if (page.returnedMatches === 0 && selection) {
      throw new CursorError("No retained matches exist for the selected paths.");
    }
    const missingPaths = [];
    if (selection) {
      const matchedAbsolutePaths = new Set;
      for (const match of snapshot.matches) {
        if (selection.absolutePaths.has(match.absolutePath)) {
          matchedAbsolutePaths.add(match.absolutePath);
        }
      }
      const selectedAbsolutePaths = [...selection.absolutePaths];
      for (const [index, label] of selection.labels.entries()) {
        const absolutePath = selectedAbsolutePaths[index];
        if (absolutePath !== undefined && !matchedAbsolutePaths.has(absolutePath)) {
          missingPaths.push(label);
        }
      }
    }
    return this.#pageResult(snapshot, offset, mode, page, selection?.labels, missingPaths, selection?.key ?? "all");
  }
  #pageResult(snapshot, offset, mode, page, selectedPaths, selectionMissingPaths = [], selectionKey = "all") {
    if (page.returnedMatches === 0) {
      throw new SignalGrepError("The output budget could not fit a single match");
    }
    const cursor = page.hasNext ? this.#snapshots.cursor(snapshot, page.nextOffset, "matches", selectionKey) : undefined;
    const firstMatch = page.firstMatchIndex ?? offset;
    const lastMatch = page.lastMatchIndex ?? firstMatch;
    const range = `${firstMatch + 1}-${lastMatch + 1}`;
    const selection = selectedPaths ? `; selected ${String(selectedPaths.length)} path(s)` : "";
    const next = cursor ? `

Continue with cursor="${cursor}".
Next request: ${JSON.stringify({ cursor, ...selectedPaths ? { paths: selectedPaths } : {}, ...snapshot.request.redact ? { redact: true } : {} })}` : "";
    const missingSelectionNote = selectionMissingPaths.length > 0 ? `

[${String(selectionMissingPaths.length)} selected path(s) had no retained matches.]` : "";
    const rangeNote = page.hasMatchRanges ? `

[Match columns are 1-based UTF-16 positions${page.hasByteRanges ? "; b ranges use raw UTF-8 bytes" : ""}.]` : "";
    const contextNotes = [];
    if (page.contextChangedFiles.length > 0) {
      contextNotes.push(`Context omitted for ${String(page.contextChangedFiles.length)} changed file(s); refresh the search before relying on surrounding lines.`);
    }
    if (page.contextOmittedFiles.length > 0) {
      contextNotes.push(`Context unavailable for ${String(page.contextOmittedFiles.length)} file(s); retained matching lines are still shown.`);
    }
    const contextNote = contextNotes.length > 0 ? `

[${contextNotes.join(" ")}]` : "";
    const details = baseDetails(snapshot, mode);
    return {
      text: `${page.body}${rangeNote}${contextNote}${missingSelectionNote}

[Matches ${range} of ${snapshot.totalMatches}${selection}; ${completenessNote(snapshot)}.]${modificationTimeBoundsText(details.scope?.modifiedAfterMs, details.scope?.modifiedBeforeMs)}${next}${sourceVerificationNote(details)}`,
      details: {
        ...details,
        returnedMatches: page.returnedMatches,
        ...page.occurrenceRangesOmitted > 0 ? { occurrenceRangesOmitted: page.occurrenceRangesOmitted } : {},
        ...page.occurrenceMatchesTruncated > 0 ? { occurrenceMatchesTruncated: page.occurrenceMatchesTruncated } : {},
        ...cursor ? { cursor } : {},
        ...cursor ? {
          nextRequest: {
            cursor,
            ...selectedPaths ? { paths: selectedPaths } : {},
            ...snapshot.request.redact ? { redact: true } : {}
          }
        } : {},
        ...selectedPaths ? { selectedPaths } : {},
        ...selectionMissingPaths.length > 0 ? { selectionMissingPaths } : {},
        ...page.contextOmittedFiles.length > 0 ? { contextOmittedFiles: page.contextOmittedFiles } : {},
        ...page.contextChangedFiles.length > 0 ? { contextChangedFiles: page.contextChangedFiles } : {}
      }
    };
  }
}

// src/prompt-guidelines.ts
function signalGrepPromptGuidelines(structuredOutput = true) {
  return [
    `Use baoer_signal_grep for content search. Start with pattern and optional path; omit mode and limit to let auto choose a complete small result or a broad summary. Use literal=true for literal code fragments rather than escaping them as regex.`,
    `An omitted path searches the project cwd. Use scope:"strict" for a question restricted to one path; otherwise, if an explicit subpath has zero matches, ordinary and content-analysis searches retry from cwd and return project-wide matches with an expansion notice. Explicit absolute paths and .. traversal can search outside cwd, except protected external system areas and .git internals. Git changes mode remains cwd-scoped.`,
    `For external source navigation, imports/tests/impact use the containing Git repository when detected, otherwise the target file's directory.`,
    `Use sufficient exact-match evidence directly; do not inspect or reread it only to obtain a citation, since returned matches already have path/line numbers. When definitions repeat, follow the relevant imports/callers before choosing the authoritative file.`,
    `Use the file samples in baoer_signal_grep summaries to choose evidence. Reuse the visible cursor with path or paths for matching lines; mode=summary pages the remaining files. Match counts are not relevance scores.`,
    `When source context is missing, use one baoer_signal_grep batch before reading whole files: {mode:"inspect",cursor:"<returned cursor>",matchIndices:[1,2]} or {mode:"inspect",targets:[{path:"src/example.ts",line:42}]}, at most ${String(MAX_INSPECT_TARGETS)} locations. Copy actual returned selectors. Inspection chooses its own bounded window: omit pattern, context, limit, glob, exclude, literal, ignoreCase and hidden.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND. Add within:"function" only together with allOf to restrict that conjunction to one own-implementation JS/TS/TSX function; omit within for ordinary single-pattern searches. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrences.`,
    `Use anyOf:["term1","term2"] when every exact occurrence of 2-64 literals is needed in one version-bound result. It is case-sensitive, reports retained counts per input term, and runs requests above eight terms as bounded parallel chunks. Large term-count inventories have separate termCountsNextRequest pages; copy those requests to retrieve the complete term map.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted evidence. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"outline" with path to see symbols, mode:"imports" with path and a binding symbol or line to follow static named/default ESM links, and mode:"tests" with path for related test candidates. tests supports JS/TS/TSX sources only; Python supports outline but not related-test navigation. Imports/tests accept glob, exclude and hidden to narrow the repository candidate scope; the target source remains admitted. Import links do not prove runtime calls; test candidates do not prove coverage or passing tests.`,
    `Before changing one known JS/TS/TSX symbol, use mode:"impact" with path plus symbol or line to retrieve the exact target, every exact same-spelling candidate, and related-test evidence together. Compiler-confirmed references in verified candidate documents are ranked first; remaining same spelling does not prove binding, and returned tests have not been run. Use references for a dedicated workspace reference inventory.`,
    `Use mode:"files" plus query for unknown filenames and fuzzy paths. Use wholeWord:true for a single-pattern whole-word search. exclude contains file globs, not content negation.`,
    `Use JS/TS modes definitions, references, implementations, callers or callees with path+line+column (1-based UTF-16), or an unambiguous symbol. Returned evidence includes exact positions and executable next requests. The compiler resolves project aliases, package exports and workspace packages; static relationships do not prove runtime dispatch. dependencies/dependents take only a workspace file path.`,
    `Use mode:"structure" plus an ast-grep pattern such as "compare($X, $X)" or "send()" for code shapes across whitespace; no literal/regex or scope options. Use path/glob/exclude to narrow admitted syntax.`,
    `Use mode:"concept" plus a natural-language query when names are unknown. It runs a pinned local multilingual model only after explicit installation; no search downloads weights or sends code to a remote model. Every passage admitted by the source budget is ranked through token-safe windows, and content-addressed embeddings are reused from a bounded local cache. Similarity scores identify source candidates, not proof. File/concept/structure discovery never expands its requested path.`,
    `Use mode:"hybrid" plus query when wording may differ from the source. It always runs exact literal and local concept retrieval, keeps exact evidence first, removes semantic passages that overlap exact evidence, and retains the top three non-overlapping semantic candidates by default. conceptLimit changes only that semantic supplement. Hybrid uses one pageable snapshot and never treats similarity as exact evidence.`,
    `If inspection reports missing source, execute its complete nextRequest with sourceCursor. Never treat a partial source excerpt as the complete implementation.`,
    `If a request is rejected, keep the strongest applicable mode and follow its repair instruction exactly once. Do not paste the error or rejected request into the retry, repeat an unchanged request, or switch to a weaker search because of a fixable argument error. Only an explicit capability-unavailable result permits a bounded alternative, which remains partial and must not be presented as complete.`,
    structuredOutput ? `When status=partial, read details.analysis.coverage to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.` : `When status=partial, read the visible Coverage and bracketed reasons to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`
  ];
}

// node_modules/marked/lib/marked.esm.js
function M() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T = M();
function N(l) {
  T = l;
}
var _ = { exec: () => null };
function E(l) {
  let e = [];
  return (t) => {
    let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
    return s || (s = l(n), e[n] = s), s;
  };
}
function d(l, e = "") {
  let t = typeof l == "string" ? l : l.source, n = { replace: (s, r) => {
    let i2 = typeof r == "string" ? r : r.source;
    return i2 = i2.replace(m.caret, "$1"), t = t.replace(s, i2), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var Te = ((l = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l);
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l) => new RegExp(`^( {0,3}${l})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: E((l) => new RegExp(`^ {0,${l}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: E((l) => new RegExp(`^ {0,${l}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: E((l) => new RegExp(`^ {0,${l}}(?:\`\`\`|~~~)`)), headingBeginRegex: E((l) => new RegExp(`^ {0,${l}}#`)), htmlBeginRegex: E((l) => new RegExp(`^ {0,${l}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: E((l) => new RegExp(`^ {0,${l}}>`)) };
var Oe = /^(?:[ \t]*(?:\n|$))+/;
var we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var B = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var j = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var ae = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Se = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var F = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var $e = /^[^\n]+/;
var U = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var Le = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", U).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var _e = d(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, j).getRegex();
var H = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var K = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var ze = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \t]*)+\\n|$))", "i").replace("comment", K).replace("tag", H).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var le = d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex();
var Me = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", le).getRegex();
var W = { blockquote: Me, code: we, def: Le, fences: ye, heading: Pe, hr: B, html: ze, lheading: ae, list: _e, newline: Oe, paragraph: le, table: _, text: $e };
var se = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}\t)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex();
var Ee = { ...W, lheading: Se, table: se, paragraph: d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex() };
var Ie = { ...W, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", K).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(F).replace("hr", B).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var ue = /^( {2,}|\\)\n(?!\s*$)/;
var Be = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var I = /[\p{P}\p{S}]/u;
var Z = /[\s\p{P}\p{S}]/u;
var X = /[^\s\p{P}\p{S}]/u;
var De = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, Z).getRegex();
var pe = /(?!~)[\p{P}\p{S}]/u;
var qe = /(?!~)[\s\p{P}\p{S}]/u;
var ve = /(?:[^\s\p{P}\p{S}]|~)/u;
var He = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var Ze = d(ce, "u").replace(/punct/g, I).getRegex();
var Ge = d(ce, "u").replace(/punct/g, pe).getRegex();
var he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ne = d(he, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
var Qe = d(he, "gu").replace(/notPunctSpace/g, ve).replace(/punctSpace/g, qe).replace(/punct/g, pe).getRegex();
var je = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
var Fe = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, I).getRegex();
var Ue = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var Ke = d(Ue, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex();
var We = d(/\\(punct)/, "gu").replace(/punct/g, I).getRegex();
var Xe = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Je = d(K).replace("(?:-->|$)", "-->").getRegex();
var Ve = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Je).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var v = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
var Ye = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", v).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var ke = d(/^!?\[(label)\]\[(ref)\]/).replace("label", v).replace("ref", U).getRegex();
var de = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", U).getRegex();
var et = d("reflink|nolink(?!\\()", "g").replace("reflink", ke).replace("nolink", de).getRegex();
var ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var J = { _backpedal: _, anyPunctuation: We, autolink: Xe, blockSkip: He, br: ue, code: Ce, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: Ze, emStrongRDelimAst: Ne, emStrongRDelimUnd: je, escape: Ae, link: Ye, nolink: de, punctuation: De, reflink: ke, reflinkSearch: et, tag: Ve, text: Be, url: _ };
var tt = { ...J, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", v).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", v).getRegex() };
var Q = { ...J, emStrongRDelimAst: Qe, emStrongLDelim: Ge, delLDelim: Fe, delRDelim: Ke, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() };
var nt = { ...Q, br: d(ue).replace("{2,}", "*").getRegex(), text: d(Q.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var D = { normal: W, gfm: Ee, pedantic: Ie };
var A = { normal: J, gfm: Q, breaks: nt, pedantic: tt };
var rt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ge = (l) => rt[l];
function O(l, e) {
  if (e) {
    if (m.escapeTest.test(l))
      return l.replace(m.escapeReplace, ge);
  } else if (m.escapeTestNoEncode.test(l))
    return l.replace(m.escapeReplaceNoEncode, ge);
  return l;
}
function V(l) {
  try {
    l = encodeURI(l).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l;
}
function Y(l, e) {
  let t = l.replace(m.findPipe, (r, i2, o) => {
    let u = false, a = i2;
    for (;--a >= 0 && o[a] === "\\"; )
      u = !u;
    return u ? "|" : " |";
  }), n = t.split(m.splitPipe), s = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e)
    if (n.length > e)
      n.splice(e);
    else
      for (;n.length < e; )
        n.push("");
  for (;s < n.length; s++)
    n[s] = n[s].trim().replace(m.slashPipe, "|");
  return n;
}
function $(l, e, t) {
  let n = l.length;
  if (n === 0)
    return "";
  let s = 0;
  for (;s < n; ) {
    let r = l.charAt(n - s - 1);
    if (r === e && !t)
      s++;
    else if (r !== e && t)
      s++;
    else
      break;
  }
  return l.slice(0, n - s);
}
function ee(l) {
  let e = l.split(`
`), t = e.length - 1;
  for (;t >= 0 && m.blankLine.test(e[t]); )
    t--;
  return e.length - t <= 2 ? l : e.slice(0, t + 1).join(`
`);
}
function fe(l, e) {
  if (l.indexOf(e[1]) === -1)
    return -1;
  let t = 0;
  for (let n = 0;n < l.length; n++)
    if (l[n] === "\\")
      n++;
    else if (l[n] === e[0])
      t++;
    else if (l[n] === e[1] && (t--, t < 0))
      return n;
  return t > 0 ? -2 : -1;
}
function me(l, e = 0) {
  let t = e, n = "";
  for (let s of l)
    if (s === "\t") {
      let r = 4 - t % 4;
      n += " ".repeat(r), t += r;
    } else
      n += s, t++;
  return n;
}
function xe(l, e, t, n, s) {
  let r = e.href, i2 = e.title || null, o = l[1].replace(s.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let u = { type: l[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i2, text: o, tokens: n.inlineTokens(o) };
  return n.state.inLink = false, u;
}
function st(l, e, t) {
  let n = l.match(t.other.indentCodeCompensation);
  if (n === null)
    return e;
  let s = n[1];
  return e.split(`
`).map((r) => {
    let i2 = r.match(t.other.beginningSpace);
    if (i2 === null)
      return r;
    let [o] = i2;
    return o.length >= s.length ? r.slice(s.length) : r;
  }).join(`
`);
}
var w = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0)
      return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = this.options.pedantic ? t[0] : ee(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], s = st(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let s = $(n, "#");
        (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
      }
      return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t)
      return { type: "hr", raw: $(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = $(t[0], `
`).split(`
`), s = "", r = "", i2 = [];
      for (;n.length > 0; ) {
        let o = false, u = [], a;
        for (a = 0;a < n.length; a++)
          if (this.rules.other.blockquoteStart.test(n[a]))
            u.push(n[a]), o = true;
          else if (!o)
            u.push(n[a]);
          else
            break;
        n = n.slice(a);
        let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
        let k = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(p, i2, true), this.lexer.state.top = k, n.length === 0)
          break;
        let h = i2.at(-1);
        if (h?.type === "code")
          break;
        if (h?.type === "blockquote") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
          i2[i2.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
          break;
        } else if (h?.type === "list") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
          i2[i2.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i2.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s, tokens: i2, text: r };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
      let i2 = this.rules.other.listItemRegex(n), o = false;
      for (;e; ) {
        let a = false, c = "", p = "";
        if (!(t = i2.exec(e)) || this.rules.block.hr.test(e))
          break;
        c = t[0], e = e.substring(c.length);
        let k = me(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !k.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, p = k.trimStart()) : R ? f = t[1].length + 1 : (f = k.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = k.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = true), !a) {
          let S = this.rules.other.nextBulletRegex(f), te = this.rules.other.hrRegex(f), ne = this.rules.other.fencesBeginRegex(f), re = this.rules.other.headingBeginRegex(f), be = this.rules.other.htmlBeginRegex(f), Re = this.rules.other.blockquoteBeginRegex(f);
          for (;e; ) {
            let G = e.split(`
`, 1)[0], C;
            if (h = G, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), ne.test(h) || re.test(h) || be.test(h) || Re.test(h) || S.test(h) || te.test(h))
              break;
            if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim())
              p += `
` + C.slice(f);
            else {
              if (R || k.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(k) || re.test(k) || te.test(k))
                break;
              p += `
` + h;
            }
            R = !h.trim(), c += G + `
`, e = e.substring(G.length + 1), k = C.slice(f);
          }
        }
        r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(c) && (o = true)), r.items.push({ type: "list_item", raw: c, task: !!this.options.gfm && this.rules.other.listIsTask.test(p), loose: false, text: p, tokens: [] }), r.raw += c;
      }
      let u = r.items.at(-1);
      if (u)
        u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
      else
        return;
      r.raw = r.raw.trimEnd();
      for (let a of r.items) {
        this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []);
        let c = a.tokens[0];
        if (a.task && (c?.type === "text" || c?.type === "paragraph")) {
          a.text = a.text.replace(this.rules.other.listReplaceTask, ""), c.raw = c.raw.replace(this.rules.other.listReplaceTask, ""), c.text = c.text.replace(this.rules.other.listReplaceTask, "");
          for (let k = this.lexer.inlineQueue.length - 1;k >= 0; k--)
            if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k].src)) {
              this.lexer.inlineQueue[k].src = this.lexer.inlineQueue[k].src.replace(this.rules.other.listReplaceTask, "");
              break;
            }
          let p = this.rules.other.listTaskCheckbox.exec(a.raw);
          if (p) {
            let k = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
            a.checked = k.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = k.raw + a.tokens[0].raw, a.tokens[0].text = k.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(k)) : a.tokens.unshift({ type: "paragraph", raw: k.raw, text: k.raw, tokens: [k] }) : a.tokens.unshift(k);
          }
        } else
          a.task && (a.task = false);
        if (!r.loose) {
          let p = a.tokens.filter((h) => h.type === "space"), k = p.length > 0 && p.some((h) => this.rules.other.anyLine.test(h.raw));
          r.loose = k;
        }
      }
      if (r.loose)
        for (let a of r.items) {
          a.loose = true;
          for (let c of a.tokens)
            c.type === "text" && (c.type = "paragraph");
        }
      return r;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) {
      let n = ee(t[0]);
      return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    }
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2]))
      return;
    let n = Y(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i2 = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
    if (n.length === s.length) {
      for (let o of s)
        this.rules.other.tableAlignRight.test(o) ? i2.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i2.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i2.align.push("left") : i2.align.push(null);
      for (let o = 0;o < n.length; o++)
        i2.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i2.align[o] });
      for (let o of r)
        i2.rows.push(Y(o, i2.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i2.align[a] })));
      return i2;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) {
      let n = t[1].trim();
      return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t)
      return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t)
      return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t)
      return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n))
          return;
        let i2 = $(n.slice(0, -1), "\\");
        if ((n.length - i2.length) % 2 === 0)
          return;
      } else {
        let i2 = fe(t[2], "()");
        if (i2 === -2)
          return;
        if (i2 > -1) {
          let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i2;
          t[2] = t[2].substring(0, i2), t[0] = t[0].substring(0, u).trim(), t[3] = "";
        }
      }
      let s = t[2], r = "";
      if (this.options.pedantic) {
        let i2 = this.rules.other.pedanticHrefTitle.exec(s);
        i2 && (s = i2[1], r = i2[3]);
      } else
        r = t[3] ? t[3].slice(1, -1) : "";
      return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
      if (!r) {
        let i2 = n[0].charAt(0);
        return { type: "text", raw: i2, text: i2 };
      }
      return xe(n, r, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let s = this.rules.inline.emStrongLDelim.exec(e);
    if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric))
      return;
    if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i2 = [...s[0]].length - 1, o, u, a = i2, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (p.lastIndex = 0, t = t.slice(-1 * e.length + i2);(s = p.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o)
          continue;
        if (u = [...o].length, s[3] || s[4]) {
          a += u;
          continue;
        } else if ((s[5] || s[6]) && i2 % 3 && !((i2 + u) % 3)) {
          c += u;
          continue;
        }
        if (a -= u, a > 0)
          continue;
        u = Math.min(u, u + a + c);
        let k = [...s[0]][0].length, h = e.slice(0, i2 + s.index + k + u);
        if (Math.min(i2, u) % 2) {
          let f = h.slice(1, -1);
          return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R = h.slice(2, -2);
        return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t)
      return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let s = this.rules.inline.delLDelim.exec(e);
    if (!s)
      return;
    if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i2 = [...s[0]].length - 1, o, u, a = i2, c = this.rules.inline.delRDelim;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + i2);(s = c.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i2))
          continue;
        if (s[3] || s[4]) {
          a += u;
          continue;
        }
        if (a -= u, a > 0)
          continue;
        u = Math.min(u, u + a);
        let p = [...s[0]][0].length, k = e.slice(0, i2 + s.index + p + u), h = k.slice(i2, -i2);
        return { type: "del", raw: k, text: h, tokens: this.lexer.inlineTokens(h) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, s;
      return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, s;
      if (t[2] === "@")
        n = t[0], s = "mailto:" + n;
      else {
        let r;
        do
          r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (r !== t[0]);
        n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e) {
    this.tokens = [], this.tokens.links = Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w, this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: D.normal, inline: A.normal };
    this.options.pedantic ? (t.block = D.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = D.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: D, inline: A };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0;t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
    let s = 1 / 0;
    for (;e; ) {
      if (e.length < s)
        s = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      let r;
      if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false))
        continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        r.raw.length === 1 && o !== undefined ? o.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i2 = e;
      if (this.options.extensions?.startBlock) {
        let o = 1 / 0, u = e.slice(1), a;
        this.options.extensions.startBlock.forEach((c) => {
          a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
        }), o < 1 / 0 && o >= 0 && (i2 = e.substring(0, o + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i2))) {
        let o = t.at(-1);
        n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i2.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    this.tokenizer.lexer = this;
    let n = e, s = null;
    if (this.tokens.links) {
      let a = Object.keys(this.tokens.links);
      if (a.length > 0)
        for (;(s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null; )
          a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (;(s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null; )
      n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let r;
    for (;(s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null; )
      r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let i2 = false, o = "", u = 1 / 0;
    for (;e; ) {
      if (e.length < u)
        u = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      i2 || (o = ""), i2 = false;
      let a;
      if (this.options.extensions?.inline?.some((p) => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), true) : false))
        continue;
      if (a = this.tokenizer.escape(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.tag(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.link(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(a.raw.length);
        let p = t.at(-1);
        a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
        continue;
      }
      if (a = this.tokenizer.emStrong(e, n, o)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.codespan(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.br(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.del(e, n, o)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.autolink(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (!this.state.inLink && (a = this.tokenizer.url(e))) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      let c = e;
      if (this.options.extensions?.startInline) {
        let p = 1 / 0, k = e.slice(1), h;
        this.options.extensions.startInline.forEach((R) => {
          h = R.call({ lexer: this }, k), typeof h == "number" && h >= 0 && (p = Math.min(p, h));
        }), p < 1 / 0 && p >= 0 && (c = e.substring(0, p + 1));
      }
      if (a = this.tokenizer.inlineText(c)) {
        e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i2 = true;
        let p = t.at(-1);
        p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return t;
  }
  infiniteLoopError(e) {
    let t = "Infinite loop on byte: " + e;
    if (this.options.silent)
      console.error(t);
    else
      throw new Error(t);
  }
};
var y = class {
  options;
  parser;
  constructor(e) {
    this.options = e || T;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
    return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let { ordered: t, start: n } = e, s = "";
    for (let o = 0;o < e.items.length; o++) {
      let u = e.items[o];
      s += this.listitem(u);
    }
    let r = t ? "ol" : "ul", i2 = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + r + i2 + `>
` + s + "</" + r + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let r = 0;r < e.header.length; r++)
      n += this.tablecell(e.header[r]);
    t += this.tablerow({ text: n });
    let s = "";
    for (let r = 0;r < e.rows.length; r++) {
      let i2 = e.rows[r];
      n = "";
      for (let o = 0;o < i2.length; o++)
        n += this.tablecell(i2[o]);
      s += this.tablerow({ text: n });
    }
    return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${O(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let s = this.parser.parseInline(n), r = V(e);
    if (r === null)
      return s;
    e = r;
    let i2 = '<a href="' + e + '"';
    return t && (i2 += ' title="' + O(t) + '"'), i2 += ">" + s + "</a>", i2;
  }
  image({ href: e, title: t, text: n, tokens: s }) {
    s && (n = this.parser.parseInline(s, this.parser.textRenderer));
    let r = V(e);
    if (r === null)
      return O(n);
    e = r;
    let i2 = `<img src="${e}" alt="${O(n)}"`;
    return t && (i2 += ` title="${O(t)}"`), i2 += ">", i2;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : ("escaped" in e) && e.escaped ? e.text : O(e.text);
  }
};
var L = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var b = class l {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || T, this.options.renderer = this.options.renderer || new y, this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L;
  }
  static parse(e, t) {
    return new l(t).parse(e);
  }
  static parseInline(e, t) {
    return new l(t).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let t = "";
    for (let n = 0;n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let i2 = s, o = this.options.extensions.renderers[i2.type].call({ parser: this }, i2);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i2.type)) {
          t += o || "";
          continue;
        }
      }
      let r = s;
      switch (r.type) {
        case "space": {
          t += this.renderer.space(r);
          break;
        }
        case "hr": {
          t += this.renderer.hr(r);
          break;
        }
        case "heading": {
          t += this.renderer.heading(r);
          break;
        }
        case "code": {
          t += this.renderer.code(r);
          break;
        }
        case "table": {
          t += this.renderer.table(r);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(r);
          break;
        }
        case "list": {
          t += this.renderer.list(r);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(r);
          break;
        }
        case "html": {
          t += this.renderer.html(r);
          break;
        }
        case "def": {
          t += this.renderer.def(r);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(r);
          break;
        }
        case "text": {
          t += this.renderer.text(r);
          break;
        }
        default: {
          let i2 = 'Token with "' + r.type + '" type was not found.';
          if (this.options.silent)
            return console.error(i2), "";
          throw new Error(i2);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    this.renderer.parser = this;
    let n = "";
    for (let s = 0;s < e.length; s++) {
      let r = e[s];
      if (this.options.extensions?.renderers?.[r.type]) {
        let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
        if (o !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
          n += o || "";
          continue;
        }
      }
      let i2 = r;
      switch (i2.type) {
        case "escape": {
          n += t.text(i2);
          break;
        }
        case "html": {
          n += t.html(i2);
          break;
        }
        case "link": {
          n += t.link(i2);
          break;
        }
        case "image": {
          n += t.image(i2);
          break;
        }
        case "checkbox": {
          n += t.checkbox(i2);
          break;
        }
        case "strong": {
          n += t.strong(i2);
          break;
        }
        case "em": {
          n += t.em(i2);
          break;
        }
        case "codespan": {
          n += t.codespan(i2);
          break;
        }
        case "br": {
          n += t.br(i2);
          break;
        }
        case "del": {
          n += t.del(i2);
          break;
        }
        case "text": {
          n += t.text(i2);
          break;
        }
        default: {
          let o = 'Token with "' + i2.type + '" type was not found.';
          if (this.options.silent)
            return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return n;
  }
};
var P = class {
  options;
  block;
  constructor(e) {
    this.options = e || T;
  }
  static passThroughHooks = new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer(e = this.block) {
    return e ? x.lex : x.lexInline;
  }
  provideParser(e = this.block) {
    return e ? b.parse : b.parseInline;
  }
};
var q = class {
  defaults = M();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = y;
  TextRenderer = L;
  Lexer = x;
  Tokenizer = w;
  Hooks = P;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let s of e)
      switch (n = n.concat(t.call(this, s)), s.type) {
        case "table": {
          let r = s;
          for (let i2 of r.header)
            n = n.concat(this.walkTokens(i2.tokens, t));
          for (let i2 of r.rows)
            for (let o of i2)
              n = n.concat(this.walkTokens(o.tokens, t));
          break;
        }
        case "list": {
          let r = s;
          n = n.concat(this.walkTokens(r.items, t));
          break;
        }
        default: {
          let r = s;
          this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i2) => {
            let o = r[i2].flat(1 / 0);
            n = n.concat(this.walkTokens(o, t));
          }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
        }
      }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let s = { ...n };
      if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
        if (!r.name)
          throw new Error("extension name required");
        if ("renderer" in r) {
          let i2 = t.renderers[r.name];
          i2 ? t.renderers[r.name] = function(...o) {
            let u = r.renderer.apply(this, o);
            return u === false && (u = i2.apply(this, o)), u;
          } : t.renderers[r.name] = r.renderer;
        }
        if ("tokenizer" in r) {
          if (!r.level || r.level !== "block" && r.level !== "inline")
            throw new Error("extension level must be 'block' or 'inline'");
          let i2 = t[r.level];
          i2 ? i2.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
        }
        "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
      }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new y(this.defaults);
        for (let i2 in n.renderer) {
          if (!(i2 in r))
            throw new Error(`renderer '${i2}' does not exist`);
          if (["options", "parser"].includes(i2))
            continue;
          let o = i2, u = n.renderer[o], a = r[o];
          r[o] = (...c) => {
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p || "";
          };
        }
        s.renderer = r;
      }
      if (n.tokenizer) {
        let r = this.defaults.tokenizer || new w(this.defaults);
        for (let i2 in n.tokenizer) {
          if (!(i2 in r))
            throw new Error(`tokenizer '${i2}' does not exist`);
          if (["options", "rules", "lexer"].includes(i2))
            continue;
          let o = i2, u = n.tokenizer[o], a = r[o];
          r[o] = (...c) => {
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p;
          };
        }
        s.tokenizer = r;
      }
      if (n.hooks) {
        let r = this.defaults.hooks || new P;
        for (let i2 in n.hooks) {
          if (!(i2 in r))
            throw new Error(`hook '${i2}' does not exist`);
          if (["options", "block"].includes(i2))
            continue;
          let o = i2, u = n.hooks[o], a = r[o];
          P.passThroughHooks.has(i2) ? r[o] = (c) => {
            if (this.defaults.async && P.passThroughHooksRespectAsync.has(i2))
              return (async () => {
                let k = await u.call(r, c);
                return a.call(r, k);
              })();
            let p = u.call(r, c);
            return a.call(r, p);
          } : r[o] = (...c) => {
            if (this.defaults.async)
              return (async () => {
                let k = await u.apply(r, c);
                return k === false && (k = await a.apply(r, c)), k;
              })();
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p;
          };
        }
        s.hooks = r;
      }
      if (n.walkTokens) {
        let r = this.defaults.walkTokens, i2 = n.walkTokens;
        s.walkTokens = function(o) {
          let u = [];
          return u.push(i2.call(this, o)), r && (u = u.concat(r.call(this, o))), u;
        };
      }
      this.defaults = { ...this.defaults, ...s };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, s) => {
      let r = { ...s }, i2 = { ...this.defaults, ...r }, o = this.onError(!!i2.silent, !!i2.async);
      if (this.defaults.async === true && r.async === false)
        return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null)
        return o(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string")
        return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (i2.hooks && (i2.hooks.options = i2, i2.hooks.block = e), i2.async)
        return (async () => {
          let u = i2.hooks ? await i2.hooks.preprocess(n) : n, c = await (i2.hooks ? await i2.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i2), p = i2.hooks ? await i2.hooks.processAllTokens(c) : c;
          i2.walkTokens && await Promise.all(this.walkTokens(p, i2.walkTokens));
          let h = await (i2.hooks ? await i2.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i2);
          return i2.hooks ? await i2.hooks.postprocess(h) : h;
        })().catch(o);
      try {
        i2.hooks && (n = i2.hooks.preprocess(n));
        let a = (i2.hooks ? i2.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i2);
        i2.hooks && (a = i2.hooks.processAllTokens(a)), i2.walkTokens && this.walkTokens(a, i2.walkTokens);
        let p = (i2.hooks ? i2.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i2);
        return i2.hooks && (p = i2.hooks.postprocess(p)), p;
      } catch (u) {
        return o(u);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(s) : s;
      }
      if (t)
        return Promise.reject(n);
      throw n;
    };
  }
};
var z = new q;
function g(l, e) {
  return z.parse(l, e);
}
g.options = g.setOptions = function(l) {
  return z.setOptions(l), g.defaults = z.defaults, N(g.defaults), g;
};
g.getDefaults = M;
g.defaults = T;
g.use = function(...l) {
  return z.use(...l), g.defaults = z.defaults, N(g.defaults), g;
};
g.walkTokens = function(l, e) {
  return z.walkTokens(l, e);
};
g.parseInline = z.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = L;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
var Ft = g.options;
var Ut = g.setOptions;
var Kt = g.use;
var Wt = g.walkTokens;
var Xt = g.parseInline;
var Vt = b.parse;
var Yt = x.lex;
// node_modules/@earendil-works/pi-tui/dist/autocomplete.js
var PATH_DELIMITERS = new Set([" ", "\t", '"', "'", "="]);
// node_modules/get-east-asian-width/lookup-data.js
var ambiguousMinimalCodePoint = 161;
var ambiguousMaximumCodePoint = 1114109;
var ambiguousRanges = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
var fullwidthMinimalCodePoint = 12288;
var fullwidthMaximumCodePoint = 65510;
var fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
var wideMinimalCodePoint = 4352;
var wideMaximumCodePoint = 262141;
var wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784, 131072, 196605, 196608, 262141];

// node_modules/get-east-asian-width/utilities.js
var isInRange = (ranges, codePoint) => {
  let low = 0;
  let high = Math.floor(ranges.length / 2) - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const i2 = mid * 2;
    if (codePoint < ranges[i2]) {
      high = mid - 1;
    } else if (codePoint > ranges[i2 + 1]) {
      low = mid + 1;
    } else {
      return true;
    }
  }
  return false;
};

// node_modules/get-east-asian-width/lookup.js
var commonCjkCodePoint = 19968;
var [wideFastPathStart, wideFastPathEnd] = /* @__PURE__ */ findWideFastPathRange(wideRanges);
function findWideFastPathRange(ranges) {
  let fastPathStart = ranges[0];
  let fastPathEnd = ranges[1];
  for (let index = 0;index < ranges.length; index += 2) {
    const start2 = ranges[index];
    const end = ranges[index + 1];
    if (commonCjkCodePoint >= start2 && commonCjkCodePoint <= end) {
      return [start2, end];
    }
    if (end - start2 > fastPathEnd - fastPathStart) {
      fastPathStart = start2;
      fastPathEnd = end;
    }
  }
  return [fastPathStart, fastPathEnd];
}
var isAmbiguous = (codePoint) => {
  if (codePoint < ambiguousMinimalCodePoint || codePoint > ambiguousMaximumCodePoint) {
    return false;
  }
  return isInRange(ambiguousRanges, codePoint);
};
var isFullWidth = (codePoint) => {
  if (codePoint < fullwidthMinimalCodePoint || codePoint > fullwidthMaximumCodePoint) {
    return false;
  }
  return isInRange(fullwidthRanges, codePoint);
};
var isWide = (codePoint) => {
  if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) {
    return true;
  }
  if (codePoint < wideMinimalCodePoint || codePoint > wideMaximumCodePoint) {
    return false;
  }
  return isInRange(wideRanges, codePoint);
};

// node_modules/get-east-asian-width/index.js
function validate(codePoint) {
  if (!Number.isSafeInteger(codePoint)) {
    throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
  }
}
function eastAsianWidth(codePoint, { ambiguousAsWide = false } = {}) {
  validate(codePoint);
  if (isFullWidth(codePoint) || isWide(codePoint) || ambiguousAsWide && isAmbiguous(codePoint)) {
    return 2;
  }
  return 1;
}

// node_modules/@earendil-works/pi-tui/dist/utils.js
var graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
var wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
function getGraphemeSegmenter() {
  return graphemeSegmenter;
}
function getWordSegmenter() {
  return wordSegmenter;
}
function couldBeEmoji(segment) {
  const cp = segment.codePointAt(0);
  return cp >= 126976 && cp <= 130047 || cp >= 8960 && cp <= 9215 || cp >= 9728 && cp <= 10175 || cp >= 11088 && cp <= 11093 || segment.includes("\uFE0F") || segment.length > 2;
}
var zeroWidthRegex = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v;
var leadingNonPrintingRegex = /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;
var nonPrintingCharRegex = /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Format}|\p{Mark}|\p{Surrogate})$/v;
var markCharRegex = /^\p{Mark}$/v;
var terminalSpacingMarkRegex = /^(?:[\p{Spacing_Mark}--[\u1734\u302E\u302F]]|[\u065F\u0F7F\u102B\u102C\u1031\u1033-\u1035\u1038\u103A-\u103E])+$/v;
var rgiEmojiRegex = /^\p{RGI_Emoji}$/v;
var WIDTH_CACHE_SIZE = 512;
var widthCache = new Map;
var cjkBreakRegex = /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u;
function isPrintableAscii(str) {
  for (let i2 = 0;i2 < str.length; i2++) {
    const code = str.charCodeAt(i2);
    if (code < 32 || code > 126) {
      return false;
    }
  }
  return true;
}
function truncateFragmentToWidth(text, maxWidth) {
  if (maxWidth <= 0 || text.length === 0) {
    return { text: "", width: 0 };
  }
  if (isPrintableAscii(text)) {
    const clipped = text.slice(0, maxWidth);
    return { text: clipped, width: clipped.length };
  }
  const hasAnsi = text.includes("\x1B");
  const hasTabs = text.includes("\t");
  if (!hasAnsi && !hasTabs) {
    let result = "";
    let width = 0;
    for (const { segment } of graphemeSegmenter.segment(text)) {
      const w = graphemeWidth(segment);
      if (width + w > maxWidth) {
        break;
      }
      result += segment;
      width += w;
    }
    return { text: result, width };
  }
  let result = "";
  let width = 0;
  let i2 = 0;
  let pendingAnsi = "";
  while (i2 < text.length) {
    const ansi = extractAnsiCode(text, i2);
    if (ansi) {
      pendingAnsi += ansi.code;
      i2 += ansi.length;
      continue;
    }
    if (text[i2] === "\t") {
      if (width + 3 > maxWidth) {
        break;
      }
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += "\t";
      width += 3;
      i2++;
      continue;
    }
    let end = i2;
    while (end < text.length && text[end] !== "\t") {
      const nextAnsi = extractAnsiCode(text, end);
      if (nextAnsi) {
        break;
      }
      end++;
    }
    for (const { segment } of graphemeSegmenter.segment(text.slice(i2, end))) {
      const w = graphemeWidth(segment);
      if (width + w > maxWidth) {
        return { text: result, width };
      }
      if (pendingAnsi) {
        result += pendingAnsi;
        pendingAnsi = "";
      }
      result += segment;
      width += w;
    }
    i2 = end;
  }
  return { text: result, width };
}
function finalizeTruncatedResult(prefix, prefixWidth, ellipsis, ellipsisWidth, maxWidth, pad) {
  const reset = "\x1B[0m";
  const hyperlinkClose = getActiveOsc8Close(prefix);
  const visibleWidth = prefixWidth + ellipsisWidth;
  let result;
  if (ellipsis.length > 0) {
    result = `${prefix}${hyperlinkClose}${reset}${ellipsis}${reset}`;
  } else {
    result = `${prefix}${hyperlinkClose}${reset}`;
  }
  return pad ? result + " ".repeat(Math.max(0, maxWidth - visibleWidth)) : result;
}
function graphemeWidth(segment) {
  if (segment === "\t") {
    return 3;
  }
  if (terminalSpacingMarkRegex.test(segment)) {
    return [...segment].length;
  }
  if (zeroWidthRegex.test(segment)) {
    return 0;
  }
  if (couldBeEmoji(segment) && rgiEmojiRegex.test(segment)) {
    return 2;
  }
  const base = segment.replace(leadingNonPrintingRegex, "");
  const cp = base.codePointAt(0);
  if (cp === undefined) {
    return 0;
  }
  if (cp >= 127462 && cp <= 127487) {
    return 2;
  }
  let width = eastAsianWidth(cp);
  let followsMark = false;
  const chars = [...base];
  for (const char of chars.slice(1)) {
    if (terminalSpacingMarkRegex.test(char)) {
      width += 1;
      followsMark = false;
    } else if (markCharRegex.test(char)) {
      followsMark = true;
    } else if (!nonPrintingCharRegex.test(char)) {
      const c = char.codePointAt(0);
      if (followsMark || c >= 65280 && c <= 65519) {
        width += eastAsianWidth(c);
      } else if (c === 3635 || c === 3763) {
        width += 1;
      }
      followsMark = false;
    }
  }
  return width;
}
function visibleWidth(str) {
  if (str.length === 0) {
    return 0;
  }
  if (isPrintableAscii(str)) {
    return str.length;
  }
  const cached = widthCache.get(str);
  if (cached !== undefined) {
    return cached;
  }
  let clean = str;
  if (str.includes("\t")) {
    clean = clean.replace(/\t/g, "   ");
  }
  if (clean.includes("\x1B")) {
    let stripped = "";
    let i2 = 0;
    while (i2 < clean.length) {
      const ansi = extractAnsiCode(clean, i2);
      if (ansi) {
        i2 += ansi.length;
        continue;
      }
      stripped += clean[i2];
      i2++;
    }
    clean = stripped;
  }
  let width = 0;
  for (const { segment } of graphemeSegmenter.segment(clean)) {
    width += graphemeWidth(segment);
  }
  if (widthCache.size >= WIDTH_CACHE_SIZE) {
    const firstKey = widthCache.keys().next().value;
    if (firstKey !== undefined) {
      widthCache.delete(firstKey);
    }
  }
  widthCache.set(str, width);
  return width;
}
function extractAnsiCode(str, pos) {
  if (pos >= str.length || str[pos] !== "\x1B")
    return null;
  const next = str[pos + 1];
  if (next === "[") {
    let j = pos + 2;
    while (j < str.length && !/[mGKHJ]/.test(str[j]))
      j++;
    if (j < str.length)
      return { code: str.substring(pos, j + 1), length: j + 1 - pos };
    return null;
  }
  if (next === "]") {
    let j = pos + 2;
    while (j < str.length) {
      if (str[j] === "\x07")
        return { code: str.substring(pos, j + 1), length: j + 1 - pos };
      if (str[j] === "\x1B" && str[j + 1] === "\\")
        return { code: str.substring(pos, j + 2), length: j + 2 - pos };
      j++;
    }
    return null;
  }
  if (next === "_") {
    let j = pos + 2;
    while (j < str.length) {
      if (str[j] === "\x07")
        return { code: str.substring(pos, j + 1), length: j + 1 - pos };
      if (str[j] === "\x1B" && str[j + 1] === "\\")
        return { code: str.substring(pos, j + 2), length: j + 2 - pos };
      j++;
    }
    return null;
  }
  return null;
}
function parseOsc8Hyperlink(ansiCode) {
  if (!ansiCode.startsWith("\x1B]8;")) {
    return;
  }
  const terminator = ansiCode.endsWith("\x07") ? "\x07" : "\x1B\\";
  const body2 = ansiCode.slice(4, terminator === "\x07" ? -1 : -2);
  const separatorIndex = body2.indexOf(";");
  if (separatorIndex === -1) {
    return;
  }
  const params = body2.slice(0, separatorIndex);
  const url = body2.slice(separatorIndex + 1);
  if (!url) {
    return null;
  }
  return { params, url, terminator };
}
function formatOsc8Hyperlink(hyperlink) {
  return `\x1B]8;${hyperlink.params};${hyperlink.url}${hyperlink.terminator}`;
}
function formatOsc8Close(terminator) {
  return `\x1B]8;;${terminator}`;
}
function getActiveOsc8Close(prefix) {
  if (!prefix.includes("\x1B]8;")) {
    return "";
  }
  let activeHyperlink = null;
  let i2 = 0;
  while (i2 < prefix.length) {
    const ansi = extractAnsiCode(prefix, i2);
    if (ansi) {
      const hyperlink = parseOsc8Hyperlink(ansi.code);
      if (hyperlink !== undefined) {
        activeHyperlink = hyperlink;
      }
      i2 += ansi.length;
    } else {
      i2++;
    }
  }
  return activeHyperlink ? formatOsc8Close(activeHyperlink.terminator) : "";
}

class AnsiCodeTracker {
  bold = false;
  dim = false;
  italic = false;
  underline = false;
  blink = false;
  inverse = false;
  hidden = false;
  strikethrough = false;
  fgColor = null;
  bgColor = null;
  activeHyperlink = null;
  process(ansiCode) {
    const hyperlink = parseOsc8Hyperlink(ansiCode);
    if (hyperlink !== undefined) {
      this.activeHyperlink = hyperlink;
      return;
    }
    if (!ansiCode.endsWith("m")) {
      return;
    }
    const match = ansiCode.match(/\x1b\[([\d;]*)m/);
    if (!match)
      return;
    const params = match[1];
    if (params === "" || params === "0") {
      this.reset();
      return;
    }
    const parts2 = params.split(";");
    let i2 = 0;
    while (i2 < parts2.length) {
      const code = Number.parseInt(parts2[i2], 10);
      if (code === 38 || code === 48) {
        if (parts2[i2 + 1] === "5" && parts2[i2 + 2] !== undefined) {
          const colorCode = `${parts2[i2]};${parts2[i2 + 1]};${parts2[i2 + 2]}`;
          if (code === 38) {
            this.fgColor = colorCode;
          } else {
            this.bgColor = colorCode;
          }
          i2 += 3;
          continue;
        } else if (parts2[i2 + 1] === "2" && parts2[i2 + 4] !== undefined) {
          const colorCode = `${parts2[i2]};${parts2[i2 + 1]};${parts2[i2 + 2]};${parts2[i2 + 3]};${parts2[i2 + 4]}`;
          if (code === 38) {
            this.fgColor = colorCode;
          } else {
            this.bgColor = colorCode;
          }
          i2 += 5;
          continue;
        }
      }
      switch (code) {
        case 0:
          this.reset();
          break;
        case 1:
          this.bold = true;
          break;
        case 2:
          this.dim = true;
          break;
        case 3:
          this.italic = true;
          break;
        case 4:
          this.underline = true;
          break;
        case 5:
          this.blink = true;
          break;
        case 7:
          this.inverse = true;
          break;
        case 8:
          this.hidden = true;
          break;
        case 9:
          this.strikethrough = true;
          break;
        case 21:
          this.bold = false;
          break;
        case 22:
          this.bold = false;
          this.dim = false;
          break;
        case 23:
          this.italic = false;
          break;
        case 24:
          this.underline = false;
          break;
        case 25:
          this.blink = false;
          break;
        case 27:
          this.inverse = false;
          break;
        case 28:
          this.hidden = false;
          break;
        case 29:
          this.strikethrough = false;
          break;
        case 39:
          this.fgColor = null;
          break;
        case 49:
          this.bgColor = null;
          break;
        default:
          if (code >= 30 && code <= 37 || code >= 90 && code <= 97) {
            this.fgColor = String(code);
          } else if (code >= 40 && code <= 47 || code >= 100 && code <= 107) {
            this.bgColor = String(code);
          }
          break;
      }
      i2++;
    }
  }
  reset() {
    this.bold = false;
    this.dim = false;
    this.italic = false;
    this.underline = false;
    this.blink = false;
    this.inverse = false;
    this.hidden = false;
    this.strikethrough = false;
    this.fgColor = null;
    this.bgColor = null;
  }
  clear() {
    this.reset();
    this.activeHyperlink = null;
  }
  getActiveCodes() {
    const codes = [];
    if (this.bold)
      codes.push("1");
    if (this.dim)
      codes.push("2");
    if (this.italic)
      codes.push("3");
    if (this.underline)
      codes.push("4");
    if (this.blink)
      codes.push("5");
    if (this.inverse)
      codes.push("7");
    if (this.hidden)
      codes.push("8");
    if (this.strikethrough)
      codes.push("9");
    if (this.fgColor)
      codes.push(this.fgColor);
    if (this.bgColor)
      codes.push(this.bgColor);
    let result = codes.length > 0 ? `\x1B[${codes.join(";")}m` : "";
    if (this.activeHyperlink) {
      result += formatOsc8Hyperlink(this.activeHyperlink);
    }
    return result;
  }
  hasActiveCodes() {
    return this.bold || this.dim || this.italic || this.underline || this.blink || this.inverse || this.hidden || this.strikethrough || this.fgColor !== null || this.bgColor !== null || this.activeHyperlink !== null;
  }
  getLineEndReset() {
    let result = "";
    if (this.underline) {
      result += "\x1B[24m";
    }
    if (this.activeHyperlink) {
      result += formatOsc8Close(this.activeHyperlink.terminator);
    }
    return result;
  }
}
function updateTrackerFromText(text, tracker) {
  let i2 = 0;
  while (i2 < text.length) {
    const ansiResult = extractAnsiCode(text, i2);
    if (ansiResult) {
      tracker.process(ansiResult.code);
      i2 += ansiResult.length;
    } else {
      i2++;
    }
  }
}
function splitIntoTokensWithAnsi(text) {
  const tokens = [];
  let current = "";
  let pendingAnsi = "";
  let currentKind = null;
  let i2 = 0;
  const flushCurrent = () => {
    if (!current) {
      return;
    }
    tokens.push(current);
    current = "";
    currentKind = null;
  };
  while (i2 < text.length) {
    const ansiResult = extractAnsiCode(text, i2);
    if (ansiResult) {
      pendingAnsi += ansiResult.code;
      i2 += ansiResult.length;
      continue;
    }
    let end = i2;
    while (end < text.length && !extractAnsiCode(text, end)) {
      end++;
    }
    for (const { segment } of graphemeSegmenter.segment(text.slice(i2, end))) {
      const segmentIsSpace = segment === " ";
      if (!segmentIsSpace && cjkBreakRegex.test(segment)) {
        flushCurrent();
        const token = pendingAnsi + segment;
        pendingAnsi = "";
        tokens.push(token);
        continue;
      }
      const segmentKind = segmentIsSpace ? "space" : "word";
      if (current && currentKind !== segmentKind) {
        flushCurrent();
      }
      if (pendingAnsi) {
        current += pendingAnsi;
        pendingAnsi = "";
      }
      currentKind = segmentKind;
      current += segment;
    }
    i2 = end;
  }
  if (pendingAnsi) {
    if (current) {
      current += pendingAnsi;
    } else if (tokens.length > 0) {
      tokens[tokens.length - 1] += pendingAnsi;
    } else {
      current = pendingAnsi;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
function wrapTextWithAnsi(text, width) {
  if (!text) {
    return [""];
  }
  const inputLines = text.split(/\r\n|\r|\n/);
  const result = [];
  const tracker = new AnsiCodeTracker;
  for (const inputLine of inputLines) {
    const prefix = result.length > 0 ? tracker.getActiveCodes() : "";
    const wrappedLines = wrapSingleLine(prefix + inputLine, width);
    for (const wrappedLine of wrappedLines) {
      result.push(wrappedLine);
    }
    updateTrackerFromText(inputLine, tracker);
  }
  return result.length > 0 ? result : [""];
}
function wrapSingleLine(line, width) {
  if (!line) {
    return [""];
  }
  const visibleLength = visibleWidth(line);
  if (visibleLength <= width) {
    return [line];
  }
  const wrapped = [];
  const tracker = new AnsiCodeTracker;
  const tokens = splitIntoTokensWithAnsi(line);
  let currentLine = "";
  let currentVisibleLength = 0;
  for (const token of tokens) {
    const tokenVisibleLength = visibleWidth(token);
    const isWhitespace = token.trim() === "";
    if (tokenVisibleLength > width && !isWhitespace) {
      if (currentLine) {
        const lineEndReset = tracker.getLineEndReset();
        if (lineEndReset) {
          currentLine += lineEndReset;
        }
        wrapped.push(currentLine);
        currentLine = "";
        currentVisibleLength = 0;
      }
      const broken = breakLongWord(token, width, tracker);
      for (let i2 = 0;i2 < broken.length - 1; i2++) {
        wrapped.push(broken[i2]);
      }
      currentLine = broken[broken.length - 1];
      currentVisibleLength = visibleWidth(currentLine);
      continue;
    }
    const totalNeeded = currentVisibleLength + tokenVisibleLength;
    if (totalNeeded > width && currentVisibleLength > 0) {
      let lineToWrap = currentLine.trimEnd();
      const lineEndReset = tracker.getLineEndReset();
      if (lineEndReset) {
        lineToWrap += lineEndReset;
      }
      wrapped.push(lineToWrap);
      if (isWhitespace) {
        currentLine = tracker.getActiveCodes();
        currentVisibleLength = 0;
      } else {
        currentLine = tracker.getActiveCodes() + token;
        currentVisibleLength = tokenVisibleLength;
      }
    } else {
      currentLine += token;
      currentVisibleLength += tokenVisibleLength;
    }
    updateTrackerFromText(token, tracker);
  }
  if (currentLine) {
    wrapped.push(currentLine);
  }
  return wrapped.length > 0 ? wrapped.map((line) => line.trimEnd()) : [""];
}
function breakLongWord(word, width, tracker) {
  const lines = [];
  let currentLine = tracker.getActiveCodes();
  let currentWidth = 0;
  let i2 = 0;
  const segments = [];
  while (i2 < word.length) {
    const ansiResult = extractAnsiCode(word, i2);
    if (ansiResult) {
      segments.push({ type: "ansi", value: ansiResult.code });
      i2 += ansiResult.length;
    } else {
      let end = i2;
      while (end < word.length) {
        const nextAnsi = extractAnsiCode(word, end);
        if (nextAnsi)
          break;
        end++;
      }
      const textPortion = word.slice(i2, end);
      for (const seg of graphemeSegmenter.segment(textPortion)) {
        segments.push({ type: "grapheme", value: seg.segment });
      }
      i2 = end;
    }
  }
  for (const seg of segments) {
    if (seg.type === "ansi") {
      currentLine += seg.value;
      tracker.process(seg.value);
      continue;
    }
    const grapheme = seg.value;
    if (!grapheme)
      continue;
    const graphemeWidth = visibleWidth(grapheme);
    if (currentWidth + graphemeWidth > width) {
      const lineEndReset = tracker.getLineEndReset();
      if (lineEndReset) {
        currentLine += lineEndReset;
      }
      lines.push(currentLine);
      currentLine = tracker.getActiveCodes();
      currentWidth = 0;
    }
    currentLine += grapheme;
    currentWidth += graphemeWidth;
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [""];
}
function applyBackgroundToLine(line, width, bgFn) {
  const visibleLen = visibleWidth(line);
  const paddingNeeded = Math.max(0, width - visibleLen);
  const padding = " ".repeat(paddingNeeded);
  const withPadding = line + padding;
  return bgFn(withPadding);
}
function truncateToWidth(text, maxWidth, ellipsis = "...", pad = false) {
  if (maxWidth <= 0) {
    return "";
  }
  if (text.length === 0) {
    return pad ? " ".repeat(maxWidth) : "";
  }
  const ellipsisWidth = visibleWidth(ellipsis);
  if (ellipsisWidth >= maxWidth) {
    const textWidth = visibleWidth(text);
    if (textWidth <= maxWidth) {
      return pad ? text + " ".repeat(maxWidth - textWidth) : text;
    }
    const clippedEllipsis = truncateFragmentToWidth(ellipsis, maxWidth);
    if (clippedEllipsis.width === 0) {
      return pad ? " ".repeat(maxWidth) : "";
    }
    return finalizeTruncatedResult("", 0, clippedEllipsis.text, clippedEllipsis.width, maxWidth, pad);
  }
  if (isPrintableAscii(text)) {
    if (text.length <= maxWidth) {
      return pad ? text + " ".repeat(maxWidth - text.length) : text;
    }
    const targetWidth = maxWidth - ellipsisWidth;
    return finalizeTruncatedResult(text.slice(0, targetWidth), targetWidth, ellipsis, ellipsisWidth, maxWidth, pad);
  }
  const targetWidth = maxWidth - ellipsisWidth;
  let result = "";
  let pendingAnsi = "";
  let visibleSoFar = 0;
  let keptWidth = 0;
  let keepContiguousPrefix = true;
  let overflowed = false;
  let exhaustedInput = false;
  const hasAnsi = text.includes("\x1B");
  const hasTabs = text.includes("\t");
  if (!hasAnsi && !hasTabs) {
    for (const { segment } of graphemeSegmenter.segment(text)) {
      const width = graphemeWidth(segment);
      if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
        result += segment;
        keptWidth += width;
      } else {
        keepContiguousPrefix = false;
      }
      visibleSoFar += width;
      if (visibleSoFar > maxWidth) {
        overflowed = true;
        break;
      }
    }
    exhaustedInput = !overflowed;
  } else {
    let i2 = 0;
    while (i2 < text.length) {
      const ansi = extractAnsiCode(text, i2);
      if (ansi) {
        pendingAnsi += ansi.code;
        i2 += ansi.length;
        continue;
      }
      if (text[i2] === "\t") {
        if (keepContiguousPrefix && keptWidth + 3 <= targetWidth) {
          if (pendingAnsi) {
            result += pendingAnsi;
            pendingAnsi = "";
          }
          result += "\t";
          keptWidth += 3;
        } else {
          keepContiguousPrefix = false;
          pendingAnsi = "";
        }
        visibleSoFar += 3;
        if (visibleSoFar > maxWidth) {
          overflowed = true;
          break;
        }
        i2++;
        continue;
      }
      let end = i2;
      while (end < text.length && text[end] !== "\t") {
        const nextAnsi = extractAnsiCode(text, end);
        if (nextAnsi) {
          break;
        }
        end++;
      }
      for (const { segment } of graphemeSegmenter.segment(text.slice(i2, end))) {
        const width = graphemeWidth(segment);
        if (keepContiguousPrefix && keptWidth + width <= targetWidth) {
          if (pendingAnsi) {
            result += pendingAnsi;
            pendingAnsi = "";
          }
          result += segment;
          keptWidth += width;
        } else {
          keepContiguousPrefix = false;
          pendingAnsi = "";
        }
        visibleSoFar += width;
        if (visibleSoFar > maxWidth) {
          overflowed = true;
          break;
        }
      }
      if (overflowed) {
        break;
      }
      i2 = end;
    }
    exhaustedInput = i2 >= text.length;
  }
  if (!overflowed && exhaustedInput) {
    return pad ? text + " ".repeat(Math.max(0, maxWidth - visibleSoFar)) : text;
  }
  return finalizeTruncatedResult(result, keptWidth, ellipsis, ellipsisWidth, maxWidth, pad);
}
var pooledStyleTracker = new AnsiCodeTracker;
// node_modules/@earendil-works/pi-tui/dist/keys.js
var SYMBOL_KEYS = new Set([
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "+",
  "|",
  "~",
  "{",
  "}",
  ":",
  "<",
  ">",
  "?"
]);
var MODIFIERS = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8
};
var LOCK_MASK = 64 + 128;
var ARROW_CODEPOINTS = {
  up: -1,
  down: -2,
  right: -3,
  left: -4
};
var FUNCTIONAL_CODEPOINTS = {
  delete: -10,
  insert: -11,
  pageUp: -12,
  pageDown: -13,
  home: -14,
  end: -15
};
var KITTY_FUNCTIONAL_KEY_EQUIVALENTS = new Map([
  [57399, 48],
  [57400, 49],
  [57401, 50],
  [57402, 51],
  [57403, 52],
  [57404, 53],
  [57405, 54],
  [57406, 55],
  [57407, 56],
  [57408, 57],
  [57409, 46],
  [57410, 47],
  [57411, 42],
  [57412, 45],
  [57413, 43],
  [57415, 61],
  [57416, 44],
  [57417, ARROW_CODEPOINTS.left],
  [57418, ARROW_CODEPOINTS.right],
  [57419, ARROW_CODEPOINTS.up],
  [57420, ARROW_CODEPOINTS.down],
  [57421, FUNCTIONAL_CODEPOINTS.pageUp],
  [57422, FUNCTIONAL_CODEPOINTS.pageDown],
  [57423, FUNCTIONAL_CODEPOINTS.home],
  [57424, FUNCTIONAL_CODEPOINTS.end],
  [57425, FUNCTIONAL_CODEPOINTS.insert],
  [57426, FUNCTIONAL_CODEPOINTS.delete]
]);
var KITTY_PRINTABLE_ALLOWED_MODIFIERS = MODIFIERS.shift | LOCK_MASK;

// node_modules/@earendil-works/pi-tui/dist/components/text.js
class Text {
  text;
  paddingX;
  paddingY;
  customBgFn;
  cachedText;
  cachedWidth;
  cachedLines;
  constructor(text = "", paddingX = 1, paddingY = 1, customBgFn) {
    this.text = text;
    this.paddingX = paddingX;
    this.paddingY = paddingY;
    this.customBgFn = customBgFn;
  }
  setText(text) {
    this.text = text;
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
  setCustomBgFn(customBgFn) {
    this.customBgFn = customBgFn;
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
  invalidate() {
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
  render(width) {
    if (this.cachedLines && this.cachedText === this.text && this.cachedWidth === width) {
      return this.cachedLines;
    }
    if (!this.text || this.text.trim() === "") {
      const result = [];
      this.cachedText = this.text;
      this.cachedWidth = width;
      this.cachedLines = result;
      return result;
    }
    const normalizedText = this.text.replace(/\t/g, "   ");
    const paddingX = Math.min(this.paddingX, Math.max(0, Math.floor((width - 1) / 2)));
    const contentWidth = Math.max(1, width - paddingX * 2);
    const wrappedLines = wrapTextWithAnsi(normalizedText, contentWidth);
    const leftMargin = " ".repeat(paddingX);
    const rightMargin = " ".repeat(paddingX);
    const contentLines = [];
    for (const line of wrappedLines) {
      const lineWithMargins = leftMargin + line + rightMargin;
      if (this.customBgFn) {
        contentLines.push(applyBackgroundToLine(lineWithMargins, width, this.customBgFn));
      } else {
        const visibleLen = visibleWidth(lineWithMargins);
        const paddingNeeded = Math.max(0, width - visibleLen);
        contentLines.push(lineWithMargins + " ".repeat(paddingNeeded));
      }
    }
    const emptyLine = " ".repeat(width);
    const emptyLines = [];
    for (let i2 = 0;i2 < this.paddingY; i2++) {
      const line = this.customBgFn ? applyBackgroundToLine(emptyLine, width, this.customBgFn) : emptyLine;
      emptyLines.push(line);
    }
    const result = [...emptyLines, ...contentLines, ...emptyLines];
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = result;
    return result.length > 0 ? result : [""];
  }
}
// node_modules/@earendil-works/pi-tui/dist/terminal-image.js
var kittyImageMetadata = new Map;
var KITTY_PLACEMENT_CONTROL_KEYS = new Set([
  "i",
  "p",
  "x",
  "y",
  "w",
  "h",
  "X",
  "Y",
  "c",
  "r",
  "C",
  "U",
  "z",
  "P",
  "Q",
  "H",
  "V"
]);

// node_modules/@earendil-works/pi-tui/dist/tui.js
var VIEWPORT_TUI = Symbol.for("@earendil-works/pi-tui/viewport");

// node_modules/@earendil-works/pi-tui/dist/word-navigation.js
var wordSegmenter2 = getWordSegmenter();

// node_modules/@earendil-works/pi-tui/dist/components/editor.js
var graphemeSegmenter2 = getGraphemeSegmenter();
var wordSegmenter3 = getWordSegmenter();
// node_modules/@earendil-works/pi-tui/dist/layout-node.js
var LAYOUT_NODE = Symbol.for("@earendil-works/pi-tui/layout-node");
// node_modules/@earendil-works/pi-tui/dist/components/input.js
var segmenter = getGraphemeSegmenter();
// node_modules/@earendil-works/pi-tui/dist/latex.js
var NAMED_OPERATORS = new Set([
  "arccos",
  "arcsin",
  "arctan",
  "arg",
  "cos",
  "cosh",
  "cot",
  "coth",
  "csc",
  "deg",
  "det",
  "dim",
  "exp",
  "gcd",
  "hom",
  "inf",
  "ker",
  "lg",
  "lim",
  "liminf",
  "limsup",
  "ln",
  "log",
  "max",
  "min",
  "Pr",
  "sec",
  "sin",
  "sinh",
  "sup",
  "tan",
  "tanh"
]);
var LIMIT_OPERATORS = new Set([
  "argmax",
  "argmin",
  "inf",
  "injlim",
  "lim",
  "liminf",
  "limsup",
  "max",
  "min",
  "projlim",
  "sup"
]);
var DISPLAY_LIMIT_SYMBOLS = new Set([
  "bigcap",
  "bigcup",
  "bigodot",
  "bigoplus",
  "bigotimes",
  "bigsqcup",
  "biguplus",
  "bigvee",
  "bigwedge",
  "coprod",
  "int",
  "iint",
  "iiint",
  "oint",
  "prod",
  "sum"
]);
var RELATION_COMMANDS = new Set([
  "Leftarrow",
  "Leftrightarrow",
  "Longleftarrow",
  "Longleftrightarrow",
  "Longrightarrow",
  "Rightarrow",
  "Vdash",
  "Vvdash",
  "approx",
  "asymp",
  "cong",
  "dashv",
  "doteq",
  "downarrow",
  "equiv",
  "ge",
  "geq",
  "geqslant",
  "gets",
  "gg",
  "hookleftarrow",
  "hookrightarrow",
  "iff",
  "implies",
  "in",
  "leadsto",
  "le",
  "leftarrow",
  "leftharpoondown",
  "leftharpoonup",
  "leftrightarrow",
  "leftrightharpoons",
  "leq",
  "leqslant",
  "ll",
  "longleftarrow",
  "longleftrightarrow",
  "longmapsto",
  "longrightarrow",
  "mapsto",
  "mid",
  "models",
  "ne",
  "nearrow",
  "neq",
  "ni",
  "notin",
  "nvdash",
  "nvDash",
  "nwarrow",
  "parallel",
  "perp",
  "prec",
  "preceq",
  "propto",
  "rightharpoondown",
  "rightharpoonup",
  "rightleftharpoons",
  "rightarrow",
  "rightsquigarrow",
  "searrow",
  "sim",
  "simeq",
  "sqsubset",
  "sqsubseteq",
  "sqsupset",
  "sqsupseteq",
  "subset",
  "subseteq",
  "succ",
  "succeq",
  "supset",
  "supseteq",
  "swarrow",
  "to",
  "triangleleft",
  "triangleright",
  "twoheadleftarrow",
  "twoheadrightarrow",
  "uparrow",
  "vdash"
]);
var SPACING_COMMANDS = new Set([
  ",",
  ":",
  ";",
  " ",
  ">",
  "enspace",
  "enskip",
  "medspace",
  "quad",
  "qquad",
  "thickspace",
  "thinspace"
]);
var NEGATIVE_SPACING_COMMANDS = new Set(["!", "negmedspace", "negthickspace", "negthinspace"]);
var IGNORED_COMMANDS = new Set([
  "displaystyle",
  "limits",
  "nolimits",
  "scriptstyle",
  "scriptscriptstyle",
  "textstyle"
]);
var SIZE_COMMANDS = new Set([
  "big",
  "Big",
  "bigg",
  "Bigg",
  "bigl",
  "Bigl",
  "biggl",
  "Biggl",
  "bigr",
  "Bigr",
  "biggr",
  "Biggr"
]);
var PLAIN_WRAPPERS = new Set([
  "emph",
  "mathcal",
  "mathbf",
  "mathfrak",
  "mathit",
  "mathrm",
  "mathnormal",
  "mathscr",
  "mathsf",
  "mathtt",
  "mathup",
  "mbox",
  "overbrace",
  "pmb",
  "smash",
  "substack",
  "text",
  "textbf",
  "textit",
  "textmd",
  "textnormal",
  "textrm",
  "textsc",
  "textsf",
  "textsl",
  "texttt",
  "textup",
  "underbrace",
  "bm",
  "boldsymbol"
]);

// node_modules/@earendil-works/pi-tui/dist/components/markdown.js
var STRICT_STRIKETHROUGH_REGEX = /^(~~)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/;

class StrictStrikethroughTokenizer extends w {
  del(src) {
    const match = STRICT_STRIKETHROUGH_REGEX.exec(src);
    if (!match) {
      return;
    }
    const text = match[2];
    return {
      type: "del",
      raw: match[0],
      text,
      tokens: this.lexer.inlineTokens(text)
    };
  }
}
function isEscaped(source, index) {
  let backslashes = 0;
  for (let position = index - 1;position >= 0 && source[position] === "\\"; position--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}
function findClosingDelimiter(source, closing, start2) {
  let index = source.indexOf(closing, start2);
  while (index >= 0 && isEscaped(source, index)) {
    index = source.indexOf(closing, index + closing.length);
  }
  return index;
}
function looksLikePendingDollarMath(source) {
  return /\\[A-Za-z]+|[_^=+*/<>()[\]|\u00B1\u2264\u2265\u2260\u2248\u2208\u2192\u21D2\u221E\u222B\u2211\u221A-]/.test(source);
}
function tokenizeInlineLatex(source) {
  let opening = "";
  let closing = "";
  if (source.startsWith("$$")) {
    opening = "$$";
    closing = "$$";
  } else if (source.startsWith("\\(")) {
    opening = "\\(";
    closing = "\\)";
  } else if (source.startsWith("\\[")) {
    opening = "\\[";
    closing = "\\]";
  } else if (source.startsWith("$") && !/^\$\s/.test(source)) {
    opening = "$";
    closing = "$";
  } else {
    return;
  }
  const closingIndex = findClosingDelimiter(source, closing, opening.length);
  if (closingIndex >= 0 && opening === "$" && (/\s$/.test(source.slice(opening.length, closingIndex)) || /^\d/.test(source.slice(closingIndex + 1)) || /^[A-Z_][A-Z0-9_]*(?:[^A-Za-z0-9_\s])?$/.test(source.slice(opening.length, closingIndex)) && /^[A-Za-z_][A-Za-z0-9_]*/.test(source.slice(closingIndex + 1)) || source.slice(opening.length, closingIndex).includes("`"))) {
    return;
  }
  if (closingIndex < 0) {
    const pendingSource = source.slice(opening.length);
    if (opening.startsWith("\\") || looksLikePendingDollarMath(pendingSource)) {
      return { type: "latex", raw: source, text: pendingSource, pending: true };
    }
    return;
  }
  const text = source.slice(opening.length, closingIndex);
  if (!text || text.includes(`
`)) {
    return;
  }
  const raw = source.slice(0, closingIndex + closing.length);
  return { type: "latex", raw, text };
}
function tokenizeBlockLatex(source) {
  const dollarMatch = /^ {0,3}\$\$[ \t]*(?:\n)?([\s\S]*?)\$\$[ \t]*(?:\n|$)/.exec(source);
  if (dollarMatch?.[1]) {
    return { type: "latexBlock", raw: dollarMatch[0], text: dollarMatch[1].trim() };
  }
  const bracketMatch = /^ {0,3}\\\[[ \t]*(?:\n)?([\s\S]*?)\\\][ \t]*(?:\n|$)/.exec(source);
  if (bracketMatch?.[1]) {
    return { type: "latexBlock", raw: bracketMatch[0], text: bracketMatch[1].trim() };
  }
  const pendingBracket = /^ {0,3}\\\[[ \t]*(?:\n)?([\s\S]*)$/.exec(source);
  if (pendingBracket) {
    return { type: "latexBlock", raw: pendingBracket[0], text: pendingBracket[1], pending: true };
  }
  const pendingDollar = /^ {0,3}\$\$[ \t]*(?:\n)?([\s\S]*)$/.exec(source);
  if (pendingDollar?.[1] && looksLikePendingDollarMath(pendingDollar[1])) {
    return { type: "latexBlock", raw: pendingDollar[0], text: pendingDollar[1], pending: true };
  }
  return;
}
var LATEX_MARKDOWN_EXTENSIONS = [
  {
    name: "latexBlock",
    level: "block",
    start(source) {
      const match = /(?:^|\n) {0,3}(?:\$\$|\\\[)/.exec(source);
      return match ? match.index + (match[0].startsWith(`
`) ? 1 : 0) : undefined;
    },
    tokenizer: tokenizeBlockLatex
  },
  {
    name: "latex",
    level: "inline",
    start(source) {
      const indices = [source.indexOf("$"), source.indexOf("\\("), source.indexOf("\\[")].filter((index) => index >= 0);
      return indices.length > 0 ? Math.min(...indices) : undefined;
    },
    tokenizer: tokenizeInlineLatex
  }
];
var markdownParser = new q;
markdownParser.setOptions({
  tokenizer: new StrictStrikethroughTokenizer
});
markdownParser.use({ extensions: [...LATEX_MARKDOWN_EXTENSIONS] });
// node_modules/@earendil-works/pi-tui/dist/terminal.js
import { createRequire as createRequire5 } from "module";

// node_modules/@earendil-works/pi-tui/dist/native-modifiers.js
import { createRequire as createRequire4 } from "module";

// node_modules/@earendil-works/pi-tui/dist/native-module-path.js
import { createRequire as createRequire3 } from "module";
var moduleRequire = createRequire3(import.meta.url);

// node_modules/@earendil-works/pi-tui/dist/native-modifiers.js
var cjsRequire = createRequire4(import.meta.url);

// node_modules/@earendil-works/pi-tui/dist/terminal.js
var cjsRequire2 = createRequire5(import.meta.url);
var DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS = 7;
var KITTY_KEYBOARD_PROTOCOL_QUERY = `\x1B[>${DESIRED_KITTY_KEYBOARD_PROTOCOL_FLAGS}u\x1B[?u\x1B[c`;
// node_modules/@earendil-works/pi-tui/dist/alt-screen-search.js
var segmenter2 = getGraphemeSegmenter();

// node_modules/@earendil-works/pi-tui/dist/tui-alt-screen.js
var MAX_CACHED_OFFSCREEN_KITTY_TRANSMISSION_BYTES = 32 * 1024 * 1024;
var MAX_CACHED_OFFSCREEN_KITTY_DECODED_BYTES = 64 * 1024 * 1024;
var wordSegmenter4 = getWordSegmenter();
// src/tui/layout.ts
var COPY = {
  en: {
    budget: "budget",
    complete: "complete",
    contextChanged: "changed context omitted",
    contextOmitted: "context unavailable",
    contextRemaining: "context remaining",
    continueSnapshot: "continue snapshot",
    cursorReady: "cursor ready",
    empty: "No matching lines were found.",
    error: "ERROR",
    expandFullError: "expand for full error",
    file: "file",
    files: "files",
    finalPage: "final page",
    inspect: "INSPECT",
    impact: "IMPACT",
    inspectBlocked: "Current source was not mixed with retained evidence.",
    matches: "matches",
    matchesTitle: "MATCHES",
    moreFiles: "more files",
    moreLines: "more lines",
    noSymbol: "no enclosing symbol",
    originalOnExpand: "expand for original result",
    partial: "partial",
    partialMatchesTitle: "PARTIAL MATCHES",
    partialSummaryTitle: "PARTIAL SEARCH",
    partialEvidence: "retained evidence only; narrow the search before treating it as complete",
    paths: "paths",
    retained: "retained",
    retainedMatch: "retained match",
    returned: "returned",
    searching: "Searching\u2026",
    selected: "selected",
    selectedNoMatches: "selected paths had no retained matches",
    sourceChanged: "SOURCE CHANGED",
    sourceTooLarge: "SOURCE TOO LARGE",
    structure: "structure",
    structureStatuses: {
      available: "available",
      "file-too-large": "file too large",
      "no-symbol": "no symbol",
      "parse-error": "parse error",
      "provider-unavailable": "provider unavailable",
      "source-changed": "source changed",
      "source-unavailable": "source unavailable"
    },
    summary: "SUMMARY",
    samples: "match samples",
    locations: "locations",
    deferred: "deferred",
    failed: "failed"
  },
  "zh-CN": {
    budget: "\u9884\u7B97",
    complete: "\u5B8C\u6574",
    contextChanged: "\u5DF2\u7701\u7565\u53D8\u5316\u540E\u7684\u4E0A\u4E0B\u6587",
    contextOmitted: "\u4E0A\u4E0B\u6587\u4E0D\u53EF\u7528",
    contextRemaining: "\u4E0A\u4E0B\u6587\u5269\u4F59",
    continueSnapshot: "\u7EE7\u7EED\u5FEB\u7167",
    cursorReady: "\u53EF\u7EE7\u7EED\u7FFB\u9875",
    empty: "\u6CA1\u6709\u627E\u5230\u5339\u914D\u884C\u3002",
    error: "\u9519\u8BEF",
    expandFullError: "\u5C55\u5F00\u67E5\u770B\u5B8C\u6574\u9519\u8BEF",
    file: "\u4E2A\u6587\u4EF6",
    files: "\u4E2A\u6587\u4EF6",
    finalPage: "\u6700\u540E\u4E00\u9875",
    inspect: "\u6E90\u7801\u68C0\u67E5",
    impact: "\u5F71\u54CD\u8BC1\u636E",
    inspectBlocked: "\u672A\u5C06\u5F53\u524D\u6E90\u7801\u4E0E\u5FEB\u7167\u8BC1\u636E\u6DF7\u5408\u5C55\u793A\u3002",
    matches: "\u5904\u5339\u914D",
    matchesTitle: "\u5339\u914D\u7ED3\u679C",
    moreFiles: "\u4E2A\u5176\u4ED6\u6587\u4EF6",
    moreLines: "\u884C\u5176\u4F59\u5185\u5BB9",
    noSymbol: "\u672A\u627E\u5230\u6240\u5C5E\u7B26\u53F7",
    originalOnExpand: "\u5C55\u5F00\u67E5\u770B\u539F\u59CB\u7ED3\u679C",
    partial: "\u90E8\u5206",
    partialMatchesTitle: "\u90E8\u5206\u4FDD\u7559\u5339\u914D",
    partialSummaryTitle: "\u90E8\u5206\u4FDD\u7559\u641C\u7D22",
    partialEvidence: "\u4EC5\u5305\u542B\u5DF2\u4FDD\u7559\u8BC1\u636E\uFF1B\u8BF7\u7F29\u5C0F\u641C\u7D22\u8303\u56F4\u540E\u518D\u4F5C\u5B8C\u6574\u6027\u5224\u65AD",
    paths: "\u4E2A\u8DEF\u5F84",
    retained: "\u5DF2\u4FDD\u7559",
    retainedMatch: "\u4FDD\u7559\u5339\u914D",
    returned: "\u672C\u9875\u8FD4\u56DE",
    searching: "\u6B63\u5728\u641C\u7D22\u2026",
    selected: "\u5DF2\u9009\u62E9",
    selectedNoMatches: "\u4E2A\u6240\u9009\u8DEF\u5F84\u6CA1\u6709\u4FDD\u7559\u5339\u914D",
    sourceChanged: "\u6E90\u7801\u5DF2\u53D8\u5316",
    sourceTooLarge: "\u6E90\u7801\u8FC7\u5927",
    structure: "\u7ED3\u6784",
    structureStatuses: {
      available: "\u53EF\u7528",
      "file-too-large": "\u6587\u4EF6\u8FC7\u5927",
      "no-symbol": "\u672A\u627E\u5230\u7B26\u53F7",
      "parse-error": "\u89E3\u6790\u5931\u8D25",
      "provider-unavailable": "\u7ED3\u6784\u63D0\u4F9B\u5668\u4E0D\u53EF\u7528",
      "source-changed": "\u6E90\u7801\u5DF2\u53D8\u5316",
      "source-unavailable": "\u6E90\u7801\u4E0D\u53EF\u7528"
    },
    summary: "\u6458\u8981",
    samples: "\u547D\u4E2D\u6837\u672C",
    locations: "\u4E2A\u4F4D\u7F6E",
    deferred: "\u5F85\u7EED\u67E5",
    failed: "\u5931\u8D25"
  }
};
function safeLabel(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint >= 127 && codePoint <= 159 ? "\uFFFD" : character;
  }).join("");
}
function quote(value) {
  return JSON.stringify(safeLabel(value));
}
function list2(value) {
  if (value === undefined)
    return;
  return (Array.isArray(value) ? value : [value]).map(safeLabel).join(", ");
}
function padVisible(value, width) {
  const truncated = truncateToWidth(value, Math.max(1, width));
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}
function finish(lines, width) {
  const available = Math.max(1, width);
  return lines.map((line) => truncateToWidth(line, available));
}
function responsiveLimit(width, wide, medium, narrow) {
  if (width >= 72)
    return wide;
  if (width >= 44)
    return medium;
  return narrow;
}
function title(text, theme) {
  return `${theme.fg("borderMuted", "\u2500\u2500 ")}${theme.fg("toolTitle", theme.bold(text))}${theme.fg("borderMuted", " \u2500\u2500")}`;
}
function statusWord(presentation, copy, theme) {
  return presentation.details.status === "complete" ? theme.fg("success", copy.complete) : theme.fg("warning", copy.partial);
}
function countLine(presentation, copy, theme, width) {
  const { details } = presentation;
  const fileUnit = details.totalFiles === 1 ? copy.file : copy.files;
  const files = `${String(details.totalFiles)} ${fileUnit}`;
  const total = theme.bold(String(details.totalMatches));
  if (width < 44)
    return `${total} \xB7 ${files} \xB7 ${statusWord(presentation, copy, theme)}`;
  return `${total} ${copy.matches} \xB7 ${files} \xB7 ${statusWord(presentation, copy, theme)}`;
}
function partialLines(presentation, copy, theme, width) {
  if (presentation.details.status !== "partial")
    return [];
  const retained = `! ${copy.retained} ${String(presentation.details.storedMatches)}/${String(presentation.details.totalMatches)}`;
  const text = width < 44 ? retained : `${retained} \xB7 ${copy.partialEvidence}`;
  return [theme.fg("warning", text)];
}
function budgetLine(presentation, copy, theme) {
  const { details } = presentation;
  if (!details.budgetTier || details.budgetTier === "full")
    return;
  let remainder = "";
  if (details.contextRemainderPercent !== undefined) {
    remainder = ` \xB7 ${String(details.contextRemainderPercent)}% ${copy.contextRemaining}`;
  }
  return theme.fg("dim", `${copy.budget} ${details.budgetTier}${remainder}`);
}
function summaryRow(row, maximum, width, theme) {
  if (width < 44) {
    const count = String(row.matches);
    const pathWidth = Math.max(1, width - visibleWidth(count) - 2);
    return `${theme.fg("accent", padVisible(row.path, pathWidth))}  ${theme.fg("muted", count)}`;
  }
  const count = String(row.matches);
  const barWidth = width >= 72 ? 20 : 10;
  const maxPathWidth = width >= 72 ? 32 : 20;
  const pathWidth = Math.max(8, Math.min(maxPathWidth, width - barWidth - count.length - 5));
  const filled = Math.max(1, Math.round(row.matches / maximum * barWidth));
  const bar = `${"\u2588".repeat(filled)}${"\u2500".repeat(Math.max(0, barWidth - filled))}`;
  return `${theme.fg("accent", padVisible(row.path, pathWidth))} ${theme.fg("success", bar)} ${theme.fg("muted", count)}`;
}
function renderSummary(presentation, copy, theme, width) {
  const shownLimit = responsiveLimit(width, 6, 5, 4);
  const visibleRows = presentation.rows.slice(0, shownLimit);
  const maximum = Math.max(...visibleRows.map((row) => row.matches), 1);
  const lines = [
    title(presentation.details.status === "partial" ? copy.partialSummaryTitle : copy.summary, theme),
    countLine(presentation, copy, theme, width),
    ...partialLines(presentation, copy, theme, width),
    "",
    ...visibleRows.map((row) => summaryRow(row, maximum, width, theme))
  ];
  const hiddenRows = presentation.rows.length - visibleRows.length;
  const omitted = presentation.details.summaryFilesOmitted ?? 0;
  if (hiddenRows + omitted > 0) {
    lines.push(theme.fg("dim", `\u2026 ${String(hiddenRows + omitted)} ${copy.moreFiles}`));
  }
  if (width >= 44 && presentation.previews.length > 0) {
    lines.push("", theme.fg("dim", copy.samples));
    lines.push(...presentation.previews.slice(0, 2).map((line) => theme.fg("toolOutput", safeLabel(line))));
  }
  const budget = budgetLine(presentation, copy, theme);
  if (budget)
    lines.push("", budget);
  const pageStatus = presentation.details.cursor ? copy.cursorReady : copy.finalPage;
  const footer = width < 44 ? pageStatus : `${copy.summary.toLowerCase()} \xB7 ${pageStatus} \xB7 ${copy.originalOnExpand}`;
  lines.push(theme.fg("dim", footer));
  return finish(lines, width);
}
function styleEvidenceLine(line, theme) {
  if (/^ \d+:/.test(line))
    return theme.fg("toolOutput", line);
  if (/^ \d+-/.test(line))
    return theme.fg("dim", line);
  if (line.length > 0 && !line.startsWith(" "))
    return theme.fg("accent", line);
  return theme.fg("toolOutput", line);
}
function renderMatches(presentation, copy, theme, width) {
  const lineLimit = responsiveLimit(width, 12, 8, 5);
  const visibleBody = presentation.bodyLines.slice(0, lineLimit);
  const lines = [
    title(presentation.details.status === "partial" ? copy.partialMatchesTitle : copy.matchesTitle, theme),
    countLine(presentation, copy, theme, width),
    ...partialLines(presentation, copy, theme, width),
    "",
    ...visibleBody.map((line) => styleEvidenceLine(line, theme))
  ];
  if (presentation.bodyLines.length > visibleBody.length) {
    lines.push(theme.fg("dim", `\u2026 ${String(presentation.bodyLines.length - visibleBody.length)} ${copy.moreLines}`));
  }
  let range = `${String(presentation.details.returnedMatches)} ${copy.returned}`;
  if (presentation.firstMatch !== undefined && presentation.lastMatch !== undefined) {
    range = `${String(presentation.firstMatch)}\u2013${String(presentation.lastMatch)}/${String(presentation.details.totalMatches)}`;
  }
  const footer = [range];
  if (presentation.details.selectedPaths) {
    footer.push(`${copy.selected} ${String(presentation.details.selectedPaths.length)} ${copy.paths}`);
  }
  footer.push(presentation.details.cursor ? copy.cursorReady : copy.finalPage);
  lines.push("", theme.fg("dim", footer.join(" \xB7 ")));
  if (presentation.details.selectionMissingPaths?.length) {
    lines.push(theme.fg("warning", `! ${String(presentation.details.selectionMissingPaths.length)} ${copy.selectedNoMatches}`));
  }
  if (presentation.details.contextChangedFiles?.length) {
    lines.push(theme.fg("warning", `! ${copy.contextChanged}: ${String(presentation.details.contextChangedFiles.length)} ${copy.files}`));
  }
  if (presentation.details.contextOmittedFiles?.length) {
    lines.push(theme.fg("warning", `! ${copy.contextOmitted}: ${String(presentation.details.contextOmittedFiles.length)} ${copy.files}`));
  }
  return finish(lines, width);
}
function inspectHeading(presentation, copy) {
  if (presentation.status === "source-changed")
    return copy.sourceChanged;
  if (presentation.status === "file-too-large")
    return copy.sourceTooLarge;
  if (presentation.status === "source-unavailable")
    return copy.structureStatuses[presentation.status];
  return copy.inspect;
}
function renderInspect(presentation, copy, theme, width) {
  const blocked = presentation.status === "source-changed" || presentation.status === "file-too-large" || presentation.status === "source-unavailable";
  const heading = inspectHeading(presentation, copy);
  const lines = [title(heading, theme), theme.fg("accent", presentation.target)];
  if (blocked) {
    lines.push("", theme.fg("warning", `! ${copy.inspectBlocked}`));
    return finish(lines, width);
  }
  if (presentation.descriptor) {
    lines.push(theme.fg(presentation.status === "available" ? "success" : "warning", presentation.status === "no-symbol" ? copy.noSymbol : presentation.descriptor));
  }
  const sourceLimit = responsiveLimit(width, 12, 8, 5);
  const visibleSource = presentation.sourceLines.slice(0, sourceLimit);
  lines.push("", ...visibleSource.map((line) => theme.fg("toolOutput", line)));
  if (presentation.sourceLines.length > visibleSource.length) {
    lines.push(theme.fg("dim", `\u2026 ${String(presentation.sourceLines.length - visibleSource.length)} ${copy.moreLines}`));
  }
  const provider = presentation.details.structure?.provider;
  const providerText = provider ? ` \xB7 ${safeLabel(provider)}` : "";
  lines.push("", theme.fg("dim", `${copy.structure} ${copy.structureStatuses[presentation.status]}${providerText} \xB7 ${copy.originalOnExpand}`));
  return finish(lines, width);
}
function signalGrepTitle(theme) {
  return theme.fg("toolTitle", theme.bold("baoer_signal_grep"));
}
function inspectCall(input, copy, theme) {
  if (input.matchIndices || input.targets) {
    const count = input.matchIndices?.length ?? input.targets?.length ?? 0;
    return {
      primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", copy.inspect)} ${String(count)} ${copy.locations}`,
      secondary: []
    };
  }
  const target = input.matchIndex === undefined ? `${safeLabel(input.path ?? "?")}:${String(input.line ?? "?")}` : `${copy.retainedMatch} #${String(input.matchIndex)}`;
  return {
    primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", copy.inspect)} ${theme.fg("muted", target)}`,
    secondary: []
  };
}
function impactCall(input, copy, theme) {
  const target = input.cursor ? `${copy.retainedMatch} #${String(input.matchIndex ?? "?")}` : input.symbol ? `${safeLabel(input.path ?? "?")} \xB7 ${safeLabel(input.symbol)}` : `${safeLabel(input.path ?? "?")}:${String(input.line ?? "?")}`;
  return {
    primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", copy.impact)} ${theme.fg("muted", target)}`,
    secondary: []
  };
}
function renderInspectBatch(presentation, copy, theme, width) {
  const returned = presentation.items.filter((item) => item.status === "returned").length;
  const deferred = presentation.items.filter((item) => item.status === "deferred").length;
  const failed = presentation.items.filter((item) => item.status === "error").length;
  const lines = [
    title(copy.inspect, theme),
    `${String(presentation.items.length)} ${copy.locations} \xB7 ${String(returned)} ${copy.returned}`
  ];
  for (const item of presentation.items) {
    const target = item.path ? `${safeLabel(item.path)}:${String(item.line ?? "?")}` : `#${String(item.matchIndex ?? item.inputIndex)}`;
    const label = item.status === "returned" ? copy.returned : item.status === "deferred" ? copy.deferred : copy.failed;
    lines.push(theme.fg(item.status === "returned" ? "toolOutput" : "warning", `${String(item.inputIndex)}. ${target} \xB7 ${label}`));
  }
  if (deferred || failed)
    lines.push(theme.fg("warning", `${String(deferred)} ${copy.deferred} \xB7 ${String(failed)} ${copy.failed}`));
  lines.push(theme.fg("dim", copy.originalOnExpand));
  return finish(lines, width);
}
function continuationCall(input, copy, theme) {
  const secondary = [input.mode ?? "auto"];
  if (input.paths?.length) {
    secondary.push(`${copy.selected} ${String(input.paths.length)} ${copy.paths}`);
  } else if (input.path) {
    secondary.push(safeLabel(input.path));
  }
  return {
    primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", copy.continueSnapshot)}`,
    secondary
  };
}
function searchCall(input, theme) {
  const terms = input.anyOf ?? input.allOf;
  const secondary = [
    safeLabel(input.path ?? "."),
    input.mode ?? "auto",
    terms ? input.anyOf ? "any-of literals" : "all-of literals" : input.literal ? "literal" : "regex"
  ];
  if (input.ignoreCase === true)
    secondary.push("ignore-case");
  else if (input.ignoreCase === false)
    secondary.push("case-sensitive");
  else
    secondary.push("smart-case");
  if (input.context !== undefined)
    secondary.push(`context ${String(input.context)}`);
  const glob = list2(input.glob);
  const exclude = list2(input.exclude);
  if (glob)
    secondary.push(`include ${glob}`);
  if (exclude)
    secondary.push(`exclude ${exclude}`);
  return {
    primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", terms ? terms.map(quote).join(input.anyOf ? " | " : " & ") : quote(input.pattern ?? ""))}`,
    secondary
  };
}
function callView(input, copy, theme) {
  if (input.mode === "inspect")
    return inspectCall(input, copy, theme);
  if (input.mode === "impact")
    return impactCall(input, copy, theme);
  if (input.cursor)
    return continuationCall(input, copy, theme);
  if (isSemanticMode(input.mode) || input.mode === "files" || input.mode === "concept" || input.mode === "hybrid" || input.mode === "structure") {
    return {
      primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", safeLabel(input.mode))} ${theme.fg("muted", safeLabel(input.query ?? input.pattern ?? input.symbol ?? input.path ?? "."))}`,
      secondary: [
        safeLabel(input.path ?? "."),
        ...input.line === undefined ? [] : [`${String(input.line)}:${String(input.column ?? 1)}`]
      ]
    };
  }
  return searchCall(input, theme);
}
function renderSignalGrepCallLines(input, locale, theme, width) {
  const { primary, secondary } = callView(input, COPY[locale], theme);
  if (secondary.length === 0)
    return finish([primary], width);
  const detail = secondary.join(" \xB7 ");
  if (width < 44)
    return finish([`${primary} \xB7 ${detail}`], width);
  return finish([primary, theme.fg("dim", detail)], width);
}
function renderSignalGrepPresentationLines(presentation, locale, theme, width) {
  const copy = COPY[locale];
  switch (presentation.kind) {
    case "empty":
      return finish([
        title("SIGNAL GREP", theme),
        `${theme.bold("0")} ${copy.matches} \xB7 ${theme.fg("success", copy.complete)}`,
        theme.fg("dim", copy.empty)
      ], width);
    case "summary":
      return renderSummary(presentation, copy, theme, width);
    case "matches":
      return renderMatches(presentation, copy, theme, width);
    case "inspect":
      return renderInspect(presentation, copy, theme, width);
    case "inspect-batch":
      return renderInspectBatch(presentation, copy, theme, width);
    default:
      throw new Error("Unsupported baoer_signal_grep presentation");
  }
}
function localizedSearchingText(locale) {
  return COPY[locale].searching;
}
function localizedErrorText(locale) {
  const copy = COPY[locale];
  return { hint: copy.expandFullError, title: copy.error };
}

// src/tui/presentation.ts
var STRUCTURE_STATUSES = new Set([
  "available",
  "no-symbol",
  "provider-unavailable",
  "source-unavailable",
  "parse-error",
  "file-too-large",
  "source-changed"
]);
var SEARCH_MODES = new Set(["auto", "summary", "matches", "inspect"]);
function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function hasRecognizableDetails(details) {
  if (!details || details.version !== 1 || details.analysis !== undefined)
    return false;
  if (!SEARCH_MODES.has(details.mode))
    return false;
  if (details.status !== "complete" && details.status !== "partial")
    return false;
  const counts = [
    details.totalMatches,
    details.storedMatches,
    details.totalFiles,
    details.returnedMatches
  ];
  if (counts.some((value) => !isNonNegativeSafeInteger(value)))
    return false;
  if (details.storedMatches > details.totalMatches)
    return false;
  if (details.snapshotComplete !== (details.status === "complete"))
    return false;
  return !details.snapshotComplete || details.storedMatches === details.totalMatches;
}
function parseSummaryRows(text, expectedRows) {
  if (!isNonNegativeSafeInteger(expectedRows))
    return;
  if (expectedRows === 0)
    return;
  const lines = text.split(`
`);
  const rangeIndex = lines.findIndex((line) => /^Files \d+-\d+ of \d+, ordered by match count\.$/.test(line));
  if (rangeIndex < 0 || lines[rangeIndex + 1] !== "")
    return;
  const rows = [];
  for (const line of lines.slice(rangeIndex + 2, rangeIndex + 2 + expectedRows)) {
    const match = /^(\S(?:.*\S)?) {2,}(\d+)$/.exec(line);
    if (!match)
      return;
    const path = match[1];
    const countText = match[2];
    if (!path || !countText)
      return;
    const count = Number(countText);
    if (!Number.isSafeInteger(count) || count < 1)
      return;
    rows.push({ path, matches: count });
  }
  return rows.length === expectedRows ? rows : undefined;
}
function splitMatchBody(text) {
  const markers = [
    `

[Match columns `,
    `

[Context omitted `,
    `

[Context unavailable `,
    `

[Matches `
  ];
  let bodyEnd = text.length;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index >= 0)
      bodyEnd = Math.min(bodyEnd, index);
  }
  const body2 = text.slice(0, bodyEnd);
  if (body2.length === 0 || !text.includes(`

[Matches `))
    return;
  return body2.split(`
`);
}
function parseMatchRange(text) {
  const match = /\[Matches (\d+)-(\d+) of \d+/.exec(text);
  if (!match)
    return {};
  const firstMatch = Number(match[1]);
  const lastMatch = Number(match[2]);
  if (!Number.isSafeInteger(firstMatch) || !Number.isSafeInteger(lastMatch) || firstMatch < 1 || lastMatch < firstMatch) {
    return {};
  }
  return { firstMatch, lastMatch };
}
function parseInspect(text, details) {
  const structure = details.structure;
  if (!structure || !STRUCTURE_STATUSES.has(structure.status))
    return;
  const lines = text.split(`
`);
  const target = lines[0];
  if (!target)
    return;
  if (structure.status === "source-changed" || structure.status === "file-too-large" || structure.status === "source-unavailable") {
    return {
      kind: "inspect",
      details,
      text,
      target,
      sourceLines: [],
      status: structure.status
    };
  }
  const descriptor = lines[1] || undefined;
  const structureMarker = text.lastIndexOf(`

[structure: `);
  if (!descriptor || structureMarker < 0)
    return;
  const sourceStart = text.indexOf(`

`, target.length + 1);
  if (sourceStart < 0 || sourceStart >= structureMarker)
    return;
  const sourceLines = text.slice(sourceStart + 2, structureMarker).split(`
`);
  return {
    kind: "inspect",
    details,
    text,
    target,
    descriptor,
    sourceLines,
    status: structure.status
  };
}
function recognizeSignalGrepResult(text, details) {
  if (!hasRecognizableDetails(details))
    return;
  if (details.mode === "inspect") {
    if (details.inspections) {
      if (details.inspections.length === 0 || details.inspections.some((item) => !Number.isSafeInteger(item.inputIndex) || item.inputIndex < 1 || !["returned", "deferred", "error"].includes(item.status)))
        return;
      return { kind: "inspect-batch", details, text, items: details.inspections };
    }
    return parseInspect(text, details);
  }
  if (details.totalMatches === 0) {
    return { kind: "empty", details, text };
  }
  if (details.summaryFilesShown !== undefined) {
    const rows = parseSummaryRows(text, details.summaryFilesShown);
    if (!rows)
      return;
    const lines = text.split(`
`);
    const sampleHeading = lines.findIndex((line) => line.startsWith("Samples: first retained match"));
    const sampleCount = details.summaryPreviewsShown ?? 0;
    const previews = sampleHeading >= 0 && isNonNegativeSafeInteger(sampleCount) ? lines.slice(sampleHeading + 1, sampleHeading + 1 + sampleCount) : [];
    return { kind: "summary", details, text, rows, previews };
  }
  if (details.returnedMatches > 0) {
    const bodyLines = splitMatchBody(text);
    if (!bodyLines)
      return;
    return {
      kind: "matches",
      details,
      text,
      bodyLines,
      ...parseMatchRange(text)
    };
  }
  return;
}

// src/tui/renderers.ts
function resultText(result) {
  return result.content.find((item) => item.type === "text" && item.text !== undefined)?.text;
}
function textLines(text, width) {
  return new Text(text, 0, 0).render(Math.max(1, width));
}
function component(render, fallbackText) {
  return {
    render(width) {
      try {
        return render(width);
      } catch {
        return textLines(fallbackText, width);
      }
    },
    invalidate() {}
  };
}
function errorLines(text, options) {
  const { copy, expanded, theme, width } = options;
  if (expanded)
    return textLines(text, width);
  const available = Math.max(1, width);
  const sourceLines = text.split(`
`).filter((line) => line.length > 0);
  const shown = sourceLines.slice(0, 4);
  const lines = [
    theme.fg("error", theme.bold(`\u2500\u2500 ${copy.title} \u2500\u2500`)),
    ...shown.map((line) => theme.fg("error", line))
  ];
  if (sourceLines.length > shown.length)
    lines.push(theme.fg("dim", `\u2026 ${copy.hint}`));
  return lines.map((line) => truncateToWidth(line, available));
}
function renderSignalGrepCall(input, locale, theme) {
  return component((width) => renderSignalGrepCallLines(input, locale, theme, width), "baoer_signal_grep");
}
function renderSignalGrepResult(result, options, locale, theme) {
  const text = resultText(result);
  if (text === undefined)
    return new Text("", 0, 0);
  if (options.isPartial) {
    return new Text(theme.fg("warning", localizedSearchingText(locale)), 0, 0);
  }
  if (options.isError) {
    return component((width) => errorLines(text, {
      copy: localizedErrorText(locale),
      expanded: options.expanded,
      theme,
      width
    }), text);
  }
  if (options.expanded)
    return new Text(text, 0, 0);
  let presentation;
  try {
    presentation = recognizeSignalGrepResult(text, result.details);
  } catch {
    return new Text(text, 0, 0);
  }
  if (!presentation)
    return new Text(text, 0, 0);
  return component((width) => renderSignalGrepPresentationLines(presentation, locale, theme, width), text);
}

// src/search-policy-shell.ts
import { fileURLToPath as fileURLToPath4 } from "url";

// node_modules/web-tree-sitter/tree-sitter.js
var __defProp2 = Object.defineProperty;
var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
var SIZE_OF_SHORT = 2;
var SIZE_OF_INT = 4;
var SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
var SIZE_OF_NODE = 5 * SIZE_OF_INT;
var SIZE_OF_POINT = 2 * SIZE_OF_INT;
var SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
var ZERO_POINT = { row: 0, column: 0 };
var INTERNAL = Symbol("INTERNAL");
function assertInternal(x) {
  if (x !== INTERNAL)
    throw new Error("Illegal constructor");
}
__name(assertInternal, "assertInternal");
function isPoint(point) {
  return !!point && typeof point.row === "number" && typeof point.column === "number";
}
__name(isPoint, "isPoint");
function setModule(module2) {
  C = module2;
}
__name(setModule, "setModule");
var C;
var LookaheadIterator = class {
  static {
    __name(this, "LookaheadIterator");
  }
  [0] = 0;
  language;
  constructor(internal, address, language) {
    assertInternal(internal);
    this[0] = address;
    this.language = language;
  }
  get currentTypeId() {
    return C._ts_lookahead_iterator_current_symbol(this[0]);
  }
  get currentType() {
    return this.language.types[this.currentTypeId] || "ERROR";
  }
  delete() {
    C._ts_lookahead_iterator_delete(this[0]);
    this[0] = 0;
  }
  reset(language, stateId) {
    if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId)) {
      this.language = language;
      return true;
    }
    return false;
  }
  resetState(stateId) {
    return Boolean(C._ts_lookahead_iterator_reset_state(this[0], stateId));
  }
  [Symbol.iterator]() {
    return {
      next: /* @__PURE__ */ __name(() => {
        if (C._ts_lookahead_iterator_next(this[0])) {
          return { done: false, value: this.currentType };
        }
        return { done: true, value: "" };
      }, "next")
    };
  }
};
function getText(tree, startIndex, endIndex, startPosition) {
  const length = endIndex - startIndex;
  let result = tree.textCallback(startIndex, startPosition);
  if (result) {
    startIndex += result.length;
    while (startIndex < endIndex) {
      const string = tree.textCallback(startIndex, startPosition);
      if (string && string.length > 0) {
        startIndex += string.length;
        result += string;
      } else {
        break;
      }
    }
    if (startIndex > endIndex) {
      result = result.slice(0, length);
    }
  }
  return result ?? "";
}
__name(getText, "getText");
var Tree = class _Tree {
  static {
    __name(this, "Tree");
  }
  [0] = 0;
  textCallback;
  language;
  constructor(internal, address, language, textCallback) {
    assertInternal(internal);
    this[0] = address;
    this.language = language;
    this.textCallback = textCallback;
  }
  copy() {
    const address = C._ts_tree_copy(this[0]);
    return new _Tree(INTERNAL, address, this.language, this.textCallback);
  }
  delete() {
    C._ts_tree_delete(this[0]);
    this[0] = 0;
  }
  get rootNode() {
    C._ts_tree_root_node_wasm(this[0]);
    return unmarshalNode(this);
  }
  rootNodeWithOffset(offsetBytes, offsetExtent) {
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, offsetBytes, "i32");
    marshalPoint(address + SIZE_OF_INT, offsetExtent);
    C._ts_tree_root_node_with_offset_wasm(this[0]);
    return unmarshalNode(this);
  }
  edit(edit) {
    marshalEdit(edit);
    C._ts_tree_edit_wasm(this[0]);
  }
  walk() {
    return this.rootNode.walk();
  }
  getChangedRanges(other) {
    if (!(other instanceof _Tree)) {
      throw new TypeError("Argument must be a Tree");
    }
    C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0;i2 < count; i2++) {
        result[i2] = unmarshalRange(address);
        address += SIZE_OF_RANGE;
      }
      C._free(buffer);
    }
    return result;
  }
  getIncludedRanges() {
    C._ts_tree_included_ranges_wasm(this[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0;i2 < count; i2++) {
        result[i2] = unmarshalRange(address);
        address += SIZE_OF_RANGE;
      }
      C._free(buffer);
    }
    return result;
  }
};
var TreeCursor = class _TreeCursor {
  static {
    __name(this, "TreeCursor");
  }
  [0] = 0;
  [1] = 0;
  [2] = 0;
  [3] = 0;
  tree;
  constructor(internal, tree) {
    assertInternal(internal);
    this.tree = tree;
    unmarshalTreeCursor(this);
  }
  copy() {
    const copy = new _TreeCursor(INTERNAL, this.tree);
    C._ts_tree_cursor_copy_wasm(this.tree[0]);
    unmarshalTreeCursor(copy);
    return copy;
  }
  delete() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_delete_wasm(this.tree[0]);
    this[0] = this[1] = this[2] = 0;
  }
  get currentNode() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_current_node_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  get currentFieldId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
  }
  get currentFieldName() {
    return this.tree.language.fields[this.currentFieldId];
  }
  get currentDepth() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
  }
  get currentDescendantIndex() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
  }
  get nodeType() {
    return this.tree.language.types[this.nodeTypeId] || "ERROR";
  }
  get nodeTypeId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
  }
  get nodeStateId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
  }
  get nodeId() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
  }
  get nodeIsNamed() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
  }
  get nodeIsMissing() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
  }
  get nodeText() {
    marshalTreeCursor(this);
    const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
    const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
    C._ts_tree_cursor_start_position_wasm(this.tree[0]);
    const startPosition = unmarshalPoint(TRANSFER_BUFFER);
    return getText(this.tree, startIndex, endIndex, startPosition);
  }
  get startPosition() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_start_position_wasm(this.tree[0]);
    return unmarshalPoint(TRANSFER_BUFFER);
  }
  get endPosition() {
    marshalTreeCursor(this);
    C._ts_tree_cursor_end_position_wasm(this.tree[0]);
    return unmarshalPoint(TRANSFER_BUFFER);
  }
  get startIndex() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
  }
  get endIndex() {
    marshalTreeCursor(this);
    return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
  }
  gotoFirstChild() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  gotoLastChild() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  gotoParent() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  gotoNextSibling() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  gotoPreviousSibling() {
    marshalTreeCursor(this);
    const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  gotoDescendant(goalDescendantIndex) {
    marshalTreeCursor(this);
    C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantIndex);
    unmarshalTreeCursor(this);
  }
  gotoFirstChildForIndex(goalIndex) {
    marshalTreeCursor(this);
    C.setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
    const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  gotoFirstChildForPosition(goalPosition) {
    marshalTreeCursor(this);
    marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
    const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
    return result === 1;
  }
  reset(node) {
    marshalNode(node);
    marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
    C._ts_tree_cursor_reset_wasm(this.tree[0]);
    unmarshalTreeCursor(this);
  }
  resetTo(cursor) {
    marshalTreeCursor(this, TRANSFER_BUFFER);
    marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
    C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
    unmarshalTreeCursor(this);
  }
};
var Node = class {
  static {
    __name(this, "Node");
  }
  [0] = 0;
  _children;
  _namedChildren;
  constructor(internal, {
    id,
    tree,
    startIndex,
    startPosition,
    other
  }) {
    assertInternal(internal);
    this[0] = other;
    this.id = id;
    this.tree = tree;
    this.startIndex = startIndex;
    this.startPosition = startPosition;
  }
  id;
  startIndex;
  startPosition;
  tree;
  get typeId() {
    marshalNode(this);
    return C._ts_node_symbol_wasm(this.tree[0]);
  }
  get grammarId() {
    marshalNode(this);
    return C._ts_node_grammar_symbol_wasm(this.tree[0]);
  }
  get type() {
    return this.tree.language.types[this.typeId] || "ERROR";
  }
  get grammarType() {
    return this.tree.language.types[this.grammarId] || "ERROR";
  }
  get isNamed() {
    marshalNode(this);
    return C._ts_node_is_named_wasm(this.tree[0]) === 1;
  }
  get isExtra() {
    marshalNode(this);
    return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
  }
  get isError() {
    marshalNode(this);
    return C._ts_node_is_error_wasm(this.tree[0]) === 1;
  }
  get isMissing() {
    marshalNode(this);
    return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
  }
  get hasChanges() {
    marshalNode(this);
    return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
  }
  get hasError() {
    marshalNode(this);
    return C._ts_node_has_error_wasm(this.tree[0]) === 1;
  }
  get endIndex() {
    marshalNode(this);
    return C._ts_node_end_index_wasm(this.tree[0]);
  }
  get endPosition() {
    marshalNode(this);
    C._ts_node_end_point_wasm(this.tree[0]);
    return unmarshalPoint(TRANSFER_BUFFER);
  }
  get text() {
    return getText(this.tree, this.startIndex, this.endIndex, this.startPosition);
  }
  get parseState() {
    marshalNode(this);
    return C._ts_node_parse_state_wasm(this.tree[0]);
  }
  get nextParseState() {
    marshalNode(this);
    return C._ts_node_next_parse_state_wasm(this.tree[0]);
  }
  equals(other) {
    return this.tree === other.tree && this.id === other.id;
  }
  child(index) {
    marshalNode(this);
    C._ts_node_child_wasm(this.tree[0], index);
    return unmarshalNode(this.tree);
  }
  namedChild(index) {
    marshalNode(this);
    C._ts_node_named_child_wasm(this.tree[0], index);
    return unmarshalNode(this.tree);
  }
  childForFieldId(fieldId) {
    marshalNode(this);
    C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
    return unmarshalNode(this.tree);
  }
  childForFieldName(fieldName) {
    const fieldId = this.tree.language.fields.indexOf(fieldName);
    if (fieldId !== -1)
      return this.childForFieldId(fieldId);
    return null;
  }
  fieldNameForChild(index) {
    marshalNode(this);
    const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
    if (!address)
      return null;
    return C.AsciiToString(address);
  }
  fieldNameForNamedChild(index) {
    marshalNode(this);
    const address = C._ts_node_field_name_for_named_child_wasm(this.tree[0], index);
    if (!address)
      return null;
    return C.AsciiToString(address);
  }
  childrenForFieldName(fieldName) {
    const fieldId = this.tree.language.fields.indexOf(fieldName);
    if (fieldId !== -1 && fieldId !== 0)
      return this.childrenForFieldId(fieldId);
    return [];
  }
  childrenForFieldId(fieldId) {
    marshalNode(this);
    C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0;i2 < count; i2++) {
        result[i2] = unmarshalNode(this.tree, address);
        address += SIZE_OF_NODE;
      }
      C._free(buffer);
    }
    return result;
  }
  firstChildForIndex(index) {
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, index, "i32");
    C._ts_node_first_child_for_byte_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  firstNamedChildForIndex(index) {
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, index, "i32");
    C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  get childCount() {
    marshalNode(this);
    return C._ts_node_child_count_wasm(this.tree[0]);
  }
  get namedChildCount() {
    marshalNode(this);
    return C._ts_node_named_child_count_wasm(this.tree[0]);
  }
  get firstChild() {
    return this.child(0);
  }
  get firstNamedChild() {
    return this.namedChild(0);
  }
  get lastChild() {
    return this.child(this.childCount - 1);
  }
  get lastNamedChild() {
    return this.namedChild(this.namedChildCount - 1);
  }
  get children() {
    if (!this._children) {
      marshalNode(this);
      C._ts_node_children_wasm(this.tree[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      this._children = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0;i2 < count; i2++) {
          this._children[i2] = unmarshalNode(this.tree, address);
          address += SIZE_OF_NODE;
        }
        C._free(buffer);
      }
    }
    return this._children;
  }
  get namedChildren() {
    if (!this._namedChildren) {
      marshalNode(this);
      C._ts_node_named_children_wasm(this.tree[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      this._namedChildren = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0;i2 < count; i2++) {
          this._namedChildren[i2] = unmarshalNode(this.tree, address);
          address += SIZE_OF_NODE;
        }
        C._free(buffer);
      }
    }
    return this._namedChildren;
  }
  descendantsOfType(types, startPosition = ZERO_POINT, endPosition = ZERO_POINT) {
    if (!Array.isArray(types))
      types = [types];
    const symbols = [];
    const typesBySymbol = this.tree.language.types;
    for (const node_type of types) {
      if (node_type == "ERROR") {
        symbols.push(65535);
      }
    }
    for (let i2 = 0, n = typesBySymbol.length;i2 < n; i2++) {
      if (types.includes(typesBySymbol[i2])) {
        symbols.push(i2);
      }
    }
    const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
    for (let i2 = 0, n = symbols.length;i2 < n; i2++) {
      C.setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
    }
    marshalNode(this);
    C._ts_node_descendants_of_type_wasm(this.tree[0], symbolsAddress, symbols.length, startPosition.row, startPosition.column, endPosition.row, endPosition.column);
    const descendantCount = C.getValue(TRANSFER_BUFFER, "i32");
    const descendantAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(descendantCount);
    if (descendantCount > 0) {
      let address = descendantAddress;
      for (let i2 = 0;i2 < descendantCount; i2++) {
        result[i2] = unmarshalNode(this.tree, address);
        address += SIZE_OF_NODE;
      }
    }
    C._free(descendantAddress);
    C._free(symbolsAddress);
    return result;
  }
  get nextSibling() {
    marshalNode(this);
    C._ts_node_next_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  get previousSibling() {
    marshalNode(this);
    C._ts_node_prev_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  get nextNamedSibling() {
    marshalNode(this);
    C._ts_node_next_named_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  get previousNamedSibling() {
    marshalNode(this);
    C._ts_node_prev_named_sibling_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  get descendantCount() {
    marshalNode(this);
    return C._ts_node_descendant_count_wasm(this.tree[0]);
  }
  get parent() {
    marshalNode(this);
    C._ts_node_parent_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  childWithDescendant(descendant) {
    marshalNode(this);
    marshalNode(descendant, 1);
    C._ts_node_child_with_descendant_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  descendantForIndex(start2, end = start2) {
    if (typeof start2 !== "number" || typeof end !== "number") {
      throw new Error("Arguments must be numbers");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, start2, "i32");
    C.setValue(address + SIZE_OF_INT, end, "i32");
    C._ts_node_descendant_for_index_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  namedDescendantForIndex(start2, end = start2) {
    if (typeof start2 !== "number" || typeof end !== "number") {
      throw new Error("Arguments must be numbers");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    C.setValue(address, start2, "i32");
    C.setValue(address + SIZE_OF_INT, end, "i32");
    C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  descendantForPosition(start2, end = start2) {
    if (!isPoint(start2) || !isPoint(end)) {
      throw new Error("Arguments must be {row, column} objects");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    marshalPoint(address, start2);
    marshalPoint(address + SIZE_OF_POINT, end);
    C._ts_node_descendant_for_position_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  namedDescendantForPosition(start2, end = start2) {
    if (!isPoint(start2) || !isPoint(end)) {
      throw new Error("Arguments must be {row, column} objects");
    }
    marshalNode(this);
    const address = TRANSFER_BUFFER + SIZE_OF_NODE;
    marshalPoint(address, start2);
    marshalPoint(address + SIZE_OF_POINT, end);
    C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
    return unmarshalNode(this.tree);
  }
  walk() {
    marshalNode(this);
    C._ts_tree_cursor_new_wasm(this.tree[0]);
    return new TreeCursor(INTERNAL, this.tree);
  }
  edit(edit) {
    if (this.startIndex >= edit.oldEndIndex) {
      this.startIndex = edit.newEndIndex + (this.startIndex - edit.oldEndIndex);
      let subbedPointRow;
      let subbedPointColumn;
      if (this.startPosition.row > edit.oldEndPosition.row) {
        subbedPointRow = this.startPosition.row - edit.oldEndPosition.row;
        subbedPointColumn = this.startPosition.column;
      } else {
        subbedPointRow = 0;
        subbedPointColumn = this.startPosition.column;
        if (this.startPosition.column >= edit.oldEndPosition.column) {
          subbedPointColumn = this.startPosition.column - edit.oldEndPosition.column;
        }
      }
      if (subbedPointRow > 0) {
        this.startPosition.row += subbedPointRow;
        this.startPosition.column = subbedPointColumn;
      } else {
        this.startPosition.column += subbedPointColumn;
      }
    } else if (this.startIndex > edit.startIndex) {
      this.startIndex = edit.newEndIndex;
      this.startPosition.row = edit.newEndPosition.row;
      this.startPosition.column = edit.newEndPosition.column;
    }
  }
  toString() {
    marshalNode(this);
    const address = C._ts_node_to_string_wasm(this.tree[0]);
    const result = C.AsciiToString(address);
    C._free(address);
    return result;
  }
};
function unmarshalCaptures(query, tree, address, patternIndex, result) {
  for (let i2 = 0, n = result.length;i2 < n; i2++) {
    const captureIndex = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    const node = unmarshalNode(tree, address);
    address += SIZE_OF_NODE;
    result[i2] = { patternIndex, name: query.captureNames[captureIndex], node };
  }
  return address;
}
__name(unmarshalCaptures, "unmarshalCaptures");
function marshalNode(node, index = 0) {
  let address = TRANSFER_BUFFER + index * SIZE_OF_NODE;
  C.setValue(address, node.id, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.row, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.column, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node[0], "i32");
}
__name(marshalNode, "marshalNode");
function unmarshalNode(tree, address = TRANSFER_BUFFER) {
  const id = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  if (id === 0)
    return null;
  const index = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const row = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const column = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const other = C.getValue(address, "i32");
  const result = new Node(INTERNAL, {
    id,
    tree,
    startIndex: index,
    startPosition: { row, column },
    other
  });
  return result;
}
__name(unmarshalNode, "unmarshalNode");
function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
  C.setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
  C.setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
  C.setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
  C.setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
}
__name(marshalTreeCursor, "marshalTreeCursor");
function unmarshalTreeCursor(cursor) {
  cursor[0] = C.getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
  cursor[1] = C.getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
  cursor[2] = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
  cursor[3] = C.getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
}
__name(unmarshalTreeCursor, "unmarshalTreeCursor");
function marshalPoint(address, point) {
  C.setValue(address, point.row, "i32");
  C.setValue(address + SIZE_OF_INT, point.column, "i32");
}
__name(marshalPoint, "marshalPoint");
function unmarshalPoint(address) {
  const result = {
    row: C.getValue(address, "i32") >>> 0,
    column: C.getValue(address + SIZE_OF_INT, "i32") >>> 0
  };
  return result;
}
__name(unmarshalPoint, "unmarshalPoint");
function marshalRange(address, range) {
  marshalPoint(address, range.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, range.endPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, range.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, range.endIndex, "i32");
  address += SIZE_OF_INT;
}
__name(marshalRange, "marshalRange");
function unmarshalRange(address) {
  const result = {};
  result.startPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.endPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.startIndex = C.getValue(address, "i32") >>> 0;
  address += SIZE_OF_INT;
  result.endIndex = C.getValue(address, "i32") >>> 0;
  return result;
}
__name(unmarshalRange, "unmarshalRange");
function marshalEdit(edit, address = TRANSFER_BUFFER) {
  marshalPoint(address, edit.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.oldEndPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.newEndPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, edit.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.oldEndIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.newEndIndex, "i32");
  address += SIZE_OF_INT;
}
__name(marshalEdit, "marshalEdit");
function unmarshalLanguageMetadata(address) {
  const major_version = C.getValue(address, "i32");
  const minor_version = C.getValue(address += SIZE_OF_INT, "i32");
  const patch_version = C.getValue(address += SIZE_OF_INT, "i32");
  return { major_version, minor_version, patch_version };
}
__name(unmarshalLanguageMetadata, "unmarshalLanguageMetadata");
var PREDICATE_STEP_TYPE_CAPTURE = 1;
var PREDICATE_STEP_TYPE_STRING = 2;
var QUERY_WORD_REGEX = /[\w-]+/g;
var CaptureQuantifier = {
  Zero: 0,
  ZeroOrOne: 1,
  ZeroOrMore: 2,
  One: 3,
  OneOrMore: 4
};
var isCaptureStep = /* @__PURE__ */ __name((step) => step.type === "capture", "isCaptureStep");
var isStringStep = /* @__PURE__ */ __name((step) => step.type === "string", "isStringStep");
var QueryErrorKind = {
  Syntax: 1,
  NodeName: 2,
  FieldName: 3,
  CaptureName: 4,
  PatternStructure: 5
};
var QueryError = class _QueryError extends Error {
  constructor(kind, info2, index, length) {
    super(_QueryError.formatMessage(kind, info2));
    this.kind = kind;
    this.info = info2;
    this.index = index;
    this.length = length;
    this.name = "QueryError";
  }
  static {
    __name(this, "QueryError");
  }
  static formatMessage(kind, info2) {
    switch (kind) {
      case QueryErrorKind.NodeName:
        return `Bad node name '${info2.word}'`;
      case QueryErrorKind.FieldName:
        return `Bad field name '${info2.word}'`;
      case QueryErrorKind.CaptureName:
        return `Bad capture name @${info2.word}`;
      case QueryErrorKind.PatternStructure:
        return `Bad pattern structure at offset ${info2.suffix}`;
      case QueryErrorKind.Syntax:
        return `Bad syntax at offset ${info2.suffix}`;
    }
  }
};
function parseAnyPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`);
  }
  if (!isCaptureStep(steps[1])) {
    throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`);
  }
  const isPositive = operator === "eq?" || operator === "any-eq?";
  const matchAll = !operator.startsWith("any-");
  if (isCaptureStep(steps[2])) {
    const captureName1 = steps[1].name;
    const captureName2 = steps[2].name;
    textPredicates[index].push((captures) => {
      const nodes1 = [];
      const nodes2 = [];
      for (const c of captures) {
        if (c.name === captureName1)
          nodes1.push(c.node);
        if (c.name === captureName2)
          nodes2.push(c.node);
      }
      const compare = /* @__PURE__ */ __name((n1, n2, positive) => {
        return positive ? n1.text === n2.text : n1.text !== n2.text;
      }, "compare");
      return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
    });
  } else {
    const captureName = steps[1].name;
    const stringValue = steps[2].value;
    const matches = /* @__PURE__ */ __name((n) => n.text === stringValue, "matches");
    const doesNotMatch = /* @__PURE__ */ __name((n) => n.text !== stringValue, "doesNotMatch");
    textPredicates[index].push((captures) => {
      const nodes = [];
      for (const c of captures) {
        if (c.name === captureName)
          nodes.push(c.node);
      }
      const test = isPositive ? matches : doesNotMatch;
      return matchAll ? nodes.every(test) : nodes.some(test);
    });
  }
}
__name(parseAnyPredicate, "parseAnyPredicate");
function parseMatchPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`);
  }
  if (steps[1].type !== "capture") {
    throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
  }
  if (steps[2].type !== "string") {
    throw new Error(`Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].name}.`);
  }
  const isPositive = operator === "match?" || operator === "any-match?";
  const matchAll = !operator.startsWith("any-");
  const captureName = steps[1].name;
  const regex = new RegExp(steps[2].value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c of captures) {
      if (c.name === captureName)
        nodes.push(c.node.text);
    }
    const test = /* @__PURE__ */ __name((text, positive) => {
      return positive ? regex.test(text) : !regex.test(text);
    }, "test");
    if (nodes.length === 0)
      return !isPositive;
    return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
  });
}
__name(parseMatchPredicate, "parseMatchPredicate");
function parseAnyOfPredicate(steps, index, operator, textPredicates) {
  if (steps.length < 2) {
    throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`);
  }
  if (steps[1].type !== "capture") {
    throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
  }
  const isPositive = operator === "any-of?";
  const captureName = steps[1].name;
  const stringSteps = steps.slice(2);
  if (!stringSteps.every(isStringStep)) {
    throw new Error(`Arguments to \`#${operator}\` predicate must be strings.".`);
  }
  const values = stringSteps.map((s) => s.value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c of captures) {
      if (c.name === captureName)
        nodes.push(c.node.text);
    }
    if (nodes.length === 0)
      return !isPositive;
    return nodes.every((text) => values.includes(text)) === isPositive;
  });
}
__name(parseAnyOfPredicate, "parseAnyOfPredicate");
function parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
  }
  if (!steps.every(isStringStep)) {
    throw new Error(`Arguments to \`#${operator}\` predicate must be strings.".`);
  }
  const properties = operator === "is?" ? assertedProperties : refutedProperties;
  if (!properties[index])
    properties[index] = {};
  properties[index][steps[1].value] = steps[2]?.value ?? null;
}
__name(parseIsPredicate, "parseIsPredicate");
function parseSetDirective(steps, index, setProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
  }
  if (!steps.every(isStringStep)) {
    throw new Error(`Arguments to \`#set!\` predicate must be strings.".`);
  }
  if (!setProperties[index])
    setProperties[index] = {};
  setProperties[index][steps[1].value] = steps[2]?.value ?? null;
}
__name(parseSetDirective, "parseSetDirective");
function parsePattern(index, stepType, stepValueId, captureNames, stringValues, steps, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
  if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
    const name2 = captureNames[stepValueId];
    steps.push({ type: "capture", name: name2 });
  } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
    steps.push({ type: "string", value: stringValues[stepValueId] });
  } else if (steps.length > 0) {
    if (steps[0].type !== "string") {
      throw new Error("Predicates must begin with a literal value");
    }
    const operator = steps[0].value;
    switch (operator) {
      case "any-not-eq?":
      case "not-eq?":
      case "any-eq?":
      case "eq?":
        parseAnyPredicate(steps, index, operator, textPredicates);
        break;
      case "any-not-match?":
      case "not-match?":
      case "any-match?":
      case "match?":
        parseMatchPredicate(steps, index, operator, textPredicates);
        break;
      case "not-any-of?":
      case "any-of?":
        parseAnyOfPredicate(steps, index, operator, textPredicates);
        break;
      case "is?":
      case "is-not?":
        parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties);
        break;
      case "set!":
        parseSetDirective(steps, index, setProperties);
        break;
      default:
        predicates[index].push({ operator, operands: steps.slice(1) });
    }
    steps.length = 0;
  }
}
__name(parsePattern, "parsePattern");
var Query = class {
  static {
    __name(this, "Query");
  }
  [0] = 0;
  exceededMatchLimit;
  textPredicates;
  captureNames;
  captureQuantifiers;
  predicates;
  setProperties;
  assertedProperties;
  refutedProperties;
  matchLimit;
  constructor(language, source) {
    const sourceLength = C.lengthBytesUTF8(source);
    const sourceAddress = C._malloc(sourceLength + 1);
    C.stringToUTF8(source, sourceAddress, sourceLength + 1);
    const address = C._ts_query_new(language[0], sourceAddress, sourceLength, TRANSFER_BUFFER, TRANSFER_BUFFER + SIZE_OF_INT);
    if (!address) {
      const errorId = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const errorByte = C.getValue(TRANSFER_BUFFER, "i32");
      const errorIndex = C.UTF8ToString(sourceAddress, errorByte).length;
      const suffix = source.slice(errorIndex, errorIndex + 100).split(`
`)[0];
      const word = suffix.match(QUERY_WORD_REGEX)?.[0] ?? "";
      C._free(sourceAddress);
      switch (errorId) {
        case QueryErrorKind.Syntax:
          throw new QueryError(QueryErrorKind.Syntax, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
        case QueryErrorKind.NodeName:
          throw new QueryError(errorId, { word }, errorIndex, word.length);
        case QueryErrorKind.FieldName:
          throw new QueryError(errorId, { word }, errorIndex, word.length);
        case QueryErrorKind.CaptureName:
          throw new QueryError(errorId, { word }, errorIndex, word.length);
        case QueryErrorKind.PatternStructure:
          throw new QueryError(errorId, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
      }
    }
    const stringCount = C._ts_query_string_count(address);
    const captureCount = C._ts_query_capture_count(address);
    const patternCount = C._ts_query_pattern_count(address);
    const captureNames = new Array(captureCount);
    const captureQuantifiers = new Array(patternCount);
    const stringValues = new Array(stringCount);
    for (let i2 = 0;i2 < captureCount; i2++) {
      const nameAddress = C._ts_query_capture_name_for_id(address, i2, TRANSFER_BUFFER);
      const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
      captureNames[i2] = C.UTF8ToString(nameAddress, nameLength);
    }
    for (let i2 = 0;i2 < patternCount; i2++) {
      const captureQuantifiersArray = new Array(captureCount);
      for (let j = 0;j < captureCount; j++) {
        const quantifier = C._ts_query_capture_quantifier_for_id(address, i2, j);
        captureQuantifiersArray[j] = quantifier;
      }
      captureQuantifiers[i2] = captureQuantifiersArray;
    }
    for (let i2 = 0;i2 < stringCount; i2++) {
      const valueAddress = C._ts_query_string_value_for_id(address, i2, TRANSFER_BUFFER);
      const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
      stringValues[i2] = C.UTF8ToString(valueAddress, nameLength);
    }
    const setProperties = new Array(patternCount);
    const assertedProperties = new Array(patternCount);
    const refutedProperties = new Array(patternCount);
    const predicates = new Array(patternCount);
    const textPredicates = new Array(patternCount);
    for (let i2 = 0;i2 < patternCount; i2++) {
      const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
      const stepCount = C.getValue(TRANSFER_BUFFER, "i32");
      predicates[i2] = [];
      textPredicates[i2] = [];
      const steps = new Array;
      let stepAddress = predicatesAddress;
      for (let j = 0;j < stepCount; j++) {
        const stepType = C.getValue(stepAddress, "i32");
        stepAddress += SIZE_OF_INT;
        const stepValueId = C.getValue(stepAddress, "i32");
        stepAddress += SIZE_OF_INT;
        parsePattern(i2, stepType, stepValueId, captureNames, stringValues, steps, textPredicates, predicates, setProperties, assertedProperties, refutedProperties);
      }
      Object.freeze(textPredicates[i2]);
      Object.freeze(predicates[i2]);
      Object.freeze(setProperties[i2]);
      Object.freeze(assertedProperties[i2]);
      Object.freeze(refutedProperties[i2]);
    }
    C._free(sourceAddress);
    this[0] = address;
    this.captureNames = captureNames;
    this.captureQuantifiers = captureQuantifiers;
    this.textPredicates = textPredicates;
    this.predicates = predicates;
    this.setProperties = setProperties;
    this.assertedProperties = assertedProperties;
    this.refutedProperties = refutedProperties;
    this.exceededMatchLimit = false;
  }
  delete() {
    C._ts_query_delete(this[0]);
    this[0] = 0;
  }
  matches(node, options = {}) {
    const startPosition = options.startPosition ?? ZERO_POINT;
    const endPosition = options.endPosition ?? ZERO_POINT;
    const startIndex = options.startIndex ?? 0;
    const endIndex = options.endIndex ?? 0;
    const matchLimit = options.matchLimit ?? 4294967295;
    const maxStartDepth = options.maxStartDepth ?? 4294967295;
    const timeoutMicros = options.timeoutMicros ?? 0;
    const progressCallback = options.progressCallback;
    if (typeof matchLimit !== "number") {
      throw new Error("Arguments must be numbers");
    }
    this.matchLimit = matchLimit;
    if (endIndex !== 0 && startIndex > endIndex) {
      throw new Error("`startIndex` cannot be greater than `endIndex`");
    }
    if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
      throw new Error("`startPosition` cannot be greater than `endPosition`");
    }
    if (progressCallback) {
      C.currentQueryProgressCallback = progressCallback;
    }
    marshalNode(node);
    C._ts_query_matches_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth, timeoutMicros);
    const rawCount = C.getValue(TRANSFER_BUFFER, "i32");
    const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
    const result = new Array(rawCount);
    this.exceededMatchLimit = Boolean(didExceedMatchLimit);
    let filteredCount = 0;
    let address = startAddress;
    for (let i2 = 0;i2 < rawCount; i2++) {
      const patternIndex = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captureCount = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captures = new Array(captureCount);
      address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
      if (this.textPredicates[patternIndex].every((p) => p(captures))) {
        result[filteredCount] = { pattern: patternIndex, patternIndex, captures };
        const setProperties = this.setProperties[patternIndex];
        result[filteredCount].setProperties = setProperties;
        const assertedProperties = this.assertedProperties[patternIndex];
        result[filteredCount].assertedProperties = assertedProperties;
        const refutedProperties = this.refutedProperties[patternIndex];
        result[filteredCount].refutedProperties = refutedProperties;
        filteredCount++;
      }
    }
    result.length = filteredCount;
    C._free(startAddress);
    C.currentQueryProgressCallback = null;
    return result;
  }
  captures(node, options = {}) {
    const startPosition = options.startPosition ?? ZERO_POINT;
    const endPosition = options.endPosition ?? ZERO_POINT;
    const startIndex = options.startIndex ?? 0;
    const endIndex = options.endIndex ?? 0;
    const matchLimit = options.matchLimit ?? 4294967295;
    const maxStartDepth = options.maxStartDepth ?? 4294967295;
    const timeoutMicros = options.timeoutMicros ?? 0;
    const progressCallback = options.progressCallback;
    if (typeof matchLimit !== "number") {
      throw new Error("Arguments must be numbers");
    }
    this.matchLimit = matchLimit;
    if (endIndex !== 0 && startIndex > endIndex) {
      throw new Error("`startIndex` cannot be greater than `endIndex`");
    }
    if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
      throw new Error("`startPosition` cannot be greater than `endPosition`");
    }
    if (progressCallback) {
      C.currentQueryProgressCallback = progressCallback;
    }
    marshalNode(node);
    C._ts_query_captures_wasm(this[0], node.tree[0], startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth, timeoutMicros);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
    const result = new Array;
    this.exceededMatchLimit = Boolean(didExceedMatchLimit);
    const captures = new Array;
    let address = startAddress;
    for (let i2 = 0;i2 < count; i2++) {
      const patternIndex = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captureCount = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const captureIndex = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      captures.length = captureCount;
      address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
      if (this.textPredicates[patternIndex].every((p) => p(captures))) {
        const capture = captures[captureIndex];
        const setProperties = this.setProperties[patternIndex];
        capture.setProperties = setProperties;
        const assertedProperties = this.assertedProperties[patternIndex];
        capture.assertedProperties = assertedProperties;
        const refutedProperties = this.refutedProperties[patternIndex];
        capture.refutedProperties = refutedProperties;
        result.push(capture);
      }
    }
    C._free(startAddress);
    C.currentQueryProgressCallback = null;
    return result;
  }
  predicatesForPattern(patternIndex) {
    return this.predicates[patternIndex];
  }
  disableCapture(captureName) {
    const captureNameLength = C.lengthBytesUTF8(captureName);
    const captureNameAddress = C._malloc(captureNameLength + 1);
    C.stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
    C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
    C._free(captureNameAddress);
  }
  disablePattern(patternIndex) {
    if (patternIndex >= this.predicates.length) {
      throw new Error(`Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`);
    }
    C._ts_query_disable_pattern(this[0], patternIndex);
  }
  didExceedMatchLimit() {
    return this.exceededMatchLimit;
  }
  startIndexForPattern(patternIndex) {
    if (patternIndex >= this.predicates.length) {
      throw new Error(`Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`);
    }
    return C._ts_query_start_byte_for_pattern(this[0], patternIndex);
  }
  endIndexForPattern(patternIndex) {
    if (patternIndex >= this.predicates.length) {
      throw new Error(`Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`);
    }
    return C._ts_query_end_byte_for_pattern(this[0], patternIndex);
  }
  patternCount() {
    return C._ts_query_pattern_count(this[0]);
  }
  captureIndexForName(captureName) {
    return this.captureNames.indexOf(captureName);
  }
  isPatternRooted(patternIndex) {
    return C._ts_query_is_pattern_rooted(this[0], patternIndex) === 1;
  }
  isPatternNonLocal(patternIndex) {
    return C._ts_query_is_pattern_non_local(this[0], patternIndex) === 1;
  }
  isPatternGuaranteedAtStep(byteIndex) {
    return C._ts_query_is_pattern_guaranteed_at_step(this[0], byteIndex) === 1;
  }
};
var LANGUAGE_FUNCTION_REGEX = /^tree_sitter_\w+$/;
var Language = class _Language {
  static {
    __name(this, "Language");
  }
  [0] = 0;
  types;
  fields;
  constructor(internal, address) {
    assertInternal(internal);
    this[0] = address;
    this.types = new Array(C._ts_language_symbol_count(this[0]));
    for (let i2 = 0, n = this.types.length;i2 < n; i2++) {
      if (C._ts_language_symbol_type(this[0], i2) < 2) {
        this.types[i2] = C.UTF8ToString(C._ts_language_symbol_name(this[0], i2));
      }
    }
    this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
    for (let i2 = 0, n = this.fields.length;i2 < n; i2++) {
      const fieldName = C._ts_language_field_name_for_id(this[0], i2);
      if (fieldName !== 0) {
        this.fields[i2] = C.UTF8ToString(fieldName);
      } else {
        this.fields[i2] = null;
      }
    }
  }
  get name() {
    const ptr = C._ts_language_name(this[0]);
    if (ptr === 0)
      return null;
    return C.UTF8ToString(ptr);
  }
  get version() {
    return C._ts_language_version(this[0]);
  }
  get abiVersion() {
    return C._ts_language_abi_version(this[0]);
  }
  get metadata() {
    C._ts_language_metadata(this[0]);
    const length = C.getValue(TRANSFER_BUFFER, "i32");
    const address = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    if (length === 0)
      return null;
    return unmarshalLanguageMetadata(address);
  }
  get fieldCount() {
    return this.fields.length - 1;
  }
  get stateCount() {
    return C._ts_language_state_count(this[0]);
  }
  fieldIdForName(fieldName) {
    const result = this.fields.indexOf(fieldName);
    return result !== -1 ? result : null;
  }
  fieldNameForId(fieldId) {
    return this.fields[fieldId] ?? null;
  }
  idForNodeType(type, named) {
    const typeLength = C.lengthBytesUTF8(type);
    const typeAddress = C._malloc(typeLength + 1);
    C.stringToUTF8(type, typeAddress, typeLength + 1);
    const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named ? 1 : 0);
    C._free(typeAddress);
    return result || null;
  }
  get nodeTypeCount() {
    return C._ts_language_symbol_count(this[0]);
  }
  nodeTypeForId(typeId) {
    const name2 = C._ts_language_symbol_name(this[0], typeId);
    return name2 ? C.UTF8ToString(name2) : null;
  }
  nodeTypeIsNamed(typeId) {
    return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
  }
  nodeTypeIsVisible(typeId) {
    return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
  }
  get supertypes() {
    C._ts_language_supertypes_wasm(this[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0;i2 < count; i2++) {
        result[i2] = C.getValue(address, "i16");
        address += SIZE_OF_SHORT;
      }
    }
    return result;
  }
  subtypes(supertype) {
    C._ts_language_subtypes_wasm(this[0], supertype);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0;i2 < count; i2++) {
        result[i2] = C.getValue(address, "i16");
        address += SIZE_OF_SHORT;
      }
    }
    return result;
  }
  nextState(stateId, typeId) {
    return C._ts_language_next_state(this[0], stateId, typeId);
  }
  lookaheadIterator(stateId) {
    const address = C._ts_lookahead_iterator_new(this[0], stateId);
    if (address)
      return new LookaheadIterator(INTERNAL, address, this);
    return null;
  }
  query(source) {
    console.warn("Language.query is deprecated. Use new Query(language, source) instead.");
    return new Query(this, source);
  }
  static async load(input) {
    let bytes;
    if (input instanceof Uint8Array) {
      bytes = Promise.resolve(input);
    } else {
      if (globalThis.process?.versions.node) {
        const fs2 = await import("fs/promises");
        bytes = fs2.readFile(input);
      } else {
        bytes = fetch(input).then((response) => response.arrayBuffer().then((buffer) => {
          if (response.ok) {
            return new Uint8Array(buffer);
          } else {
            const body2 = new TextDecoder("utf-8").decode(buffer);
            throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
          }
        }));
      }
    }
    const mod = await C.loadWebAssemblyModule(await bytes, { loadAsync: true });
    const symbolNames = Object.keys(mod);
    const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
    if (!functionName) {
      console.log(`Couldn't find language function in WASM file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
      throw new Error("Language.load failed: no language function found in WASM file");
    }
    const languageAddress = mod[functionName]();
    return new _Language(INTERNAL, languageAddress);
  }
};
var Module2 = (() => {
  var _scriptName = import.meta.url;
  return async function(moduleArg = {}) {
    var moduleRtn;
    var Module = moduleArg;
    var readyPromiseResolve, readyPromiseReject;
    var readyPromise = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string" && process.type != "renderer";
    var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
    if (ENVIRONMENT_IS_NODE) {
      const { createRequire } = await import("module");
      var require = createRequire(import.meta.url);
    }
    Module.currentQueryProgressCallback = null;
    Module.currentProgressCallback = null;
    Module.currentLogCallback = null;
    Module.currentParseCallback = null;
    var moduleOverrides = Object.assign({}, Module);
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = /* @__PURE__ */ __name((status, toThrow) => {
      throw toThrow;
    }, "quit_");
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    __name(locateFile, "locateFile");
    var readAsync, readBinary;
    if (ENVIRONMENT_IS_NODE) {
      var fs = require("fs");
      var nodePath = require("path");
      if (!import.meta.url.startsWith("data:")) {
        scriptDirectory = nodePath.dirname(require("url").fileURLToPath(import.meta.url)) + "/";
      }
      readBinary = /* @__PURE__ */ __name((filename) => {
        filename = isFileURI(filename) ? new URL(filename) : filename;
        var ret = fs.readFileSync(filename);
        return ret;
      }, "readBinary");
      readAsync = /* @__PURE__ */ __name(async (filename, binary2 = true) => {
        filename = isFileURI(filename) ? new URL(filename) : filename;
        var ret = fs.readFileSync(filename, binary2 ? undefined : "utf8");
        return ret;
      }, "readAsync");
      if (!Module["thisProgram"] && process.argv.length > 1) {
        thisProgram = process.argv[1].replace(/\\/g, "/");
      }
      arguments_ = process.argv.slice(2);
      quit_ = /* @__PURE__ */ __name((status, toThrow) => {
        process.exitCode = status;
        throw toThrow;
      }, "quit_");
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptName) {
        scriptDirectory = _scriptName;
      }
      if (scriptDirectory.startsWith("blob:")) {
        scriptDirectory = "";
      } else {
        scriptDirectory = scriptDirectory.slice(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
      }
      {
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = /* @__PURE__ */ __name((url) => {
            var xhr = new XMLHttpRequest;
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
          }, "readBinary");
        }
        readAsync = /* @__PURE__ */ __name(async (url) => {
          if (isFileURI(url)) {
            return new Promise((resolve, reject) => {
              var xhr = new XMLHttpRequest;
              xhr.open("GET", url, true);
              xhr.responseType = "arraybuffer";
              xhr.onload = () => {
                if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                  resolve(xhr.response);
                  return;
                }
                reject(xhr.status);
              };
              xhr.onerror = reject;
              xhr.send(null);
            });
          }
          var response = await fetch(url, {
            credentials: "same-origin"
          });
          if (response.ok) {
            return response.arrayBuffer();
          }
          throw new Error(response.status + " : " + response.url);
        }, "readAsync");
      }
    }
    var out = Module["print"] || console.log.bind(console);
    var err = Module["printErr"] || console.error.bind(console);
    Object.assign(Module, moduleOverrides);
    moduleOverrides = null;
    if (Module["arguments"])
      arguments_ = Module["arguments"];
    if (Module["thisProgram"])
      thisProgram = Module["thisProgram"];
    var dynamicLibraries = Module["dynamicLibraries"] || [];
    var wasmBinary = Module["wasmBinary"];
    var wasmMemory;
    var ABORT = false;
    var EXITSTATUS;
    function assert(condition, text) {
      if (!condition) {
        abort(text);
      }
    }
    __name(assert, "assert");
    var HEAP, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAP64, HEAPU64, HEAPF64;
    var HEAP_DATA_VIEW;
    var runtimeInitialized = false;
    var isFileURI = /* @__PURE__ */ __name((filename) => filename.startsWith("file://"), "isFileURI");
    function updateMemoryViews() {
      var b = wasmMemory.buffer;
      Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
      Module["HEAP8"] = HEAP8 = new Int8Array(b);
      Module["HEAP16"] = HEAP16 = new Int16Array(b);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
      Module["HEAP32"] = HEAP32 = new Int32Array(b);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
      Module["HEAP64"] = HEAP64 = new BigInt64Array(b);
      Module["HEAPU64"] = HEAPU64 = new BigUint64Array(b);
    }
    __name(updateMemoryViews, "updateMemoryViews");
    if (Module["wasmMemory"]) {
      wasmMemory = Module["wasmMemory"];
    } else {
      var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
      wasmMemory = new WebAssembly.Memory({
        initial: INITIAL_MEMORY / 65536,
        maximum: 32768
      });
    }
    updateMemoryViews();
    var __RELOC_FUNCS__ = [];
    function preRun() {
      if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function")
          Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
          addOnPreRun(Module["preRun"].shift());
        }
      }
      callRuntimeCallbacks(onPreRuns);
    }
    __name(preRun, "preRun");
    function initRuntime() {
      runtimeInitialized = true;
      callRuntimeCallbacks(__RELOC_FUNCS__);
      wasmExports["__wasm_call_ctors"]();
      callRuntimeCallbacks(onPostCtors);
    }
    __name(initRuntime, "initRuntime");
    function preMain() {}
    __name(preMain, "preMain");
    function postRun() {
      if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function")
          Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
          addOnPostRun(Module["postRun"].shift());
        }
      }
      callRuntimeCallbacks(onPostRuns);
    }
    __name(postRun, "postRun");
    var runDependencies = 0;
    var dependenciesFulfilled = null;
    function getUniqueRunDependency(id) {
      return id;
    }
    __name(getUniqueRunDependency, "getUniqueRunDependency");
    function addRunDependency(id) {
      runDependencies++;
      Module["monitorRunDependencies"]?.(runDependencies);
    }
    __name(addRunDependency, "addRunDependency");
    function removeRunDependency(id) {
      runDependencies--;
      Module["monitorRunDependencies"]?.(runDependencies);
      if (runDependencies == 0) {
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    __name(removeRunDependency, "removeRunDependency");
    function abort(what) {
      Module["onAbort"]?.(what);
      what = "Aborted(" + what + ")";
      err(what);
      ABORT = true;
      what += ". Build with -sASSERTIONS for more info.";
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    __name(abort, "abort");
    var wasmBinaryFile;
    function findWasmBinary() {
      if (Module["locateFile"]) {
        return locateFile("tree-sitter.wasm");
      }
      return new URL("tree-sitter.wasm", import.meta.url).href;
    }
    __name(findWasmBinary, "findWasmBinary");
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw "both async and sync fetching of the wasm failed";
    }
    __name(getBinarySync, "getBinarySync");
    async function getWasmBinary(binaryFile) {
      if (!wasmBinary) {
        try {
          var response = await readAsync(binaryFile);
          return new Uint8Array(response);
        } catch {}
      }
      return getBinarySync(binaryFile);
    }
    __name(getWasmBinary, "getWasmBinary");
    async function instantiateArrayBuffer(binaryFile, imports) {
      try {
        var binary2 = await getWasmBinary(binaryFile);
        var instance2 = await WebAssembly.instantiate(binary2, imports);
        return instance2;
      } catch (reason) {
        err(`failed to asynchronously prepare wasm: ${reason}`);
        abort(reason);
      }
    }
    __name(instantiateArrayBuffer, "instantiateArrayBuffer");
    async function instantiateAsync(binary2, binaryFile, imports) {
      if (!binary2 && typeof WebAssembly.instantiateStreaming == "function" && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
        try {
          var response = fetch(binaryFile, {
            credentials: "same-origin"
          });
          var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
          return instantiationResult;
        } catch (reason) {
          err(`wasm streaming compile failed: ${reason}`);
          err("falling back to ArrayBuffer instantiation");
        }
      }
      return instantiateArrayBuffer(binaryFile, imports);
    }
    __name(instantiateAsync, "instantiateAsync");
    function getWasmImports() {
      return {
        env: wasmImports,
        wasi_snapshot_preview1: wasmImports,
        "GOT.mem": new Proxy(wasmImports, GOTHandler),
        "GOT.func": new Proxy(wasmImports, GOTHandler)
      };
    }
    __name(getWasmImports, "getWasmImports");
    async function createWasm() {
      function receiveInstance(instance2, module2) {
        wasmExports = instance2.exports;
        wasmExports = relocateExports(wasmExports, 1024);
        var metadata2 = getDylinkMetadata(module2);
        if (metadata2.neededDynlibs) {
          dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
        }
        mergeLibSymbols(wasmExports, "main");
        LDSO.init();
        loadDylibs();
        __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
        removeRunDependency("wasm-instantiate");
        return wasmExports;
      }
      __name(receiveInstance, "receiveInstance");
      addRunDependency("wasm-instantiate");
      function receiveInstantiationResult(result2) {
        return receiveInstance(result2["instance"], result2["module"]);
      }
      __name(receiveInstantiationResult, "receiveInstantiationResult");
      var info2 = getWasmImports();
      if (Module["instantiateWasm"]) {
        return new Promise((resolve, reject) => {
          Module["instantiateWasm"](info2, (mod, inst) => {
            receiveInstance(mod, inst);
            resolve(mod.exports);
          });
        });
      }
      wasmBinaryFile ??= findWasmBinary();
      try {
        var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info2);
        var exports = receiveInstantiationResult(result);
        return exports;
      } catch (e) {
        readyPromiseReject(e);
        return Promise.reject(e);
      }
    }
    __name(createWasm, "createWasm");
    var ASM_CONSTS = {};

    class ExitStatus {
      static {
        __name(this, "ExitStatus");
      }
      name = "ExitStatus";
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }
    var GOT = {};
    var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
    var GOTHandler = {
      get(obj, symName) {
        var rtn = GOT[symName];
        if (!rtn) {
          rtn = GOT[symName] = new WebAssembly.Global({
            value: "i32",
            mutable: true
          });
        }
        if (!currentModuleWeakSymbols.has(symName)) {
          rtn.required = true;
        }
        return rtn;
      }
    };
    var LE_HEAP_LOAD_F32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true), "LE_HEAP_LOAD_F32");
    var LE_HEAP_LOAD_F64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true), "LE_HEAP_LOAD_F64");
    var LE_HEAP_LOAD_I16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true), "LE_HEAP_LOAD_I16");
    var LE_HEAP_LOAD_I32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true), "LE_HEAP_LOAD_I32");
    var LE_HEAP_LOAD_U16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint16(byteOffset, true), "LE_HEAP_LOAD_U16");
    var LE_HEAP_LOAD_U32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true), "LE_HEAP_LOAD_U32");
    var LE_HEAP_STORE_F32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true), "LE_HEAP_STORE_F32");
    var LE_HEAP_STORE_F64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true), "LE_HEAP_STORE_F64");
    var LE_HEAP_STORE_I16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true), "LE_HEAP_STORE_I16");
    var LE_HEAP_STORE_I32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true), "LE_HEAP_STORE_I32");
    var LE_HEAP_STORE_U16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint16(byteOffset, value, true), "LE_HEAP_STORE_U16");
    var LE_HEAP_STORE_U32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true), "LE_HEAP_STORE_U32");
    var callRuntimeCallbacks = /* @__PURE__ */ __name((callbacks) => {
      while (callbacks.length > 0) {
        callbacks.shift()(Module);
      }
    }, "callRuntimeCallbacks");
    var onPostRuns = [];
    var addOnPostRun = /* @__PURE__ */ __name((cb) => onPostRuns.unshift(cb), "addOnPostRun");
    var onPreRuns = [];
    var addOnPreRun = /* @__PURE__ */ __name((cb) => onPreRuns.unshift(cb), "addOnPreRun");
    var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder : undefined;
    var UTF8ArrayToString = /* @__PURE__ */ __name((heapOrArray, idx = 0, maxBytesToRead = NaN) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heapOrArray[endPtr] && !(endPtr >= endIdx))
        ++endPtr;
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = "";
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode((u0 & 31) << 6 | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = (u0 & 15) << 12 | u1 << 6 | u2;
        } else {
          u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
        }
      }
      return str;
    }, "UTF8ArrayToString");
    var getDylinkMetadata = /* @__PURE__ */ __name((binary2) => {
      var offset = 0;
      var end = 0;
      function getU8() {
        return binary2[offset++];
      }
      __name(getU8, "getU8");
      function getLEB() {
        var ret = 0;
        var mul = 1;
        while (true) {
          var byte = binary2[offset++];
          ret += (byte & 127) * mul;
          mul *= 128;
          if (!(byte & 128))
            break;
        }
        return ret;
      }
      __name(getLEB, "getLEB");
      function getString() {
        var len = getLEB();
        offset += len;
        return UTF8ArrayToString(binary2, offset - len, len);
      }
      __name(getString, "getString");
      function failIf(condition, message) {
        if (condition)
          throw new Error(message);
      }
      __name(failIf, "failIf");
      var name2 = "dylink.0";
      if (binary2 instanceof WebAssembly.Module) {
        var dylinkSection = WebAssembly.Module.customSections(binary2, name2);
        if (dylinkSection.length === 0) {
          name2 = "dylink";
          dylinkSection = WebAssembly.Module.customSections(binary2, name2);
        }
        failIf(dylinkSection.length === 0, "need dylink section");
        binary2 = new Uint8Array(dylinkSection[0]);
        end = binary2.length;
      } else {
        var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
        var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
        failIf(!magicNumberFound, "need to see wasm magic number");
        failIf(binary2[8] !== 0, "need the dylink section to be first");
        offset = 9;
        var section_size = getLEB();
        end = offset + section_size;
        name2 = getString();
      }
      var customSection = {
        neededDynlibs: [],
        tlsExports: /* @__PURE__ */ new Set,
        weakImports: /* @__PURE__ */ new Set
      };
      if (name2 == "dylink") {
        customSection.memorySize = getLEB();
        customSection.memoryAlign = getLEB();
        customSection.tableSize = getLEB();
        customSection.tableAlign = getLEB();
        var neededDynlibsCount = getLEB();
        for (var i2 = 0;i2 < neededDynlibsCount; ++i2) {
          var libname = getString();
          customSection.neededDynlibs.push(libname);
        }
      } else {
        failIf(name2 !== "dylink.0");
        var WASM_DYLINK_MEM_INFO = 1;
        var WASM_DYLINK_NEEDED = 2;
        var WASM_DYLINK_EXPORT_INFO = 3;
        var WASM_DYLINK_IMPORT_INFO = 4;
        var WASM_SYMBOL_TLS = 256;
        var WASM_SYMBOL_BINDING_MASK = 3;
        var WASM_SYMBOL_BINDING_WEAK = 1;
        while (offset < end) {
          var subsectionType = getU8();
          var subsectionSize = getLEB();
          if (subsectionType === WASM_DYLINK_MEM_INFO) {
            customSection.memorySize = getLEB();
            customSection.memoryAlign = getLEB();
            customSection.tableSize = getLEB();
            customSection.tableAlign = getLEB();
          } else if (subsectionType === WASM_DYLINK_NEEDED) {
            var neededDynlibsCount = getLEB();
            for (var i2 = 0;i2 < neededDynlibsCount; ++i2) {
              libname = getString();
              customSection.neededDynlibs.push(libname);
            }
          } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
            var count = getLEB();
            while (count--) {
              var symname = getString();
              var flags2 = getLEB();
              if (flags2 & WASM_SYMBOL_TLS) {
                customSection.tlsExports.add(symname);
              }
            }
          } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
            var count = getLEB();
            while (count--) {
              var modname = getString();
              var symname = getString();
              var flags2 = getLEB();
              if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
                customSection.weakImports.add(symname);
              }
            }
          } else {
            offset += subsectionSize;
          }
        }
      }
      return customSection;
    }, "getDylinkMetadata");
    function getValue(ptr, type = "i8") {
      if (type.endsWith("*"))
        type = "*";
      switch (type) {
        case "i1":
          return HEAP8[ptr];
        case "i8":
          return HEAP8[ptr];
        case "i16":
          return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
        case "i32":
          return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
        case "i64":
          return HEAP64[ptr >> 3];
        case "float":
          return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
        case "double":
          return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
        case "*":
          return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
        default:
          abort(`invalid type for getValue: ${type}`);
      }
    }
    __name(getValue, "getValue");
    var newDSO = /* @__PURE__ */ __name((name2, handle2, syms) => {
      var dso = {
        refcount: Infinity,
        name: name2,
        exports: syms,
        global: true
      };
      LDSO.loadedLibsByName[name2] = dso;
      if (handle2 != null) {
        LDSO.loadedLibsByHandle[handle2] = dso;
      }
      return dso;
    }, "newDSO");
    var LDSO = {
      loadedLibsByName: {},
      loadedLibsByHandle: {},
      init() {
        newDSO("__main__", 0, wasmImports);
      }
    };
    var ___heap_base = 78224;
    var alignMemory = /* @__PURE__ */ __name((size, alignment) => Math.ceil(size / alignment) * alignment, "alignMemory");
    var getMemory = /* @__PURE__ */ __name((size) => {
      if (runtimeInitialized) {
        return _calloc(size, 1);
      }
      var ret = ___heap_base;
      var end = ret + alignMemory(size, 16);
      ___heap_base = end;
      GOT["__heap_base"].value = end;
      return ret;
    }, "getMemory");
    var isInternalSym = /* @__PURE__ */ __name((symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__"), "isInternalSym");
    var uleb128Encode = /* @__PURE__ */ __name((n, target) => {
      if (n < 128) {
        target.push(n);
      } else {
        target.push(n % 128 | 128, n >> 7);
      }
    }, "uleb128Encode");
    var sigToWasmTypes = /* @__PURE__ */ __name((sig) => {
      var typeNames = {
        i: "i32",
        j: "i64",
        f: "f32",
        d: "f64",
        e: "externref",
        p: "i32"
      };
      var type = {
        parameters: [],
        results: sig[0] == "v" ? [] : [typeNames[sig[0]]]
      };
      for (var i2 = 1;i2 < sig.length; ++i2) {
        type.parameters.push(typeNames[sig[i2]]);
      }
      return type;
    }, "sigToWasmTypes");
    var generateFuncType = /* @__PURE__ */ __name((sig, target) => {
      var sigRet = sig.slice(0, 1);
      var sigParam = sig.slice(1);
      var typeCodes = {
        i: 127,
        p: 127,
        j: 126,
        f: 125,
        d: 124,
        e: 111
      };
      target.push(96);
      uleb128Encode(sigParam.length, target);
      for (var i2 = 0;i2 < sigParam.length; ++i2) {
        target.push(typeCodes[sigParam[i2]]);
      }
      if (sigRet == "v") {
        target.push(0);
      } else {
        target.push(1, typeCodes[sigRet]);
      }
    }, "generateFuncType");
    var convertJsFunctionToWasm = /* @__PURE__ */ __name((func2, sig) => {
      if (typeof WebAssembly.Function == "function") {
        return new WebAssembly.Function(sigToWasmTypes(sig), func2);
      }
      var typeSectionBody = [1];
      generateFuncType(sig, typeSectionBody);
      var bytes = [
        0,
        97,
        115,
        109,
        1,
        0,
        0,
        0,
        1
      ];
      uleb128Encode(typeSectionBody.length, bytes);
      bytes.push(...typeSectionBody);
      bytes.push(2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0);
      var module2 = new WebAssembly.Module(new Uint8Array(bytes));
      var instance2 = new WebAssembly.Instance(module2, {
        e: {
          f: func2
        }
      });
      var wrappedFunc = instance2.exports["f"];
      return wrappedFunc;
    }, "convertJsFunctionToWasm");
    var wasmTableMirror = [];
    var wasmTable = new WebAssembly.Table({
      initial: 31,
      element: "anyfunc"
    });
    var getWasmTableEntry = /* @__PURE__ */ __name((funcPtr) => {
      var func2 = wasmTableMirror[funcPtr];
      if (!func2) {
        if (funcPtr >= wasmTableMirror.length)
          wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
      }
      return func2;
    }, "getWasmTableEntry");
    var updateTableMap = /* @__PURE__ */ __name((offset, count) => {
      if (functionsInTableMap) {
        for (var i2 = offset;i2 < offset + count; i2++) {
          var item = getWasmTableEntry(i2);
          if (item) {
            functionsInTableMap.set(item, i2);
          }
        }
      }
    }, "updateTableMap");
    var functionsInTableMap;
    var getFunctionAddress = /* @__PURE__ */ __name((func2) => {
      if (!functionsInTableMap) {
        functionsInTableMap = /* @__PURE__ */ new WeakMap;
        updateTableMap(0, wasmTable.length);
      }
      return functionsInTableMap.get(func2) || 0;
    }, "getFunctionAddress");
    var freeTableIndexes = [];
    var getEmptyTableSlot = /* @__PURE__ */ __name(() => {
      if (freeTableIndexes.length) {
        return freeTableIndexes.pop();
      }
      try {
        wasmTable.grow(1);
      } catch (err2) {
        if (!(err2 instanceof RangeError)) {
          throw err2;
        }
        throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
      }
      return wasmTable.length - 1;
    }, "getEmptyTableSlot");
    var setWasmTableEntry = /* @__PURE__ */ __name((idx, func2) => {
      wasmTable.set(idx, func2);
      wasmTableMirror[idx] = wasmTable.get(idx);
    }, "setWasmTableEntry");
    var addFunction = /* @__PURE__ */ __name((func2, sig) => {
      var rtn = getFunctionAddress(func2);
      if (rtn) {
        return rtn;
      }
      var ret = getEmptyTableSlot();
      try {
        setWasmTableEntry(ret, func2);
      } catch (err2) {
        if (!(err2 instanceof TypeError)) {
          throw err2;
        }
        var wrapped = convertJsFunctionToWasm(func2, sig);
        setWasmTableEntry(ret, wrapped);
      }
      functionsInTableMap.set(func2, ret);
      return ret;
    }, "addFunction");
    var updateGOT = /* @__PURE__ */ __name((exports, replace) => {
      for (var symName in exports) {
        if (isInternalSym(symName)) {
          continue;
        }
        var value = exports[symName];
        GOT[symName] ||= new WebAssembly.Global({
          value: "i32",
          mutable: true
        });
        if (replace || GOT[symName].value == 0) {
          if (typeof value == "function") {
            GOT[symName].value = addFunction(value);
          } else if (typeof value == "number") {
            GOT[symName].value = value;
          } else {
            err(`unhandled export type for '${symName}': ${typeof value}`);
          }
        }
      }
    }, "updateGOT");
    var relocateExports = /* @__PURE__ */ __name((exports, memoryBase2, replace) => {
      var relocated = {};
      for (var e in exports) {
        var value = exports[e];
        if (typeof value == "object") {
          value = value.value;
        }
        if (typeof value == "number") {
          value += memoryBase2;
        }
        relocated[e] = value;
      }
      updateGOT(relocated, replace);
      return relocated;
    }, "relocateExports");
    var isSymbolDefined = /* @__PURE__ */ __name((symName) => {
      var existing = wasmImports[symName];
      if (!existing || existing.stub) {
        return false;
      }
      return true;
    }, "isSymbolDefined");
    var dynCall = /* @__PURE__ */ __name((sig, ptr, args2 = []) => {
      var rtn = getWasmTableEntry(ptr)(...args2);
      return rtn;
    }, "dynCall");
    var stackSave = /* @__PURE__ */ __name(() => _emscripten_stack_get_current(), "stackSave");
    var stackRestore = /* @__PURE__ */ __name((val) => __emscripten_stack_restore(val), "stackRestore");
    var createInvokeFunction = /* @__PURE__ */ __name((sig) => (ptr, ...args2) => {
      var sp = stackSave();
      try {
        return dynCall(sig, ptr, args2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0)
          throw e;
        _setThrew(1, 0);
        if (sig[0] == "j")
          return 0n;
      }
    }, "createInvokeFunction");
    var resolveGlobalSymbol = /* @__PURE__ */ __name((symName, direct = false) => {
      var sym;
      if (isSymbolDefined(symName)) {
        sym = wasmImports[symName];
      } else if (symName.startsWith("invoke_")) {
        sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
      }
      return {
        sym,
        name: symName
      };
    }, "resolveGlobalSymbol");
    var onPostCtors = [];
    var addOnPostCtor = /* @__PURE__ */ __name((cb) => onPostCtors.unshift(cb), "addOnPostCtor");
    var UTF8ToString = /* @__PURE__ */ __name((ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "", "UTF8ToString");
    var loadWebAssemblyModule = /* @__PURE__ */ __name((binary, flags, libName, localScope, handle) => {
      var metadata = getDylinkMetadata(binary);
      currentModuleWeakSymbols = metadata.weakImports;
      function loadModule() {
        var memAlign = Math.pow(2, metadata.memoryAlign);
        var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
        var tableBase = metadata.tableSize ? wasmTable.length : 0;
        if (handle) {
          HEAP8[handle + 8] = 1;
          LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
          LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
          LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
          LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
        }
        if (metadata.tableSize) {
          wasmTable.grow(metadata.tableSize);
        }
        var moduleExports;
        function resolveSymbol(sym) {
          var resolved = resolveGlobalSymbol(sym).sym;
          if (!resolved && localScope) {
            resolved = localScope[sym];
          }
          if (!resolved) {
            resolved = moduleExports[sym];
          }
          return resolved;
        }
        __name(resolveSymbol, "resolveSymbol");
        var proxyHandler = {
          get(stubs, prop) {
            switch (prop) {
              case "__memory_base":
                return memoryBase;
              case "__table_base":
                return tableBase;
            }
            if (prop in wasmImports && !wasmImports[prop].stub) {
              var res = wasmImports[prop];
              return res;
            }
            if (!(prop in stubs)) {
              var resolved;
              stubs[prop] = (...args2) => {
                resolved ||= resolveSymbol(prop);
                return resolved(...args2);
              };
            }
            return stubs[prop];
          }
        };
        var proxy = new Proxy({}, proxyHandler);
        var info = {
          "GOT.mem": new Proxy({}, GOTHandler),
          "GOT.func": new Proxy({}, GOTHandler),
          env: proxy,
          wasi_snapshot_preview1: proxy
        };
        function postInstantiation(module, instance) {
          updateTableMap(tableBase, metadata.tableSize);
          moduleExports = relocateExports(instance.exports, memoryBase);
          if (!flags.allowUndefined) {
            reportUndefinedSymbols();
          }
          function addEmAsm(addr, body) {
            var args = [];
            var arity = 0;
            for (;arity < 16; arity++) {
              if (body.indexOf("$" + arity) != -1) {
                args.push("$" + arity);
              } else {
                break;
              }
            }
            args = args.join(",");
            var func = `(${args}) => { ${body} };`;
            ASM_CONSTS[start] = eval(func);
          }
          __name(addEmAsm, "addEmAsm");
          if ("__start_em_asm" in moduleExports) {
            var start = moduleExports["__start_em_asm"];
            var stop = moduleExports["__stop_em_asm"];
            while (start < stop) {
              var jsString = UTF8ToString(start);
              addEmAsm(start, jsString);
              start = HEAPU8.indexOf(0, start) + 1;
            }
          }
          function addEmJs(name, cSig, body) {
            var jsArgs = [];
            cSig = cSig.slice(1, -1);
            if (cSig != "void") {
              cSig = cSig.split(",");
              for (var i in cSig) {
                var jsArg = cSig[i].split(" ").pop();
                jsArgs.push(jsArg.replace("*", ""));
              }
            }
            var func = `(${jsArgs}) => ${body};`;
            moduleExports[name] = eval(func);
          }
          __name(addEmJs, "addEmJs");
          for (var name in moduleExports) {
            if (name.startsWith("__em_js__")) {
              var start = moduleExports[name];
              var jsString = UTF8ToString(start);
              var parts = jsString.split("<::>");
              addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
              delete moduleExports[name];
            }
          }
          var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
          if (applyRelocs) {
            if (runtimeInitialized) {
              applyRelocs();
            } else {
              __RELOC_FUNCS__.push(applyRelocs);
            }
          }
          var init = moduleExports["__wasm_call_ctors"];
          if (init) {
            if (runtimeInitialized) {
              init();
            } else {
              addOnPostCtor(init);
            }
          }
          return moduleExports;
        }
        __name(postInstantiation, "postInstantiation");
        if (flags.loadAsync) {
          if (binary instanceof WebAssembly.Module) {
            var instance = new WebAssembly.Instance(binary, info);
            return Promise.resolve(postInstantiation(binary, instance));
          }
          return WebAssembly.instantiate(binary, info).then((result) => postInstantiation(result.module, result.instance));
        }
        var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
        var instance = new WebAssembly.Instance(module, info);
        return postInstantiation(module, instance);
      }
      __name(loadModule, "loadModule");
      if (flags.loadAsync) {
        return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
      }
      metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
      return loadModule();
    }, "loadWebAssemblyModule");
    var mergeLibSymbols = /* @__PURE__ */ __name((exports, libName2) => {
      for (var [sym, exp] of Object.entries(exports)) {
        const setImport = /* @__PURE__ */ __name((target) => {
          if (!isSymbolDefined(target)) {
            wasmImports[target] = exp;
          }
        }, "setImport");
        setImport(sym);
        const main_alias = "__main_argc_argv";
        if (sym == "main") {
          setImport(main_alias);
        }
        if (sym == main_alias) {
          setImport("main");
        }
      }
    }, "mergeLibSymbols");
    var asyncLoad = /* @__PURE__ */ __name(async (url) => {
      var arrayBuffer = await readAsync(url);
      return new Uint8Array(arrayBuffer);
    }, "asyncLoad");
    function loadDynamicLibrary(libName2, flags2 = {
      global: true,
      nodelete: true
    }, localScope2, handle2) {
      var dso = LDSO.loadedLibsByName[libName2];
      if (dso) {
        if (!flags2.global) {
          if (localScope2) {
            Object.assign(localScope2, dso.exports);
          }
        } else if (!dso.global) {
          dso.global = true;
          mergeLibSymbols(dso.exports, libName2);
        }
        if (flags2.nodelete && dso.refcount !== Infinity) {
          dso.refcount = Infinity;
        }
        dso.refcount++;
        if (handle2) {
          LDSO.loadedLibsByHandle[handle2] = dso;
        }
        return flags2.loadAsync ? Promise.resolve(true) : true;
      }
      dso = newDSO(libName2, handle2, "loading");
      dso.refcount = flags2.nodelete ? Infinity : 1;
      dso.global = flags2.global;
      function loadLibData() {
        if (handle2) {
          var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
          var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
          if (data && dataSize) {
            var libData = HEAP8.slice(data, data + dataSize);
            return flags2.loadAsync ? Promise.resolve(libData) : libData;
          }
        }
        var libFile = locateFile(libName2);
        if (flags2.loadAsync) {
          return asyncLoad(libFile);
        }
        if (!readBinary) {
          throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
        }
        return readBinary(libFile);
      }
      __name(loadLibData, "loadLibData");
      function getExports() {
        if (flags2.loadAsync) {
          return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
        }
        return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
      }
      __name(getExports, "getExports");
      function moduleLoaded(exports) {
        if (dso.global) {
          mergeLibSymbols(exports, libName2);
        } else if (localScope2) {
          Object.assign(localScope2, exports);
        }
        dso.exports = exports;
      }
      __name(moduleLoaded, "moduleLoaded");
      if (flags2.loadAsync) {
        return getExports().then((exports) => {
          moduleLoaded(exports);
          return true;
        });
      }
      moduleLoaded(getExports());
      return true;
    }
    __name(loadDynamicLibrary, "loadDynamicLibrary");
    var reportUndefinedSymbols = /* @__PURE__ */ __name(() => {
      for (var [symName, entry] of Object.entries(GOT)) {
        if (entry.value == 0) {
          var value = resolveGlobalSymbol(symName, true).sym;
          if (!value && !entry.required) {
            continue;
          }
          if (typeof value == "function") {
            entry.value = addFunction(value, value.sig);
          } else if (typeof value == "number") {
            entry.value = value;
          } else {
            throw new Error(`bad export type for '${symName}': ${typeof value}`);
          }
        }
      }
    }, "reportUndefinedSymbols");
    var loadDylibs = /* @__PURE__ */ __name(() => {
      if (!dynamicLibraries.length) {
        reportUndefinedSymbols();
        return;
      }
      addRunDependency("loadDylibs");
      dynamicLibraries.reduce((chain, lib) => chain.then(() => loadDynamicLibrary(lib, {
        loadAsync: true,
        global: true,
        nodelete: true,
        allowUndefined: true
      })), Promise.resolve()).then(() => {
        reportUndefinedSymbols();
        removeRunDependency("loadDylibs");
      });
    }, "loadDylibs");
    var noExitRuntime = Module["noExitRuntime"] || true;
    function setValue(ptr, value, type = "i8") {
      if (type.endsWith("*"))
        type = "*";
      switch (type) {
        case "i1":
          HEAP8[ptr] = value;
          break;
        case "i8":
          HEAP8[ptr] = value;
          break;
        case "i16":
          LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
          break;
        case "i32":
          LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
          break;
        case "i64":
          HEAP64[ptr >> 3] = BigInt(value);
          break;
        case "float":
          LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
          break;
        case "double":
          LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
          break;
        case "*":
          LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
          break;
        default:
          abort(`invalid type for setValue: ${type}`);
      }
    }
    __name(setValue, "setValue");
    var ___memory_base = new WebAssembly.Global({
      value: "i32",
      mutable: false
    }, 1024);
    var ___stack_pointer = new WebAssembly.Global({
      value: "i32",
      mutable: true
    }, 78224);
    var ___table_base = new WebAssembly.Global({
      value: "i32",
      mutable: false
    }, 1);
    var __abort_js = /* @__PURE__ */ __name(() => abort(""), "__abort_js");
    __abort_js.sig = "v";
    var _emscripten_get_now = /* @__PURE__ */ __name(() => performance.now(), "_emscripten_get_now");
    _emscripten_get_now.sig = "d";
    var _emscripten_date_now = /* @__PURE__ */ __name(() => Date.now(), "_emscripten_date_now");
    _emscripten_date_now.sig = "d";
    var nowIsMonotonic = 1;
    var checkWasiClock = /* @__PURE__ */ __name((clock_id) => clock_id >= 0 && clock_id <= 3, "checkWasiClock");
    var INT53_MAX = 9007199254740992;
    var INT53_MIN = -9007199254740992;
    var bigintToI53Checked = /* @__PURE__ */ __name((num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num), "bigintToI53Checked");
    function _clock_time_get(clk_id, ignored_precision, ptime) {
      ignored_precision = bigintToI53Checked(ignored_precision);
      if (!checkWasiClock(clk_id)) {
        return 28;
      }
      var now;
      if (clk_id === 0) {
        now = _emscripten_date_now();
      } else if (nowIsMonotonic) {
        now = _emscripten_get_now();
      } else {
        return 52;
      }
      var nsec = Math.round(now * 1000 * 1000);
      HEAP64[ptime >> 3] = BigInt(nsec);
      return 0;
    }
    __name(_clock_time_get, "_clock_time_get");
    _clock_time_get.sig = "iijp";
    var getHeapMax = /* @__PURE__ */ __name(() => 2147483648, "getHeapMax");
    var growMemory = /* @__PURE__ */ __name((size) => {
      var b = wasmMemory.buffer;
      var pages = (size - b.byteLength + 65535) / 65536 | 0;
      try {
        wasmMemory.grow(pages);
        updateMemoryViews();
        return 1;
      } catch (e) {}
    }, "growMemory");
    var _emscripten_resize_heap = /* @__PURE__ */ __name((requestedSize) => {
      var oldSize = HEAPU8.length;
      requestedSize >>>= 0;
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        return false;
      }
      for (var cutDown = 1;cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
        var replacement = growMemory(newSize);
        if (replacement) {
          return true;
        }
      }
      return false;
    }, "_emscripten_resize_heap");
    _emscripten_resize_heap.sig = "ip";
    var _fd_close = /* @__PURE__ */ __name((fd) => 52, "_fd_close");
    _fd_close.sig = "ii";
    function _fd_seek(fd, offset, whence, newOffset) {
      offset = bigintToI53Checked(offset);
      return 70;
    }
    __name(_fd_seek, "_fd_seek");
    _fd_seek.sig = "iijip";
    var printCharBuffers = [null, [], []];
    var printChar = /* @__PURE__ */ __name((stream, curr) => {
      var buffer = printCharBuffers[stream];
      if (curr === 0 || curr === 10) {
        (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
        buffer.length = 0;
      } else {
        buffer.push(curr);
      }
    }, "printChar");
    var flush_NO_FILESYSTEM = /* @__PURE__ */ __name(() => {
      if (printCharBuffers[1].length)
        printChar(1, 10);
      if (printCharBuffers[2].length)
        printChar(2, 10);
    }, "flush_NO_FILESYSTEM");
    var SYSCALLS = {
      varargs: undefined,
      getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      }
    };
    var _fd_write = /* @__PURE__ */ __name((fd, iov, iovcnt, pnum) => {
      var num = 0;
      for (var i2 = 0;i2 < iovcnt; i2++) {
        var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
        var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
        iov += 8;
        for (var j = 0;j < len; j++) {
          printChar(fd, HEAPU8[ptr + j]);
        }
        num += len;
      }
      LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
      return 0;
    }, "_fd_write");
    _fd_write.sig = "iippp";
    function _tree_sitter_log_callback(isLexMessage, messageAddress) {
      if (Module.currentLogCallback) {
        const message = UTF8ToString(messageAddress);
        Module.currentLogCallback(message, isLexMessage !== 0);
      }
    }
    __name(_tree_sitter_log_callback, "_tree_sitter_log_callback");
    function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
      const INPUT_BUFFER_SIZE = 10240;
      const string = Module.currentParseCallback(index, {
        row,
        column
      });
      if (typeof string === "string") {
        setValue(lengthAddress, string.length, "i32");
        stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
      } else {
        setValue(lengthAddress, 0, "i32");
      }
    }
    __name(_tree_sitter_parse_callback, "_tree_sitter_parse_callback");
    function _tree_sitter_progress_callback(currentOffset, hasError) {
      if (Module.currentProgressCallback) {
        return Module.currentProgressCallback({
          currentOffset,
          hasError
        });
      }
      return false;
    }
    __name(_tree_sitter_progress_callback, "_tree_sitter_progress_callback");
    function _tree_sitter_query_progress_callback(currentOffset) {
      if (Module.currentQueryProgressCallback) {
        return Module.currentQueryProgressCallback({
          currentOffset
        });
      }
      return false;
    }
    __name(_tree_sitter_query_progress_callback, "_tree_sitter_query_progress_callback");
    var runtimeKeepaliveCounter = 0;
    var keepRuntimeAlive = /* @__PURE__ */ __name(() => noExitRuntime || runtimeKeepaliveCounter > 0, "keepRuntimeAlive");
    var _proc_exit = /* @__PURE__ */ __name((code) => {
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        Module["onExit"]?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    }, "_proc_exit");
    _proc_exit.sig = "vi";
    var exitJS = /* @__PURE__ */ __name((status, implicit) => {
      EXITSTATUS = status;
      _proc_exit(status);
    }, "exitJS");
    var handleException = /* @__PURE__ */ __name((e) => {
      if (e instanceof ExitStatus || e == "unwind") {
        return EXITSTATUS;
      }
      quit_(1, e);
    }, "handleException");
    var lengthBytesUTF8 = /* @__PURE__ */ __name((str) => {
      var len = 0;
      for (var i2 = 0;i2 < str.length; ++i2) {
        var c = str.charCodeAt(i2);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i2;
        } else {
          len += 3;
        }
      }
      return len;
    }, "lengthBytesUTF8");
    var stringToUTF8Array = /* @__PURE__ */ __name((str, heap, outIdx, maxBytesToWrite) => {
      if (!(maxBytesToWrite > 0))
        return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i2 = 0;i2 < str.length; ++i2) {
        var u = str.charCodeAt(i2);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i2);
          u = 65536 + ((u & 1023) << 10) | u1 & 1023;
        }
        if (u <= 127) {
          if (outIdx >= endIdx)
            break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx)
            break;
          heap[outIdx++] = 192 | u >> 6;
          heap[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx)
            break;
          heap[outIdx++] = 224 | u >> 12;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        } else {
          if (outIdx + 3 >= endIdx)
            break;
          heap[outIdx++] = 240 | u >> 18;
          heap[outIdx++] = 128 | u >> 12 & 63;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    }, "stringToUTF8Array");
    var stringToUTF8 = /* @__PURE__ */ __name((str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite), "stringToUTF8");
    var stackAlloc = /* @__PURE__ */ __name((sz) => __emscripten_stack_alloc(sz), "stackAlloc");
    var stringToUTF8OnStack = /* @__PURE__ */ __name((str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    }, "stringToUTF8OnStack");
    var AsciiToString = /* @__PURE__ */ __name((ptr) => {
      var str = "";
      while (true) {
        var ch = HEAPU8[ptr++];
        if (!ch)
          return str;
        str += String.fromCharCode(ch);
      }
    }, "AsciiToString");
    var stringToUTF16 = /* @__PURE__ */ __name((str, outPtr, maxBytesToWrite) => {
      maxBytesToWrite ??= 2147483647;
      if (maxBytesToWrite < 2)
        return 0;
      maxBytesToWrite -= 2;
      var startPtr = outPtr;
      var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
      for (var i2 = 0;i2 < numCharsToWrite; ++i2) {
        var codeUnit = str.charCodeAt(i2);
        LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
        outPtr += 2;
      }
      LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
      return outPtr - startPtr;
    }, "stringToUTF16");
    var wasmImports = {
      __heap_base: ___heap_base,
      __indirect_function_table: wasmTable,
      __memory_base: ___memory_base,
      __stack_pointer: ___stack_pointer,
      __table_base: ___table_base,
      _abort_js: __abort_js,
      clock_time_get: _clock_time_get,
      emscripten_resize_heap: _emscripten_resize_heap,
      fd_close: _fd_close,
      fd_seek: _fd_seek,
      fd_write: _fd_write,
      memory: wasmMemory,
      tree_sitter_log_callback: _tree_sitter_log_callback,
      tree_sitter_parse_callback: _tree_sitter_parse_callback,
      tree_sitter_progress_callback: _tree_sitter_progress_callback,
      tree_sitter_query_progress_callback: _tree_sitter_query_progress_callback
    };
    var wasmExports = await createWasm();
    var ___wasm_call_ctors = wasmExports["__wasm_call_ctors"];
    var _malloc = Module["_malloc"] = wasmExports["malloc"];
    var _calloc = Module["_calloc"] = wasmExports["calloc"];
    var _realloc = Module["_realloc"] = wasmExports["realloc"];
    var _free = Module["_free"] = wasmExports["free"];
    var _memcmp = Module["_memcmp"] = wasmExports["memcmp"];
    var _ts_language_symbol_count = Module["_ts_language_symbol_count"] = wasmExports["ts_language_symbol_count"];
    var _ts_language_state_count = Module["_ts_language_state_count"] = wasmExports["ts_language_state_count"];
    var _ts_language_version = Module["_ts_language_version"] = wasmExports["ts_language_version"];
    var _ts_language_abi_version = Module["_ts_language_abi_version"] = wasmExports["ts_language_abi_version"];
    var _ts_language_metadata = Module["_ts_language_metadata"] = wasmExports["ts_language_metadata"];
    var _ts_language_name = Module["_ts_language_name"] = wasmExports["ts_language_name"];
    var _ts_language_field_count = Module["_ts_language_field_count"] = wasmExports["ts_language_field_count"];
    var _ts_language_next_state = Module["_ts_language_next_state"] = wasmExports["ts_language_next_state"];
    var _ts_language_symbol_name = Module["_ts_language_symbol_name"] = wasmExports["ts_language_symbol_name"];
    var _ts_language_symbol_for_name = Module["_ts_language_symbol_for_name"] = wasmExports["ts_language_symbol_for_name"];
    var _strncmp = Module["_strncmp"] = wasmExports["strncmp"];
    var _ts_language_symbol_type = Module["_ts_language_symbol_type"] = wasmExports["ts_language_symbol_type"];
    var _ts_language_field_name_for_id = Module["_ts_language_field_name_for_id"] = wasmExports["ts_language_field_name_for_id"];
    var _ts_lookahead_iterator_new = Module["_ts_lookahead_iterator_new"] = wasmExports["ts_lookahead_iterator_new"];
    var _ts_lookahead_iterator_delete = Module["_ts_lookahead_iterator_delete"] = wasmExports["ts_lookahead_iterator_delete"];
    var _ts_lookahead_iterator_reset_state = Module["_ts_lookahead_iterator_reset_state"] = wasmExports["ts_lookahead_iterator_reset_state"];
    var _ts_lookahead_iterator_reset = Module["_ts_lookahead_iterator_reset"] = wasmExports["ts_lookahead_iterator_reset"];
    var _ts_lookahead_iterator_next = Module["_ts_lookahead_iterator_next"] = wasmExports["ts_lookahead_iterator_next"];
    var _ts_lookahead_iterator_current_symbol = Module["_ts_lookahead_iterator_current_symbol"] = wasmExports["ts_lookahead_iterator_current_symbol"];
    var _ts_parser_delete = Module["_ts_parser_delete"] = wasmExports["ts_parser_delete"];
    var _ts_parser_reset = Module["_ts_parser_reset"] = wasmExports["ts_parser_reset"];
    var _ts_parser_set_language = Module["_ts_parser_set_language"] = wasmExports["ts_parser_set_language"];
    var _ts_parser_timeout_micros = Module["_ts_parser_timeout_micros"] = wasmExports["ts_parser_timeout_micros"];
    var _ts_parser_set_timeout_micros = Module["_ts_parser_set_timeout_micros"] = wasmExports["ts_parser_set_timeout_micros"];
    var _ts_parser_set_included_ranges = Module["_ts_parser_set_included_ranges"] = wasmExports["ts_parser_set_included_ranges"];
    var _ts_query_new = Module["_ts_query_new"] = wasmExports["ts_query_new"];
    var _ts_query_delete = Module["_ts_query_delete"] = wasmExports["ts_query_delete"];
    var _iswspace = Module["_iswspace"] = wasmExports["iswspace"];
    var _iswalnum = Module["_iswalnum"] = wasmExports["iswalnum"];
    var _ts_query_pattern_count = Module["_ts_query_pattern_count"] = wasmExports["ts_query_pattern_count"];
    var _ts_query_capture_count = Module["_ts_query_capture_count"] = wasmExports["ts_query_capture_count"];
    var _ts_query_string_count = Module["_ts_query_string_count"] = wasmExports["ts_query_string_count"];
    var _ts_query_capture_name_for_id = Module["_ts_query_capture_name_for_id"] = wasmExports["ts_query_capture_name_for_id"];
    var _ts_query_capture_quantifier_for_id = Module["_ts_query_capture_quantifier_for_id"] = wasmExports["ts_query_capture_quantifier_for_id"];
    var _ts_query_string_value_for_id = Module["_ts_query_string_value_for_id"] = wasmExports["ts_query_string_value_for_id"];
    var _ts_query_predicates_for_pattern = Module["_ts_query_predicates_for_pattern"] = wasmExports["ts_query_predicates_for_pattern"];
    var _ts_query_start_byte_for_pattern = Module["_ts_query_start_byte_for_pattern"] = wasmExports["ts_query_start_byte_for_pattern"];
    var _ts_query_end_byte_for_pattern = Module["_ts_query_end_byte_for_pattern"] = wasmExports["ts_query_end_byte_for_pattern"];
    var _ts_query_is_pattern_rooted = Module["_ts_query_is_pattern_rooted"] = wasmExports["ts_query_is_pattern_rooted"];
    var _ts_query_is_pattern_non_local = Module["_ts_query_is_pattern_non_local"] = wasmExports["ts_query_is_pattern_non_local"];
    var _ts_query_is_pattern_guaranteed_at_step = Module["_ts_query_is_pattern_guaranteed_at_step"] = wasmExports["ts_query_is_pattern_guaranteed_at_step"];
    var _ts_query_disable_capture = Module["_ts_query_disable_capture"] = wasmExports["ts_query_disable_capture"];
    var _ts_query_disable_pattern = Module["_ts_query_disable_pattern"] = wasmExports["ts_query_disable_pattern"];
    var _ts_tree_copy = Module["_ts_tree_copy"] = wasmExports["ts_tree_copy"];
    var _ts_tree_delete = Module["_ts_tree_delete"] = wasmExports["ts_tree_delete"];
    var _ts_init = Module["_ts_init"] = wasmExports["ts_init"];
    var _ts_parser_new_wasm = Module["_ts_parser_new_wasm"] = wasmExports["ts_parser_new_wasm"];
    var _ts_parser_enable_logger_wasm = Module["_ts_parser_enable_logger_wasm"] = wasmExports["ts_parser_enable_logger_wasm"];
    var _ts_parser_parse_wasm = Module["_ts_parser_parse_wasm"] = wasmExports["ts_parser_parse_wasm"];
    var _ts_parser_included_ranges_wasm = Module["_ts_parser_included_ranges_wasm"] = wasmExports["ts_parser_included_ranges_wasm"];
    var _ts_language_type_is_named_wasm = Module["_ts_language_type_is_named_wasm"] = wasmExports["ts_language_type_is_named_wasm"];
    var _ts_language_type_is_visible_wasm = Module["_ts_language_type_is_visible_wasm"] = wasmExports["ts_language_type_is_visible_wasm"];
    var _ts_language_supertypes_wasm = Module["_ts_language_supertypes_wasm"] = wasmExports["ts_language_supertypes_wasm"];
    var _ts_language_subtypes_wasm = Module["_ts_language_subtypes_wasm"] = wasmExports["ts_language_subtypes_wasm"];
    var _ts_tree_root_node_wasm = Module["_ts_tree_root_node_wasm"] = wasmExports["ts_tree_root_node_wasm"];
    var _ts_tree_root_node_with_offset_wasm = Module["_ts_tree_root_node_with_offset_wasm"] = wasmExports["ts_tree_root_node_with_offset_wasm"];
    var _ts_tree_edit_wasm = Module["_ts_tree_edit_wasm"] = wasmExports["ts_tree_edit_wasm"];
    var _ts_tree_included_ranges_wasm = Module["_ts_tree_included_ranges_wasm"] = wasmExports["ts_tree_included_ranges_wasm"];
    var _ts_tree_get_changed_ranges_wasm = Module["_ts_tree_get_changed_ranges_wasm"] = wasmExports["ts_tree_get_changed_ranges_wasm"];
    var _ts_tree_cursor_new_wasm = Module["_ts_tree_cursor_new_wasm"] = wasmExports["ts_tree_cursor_new_wasm"];
    var _ts_tree_cursor_copy_wasm = Module["_ts_tree_cursor_copy_wasm"] = wasmExports["ts_tree_cursor_copy_wasm"];
    var _ts_tree_cursor_delete_wasm = Module["_ts_tree_cursor_delete_wasm"] = wasmExports["ts_tree_cursor_delete_wasm"];
    var _ts_tree_cursor_reset_wasm = Module["_ts_tree_cursor_reset_wasm"] = wasmExports["ts_tree_cursor_reset_wasm"];
    var _ts_tree_cursor_reset_to_wasm = Module["_ts_tree_cursor_reset_to_wasm"] = wasmExports["ts_tree_cursor_reset_to_wasm"];
    var _ts_tree_cursor_goto_first_child_wasm = Module["_ts_tree_cursor_goto_first_child_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_wasm"];
    var _ts_tree_cursor_goto_last_child_wasm = Module["_ts_tree_cursor_goto_last_child_wasm"] = wasmExports["ts_tree_cursor_goto_last_child_wasm"];
    var _ts_tree_cursor_goto_first_child_for_index_wasm = Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_index_wasm"];
    var _ts_tree_cursor_goto_first_child_for_position_wasm = Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_position_wasm"];
    var _ts_tree_cursor_goto_next_sibling_wasm = Module["_ts_tree_cursor_goto_next_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_next_sibling_wasm"];
    var _ts_tree_cursor_goto_previous_sibling_wasm = Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_previous_sibling_wasm"];
    var _ts_tree_cursor_goto_descendant_wasm = Module["_ts_tree_cursor_goto_descendant_wasm"] = wasmExports["ts_tree_cursor_goto_descendant_wasm"];
    var _ts_tree_cursor_goto_parent_wasm = Module["_ts_tree_cursor_goto_parent_wasm"] = wasmExports["ts_tree_cursor_goto_parent_wasm"];
    var _ts_tree_cursor_current_node_type_id_wasm = Module["_ts_tree_cursor_current_node_type_id_wasm"] = wasmExports["ts_tree_cursor_current_node_type_id_wasm"];
    var _ts_tree_cursor_current_node_state_id_wasm = Module["_ts_tree_cursor_current_node_state_id_wasm"] = wasmExports["ts_tree_cursor_current_node_state_id_wasm"];
    var _ts_tree_cursor_current_node_is_named_wasm = Module["_ts_tree_cursor_current_node_is_named_wasm"] = wasmExports["ts_tree_cursor_current_node_is_named_wasm"];
    var _ts_tree_cursor_current_node_is_missing_wasm = Module["_ts_tree_cursor_current_node_is_missing_wasm"] = wasmExports["ts_tree_cursor_current_node_is_missing_wasm"];
    var _ts_tree_cursor_current_node_id_wasm = Module["_ts_tree_cursor_current_node_id_wasm"] = wasmExports["ts_tree_cursor_current_node_id_wasm"];
    var _ts_tree_cursor_start_position_wasm = Module["_ts_tree_cursor_start_position_wasm"] = wasmExports["ts_tree_cursor_start_position_wasm"];
    var _ts_tree_cursor_end_position_wasm = Module["_ts_tree_cursor_end_position_wasm"] = wasmExports["ts_tree_cursor_end_position_wasm"];
    var _ts_tree_cursor_start_index_wasm = Module["_ts_tree_cursor_start_index_wasm"] = wasmExports["ts_tree_cursor_start_index_wasm"];
    var _ts_tree_cursor_end_index_wasm = Module["_ts_tree_cursor_end_index_wasm"] = wasmExports["ts_tree_cursor_end_index_wasm"];
    var _ts_tree_cursor_current_field_id_wasm = Module["_ts_tree_cursor_current_field_id_wasm"] = wasmExports["ts_tree_cursor_current_field_id_wasm"];
    var _ts_tree_cursor_current_depth_wasm = Module["_ts_tree_cursor_current_depth_wasm"] = wasmExports["ts_tree_cursor_current_depth_wasm"];
    var _ts_tree_cursor_current_descendant_index_wasm = Module["_ts_tree_cursor_current_descendant_index_wasm"] = wasmExports["ts_tree_cursor_current_descendant_index_wasm"];
    var _ts_tree_cursor_current_node_wasm = Module["_ts_tree_cursor_current_node_wasm"] = wasmExports["ts_tree_cursor_current_node_wasm"];
    var _ts_node_symbol_wasm = Module["_ts_node_symbol_wasm"] = wasmExports["ts_node_symbol_wasm"];
    var _ts_node_field_name_for_child_wasm = Module["_ts_node_field_name_for_child_wasm"] = wasmExports["ts_node_field_name_for_child_wasm"];
    var _ts_node_field_name_for_named_child_wasm = Module["_ts_node_field_name_for_named_child_wasm"] = wasmExports["ts_node_field_name_for_named_child_wasm"];
    var _ts_node_children_by_field_id_wasm = Module["_ts_node_children_by_field_id_wasm"] = wasmExports["ts_node_children_by_field_id_wasm"];
    var _ts_node_first_child_for_byte_wasm = Module["_ts_node_first_child_for_byte_wasm"] = wasmExports["ts_node_first_child_for_byte_wasm"];
    var _ts_node_first_named_child_for_byte_wasm = Module["_ts_node_first_named_child_for_byte_wasm"] = wasmExports["ts_node_first_named_child_for_byte_wasm"];
    var _ts_node_grammar_symbol_wasm = Module["_ts_node_grammar_symbol_wasm"] = wasmExports["ts_node_grammar_symbol_wasm"];
    var _ts_node_child_count_wasm = Module["_ts_node_child_count_wasm"] = wasmExports["ts_node_child_count_wasm"];
    var _ts_node_named_child_count_wasm = Module["_ts_node_named_child_count_wasm"] = wasmExports["ts_node_named_child_count_wasm"];
    var _ts_node_child_wasm = Module["_ts_node_child_wasm"] = wasmExports["ts_node_child_wasm"];
    var _ts_node_named_child_wasm = Module["_ts_node_named_child_wasm"] = wasmExports["ts_node_named_child_wasm"];
    var _ts_node_child_by_field_id_wasm = Module["_ts_node_child_by_field_id_wasm"] = wasmExports["ts_node_child_by_field_id_wasm"];
    var _ts_node_next_sibling_wasm = Module["_ts_node_next_sibling_wasm"] = wasmExports["ts_node_next_sibling_wasm"];
    var _ts_node_prev_sibling_wasm = Module["_ts_node_prev_sibling_wasm"] = wasmExports["ts_node_prev_sibling_wasm"];
    var _ts_node_next_named_sibling_wasm = Module["_ts_node_next_named_sibling_wasm"] = wasmExports["ts_node_next_named_sibling_wasm"];
    var _ts_node_prev_named_sibling_wasm = Module["_ts_node_prev_named_sibling_wasm"] = wasmExports["ts_node_prev_named_sibling_wasm"];
    var _ts_node_descendant_count_wasm = Module["_ts_node_descendant_count_wasm"] = wasmExports["ts_node_descendant_count_wasm"];
    var _ts_node_parent_wasm = Module["_ts_node_parent_wasm"] = wasmExports["ts_node_parent_wasm"];
    var _ts_node_child_with_descendant_wasm = Module["_ts_node_child_with_descendant_wasm"] = wasmExports["ts_node_child_with_descendant_wasm"];
    var _ts_node_descendant_for_index_wasm = Module["_ts_node_descendant_for_index_wasm"] = wasmExports["ts_node_descendant_for_index_wasm"];
    var _ts_node_named_descendant_for_index_wasm = Module["_ts_node_named_descendant_for_index_wasm"] = wasmExports["ts_node_named_descendant_for_index_wasm"];
    var _ts_node_descendant_for_position_wasm = Module["_ts_node_descendant_for_position_wasm"] = wasmExports["ts_node_descendant_for_position_wasm"];
    var _ts_node_named_descendant_for_position_wasm = Module["_ts_node_named_descendant_for_position_wasm"] = wasmExports["ts_node_named_descendant_for_position_wasm"];
    var _ts_node_start_point_wasm = Module["_ts_node_start_point_wasm"] = wasmExports["ts_node_start_point_wasm"];
    var _ts_node_end_point_wasm = Module["_ts_node_end_point_wasm"] = wasmExports["ts_node_end_point_wasm"];
    var _ts_node_start_index_wasm = Module["_ts_node_start_index_wasm"] = wasmExports["ts_node_start_index_wasm"];
    var _ts_node_end_index_wasm = Module["_ts_node_end_index_wasm"] = wasmExports["ts_node_end_index_wasm"];
    var _ts_node_to_string_wasm = Module["_ts_node_to_string_wasm"] = wasmExports["ts_node_to_string_wasm"];
    var _ts_node_children_wasm = Module["_ts_node_children_wasm"] = wasmExports["ts_node_children_wasm"];
    var _ts_node_named_children_wasm = Module["_ts_node_named_children_wasm"] = wasmExports["ts_node_named_children_wasm"];
    var _ts_node_descendants_of_type_wasm = Module["_ts_node_descendants_of_type_wasm"] = wasmExports["ts_node_descendants_of_type_wasm"];
    var _ts_node_is_named_wasm = Module["_ts_node_is_named_wasm"] = wasmExports["ts_node_is_named_wasm"];
    var _ts_node_has_changes_wasm = Module["_ts_node_has_changes_wasm"] = wasmExports["ts_node_has_changes_wasm"];
    var _ts_node_has_error_wasm = Module["_ts_node_has_error_wasm"] = wasmExports["ts_node_has_error_wasm"];
    var _ts_node_is_error_wasm = Module["_ts_node_is_error_wasm"] = wasmExports["ts_node_is_error_wasm"];
    var _ts_node_is_missing_wasm = Module["_ts_node_is_missing_wasm"] = wasmExports["ts_node_is_missing_wasm"];
    var _ts_node_is_extra_wasm = Module["_ts_node_is_extra_wasm"] = wasmExports["ts_node_is_extra_wasm"];
    var _ts_node_parse_state_wasm = Module["_ts_node_parse_state_wasm"] = wasmExports["ts_node_parse_state_wasm"];
    var _ts_node_next_parse_state_wasm = Module["_ts_node_next_parse_state_wasm"] = wasmExports["ts_node_next_parse_state_wasm"];
    var _ts_query_matches_wasm = Module["_ts_query_matches_wasm"] = wasmExports["ts_query_matches_wasm"];
    var _ts_query_captures_wasm = Module["_ts_query_captures_wasm"] = wasmExports["ts_query_captures_wasm"];
    var _memset = Module["_memset"] = wasmExports["memset"];
    var _memcpy = Module["_memcpy"] = wasmExports["memcpy"];
    var _memmove = Module["_memmove"] = wasmExports["memmove"];
    var _iswalpha = Module["_iswalpha"] = wasmExports["iswalpha"];
    var _iswblank = Module["_iswblank"] = wasmExports["iswblank"];
    var _iswdigit = Module["_iswdigit"] = wasmExports["iswdigit"];
    var _iswlower = Module["_iswlower"] = wasmExports["iswlower"];
    var _iswupper = Module["_iswupper"] = wasmExports["iswupper"];
    var _iswxdigit = Module["_iswxdigit"] = wasmExports["iswxdigit"];
    var _memchr = Module["_memchr"] = wasmExports["memchr"];
    var _strlen = Module["_strlen"] = wasmExports["strlen"];
    var _strcmp = Module["_strcmp"] = wasmExports["strcmp"];
    var _strncat = Module["_strncat"] = wasmExports["strncat"];
    var _strncpy = Module["_strncpy"] = wasmExports["strncpy"];
    var _towlower = Module["_towlower"] = wasmExports["towlower"];
    var _towupper = Module["_towupper"] = wasmExports["towupper"];
    var _setThrew = wasmExports["setThrew"];
    var __emscripten_stack_restore = wasmExports["_emscripten_stack_restore"];
    var __emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"];
    var _emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"];
    var ___wasm_apply_data_relocs = wasmExports["__wasm_apply_data_relocs"];
    Module["setValue"] = setValue;
    Module["getValue"] = getValue;
    Module["UTF8ToString"] = UTF8ToString;
    Module["stringToUTF8"] = stringToUTF8;
    Module["lengthBytesUTF8"] = lengthBytesUTF8;
    Module["AsciiToString"] = AsciiToString;
    Module["stringToUTF16"] = stringToUTF16;
    Module["loadWebAssemblyModule"] = loadWebAssemblyModule;
    function callMain(args2 = []) {
      var entryFunction = resolveGlobalSymbol("main").sym;
      if (!entryFunction)
        return;
      args2.unshift(thisProgram);
      var argc = args2.length;
      var argv = stackAlloc((argc + 1) * 4);
      var argv_ptr = argv;
      args2.forEach((arg) => {
        LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
        argv_ptr += 4;
      });
      LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
      try {
        var ret = entryFunction(argc, argv);
        exitJS(ret, true);
        return ret;
      } catch (e) {
        return handleException(e);
      }
    }
    __name(callMain, "callMain");
    function run(args2 = arguments_) {
      if (runDependencies > 0) {
        dependenciesFulfilled = run;
        return;
      }
      preRun();
      if (runDependencies > 0) {
        dependenciesFulfilled = run;
        return;
      }
      function doRun() {
        Module["calledRun"] = true;
        if (ABORT)
          return;
        initRuntime();
        preMain();
        readyPromiseResolve(Module);
        Module["onRuntimeInitialized"]?.();
        var noInitialRun = Module["noInitialRun"];
        if (!noInitialRun)
          callMain(args2);
        postRun();
      }
      __name(doRun, "doRun");
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(() => {
          setTimeout(() => Module["setStatus"](""), 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    __name(run, "run");
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function")
        Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
      }
    }
    run();
    moduleRtn = readyPromise;
    return moduleRtn;
  };
})();
var tree_sitter_default = Module2;
var Module3 = null;
async function initializeBinding(moduleOptions) {
  if (!Module3) {
    Module3 = await tree_sitter_default(moduleOptions);
  }
  return Module3;
}
__name(initializeBinding, "initializeBinding");
function checkModule() {
  return !!Module3;
}
__name(checkModule, "checkModule");
var TRANSFER_BUFFER;
var LANGUAGE_VERSION;
var MIN_COMPATIBLE_VERSION;
var Parser = class {
  static {
    __name(this, "Parser");
  }
  [0] = 0;
  [1] = 0;
  logCallback = null;
  language = null;
  static async init(moduleOptions) {
    setModule(await initializeBinding(moduleOptions));
    TRANSFER_BUFFER = C._ts_init();
    LANGUAGE_VERSION = C.getValue(TRANSFER_BUFFER, "i32");
    MIN_COMPATIBLE_VERSION = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
  }
  constructor() {
    this.initialize();
  }
  initialize() {
    if (!checkModule()) {
      throw new Error("cannot construct a Parser before calling `init()`");
    }
    C._ts_parser_new_wasm();
    this[0] = C.getValue(TRANSFER_BUFFER, "i32");
    this[1] = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
  }
  delete() {
    C._ts_parser_delete(this[0]);
    C._free(this[1]);
    this[0] = 0;
    this[1] = 0;
  }
  setLanguage(language) {
    let address;
    if (!language) {
      address = 0;
      this.language = null;
    } else if (language.constructor === Language) {
      address = language[0];
      const version = C._ts_language_version(address);
      if (version < MIN_COMPATIBLE_VERSION || LANGUAGE_VERSION < version) {
        throw new Error(`Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${LANGUAGE_VERSION}.`);
      }
      this.language = language;
    } else {
      throw new Error("Argument must be a Language");
    }
    C._ts_parser_set_language(this[0], address);
    return this;
  }
  parse(callback, oldTree, options) {
    if (typeof callback === "string") {
      C.currentParseCallback = (index) => callback.slice(index);
    } else if (typeof callback === "function") {
      C.currentParseCallback = callback;
    } else {
      throw new Error("Argument must be a string or a function");
    }
    if (options?.progressCallback) {
      C.currentProgressCallback = options.progressCallback;
    } else {
      C.currentProgressCallback = null;
    }
    if (this.logCallback) {
      C.currentLogCallback = this.logCallback;
      C._ts_parser_enable_logger_wasm(this[0], 1);
    } else {
      C.currentLogCallback = null;
      C._ts_parser_enable_logger_wasm(this[0], 0);
    }
    let rangeCount = 0;
    let rangeAddress = 0;
    if (options?.includedRanges) {
      rangeCount = options.includedRanges.length;
      rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
      let address = rangeAddress;
      for (let i2 = 0;i2 < rangeCount; i2++) {
        marshalRange(address, options.includedRanges[i2]);
        address += SIZE_OF_RANGE;
      }
    }
    const treeAddress = C._ts_parser_parse_wasm(this[0], this[1], oldTree ? oldTree[0] : 0, rangeAddress, rangeCount);
    if (!treeAddress) {
      C.currentParseCallback = null;
      C.currentLogCallback = null;
      C.currentProgressCallback = null;
      return null;
    }
    if (!this.language) {
      throw new Error("Parser must have a language to parse");
    }
    const result = new Tree(INTERNAL, treeAddress, this.language, C.currentParseCallback);
    C.currentParseCallback = null;
    C.currentLogCallback = null;
    C.currentProgressCallback = null;
    return result;
  }
  reset() {
    C._ts_parser_reset(this[0]);
  }
  getIncludedRanges() {
    C._ts_parser_included_ranges_wasm(this[0]);
    const count = C.getValue(TRANSFER_BUFFER, "i32");
    const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    const result = new Array(count);
    if (count > 0) {
      let address = buffer;
      for (let i2 = 0;i2 < count; i2++) {
        result[i2] = unmarshalRange(address);
        address += SIZE_OF_RANGE;
      }
      C._free(buffer);
    }
    return result;
  }
  getTimeoutMicros() {
    return C._ts_parser_timeout_micros(this[0]);
  }
  setTimeoutMicros(timeout) {
    C._ts_parser_set_timeout_micros(this[0], 0, timeout);
  }
  setLogger(callback) {
    if (!callback) {
      this.logCallback = null;
    } else if (typeof callback !== "function") {
      throw new Error("Logger callback must be a function");
    } else {
      this.logCallback = callback;
    }
    return this;
  }
  getLogger() {
    return this.logCallback;
  }
};

// src/search-policy-commands.ts
var contentCommands = new Set([
  "rg",
  "ripgrep",
  "grep",
  "egrep",
  "fgrep",
  "ag",
  "ack",
  "ack-grep",
  "ugrep",
  "pt",
  "sift",
  "findstr"
]);
var fileCommands = new Set(["find", "fd", "fdfind", "locate", "mlocate", "plocate"]);
function executableName(value) {
  return value.split(/[\\/]/u).at(-1)?.replace(/\.(?:exe|cmd|bat)$/iu, "") ?? value;
}
function afterOptions(args2, valueOptions) {
  let index = 0;
  while (index < args2.length) {
    const value = args2[index];
    if (value === null || value === undefined)
      return args2.length;
    if (value === "--")
      return index + 1;
    if (!value.startsWith("-"))
      return index;
    index += valueOptions.has(value) ? 2 : 1;
  }
  return index;
}
var gitValueOptions = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env"
]);
var envValueOptions = new Set(["-u", "--unset", "-C", "--chdir"]);
var wrapperValueOptions = {
  env: envValueOptions,
  sudo: new Set([
    "-u",
    "--user",
    "-g",
    "--group",
    "-h",
    "--host",
    "-p",
    "--prompt",
    "-C",
    "--close-from",
    "-T",
    "--command-timeout",
    "-r",
    "--role",
    "-t",
    "--type"
  ]),
  nice: new Set(["-n", "--adjustment"]),
  timeout: new Set(["-s", "--signal", "-k", "--kill-after"]),
  time: new Set(["-f", "--format", "-o", "--output"]),
  xargs: new Set([
    "-a",
    "--arg-file",
    "-d",
    "--delimiter",
    "-E",
    "-I",
    "-L",
    "-n",
    "--max-args",
    "-P",
    "--max-procs",
    "-s",
    "--max-chars"
  ]),
  exec: new Set(["-a"]),
  command: new Set,
  nohup: new Set,
  busybox: new Set
};
function classifyCommand(argv, language, depth = 0) {
  if (depth > 8)
    throw new Error("Search policy wrapper nesting exceeds 8 levels; simplify the command");
  const first = argv[0];
  if (first === null || first === undefined)
    return {};
  const rawName = executableName(first);
  const name2 = language === "powershell" ? rawName.toLowerCase() : rawName;
  const args2 = argv.slice(1);
  if (args2.length === 1 && (args2[0] === "--help" || args2[0] === "--version"))
    return {};
  if (contentCommands.has(name2))
    return { kind: "content", command: name2 };
  if (fileCommands.has(name2))
    return { kind: "files", command: name2 };
  if (language === "powershell") {
    if (name2 === "select-string" || name2 === "sls")
      return { kind: "content", command: name2 };
    if (["get-childitem", "gci", "dir", "ls"].includes(name2) && args2.some((arg, index) => {
      if (arg === null)
        return false;
      if (/^-(?:recurse|r|filter|include)(?::|$)/iu.test(arg))
        return true;
      if (/^-literalpath(?::|$)/iu.test(arg) || /^-literalpath$/iu.test(args2[index - 1] ?? ""))
        return false;
      return /[*?[]/u.test(arg);
    }))
      return { kind: "files", command: name2 };
  }
  if (name2 === "git") {
    return args2[afterOptions(args2, gitValueOptions)] === "grep" ? { kind: "content", command: "git grep" } : {};
  }
  if (["bash", "sh", "zsh", "dash", "ksh"].includes(name2)) {
    const index = args2.findIndex((arg) => arg !== null && /^-[a-z]*c[a-z]*$/u.test(arg));
    const command = index >= 0 ? args2[index + 1] : undefined;
    return typeof command === "string" ? { nested: { command, language: "bash" } } : {};
  }
  if (name2 === "pwsh" || name2 === "powershell") {
    const index = args2.findIndex((arg) => arg !== null && /^-(?:command|c)$/iu.test(arg));
    const command = index >= 0 ? args2[index + 1] : undefined;
    return typeof command === "string" ? { nested: { command, language: "powershell" } } : {};
  }
  if (name2 === "env") {
    const split = args2.slice(0, afterOptions(args2, envValueOptions)).findIndex((arg) => arg === "-S" || arg === "--split-string" || arg?.startsWith("--split-string="));
    const option = split >= 0 ? args2[split] : undefined;
    const command = option?.startsWith("--split-string=") ? option.slice("--split-string=".length) : split >= 0 ? args2[split + 1] : undefined;
    if (typeof command === "string")
      return { nested: { command, language: "bash" } };
  }
  const options = wrapperValueOptions[name2];
  if (!options)
    return {};
  if (name2 === "command" && args2.some((arg) => arg === "-v" || arg === "-V"))
    return {};
  let start2 = afterOptions(args2, options);
  if (name2 === "timeout")
    start2 += 1;
  if (name2 === "env") {
    while (typeof args2[start2] === "string" && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(args2[start2] ?? ""))
      start2 += 1;
  }
  return classifyCommand(args2.slice(start2), language, depth + 1);
}

// src/search-policy-shell.ts
var MAX_POLICY_COMMAND_BYTES = 64 * 1024;
var MAX_SHELL_NESTING = 4;
function literalWord(node, language) {
  const text = node.text;
  if (language === "powershell") {
    if (text.startsWith("'") && text.endsWith("'"))
      return text.slice(1, -1).replaceAll("''", "'");
    if (node.descendantsOfType(["variable", "sub_expression"]).length > 0)
      return null;
    const unquoted = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    return unquoted.replace(/`([`"'$])/gu, "$1");
  }
  if (node.type === "raw_string")
    return text.slice(1, -1);
  if (node.type === "word" || node.type === "string_content" || node.type === "number")
    return text.replace(/\\(.)/gsu, "$1");
  if (["command_name", "concatenation", "string"].includes(node.type)) {
    let result = "";
    for (const child of node.namedChildren) {
      if (!child)
        continue;
      const part = literalWord(child, language);
      if (part === null)
        return null;
      result += part;
    }
    return result;
  }
  return null;
}
function commandWords(node, language) {
  const name2 = node.childForFieldName(language === "bash" ? "name" : "command_name");
  if (!name2)
    return [];
  const args2 = language === "bash" ? node.childrenForFieldName("argument").filter((child) => child !== null) : node.childForFieldName("command_elements")?.namedChildren.filter((child) => child !== null && !["command_argument_sep", "redirection"].includes(child.type)) ?? [];
  return [literalWord(name2, language), ...args2.map((arg) => literalWord(arg, language))];
}
function isSafePipelineFilter(node, language, words) {
  const executable = words[0];
  if (executable === null || executable === undefined)
    return false;
  const name2 = executableName(executable);
  const filterNames = language === "powershell" ? new Set(["select-string", "sls"]) : new Set(["grep", "egrep", "fgrep"]);
  if (!filterNames.has(language === "powershell" ? name2.toLowerCase() : name2))
    return false;
  const pipeline = node.parent;
  if (!pipeline || pipeline.type !== "pipeline")
    return false;
  const commands = pipeline.namedChildren.filter((child) => child !== null && child.type === "command");
  const last = commands.at(-1);
  if (!last || last.startIndex !== node.startIndex || last.endIndex !== node.endIndex || commands.length < 2)
    return false;
  return commands.slice(0, -1).every((candidate) => {
    const decision = classifyCommand(commandWords(candidate, language), language);
    return !decision.kind && !decision.nested;
  });
}

class ShellSearchPolicy {
  #assets;
  #initialization;
  #languages = new Map;
  constructor(assets) {
    this.#assets = assets;
  }
  async inspect(command, language) {
    if (Buffer.byteLength(command, "utf8") > MAX_POLICY_COMMAND_BYTES)
      throw new Error("Search policy command exceeds 64 KiB; split the shell request");
    this.#initialization ??= Parser.init({
      locateFile: () => fileURLToPath4(new URL("tree-sitter.wasm", this.#assets))
    });
    await this.#initialization;
    for (const shell of ["bash", "powershell"]) {
      if (!this.#languages.has(shell))
        this.#languages.set(shell, Language.load(fileURLToPath4(new URL(`tree-sitter-${shell}.wasm`, this.#assets))));
    }
    const [bash, powershell] = await Promise.all([
      this.#languages.get("bash"),
      this.#languages.get("powershell")
    ]);
    if (!bash || !powershell)
      throw new Error("Search policy grammar initialization failed");
    return this.#inspect(command, language, { bash, powershell }, 0, { nextCommandIndex: 1 });
  }
  #inspect(command, language, grammars, depth, state) {
    if (depth > MAX_SHELL_NESTING)
      throw new Error("Search policy shell nesting exceeds 4 levels; simplify the command");
    const parser = new Parser;
    try {
      parser.setLanguage(grammars[language]);
      const deadline = performance.now() + 100;
      const tree = parser.parse(command, null, {
        progressCallback: () => performance.now() > deadline
      });
      if (!tree)
        throw new Error("Search policy parsing exceeded its time budget; simplify the command");
      try {
        const commands = tree.rootNode.descendantsOfType("command");
        for (const node of commands) {
          if (!node)
            continue;
          const commandIndex = state.nextCommandIndex;
          state.nextCommandIndex += 1;
          const words = commandWords(node, language);
          const decision = classifyCommand(words, language);
          if (decision.kind && !(decision.kind === "content" && isSafePipelineFilter(node, language, words)))
            return {
              kind: decision.kind,
              command: decision.command ?? "search command",
              commandIndex,
              startByte: node.startIndex,
              endByte: node.endIndex,
              nestedDepth: depth,
              language
            };
          if (decision.nested) {
            const nested = this.#inspect(decision.nested.command, decision.nested.language, grammars, depth + 1, state);
            if (nested)
              return nested;
          }
        }
        return;
      } finally {
        tree.delete();
      }
    } finally {
      parser.delete();
    }
  }
}

// src/search-policy.ts
var SEARCH_POLICY_GUIDANCE = "Local content and filename searches must use baoer_signal_grep. Built-in search tools and direct search commands are blocked before execution; filtering output from an unrelated producer at a pipeline tail remains available. Use pattern for contents or mode=files with query for filenames. Keep read/edit/write, tests and builds available. After a denial, call baoer_signal_grep once with the stated repair; do not paste the denial into the request, repeat the blocked call, use another shell/custom script, or weaken the search mode.";
var PI_REPLACED_SEARCH_TOOLS = new Set(["grep", "find"]);
var PREFERRED_SEARCH_GUIDANCE = "Prefer baoer_signal_grep for local content and filename searches because it provides bounded evidence, coverage and continuation details. Conventional search entries remain available in advisory mode.";
var contentTools = new Set(["grep", "Grep", "SearchFileContent"]);
var fileTools = new Set(["find", "glob", "Glob", "GlobFile", "SearchFiles"]);
var shellTools = new Set([
  "bash",
  "Bash",
  "powershell",
  "PowerShell",
  "Shell",
  "exec_command",
  "shell_command",
  "shell"
]);
function isInputRecord(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
function recovery(kind) {
  return kind === "files" ? '{"mode":"files","query":"<filename or path>","path":"<scope>"}' : '{"pattern":"<search text>","path":"<scope>","scope":"strict"}';
}
function blockedMatch(match) {
  const location = match.nestedDepth > 0 ? `nested ${match.language} command #${match.commandIndex}` : `${match.language} subcommand #${match.commandIndex}`;
  const request = recovery(match.kind);
  return {
    block: true,
    reason: `baoer_signal_grep search policy blocked direct ${match.kind} search at ${location} (${match.command} \u2026, bytes ${match.startByte}-${match.endByte}); the atomic shell call did not run. Split out non-search operations, then retry exactly once through baoer_signal_grep (possibly MCP-prefixed) with ${request}. Do not include this denial in the retry, repeat it through another shell/script, or weaken the search. If baoer_signal_grep is unavailable, report that connection error once without attempting another search.`
  };
}
function blockedTool(kind, toolName) {
  return {
    block: true,
    reason: `baoer_signal_grep search policy blocked direct ${kind} tool ${toolName}; it did not run. Retry exactly once through baoer_signal_grep (possibly MCP-prefixed) with ${recovery(kind)}. Do not include this denial in the retry, use another search entry, or weaken the search. If baoer_signal_grep is unavailable, report that connection error once without attempting another search.`
  };
}

class SearchPolicy {
  #shell;
  constructor(assets) {
    this.#shell = new ShellSearchPolicy(assets);
  }
  async check(toolName, input, signal) {
    signal?.throwIfAborted();
    if (contentTools.has(toolName))
      return blockedTool("content", toolName);
    if (fileTools.has(toolName))
      return blockedTool("files", toolName);
    if (!shellTools.has(toolName))
      return;
    if (!isInputRecord(input))
      throw new Error("Search policy expected a tool input object");
    const fields = input;
    const command = fields.command ?? fields.cmd;
    if (typeof command !== "string")
      throw new Error("Search policy expected a shell command string");
    const shell = typeof fields.shell === "string" ? fields.shell : "";
    const language = /powershell|pwsh/iu.test(`${toolName} ${shell}`) || process.platform === "win32" && toolName !== "bash" ? "powershell" : "bash";
    const match = await this.#shell.inspect(command, language);
    signal?.throwIfAborted();
    return match ? blockedMatch(match) : undefined;
  }
}

// node_modules/typebox/build/system/memory/metrics.mjs
var Metrics = {
  assign: 0,
  create: 0,
  clone: 0,
  discard: 0,
  update: 0
};

// node_modules/typebox/build/guard/guard.mjs
function IsArray(value) {
  return Array.isArray(value);
}
function IsNull(value) {
  return IsEqual(value, null);
}
function IsObject(value) {
  return IsEqual(typeof value, "object") && !IsNull(value);
}
function IsEqual(left, right) {
  return left === right;
}
function IsClassInstance(value) {
  if (!IsObject(value))
    return false;
  const proto = globalThis.Object.getPrototypeOf(value);
  if (IsNull(proto))
    return false;
  return IsEqual(typeof proto.constructor, "function") && !(IsEqual(proto.constructor, globalThis.Object) || IsEqual(proto.constructor.name, "Object"));
}
function IsUnsafePropertyKey(key) {
  return IsEqual(key, "__proto__") || IsEqual(key, "constructor") || IsEqual(key, "prototype");
}
function HasPropertyKey(value, key) {
  return IsUnsafePropertyKey(key) ? Object.prototype.hasOwnProperty.call(value, key) : (key in value);
}
function Keys(value) {
  return Object.getOwnPropertyNames(value);
}
function Symbols(value) {
  return Object.getOwnPropertySymbols(value);
}
// node_modules/typebox/build/guard/globals.mjs
function IsTypeArray(value) {
  return globalThis.ArrayBuffer.isView(value);
}
function IsRegExp(value) {
  return value instanceof globalThis.RegExp;
}
function IsSet(value) {
  return value instanceof globalThis.Set;
}
function IsMap(value) {
  return value instanceof globalThis.Map;
}
// node_modules/typebox/build/system/settings/settings.mjs
var settings = {
  immutableTypes: false,
  maxErrors: 8,
  maxInstantiationCount: 128,
  useAcceleration: true,
  exactOptionalPropertyTypes: false,
  enumerableKind: false,
  correctiveParse: false,
  unionPrioritySort: true
};
function Get() {
  return settings;
}
// node_modules/typebox/build/system/memory/freeze.mjs
function Freeze(value) {
  return Get().immutableTypes ? Object.freeze(value) : value;
}
// node_modules/typebox/build/system/memory/clone.mjs
function FromClassInstance(value) {
  return value;
}
function IsSchemaObject(value) {
  return HasPropertyKey(value, "~kind") || HasPropertyKey(value, "~unsafe");
}
function FromSchemaObject(value) {
  const result = {};
  for (const key of Keys(value)) {
    if (IsUnsafePropertyKey(key))
      continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    descriptor.value = FromValue(descriptor.value);
    if (IsEqual(descriptor.enumerable, true)) {
      result[key] = descriptor.value;
    } else {
      Object.defineProperty(result, key, descriptor);
    }
  }
  return result;
}
function FromPlainObject(value) {
  const result = {};
  for (const key of Keys(value)) {
    if (IsUnsafePropertyKey(key))
      continue;
    result[key] = FromValue(value[key]);
  }
  for (const key of Symbols(value)) {
    result[key] = FromValue(value[key]);
  }
  return result;
}
function FromObject(value) {
  return IsClassInstance(value) ? FromClassInstance(value) : IsSchemaObject(value) ? FromSchemaObject(value) : FromPlainObject(value);
}
function FromArray(value) {
  return value.map((element) => FromValue(element));
}
function FromTypedArray(value) {
  return value.slice();
}
function FromRegExp(value) {
  return new RegExp(value.source, value.flags);
}
function FromMap(value) {
  return new Map(FromValue([...value.entries()]));
}
function FromSet(value) {
  return new Set(FromValue([...value.values()]));
}
function FromValue(value) {
  return IsTypeArray(value) ? FromTypedArray(value) : IsRegExp(value) ? FromRegExp(value) : IsMap(value) ? FromMap(value) : IsSet(value) ? FromSet(value) : IsArray(value) ? FromArray(value) : IsObject(value) ? FromObject(value) : value;
}
function Clone(value) {
  Metrics.clone += 1;
  return FromValue(value);
}
// node_modules/typebox/build/system/memory/create.mjs
function MergeHidden(left, right) {
  for (const key of Object.keys(right)) {
    Object.defineProperty(left, key, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: right[key]
    });
  }
  return left;
}
function Merge(left, right) {
  return { ...left, ...right };
}
function Create(hidden, enumerable, options = {}) {
  Metrics.create += 1;
  const withOptions = Merge(enumerable, options);
  const withHidden = Get().enumerableKind ? Merge(withOptions, hidden) : MergeHidden(withOptions, hidden);
  return Freeze(withHidden);
}
// node_modules/typebox/build/system/memory/update.mjs
function Update(current, hidden, enumerable) {
  Metrics.update += 1;
  const settings = Get();
  const result = Clone(current);
  for (const key of Object.keys(hidden)) {
    Object.defineProperty(result, key, {
      configurable: true,
      writable: true,
      enumerable: settings.enumerableKind,
      value: hidden[key]
    });
  }
  for (const key of Object.keys(enumerable)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: enumerable[key]
    });
  }
  return Freeze(result);
}
// node_modules/typebox/build/type/types/schema.mjs
function IsSchema(value) {
  return IsObject(value);
}

// node_modules/typebox/build/type/engine/optional/instantiate_add.mjs
function AddOptionalOperation(type) {
  return Update(type, { "~optional": true }, {});
}
function AddOptionalAction(type, options) {
  const result = Update(AddOptionalOperation(type), {}, options);
  return result;
}

// node_modules/typebox/build/type/types/array.mjs
function _Array_(items, options) {
  return Create({ "~kind": "Array" }, { type: "array", items }, options);
}

// node_modules/typebox/build/type/action/_add_optional.mjs
function AddOptional(type, options = {}) {
  return AddOptionalAction(type, options);
}

// node_modules/typebox/build/type/types/_optional.mjs
function Optional(type) {
  return AddOptional(type);
}
function IsOptional(value) {
  return IsSchema(value) && HasPropertyKey(value, "~optional");
}

// node_modules/typebox/build/type/types/properties.mjs
function RequiredArray(properties) {
  return Keys(properties).filter((key) => !IsOptional(properties[key]));
}

// node_modules/typebox/build/type/types/object.mjs
function _Object_(properties, options = {}) {
  const requiredKeys = RequiredArray(properties);
  const required = requiredKeys.length > 0 ? { required: requiredKeys } : {};
  return Create({ "~kind": "Object" }, { type: "object", ...required, properties }, options);
}

// node_modules/typebox/build/type/types/unsafe.mjs
function Unsafe(schema) {
  return Update(schema, { ["~unsafe"]: null }, {});
}
// node_modules/typebox/build/system/hashing/hash.mjs
var ByteMarker;
(function(ByteMarker) {
  ByteMarker[ByteMarker["Array"] = 0] = "Array";
  ByteMarker[ByteMarker["BigInt"] = 1] = "BigInt";
  ByteMarker[ByteMarker["Boolean"] = 2] = "Boolean";
  ByteMarker[ByteMarker["Date"] = 3] = "Date";
  ByteMarker[ByteMarker["Constructor"] = 4] = "Constructor";
  ByteMarker[ByteMarker["Function"] = 5] = "Function";
  ByteMarker[ByteMarker["Null"] = 6] = "Null";
  ByteMarker[ByteMarker["Number"] = 7] = "Number";
  ByteMarker[ByteMarker["Object"] = 8] = "Object";
  ByteMarker[ByteMarker["RegExp"] = 9] = "RegExp";
  ByteMarker[ByteMarker["String"] = 10] = "String";
  ByteMarker[ByteMarker["Symbol"] = 11] = "Symbol";
  ByteMarker[ByteMarker["TypeArray"] = 12] = "TypeArray";
  ByteMarker[ByteMarker["Undefined"] = 13] = "Undefined";
})(ByteMarker || (ByteMarker = {}));
var Accumulator = BigInt("14695981039346656037");
var [Prime, Size] = [BigInt("1099511628211"), BigInt("18446744073709551616")];
var Bytes = Array.from({ length: 256 }).map((_, i2) => BigInt(i2));
var F64 = new Float64Array(1);
var F64In = new DataView(F64.buffer);
var F64Out = new Uint8Array(F64.buffer);
var encoder = new TextEncoder;
// node_modules/typebox/build/type/types/boolean.mjs
function Boolean2(options) {
  return Create({ "~kind": "Boolean" }, { type: "boolean" }, options);
}
// node_modules/typebox/build/type/types/integer.mjs
var IntegerPattern = "-?(?:0|[1-9][0-9]*)";
function Integer(options) {
  return Create({ "~kind": "Integer" }, { type: "integer" }, options);
}
// node_modules/typebox/build/type/types/number.mjs
var NumberPattern = "-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?";
function Number2(options) {
  return Create({ "~kind": "Number" }, { type: "number" }, options);
}
// node_modules/typebox/build/type/types/string.mjs
var StringPattern = ".*";
function String2(options) {
  return Create({ "~kind": "String" }, { type: "string" }, options);
}

// node_modules/typebox/build/type/types/union.mjs
function Union(anyOf, options = {}) {
  return Create({ "~kind": "Union" }, { anyOf }, options);
}

// node_modules/typebox/build/type/types/record.mjs
var IntegerKey = `^${IntegerPattern}$`;
var NumberKey = `^${NumberPattern}$`;
var StringKey = `^${StringPattern}$`;
// node_modules/typebox/build/type/script/token/internal/char.mjs
function Range(start2, end) {
  return Array.from({ length: end - start2 + 1 }, (_, i2) => String.fromCharCode(start2 + i2));
}
var Alpha = [
  ...Range(97, 122),
  ...Range(65, 90)
];
var Zero = "0";
var NonZero = Range(49, 57);
var Digit = [Zero, ...NonZero];
var UnderScore = "_";
var DollarSign = "$";

// node_modules/typebox/build/type/script/token/unsigned_integer.mjs
var AllowedDigits = [...Digit, UnderScore];
// node_modules/typebox/build/type/script/token/ident.mjs
var Initial = [...Alpha, UnderScore, DollarSign];
var Remaining = [...Initial, ...Digit];
// node_modules/typebox/build/type/script/token/unsigned_number.mjs
var AllowedDigits2 = [...Digit, UnderScore];
// node_modules/typebox/build/type/engine/helpers/keys.mjs
var integerKeyPattern = new RegExp("^(?:0|[1-9][0-9]*)$");

// node_modules/typebox/build/type/engine/indexed/from_object.mjs
var NumericKeyPattern = new RegExp(IntegerKey);
// src/tool-schema.ts
function stringEnum(values, options) {
  return Unsafe({
    type: "string",
    enum: values,
    ...options?.description ? { description: options.description } : {}
  });
}
var signalGrepSchema = _Object_({
  column: Optional(Integer({
    minimum: 1,
    description: "1-based UTF-16 column for exact compiler navigation; requires path and line."
  })),
  query: Optional(String2({
    maxLength: 256,
    description: "With mode=files, a filename/path/fuzzy query (optional); with mode=concept or hybrid, a required natural-language question. Hybrid uses the same query as exact literal text and as the local concept query. Discovery modes preserve their requested path. Concept and hybrid require an explicitly installed local model."
  })),
  scope: Optional(stringEnum(["strict", "expand"], {
    description: "Content search scope: strict never expands a zero-result path; expand (default) retries from project cwd. Applies to ordinary, multi-term and role searches."
  })),
  wholeWord: Optional(Boolean2({
    description: "Single-pattern search only: require ripgrep Unicode word boundaries around the match. Works with regex or literal=true."
  })),
  anyOf: Optional(_Array_(String2({ maxLength: MAX_LITERAL_TERM_BYTES }), {
    minItems: MIN_ANY_OF_TERMS,
    maxItems: MAX_ANY_OF_TOTAL_TERMS,
    description: `Exact literal union: ${String(MIN_ANY_OF_TERMS)}-${String(MAX_ANY_OF_TOTAL_TERMS)} distinct case-sensitive single-line terms, at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes each. Requests above ${String(MAX_ANY_OF_TERMS)} terms are split into version-checked chunks and merged. Returns every retained occurrence attributed to its term. Omit pattern, allOf, within, roles, literal and ignoreCase.`
  })),
  allOf: Optional(_Array_(String2({ maxLength: MAX_PATH_CHARACTERS }), {
    minItems: 2,
    maxItems: 3,
    description: "Explicit AND: 2-3 distinct case-sensitive literal terms, all in one file (default) or one function. Omit pattern, roles, literal and ignoreCase."
  })),
  within: Optional(stringEnum(["file", "function"], {
    description: "Only valid with allOf; omit for ordinary single-pattern searches. function requires JS/TS/TSX and counts only that implementation's own code, excluding nested callbacks, strings/comments/types. Not proof of a shared execution path."
  })),
  roles: Optional(_Array_(stringEnum([
    "declaration",
    "call",
    "import",
    "export",
    "comment",
    "string",
    "jsx-text",
    "code",
    "unknown"
  ]), {
    minItems: 1,
    description: "Filter each single-pattern occurrence by syntax role (JS/TS/TSX/Go). Roles may be candidates, especially Go call/conversion ambiguity. Cannot combine with allOf."
  })),
  changes: Optional(_Object_({
    base: Optional(String2({
      description: "Git base commit/ref; default HEAD, pinned to a commit at query time."
    })),
    target: Optional(String2({
      description: "Optional target commit/ref. Omit for final working-tree contents including unignored untracked files, not just the staged index."
    })),
    scope: stringEnum(["files", "lines"], {
      description: "Search changed files or only changed lines. With allOf every term must lie on the chosen side's changed lines."
    }),
    side: stringEnum(["new", "old"], {
      description: "Choose final/new content or deleted/old content. Historical inspect and continuation remain bound to that commit/blob."
    })
  })),
  sourceCursor: Optional(String2({
    description: "Missing-source continuation token. Copy nextRequest exactly: mode=inspect plus sourceCursor only. Same token replays the same page; changed or expired sources fail clearly."
  })),
  symbol: Optional(String2({
    description: "Binding name for imports/tests/impact; semantic modes accept it only when it identifies one source occurrence. Prefer exact path+line+column when the name repeats."
  })),
  pattern: Optional(String2({
    maxLength: MAX_PATTERN_CHARACTERS,
    description: "Ordinary search: regex or literal=true text. mode=structure: ast-grep code pattern, at most 4 KiB, including $NAME and $$$ARGS metavariables; no regex/literal options. Omit for discovery, semantic navigation, inspection and cursors."
  })),
  path: Optional(String2({
    maxLength: MAX_PATH_CHARACTERS,
    description: "Search root or source file. A zero-result content search expands from cwd unless scope=strict. Compiler navigation stays within admitted workspace sources. Absolute paths and .. traversal may resolve outside cwd, except protected external system areas and .git internals; Git changes mode remains cwd-scoped."
  })),
  paths: Optional(_Array_(String2(), {
    minItems: 1,
    maxItems: MAX_SELECTED_PATHS,
    description: "Exact retained files to select together from a cursor. A new search accepts one path; split multiple roots into separate requests."
  })),
  glob: Optional(Union([
    String2({ maxLength: MAX_PATH_CHARACTERS }),
    _Array_(String2({ maxLength: MAX_PATH_CHARACTERS }), {
      maxItems: MAX_FILE_FILTER_ITEMS
    })
  ], {
    description: "Include glob or globs, for example '*.ts' or 'src/**'."
  })),
  exclude: Optional(Union([
    String2({ maxLength: MAX_PATH_CHARACTERS }),
    _Array_(String2({ maxLength: MAX_PATH_CHARACTERS }), {
      maxItems: MAX_FILE_FILTER_ITEMS
    })
  ], {
    description: "Exclude file/path globs (not content negation); applied after include globs. A leading ! is optional."
  })),
  literal: Optional(Boolean2({ description: "Treat pattern as literal text." })),
  ignoreCase: Optional(Boolean2({
    description: "true for insensitive, false for sensitive; omitted uses smart-case."
  })),
  hidden: Optional(Boolean2({ description: "Search hidden files (default true; .git is always excluded)." })),
  redact: Optional(Boolean2({
    description: "Optional display-only masking for credential-like values and private-key bodies. Default false. It never changes searched files, admitted matches, counts, or cursor completeness."
  })),
  modifiedAfter: Optional(Integer({
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    description: "Worktree modification-time lower bound, inclusive, as a Unix timestamp in milliseconds. Not valid with Git changes."
  })),
  modifiedBefore: Optional(Integer({
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    description: "Worktree modification-time upper bound, exclusive, as a Unix timestamp in milliseconds. Not valid with Git changes."
  })),
  maxFilesToParse: Optional(Integer({
    minimum: 1,
    maximum: MAX_CONFIGURABLE_STRUCTURE_FILES,
    description: `Maximum source files parsed by one structural analysis request (default 200, max ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}). Candidate discovery still searches the full requested scope.`
  })),
  conceptLimit: Optional(Integer({
    minimum: 1,
    maximum: MAX_HYBRID_CONCEPT_LIMIT,
    description: `mode=hybrid only: retain the top semantic candidates after overlap deduplication (default ${String(DEFAULT_HYBRID_CONCEPT_LIMIT)}, max ${String(MAX_HYBRID_CONCEPT_LIMIT)}). Literal evidence has an independent retention budget and is never displaced by this limit.`
  })),
  context: Optional(Integer({
    minimum: 0,
    maximum: MAX_CONTEXT_LINES,
    description: "New search only: nearby lines (0-20). MUST be omitted for inspect, which selects its own bounded source window."
  })),
  limit: Optional(Integer({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: "New search only: explicit detail-page match limit (max 100). Normally omit to preserve automatic summarization; not valid for inspect."
  })),
  mode: Optional(stringEnum([
    "auto",
    "summary",
    "matches",
    "inspect",
    "outline",
    "imports",
    "tests",
    "impact",
    "files",
    "structure",
    "concept",
    "hybrid",
    "definitions",
    "references",
    "implementations",
    "callers",
    "callees",
    "dependencies",
    "dependents"
  ], {
    description: "Ordinary search defaults to auto; summary/matches request explicit pages. files uses query, structure uses an AST pattern, concept uses natural-language query, and hybrid uses one query for exact literal plus concept evidence in a single snapshot. definitions/references/implementations/callers/callees require a workspace path and exact line+column or unique symbol; dependencies/dependents require only a workspace file path. inspect/outline/imports/tests/impact retain their documented location selectors. tests supports JS/TS/TSX sources; Python supports outline, not related-test navigation. Compiler results are static evidence; concept and related-test results remain candidates."
  })),
  line: Optional(Number2({
    description: "1-indexed source line for path inspection/navigation/impact. Omit with matchIndex, matchIndices or targets."
  })),
  matchIndex: Optional(Number2({
    description: "1-based retained match index for cursor-scoped inspect; replaces path and line."
  })),
  matchIndices: Optional(_Array_(Integer({ minimum: 1 }), {
    minItems: 1,
    maxItems: MAX_INSPECT_TARGETS,
    description: "Inspect up to five visible match numbers together using the same cursor; mutually exclusive with matchIndex, path, line and targets."
  })),
  targets: Optional(_Array_(_Object_({
    path: String2({ maxLength: MAX_PATH_CHARACTERS }),
    line: Integer({ minimum: 1 })
  }), {
    minItems: 1,
    maxItems: MAX_INSPECT_TARGETS,
    description: "Inspect known path/line locations together without a cursor. The complete batch shares one 16 KiB response budget."
  })),
  cursor: Optional(String2({ description: "Opaque cursor from a previous stable search snapshot." }))
});

// src/model-error.ts
import { types as types2 } from "util";
var MAX_RAW_ERROR_SCAN_CHARACTERS = 4096;
var MAX_MODEL_ERROR_CHARACTERS = 1024;
var MODEL_ERROR_PREFIX = "baoer_signal_grep failed:";
function errorMessage(error) {
  try {
    if (types2.isNativeError(error)) {
      const message = Object.getOwnPropertyDescriptor(error, "message");
      if (!message)
        return "unknown failure";
      return typeof message.value === "string" ? message.value : "unreadable failure";
    }
    if (error === null)
      return "null";
    switch (typeof error) {
      case "string":
        return error;
      case "number":
        return String(error);
      case "boolean":
        return error ? "true" : "false";
      case "undefined":
        return "undefined";
      case "bigint":
        return "bigint failure";
      case "symbol":
        return "symbol failure";
      case "function":
      case "object":
        return "non-error failure";
      default:
        return "unreadable failure";
    }
  } catch {
    return "unreadable failure";
  }
}
function modelErrorText(error) {
  const raw = errorMessage(error);
  const normalized = raw.slice(0, MAX_RAW_ERROR_SCAN_CHARACTERS).toWellFormed().replace(/\s+/gu, " ").trim();
  const message = normalized.replace(/^(?:baoer_signal_grep failed:\s*)+/u, "") || "unknown failure";
  const text = `${MODEL_ERROR_PREFIX} ${message}`;
  if (text.length <= MAX_MODEL_ERROR_CHARACTERS)
    return text;
  return `${text.slice(0, MAX_MODEL_ERROR_CHARACTERS - 1).toWellFormed()}\u2026`;
}

// src/omp-index.ts
var SIGNAL_GREP_LABEL = "baoer_signal_grep";
var OMP_REPLACED_SEARCH_TOOLS = new Set(["grep", "glob"]);
function expandTilde(path) {
  if (path === "~")
    return homedir2();
  if (path.startsWith("~/"))
    return join4(homedir2(), path.slice(2));
  return path;
}
function ompProfile() {
  const value = process.env.OMP_PROFILE ?? process.env.PI_PROFILE;
  if (value === undefined)
    return;
  const profile = value.trim();
  if (!profile || profile === "default")
    return;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile) || profile.endsWith("."))
    return;
  return profile;
}
function ompAgentDir() {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (configured)
    return expandTilde(configured);
  const configDir = process.env.PI_CONFIG_DIR || ".omp";
  const profile = ompProfile();
  return profile ? join4(homedir2(), configDir, "profiles", profile, "agent") : join4(homedir2(), configDir, "agent");
}
function selectSearchTools(pi, replaceAlternatives) {
  const current = pi.getActiveTools();
  const next = replaceAlternatives ? current.filter((tool) => !OMP_REPLACED_SEARCH_TOOLS.has(tool)) : [...current];
  if (!next.includes(SIGNAL_GREP_LABEL))
    next.push(SIGNAL_GREP_LABEL);
  return next;
}
function toolSelectionChanged(current, next) {
  return current.length !== next.length || next.some((tool, index) => tool !== current[index]);
}
function resultOptions(options, result) {
  return { ...options, isError: result.isError === true };
}
async function registerOmpSignalGrepExtension(pi, searchPolicyAssets = new URL("../plugins/baoer-signal-grep/hooks/", import.meta.url), config) {
  const runtime = new SignalGrepRuntime(new SignalGrepService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider()
  }));
  const policy = new SearchPolicy(searchPolicyAssets);
  const resolvedConfig = config ?? await readSignalGrepConfigFile(join4(ompAgentDir(), SIGNAL_GREP_CONFIG_FILE));
  const { locale } = resolvedConfig;
  const enforcement = normalizeSearchEnforcement(resolvedConfig.enforceSearch, "OMP extension config");
  let selection = Promise.resolve();
  const updateSelection = async () => {
    const current = pi.getActiveTools();
    const next = selectSearchTools(pi, enforcement === "hard");
    if (toolSelectionChanged(current, next))
      await pi.setActiveTools(next);
  };
  const selectTools = () => {
    selection = selection.then(updateSelection);
    return selection;
  };
  pi.registerTool({
    name: SIGNAL_GREP_LABEL,
    label: SIGNAL_GREP_LABEL,
    description: "Search and navigate code with bounded, verifiable evidence. Use pattern for content or mode=files with query for filenames.",
    approval: "read",
    promptSnippet: "Search file contents without flooding context",
    promptGuidelines: signalGrepPromptGuidelines(),
    parameters: signalGrepSchema,
    renderCall(params, _options, theme) {
      return renderSignalGrepCall(params, locale, theme);
    },
    renderResult(result, options, theme) {
      return renderSignalGrepResult(result, resultOptions(options, result), locale, theme);
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        const result = await runtime.search(params, ctx.cwd, signal, resolveContextBudget(ctx.getContextUsage()));
        ctx.ui.setStatus(SESSION_STATUS_KEY, runtime.formatSessionStatus(locale));
        return {
          content: [{ type: "text", text: result.text }],
          details: result.details
        };
      } catch (error) {
        if (signal?.aborted)
          throw error;
        throw new Error(modelErrorText(error));
      }
    }
  });
  if (enforcement !== "off") {
    pi.on("session_start", selectTools);
    pi.on("before_agent_start", async (event) => {
      await selectTools();
      const guidance = enforcement === "hard" ? SEARCH_POLICY_GUIDANCE : PREFERRED_SEARCH_GUIDANCE;
      return { systemPrompt: [...event.systemPrompt, guidance] };
    });
    if (enforcement === "hard")
      pi.on("tool_call", (event) => policy.check(event.toolName, event.input));
  }
  pi.on("session_shutdown", async (_event, ctx) => {
    await runtime.shutdown();
    ctx.ui.setStatus(SESSION_STATUS_KEY, undefined);
  });
}

// src/omp-marketplace-entry.ts
async function marketplaceSignalGrepExtension(pi) {
  await registerOmpSignalGrepExtension(pi, new URL("./hooks/", import.meta.url));
}
export {
  marketplaceSignalGrepExtension as default
};
