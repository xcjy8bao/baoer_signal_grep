import { MAX_ANALYSIS_RESULTS } from "./analysis-limits.js";
import { sourceEvidence } from "./analysis-evidence.js";
import type { AnalysisItem } from "./analysis-types.js";
import { SignalGrepError } from "./errors.js";
import type { ByteRange, SourceDocument } from "./source-document.js";
import type { SyntaxAnalysis, SyntaxRole, SyntaxRoleName, SyntaxSymbol } from "./syntax.js";

export interface SyntaxSearchResult {
  items: AnalysisItem[];
  partial: boolean;
  reasons: string[];
}

interface RoleIndex {
  roles: SyntaxRole[];
  widest: number[];
}

function unavailable(
  document: SourceDocument,
  analysis: SyntaxAnalysis,
): SyntaxSearchResult | undefined {
  if (!document.utf8) {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: syntax classification requires lossless UTF-8 source`],
    };
  }
  if (analysis.status !== "ok") {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: syntax ${analysis.status}; this source remains unclassified`],
    };
  }
  return undefined;
}

function byteBoundary(document: SourceDocument, offset: number): boolean {
  const byte = document.bytes[offset];
  return offset === document.bytes.length || (byte !== undefined && (byte & 0xc0) !== 0x80);
}

function buildRoleIndex(
  analysis: SyntaxAnalysis,
  selected: ReadonlySet<SyntaxRoleName>,
): RoleIndex[] {
  const groups = new Map<string, SyntaxRole[]>();
  for (const role of analysis.roles) {
    if (!selected.has(role.role)) continue;
    const key = JSON.stringify([role.role, role.certainty, role.subkind]);
    const group = groups.get(key);
    if (group) group.push(role);
    else groups.set(key, [role]);
  }
  return [...groups.values()].map((roles) => {
    roles.sort((a, b) => a.start - b.start || b.end - a.end);
    const widest: number[] = [];
    let best = 0;
    for (let index = 0; index < roles.length; index++) {
      if ((roles[index]?.end ?? 0) > (roles[best]?.end ?? 0)) best = index;
      widest.push(best);
    }
    return { roles, widest };
  });
}

function roleProofs(indices: readonly RoleIndex[], start: number, end: number): SyntaxRole[] {
  const proofs: SyntaxRole[] = [];
  for (const index of indices) {
    let low = 0,
      high = index.roles.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((index.roles[middle]?.start ?? Infinity) <= start) low = middle + 1;
      else high = middle;
    }
    const widest = index.widest[low - 1];
    const role = widest === undefined ? undefined : index.roles[widest];
    if (role && end <= role.end && start < role.end) proofs.push(role);
  }
  return proofs;
}

