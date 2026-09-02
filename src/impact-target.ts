import type { AnalysisItem } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import type { SourceDocument } from "./source-document.js";
import type { SyntaxAnalysis, SyntaxNode, SyntaxSymbol } from "./syntax.js";

export interface ImpactTarget {
  document: SourceDocument;
  symbol: SyntaxSymbol;
  item: AnalysisItem;
}

function lineBounds(
  document: SourceDocument,
  symbol: SyntaxSymbol,
): { start: number; end: number } {
  const start = document.lineAt(document.toByteOffset(symbol.start));
  const byteEnd = document.toByteOffset(symbol.end);
  const end = document.lineAt(Math.max(document.toByteOffset(symbol.start), byteEnd - 1));
  return { start, end };
}

function stableName(name: string): boolean {
  return name !== "default" && !name.startsWith("<anonymous");
}

const OVERLOAD_OWNERS = new Set([
  "program",
  "statement_block",
  "class_body",
  "interface_body",
  "object",
]);

function overloadOwner(syntax: SyntaxAnalysis, symbol: SyntaxSymbol): number | undefined {
  let current: number | null = symbol.node;
  while (current !== null) {
    const node: SyntaxNode | undefined = syntax.nodes[current];
    if (!node) return undefined;
    if (OVERLOAD_OWNERS.has(node.kind)) return current;
    current = node.parent;
  }
  return undefined;
}

function isOverloadSignature(implementation: SyntaxSymbol, candidate: SyntaxSymbol): boolean {
  if (candidate.hasBody) return false;
  if (
    implementation.kind === "function_declaration" ||
    implementation.kind === "generator_function_declaration"
  )
    return candidate.kind === "function_signature";
  if (implementation.kind === "method_definition" || implementation.kind === "method_declaration")
    return candidate.kind === "method_signature";
  return false;
}

export function selectImpactTarget(
  document: SourceDocument,
  syntax: SyntaxAnalysis,
  input: { line?: number; symbol?: string },
): ImpactTarget {
  if (input.line !== undefined && (!Number.isSafeInteger(input.line) || input.line < 1))
    throw new SignalGrepError("Impact target line must be a positive integer");
  if (input.symbol !== undefined && !input.symbol.trim())
    throw new SignalGrepError("Impact target symbol must be nonempty");
  if (
    syntax.status !== "ok" ||
    (syntax.language !== "javascript" &&
      syntax.language !== "typescript" &&
      syntax.language !== "tsx")
  )
    throw new SignalGrepError(
      `Impact requires reliable JS/TS/TSX syntax (${syntax.language ?? "unsupported"}: ${syntax.status})`,
    );

  const candidates = syntax.symbols.filter((candidate) => {
    if (input.symbol !== undefined && candidate.name !== input.symbol) return false;
    if (input.line === undefined) return true;
    const bounds = lineBounds(document, candidate);
    return bounds.start <= input.line && input.line <= bounds.end;
  });
  let selected: SyntaxSymbol | undefined;
  if (input.line !== undefined) {
    const ordered = candidates.toSorted(
      (left, right) =>
        left.end - left.start - (right.end - right.start) || left.start - right.start,
    );
    selected = ordered[0];
    if (
      selected &&
      ordered[1] &&
      ordered[1].end - ordered[1].start === selected.end - selected.start
    )
      throw new SignalGrepError("Impact target is ambiguous at this line; include a unique symbol");
  } else if (candidates.length === 1) {
    selected = candidates[0];
  } else if (candidates.length > 1) {
    const implemented = candidates.filter((candidate) => candidate.hasBody);
    const implementation = implemented[0];
    const owner = implementation ? overloadOwner(syntax, implementation) : undefined;
    if (
      implemented.length === 1 &&
      implementation &&
      owner !== undefined &&
      candidates.every(
        (candidate) =>
          candidate === implementation ||
          (isOverloadSignature(implementation, candidate) &&
            overloadOwner(syntax, candidate) === owner),
      )
    )
      selected = implementation;
  }
  if (!selected)
    throw new SignalGrepError(
      candidates.length > 1
        ? "Impact target symbol is ambiguous; include its source line"
        : "Impact target does not identify a source symbol",
    );
  if (!stableName(selected.name))
    throw new SignalGrepError("Impact target has no stable source binding name");

  const range = {
    start: document.toByteOffset(selected.start),
    end: document.toByteOffset(selected.end),
  };
  const signatureEnd = selected.bodyStart ?? selected.end;
  const signature = document.text.slice(
    selected.start,
    Math.min(signatureEnd, selected.start + 600),
  );
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
        signatureTruncated: signatureEnd - selected.start > 600,
      },
    },
  };
}
