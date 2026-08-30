import type {
  InspectBatchItemDetails,
  SearchMode,
  SignalGrepDetails,
  StructureStatus,
} from "../types.js";

export interface SummaryRow {
  path: string;
  matches: number;
}

interface PresentationBase {
  details: SignalGrepDetails;
  text: string;
}

interface EmptyPresentation extends PresentationBase {
  kind: "empty";
}

export interface SummaryPresentation extends PresentationBase {
  kind: "summary";
  rows: SummaryRow[];
  previews: string[];
}

export interface InspectBatchPresentation extends PresentationBase {
  kind: "inspect-batch";
  items: InspectBatchItemDetails[];
}

export interface MatchesPresentation extends PresentationBase {
  kind: "matches";
  bodyLines: string[];
  firstMatch?: number;
  lastMatch?: number;
}

export interface InspectPresentation extends PresentationBase {
  kind: "inspect";
  target: string;
  descriptor?: string;
  sourceLines: string[];
  status: StructureStatus;
}

export type SignalGrepPresentation =
  | EmptyPresentation
  | SummaryPresentation
  | MatchesPresentation
  | InspectPresentation
  | InspectBatchPresentation;

const STRUCTURE_STATUSES = new Set<StructureStatus>([
  "available",
  "no-symbol",
  "provider-unavailable",
  "source-unavailable",
  "parse-error",
  "file-too-large",
  "source-changed",
]);
const SEARCH_MODES = new Set<SearchMode>(["auto", "summary", "matches", "inspect"]);

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasRecognizableDetails(
  details: SignalGrepDetails | undefined,
): details is SignalGrepDetails {
  if (!details || details.version !== 1) return false;
  if (!SEARCH_MODES.has(details.mode)) return false;
  if (details.status !== "complete" && details.status !== "partial") return false;
  const counts = [
    details.totalMatches,
    details.storedMatches,
    details.totalFiles,
    details.returnedMatches,
  ];
  if (counts.some((value) => !isNonNegativeSafeInteger(value))) return false;
  if (details.storedMatches > details.totalMatches) return false;
  if (details.snapshotComplete !== (details.status === "complete")) return false;
  return !details.snapshotComplete || details.storedMatches === details.totalMatches;
}

function parseSummaryRows(text: string, expectedRows: number): SummaryRow[] | undefined {
  if (!isNonNegativeSafeInteger(expectedRows)) return undefined;
  if (expectedRows === 0) return undefined;

  const lines = text.split("\n");
  const rangeIndex = lines.findIndex((line) =>
    /^Files \d+-\d+ of \d+, ordered by match count\.$/.test(line),
  );
  if (rangeIndex < 0 || lines[rangeIndex + 1] !== "") return undefined;

  const rows: SummaryRow[] = [];
  for (const line of lines.slice(rangeIndex + 2, rangeIndex + 2 + expectedRows)) {
    const match = /^(\S(?:.*\S)?) {2,}(\d+)$/.exec(line);
    if (!match) return undefined;
    const path = match[1];
    const countText = match[2];
    if (!path || !countText) return undefined;
    const count = Number(countText);
    if (!Number.isSafeInteger(count) || count < 1) return undefined;
    rows.push({ path, matches: count });
  }
  return rows.length === expectedRows ? rows : undefined;
}

function splitMatchBody(text: string): string[] | undefined {
  const markers = [
    "\n\n[Match columns ",
    "\n\n[Context omitted ",
    "\n\n[Context unavailable ",
    "\n\n[Matches ",
  ];
  let bodyEnd = text.length;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    if (index >= 0) bodyEnd = Math.min(bodyEnd, index);
  }
  const body = text.slice(0, bodyEnd);
  if (body.length === 0 || !text.includes("\n\n[Matches ")) return undefined;
  return body.split("\n");
}

function parseMatchRange(text: string): Pick<MatchesPresentation, "firstMatch" | "lastMatch"> {
  const match = /\[Matches (\d+)-(\d+) of \d+/.exec(text);
  if (!match) return {};
  const firstMatch = Number(match[1]);
  const lastMatch = Number(match[2]);
  if (
    !Number.isSafeInteger(firstMatch) ||
    !Number.isSafeInteger(lastMatch) ||
    firstMatch < 1 ||
    lastMatch < firstMatch
  ) {
    return {};
  }
  return { firstMatch, lastMatch };
}

function parseInspect(text: string, details: SignalGrepDetails): InspectPresentation | undefined {
  const structure = details.structure;
  if (!structure || !STRUCTURE_STATUSES.has(structure.status)) return undefined;

  const lines = text.split("\n");
  const target = lines[0];
  if (!target) return undefined;
  if (
    structure.status === "source-changed" ||
    structure.status === "file-too-large" ||
    structure.status === "source-unavailable"
  ) {
    return {
      kind: "inspect",
      details,
      text,
      target,
      sourceLines: [],
      status: structure.status,
    };
  }

  const descriptor = lines[1] || undefined;
  const structureMarker = text.lastIndexOf("\n\n[structure: ");
  if (!descriptor || structureMarker < 0) return undefined;
  const sourceStart = text.indexOf("\n\n", target.length + 1);
  if (sourceStart < 0 || sourceStart >= structureMarker) return undefined;
  const sourceLines = text.slice(sourceStart + 2, structureMarker).split("\n");

  return {
    kind: "inspect",
    details,
    text,
    target,
    descriptor,
    sourceLines,
    status: structure.status,
  };
}

export function recognizeSignalGrepResult(
  text: string,
  details: SignalGrepDetails | undefined,
): SignalGrepPresentation | undefined {
  if (!hasRecognizableDetails(details)) return undefined;

  if (details.mode === "inspect") {
    if (details.inspections) {
      if (
        details.inspections.length === 0 ||
        details.inspections.some(
          (item) =>
            !Number.isSafeInteger(item.inputIndex) ||
            item.inputIndex < 1 ||
            !["returned", "deferred", "error"].includes(item.status),
        )
      )
        return undefined;
      return { kind: "inspect-batch", details, text, items: details.inspections };
    }
    return parseInspect(text, details);
  }

  if (details.totalMatches === 0) {
    return { kind: "empty", details, text };
  }

  if (details.summaryFilesShown !== undefined) {
    const rows = parseSummaryRows(text, details.summaryFilesShown);
    if (!rows) return undefined;
    const lines = text.split("\n");
    const sampleHeading = lines.findIndex((line) =>
      line.startsWith("Samples: first retained match"),
    );
    const sampleCount = details.summaryPreviewsShown ?? 0;
    const previews =
      sampleHeading >= 0 && isNonNegativeSafeInteger(sampleCount)
        ? lines.slice(sampleHeading + 1, sampleHeading + 1 + sampleCount)
        : [];
    return { kind: "summary", details, text, rows, previews };
  }

  if (details.returnedMatches > 0) {
    const bodyLines = splitMatchBody(text);
    if (!bodyLines) return undefined;
    return {
      kind: "matches",
      details,
      text,
      bodyLines,
      ...parseMatchRange(text),
    };
  }

  return undefined;
}
