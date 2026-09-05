import { sourceEvidence } from "./analysis-evidence.js";
import { OwnedTaskQueue } from "./owned-task-queue.js";
const semanticRequestQueue = new OwnedTaskQueue();
import { semanticSources, semanticUri } from "./semantic-sources.js";
import { rankEvidence } from "./evidence-ranking.js";
import { resolve } from "node:path";
import type { AnalysisItem } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import { rpcRecord, type JsonRpcChannel } from "./owned-json-rpc.js";
import type { SignalGrepInput } from "./service.js";
import type { SourceAccess } from "./source-access.js";
import type { SourceDocument } from "./source-document.js";
import { withTypeScript } from "./typescript-client.js";
import { semanticProject } from "./semantic-project.js";
import {
  byteAt,
  byteRange,
  isSemanticMode,
  locations,
  lspPosition,
  semanticLocation,
  type SemanticLocation,
} from "./semantic-protocol.js";

async function selection(input: SignalGrepInput, access: SourceAccess, document: SourceDocument) {
  if (input.column !== undefined) {
    if (
      input.line === undefined ||
      !Number.isSafeInteger(input.column) ||
      input.column < 1 ||
      input.symbol !== undefined
    )
      throw new SignalGrepError(
        "Semantic column requires line and no symbol; both are 1-based UTF-16 positions",
      );
    const position = { line: input.line - 1, character: input.column - 1 };
    byteAt(document, position);
    return position;
  }
  const syntax = await access.syntax(document);
  if (syntax.status !== "ok")
    throw new SignalGrepError(
      "Selecting a semantic symbol requires valid syntax; supply an exact line+column position",
    );
  const candidates = syntax.nodes.filter(
    (node) =>
      /^(?:identifier|property_identifier|type_identifier|shorthand_property_identifier(?:_pattern)?)$/.test(
        node.kind,
      ) &&
      (input.symbol === undefined || document.text.slice(node.start, node.end) === input.symbol) &&
      (input.line === undefined ||
        document.lineAt(document.toByteOffset(node.start)) === input.line),
  );
  if (input.line === undefined && input.symbol === undefined)
    throw new SignalGrepError(
      "Semantic navigation requires path and line+column, or an unambiguous symbol",
    );
  if (candidates.length !== 1)
    throw new SignalGrepError(
      `Semantic target is ${candidates.length ? "ambiguous" : "absent"}; supply an exact 1-based line and UTF-16 column`,
    );
  const candidate = candidates[0];
  if (!candidate) throw new Error("Missing semantic candidate");
  return lspPosition(document, candidate.start);
}

function itemFor(
  document: SourceDocument,
  location: SemanticLocation,
  relation: string,
): AnalysisItem {
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
        column: location.range.start.character + 1,
      },
    },
  };
}

async function queryLocations(
  channel: JsonRpcChannel,
  mode: string,
  params: unknown,
): Promise<SemanticLocation[]> {
  if (mode === "callers" || mode === "callees") {
    const prepared = await channel.request("textDocument/prepareCallHierarchy", params);
    if (prepared === null) return [];
    if (!Array.isArray(prepared)) throw new SignalGrepError("Invalid compiler call hierarchy");
    const found: SemanticLocation[] = [];
    for (const item of prepared) {
      // oxlint-disable-next-line no-await-in-loop -- call hierarchy requests share one ordered compiler process.
      const calls = await channel.request(
        mode === "callers" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls",
        { item },
      );
      if (calls === null) continue;
      if (!Array.isArray(calls)) throw new SignalGrepError("Invalid compiler call relationships");
      for (const call of calls) {
        if (!rpcRecord(call)) throw new SignalGrepError("Invalid compiler call relationship");
        found.push(semanticLocation(mode === "callers" ? call.from : call.to));
      }
    }
    return found;
  }
  const method =
    mode === "definitions"
      ? "definition"
      : mode === "implementations"
        ? "implementation"
        : "references";
  if (!rpcRecord(params)) throw new Error("Expected semantic request parameters");
  return locations(
    await channel.request(`textDocument/${method}`, {
      ...params,
      ...(method === "references" ? { context: { includeDeclaration: true } } : {}),
    }),
  );
}

