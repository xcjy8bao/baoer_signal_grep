import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { isAbsolute, relative, resolve } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import {
  MAX_LINE_CHARACTERS,
  MAX_STORED_MATCHES,
  type MatchRecord,
  type SearchRequest,
  type SearchScan,
} from "./types.js";

interface RgText {
  text?: string;
  bytes?: string;
}

interface RgMatchEvent {
  type: "match";
  data: {
    path: RgText;
    lines: RgText;
    line_number: number;
  };
}

export interface RipgrepRunnerOptions {
  executable?: string;
  maxStoredMatches?: number;
}

function decodeRgText(value: RgText, field: string): string {
  if (typeof value.text === "string") return value.text;
  if (typeof value.bytes === "string") return Buffer.from(value.bytes, "base64").toString("utf8");
  throw new SignalGrepError(`ripgrep JSON event omitted ${field}`);
}

function displayPath(rawPath: string, cwd: string): { absolutePath: string; displayPath: string } {
  const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
  const localPath = relative(cwd, absolutePath).replaceAll("\\", "/");
  const isInsideCwd = localPath !== ".." && !localPath.startsWith("../") && !isAbsolute(localPath);
  return {
    absolutePath,
    displayPath: isInsideCwd && localPath.length > 0 ? localPath : absolutePath,
  };
}

export function buildRipgrepArguments(request: SearchRequest, cwd: string): string[] {
  const args = ["--json", "--line-number", "--color=never", "--no-heading"];

  if (request.hidden) args.push("--hidden");
  args.push("--glob", "!.git/**", "--glob", "!**/.git/**");

  for (const glob of request.glob) args.push("--glob", glob);
  for (const excluded of request.exclude) {
    const normalized = excluded.startsWith("!") ? excluded : `!${excluded}`;
    args.push("--glob", normalized);
  }

  if (request.literal) args.push("--fixed-strings");
  if (request.ignoreCase === true) args.push("--ignore-case");
  else if (request.ignoreCase === false) args.push("--case-sensitive");
  else args.push("--smart-case");

  const searchPath = resolve(cwd, request.path ?? ".");
  args.push("--", request.pattern, searchPath);
  return args;
}

export function createRipgrepRunner(options: RipgrepRunnerOptions = {}) {
  const executable = options.executable ?? "rg";
  const maxStoredMatches = options.maxStoredMatches ?? MAX_STORED_MATCHES;

  return async function runRipgrep(
    request: SearchRequest,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SearchScan> {
    if (signal?.aborted) throw abortError();

    return new Promise<SearchScan>((resolveSearch, rejectSearch) => {
      const child = spawn(executable, buildRipgrepArguments(request, cwd), {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const lines = createInterface({ input: child.stdout });
      const matches: MatchRecord[] = [];
      const fileCounts = new Map<string, number>();
      let totalMatches = 0;
      let truncatedLines = 0;
      let stderr = "";
      let protocolError: Error | undefined;
      let settled = false;

      const cleanup = () => {
        lines.close();
        signal?.removeEventListener("abort", onAbort);
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const onAbort = () => {
        if (!child.killed) child.kill();
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 16_384) stderr += chunk.toString("utf8");
      });

      lines.on("line", (line) => {
        if (protocolError || line.length === 0) return;
        try {
          const event = JSON.parse(line) as { type?: string };
          if (event.type !== "match") return;

          const matchEvent = event as RgMatchEvent;
          const rawPath = decodeRgText(matchEvent.data.path, "path");
          const rawContent = decodeRgText(matchEvent.data.lines, "line content")
            .replaceAll("\r", "")
            .replace(/\n$/, "");
          const path = displayPath(rawPath, cwd);
          const lineTruncated = rawContent.length > MAX_LINE_CHARACTERS;
          const lineContent = lineTruncated
            ? `${rawContent.slice(0, MAX_LINE_CHARACTERS)}…`
            : rawContent;

          totalMatches += 1;
          fileCounts.set(path.displayPath, (fileCounts.get(path.displayPath) ?? 0) + 1);
          if (lineTruncated) truncatedLines += 1;
          if (matches.length < maxStoredMatches) {
            matches.push({
              ...path,
              lineNumber: matchEvent.data.line_number,
              lineContent,
              lineTruncated,
            });
          }
        } catch (error) {
          protocolError = new SignalGrepError("Failed to parse ripgrep JSON output", {
            cause: error,
          });
          if (!child.killed) child.kill();
        }
      });

      child.once("error", (error) => {
        settle(() => {
          const message =
            (error as NodeJS.ErrnoException).code === "ENOENT"
              ? `ripgrep executable not found: ${executable}`
              : `Failed to start ripgrep: ${error.message}`;
          rejectSearch(new SignalGrepError(message, { cause: error }));
        });
      });

      child.once("close", (code) => {
        settle(() => {
          if (signal?.aborted) {
            rejectSearch(abortError());
            return;
          }
          if (protocolError) {
            rejectSearch(protocolError);
            return;
          }
          if (code !== 0 && code !== 1) {
            rejectSearch(
              new SignalGrepError(stderr.trim() || `ripgrep exited with status ${String(code)}`),
            );
            return;
          }

          resolveSearch({
            request,
            matches,
            totalMatches,
            fileCounts,
            snapshotComplete: matches.length === totalMatches,
            truncatedLines,
          });
        });
      });
    });
  };
}

export type RipgrepRunner = ReturnType<typeof createRipgrepRunner>;
