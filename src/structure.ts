import { isAbsolute, resolve } from "node:path";
import { consumeCappedLines } from "./capped-lines.js";
import { runOwnedProcess } from "./owned-process.js";
import { abortError, SignalGrepError } from "./errors.js";
import { getSourceRevision, sameSourceRevision } from "./source.js";
import {
  MAX_PROTOCOL_LINE_BYTES,
  MAX_SOURCE_FILE_BYTES,
  type SourceRevision,
  type StructureDetails,
  type StructureSymbol,
} from "./types.js";

export const CTAGS_CAPABILITY_ARGUMENTS = [
  "--output-format=json",
  "--fields=+ne",
  "--extras=-p",
] as const;

export interface StructureInspectionRequest {
  absolutePath: string;
  cwd: string;
  line: number;
  expectedRevision?: SourceRevision;
}

export interface StructureInspection {
  details: StructureDetails;
  currentRevision?: SourceRevision;
}

export interface CodeStructureProvider {
  inspect(request: StructureInspectionRequest, signal?: AbortSignal): Promise<StructureInspection>;
}

export interface CtagsTag {
  path: string;
  name: string;
  language?: string;
  kind?: string;
  scope?: string;
  line?: number;
  end?: number;
}

export interface CtagsStructureProviderOptions {
  executable?: string;
  maxFileBytes?: number;
  runCtags?: (absolutePath: string, cwd: string, signal?: AbortSignal) => Promise<CtagsTag[]>;
}

class CtagsCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CtagsCommandError";
  }
}

class CtagsProtocolError extends SignalGrepError {}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function parseCtagsTag(value: unknown): CtagsTag | undefined {
  if (!isRecord(value)) return undefined;
  const hasTagType = Object.entries(value).some(
    ([key, entry]) => key === "_type" && entry === "tag",
  );
  if (!hasTagType) return undefined;
  const path = asOptionalString(value.path);
  const name = asOptionalString(value.name);
  const language = asOptionalString(value.language);
  const kind = asOptionalString(value.kind);
  const scope = asOptionalString(value.scope);
  const line = asOptionalPositiveInteger(value.line);
  const end = asOptionalPositiveInteger(value.end);
  if (!path || !name) return undefined;
  return {
    path,
    name,
    ...(language ? { language } : {}),
    ...(kind ? { kind } : {}),
    ...(scope ? { scope } : {}),
    ...(line ? { line } : {}),
    ...(end ? { end } : {}),
  };
}

async function runCtagsCommand(
  executable: string,
  absolutePath: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<CtagsTag[]> {
  const tags: CtagsTag[] = [];
  const { code, stderr } = await runOwnedProcess(
    {
      executable,
      args: [...CTAGS_CAPABILITY_ARGUMENTS, absolutePath],
      cwd,
      ...(signal ? { signal } : {}),
    },
    async (stdout) => {
      try {
        await consumeCappedLines(
          stdout,
          (line) => {
            if (line.length === 0) return;
            let value: unknown;
            try {
              value = JSON.parse(line);
            } catch (error) {
              throw new CtagsProtocolError("Failed to parse Universal Ctags JSON output", {
                cause: error,
              });
            }
            const tag = parseCtagsTag(value);
            if (tag) tags.push(tag);
          },
          { maxLineBytes: MAX_PROTOCOL_LINE_BYTES },
        );
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Input line exceeds the ")) {
          throw new CtagsProtocolError(error.message, { cause: error });
        }
        throw error;
      }
    },
  );
  if (code !== 0) {
    throw new CtagsCommandError(stderr.trim() || `ctags exited with status ${String(code)}`);
  }
  return tags;
}

function pathMatches(tagPath: string, absolutePath: string, cwd: string): boolean {
  return resolve(isAbsolute(tagPath) ? tagPath : resolve(cwd, tagPath)) === resolve(absolutePath);
}

function symbolFromTag(tag: CtagsTag): StructureSymbol | undefined {
  if (tag.line === undefined || tag.end === undefined || tag.end < tag.line) return undefined;
  return {
    name: tag.name,
    kind: tag.kind ?? "unknown",
    scope: tag.scope ? [tag.scope] : [],
    range: { startLine: tag.line, endLine: tag.end },
  };
}

function chooseEnclosingSymbol(
  tags: CtagsTag[],
  absolutePath: string,
  cwd: string,
  line: number,
): StructureSymbol | undefined {
  const candidates = tags
    .filter((tag) => pathMatches(tag.path, absolutePath, cwd))
    .map(symbolFromTag)
    .filter((symbol): symbol is StructureSymbol => symbol !== undefined)
    .filter((symbol) => symbol.range.startLine <= line && line <= symbol.range.endLine)
    .toSorted((left, right) => {
      const leftSize = left.range.endLine - left.range.startLine;
      const rightSize = right.range.endLine - right.range.startLine;
      if (leftSize !== rightSize) return leftSize - rightSize;
      return right.scope.length - left.scope.length;
    });
  return candidates[0];
}

export function createCtagsStructureProvider(
  options: CtagsStructureProviderOptions = {},
): CodeStructureProvider {
  const executable = options.executable ?? "ctags";
  const maxFileBytes = options.maxFileBytes ?? MAX_SOURCE_FILE_BYTES;
  const runCtags =
    options.runCtags ??
    ((absolutePath, cwd, signal) => runCtagsCommand(executable, absolutePath, cwd, signal));

  return {
    async inspect(request, signal) {
      if (signal?.aborted) throw abortError();
      const currentRevision = await getSourceRevision(request.absolutePath);
      if (!currentRevision) {
        return { details: { status: "source-unavailable", provider: "universal-ctags" } };
      }
      if (
        request.expectedRevision &&
        !sameSourceRevision(request.expectedRevision, currentRevision)
      ) {
        return {
          details: { status: "source-changed", provider: "universal-ctags" },
          currentRevision,
        };
      }
      if (currentRevision.size > maxFileBytes) {
        return {
          details: { status: "file-too-large", provider: "universal-ctags" },
          currentRevision,
        };
      }

      let tags: CtagsTag[];
      try {
        tags = await runCtags(request.absolutePath, request.cwd, signal);
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw abortError();
        }
        if (hasCode(error, "ENOENT") || error instanceof CtagsCommandError) {
          return {
            details: { status: "provider-unavailable", provider: "universal-ctags" },
            currentRevision,
          };
        }
        if (error instanceof CtagsProtocolError) {
          return {
            details: { status: "parse-error", provider: "universal-ctags" },
            currentRevision,
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
          ...(language ? { language } : {}),
          ...(symbol ? { symbol, range: symbol.range } : {}),
        },
        currentRevision,
      };
    },
  };
}