async function runSemanticNavigation(input: SignalGrepInput, access: SourceAccess) {
  if (!input.path || !isSemanticMode(input.mode))
    throw new SignalGrepError("Semantic navigation requires a mode and workspace path");
  const project = await semanticProject(access, input.path);
  const { result, documents, primary } = project;
  result.kind = input.mode;
  result.redact = input.redact ?? false;
  const mode = input.mode;
  const graph = mode === "dependencies" || mode === "dependents";
  if (
    graph &&
    (input.line !== undefined || input.column !== undefined || input.symbol !== undefined)
  )
    throw new SignalGrepError(
      "File dependencies/dependents accept path without line, column or symbol",
    );
  const position = graph ? undefined : await selection(input, access, primary);
  const sourceAt = await semanticSources(access.cwd, documents.values());
  const add = async (location: SemanticLocation, relation: string) => {
    const document = await sourceAt(location.path);
    if (document) result.items.push(itemFor(document, location, relation));
    else {
      result.partial = true;
      result.reasons.push(
        "Compiler returned a location outside admitted source coverage; dependency/ignored/over-budget source was not exposed",
      );
    }
  };
  await withTypeScript(
    access.cwd,
    [...documents.values()],
    async (channel) => {
      if (!graph) {
        const found = await queryLocations(channel, mode, {
          textDocument: { uri: await semanticUri(access.cwd, primary.path) },
          position,
        });
        for (const location of found) {
          // oxlint-disable-next-line no-await-in-loop -- canonical source admission is bounded and deterministic.
          await add(location, mode);
        }
        return;
      }
      for (const document of mode === "dependencies" ? [primary] : documents.values()) {
        // oxlint-disable-next-line no-await-in-loop -- syntax and compiler lookups obey the request's shared bounds.
        const syntax = await access.syntax(document);
        if (syntax.status !== "ok") {
          result.partial = true;
          result.reasons.push(`${document.path}: module syntax ${syntax.status}`);
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- one canonical compiler URI per source file.
        const uri = await semanticUri(access.cwd, document.path);
        const specifiers = syntax.nodes.filter(
          (node) =>
            node.kind === "string" &&
            node.parent !== null &&
            (() => {
              const parent = syntax.nodes[node.parent];
              if (!parent) return false;
              if (parent.kind === "import_statement" || parent.kind === "export_statement")
                return true;
              if (parent.kind !== "arguments" || parent.parent === null) return false;
              const call = syntax.nodes[parent.parent];
              return (
                call?.kind === "call_expression" &&
                /^(?:import|require)\s*\(/.test(document.text.slice(call.start, node.start))
              );
            })(),
        );
        for (const specifier of specifiers) {
          const resolved = locations(
            // oxlint-disable-next-line no-await-in-loop -- bounded static module resolver, including project aliases and package exports.
            await channel.request("textDocument/definition", {
              textDocument: { uri: uri },
              position: lspPosition(document, specifier.start + 1),
            }),
          );
          if (!resolved.length) {
            result.partial = true;
            result.reasons.push(
              `${document.path}: unresolved module ${document.text.slice(specifier.start, specifier.end)}`,
            );
          }
          for (const target of resolved) {
            // oxlint-disable-next-line no-await-in-loop -- compare canonical project source identities, including workspace symlinks.
            const targetDocument = await sourceAt(target.path);
            if (mode === "dependencies") {
              // oxlint-disable-next-line no-await-in-loop -- canonical evidence admission for this module edge.
              await add(target, "dependency");
            } else if (targetDocument === primary) {
              // oxlint-disable-next-line no-await-in-loop -- preserve exact dependent specifier positions.
              await add(
                {
                  path: resolve(access.cwd, document.path),
                  range: {
                    start: lspPosition(document, specifier.start),
                    end: lspPosition(document, specifier.end),
                  },
                },
                "dependent",
              );
            }
          }
        }
        access.releaseSyntax(document);
      }
    },
    access.signal,
  );
  await project.recheck();
  result.filesRead = access.filesRead;
  result.bytesRead = access.bytesRead;
  result.items = rankEvidence(
    [
      ...new Map(
        result.items.map((item) => [
          `${item.path}:${String(item.range?.start)}:${String(item.range?.end)}`,
          item,
        ]),
      ).values(),
    ],
    () => 0,
  );
  result.reasons = [...new Set(result.reasons)];
  result.coverage = {
    ...result.coverage,
    compilerBindings: result.partial ? "partial" : "complete",
  };
  return result;
}

export function navigateSemantics(input: SignalGrepInput, access: SourceAccess) {
  return semanticRequestQueue.run(() => runSemanticNavigation(input, access), access.signal);
}
