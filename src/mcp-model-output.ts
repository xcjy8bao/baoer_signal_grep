import type { AnalysisDetails } from "./analysis-types.js";
import type { SignalGrepDetails, SignalGrepResult } from "./types.js";

function compactMetadata(details: SignalGrepDetails, analysis: AnalysisDetails): string[] {
  return [
    analysis.counts ? `Counts: ${JSON.stringify(analysis.counts)}` : undefined,
    analysis.termCounts ? `Term counts: ${JSON.stringify(analysis.termCounts)}` : undefined,
    analysis.termCountsNextRequest
      ? `More term counts: ${JSON.stringify(analysis.termCountsNextRequest)}`
      : undefined,
    analysis.matchesRequest
      ? `Matches request: ${JSON.stringify(analysis.matchesRequest)}`
      : undefined,
    analysis.changes ? `Changes: ${JSON.stringify(analysis.changes)}` : undefined,
    analysis.scope ? `Scope: ${JSON.stringify(analysis.scope)}` : undefined,
    analysis.chunks ? `Chunks: ${JSON.stringify(analysis.chunks)}` : undefined,
    analysis.coverage ? `Coverage: ${JSON.stringify(analysis.coverage)}` : undefined,
    analysis.stats ? `Stats: ${JSON.stringify(analysis.stats)}` : undefined,
    analysis.kind === "outline"
      ? "[Outline signatures are deferred; inspect item #N for version-checked source.]"
      : undefined,
    ...analysis.reasons.map((reason) => `[${reason}]`),
    details.redactionApplied ? "[Display redaction applied.]" : undefined,
  ].filter((line): line is string => line !== undefined);
}

function compactRows(analysis: AnalysisDetails): string[] {
  const omitExcerpt = analysis.kind === "outline";
  const rows: string[] = [];
  let previousPath: string | undefined;
  for (const item of analysis.items) {
    if (item.path !== previousPath) {
      rows.push(JSON.stringify(item.path));
      previousPath = item.path;
    }
    const row = `#${String(item.index)} L${String(item.line)} ${item.label}`;
    rows.push(
      omitExcerpt || !item.excerpt ? row : `${row}\n  ${item.excerpt.replaceAll("\n", "\n  ")}`,
    );
  }
  return rows;
}

function compactInspectInstruction(analysis: AnalysisDetails): string | undefined {
  if (analysis.inspectCursor)
    return `Inspect item #N: mode="inspect", cursor=${JSON.stringify(analysis.inspectCursor)}, matchIndex=N.`;
  const inspect = analysis.items.find((item) => item.inspect !== undefined)?.inspect;
  if (!inspect || typeof inspect.cursor !== "string") return undefined;
  return `Inspect item #N: mode="inspect", cursor=${JSON.stringify(inspect.cursor)}, matchIndex=N${inspect.redact ? ", redact=true" : ""}.`;
}

function compactHeader(details: SignalGrepDetails, analysis: AnalysisDetails): string {
  if (
    analysis.termCounts &&
    analysis.termCountsOffset !== undefined &&
    analysis.totalTerms !== undefined
  ) {
    const start = analysis.termCountsOffset + 1;
    const end = analysis.termCountsOffset + analysis.termCounts.length;
    return `${analysis.kind} term inventory ${String(start)}–${String(end)} of ${String(analysis.totalTerms)} (${details.status}).`;
  }
  const first = analysis.items[0]?.index;
  const last = analysis.items.at(-1)?.index;
  const shown =
    first === undefined || last === undefined
      ? "showing none"
      : `showing #${String(first)}–#${String(last)}`;
  return `${analysis.kind}: ${String(analysis.totalItems)} retained ${analysis.unit} (${details.status}); ${shown}.`;
}

function distinctNextRequest(
  details: SignalGrepDetails,
  analysis: AnalysisDetails,
): string | undefined {
  if (!details.nextRequest) return undefined;
  const serialized = JSON.stringify(details.nextRequest);
  return serialized === JSON.stringify(analysis.termCountsNextRequest) ||
    serialized === JSON.stringify(analysis.matchesRequest)
    ? undefined
    : serialized;
}

export function compactMcpModelText(result: SignalGrepResult): string {
  const analysis = result.details.analysis;
  if (!analysis) return result.text;
  const header = compactHeader(result.details, analysis);
  const inspect = compactInspectInstruction(analysis);
  const nextRequest = distinctNextRequest(result.details, analysis);
  const compact = [
    header,
    ...compactMetadata(result.details, analysis),
    ...compactRows(analysis),
    ...(inspect ? [inspect] : []),
    ...(nextRequest ? [`Next request: ${nextRequest}`] : []),
  ].join("\n");
  const standard = result.text.replace(" Structured output retains per-item evidence details.", "");
  return Buffer.byteLength(compact) < Buffer.byteLength(standard) ? compact : standard;
}
