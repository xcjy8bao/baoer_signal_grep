#!/usr/bin/env node

// src/mcp.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { createServer } from "node:http";
import { URL as URL2 } from "node:url";
// package.json
var package_default = {
  name: "baoer_signal_grep",
  version: "1.2.0",
  description: "Context-efficient local search for files, documents, notes and logs across Pi and MCP clients",
  keywords: [
    "ai-agent",
    "claude-code",
    "code-navigation",
    "codex",
    "context-engineering",
    "grep",
    "mcp",
    "pi",
    "pi-extension",
    "pi-package",
    "ripgrep",
    "search",
    "source-inspection"
  ],
  homepage: "https://github.com/xcjy8bao/baoer_signal_grep#readme",
  bugs: {
    url: "https://github.com/xcjy8bao/baoer_signal_grep/issues"
  },
  license: "AGPL-3.0-only",
  author: "宝儿",
  repository: {
    type: "git",
    url: "git+https://github.com/xcjy8bao/baoer_signal_grep.git"
  },
  bin: {
    baoer_signal_grep_mcp: "./src/mcp-server.mjs",
    baoer_signal_grep_model: "./src/concept-worker.mjs"
  },
  files: [
    "src/**/*.ts",
    "src/syntax-worker.mjs",
    "src/mcp-server.mjs",
    "src/syntax-worker.toml",
    "README.md",
    "README.zh-CN.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "CHANGELOG.md",
    "SECURITY.md",
    "src/concept-worker.mjs",
    "plugins/baoer-signal-grep/**"
  ],
  type: "module",
  publishConfig: {
    access: "public",
    provenance: true,
    registry: "https://registry.npmjs.org"
  },
  scripts: {
    "build:worker": "bun run scripts/build-syntax-worker.ts",
    "check:worker": "bun run doc/testing/scripts/check-syntax-worker.ts",
    "build:mcp": "bun run scripts/build-mcp-server.ts",
    "check:mcp": "bun run doc/testing/scripts/check-mcp-server.ts",
    format: "oxfmt --write .",
    "format:check": "oxfmt --check .",
    lint: "oxlint --type-aware --deny-warnings --report-unused-disable-directives src scripts",
    typecheck: "tsc --noEmit",
    test: "bun test ./doc/testing/test",
    "test:node": "bun run doc/testing/scripts/node-smoke.ts",
    benchmark: "bun run doc/testing/scripts/benchmark.ts",
    check: "bun run format:check && bun run lint && bun run typecheck && bun run build",
    "pack:check": "bun pm pack --dry-run",
    "setup:concept": "bun run src/concept-worker.mjs --install-model",
    "build:concept-worker": "bun run scripts/build-concept-worker.ts",
    "check:concept-worker": "bun run doc/testing/scripts/check-concept-worker.ts",
    "test:concept": "bun run doc/testing/scripts/test-concept.ts",
    "evaluate:investigations": "bun run doc/testing/scripts/investigation-eval.ts",
    "build:search-plugin": "bun run scripts/build-search-plugin.ts",
    "check:search-plugin": "bun run doc/testing/scripts/check-search-plugin.ts",
    "test:mcp-hosts": "bun run doc/testing/scripts/mcp-host-verification.ts",
    build: "bun run build:worker && bun run build:concept-worker && bun run build:search-plugin && bun run build:mcp",
    "format:local:check": "bun run doc/testing/scripts/format-local.ts --check",
    "lint:local": "oxlint --no-ignore --type-aware --tsconfig doc/testing/tsconfig.json --deny-warnings --report-unused-disable-directives src scripts doc/testing/test doc/testing/scripts",
    "typecheck:local": "tsc --noEmit --project doc/testing/tsconfig.json",
    "check:local": "bun run format:check && bun run format:local:check && bun run check:search-plugin && bun run check:concept-worker && bun run check:worker && bun run check:mcp && bun run lint:local && bun run typecheck:local && bun run test && bun run test:node && bun run benchmark"
  },
  dependencies: {
    "@ast-grep/lang-go": "0.0.6",
    "@ast-grep/napi": "0.45.2",
    "@huggingface/transformers": "3.8.1",
    "@modelcontextprotocol/sdk": "1.30.0",
    typebox: "1.3.19",
    typescript: "7.0.2",
    "web-tree-sitter": "0.25.10",
    zod: "4.5.4"
  },
  devDependencies: {
    "@earendil-works/pi-ai": "0.84.3",
    "@earendil-works/pi-coding-agent": "0.84.3",
    "@earendil-works/pi-tui": "0.84.3",
    "@types/bun": "^1.4.0",
    oxfmt: "^0.65.0",
    oxlint: "^1.80.0",
    "oxlint-tsgolint": "^7.0.2001",
    "tree-sitter-bash": "0.25.1",
    "tree-sitter-powershell": "0.26.4"
  },
  peerDependencies: {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  },
  peerDependenciesMeta: {
    "@earendil-works/pi-ai": {
      optional: true
    },
    "@earendil-works/pi-coding-agent": {
      optional: true
    },
    "@earendil-works/pi-tui": {
      optional: true
    }
  },
  engines: {
    bun: ">=1.4.0",
    node: ">=22.19.0"
  },
  packageManager: "bun@1.4.0",
  knip: {
    entry: [
      "src/mcp-server.ts"
    ]
  },
  pi: {
    extensions: [
      "./src/index.ts"
    ]
  }
};

// src/mcp.ts
import { Value } from "typebox/value";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// src/rg.ts
import { isAbsolute as isAbsolute2, relative as relative2, resolve as resolve3 } from "node:path";

// src/errors.ts
class SignalGrepError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SignalGrepError";
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

// src/types.ts
var DEFAULT_PAGE_SIZE = 100;
var MAX_PAGE_SIZE = 100;
var DEFAULT_RESULT_TOKEN_BUDGET = 2000;
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
var MAX_SOURCE_REVISION_CONCURRENCY = 16;
var MAX_SOURCE_REVISION_FILES = 50000;

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
  const prefix = startCharacter > 0 ? "…" : "";
  const suffix = endCharacter < text.length ? "…" : "";
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
    const bytes = Buffer.byteLength(JSON.stringify([displayPath, absolutePath])) + 512;
    const metadataLimit = Math.floor(this.maxBytes / 4);
    if (this.#metadataBytes + bytes > metadataLimit)
      throw new SignalGrepError(`File-summary storage exceeds its ${String(metadataLimit)}-byte share of the search budget; narrow the path or filters`);
    this.#bytes += bytes;
    this.#metadataBytes += bytes;
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
import { StringDecoder } from "node:string_decoder";
async function consumeCappedLines(stream, onLine, options = {}) {
  const maxLineBytes = options.maxLineBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  const consumeBuffer = (final) => {
    let newline = buffer.indexOf(`
`);
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
        throw new Error(`Input line exceeds the ${String(maxLineBytes)}-byte limit`);
      }
      onLine(line);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf(`
`);
    }
    if (Buffer.byteLength(buffer, "utf8") > maxLineBytes) {
      throw new Error(`Input line exceeds the ${String(maxLineBytes)}-byte limit${final ? " at end of stream" : ""}`);
    }
  };
  for await (const chunk of stream) {
    buffer += decoder.write(Buffer.from(chunk));
    consumeBuffer(false);
  }
  buffer += decoder.end();
  consumeBuffer(true);
  if (buffer.length > 0)
    onLine(buffer);
}

// src/path-policy.ts
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
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
function directoryNameKey(name) {
  return process.platform === "win32" || process.platform === "darwin" ? name.toLowerCase() : name;
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
  const roots = [...HOME_CREDENTIAL_DIRECTORIES, ...HOME_CREDENTIAL_FILES].map((parts) => join(home, ...parts));
  if (process.platform !== "win32")
    roots.push(...POSIX_SPECIAL_ROOTS);
  if (process.platform === "darwin") {
    roots.push(...DARWIN_CREDENTIAL_DIRECTORIES.map((parts) => join(home, ...parts)));
  } else if (process.platform === "linux") {
    roots.push(...LINUX_CREDENTIAL_DIRECTORIES.map((parts) => join(home, ...parts)));
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
    const args = [];
    const globFlag = process.platform === "win32" || process.platform === "darwin" ? "--iglob" : "--glob";
    for (const name of PORTABLE_CREDENTIAL_DIRECTORY_NAMES) {
      args.push(globFlag, `!${name}`, globFlag, `!${name}/**`, globFlag, `!**/${name}`, globFlag, `!**/${name}/**`);
    }
    for (const root of this.protectedRoots) {
      if (!isPathInsideRoot(root, absolute))
        continue;
      const local = relative(absolute, root);
      if (!local || local === ".")
        continue;
      const escaped = escapeGlobPath(local);
      args.push(globFlag, `!${escaped}`, globFlag, `!${escaped}/**`);
    }
    return args;
  }
}