/** Role union applies to whole occurrences and never duplicates an occurrence. */
export function filterRoleOccurrences(
  document: SourceDocument,
  analysis: SyntaxAnalysis,
  occurrences: ByteRange[],
  roles: SyntaxRoleName[],
): SyntaxSearchResult {
  const missing = unavailable(document, analysis);
  if (missing) return missing;
  const indices = buildRoleIndex(analysis, new Set(roles));
  const items: AnalysisItem[] = [];
  const reasons: string[] = [];
  const seen = new Set<string>();
  let splitOccurrences = 0;
  for (const range of occurrences) {
    document.checkRange(range);
    const key = `${range.start}:${range.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!byteBoundary(document, range.start) || !byteBoundary(document, range.end)) {
      splitOccurrences++;
      continue;
    }
    const proofs = roleProofs(
      indices,
      document.toCharacterOffset(range.start),
      document.toCharacterOffset(range.end),
    );
    if (proofs.length === 0) continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      reasons.push(
        `${document.path}: role result retention limit reached; additional occurrences are not retained`,
      );
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
          range: { ...range },
        })),
        excerptRange: match.excerptRange,
        excerptTruncated: match.excerptTruncated,
      },
    });
  }
  if (splitOccurrences > 0) {
    reasons.push(
      `${document.path}: ${splitOccurrences} occurrence(s) split UTF-8 characters and could not be classified`,
    );
  }
  return { items, partial: reasons.length > 0, reasons };
}

function merge(ranges: readonly ByteRange[]): ByteRange[] {
  const result: ByteRange[] = [];
  for (const range of ranges.toSorted((a, b) => a.start - b.start || b.end - a.end)) {
    if (range.start === range.end) continue;
    const previous = result.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push({ ...range });
  }
  return result;
}

function intersect(range: ByteRange, sorted: readonly ByteRange[]): ByteRange[] {
  let low = 0,
    high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((sorted[middle]?.end ?? Infinity) <= range.start) low = middle + 1;
    else high = middle;
  }
  const result: ByteRange[] = [];
  for (let index = low; index < sorted.length; index++) {
    const other = sorted[index];
    if (!other || other.start >= range.end) break;
    const start = Math.max(range.start, other.start);
    const end = Math.min(range.end, other.end);
    if (start < end) result.push({ start, end });
  }
  return result;
}

function subtract(range: ByteRange, exclusions: readonly ByteRange[]): ByteRange[] {
  const result: ByteRange[] = [];
  let start = range.start;
  for (const excluded of exclusions) {
    if (excluded.end <= start || excluded.start >= range.end) continue;
    if (excluded.start > start) result.push({ start, end: excluded.start });
    start = Math.max(start, excluded.end);
  }
  if (start < range.end) result.push({ start, end: range.end });
  return result;
}

interface ImplementationRanges {
  symbols: SyntaxSymbol[];
  code: ByteRange[];
  nested: Map<number, ByteRange[]>;
}

function implementationRanges(
  document: SourceDocument,
  analysis: SyntaxAnalysis,
): ImplementationRanges {
  const symbols = analysis.symbols
    .filter((symbol) => symbol.hasBody)
    .toSorted((a, b) => a.start - b.start || b.end - a.end);
  const stack: SyntaxSymbol[] = [];
  const nested = new Map<number, ByteRange[]>();
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
        end: document.toByteOffset(symbol.end),
      });
      nested.set(parent.node, ranges);
    }
    stack.push(symbol);
  }
  const code = merge(
    analysis.roles
      .filter((role) => role.role === "code")
      .map((role) => ({
        start: document.toByteOffset(role.start),
        end: document.toByteOffset(role.end),
      })),
  );
  return { symbols, code, nested };
}

function owned(
  document: SourceDocument,
  context: ImplementationRanges,
  symbol: SyntaxSymbol,
  changed?: readonly ByteRange[],
): ByteRange[] {
  if (!symbol.hasBody || symbol.bodyStart === undefined || symbol.bodyEnd === undefined) return [];
  const body = {
    start: document.toByteOffset(symbol.bodyStart),
    end: document.toByteOffset(symbol.bodyEnd),
  };
  const withoutNested = subtract(body, context.nested.get(symbol.node) ?? []);
  const code = withoutNested.flatMap((range) => intersect(range, context.code));
  return changed ? code.flatMap((range) => intersect(range, changed)) : code;
}

/** Native symbol ranges minus nested implementations and every non-code interval. */
export function ownImplementationRanges(
  document: SourceDocument,
  analysis: SyntaxAnalysis,
  symbol: SyntaxSymbol,
  changedRanges?: ByteRange[],
): ByteRange[] {
  if (unavailable(document, analysis) || analysis.language === "go") return [];
  for (const range of changedRanges ?? []) document.checkRange(range);
  return owned(
    document,
    implementationRanges(document, analysis),
    symbol,
    changedRanges ? merge(changedRanges) : undefined,
  );
}

function termEvidence(document: SourceDocument, ranges: readonly ByteRange[], term: string) {
  const needle = Buffer.from(term);
  if (needle.length === 0)
    throw new Error("Function conjunction expects normalized non-empty terms");
  let count = 0;
  let first: ByteRange | undefined;
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
  return first
    ? {
        term,
        count,
        evidence: sourceEvidence(document, first),
        omittedOccurrenceEvidence: count - 1,
      }
    : undefined;
}

/** Literal AND within each implementation's own code, optionally within changed lines. */
export function findFunctionConjunctions(
  document: SourceDocument,
  analysis: SyntaxAnalysis,
  terms: string[],
  changedRanges?: ByteRange[],
): SyntaxSearchResult {
  const missing = unavailable(document, analysis);
  if (missing) return missing;
  if (
    analysis.language !== "javascript" &&
    analysis.language !== "typescript" &&
    analysis.language !== "tsx"
  ) {
    return {
      items: [],
      partial: true,
      reasons: [`${document.path}: same-function AND supports JS/TS/TSX only`],
    };
  }
  if (terms.length === 0)
    throw new SignalGrepError("Function conjunction requires normalized terms");
  for (const range of changedRanges ?? []) document.checkRange(range);
  const changed = changedRanges ? merge(changedRanges) : undefined;
  const context = implementationRanges(document, analysis);
  const items: AnalysisItem[] = [];
  for (const symbol of context.symbols) {
    const ranges = owned(document, context, symbol, changed);
    const matches = terms.map((term) => termEvidence(document, ranges, term));
    if (matches.some((match) => match === undefined)) continue;
    if (items.length === MAX_ANALYSIS_RESULTS) {
      return {
        items,
        partial: true,
        reasons: [`${document.path}: function result retention limit reached`],
      };
    }
    const range = {
      start: document.toByteOffset(symbol.start),
      end: document.toByteOffset(symbol.end),
    };
    items.push({
      path: document.path,
      line: document.lineAt(range.start),
      source: document.reference,
      range,
      label: symbol.scope ? `${symbol.scope}.${symbol.name}` : symbol.name,
      excerpt: matches.map((match) => match?.evidence.excerpt ?? "").join("\n"),
      details: {
        symbol: {
          name: symbol.name,
          kind: symbol.kind,
          scope: symbol.scope,
          range,
          body:
            symbol.bodyStart !== undefined && symbol.bodyEnd !== undefined
              ? {
                  start: document.toByteOffset(symbol.bodyStart),
                  end: document.toByteOffset(symbol.bodyEnd),
                }
              : undefined,
        },
        terms: matches,
        relation: "same lexical implementation; not proof of a shared execution path or data flow",
        scope: changed ? "implementation-code-intersect-changed-ranges" : "implementation-own-code",
      },
    });
  }
  return { items, partial: false, reasons: [] };
}
