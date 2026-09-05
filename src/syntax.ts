import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PARSE_TIME_MS, MAX_STRUCTURE_BYTES, MAX_SYNTAX_NODES } from "./analysis-limits.js";
import { abortError, SignalGrepError } from "./errors.js";
import { runOwnedProcess } from "./owned-process.js";
import { deriveSyntaxFacts } from "./syntax-facts.js";
import { syntaxChildren } from "./syntax-tree.js";
import type {
  SyntaxAnalysis,
  SyntaxLanguage,
  SyntaxNode,
  SyntaxStatus,
  SyntaxWorkerResult,
} from "./syntax-types.js";
import { MAX_SOURCE_FILE_BYTES } from "./types.js";

export type {
  SyntaxAnalysis,
  SyntaxDiagnostic,
  SyntaxLanguage,
  SyntaxNode,
  SyntaxRole,
  SyntaxRoleName,
  SyntaxStatus,
  SyntaxSymbol,
} from "./syntax-types.js";
export { classifySyntaxRange } from "./syntax-facts.js";
export { syntaxField, syntaxFields, syntaxText } from "./syntax-tree.js";

export function syntaxLanguage(path: string): SyntaxLanguage | undefined {
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
      return undefined;
  }
}

function emptyAnalysis(status: SyntaxStatus, language?: SyntaxLanguage): SyntaxAnalysis {
  return {
    status,
    ...(language ? { language } : {}),
    nodes: [],
    children: [],
    symbols: [],
    roles: [],
    diagnostics: [],
    limited: status === "limit",
  };
}

function invalidProtocol(): never {
  throw new SignalGrepError("Invalid syntax parser protocol");
}

function readNode(
  value: unknown,
  index: number,
  nodes: readonly SyntaxNode[],
  length: number,
): SyntaxNode {
  if (!value || typeof value !== "object") return invalidProtocol();
  if (
    !("kind" in value) ||
    typeof value.kind !== "string" ||
    value.kind.length === 0 ||
    !("start" in value) ||
    typeof value.start !== "number" ||
    !Number.isSafeInteger(value.start) ||
    !("end" in value) ||
    typeof value.end !== "number" ||
    !Number.isSafeInteger(value.end) ||
    value.start < 0 ||
    value.end < value.start ||
    value.end > length ||
    !("named" in value) ||
    typeof value.named !== "boolean" ||
    !("parent" in value)
  )
    return invalidProtocol();
  const parent = value.parent;
  if (
    index === 0
      ? parent !== null
      : typeof parent !== "number" || !Number.isSafeInteger(parent) || parent < 0 || parent >= index
  ) {
    return invalidProtocol();
  }
  if (typeof parent === "number") {
    const owner = nodes[parent];
    if (!owner || owner.start > value.start || owner.end < value.end) return invalidProtocol();
  }
  if ("field" in value && typeof value.field !== "string") return invalidProtocol();
  return {
    kind: value.kind,
    start: value.start,
    end: value.end,
    parent: typeof parent === "number" ? parent : null,
    named: value.named,
    ...("field" in value && typeof value.field === "string" ? { field: value.field } : {}),
  };
}

function readResult(output: string, length: number): SyntaxWorkerResult {
  const result: unknown = JSON.parse(output);
  if (
    !result ||
    typeof result !== "object" ||
    !("status" in result) ||
    !("nodes" in result) ||
    !["ok", "parse-error", "limit"].includes(String(result.status)) ||
    !Array.isArray(result.nodes) ||
    result.nodes.length === 0 ||
    result.nodes.length > MAX_SYNTAX_NODES
  ) {
    return invalidProtocol();
  }
  const nodes: SyntaxNode[] = [];
  for (const value of result.nodes) nodes.push(readNode(value, nodes.length, nodes, length));
  if (result.status !== "ok" && result.status !== "parse-error" && result.status !== "limit")
    return invalidProtocol();
  const patternMatches: { start: number; end: number }[] = [];
  if ("patternMatches" in result) {
    if (!Array.isArray(result.patternMatches) || result.patternMatches.length > MAX_SYNTAX_NODES)
      return invalidProtocol();
    for (const match of result.patternMatches) {
      if (
        !match ||
        typeof match !== "object" ||
        !("start" in match) ||
        !("end" in match) ||
        typeof match.start !== "number" ||
        typeof match.end !== "number" ||
        !Number.isSafeInteger(match.start) ||
        !Number.isSafeInteger(match.end) ||
        match.start < 0 ||
        match.end < match.start ||
        match.end > length
      )
        return invalidProtocol();
      patternMatches.push({ start: match.start, end: match.end });
    }
  }
  return { status: result.status, nodes, patternMatches };
}

/** The service serializes requests; this owns exactly one short-lived native parser. */
export async function parseSyntax(
  path: string,
  text: string,
  signal?: AbortSignal,
  pattern?: string,
): Promise<SyntaxAnalysis> {
  if (signal?.aborted) throw abortError();
  const language = syntaxLanguage(path);
  if (!language) return emptyAnalysis("unsupported");
  if (Buffer.byteLength(text) > MAX_SOURCE_FILE_BYTES) return emptyAnalysis("limit", language);
  if (!text.isWellFormed()) {
    return {
      ...emptyAnalysis("parse-error", language),
      diagnostics: [{ kind: "invalid-unicode", start: 0, end: text.length }],
    };
  }
  const worker = fileURLToPath(new URL("./syntax-worker.mjs", import.meta.url));
  const config = fileURLToPath(new URL("./syntax-worker.toml", import.meta.url));
  const args = process.versions.bun
    ? [`--config=${config}`, "--no-env-file", "--no-macros", "--no-install", worker]
    : [worker];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, MAX_PARSE_TIME_MS);
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    const result = await runOwnedProcess(
      {
        executable: process.execPath,
        args,
        cwd: dirname(worker),
        env,
        signal: controller.signal,
        input: Buffer.from(JSON.stringify({ language, text, pattern })),
      },
      async (stdout) => {
        for await (const chunk of stdout) {
          bytes += chunk.byteLength;
          if (bytes > MAX_STRUCTURE_BYTES)
            throw new SignalGrepError("Syntax parser output exceeds protocol limit");
          chunks.push(Buffer.from(chunk));
        }
      },
    );
    if (signal?.aborted) throw abortError();
    if (result.code !== 0) {
      throw new SignalGrepError(
        `Syntax parser process failed (${String(result.code)}): ${result.stderr.trim()}`,
      );
    }
    const parsed = readResult(Buffer.concat(chunks).toString("utf8"), text.length);
    const children = syntaxChildren(parsed.nodes);
    const diagnostics = parsed.nodes.flatMap((node, index) =>
      node.kind === "ERROR" || (index > 0 && node.start === node.end)
        ? [
            {
              kind: node.kind === "ERROR" ? "syntax-error" : "missing-token",
              start: node.start,
              end: node.end,
            },
          ]
        : [],
    );
    const facts =
      parsed.status === "ok"
        ? deriveSyntaxFacts({ nodes: parsed.nodes, children }, language, text)
        : { symbols: [], roles: [] };
    if (signal?.aborted) throw abortError();
    return {
      language,
      status: parsed.status,
      nodes: parsed.nodes,
      children,
      ...(parsed.patternMatches ? { patternMatches: parsed.patternMatches } : {}),
      ...facts,
      diagnostics,
      limited: parsed.status === "limit",
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted && signal?.aborted) throw abortError();
    if (aborted && timedOut) return emptyAnalysis("timeout", language);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