// src/owned-process.ts
import { spawn } from "node:child_process";
var MAX_STDERR_BYTES = 16 * 1024;
var TERMINATE_GRACE_MS = 250;
var TERMINATE_DEADLINE_MS = 2000;
async function runOwnedProcess(options, consumeOutput) {
  const { executable, args, cwd, signal, env, input } = options;
  if (signal?.aborted)
    throw abortError();
  const spawnOptions = { cwd, windowsHide: true, ...env ? { env } : {} };
  const child = input === undefined && !options.interactive ? spawn(executable, args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] }) : spawn(executable, args, { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"] });
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

// src/scan-revisions.ts
import { resolve as resolve2 } from "node:path";

// src/source.ts
import { readFile, realpath as realpath2, stat } from "node:fs/promises";
var SOURCE_RANGE_METADATA_RESERVE_BYTES = 1024;
var MAX_SOURCE_RANGE_BYTES = MAX_RESULT_BYTES - SOURCE_RANGE_METADATA_RESERVE_BYTES;
async function getSourceRevision(path) {
  try {
    const metadata = await stat(path);
    return sourceRevisionFromStats(metadata);
  } catch {
    return;
  }
}
function sourceRevisionFromStats(metadata) {
  return {
    size: metadata.size,
    mtimeMs: metadata.mtimeMs,
    ctimeMs: metadata.ctimeMs,
    ...metadata.ino !== 0 ? { inode: metadata.ino } : {},
    ...metadata.dev !== 0 ? { device: metadata.dev } : {}
  };
}
function sameSourceRevision(left, right) {
  return left.size === right.size && left.mtimeMs === right.mtimeMs && (left.ctimeMs === undefined || right.ctimeMs === undefined || left.ctimeMs === right.ctimeMs) && left.inode === right.inode && left.device === right.device;
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
    const start = focus?.range.start.character ?? 0;
    const end = focus?.range.end.character ?? start;
    const bytes = focus?.range.encoding === "utf-8" ? raw : undefined;
    const excerpt = excerptText(raw.toString("utf8").replaceAll("\r", ""), bytes ? bytes.subarray(0, start).toString("utf8").replaceAll("\r", "").length : start, bytes ? bytes.subarray(0, end).toString("utf8").replaceAll("\r", "").length : end);
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
async function captureCandidateRevisions(executable, args, cwd, maxFiles, signal) {
  const revisions = new Map;
  let candidateCount = 0;
  const result = await runOwnedProcess({ executable, args, cwd, ...signal ? { signal } : {} }, async (stdout) => {
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
            batch.push(resolve2(cwd, path));
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
  if (result.code !== 0 && result.code !== 1) {
    throw new SignalGrepError(result.stderr.trim() || `ripgrep file enumeration exited with status ${String(result.code)}`);
  }
  return revisions;
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
  const absolutePath = isAbsolute2(rawPath) ? rawPath : resolve3(cwd, rawPath);
  const localPath = relative2(cwd, absolutePath).replaceAll("\\", "/");
  const isInsideCwd = localPath !== ".." && !localPath.startsWith("../") && !isAbsolute2(localPath);
  return {
    absolutePath,
    displayPath: isInsideCwd && localPath.length > 0 ? localPath : absolutePath
  };
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
  const args = [];
  if (request.hidden)
    args.push("--hidden");
  for (const glob of request.glob)
    args.push("--glob", glob);
  for (const excluded of request.exclude) {
    const normalized = excluded.startsWith("!") ? excluded : `!${excluded}`;
    args.push("--glob", normalized);
  }
  args.push("--iglob", "!.git", "--iglob", "!.git/**", "--iglob", "!**/.git/**");
  return args;
}
function buildRipgrepArguments(request, cwd, validatedSearchPath) {
  const searchPath = validatedSearchPath ?? resolve3(cwd, request.path ?? ".");
  const policy = new SearchPathPolicy(cwd);
  policy.assertPath(searchPath);
  const args = [
    "--no-config",
    "--json",
    "--line-number",
    "--color=never",
    "--no-heading",
    ...fileScopeArguments(request),
    ...policy.ripgrepGlobArguments(searchPath)
  ];
  args.push(...patternArguments(request));
  const searchTarget = isPathInsideCwd(searchPath, cwd) ? relative2(resolve3(cwd), searchPath) || "." : searchPath;
  args.push("--", request.pattern, searchTarget);
  return args;
}
function patternArguments(request) {
  return [
    ...request.wholeWord ? ["--word-regexp"] : [],
    ...request.literal ? ["--fixed-strings"] : [],
    request.ignoreCase === true ? "--ignore-case" : request.ignoreCase === false ? "--case-sensitive" : "--smart-case"
  ];
}
function createRipgrepRunner(options = {}) {
  const executable = options.executable ?? "rg";
  const maxStoredMatches = options.maxStoredMatches ?? MAX_STORED_MATCHES;
  const maxEventBytes = options.maxEventBytes ?? MAX_PROTOCOL_LINE_BYTES;
  const maxSourceRevisionFiles = options.maxSourceRevisionFiles ?? MAX_SOURCE_REVISION_FILES;
  return async function runRipgrep(request, cwd, signal) {
    if (signal?.aborted)
      throw abortError();
    const searchPath = resolve3(cwd, request.path ?? ".");
    const policy = new SearchPathPolicy(cwd);
    const validatedSearchPath = await policy.resolveSearchTarget(searchPath);
    const expectedSearchTarget = await policy.resolveExistingPath(validatedSearchPath);
    const searchTarget = isPathInsideCwd(validatedSearchPath, cwd) ? relative2(resolve3(cwd), validatedSearchPath) || "." : validatedSearchPath;
    const args = buildRipgrepArguments(request, cwd, validatedSearchPath);
    if (signal?.aborted)
      throw abortError();
    const matches = [];
    const retention = new SearchRetention(options.maxStoredBytes, options.maxStoredOccurrences);
    const fileCounts = new Map;
    const lossyPaths = new Set;
    let totalMatches = 0;
    let truncatedLines = 0;
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
      if (!fileCounts.has(path.displayPath))
        retention.file(path.displayPath, path.absolutePath);
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
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const { code, stderr } = await runOwnedProcess({ executable, args, cwd, ...signal ? { signal } : {} }, (stdout) => consumeCappedLines(stdout, onLine, { maxLineBytes: maxEventBytes }));
      if (code !== 0 && code !== 1) {
        throw new SignalGrepError(stderr.trim() || `ripgrep exited with status ${String(code)}`);
      }
      await assertSearchTargetIdentity(policy, validatedSearchPath, expectedSearchTarget);
      const retainedPaths = new Set(matches.map((match) => match.absolutePath).filter((path) => !lossyPaths.has(path)));
      await assertRetainedPathsAllowed(policy, [...retainedPaths], signal);
      const sourceRevisions = await retainStableSourceRevisions(retainedPaths, before, signal);
      if (signal?.aborted)
        throw abortError();
      return {
        request,
        matches,
        totalMatches,
        fileCounts,
        sourceRevisions,
        snapshotComplete: matches.length === totalMatches,
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
import { isAbsolute as isAbsolute3, resolve as resolve4 } from "node:path";
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
  const name = asOptionalString(value.name);
  const language = asOptionalString(value.language);
  const kind = asOptionalString(value.kind);
  const scope = asOptionalString(value.scope);
  const line = asOptionalPositiveInteger(value.line);
  const end = asOptionalPositiveInteger(value.end);
  if (!path || !name)
    return;
  return {
    path,
    name,
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
  return resolve4(isAbsolute3(tagPath) ? tagPath : resolve4(cwd, tagPath)) === resolve4(absolutePath);
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
            details: { status: "provider-unavailable", provider: "universal-ctags" },
            currentRevision
          };
        }
        if (error instanceof CtagsProtocolError) {
          return {
            details: { status: "parse-error", provider: "universal-ctags" },
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

// src/service.ts
import { createHash as createHash3 } from "node:crypto";

// src/analysis-evidence.ts
function sourceEvidence(document, range) {
  const line = document.lineAt(range.start);
  const lineRange = document.lineRange(line);
  const lineStart = document.toCharacterOffset(lineRange.start);
  const lineEnd = document.toCharacterOffset(lineRange.end);
  const focus = document.toCharacterOffset(range.start);
  const focusEnd = document.toCharacterOffset(range.end);
  let start = Math.max(lineStart, focus - Math.floor(Math.max(0, MAX_LINE_CHARACTERS - (focusEnd - focus)) / 2));
  let end = Math.min(lineEnd, start + MAX_LINE_CHARACTERS);
  const startCode = document.text.charCodeAt(start);
  const endCode = document.text.charCodeAt(end);
  if (startCode >= 56320 && startCode <= 57343)
    start--;
  if (endCode >= 56320 && endCode <= 57343)
    end--;
  const excerptRange = { start: document.toByteOffset(start), end: document.toByteOffset(end) };
  return {
    range: { ...range },
    line,
    excerpt: `${start > lineStart ? "…" : ""}${document.text.slice(start, end)}${end < lineEnd ? "…" : ""}`,
    excerptRange,
    excerptTruncated: start > lineStart || end < lineEnd
  };
}
function rangeEvidence(document, range) {
  const start = document.toCharacterOffset(range.start);
  const rangeEnd = document.toCharacterOffset(range.end);
  let end = Math.min(rangeEnd, start + MAX_LINE_CHARACTERS);
  const code = document.text.charCodeAt(end);
  if (code >= 56320 && code <= 57343)
    end -= 1;
  return {
    excerpt: `${document.text.slice(start, end)}${end < rangeEnd ? "…" : ""}`,
    excerptRange: { start: range.start, end: document.toByteOffset(end) },
    excerptTruncated: end < rangeEnd
  };
}

// src/semantic-sources.ts
import { pathToFileURL } from "node:url";
import { realpath as realpath3 } from "node:fs/promises";
import { resolve as resolve5 } from "node:path";
async function semanticSources(cwd, documents) {
  const known = new Map;
  const policy = new SearchPathPolicy(cwd);
  for (const document of documents) {
    const absolute = resolve5(cwd, document.path);
    known.set(absolute, document);
    known.set(await realpath3(absolute), document);
  }
  return async (path) => {
    const absolute = resolve5(cwd, path);
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
  return pathToFileURL(await realpath3(resolve5(cwd, path))).href;
}

// src/impact-bindings.ts
import { resolve as resolve6 } from "node:path";

// src/semantic-protocol.ts
import { fileURLToPath } from "node:url";

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
    const body = Buffer.from(JSON.stringify(message));
    if (body.length > MAX_RPC_FRAME_BYTES)
      throw new SignalGrepError("Language-service request exceeds the frame budget");
    const frame = Buffer.concat([
      Buffer.from(`Content-Length: ${String(body.length)}\r
\r
`),
      body
    ]);
    await new Promise((resolve6, reject) => {
      this.#stdin.write(frame, (error) => error ? reject(error) : resolve6());
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
  const start = readPosition(value.start), end = readPosition(value.end);
  if (end.line < start.line || end.line === start.line && end.character < start.character)
    throw new SignalGrepError("Reversed compiler source range");
  return { start, end };
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
function byteAt(document, position) {
  const line = document.lineRange(position.line + 1);
  const character = document.toCharacterOffset(line.start) + position.character;
  const end = document.toCharacterOffset(line.end);
  if (character > end || position.line + 1 < document.lineStarts.length && character === end)
    throw new SignalGrepError("Compiler column is outside the source line");
  return document.toByteOffset(character);
}
function byteRange(document, range) {
  return { start: byteAt(document, range.start), end: byteAt(document, range.end) };
}
function lspPosition(document, character) {
  const value = document.positionAt(document.toByteOffset(character));
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
    const abort = () => cancelled.reject(abortError());
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted)
      abort();
    try {
      await Promise.race([previous, cancelled.promise]);
      if (signal?.aborted)
        throw abortError();
      return await operation();
    } finally {
      signal?.removeEventListener("abort", abort);
      completed.resolve();
    }
  }
}

// src/typescript-client.ts
import { createRequire } from "node:module";
import { dirname, join as join2 } from "node:path";
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
    const metadata = createRequire(import.meta.url).resolve(`${packageName}/package.json`);
    return join2(dirname(metadata), "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
  } catch (error) {
    throw new SignalGrepError(`TypeScript semantic provider is unavailable for ${process.platform}/${process.arch}; reinstall with optional dependencies enabled`, { cause: error });
  }
}
async function runTypeScript(cwd, documents, operation, parent) {
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
      for (const document of documents) {
        const uri = await semanticUri(cwd, document.path);
        await channel.notify("textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: /\.tsx$/i.test(document.path) ? "typescriptreact" : /\.jsx$/i.test(document.path) ? "javascriptreact" : /\.[cm]?ts$/i.test(document.path) ? "typescript" : "javascript",
            version: 1,
            text: document.text
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
function withTypeScript(cwd, documents, operation, parent) {
  return compilerQueue.run(() => runTypeScript(cwd, documents, operation, parent), parent);
}

// src/syntax.ts
import { dirname as dirname2, extname } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

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
  for (let i = 0;i < nodes.length; i++) {
    const parent = nodes[i]?.parent;
    if (parent !== null && parent !== undefined)
      children[parent]?.push(i);
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
  let start = range.start;
  for (let i = low;i < excluded.length; i++) {
    const gap = excluded[i];
    if (!gap || gap.start >= range.end)
      break;
    if (gap.start > start)
      results.push({ start, end: gap.start });
    start = Math.max(start, gap.end);
  }
  if (start < range.end)
    results.push({ start, end: range.end });
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
  for (let i = low;i < sorted.length; i++) {
    const item = sorted[i];
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
function goExported(tree, index, name, inFunction) {
  if (!/^\p{Lu}/u.test(name))
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
      const body = bodyId === undefined ? undefined : nodes[bodyId];
      if (body)
        nestedCallContent.push(body);
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
      const nameIds = syntaxFields(tree, index, "name").flatMap((name) => bindingNodes(tree, name));
      for (const id of nameIds) {
        if (syntaxText(nodes[id], text) !== "_") {
          add(id, "declaration", node.kind);
          const name = syntaxText(nodes[id], text);
          if (language === "go" ? goExported(tree, index, name, inFunction) : directlyExported(tree, index)) {
            add(id, "export", language === "go" ? "exported-identifier" : "exported-declaration");
          }
        }
      }
      const valueId = syntaxField(tree, index, "value");
      const value = valueId === undefined ? undefined : nodes[valueId];
      const variableHasOwnImplementation = value && IMPLEMENTATIONS.has(value.kind);
      if (isStructure || isVariable && !inFunction && !variableHasOwnImplementation || isField) {
        const name = attachedName(tree, index, text);
        const bodyId = syntaxField(tree, index, "body");
        const body = bodyId === undefined ? undefined : nodes[bodyId];
        const hasBody = isImplementation && body !== undefined;
        const symbol = {
          name,
          kind: node.kind,
          start: node.start,
          end: node.end,
          hasBody,
          exported: language === "go" ? goExported(tree, index, name, inFunction) : directlyExported(tree, index),
          node: index,
          ...outerScope ? { scope: outerScope } : {},
          ...hasBody && body ? { bodyStart: body.start, bodyEnd: body.end } : {}
        };
        symbols.push(symbol);
        if (isImplementation || CONTAINERS.has(node.kind))
          scopes[index] = name;
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
function classifySyntaxRange(analysis, start, end) {
  if (analysis.status !== "ok" || start < 0 || end < start)
    return [];
  return analysis.roles.filter((role) => role.start <= start && end <= role.end && start < role.end);
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
  const args = process.versions.bun ? [`--config=${config}`, "--no-env-file", "--no-macros", "--no-install", worker] : [worker];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const controller = new AbortController;
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
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
      args,
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
    signal?.removeEventListener("abort", abort);
  }
}

// src/impact-bindings.ts
async function bindImpactCandidates(target, files, occurrences, access) {
  const syntax = await access.syntax(target.document);
  const name = syntax.nodes.find((node) => node.start >= target.symbol.start && node.end <= target.symbol.end && target.document.text.slice(node.start, node.end) === target.symbol.name && node.kind.endsWith("identifier"));
  if (!name)
    throw new SignalGrepError("Impact compiler target has no exact identifier position");
  const documents = new Map(files.filter((file) => file.document.utf8 && ["javascript", "typescript", "tsx"].includes(syntaxLanguage(file.document.path) ?? "")).map((file) => [resolve6(access.cwd, file.document.path), file.document]));
  documents.set(resolve6(access.cwd, target.document.path), target.document);
  const sourceAt = await semanticSources(access.cwd, documents.values());
  const references = await withTypeScript(access.cwd, [...documents.values()], async (channel) => locations(await channel.request("textDocument/references", {
    textDocument: { uri: await semanticUri(access.cwd, target.document.path) },
    position: lspPosition(target.document, name.start),
    context: { includeDeclaration: true }
  })), access.signal);
  const retained = new Map(occurrences.map((item) => [
    `${resolve6(access.cwd, item.path)}:${String(item.range?.start)}:${String(item.range?.end)}`,
    item
  ]));
  let bound = 0;
  for (const reference of references) {
    const document = await sourceAt(reference.path);
    if (!document)
      continue;
    const range = byteRange(document, reference.range);
    const key = `${resolve6(access.cwd, document.path)}:${String(range.start)}:${String(range.end)}`;
    const existing = retained.get(key);
    const line = document.lineAt(range.start);
    const evidence = sourceEvidence(document, range);
    const item = existing ?? {
      path: document.path,
      line,
      source: document.reference,
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
  for (const document of documents.values()) {
    await access.refresh(document.path, document.reference);
  }
  return { items: [...retained.values()], bound };
}

// src/concept-search.ts
import { dirname as dirname4 } from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";

// src/concept-model.ts
var CONCEPT_MODEL = "Xenova/multilingual-e5-small";
var CONCEPT_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
var MAX_CONCEPT_CHUNKS = 128;
var MAX_CONCEPT_CHARS = 1000;
var CONCEPT_TIMEOUT_MS = 90000;

// src/request.ts
function list(value) {
  if (value === undefined)
    return [];
  return (Array.isArray(value) ? value : [value]).filter((item) => item.length > 0);
}
function boundedInteger(value, fallback, minimum, maximum, field) {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new SignalGrepError(`${field} must be an integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return candidate;
}
function normalizeRequest(input) {
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
    ...input.scope !== undefined ? { scope: input.scope } : {},
    ...input.wholeWord !== undefined ? { wholeWord: input.wholeWord } : {}
  };
}

// src/source-access.ts
import { extname as extname2, resolve as resolve11 } from "node:path";

// src/historical-paths.ts
import { lstat, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as dirname3, join as join3, parse, relative as relative4, resolve as resolve8 } from "node:path";

// src/workspace-files.ts
import { relative as relative3, resolve as resolve7, sep as sep2 } from "node:path";
class EnumerationLimit extends Error {
}
function workspaceRelativePath(cwd, path, policy = new SearchPathPolicy(cwd)) {
  const absolute = resolve7(cwd, path);
  policy.assertPath(absolute);
  const local = relative3(resolve7(cwd), absolute);
  if (local.split(sep2).some((part) => part.toLowerCase() === ".git"))
    throw new SignalGrepError("Git internals are excluded from source candidates");
  return isPathInsideCwd(absolute, cwd) ? local.split(sep2).join("/") : absolute.replaceAll("\\", "/");
}
async function listWorkspaceFiles(cwd, signal, options = {}) {
  const absolutePath = resolve7(cwd, options.path ?? ".");
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
      executable: "rg",
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
    if (result.code !== 0 && result.code !== 1)
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
  for (const path of [cwd, ...paths.map((sourcePath) => dirname3(resolve8(cwd, sourcePath)))]) {
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
  if (!isPathInsideCwd(resolve8(cwd, request.path ?? "."), cwd)) {
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
  const absoluteCwd = resolve8(cwd);
  const volumeRoot = parse(absoluteCwd).root;
  const ignoreFiles = [];
  let ignoreBytesRead = 0;
  try {
    for (const directory of relevantDirectories(absoluteCwd, bounded)) {
      if (isPathInsideCwd(directory, absoluteCwd))
        await assertExistingPathInsideCwd(directory, absoluteCwd);
      for (const name of [".ignore", ".rgignore"]) {
        if (signal?.aborted)
          throw abortError();
        const path = join3(directory, name);
        let discovered = false;
        try {
          const before = await lstat(path);
          discovered = true;
          if (!before.isFile())
            throw new SignalGrepError("Current ignore rules are not regular files; historical path filtering is unavailable");
          if (before.size > MAX_SOURCE_FILE_BYTES || ignoreBytesRead + before.size > MAX_STRUCTURE_BYTES)
            throw new SignalGrepError("Current ignore rules exceed the source read budget");
          const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
          let bytes;
          try {
            if (!sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat())))
              throw new SignalGrepError("Current ignore rules changed before reading");
            const buffer = Buffer.alloc(before.size + 1);
            let used = 0;
            while (used < buffer.length) {
              if (signal?.aborted)
                throw abortError();
              const chunk = await handle.read(buffer, used, Math.min(64 * 1024, buffer.length - used), null);
              if (chunk.bytesRead === 0)
                break;
              used += chunk.bytesRead;
            }
            bytes = buffer.subarray(0, used);
            const after = await lstat(path);
            if (used !== before.size || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after)) || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat())))
              throw new SignalGrepError("Current ignore rules changed during historical path filtering");
          } finally {
            await handle.close();
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
        const placeholder = resolve8(target, safe);
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
import { setImmediate } from "node:timers/promises";
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
  for (let start = 0;start < content.length; ) {
    if (budget.tick())
      await setImmediate();
    const newline = content.indexOf(10, start);
    const end = newline === -1 ? content.length : newline + 1;
    lines.push(content.toString("latin1", start, end));
    start = end;
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
import { createHash } from "node:crypto";
import { constants as constants2 } from "node:fs";
import { lstat as lstat2, open as open2 } from "node:fs/promises";
import { isAbsolute as isAbsolute4, relative as relative5, resolve as resolve9, sep as sep3 } from "node:path";

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
async function runGitRead(cwd, command, args, options = {}) {
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
      ...args
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
    const current = await lstat2(resolve9(cwd, path));
    await assertExistingPathInsideCwd(resolve9(cwd, path), cwd);
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
  const absolute = resolve9(cwd, path);
  const local = relative5(resolve9(cwd), absolute).split(sep3).join("/");
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
  if (!isAbsolute4(root))
    throw new SignalGrepError("Git returned an invalid repository root");
  return resolve9(root);
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
  for (let start = 0;start < paths.length; start += 128) {
    const batch = paths.slice(start, start + 128);
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
  const absolute = resolve9(cwd, path);
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
    const handle = await open2(absolute, constants2.O_RDONLY | (constants2.O_NOFOLLOW ?? 0));
    try {
      if (!sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat())))
        throw new SignalGrepError("Working source changed before reading");
      const buffer = Buffer.alloc(before.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        if (signal?.aborted)
          throw abortError();
        const { bytesRead } = await handle.read(buffer, bytes, Math.min(64 * 1024, buffer.length - bytes), null);
        if (bytesRead === 0)
          break;
        bytes += bytesRead;
      }
      budget.bytes += bytes;
      const after = await lstat2(absolute);
      await assertExistingPathInsideCwd(absolute, cwd);
      if (bytes !== before.size || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(after)) || !sameSourceRevision(sourceRevisionFromStats(before), sourceRevisionFromStats(await handle.stat()))) {
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
      await handle.close();
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
import { setImmediate as setImmediate2 } from "node:timers/promises";
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
import { isUtf8 } from "node:buffer";
import { createHash as createHash2 } from "node:crypto";
import { open as open3, realpath as realpath4 } from "node:fs/promises";
import { relative as relative6, resolve as resolve10 } from "node:path";
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
      const start = this.lineStarts[middle];
      if (start === undefined)
        throw new Error("Missing source line");
      if (start <= byte)
        low = middle;
      else
        high = middle;
    }
    return low + 1;
  }
  positionAt(byte) {
    const line = this.lineAt(byte);
    const start = this.lineStarts[line - 1];
    if (start === undefined)
      throw new Error("Missing source line");
    return {
      line,
      column: this.toCharacterOffset(byte) - this.toCharacterOffset(start) + 1
    };
  }
  lineRange(startLine, endLine = startLine) {
    if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || startLine > this.lineStarts.length) {
      throw new SignalGrepError("Source line range is outside the document");
    }
    const start = this.lineStarts[startLine - 1];
    if (start === undefined)
      throw new Error("Missing source line");
    return { start, end: this.lineStarts[endLine] ?? this.bytes.length };
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
  const absolute = resolve10(cwd, path);
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
  const handle = await open3(canonical, "r");
  let bytes;
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw new SourceDocumentError("source-unavailable", "Source must be a regular file");
    }
    if (!sameSourceRevision(before, sourceRevisionFromStats(metadata))) {
      throw new SourceDocumentError("source-changed", "Source was replaced before reading");
    }
    const buffer = Buffer.alloc(before.size);
    let used = 0;
    while (used < buffer.length) {
      if (signal?.aborted)
        throw abortError();
      const read = await handle.read(buffer, used, buffer.length - used, used);
      if (read.bytesRead === 0)
        break;
      used += read.bytesRead;
    }
    if (used !== before.size) {
      throw new SourceDocumentError("source-changed", "Source changed during reading");
    }
    bytes = buffer.subarray(0, used);
  } finally {
    await handle.close();
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
  async parse(document, signal) {
    return (await this.parseWithMetrics(document, signal)).analysis;
  }
  async parseWithMetrics(document, signal, pattern) {
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
      if (!document.utf8)
        throw new SourceDocumentError("encoding", "Syntax requires lossless UTF-8 source");
      const origin = document.reference.origin;
      const revision = origin.kind === "worktree" ? origin.contentHash : origin.blob;
      const key = `${extname2(document.path).toLowerCase()}\x00${revision}\x00${pattern ?? ""}`;
      const cached = this.#cache.get(key);
      if (cached) {
        this.#cache.delete(key);
        this.#cache.set(key, cached);
        return { analysis: cached.analysis, cacheHit: true };
      }
      const analysis = await parseSyntax(document.path, document.text, combined, pattern);
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
  async load(path, expected) {
    if (this.signal?.aborted)
      throw abortError();
    if (expected && resolve11(this.cwd, expected.path) !== resolve11(this.cwd, path)) {
      throw new SignalGrepError("Source reference path does not match the requested file");
    }
    const key = JSON.stringify([resolve11(this.cwd, path), expected?.origin]);
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
    let document;
    const remaining = MAX_STRUCTURE_BYTES - this.#bytes;
    if (remaining <= 0)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    if (expected?.origin.kind !== "git") {
      const metadata = await getSourceRevision(resolve11(this.cwd, path));
      if (metadata && metadata.size > remaining)
        throw new SourceBudgetError("Next source exceeds the remaining 32 MiB structural read budget");
    }
    if (expected?.origin.kind === "git") {
      const origin = expected.origin;
      const raw = await readGitSource(this.cwd, { path, commit: origin.commit, blob: origin.blob }, this.signal, { maxBytes: remaining });
      if (!raw.content || !raw.origin) {
        throw new SourceDocumentError("source-unavailable", raw.reason ?? `Git source is ${raw.sourceStatus}`);
      }
      document = new SourceDocument({ path, origin: raw.origin }, raw.content);
    } else {
      document = await readWorkspaceDocument(path, this.cwd, this.signal, expected?.origin, remaining);
    }
    this.#bytes += document.bytes.length;
    if (this.#bytes > MAX_STRUCTURE_BYTES)
      throw new SourceBudgetError("Structural scan reached the 32 MiB read limit");
    return document;
  }
  syntax(document) {
    let pending = this.#syntax.get(document);
    if (!pending) {
      pending = this.#queue.parseWithMetrics(document, this.signal).then((parsed) => {
        if (parsed.cacheHit)
          this.#syntaxCacheHits += 1;
        else
          this.#syntaxParses += 1;
        return parsed.analysis;
      });
      this.#syntax.set(document, pending);
    }
    return pending;
  }
  async pattern(document, pattern) {
    return (await this.#queue.parseWithMetrics(document, this.signal, pattern)).analysis;
  }
  releaseSyntax(document) {
    this.#syntax.delete(document);
  }
  refresh(path, expected) {
    return this.#read(path, expected);
  }
}

// src/concept-search.ts
var inferenceQueue = new OwnedTaskQueue;
function passage(document, start) {
  let end = Math.min(document.text.length, start + MAX_CONCEPT_CHARS);
  if (end < document.text.length) {
    const newline = document.text.lastIndexOf(`
`, end);
    if (newline > start + MAX_CONCEPT_CHARS / 2)
      end = newline + 1;
    const code = document.text.charCodeAt(end);
    if (code >= 56320 && code <= 57343)
      end -= 1;
  }
  const range = { start: document.toByteOffset(start), end: document.toByteOffset(end) };
  return {
    value: {
      document,
      range,
      text: `${document.path.slice(0, 200)}
${document.text.slice(start, end)}`
    },
    next: end
  };
}
async function similarities(query, passages, parent) {
  const worker = fileURLToPath3(new URL("./concept-worker.mjs", import.meta.url));
  const config = fileURLToPath3(new URL("./syntax-worker.toml", import.meta.url));
  const controller = new AbortController;
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), CONCEPT_TIMEOUT_MS);
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
      signal,
      input: Buffer.from(JSON.stringify({ query, passages: passages.map((item) => item.text) }))
    }, async (stdout) => {
      for await (const chunk of stdout) {
        bytes += chunk.byteLength;
        if (bytes > 32768)
          throw new SignalGrepError("Concept worker exceeded its 32 KiB response budget");
        buffers.push(Buffer.from(chunk));
      }
    });
    if (processResult.code !== 0)
      throw new SignalGrepError(`Local concept inference failed (${String(processResult.code)}): ${processResult.stderr.trim()}`);
    const value = JSON.parse(Buffer.concat(buffers).toString("utf8"));
    if (!rpcRecord(value) || !Array.isArray(value.scores) || value.scores.length !== passages.length || value.scores.some((score) => typeof score !== "number" || !Number.isFinite(score)) || !Array.isArray(value.truncated) || value.truncated.some((index) => typeof index !== "number" || !Number.isSafeInteger(index) || index < -1 || index >= passages.length) || typeof value.peakRssBytes !== "number" || !Number.isFinite(value.peakRssBytes) || value.peakRssBytes < 0)
      throw new SignalGrepError("Invalid concept inference response");
    return {
      scores: value.scores.filter((score) => typeof score === "number"),
      truncated: value.truncated.filter((index) => typeof index === "number"),
      peakRssBytes: value.peakRssBytes
    };
  } catch (error) {
    if (parent?.aborted)
      throw abortError();
    if (controller.signal.aborted)
      throw new SignalGrepError(`Concept inference exceeded the ${String(CONCEPT_TIMEOUT_MS)} ms deadline`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function runConceptSearch(input, access) {
  const query = input.query;
  if (!query?.trim() || query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError("Concept query requires nonempty, single-line well-formed text of at most 256 characters");
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
  for (const path of files.paths) {
    try {
      const document = await access.load(path);
      if (!document.utf8)
        throw new SourceDocumentError("encoding", "Not lossless UTF-8");
      if (document.text.trim())
        documents.push({ document, next: 0 });
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
  const passages = [];
  while (passages.length < MAX_CONCEPT_CHUNKS && documents.some((item) => item.next < item.document.text.length)) {
    for (const item of documents) {
      if (passages.length >= MAX_CONCEPT_CHUNKS)
        break;
      if (item.next >= item.document.text.length)
        continue;
      const chunk = passage(item.document, item.next);
      passages.push(chunk.value);
      item.next = chunk.next;
    }
  }
  if (documents.some((item) => item.next < item.document.text.length)) {
    result.partial = true;
    result.reasons.push(`Concept coverage reached ${String(MAX_CONCEPT_CHUNKS)} passages of at most ${String(MAX_CONCEPT_CHARS)} characters; narrow path/glob to cover remaining source`);
  }
  if (passages.length) {
    const inferred = await similarities(query, passages, access.signal);
    if (inferred.truncated.length) {
      result.partial = true;
      result.reasons.push(`Model token limit: ${String(inferred.truncated.length)} query/passages exceeded 512 tokens; ranking used their prefixes`);
    }
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
          tokenTruncated: inferred.truncated.includes(index),
          excerptRange: evidence.excerptRange,
          excerptTruncated: evidence.excerptTruncated
        }
      };
    }).toSorted((a, b) => b.details.score - a.details.score || a.path.localeCompare(b.path) || a.line - b.line);
    result.stats = {
      inferencePeakRssBytes: inferred.peakRssBytes,
      passagesRanked: passages.length
    };
  }
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.stats = {
    ...result.stats,
    elapsedMs: Math.round(performance.now() - started),
    filesEnumerated: files.paths.length
  };
  result.coverage = {
    conceptCandidates: result.partial ? "partial" : "complete",
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
  return inferenceQueue.run(() => runConceptSearch(input, access), access.signal);
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
      const document = await access.load(path);
      const syntax = await access.pattern(document, input.pattern);
      if (syntax.status !== "ok") {
        result.partial = true;
        result.reasons.push(`${path}: syntax ${syntax.status}; structural matches withheld`);
        continue;
      }
      for (const match of syntax.patternMatches ?? []) {
        const range = {
          start: document.toByteOffset(match.start),
          end: document.toByteOffset(match.end)
        };
        const evidence = rangeEvidence(document, range);
        const item = {
          path: document.path,
          line: document.lineAt(range.start),
          source: document.reference,
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
import { resolve as resolve13 } from "node:path";

// src/semantic-project.ts
import { resolve as resolve12 } from "node:path";
async function semanticProject(access, targetPath) {
  const files = await listWorkspaceFiles(access.cwd, access.signal);
  const paths = files.paths.filter((path) => {
    const language = syntaxLanguage(path);
    return language && language !== "go";
  });
  const target = resolve12(access.cwd, targetPath);
  if (!paths.some((path) => resolve12(access.cwd, path) === target))
    throw new SignalGrepError("Semantic target must be an admitted JS/TS workspace file under current ignore rules");
  paths.sort((a, b) => Number(resolve12(access.cwd, b) === target) - Number(resolve12(access.cwd, a) === target) || a.localeCompare(b));
  const documents = new Map;
  const reasons = [...files.reasons];
  const metadata = [];
  for (const path of [
    ...paths,
    ...files.paths.filter((candidate) => /(?:^|\/)(?:[tj]sconfig[^/]*\.json|package\.json)$/.test(candidate))
  ]) {
    try {
      const document = await access.load(path);
      if (!document.utf8)
        throw new SourceDocumentError("encoding", `Non-UTF-8 semantic source: ${path}`);
      if (paths.includes(path))
        documents.set(resolve12(access.cwd, path), document);
      else
        metadata.push(document);
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
    for (const document of [...documents.values(), ...metadata]) {
      if (document.reference.origin.kind !== "worktree")
        throw new Error("Expected worktree semantic source");
      await access.refresh(document.path, document.reference);
    }
    const after = await listWorkspaceFiles(access.cwd, access.signal);
    if (JSON.stringify(after) !== JSON.stringify(files))
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
  return { documents, primary, result, recheck };
}

// src/semantic-navigation.ts
var semanticRequestQueue = new OwnedTaskQueue;
async function selection(input, access, document) {
  if (input.column !== undefined) {
    if (input.line === undefined || !Number.isSafeInteger(input.column) || input.column < 1 || input.symbol !== undefined)
      throw new SignalGrepError("Semantic column requires line and no symbol; both are 1-based UTF-16 positions");
    const position = { line: input.line - 1, character: input.column - 1 };
    byteAt(document, position);
    return position;
  }
  const syntax = await access.syntax(document);
  if (syntax.status !== "ok")
    throw new SignalGrepError("Selecting a semantic symbol requires valid syntax; supply an exact line+column position");
  const candidates = syntax.nodes.filter((node) => /^(?:identifier|property_identifier|type_identifier|shorthand_property_identifier(?:_pattern)?)$/.test(node.kind) && (input.symbol === undefined || document.text.slice(node.start, node.end) === input.symbol) && (input.line === undefined || document.lineAt(document.toByteOffset(node.start)) === input.line));
  if (input.line === undefined && input.symbol === undefined)
    throw new SignalGrepError("Semantic navigation requires path and line+column, or an unambiguous symbol");
  if (candidates.length !== 1)
    throw new SignalGrepError(`Semantic target is ${candidates.length ? "ambiguous" : "absent"}; supply an exact 1-based line and UTF-16 column`);
  const candidate = candidates[0];
  if (!candidate)
    throw new Error("Missing semantic candidate");
  return lspPosition(document, candidate.start);
}
function itemFor(document, location, relation) {
  const range = byteRange(document, location.range);
  const line = document.lineAt(range.start);
  const evidence = sourceEvidence(document, range);
  return {
    path: document.path,
    line,
    range,
    source: document.reference,
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
        path: document.path,
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
  const { result, documents, primary } = project;
  result.kind = input.mode;
  result.redact = input.redact ?? false;
  const mode = input.mode;
  const graph = mode === "dependencies" || mode === "dependents";
  if (graph && (input.line !== undefined || input.column !== undefined || input.symbol !== undefined))
    throw new SignalGrepError("File dependencies/dependents accept path without line, column or symbol");
  const position = graph ? undefined : await selection(input, access, primary);
  const sourceAt = await semanticSources(access.cwd, documents.values());
  const add = async (location, relation) => {
    const document = await sourceAt(location.path);
    if (document)
      result.items.push(itemFor(document, location, relation));
    else {
      result.partial = true;
      result.reasons.push("Compiler returned a location outside admitted source coverage; dependency/ignored/over-budget source was not exposed");
    }
  };
  await withTypeScript(access.cwd, [...documents.values()], async (channel) => {
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
    for (const document of mode === "dependencies" ? [primary] : documents.values()) {
      const syntax = await access.syntax(document);
      if (syntax.status !== "ok") {
        result.partial = true;
        result.reasons.push(`${document.path}: module syntax ${syntax.status}`);
        continue;
      }
      const uri = await semanticUri(access.cwd, document.path);
      const specifiers = syntax.nodes.filter((node) => node.kind === "string" && node.parent !== null && (() => {
        const parent = syntax.nodes[node.parent];
        if (!parent)
          return false;
        if (parent.kind === "import_statement" || parent.kind === "export_statement")
          return true;
        if (parent.kind !== "arguments" || parent.parent === null)
          return false;
        const call = syntax.nodes[parent.parent];
        return call?.kind === "call_expression" && /^(?:import|require)\s*\(/.test(document.text.slice(call.start, node.start));
      })());
      for (const specifier of specifiers) {
        const resolved = locations(await channel.request("textDocument/definition", {
          textDocument: { uri },
          position: lspPosition(document, specifier.start + 1)
        }));
        if (!resolved.length) {
          result.partial = true;
          result.reasons.push(`${document.path}: unresolved module ${document.text.slice(specifier.start, specifier.end)}`);
        }
        for (const target of resolved) {
          const targetDocument = await sourceAt(target.path);
          if (mode === "dependencies") {
            await add(target, "dependency");
          } else if (targetDocument === primary) {
            await add({
              path: resolve13(access.cwd, document.path),
              range: {
                start: lspPosition(document, specifier.start),
                end: lspPosition(document, specifier.end)
              }
            }, "dependent");
          }
        }
      }
      access.releaseSyntax(document);
    }
  }, access.signal);
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
import { dirname as dirname5, resolve as resolve17 } from "node:path";

// src/analysis-store.ts
import { randomUUID } from "node:crypto";

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
    return `${id}.analysis.0`;
  }
  resolve(cursor) {
    this.#expire();
    const match = /^([a-f0-9-]+)\.(analysis|analysis-terms)\.([0-9a-z]+)$/.exec(cursor);
    if (!match)
      throw new CursorError("Invalid analysis cursor");
    const id = match[1];
    const kind = match[2];
    const rawOffset = match[3];
    if (kind !== "analysis" && kind !== "analysis-terms")
      throw new CursorError("Invalid analysis cursor");
    if (!id || !rawOffset)
      throw new CursorError("Invalid analysis cursor");
    const offset = Number.parseInt(rawOffset, 36);
    const stored = this.#items.get(id);
    if (!stored)
      throw new CursorError(this.#expired.has(id) ? "Analysis cursor expired or was evicted; run the query again" : "Analysis cursor was not found; run the query again", this.#expired.has(id) ? "E_CURSOR_EXPIRED" : "E_CURSOR_NOT_FOUND");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset.toString(36) !== rawOffset || (kind === "analysis" ? offset > stored.result.items.length : offset >= (stored.result.termCounts?.length ?? 0)))
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
    const pagedTerms = result.termCounts && Buffer.byteLength(JSON.stringify(result.termCounts)) > MAX_INLINE_TERM_COUNT_BYTES;
    const inlineTerms = pagedTerms ? undefined : result.termCounts;
    const termsRequest = pagedTerms ? termCountRequest(stored.id, 0, result.redact) : undefined;
    const items = [];
    const scope = result.scope ? ` Scope: ${result.scope.assertion === "project-wide" ? "project root" : "requested path"} ${JSON.stringify(result.scope.path)}${result.scope.expandedToProjectRoot ? `, expanded after ${JSON.stringify(result.scope.requestedPath)} had no matches` : ""}.` : "";
    const coverage = result.coverage ? ` Coverage: ${JSON.stringify(result.coverage)}.` : "";
    const stats = result.stats ? ` Stats: ${JSON.stringify(result.stats)}.` : "";
    const header = `${result.kind}: ${result.items.length} retained ${result.unit} (${result.partial ? "PARTIAL" : "complete"}). ${result.counts ? `Counts: ${JSON.stringify(result.counts)}. ` : ""}${inlineTerms ? `Term counts: ${JSON.stringify(inlineTerms)}. ` : ""}${termsRequest ? `Term counts are paginated: ${JSON.stringify(termsRequest)}. ` : ""}Counts use ${result.unit}; they are not ordinary matching-line counts.${scope}${coverage}${stats}`;
    const notice = result.reasons.length ? `
${result.reasons.map((reason) => `[${reason}]`).join(`
`)}` : "";
    const rows = [];
    let bytes = Buffer.byteLength(header + notice) + 1200;
    let next = offset;
    for (let index = offset;index < result.items.length && items.length < 30; index += 1) {
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
${item.excerpt}` : ""}${item.details ? `
Evidence: ${JSON.stringify(item.details)}` : ""}${inspect ? `
Inspect: ${JSON.stringify(inspect)}` : ""}`;
      const rowBytes = Buffer.byteLength(row) + 2;
      if (bytes + rowBytes > MAX_RESULT_BYTES) {
        if (items.length === 0)
          throw new SignalGrepError("Analysis item exceeds the response limit; narrow its source");
        break;
      }
      rows.push(row);
      bytes += rowBytes;
      next = index + 1;
      items.push({ ...item, index: index + 1, ...inspect ? { inspect } : {} });
    }
    const nextRequest = next < result.items.length ? {
      cursor: `${stored.id}.analysis.${next.toString(36)}`,
      ...result.redact ? { redact: true } : {}
    } : undefined;
    const text = [
      header + notice,
      ...rows,
      ...nextRequest ? [`Next request: ${JSON.stringify(nextRequest)}`] : []
    ].join(`

`);
    if (Buffer.byteLength(text) > MAX_RESULT_BYTES)
      throw new SignalGrepError("Analysis metadata exceeds the output limit");
    return {
      text,
      details: {
        version: 1,
        mode: isSemanticMode(result.kind) || result.kind === "concept" || result.kind === "structure" || result.kind === "files" || result.kind === "outline" || result.kind === "imports" || result.kind === "tests" || result.kind === "impact" ? result.kind : "matches",
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
          ...result.stats ? { stats: result.stats } : {}
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
import { resolve as resolve14 } from "node:path";
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
  const absolutePath = retainedMatch?.absolutePath ?? resolve14(cwd, path);
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
import { resolve as resolve15 } from "node:path";
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
function occurrenceInsideRanges(range, allowed, document) {
  return allowed.some((outer) => range.start >= outer.start && range.end <= outer.end && (range.end > range.start || range.start < outer.end || outer.end === document.bytes.length && document.bytes.at(-1) !== 10));
}
async function searchRawSource(cwd, document, request, budget, allowed, signal) {
  const occurrences = [];
  try {
    const result = await runOwnedProcess({
      executable: "rg",
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
      input: document.bytes,
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
      const start = data.absolute_offset;
      const bytes = eventBytes(data.lines);
      if (document.lineStarts[data.line_number - 1] !== start || start + bytes.length > document.bytes.length || !document.bytes.subarray(start, start + bytes.length).equals(bytes))
        throw new SignalGrepError("Raw ripgrep evidence does not match its source version and line offset");
      for (const submatch of data.submatches) {
        if (!record(submatch) || !integer(submatch.start) || !integer(submatch.end) || submatch.end < submatch.start || submatch.end > bytes.length || !bytes.subarray(submatch.start, submatch.end).equals(eventBytes(submatch.match)))
          throw new SignalGrepError("Invalid raw ripgrep occurrence bounds or bytes");
        const range = { start: start + submatch.start, end: start + submatch.end };
        if (allowed && !occurrenceInsideRanges(range, allowed, document))
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
  if (!scan.snapshotComplete)
    reasons.add("Search retention is partial; only retained matching files can be analyzed");
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
    let document;
    try {
      document = await options.access.load(absolute);
    } catch (error) {
      if (error instanceof SourceDocumentError || error instanceof SourceBudgetError) {
        reasons.add(error.message);
        continue;
      }
      throw error;
    }
    bytesRead += document.bytes.length;
    if (document.reference.origin.kind !== "worktree" || !sameSourceRevision(revision, document.reference.origin.revision)) {
      reasons.add(`Source changed since search: ${document.path}`);
      continue;
    }
    if (document.bytes[0] === 255 && document.bytes[1] === 254 || document.bytes[0] === 254 && document.bytes[1] === 255) {
      reasons.add(`Transcoded search offsets cannot be bound to raw UTF-16 source: ${document.path}`);
      continue;
    }
    const utf8Bom = document.bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]));
    const occurrences = [];
    for (const match of matches) {
      const lineStart = document.lineStarts[match.lineNumber - 1];
      if (lineStart === undefined)
        throw new SignalGrepError("Retained match line is outside its verified source");
      const base = lineStart + (utf8Bom && match.lineNumber === 1 ? 3 : 0);
      const lineEnd = document.lineStarts[match.lineNumber] ?? document.bytes.length;
      if (match.occurrences.length === 0)
        reasons.add("Some retained matches have no exact occurrence ranges");
      for (const occurrence of match.occurrences) {
        const range = { start: base + occurrence.byteStart, end: base + occurrence.byteEnd };
        document.checkRange(range);
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
      files.push({ document, occurrences });
  }
  return { files, partial: reasons.size > 0, reasons: [...reasons], filesRead, bytesRead };
}
async function collectEvidenceCandidates(options) {
  if (!options.changes)
    return ordinaryCandidates(options);
  if (options.request.path && !isPathInsideCwd(resolve15(options.cwd, options.request.path), options.cwd)) {
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
    const document = new SourceDocument({ path: file.path, origin: file.origin }, file.content);
    const changedRanges = file.changedRanges.map((range) => document.lineRange(range.startLine, range.endLine));
    if (options.changes.scope === "lines" && changedRanges.length === 0)
      continue;
    const matched = await searchRawSource(options.cwd, document, options.request, budget, options.changes.scope === "lines" ? changedRanges : undefined, options.signal);
    if (matched.reason)
      reasons.add(matched.reason);
    if (matched.occurrences.length > 0)
      files.push({
        document,
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
import { posix } from "node:path";
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
  const body = raw.slice(1, -1);
  let result = "";
  for (let index = 0;index < body.length; index++) {
    const character = body[index];
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = body[++index];
    if (escaped === undefined)
      return;
    if (escaped === `
`)
      continue;
    if (escaped === "\r") {
      if (body[index + 1] === `
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
      if (escaped === "0" && /[0-9]/.test(body[index + 1] ?? ""))
        return;
      result += simple[escaped];
      continue;
    }
    if (escaped === "x" || escaped === "u") {
      const brace = escaped === "u" && body[index + 1] === "{";
      const end = brace ? body.indexOf("}", index + 2) : index + (escaped === "x" ? 2 : 4) + 1;
      if (end < 0)
        return;
      const digits = body.slice(index + (brace ? 2 : 1), end);
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
      const name = nodeText(facts, id);
      if (name)
        names.push(name);
    } else
      pending.push(...facts.syntax.children[id] ?? []);
  }
  return names;
}
function collectModuleFacts(document, syntax) {
  const facts = {
    document,
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
    for (const name of declaredNames(facts, binding)) {
      const existing = facts.declarations.get(name) ?? [];
      if (!existing.includes(id))
        existing.push(id);
      facts.declarations.set(name, existing);
    }
  }
  for (const [name, declarations] of facts.declarations) {
    const implementations = declarations.filter((id) => ["function_declaration", "generator_function_declaration"].includes(syntax.nodes[id]?.kind ?? ""));
    if (implementations.length === 1 && declarations.every((id) => id === implementations[0] || syntax.nodes[id]?.kind === "function_signature"))
      facts.declarations.set(name, implementations);
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
        const name = nodeText(facts, syntaxField(syntax, specifier, "name"));
        const imported = literalText(name) ?? name;
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
      for (const [name, declarations] of facts.declarations) {
        for (const definition of declarations) {
          const current = syntax.nodes[definition];
          const container = syntax.nodes[declaration];
          if (current && container && current.start >= container.start && current.end <= container.end)
            facts.exports.push({
              statement,
              node: definition,
              exported: name,
              local: name,
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
      const name = (syntax.children[namespace] ?? []).find((child) => syntax.nodes[child]?.kind === "identifier");
      facts.exports.push({
        statement,
        node: namespace,
        exported: nodeText(facts, name) ?? "*",
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
        let retained2 = false;
        try {
          cached.syntax = await this.host.syntax(cached.document);
          if (cached.syntax.status !== "ok")
            throw new NavigationFailure(`syntax-${cached.syntax.status}`);
          retained2 = true;
        } finally {
          if (!retained2)
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
    const document = await this.host.load(path);
    this.documents.set(path, document);
    let facts;
    let retained = false;
    try {
      if (document.reference.origin.kind !== "worktree")
        throw new NavigationFailure("historical-navigation-unsupported");
      if (!document.utf8)
        throw new NavigationFailure("encoding");
      if (this.bytesRead + document.bytes.length > MAX_STRUCTURE_BYTES)
        throw new NavigationFailure("byte-budget-exhausted");
      this.bytesRead += document.bytes.length;
      const syntax = await this.host.syntax(document);
      if (syntax.language === "go" || syntax.status !== "ok") {
        const reason = syntax.language === "go" ? "language-unsupported" : `syntax-${syntax.status}`;
        this.#failures.set(path, reason);
        throw new NavigationFailure(reason);
      }
      facts = collectModuleFacts(document, syntax);
      this.modules.set(path, facts);
      retained = retainSyntax;
      return facts;
    } finally {
      if (!retained) {
        if (facts)
          this.release(facts);
        else
          this.host.releaseSyntax?.(document);
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
    for (const [path, document] of this.documents) {
      this.checkAbort();
      if (exhausted) {
        invalid.set(path, "structural-read-budget-exhausted");
        continue;
      }
      try {
        await this.host.load(path, document.reference);
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
import { posix as posix2 } from "node:path";
var EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
var STATIC_MODULE_RESOLUTION = "Exact relative path; extensionless source and index candidates (.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs); .js→.ts/.tsx, .jsx→.tsx, .mjs→.mts, .cjs→.cts source candidates. Every existing candidate is considered; multiple candidates are ambiguous. No configuration is executed.";
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
function declaration(facts, node, name) {
  return {
    source: facts.document.reference,
    line: nodeLine(facts, node),
    range: moduleRange(facts, node),
    name,
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
  const visit = (facts, name) => {
    const key = JSON.stringify([facts.document.path, name]);
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
  const followLocal = async (facts, name) => {
    const imported = facts.imports.filter((current) => current.local === name);
    const declared = facts.declarations.get(name) ?? [];
    if (imported.length + declared.length > 1)
      return unresolved("ambiguous-local-binding");
    if (imported[0])
      return followImport(facts, imported[0]);
    if (declared[0] !== undefined)
      return { status: "resolved", chain, destination: declaration(facts, declared[0], name) };
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
  const followExportName = async (facts, name) => {
    visit(facts, name);
    const exported = facts.exports.filter((current) => current.exported === name && current.kind !== "star");
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
  return text.length > 500 ? `${text.slice(0, 500)}… [statement excerpt truncated]` : text;
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
    const name = "imported" in binding ? binding.local ?? binding.imported : binding.exported;
    items.push({
      path: facts.document.path,
      line: nodeLine(facts, binding.statement),
      source: facts.document.reference,
      range: moduleRange(facts, binding.statement),
      excerpt: importStatementExcerpt(facts, binding.statement),
      label: `Static import/re-export path: ${name} (${trace.status}${trace.reason ? `: ${trace.reason}` : ""})`,
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
import { posix as posix3 } from "node:path";

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
        const name = nodeText(facts, node) ?? "";
        const values = this.#bindings.get(name) ?? [];
        values.push({ name, node, scope });
        this.#bindings.set(name, values);
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
        const name = syntaxField(facts.syntax, id, "name");
        if (name !== undefined && node.kind !== "method_definition")
          add([name], node.kind.endsWith("declaration") ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "class_declaration" || node.kind === "class") {
        const name = syntaxField(facts.syntax, id, "name");
        if (name !== undefined)
          add([name], node.kind === "class_declaration" ? nearestScope(facts, node.parent) : id);
      }
      if (node.kind === "catch_clause")
        add(patternIdentifiers(facts, syntaxField(facts.syntax, id, "parameter")), id);
    }
  }
  shadowed(name, occurrence) {
    const local = this.#bindings.get(name);
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
    const name = nameKind === "string" || nameKind === "template_string" ? literalText(nodeText(facts, nameNode)) : undefined;
    if (name === undefined)
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
      ...name !== undefined ? { name } : {},
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
  const symbols = facts.syntax.symbols.filter((symbol2) => {
    if (!symbol2.hasBody)
      return false;
    if (input.symbol !== undefined && symbol2.name !== input.symbol)
      return false;
    const start = facts.document.lineAt(facts.document.toByteOffset(symbol2.start));
    const end = facts.document.lineAt(Math.max(facts.document.toByteOffset(symbol2.start), facts.document.toByteOffset(symbol2.end) - 1));
    return input.line === undefined || start <= input.line && input.line <= end;
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
  const start = target.document.toByteOffset(symbol.start);
  const end = target.document.toByteOffset(symbol.end);
  return destination.range.start === start && destination.range.end === end || destination.kind === "variable_declarator" && symbol.directBinding !== undefined && destination.range.start === symbol.directBinding.start && destination.range.end === symbol.directBinding.end;
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
    const name = nodeText(facts, id);
    if (!name || !names.has(name) || !bindings.isReference(id) || bindings.shadowed(name, id))
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
    const text = nodeText(facts, excerptNode) ?? name;
    const evidence = uses.get(test.node) ?? [];
    evidence.push({
      path: facts.document.path,
      line: nodeLine(facts, id),
      range: moduleRange(facts, id),
      binding: name,
      excerpt: text.length > 500 ? `${text.slice(0, 500)}…` : text,
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
function lineBounds(document, symbol) {
  const start = document.lineAt(document.toByteOffset(symbol.start));
  const byteEnd = document.toByteOffset(symbol.end);
  const end = document.lineAt(Math.max(document.toByteOffset(symbol.start), byteEnd - 1));
  return { start, end };
}
function stableName(name) {
  return name !== "default" && !name.startsWith("<anonymous");
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
function selectImpactTarget(document, syntax, input) {
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
    const bounds = lineBounds(document, candidate);
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
    start: document.toByteOffset(selected.start),
    end: document.toByteOffset(selected.end)
  };
  const signatureEnd = selected.bodyStart ?? selected.end;
  const signature = document.text.slice(selected.start, Math.min(signatureEnd, selected.start + 600));
  return {
    document,
    symbol: selected,
    item: {
      path: document.path,
      line: document.lineAt(range.start),
      label: `Impact target: ${selected.scope ? `${selected.scope}.` : ""}${selected.name}`,
      excerpt: signature,
      source: document.reference,
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
function roleDetails(roles, document) {
  return roles.map((role) => ({
    role: role.role,
    certainty: role.certainty,
    subkind: role.subkind,
    range: {
      start: document.toByteOffset(role.start),
      end: document.toByteOffset(role.end)
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
function literalOccurrences(document, term, allowed) {
  const needle = Buffer.from(term);
  const found = [];
  for (let start = document.bytes.indexOf(needle);start >= 0; start = document.bytes.indexOf(needle, start + Math.max(1, needle.length))) {
    const range = { start, end: start + needle.length };
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
    throw new SignalGrepError(`anyOf requires ${String(MIN_ANY_OF_TERMS)}–${String(MAX_ANY_OF_TOTAL_TERMS)} distinct, nonempty, well-formed, single-line literal terms of at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes; requests above ${String(MAX_ANY_OF_TERMS)} terms are safely chunked`);
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
async function runOwnedParallel(start, parent) {
  const controller = new AbortController;
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const operations = start(signal).map(async (operation) => {
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
import { posix as posix4 } from "node:path";
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
async function discoverFiles(input, cwd, signal) {
  const query = input.query ?? "";
  if (query.length > 256 || !query.isWellFormed() || /[\r\n\0]/.test(query))
    throw new SignalGrepError("File query must be well-formed single-line text of at most 256 characters");
  const request = normalizeRequest({ ...input, pattern: "" });
  const files = await listWorkspaceFiles(cwd, signal, {
    ...request.path ? { path: request.path } : {},
    glob: request.glob,
    exclude: request.exclude,
    hidden: request.hidden
  });
  const selected = files.paths.flatMap((path) => {
    const rank = scoreFilePath(path, query);
    return rank ? [{ path, ...rank }] : [];
  }).toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  const policy = new SearchPathPolicy(cwd);
  for (let offset = 0;offset < selected.length; offset += 16) {
    await Promise.all(selected.slice(offset, offset + 16).map((item) => policy.assertExistingPath(item.path)));
    signal?.throwIfAborted();
  }
  return {
    kind: "files",
    unit: "files",
    partial: files.partial,
    reasons: files.reasons,
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
    coverage: { fileEnumeration: files.partial ? "partial" : "complete" },
    stats: { filesEnumerated: files.paths.length },
    scope: {
      path: request.path ?? ".",
      requestedPath: request.path ?? ".",
      glob: request.glob,
      exclude: request.exclude,
      hidden: request.hidden,
      expandedToProjectRoot: false,
      assertion: request.path && request.path !== "." ? "requested-scope" : "project-wide"
    },
    redact: input.redact ?? false
  };
}

// src/source-continuations.ts
import { randomUUID as randomUUID2 } from "node:crypto";

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
function utf8Boundary(document, offset, direction) {
  let byte = Math.max(0, Math.min(document.bytes.length, offset));
  while (byte > 0 && byte < document.bytes.length) {
    const value = document.bytes[byte];
    if (value === undefined || (value & 192) !== 128)
      break;
    byte += direction;
  }
  return byte;
}
function renderSourceFragment(fragment) {
  const header = `[source bytes ${String(fragment.start)}..${String(fragment.end)}; ${String(fragment.startPosition.line)}:${String(fragment.startPosition.column)}–${String(fragment.endPosition.line)}:${String(fragment.endPosition.column)}; UTF-8, end exclusive]`;
  const lines = fragment.text.split(`
`);
  return [
    header,
    ...lines.map((text, index) => `${String(fragment.startPosition.line + index)}: ${text}`)
  ].join(`
`);
}
function sourcePage(document, ranges, maxBytes, focus) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256) {
    throw new SignalGrepError("Source page budget must allow at least 256 bytes");
  }
  const gaps = mergeByteRanges(ranges);
  const range = gaps.find((item) => focus !== undefined && item.start <= focus && focus < item.end) ?? gaps[0];
  if (!range)
    throw new SignalGrepError("Source range is already complete");
  document.checkRange(range);
  document.toCharacterOffset(range.start);
  document.toCharacterOffset(range.end);
  const target = Math.max(range.start, Math.min(range.end, focus ?? range.start));
  let available = Math.max(4, maxBytes - 160);
  for (;; ) {
    let start = range.start;
    if (range.end - range.start > available && target - range.start > available / 2) {
      start = utf8Boundary(document, Math.floor(target - available / 2), 1);
    }
    start = Math.max(range.start, start);
    let end = utf8Boundary(document, Math.min(range.end, start + available), -1);
    if (end <= start && range.end > range.start)
      end = utf8Boundary(document, start + 1, 1);
    const fragment = {
      start,
      end,
      text: document.slice({ start, end }),
      startPosition: document.positionAt(start),
      endPosition: document.positionAt(end)
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
  create(source, target, gaps) {
    this.#sweep();
    const item = {
      id: randomUUID2(),
      source: structuredClone(source),
      target: mergeByteRanges(target),
      gaps: mergeByteRanges(gaps),
      accessed: this.#now(),
      issued: new Set([0])
    };
    if (item.gaps.length === 0 || item.gaps.some((gap) => gap.start === gap.end || !item.target.some((range) => range.start <= gap.start && gap.end <= range.end))) {
      throw new CursorError("Source continuation requires missing ranges inside its target");
    }
    this.#items.set(item.id, item);
    while (this.#items.size > MAX_SOURCE_CONTINUATIONS || Buffer.byteLength(JSON.stringify([...this.#items.values()].map((continuation) => ({
      id: continuation.id,
      source: continuation.source,
      target: continuation.target,
      gaps: continuation.gaps,
      accessed: continuation.accessed,
      issued: [...continuation.issued]
    })))) > MAX_SOURCE_CONTINUATION_BYTES) {
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
      remaining: this.#remaining(item, consumed)
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
import { resolve as resolve16 } from "node:path";
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
  const document = await access.load(target.path, target.reference);
  if (target.expectedRevision && (document.reference.origin.kind !== "worktree" || !sameSourceRevision(target.expectedRevision, document.reference.origin.revision)))
    throw new SourceDocumentError("source-changed", "Source changed; refresh the search");
  if (target.line > document.lineStarts.length)
    throw new SourceDocumentError("source-unavailable", `Source line ${target.line} is beyond the end of the file`);
  const lineRange = document.lineRange(target.line);
  const focus = target.range?.start ?? target.absoluteFocus ?? Math.min(lineRange.end, lineRange.start + (target.focus ?? 0));
  let range = target.range;
  let details = { status: "no-symbol" };
  const language = syntaxLanguage(document.path);
  if (document.utf8 && language && language !== "go") {
    const syntax = await access.syntax(document);
    details = {
      status: syntax.status === "ok" ? "no-symbol" : syntax.status === "unsupported" ? "provider-unavailable" : "parse-error",
      provider: "tree-sitter",
      language
    };
    if (syntax.status === "ok") {
      const character = document.toCharacterOffset(focus);
      const symbols = syntax.symbols.filter((symbol2) => symbol2.hasBody && symbol2.start <= character && character < symbol2.end).toSorted((a, b) => a.end - a.start - (b.end - b.start));
      const symbol = symbols[0] ?? syntax.symbols.find((item) => item.hasBody && document.lineAt(document.toByteOffset(item.start)) === target.line);
      if (symbol && !target.range) {
        range = {
          start: document.toByteOffset(symbol.start),
          end: document.toByteOffset(symbol.end)
        };
        const lines = {
          startLine: document.lineAt(range.start),
          endLine: document.lineAt(Math.max(range.start, range.end - 1))
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
  } else if (document.utf8 && structure && document.reference.origin.kind === "worktree" && !target.range) {
    const result = await structure.inspect({
      absolutePath: resolve16(access.cwd, target.path),
      cwd: access.cwd,
      line: target.line,
      expectedRevision: document.reference.origin.revision
    }, access.signal);
    details = result.details;
    if (["source-changed", "source-unavailable", "file-too-large"].includes(details.status))
      throw new SourceDocumentError(details.status === "source-changed" ? "source-changed" : "source-unavailable", `Source inspection: ${details.status}`);
    if (details.range)
      range = document.lineRange(details.range.startLine, Math.min(details.range.endLine, document.lineStarts.length));
  } else {
    details = { status: "provider-unavailable", ...language ? { language } : {} };
  }
  range ??= document.lineRange(Math.max(1, target.line - 10), Math.min(document.lineStarts.length, target.line + 10));
  document.checkRange(range);
  return { target, document, range, structure: details, focus };
}
function blockDetails(block) {
  const starts = block.fragments.map((fragment) => fragment.start);
  const ends = block.fragments.map((fragment) => fragment.end);
  const start = starts.length > 0 ? Math.min(...starts) : block.ranges[0]?.start ?? 0;
  const end = ends.length > 0 ? Math.max(...ends) : start;
  const nextRequest = block.continuation ? { mode: "inspect", sourceCursor: block.continuation } : undefined;
  return {
    range: {
      startLine: block.document.lineAt(start),
      endLine: block.document.lineAt(Math.max(start, end - 1))
    },
    omittedBefore: block.remaining.filter((range) => range.end <= start).reduce((n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start), 0),
    omittedAfter: block.remaining.filter((range) => range.start >= end).reduce((n, range) => n + block.document.lineAt(range.end) - block.document.lineAt(range.start), 0),
    truncatedLines: [],
    reference: block.document.reference,
    targetRanges: block.ranges,
    fragments: block.fragments,
    remainingRanges: block.remaining,
    complete: block.document.utf8 && block.remaining.length === 0,
    ...nextRequest ? { nextRequest } : {}
  };
}
function render(items, blocks, single) {
  const rows = items.map((item) => `Target #${item.inputIndex} ${item.path ?? ""}:${item.line ?? ""}: ${item.status}${item.block ? `; Block #${item.block}` : ""}${item.structure ? ` [structure: ${item.structure.status}${item.structure.provider ? ` via ${item.structure.provider}` : ""}]` : ""}${item.structure?.symbol ? ` ${item.structure.symbol.name} (${item.structure.symbol.kind}) lines ${item.structure.symbol.range.startLine}-${item.structure.symbol.range.endLine}` : ""}${item.error ? `; ${item.error}` : ""}${item.retry ? `
Retry: ${JSON.stringify(item.retry)}` : ""}`);
  const sourceRows = blocks.map((block, index) => `[Block #${index + 1}] ${block.document.path}; ${block.document.reference.origin.kind === "git" ? `commit ${block.document.reference.origin.commit}; blob ${block.document.reference.origin.blob}` : `source sha256 ${block.document.reference.origin.contentHash}`}
${block.text.join(`
`)}
[source ${block.remaining.length ? `PARTIAL; missing byte ranges ${JSON.stringify(block.remaining)}` : "complete"}; shared 16384-byte output limit]${block.continuation ? `
Next request: ${JSON.stringify({ mode: "inspect", sourceCursor: block.continuation })}` : ""}`);
  return [
    single ? "Source inspection" : `Batch inspection: ${items.filter((item) => item.status === "returned").length} of ${items.length} targets returned; overlapping ranges merged before the shared 16384-byte budget.`,
    ...rows,
    ...sourceRows
  ].join(`

`);
}
async function inspectDocuments(targets, access, continuations, structure) {
  const items = [];
  const blocks = [];
  for (const [index, target] of targets.entries()) {
    try {
      const prepared = await prepare(target, access, structure);
      let blockIndex = blocks.findIndex((block2) => block2.document === prepared.document);
      if (blockIndex < 0) {
        blockIndex = blocks.length;
        blocks.push({
          document: prepared.document,
          ranges: [],
          targets: [],
          prepared: [],
          fragments: [],
          remaining: [],
          text: []
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
    if (block.remaining.length)
      block.continuation = continuations.create(block.document.reference, block.ranges, block.remaining);
    if (block.document.reference.origin.kind === "worktree") {
      const current = await getSourceRevision(resolve16(access.cwd, block.document.path));
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
  const document = await access.load(state.source.path, state.source);
  const page = sourcePage(document, state.remaining, MAX_RESULT_BYTES - 1400);
  const next = continuations.advance(cursor, page.fragment);
  const block = {
    document,
    ranges: state.target,
    targets: [],
    prepared: [],
    fragments: [page.fragment],
    remaining: page.remaining,
    text: [page.text],
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
      sourceBlocks: [{ path: document.path, source }],
      ...source.nextRequest ? { nextRequest: source.nextRequest } : {}
    }
  };
}

// src/syntax-search.ts
function unavailable(document, analysis) {
  if (!document.utf8) {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: syntax classification requires lossless UTF-8 source`]
    };
  }
  if (analysis.status !== "ok") {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: syntax ${analysis.status}; this source remains unclassified`]
    };
  }
  return;
}
function byteBoundary(document, offset) {
  const byte = document.bytes[offset];
  return offset === document.bytes.length || byte !== undefined && (byte & 192) !== 128;
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
function roleProofs(indices, start, end) {
  const proofs = [];
  for (const index of indices) {
    let low = 0, high = index.roles.length;
    while (low < high) {
      const middle = low + high >>> 1;
      if ((index.roles[middle]?.start ?? Infinity) <= start)
        low = middle + 1;
      else
        high = middle;
    }
    const widest = index.widest[low - 1];
    const role = widest === undefined ? undefined : index.roles[widest];
    if (role && end <= role.end && start < role.end)
      proofs.push(role);
  }
  return proofs;
}
function filterRoleOccurrences(document, analysis, occurrences, roles) {
  const missing = unavailable(document, analysis);
  if (missing)
    return missing;
  const indices = buildRoleIndex(analysis, new Set(roles));
  const items = [];
  const reasons = [];
  const seen = new Set;
  let splitOccurrences = 0;
  for (const range of occurrences) {
    document.checkRange(range);
    const key = `${range.start}:${range.end}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    if (!byteBoundary(document, range.start) || !byteBoundary(document, range.end)) {
      splitOccurrences++;
      continue;
    }
    const proofs = roleProofs(indices, document.toCharacterOffset(range.start), document.toCharacterOffset(range.end));
    if (proofs.length === 0)
      continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      reasons.push(`${document.path}: role result retention limit reached; additional occurrences are not retained`);
      break;
    }
    const match = sourceEvidence(document, range);
    items.push({
      path: document.path,
      line: match.line,
      range: match.range,
      source: document.reference,
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
    reasons.push(`${document.path}: ${splitOccurrences} occurrence(s) split UTF-8 characters and could not be classified`);
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
    const start = Math.max(range.start, other.start);
    const end = Math.min(range.end, other.end);
    if (start < end)
      result.push({ start, end });
  }
  return result;
}
function subtract2(range, exclusions) {
  const result = [];
  let start = range.start;
  for (const excluded of exclusions) {
    if (excluded.end <= start || excluded.start >= range.end)
      continue;
    if (excluded.start > start)
      result.push({ start, end: excluded.start });
    start = Math.max(start, excluded.end);
  }
  if (start < range.end)
    result.push({ start, end: range.end });
  return result;
}
function implementationRanges(document, analysis) {
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
        start: document.toByteOffset(symbol.start),
        end: document.toByteOffset(symbol.end)
      });
      nested.set(parent.node, ranges);
    }
    stack.push(symbol);
  }
  const code = merge(analysis.roles.filter((role) => role.role === "code").map((role) => ({
    start: document.toByteOffset(role.start),
    end: document.toByteOffset(role.end)
  })));
  return { symbols, code, nested };
}
function owned(document, context, symbol, changed) {
  if (!symbol.hasBody || symbol.bodyStart === undefined || symbol.bodyEnd === undefined)
    return [];
  const body = {
    start: document.toByteOffset(symbol.bodyStart),
    end: document.toByteOffset(symbol.bodyEnd)
  };
  const withoutNested = subtract2(body, context.nested.get(symbol.node) ?? []);
  const code = withoutNested.flatMap((range) => intersect(range, context.code));
  return changed ? code.flatMap((range) => intersect(range, changed)) : code;
}
function termEvidence(document, ranges, term) {
  const needle = Buffer.from(term);
  if (needle.length === 0)
    throw new Error("Function conjunction expects normalized non-empty terms");
  let count = 0;
  let first;
  for (const range of ranges) {
    const bytes = document.bytes.subarray(range.start, range.end);
    let offset = bytes.indexOf(needle);
    while (offset >= 0) {
      const start = range.start + offset;
      count++;
      first ??= { start, end: start + needle.length };
      offset = bytes.indexOf(needle, offset + needle.length);
    }
  }
  return first ? {
    term,
    count,
    evidence: sourceEvidence(document, first),
    omittedOccurrenceEvidence: count - 1
  } : undefined;
}
function findFunctionConjunctions(document, analysis, terms, changedRanges) {
  const missing = unavailable(document, analysis);
  if (missing)
    return missing;
  if (analysis.language !== "javascript" && analysis.language !== "typescript" && analysis.language !== "tsx") {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: same-function AND supports JS/TS/TSX only`]
    };
  }
  if (terms.length === 0)
    throw new SignalGrepError("Function conjunction requires normalized terms");
  for (const range of changedRanges ?? [])
    document.checkRange(range);
  const changed = changedRanges ? merge(changedRanges) : undefined;
  const context = implementationRanges(document, analysis);
  const items = [];
  for (const symbol of context.symbols) {
    const ranges = owned(document, context, symbol, changed);
    const matches = terms.map((term) => termEvidence(document, ranges, term));
    if (matches.some((match) => match === undefined))
      continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      return {
        items,
        partial: true,
        reasons: [`${document.path}: function result retention limit reached`]
      };
    }
    const range = {
      start: document.toByteOffset(symbol.start),
      end: document.toByteOffset(symbol.end)
    };
    items.push({
      path: document.path,
      line: document.lineAt(range.start),
      source: document.reference,
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
            start: document.toByteOffset(symbol.bodyStart),
            end: document.toByteOffset(symbol.bodyEnd)
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

// src/evidence-service.ts
function isEvidenceRequest(input) {
  return isSemanticMode(input.mode) || input.mode === "concept" || input.mode === "structure" || input.mode === "files" || input.mode === "inspect" || input.mode === "outline" || input.mode === "imports" || input.mode === "tests" || input.mode === "impact" || input.sourceCursor !== undefined || input.anyOf !== undefined || input.allOf !== undefined || input.within !== undefined || input.roles !== undefined || input.changes !== undefined || input.symbol !== undefined || (input.cursor?.includes(".analysis") ?? false);
}
function rejectFields(input, fields, operation, cursor = false) {
  const present = fields.filter((field) => input[field] !== undefined);
  if (present.length)
    throw cursor ? new CursorError(`${operation} does not accept ${present.join(", ")}; copy the complete returned request`, "E_CURSOR_OPTIONS_CONFLICT") : new SignalGrepError(`${operation} does not accept ${present.join(", ")}; copy the complete returned request`);
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
  "limit"
];
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
    if (input.within !== undefined)
      throw new SignalGrepError("within requires allOf");
    return;
  }
  if (!Array.isArray(terms) || terms.length < 2 || terms.length > 3 || terms.some((term) => typeof term !== "string" || !term.trim() || /[\r\n\0]/.test(term)) || new Set(terms).size !== terms.length)
    throw new SignalGrepError("allOf requires 2–3 distinct, nonempty, single-line literal terms");
  if (input.pattern !== undefined || input.roles !== undefined || input.literal !== undefined || input.ignoreCase !== undefined || input.wholeWord !== undefined)
    throw new SignalGrepError("allOf is an explicit case-sensitive literal conjunction; omit pattern, roles, literal and ignoreCase");
  if (input.within !== undefined && input.within !== "file" && input.within !== "function")
    throw new SignalGrepError("within must be file or function");
  return terms;
}
function fileConjunction(document, terms, allowed) {
  const evidence = terms.map((term) => ({
    term,
    ranges: literalOccurrences(document, term, allowed)
  }));
  if (evidence.some((item) => !item.ranges.length))
    return;
  const first = evidence[0]?.ranges[0];
  if (!first)
    throw new Error("Conjunction evidence unavailable");
  return {
    path: document.path,
    line: document.lineAt(first.start),
    label: "All terms occur in this file; no cross-file or execution-path claim",
    source: document.reference,
    range: first,
    details: {
      terms: evidence.map((item) => ({
        term: item.term,
        occurrences: item.ranges.length,
        evidence: item.ranges.slice(0, 3).map((range) => ({
          start: range.start,
          end: range.end,
          line: document.lineAt(range.start),
          text: document.slice(document.lineRange(document.lineAt(range.start))).slice(0, 500)
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
    assertion: path === "." ? "project-wide" : "requested-scope"
  };
}
async function navigationRoot(cwd, path, signal) {
  const absolute = resolve17(cwd, path);
  if (isPathInsideCwd(absolute, cwd))
    return resolve17(cwd);
  return await findGitRepository(dirname5(absolute), signal) ?? dirname5(absolute);
}

class EvidenceService {
  #runner;
  #snapshots;
  #structure;
  #queue = new SyntaxQueue;
  #analyses = new AnalysisStore;
  #continuations = new SourceContinuations;
  constructor(runner, snapshots, structure) {
    this.#runner = runner;
    this.#snapshots = snapshots;
    this.#structure = structure;
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
  async#testEntryPaths(root, files, cwd, signal) {
    const request = normalizeRequest({
      pattern: TEST_DISCOVERY_PATTERN,
      path: root,
      glob: ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.ts", "*.tsx", "*.mts", "*.cts"],
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
      ], "mode=concept");
      return this.#analyses.page(this.#analyses.create(await conceptSearch(input, access)));
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
        ...inspectFields
      ], "mode=files");
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
    rejectFields(input, [...inspectFields, "query", "line", "matchIndex", "symbol", "cursor"], "Evidence search");
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
          const request2 = normalizeRequest({
            ...expandedFromPath === undefined ? input : unscopedInput,
            pattern: chunk.map(escapeRegexLiteral).join("|"),
            literal: false,
            ignoreCase: false
          });
          const effectiveRequest = expandedFromPath === undefined ? request2 : { ...request2, expandedFromPath };
          const candidates2 = await collectEvidenceCandidates({
            request: effectiveRequest,
            ...input.changes ? { changes: input.changes } : {},
            cwd,
            signal: groupSignal,
            access: chunkAccess,
            runRipgrep: this.#runner,
            maxFiles: fileLimit
          });
          return { chunk, request: effectiveRequest, candidates: candidates2 };
        });
      }, signal);
      let chunkResults = await runChunks();
      if (!input.changes && input.path !== undefined && input.scope !== "strict" && chunkResults.every(({ candidates: candidates2 }) => !candidates2.partial && candidates2.files.length === 0)) {
        chunkResults = await runChunks(input.path.replace(/^@/, ""));
      }
      const reasons = new Set;
      let partial = false;
      let changes;
      const candidateFiles = new Map;
      const invalidatedPaths = new Set;
      for (const { candidates: candidates2 } of chunkResults) {
        partial ||= candidates2.partial;
        changes ??= candidates2.changes;
        for (const reason of candidates2.reasons)
          reasons.add(reason);
        for (const file of candidates2.files) {
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
      const result2 = {
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
      return this.#analyses.page(this.#analyses.create(result2, (retainedItems) => ({
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
    rejectFields(input, [...searchFields, ...inspectFields], "mode=impact");
    let path;
    let line = input.line;
    let document;
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
      document = await access.load(path);
      if (selected.expectedRevision && (document.reference.origin.kind !== "worktree" || !sameSourceRevision(selected.expectedRevision, document.reference.origin.revision)))
        throw new SignalGrepError("Source changed; refresh the search");
    } else {
      if (input.matchIndex !== undefined)
        throw new SignalGrepError("matchIndex requires an ordinary search cursor");
      if (!input.path || input.line === undefined && input.symbol === undefined)
        throw new SignalGrepError("Direct impact requires path and at least one of symbol or line");
      path = input.path;
      document = await access.load(path);
    }
    if (document.reference.origin.kind !== "worktree")
      throw new SignalGrepError("Impact currently supports worktree sources only");
    const root = await navigationRoot(access.cwd, document.path, access.signal);
    const targetSyntax = await access.syntax(document);
    let target;
    try {
      target = selectImpactTarget(document, targetSyntax, {
        ...line !== undefined ? { line } : {},
        ...input.symbol !== undefined ? { symbol: input.symbol } : {}
      });
    } finally {
      access.releaseSyntax(document);
    }
    const request = normalizeRequest({
      pattern: target.symbol.name,
      path: root,
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
      const files = await listWorkspaceFiles(access.cwd, access.signal, { path: root });
      const allowed = new Set(files.paths.map((file) => resolve17(access.cwd, file)));
      const primaryPath = resolve17(access.cwd, document.path);
      const host = {
        cwd: access.cwd,
        ...access.signal ? { signal: access.signal } : {},
        normalizePath: (file) => workspaceRelativePath(access.cwd, file),
        load: async (file, expected) => {
          const absolutePath = resolve17(access.cwd, file);
          if (!allowed.has(absolutePath))
            throw new SignalGrepError("Navigation source is excluded by current ignore rules");
          if (absolutePath === primaryPath && expected === undefined)
            return document;
          return expected ? access.refresh(file, expected) : access.load(file);
        },
        syntax: (source) => access.syntax(source),
        releaseSyntax: (source) => access.releaseSyntax(source),
        listFiles: async () => files,
        maxFilesToParse: access.maxFiles
      };
      const entryPaths = await this.#testEntryPaths(root, files.paths, access.cwd, access.signal);
      const tests = await findRelatedTests(host, {
        path: document.path,
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
      redact: input.redact ?? false
    };
    return this.#analyses.page(this.#analyses.create(result, (items) => retainedImpactCounts(items), impactRetentionPriority));
  }
  async#navigate(input, access) {
    const navigationStarted = performance.now();
    rejectFields(input, [...searchFields, ...inspectFields], `mode=${input.mode}`);
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
    const document = loaded ?? await access.load(path, reference);
    const language = syntaxLanguage(document.path);
    if (!language || language === "go") {
      throw new SignalGrepError(`${input.mode} requires reliable JS/TS/TSX syntax (${language ?? "unsupported"})`);
    }
    if (input.mode === "outline") {
      const syntax = await access.syntax(document);
      const supported = syntax.status === "ok" && syntax.language !== "go";
      const items = supported ? syntax.symbols.map((symbol) => {
        const range = {
          start: document.toByteOffset(symbol.start),
          end: document.toByteOffset(symbol.end)
        };
        const firstLine = document.lineAt(range.start);
        const signatureEnd = symbol.bodyStart ?? symbol.end;
        const signature = document.text.slice(symbol.start, Math.min(signatureEnd, symbol.start + 600));
        return {
          path: document.path,
          line: firstLine,
          label: `${symbol.kind} ${symbol.name}${symbol.hasBody ? "" : " (no implementation body)"}`,
          excerpt: signature,
          source: document.reference,
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
        reasons: supported ? [] : [
          `Outline requires reliable JS/TS/TSX syntax (${syntax.language ?? "unsupported"}: ${syntax.status})`
        ],
        filesRead: access.filesRead,
        bytesRead: access.bytesRead,
        stats: {
          filesEnumerated: 1,
          filesParsed: access.syntaxParses,
          filesSkipped: 0,
          cacheHits: access.syntaxCacheHits,
          parseMs: Math.round(performance.now() - navigationStarted),
          budgetExhausted: false
        },
        redact: input.redact ?? false
      }));
    }
    if (document.reference.origin.kind !== "worktree")
      return this.#analyses.page(this.#analyses.create({
        kind: input.mode === "imports" ? "imports" : "tests",
        unit: input.mode === "imports" ? "relationships" : "evidence-items",
        items: [],
        partial: true,
        reasons: [
          "Import and related-test navigation currently support worktree sources only; historical sources are not switched to the worktree"
        ]
      }));
    const root = await navigationRoot(access.cwd, document.path, access.signal);
    const files = await listWorkspaceFiles(access.cwd, access.signal, { path: root });
    const allowed = new Set(files.paths.map((file) => resolve17(access.cwd, file)));
    const primaryPath = resolve17(access.cwd, document.path);
    const host = {
      cwd: access.cwd,
      ...access.signal ? { signal: access.signal } : {},
      normalizePath: (file) => workspaceRelativePath(access.cwd, file),
      load: async (file, expected) => {
        const absolutePath = resolve17(access.cwd, file);
        if (!allowed.has(absolutePath))
          throw new SignalGrepError("Navigation source is excluded by current ignore rules");
        if (absolutePath === primaryPath && expected === undefined)
          return document;
        return expected ? access.refresh(file, expected) : access.load(file);
      },
      syntax: (doc) => access.syntax(doc),
      releaseSyntax: (doc) => access.releaseSyntax(doc),
      listFiles: async () => files,
      maxFilesToParse: access.maxFiles
    };
    const request = {
      path: document.path,
      ...line !== undefined ? { line } : {},
      ...input.symbol !== undefined ? { symbol: input.symbol } : {}
    };
    const result = input.mode === "imports" ? await navigateImports(host, request) : await findRelatedTests(host, request, {
      entryPaths: await this.#testEntryPaths(root, files.paths, access.cwd, access.signal)
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
      redact: input.redact ?? false
    }));
  }
}

// src/service.ts
import { resolve as resolve18 } from "node:path";

// src/format.ts
import { readFile as readFile2 } from "node:fs/promises";
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
    const start = range.start.character + 1;
    const end = Math.max(start, range.end.character);
    const suffix = range.encoding === "utf-8" ? "b" : "";
    return `${start}-${end}${suffix}`;
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
      const unavailable2 = { status: "unavailable" };
      cache.set(match.absolutePath, unavailable2);
      return unavailable2;
    }
    const beforeRevision = await getSourceRevision(match.absolutePath);
    if (!beforeRevision || !sameSourceRevision(expectedRevision, beforeRevision)) {
      const changed = { status: "changed" };
      cache.set(match.absolutePath, changed);
      return changed;
    }
    const content = await readFile2(match.absolutePath, { encoding: "utf8", signal });
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
    const unavailable2 = { status: "unavailable" };
    cache.set(match.absolutePath, unavailable2);
    return unavailable2;
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
async function formatBlock(match, matchIndex, expectedRevision, window, cache, allMatchLines, signal) {
  const matchingLine = formatMatchLine(match, matchIndex);
  if (!window)
    return { text: matchingLine, contextStatus: "none" };
  const contextLoad = await loadContextLines(match, expectedRevision, cache, signal);
  if (contextLoad.status !== "available") {
    return { text: matchingLine, contextStatus: contextLoad.status };
  }
  const { lines } = contextLoad;
  const output = [];
  for (let lineNumber = window.startLine;lineNumber <= window.endLine; lineNumber += 1) {
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
      const document = await readWorkspaceDocument(path, cwd, signal);
      if (document.reference.origin.kind !== "worktree" || !sameSourceRevision(revision, document.reference.origin.revision) || !document.utf8) {
        reasons.push(`${path}: preview source changed or is not lossless UTF-8`);
        continue;
      }
      let lastEnd = 0;
      let perFile = 0;
      for (const { match, index } of matches) {
        if (perFile >= 2)
          break;
        const start = Math.max(1, match.lineNumber - 3);
        const end = Math.min(document.lineStarts.length, start + 6);
        if (start <= lastEnd)
          continue;
        const lineRows = [];
        for (let line = start;line <= end; line += 1) {
          const value = document.slice(document.lineRange(line)).replace(/\n$/, "");
          const excerpt = excerptText(value);
          lineRows.push(`${line}: ${excerpt.text}${excerpt.truncated ? " [preview line truncated]" : ""}`);
        }
        const row = `${path}:${match.lineNumber} {match #${index + 1}} [source preview lines ${start}-${end}]
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
var SENSITIVE_ASSIGNMENT = /((?:["']?(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|secret[_-]?access[_-]?key|private[_-]?key)["']?)\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\r\n]+)/gi;
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
    let count2 = 0;
    for (let index = 0;index < value.length; index += 1) {
      const item = value[index];
      if (typeof item === "string") {
        const redacted = redactString(item);
        value[index] = redacted.value;
        count2 += redacted.count;
      } else
        count2 += redactInPlace(item, seen);
    }
    return count2;
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
import { randomUUID as randomUUID3 } from "node:crypto";
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
    const parts = cursor.match(/^(.+)\.(matches|summary)\.([0-9a-z]+)\.(all|[0-9a-f]{16})$/);
    if (!parts) {
      throw new CursorError("Invalid cursor. Start a new search to obtain a fresh cursor.", "E_CURSOR_MALFORMED");
    }
    const [, id, rawKind, rawOffset, selectionKey] = parts;
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
    if (label.length === 0)
      throw new SignalGrepError("Cursor paths cannot be empty");
    const absolutePath = resolve18(cwd, label);
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
    assertion: path === "." ? "project-wide" : "requested-scope"
  };
}
function emptyResultText(scope) {
  const filters = scope.glob.length || scope.exclude.length || !scope.hidden ? " Include/exclude and hidden-file filters were applied." : "";
  const expansion = scope.expandedToProjectRoot ? ` after the requested path ${JSON.stringify(scope.requestedPath)} also returned no matches` : "";
  const range = scope.assertion === "project-wide" ? "project root" : "requested path";
  return `No matches found anywhere in ${range} ${JSON.stringify(scope.path)}${expansion}.${filters}`;
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
    this.#evidence = new EvidenceService(this.#runRipgrep, this.#snapshots, options.structure);
  }
  async search(input, cwd, signal, options = {}) {
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
      throw new SignalGrepError("query requires a discovery mode");
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
    const selection2 = cursorPathSelection(input, cwd);
    const requestedSelectionKey = selection2?.key ?? "all";
    if (kind === "matches" && selectionKey !== requestedSelectionKey) {
      throw new CursorError("A match cursor must continue with the same path selection.", "E_CURSOR_OPTIONS_CONFLICT");
    }
    const pageOffset = kind === "summary" ? 0 : offset;
    const result = await this.#page(snapshot, pageOffset, "matches", signal, selection2);
    return this.#finalize(snapshot, result, kind === "summary" || selection2 !== undefined);
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
… ${String(summary.omitted)} lower-ranked files remain.` : "";
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

${summary.body}${omitted}${samples}${sampleOmissions}${followUp}${sourceVerificationNote(details)}`;
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
  async#page(snapshot, offset, mode, signal, selection2) {
    if (offset === snapshot.matches.length) {
      throw new CursorError("Cursor is already at the end of the retained snapshot.");
    }
    const pageOptions = selection2 ? {
      metadataReserveBytes: 1536 + Buffer.byteLength(JSON.stringify({ paths: selection2.labels })),
      include: (match) => selection2.absolutePaths.has(match.absolutePath)
    } : {};
    const page = await formatMatchPage(snapshot, offset, signal, pageOptions);
    if (page.returnedMatches === 0 && selection2) {
      throw new CursorError("No retained matches exist for the selected paths.");
    }
    const missingPaths = [];
    if (selection2) {
      const matchedAbsolutePaths = new Set;
      for (const match of snapshot.matches) {
        if (selection2.absolutePaths.has(match.absolutePath)) {
          matchedAbsolutePaths.add(match.absolutePath);
        }
      }
      const selectedAbsolutePaths = [...selection2.absolutePaths];
      for (const [index, label] of selection2.labels.entries()) {
        const absolutePath = selectedAbsolutePaths[index];
        if (absolutePath !== undefined && !matchedAbsolutePaths.has(absolutePath)) {
          missingPaths.push(label);
        }
      }
    }
    return this.#pageResult(snapshot, offset, mode, page, selection2?.labels, missingPaths, selection2?.key ?? "all");
  }
  #pageResult(snapshot, offset, mode, page, selectedPaths, selectionMissingPaths = [], selectionKey = "all") {
    if (page.returnedMatches === 0) {
      throw new SignalGrepError("The output budget could not fit a single match");
    }
    const cursor = page.hasNext ? this.#snapshots.cursor(snapshot, page.nextOffset, "matches", selectionKey) : undefined;
    const firstMatch = page.firstMatchIndex ?? offset;
    const lastMatch = page.lastMatchIndex ?? firstMatch;
    const range = `${firstMatch + 1}-${lastMatch + 1}`;
    const selection2 = selectedPaths ? `; selected ${String(selectedPaths.length)} path(s)` : "";
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

[Matches ${range} of ${snapshot.totalMatches}${selection2}; ${completenessNote(snapshot)}.]${next}${sourceVerificationNote(details)}`,
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
function signalGrepPromptGuidelines() {
  return [
    `Use baoer_signal_grep for content search. Start with pattern and optional path; omit mode and limit to let auto choose a complete small result or a broad summary. Use literal=true for literal code fragments rather than escaping them as regex.`,
    `An omitted path searches the project cwd. Use scope:"strict" for a question restricted to one path; otherwise, if an explicit subpath has zero matches, ordinary and content-analysis searches retry from cwd and return project-wide matches with an expansion notice. Explicit absolute paths and .. traversal can search outside cwd, except protected external system areas and .git internals. Git changes mode remains cwd-scoped.`,
    `For external source navigation, imports/tests/impact use the containing Git repository when detected, otherwise the target file's directory.`,
    `Use sufficient exact-match evidence directly; do not inspect or reread it only to obtain a citation, since returned matches already have path/line numbers. When definitions repeat, follow the relevant imports/callers before choosing the authoritative file.`,
    `Use the file samples in baoer_signal_grep summaries to choose evidence. Reuse the visible cursor with path or paths for matching lines; mode=summary pages the remaining files. Match counts are not relevance scores.`,
    `When source context is missing, use one baoer_signal_grep batch before reading whole files: {mode:"inspect",cursor:"<returned cursor>",matchIndices:[1,2]} or {mode:"inspect",targets:[{path:"src/example.ts",line:42}]}, at most ${String(MAX_INSPECT_TARGETS)} locations. Copy actual returned selectors. Inspection chooses its own bounded window: omit pattern, context, limit, glob, exclude, literal, ignoreCase and hidden.`,
    `Use allOf:["term1","term2"] for explicit same-file literal AND, or add within:"function" for own-implementation JS/TS/TSX code. Use roles:["declaration"] or roles:["call"] with a single pattern for JS/TS/TSX/Go syntactic occurrences.`,
    `Use anyOf:["term1","term2"] when every exact occurrence of 2-64 literals is needed in one version-bound result. It is case-sensitive, reports retained counts per input term, and runs requests above eight terms as bounded parallel chunks. Large term-count inventories have separate termCountsNextRequest pages; copy those requests to retrieve the complete term map.`,
    `For a changed-code question, add changes:{base:"HEAD",scope:"lines",side:"new"}; omit target for the working tree, use side:"old" for deleted evidence. Copy returned continuation requests to preserve source versions.`,
    `Use mode:"outline" with path to see symbols, mode:"imports" with path and a binding symbol or line to follow static named/default ESM links, and mode:"tests" with path for related test candidates. Import links do not prove runtime calls; test candidates do not prove coverage or passing tests.`,
    `Before changing one known JS/TS/TSX symbol, use mode:"impact" with path plus symbol or line to retrieve the exact target, every exact same-spelling candidate, and related-test evidence together. Compiler-confirmed references in verified candidate documents are ranked first; remaining same spelling does not prove binding, and returned tests have not been run. Use references for a dedicated workspace reference inventory.`,
    `Use mode:"files" plus query for unknown filenames and fuzzy paths. Use wholeWord:true for a single-pattern whole-word search. exclude contains file globs, not content negation.`,
    `Use JS/TS modes definitions, references, implementations, callers or callees with path+line+column (1-based UTF-16), or an unambiguous symbol. Returned evidence includes exact positions and executable next requests. The compiler resolves project aliases, package exports and workspace packages; static relationships do not prove runtime dispatch. dependencies/dependents take only a workspace file path.`,
    `Use mode:"structure" plus an ast-grep pattern such as "compare($X, $X)" or "send()" for code shapes across whitespace; no literal/regex or scope options. Use path/glob/exclude to narrow admitted syntax.`,
    `Use mode:"concept" plus a natural-language query when names are unknown. It runs a pinned local multilingual model only after explicit installation; no search downloads weights or sends code to a remote model. Similarity scores identify source candidates, not proof. File/concept/structure discovery never expands its requested path.`,
    `If inspection reports missing source, execute its complete nextRequest with sourceCursor. Never treat a partial source excerpt as the complete implementation.`,
    `When status=partial, read details.analysis.coverage to see which conclusion is incomplete; an exact occurrence count may remain complete even when syntax or related-test analysis is partial.`
  ];
}
function signalGrepMcpInstructions() {
  return [
    "Use baoer_signal_grep for read-only local filesystem search and bounded source inspection. The server searches from its configured project working directory. Prefer it over unbounded text search when gathering project evidence.",
    "Successful MCP results provide text (the complete formatted evidence page) and details (counts, coverage and continuation selectors). The text content block contains the same page. Use either representation; do not treat the two copies as separate evidence.",
    ...signalGrepPromptGuidelines()
  ].join(`
`);
}

// src/tool-schema.ts
import { Type } from "typebox";
function stringEnum(values, options) {
  return Type.Unsafe({
    type: "string",
    enum: values,
    ...options?.description ? { description: options.description } : {}
  });
}
var SIGNAL_GREP_DESCRIPTION = "Search and navigate code with bounded, verifiable evidence. Ordinary pattern searches use auto detail/summary; scope=strict prevents zero-result path expansion and wholeWord requires word boundaries. files+query discovers filenames; structure+pattern matches AST shapes. JS/TS definitions, references, implementations, callers and callees use path+line+column (1-based UTF-16) or an unambiguous symbol. dependencies/dependents use a workspace file path and the compiler's project module resolution. impact combines compiler-confirmed candidate references, same-spelling candidates and related-test evidence. concept+query ranks local multilingual model candidates after explicit model installation; it never downloads a model during search. Compiler relationships are static, not runtime proof. Use returned path/line evidence directly, or copy inspection/continuation requests when more context is needed. Limits, source changes, ranking reasons and partial coverage are explicit.";
var signalGrepSchema = Type.Object({
  column: Type.Optional(Type.Integer({
    minimum: 1,
    description: "1-based UTF-16 column for exact compiler navigation; requires path and line."
  })),
  query: Type.Optional(Type.String({
    maxLength: 256,
    description: "With mode=files, a filename/path/fuzzy query (optional); with mode=concept, a required natural-language question. Both preserve their requested path. Concept requires an explicitly installed local model."
  })),
  scope: Type.Optional(stringEnum(["strict", "expand"], {
    description: "Content search scope: strict never expands a zero-result path; expand (default) retries from project cwd. Applies to ordinary, multi-term and role searches."
  })),
  wholeWord: Type.Optional(Type.Boolean({
    description: "Single-pattern search only: require ripgrep Unicode word boundaries around the match. Works with regex or literal=true."
  })),
  anyOf: Type.Optional(Type.Array(Type.String({ maxLength: MAX_LITERAL_TERM_BYTES }), {
    minItems: MIN_ANY_OF_TERMS,
    maxItems: MAX_ANY_OF_TOTAL_TERMS,
    description: `Exact literal union: ${String(MIN_ANY_OF_TERMS)}-${String(MAX_ANY_OF_TOTAL_TERMS)} distinct case-sensitive single-line terms, at most ${String(MAX_LITERAL_TERM_BYTES)} UTF-8 bytes each. Requests above ${String(MAX_ANY_OF_TERMS)} terms are split into version-checked chunks and merged. Returns every retained occurrence attributed to its term. Omit pattern, allOf, within, roles, literal and ignoreCase.`
  })),
  allOf: Type.Optional(Type.Array(Type.String(), {
    minItems: 2,
    maxItems: 3,
    description: "Explicit AND: 2-3 distinct case-sensitive literal terms, all in one file (default) or one function. Omit pattern, roles, literal and ignoreCase."
  })),
  within: Type.Optional(stringEnum(["file", "function"], {
    description: "Scope for allOf. function requires JS/TS/TSX and counts only that implementation's own code, excluding nested callbacks, strings/comments/types. Not proof of a shared execution path."
  })),
  roles: Type.Optional(Type.Array(stringEnum([
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
  changes: Type.Optional(Type.Object({
    base: Type.Optional(Type.String({
      description: "Git base commit/ref; default HEAD, pinned to a commit at query time."
    })),
    target: Type.Optional(Type.String({
      description: "Optional target commit/ref. Omit for final working-tree contents including unignored untracked files, not just the staged index."
    })),
    scope: stringEnum(["files", "lines"], {
      description: "Search changed files or only changed lines. With allOf every term must lie on the chosen side's changed lines."
    }),
    side: stringEnum(["new", "old"], {
      description: "Choose final/new content or deleted/old content. Historical inspect and continuation remain bound to that commit/blob."
    })
  })),
  sourceCursor: Type.Optional(Type.String({
    description: "Missing-source continuation token. Copy nextRequest exactly: mode=inspect plus sourceCursor only. Same token replays the same page; changed or expired sources fail clearly."
  })),
  symbol: Type.Optional(Type.String({
    description: "Binding name for imports/tests/impact; semantic modes accept it only when it identifies one source occurrence. Prefer exact path+line+column when the name repeats."
  })),
  pattern: Type.Optional(Type.String({
    description: "Ordinary search: regex or literal=true text. mode=structure: ast-grep code pattern, at most 4 KiB, including $NAME and $$$ARGS metavariables; no regex/literal options. Omit for discovery, semantic navigation, inspection and cursors."
  })),
  path: Type.Optional(Type.String({
    description: "Search root or source file. A zero-result content search expands from cwd unless scope=strict. Compiler navigation stays within admitted workspace sources. Absolute paths and .. traversal may resolve outside cwd, except protected external system areas and .git internals; Git changes mode remains cwd-scoped."
  })),
  paths: Type.Optional(Type.Array(Type.String(), {
    minItems: 1,
    maxItems: MAX_SELECTED_PATHS,
    description: "Exact retained files to select together from a cursor; unavailable for a new search."
  })),
  glob: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())], {
    description: "Include glob or globs, for example '*.ts' or 'src/**'."
  })),
  exclude: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())], {
    description: "Exclude file/path globs (not content negation); applied after include globs. A leading ! is optional."
  })),
  literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal text." })),
  ignoreCase: Type.Optional(Type.Boolean({
    description: "true for insensitive, false for sensitive; omitted uses smart-case."
  })),
  hidden: Type.Optional(Type.Boolean({ description: "Search hidden files (default true; .git is always excluded)." })),
  redact: Type.Optional(Type.Boolean({
    description: "Optional display-only masking for credential-like values and private-key bodies. Default false. It never changes searched files, admitted matches, counts, or cursor completeness."
  })),
  maxFilesToParse: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_CONFIGURABLE_STRUCTURE_FILES,
    description: `Maximum source files parsed by one structural analysis request (default 200, max ${String(MAX_CONFIGURABLE_STRUCTURE_FILES)}). Candidate discovery still searches the full requested scope.`
  })),
  context: Type.Optional(Type.Integer({
    minimum: 0,
    maximum: MAX_CONTEXT_LINES,
    description: "New search only: nearby lines (0-20). MUST be omitted for inspect, which selects its own bounded source window."
  })),
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: "New search only: explicit detail-page match limit (max 100). Normally omit to preserve automatic summarization; not valid for inspect."
  })),
  mode: Type.Optional(stringEnum([
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
    "definitions",
    "references",
    "implementations",
    "callers",
    "callees",
    "dependencies",
    "dependents"
  ], {
    description: "Ordinary search defaults to auto; summary/matches request explicit pages. files uses query, structure uses an AST pattern, concept uses natural-language query. definitions/references/implementations/callers/callees require a workspace path and exact line+column or unique symbol; dependencies/dependents require only a workspace file path. inspect/outline/imports/tests/impact retain their documented location selectors. Compiler results are static evidence; concept and related-test results remain candidates."
  })),
  line: Type.Optional(Type.Number({
    description: "1-indexed source line for path inspection/navigation/impact. Omit with matchIndex, matchIndices or targets."
  })),
  matchIndex: Type.Optional(Type.Number({
    description: "1-based retained match index for cursor-scoped inspect; replaces path and line."
  })),
  matchIndices: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), {
    minItems: 1,
    maxItems: MAX_INSPECT_TARGETS,
    description: "Inspect up to five visible match numbers together using the same cursor; mutually exclusive with matchIndex, path, line and targets."
  })),
  targets: Type.Optional(Type.Array(Type.Object({ path: Type.String(), line: Type.Integer({ minimum: 1 }) }), {
    minItems: 1,
    maxItems: MAX_INSPECT_TARGETS,
    description: "Inspect known path/line locations together without a cursor. The complete batch shares one 16 KiB response budget."
  })),
  cursor: Type.Optional(Type.String({ description: "Opaque cursor from a previous stable search snapshot." }))
});

// src/mcp.ts
var BAOER_SIGNAL_GREP_MCP_PATH = "/mcp";
var DEFAULT_MCP_HOST = "127.0.0.1";
var DEFAULT_MCP_PORT = 3000;
var DEFAULT_MCP_MAX_SESSIONS = 100;
var DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
var MAX_MCP_BODY_BYTES = 16 * 1024 * 1024;
var BAOER_SIGNAL_GREP_MCP_VERSION = package_default.version;
var SIGNAL_GREP_TOOL = {
  name: "baoer_signal_grep",
  title: "baoer_signal_grep",
  description: SIGNAL_GREP_DESCRIPTION,
  inputSchema: signalGrepSchema,
  outputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Complete formatted result page, including source evidence, limits and continuation requests."
      },
      details: { type: "object" }
    },
    required: ["text", "details"]
  },
  annotations: {
    title: "baoer_signal_grep",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};
function createDefaultSignalGrepMcpService() {
  return new SignalGrepService({
    runRipgrep: createRipgrepRunner(),
    structure: createCtagsStructureProvider()
  });
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function validationMessage(value) {
  if (Value.Check(signalGrepSchema, value))
    return;
  const first = Value.Errors(signalGrepSchema, value)[0];
  if (!first)
    return "Invalid baoer_signal_grep arguments";
  return `Invalid baoer_signal_grep arguments at ${first.instancePath || "/"}: ${first.message}`;
}
function parseSignalGrepInput(value) {
  const message = validationMessage(value);
  if (message)
    throw new Error(message);
  return value;
}
function toolError(error) {
  return {
    content: [{ type: "text", text: `baoer_signal_grep failed: ${errorMessage(error)}` }],
    isError: true
  };
}
function createSignalGrepMcpServer(service, cwd) {
  const server = new McpServer({ name: "baoer_signal_grep", version: BAOER_SIGNAL_GREP_MCP_VERSION }, {
    capabilities: { tools: {} },
    instructions: signalGrepMcpInstructions()
  });
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [SIGNAL_GREP_TOOL]
  }));
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (request.params.name !== SIGNAL_GREP_TOOL.name) {
      return toolError(new Error(`Unknown tool: ${request.params.name}`));
    }
    try {
      const input = parseSignalGrepInput(request.params.arguments ?? {});
      const result = await service.search(input, cwd, extra.signal);
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: { text: result.text, details: result.details }
      };
    } catch (error) {
      return toolError(error);
    }
  });
  return server;
}
function settledErrors(results) {
  return results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
}
function cleanupSession(sessions, session) {
  if (session.cleanup)
    return session.cleanup;
  session.cleanup = Promise.resolve().then(async () => {
    const sessionId = session.transport.sessionId;
    if (sessionId && sessions.get(sessionId) === session)
      sessions.delete(sessionId);
    const errors = settledErrors(await Promise.allSettled([session.protocol.close(), session.service.shutdown()]));
    if (errors.length > 0)
      throw new AggregateError(errors, "MCP session cleanup failed");
    return;
  });
  return session.cleanup;
}
function recordCleanupError(state, error) {
  state.cleanupErrors.push(error);
}
function ignoreCleanupError() {}
function cleanupOwnedSession(state, session) {
  return cleanupSession(state.sessions, session).finally(() => state.ownedSessions.delete(session));
}
async function sweepIdleSessions(state, now = Date.now()) {
  const expired = [...state.sessions.values()].filter((session) => session.activeRequests === 0 && now - session.lastAccessedAt >= state.idleTimeoutMs);
  const errors = settledErrors(await Promise.allSettled(expired.map((session) => cleanupOwnedSession(state, session))));
  state.cleanupErrors.push(...errors);
}
async function useSession(session, operation) {
  session.activeRequests += 1;
  session.lastAccessedAt = Date.now();
  try {
    await operation();
  } finally {
    session.activeRequests -= 1;
    session.lastAccessedAt = Date.now();
  }
}
function requestHeader(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
function admitOrigin(request, response, allowedOrigins) {
  const origin = requestHeader(request, "origin");
  if (origin === undefined)
    return true;
  if (!allowedOrigins.has(origin)) {
    writeJsonError(response, 403, "MCP request Origin is not allowed");
    return false;
  }
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-expose-headers", "Mcp-Session-Id, MCP-Protocol-Version");
  response.setHeader("vary", "Origin");
  return true;
}
async function readJsonBody(request) {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0)
      throw new Error("Invalid Content-Length");
    if (length > MAX_MCP_BODY_BYTES)
      throw new Error("MCP request body exceeds the size limit");
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > MAX_MCP_BODY_BYTES)
      throw new Error("MCP request body exceeds the size limit");
    chunks.push(bytes);
  }
  if (chunks.length === 0)
    return;
  let body;
  try {
    body = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new Error("MCP request body must be valid UTF-8");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("MCP request body must be valid JSON");
  }
}
function writeJsonError(response, status, message) {
  if (response.headersSent)
    return;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null
  });
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}
function requestPath(request) {
  return new URL2(request.url ?? BAOER_SIGNAL_GREP_MCP_PATH, "http://baoer_signal_grep.local").pathname;
}
async function handleMcpRequest(request, response, state, createService, cwd) {
  if (!admitOrigin(request, response, state.allowedOrigins))
    return;
  if (state.closing) {
    writeJsonError(response, 503, "MCP server is shutting down");
    return;
  }
  let path;
  try {
    path = requestPath(request);
  } catch {
    writeJsonError(response, 400, "MCP request URL is invalid");
    return;
  }
  if (path !== BAOER_SIGNAL_GREP_MCP_PATH) {
    writeJsonError(response, 404, "MCP endpoint not found");
    return;
  }
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    const requestedHeaders = requestHeader(request, "access-control-request-headers");
    if (requestedHeaders)
      response.setHeader("access-control-allow-headers", requestedHeaders);
    response.statusCode = 204;
    response.end();
    return;
  }
  const sessionId = requestHeader(request, "mcp-session-id");
  if (request.method === "POST") {
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      writeJsonError(response, 400, errorMessage(error));
      return;
    }
    let session = sessionId ? state.sessions.get(sessionId) : undefined;
    let createdSession;
    let initializationReserved = false;
    if (!session) {
      if (sessionId) {
        writeJsonError(response, 404, "MCP session not found");
        return;
      }
      if (!isInitializeRequest(body)) {
        writeJsonError(response, 400, "MCP initialization is required before tool calls");
        return;
      }
      await sweepIdleSessions(state);
      if (state.closing) {
        writeJsonError(response, 503, "MCP server is shutting down");
        return;
      }
      if (state.sessions.size + state.pendingInitializations >= state.maxSessions) {
        writeJsonError(response, 503, "MCP session limit reached; retry after an idle session expires");
        return;
      }
      state.pendingInitializations += 1;
      initializationReserved = true;
      let pendingSession;
      try {
        const service = createService();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID4(),
          onsessioninitialized: (initializedSessionId) => {
            if (!pendingSession)
              throw new Error("MCP session initialized before registration");
            state.sessions.set(initializedSessionId, pendingSession);
            if (initializationReserved) {
              state.pendingInitializations -= 1;
              initializationReserved = false;
            }
          }
        });
        const protocol = createSignalGrepMcpServer(service, cwd);
        pendingSession = {
          protocol,
          service,
          transport,
          lastAccessedAt: Date.now(),
          activeRequests: 0
        };
        createdSession = pendingSession;
        state.ownedSessions.add(pendingSession);
        transport.onclose = () => {
          const closedSession = pendingSession;
          if (!closedSession)
            return;
          const cleanupAlreadyOwned = closedSession.cleanup !== undefined;
          const cleanup = cleanupOwnedSession(state, closedSession);
          cleanup.catch(cleanupAlreadyOwned ? ignoreCleanupError : (error) => recordCleanupError(state, error));
        };
        await protocol.connect(transport);
        session = pendingSession;
      } catch (error) {
        if (initializationReserved) {
          state.pendingInitializations -= 1;
          initializationReserved = false;
        }
        if (pendingSession) {
          try {
            await cleanupOwnedSession(state, pendingSession);
          } catch (cleanupError) {
            recordCleanupError(state, cleanupError);
          }
        }
        writeJsonError(response, 500, errorMessage(error));
        return;
      }
    }
    let requestFailed = false;
    try {
      await useSession(session, () => session.transport.handleRequest(request, response, body));
    } catch (error) {
      requestFailed = true;
      if (!response.headersSent)
        writeJsonError(response, 500, errorMessage(error));
      else
        response.destroy(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (createdSession && (requestFailed || createdSession.transport.sessionId === undefined)) {
        try {
          await cleanupOwnedSession(state, createdSession);
        } catch (cleanupError) {
          recordCleanupError(state, cleanupError);
        }
      }
      if (initializationReserved)
        state.pendingInitializations -= 1;
    }
    return;
  }
  if (request.method === "GET" || request.method === "DELETE") {
    if (!sessionId) {
      writeJsonError(response, 400, "MCP session ID is required");
      return;
    }
    const session = state.sessions.get(sessionId);
    if (!session) {
      writeJsonError(response, 404, "MCP session not found");
      return;
    }
    try {
      await useSession(session, () => session.transport.handleRequest(request, response));
    } catch (error) {
      if (!response.headersSent)
        writeJsonError(response, 500, errorMessage(error));
      else
        response.destroy(error instanceof Error ? error : new Error(String(error)));
    }
    return;
  }
  response.setHeader("allow", "GET, POST, DELETE, OPTIONS");
  writeJsonError(response, 405, "MCP method not allowed");
}
async function startSignalGrepMcpServer(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const maxSessions = options.maxSessions ?? DEFAULT_MCP_MAX_SESSIONS;
  const idleTimeoutMs = options.sessionIdleTimeoutMs ?? DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS;
  if (!Number.isSafeInteger(maxSessions) || maxSessions < 1)
    throw new Error("maxSessions must be a positive safe integer");
  if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1)
    throw new Error("sessionIdleTimeoutMs must be a positive safe integer");
  const state = {
    sessions: new Map,
    ownedSessions: new Set,
    maxSessions,
    idleTimeoutMs,
    allowedOrigins: new Set(options.allowedOrigins ?? []),
    cleanupErrors: [],
    pendingInitializations: 0,
    closing: false
  };
  const createService = options.createService ?? createDefaultSignalGrepMcpService;
  const httpServer = createServer((request, response) => {
    handleMcpRequest(request, response, state, createService, cwd).catch((error) => {
      if (!response.headersSent)
        writeJsonError(response, 500, errorMessage(error));
      else
        response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
  const host = options.host ?? DEFAULT_MCP_HOST;
  const port = options.port ?? DEFAULT_MCP_PORT;
  try {
    await new Promise((resolve19, reject) => {
      const onError = (error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        resolve19();
      };
      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(port, host);
    });
  } catch (error) {
    state.closing = true;
    throw error;
  }
  const sweepIntervalMs = Math.min(Math.max(Math.floor(idleTimeoutMs / 2), 10), 60000);
  const sweepTimer = setInterval(() => {
    sweepIdleSessions(state);
  }, sweepIntervalMs);
  sweepTimer.unref();
  let closePromise;
  const close = () => {
    if (closePromise)
      return closePromise;
    closePromise = (async () => {
      state.closing = true;
      clearInterval(sweepTimer);
      const stopListening = new Promise((resolve19, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve19());
      });
      const initialCleanup = await Promise.allSettled([
        ...[...state.ownedSessions].map((session) => cleanupOwnedSession(state, session)),
        stopListening
      ]);
      const finalCleanup = await Promise.allSettled([...state.ownedSessions].map((session) => cleanupOwnedSession(state, session)));
      const errors = [
        ...state.cleanupErrors,
        ...settledErrors(initialCleanup),
        ...settledErrors(finalCleanup)
      ];
      if (errors.length > 0)
        throw new AggregateError(errors, "MCP server shutdown failed");
    })();
    return closePromise;
  };
  return {
    httpServer,
    cwd,
    close
  };
}

// src/mcp-cli.ts
var BAOER_SIGNAL_GREP_MCP_USAGE = `Usage: baoer_signal_grep_mcp [--http | --stdio]

Transports:
  --http   Start the Streamable HTTP server (default)
  --stdio  Serve one local MCP client over stdin/stdout
`;
function parseSignalGrepMcpTransport(arguments_) {
  if (arguments_.length === 0 || arguments_.length === 1 && arguments_[0] === "--http") {
    return "http";
  }
  if (arguments_.length === 1 && arguments_[0] === "--stdio")
    return "stdio";
  if (arguments_.length === 1 && (arguments_[0] === "--help" || arguments_[0] === "-h")) {
    return "help";
  }
  throw new Error(`Unknown arguments: ${arguments_.join(" ")}
${BAOER_SIGNAL_GREP_MCP_USAGE}`);
}

// src/mcp-stdio.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
function rejectedReasons(results) {
  return results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
}
async function startSignalGrepMcpStdioServer(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const service = (options.createService ?? createDefaultSignalGrepMcpService)();
  const protocol = createSignalGrepMcpServer(service, cwd);
  const lifecycle = Promise.withResolvers();
  let closePromise;
  let transportFailure;
  const requestClose = () => {
    close();
  };
  const requestFailure = (error) => {
    transportFailure ??= error;
    close();
  };
  const removeLifecycleListeners = () => {
    input.off("end", requestClose);
    input.off("close", requestClose);
    input.off("error", requestFailure);
    output.off("error", requestFailure);
  };
  const close = () => {
    if (closePromise)
      return closePromise;
    input.off("end", requestClose);
    input.off("close", requestClose);
    closePromise = lifecycle.promise;
    const performClose = async () => {
      const cleanupErrors = rejectedReasons(await Promise.allSettled([protocol.close(), service.shutdown()]));
      removeLifecycleListeners();
      const errors = transportFailure ? [transportFailure, ...cleanupErrors] : cleanupErrors;
      if (errors.length > 0) {
        lifecycle.reject(new AggregateError(errors, transportFailure ? "MCP stdio transport failed" : "MCP stdio shutdown failed"));
      } else {
        lifecycle.resolve();
      }
    };
    performClose();
    return closePromise;
  };
  const transport = new StdioServerTransport(input, output);
  try {
    if (!Reflect.set(transport, "onclose", requestClose)) {
      throw new Error("Unable to attach the MCP stdio close handler");
    }
    input.once("end", requestClose);
    input.once("close", requestClose);
    input.once("error", requestFailure);
    output.once("error", requestFailure);
    await protocol.connect(transport);
  } catch (error) {
    let cleanupFailure;
    try {
      await close();
    } catch (closeError) {
      cleanupFailure = closeError instanceof Error ? closeError : new Error("MCP stdio startup cleanup failed", { cause: closeError });
    }
    if (cleanupFailure) {
      throw new AggregateError([error, cleanupFailure], "MCP stdio startup failed", {
        cause: error
      });
    }
    throw error;
  }
  return { cwd, closed: lifecycle.promise, close };
}

// src/mcp-server.ts
function environmentInteger(name, fallback, minimum, maximum) {
  const value = process.env[name];
  if (value === undefined)
    return fallback;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < minimum || port > maximum) {
    throw new Error(`${name} must be an integer from ${String(minimum)} through ${String(maximum)}`);
  }
  return port;
}
function allowedOrigins() {
  return (process.env.BAOER_SIGNAL_GREP_MCP_ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}
async function runHttpServer() {
  const running = await startSignalGrepMcpServer({
    cwd: process.env.BAOER_SIGNAL_GREP_MCP_CWD ?? process.cwd(),
    host: process.env.BAOER_SIGNAL_GREP_MCP_HOST ?? DEFAULT_MCP_HOST,
    port: environmentInteger("BAOER_SIGNAL_GREP_MCP_PORT", DEFAULT_MCP_PORT, 0, 65535),
    maxSessions: environmentInteger("BAOER_SIGNAL_GREP_MCP_MAX_SESSIONS", DEFAULT_MCP_MAX_SESSIONS, 1, Number.MAX_SAFE_INTEGER),
    sessionIdleTimeoutMs: environmentInteger("BAOER_SIGNAL_GREP_MCP_SESSION_IDLE_MS", DEFAULT_MCP_SESSION_IDLE_TIMEOUT_MS, 1, Number.MAX_SAFE_INTEGER),
    allowedOrigins: allowedOrigins()
  });
  const address = running.httpServer.address();
  if (!address || !(address instanceof Object)) {
    throw new Error("MCP TCP listener is unavailable");
  }
  const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
  process.stderr.write(`baoer_signal_grep MCP listening on http://${displayHost}:${String(address.port)}${BAOER_SIGNAL_GREP_MCP_PATH}
`);
  process.stderr.write(`baoer_signal_grep MCP working directory: ${running.cwd}
`);
  let shuttingDown = false;
  const closeAfterSignal = async () => {
    try {
      await running.close();
    } catch (error) {
      process.stderr.write(`baoer_signal_grep MCP shutdown failed: ${String(error)}
`);
      process.exitCode = 1;
    }
  };
  const shutdown = () => {
    if (shuttingDown)
      return;
    shuttingDown = true;
    closeAfterSignal();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
async function runStdioServer() {
  const running = await startSignalGrepMcpStdioServer({
    cwd: process.env.BAOER_SIGNAL_GREP_MCP_CWD ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  });
  process.stderr.write(`baoer_signal_grep MCP serving one local client over stdio
`);
  process.stderr.write(`baoer_signal_grep MCP working directory: ${running.cwd}
`);
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown)
      return;
    shuttingDown = true;
    running.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    await running.closed;
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  }
}
async function main() {
  const transport = parseSignalGrepMcpTransport(process.argv.slice(2));
  if (transport === "help") {
    process.stdout.write(BAOER_SIGNAL_GREP_MCP_USAGE);
    return;
  }
  if (transport === "stdio") {
    await runStdioServer();
    return;
  }
  await runHttpServer();
}
try {
  await main();
} catch (error) {
  process.stderr.write(`baoer_signal_grep MCP failed: ${String(error)}
`);
  process.exitCode = 1;
}
