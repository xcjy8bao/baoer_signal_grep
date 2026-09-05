import { semanticUri } from "./semantic-sources.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
const compilerQueue = new OwnedTaskQueue();
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { abortError, SignalGrepError } from "./errors.js";
import { runOwnedJsonRpc, rpcRecord, type JsonRpcChannel } from "./owned-json-rpc.js";
import type { SourceDocument } from "./source-document.js";

export const TYPESCRIPT_QUERY_TIMEOUT_MS = 20_000;

const preferences = {
  disableAutomaticTypeAcquisition: true,
  tsserver: { automaticTypeAcquisition: { enabled: false } },
  implicitProjectConfig: { checkJs: true, allowJs: true, typeAcquisition: { enabled: false } },
  preferences: { includePackageJsonAutoImports: "off" },
};

function serverRequest(method: string, params: unknown): unknown {
  if (method === "workspace/configuration") {
    if (!rpcRecord(params) || !Array.isArray(params.items))
      throw new SignalGrepError("Invalid language-service configuration request");
    return params.items.map(() => preferences);
  }
  if (
    method === "client/registerCapability" ||
    method === "client/unregisterCapability" ||
    method === "window/workDoneProgress/create"
  )
    return null;
  if (method === "workspace/applyEdit")
    return { applied: false, failureReason: "Search is read-only" };
  throw new SignalGrepError(`Unsupported language-service client request: ${method}`);
}

function executablePath(): string {
  const packageName = `@typescript/typescript-${process.platform}-${process.arch}`;
  try {
    const metadata = createRequire(import.meta.url).resolve(`${packageName}/package.json`);
    return join(dirname(metadata), "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
  } catch (error) {
    throw new SignalGrepError(
      `TypeScript semantic provider is unavailable for ${process.platform}/${process.arch}; reinstall with optional dependencies enabled`,
      { cause: error },
    );
  }
}

/** Fresh compiler state per query; no project code, npm installation, or persistent server is invoked. */
async function runTypeScript<T>(
  cwd: string,
  documents: readonly SourceDocument[],
  operation: (channel: JsonRpcChannel, capabilities: Record<string, unknown>) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  const executable = executablePath();
  const deadline = new AbortController();
  const signal = parent ? AbortSignal.any([parent, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(), TYPESCRIPT_QUERY_TIMEOUT_MS);
  try {
    return await runOwnedJsonRpc(
      {
        executable,
        args: ["--lsp", "--stdio"],
        cwd,
        signal,
        // The compiler is native. Prevent optional helper discovery even if project settings request ATA.
        env: { ...process.env, PATH: dirname(executable), GOMEMLIMIT: "256MiB" },
      },
      async (channel) => {
        const initialized = await channel.request("initialize", {
          processId: process.pid,
          rootUri: await semanticUri(cwd, "."),
          capabilities: {
            workspace: {
              configuration: true,
              didChangeWatchedFiles: { dynamicRegistration: true },
            },
            textDocument: {
              definition: { linkSupport: true },
              implementation: { linkSupport: true },
              callHierarchy: {},
            },
            general: { positionEncodings: ["utf-16"] },
          },
          initializationOptions: { runExternalCode: false, disablePushDiagnostics: true },
        });
        if (!rpcRecord(initialized) || !rpcRecord(initialized.capabilities))
          throw new SignalGrepError("Language service omitted its capabilities");
        await channel.notify("initialized", {});
        await channel.notify("workspace/didChangeConfiguration", {
          settings: { "js/ts": preferences, typescript: preferences, javascript: preferences },
        });
        for (const document of documents) {
          // oxlint-disable-next-line no-await-in-loop -- canonical URIs prevent duplicate compiler identities for workspace symlinks.
          const uri = await semanticUri(cwd, document.path);
          // oxlint-disable-next-line no-await-in-loop -- ordered didOpen notifications install the verified source snapshot.
          await channel.notify("textDocument/didOpen", {
            textDocument: {
              uri,
              languageId: /\.tsx$/i.test(document.path)
                ? "typescriptreact"
                : /\.jsx$/i.test(document.path)
                  ? "javascriptreact"
                  : /\.[cm]?ts$/i.test(document.path)
                    ? "typescript"
                    : "javascript",
              version: 1,
              text: document.text,
            },
          });
        }
        const result = await operation(channel, initialized.capabilities);
        await channel.request("shutdown", undefined);
        // TS 7.0.2 maps the exit notification to context.Canceled (exit 1).
        // After acknowledged shutdown, EOF lets its read loop terminate cleanly.
        channel.endInput();
        return result;
      },
      serverRequest,
    );
  } catch (error) {
    if (parent?.aborted) throw abortError();
    if (deadline.signal.aborted)
      throw new SignalGrepError(
        `TypeScript semantic query exceeded the ${String(TYPESCRIPT_QUERY_TIMEOUT_MS)} ms deadline`,
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function withTypeScript<T>(
  cwd: string,
  documents: readonly SourceDocument[],
  operation: (channel: JsonRpcChannel, capabilities: Record<string, unknown>) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  return compilerQueue.run(() => runTypeScript(cwd, documents, operation, parent), parent);
}
