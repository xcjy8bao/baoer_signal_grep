import type { ByteRange, SourceReference } from "./source-document.js";
import type { SignalGrepInput } from "./service.js";
import type { SearchScopeDetails } from "./types.js";

export type CoverageStatus = "complete" | "partial" | "skipped" | "not-applicable";

export interface AnalysisItem {
  path: string;
  line: number;
  label: string;
  excerpt?: string;
  source?: SourceReference;
  range?: ByteRange;
  details?: Record<string, unknown>;
}

export interface AnalysisDetails {
  kind:
    | "concept"
    | "structure"
    | "definitions"
    | "references"
    | "implementations"
    | "callers"
    | "callees"
    | "dependencies"
    | "dependents"
    | "files"
    | "roles"
    | "file-and"
    | "function-and"
    | "changes"
    | "outline"
    | "imports"
    | "tests"
    | "any-of"
    | "impact";
  unit:
    | "occurrences"
    | "files"
    | "functions"
    | "symbols"
    | "relationships"
    | "test-candidates"
    | "evidence-items"
    | "impact-candidates";
  totalItems: number;
  returnedItems: number;
  items: (AnalysisItem & { index: number; inspect?: SignalGrepInput })[];
  reasons: string[];
  filesRead?: number;
  bytesRead?: number;
  counts?: Record<string, number>;
  termCounts?: { term: string; retainedOccurrences: number }[];
  termCountsOffset?: number;
  totalTerms?: number;
  termCountsNextRequest?: SignalGrepInput;
  changes?: { base: string; target: string; scope: string; side: string };
  scope?: SearchScopeDetails;
  chunks?: {
    chunked: boolean;
    count: number;
    maxTermsPerChunk: number;
    execution: "single" | "bounded-parallel";
  };
  coverage?: Record<string, CoverageStatus>;
  stats?: {
    inferencePeakRssBytes?: number;
    passagesRanked?: number;
    elapsedMs?: number;
    filesEnumerated?: number;
    filesParsed?: number;
    filesSkipped?: number;
    cacheHits?: number;
    parseMs?: number;
    budgetExhausted?: boolean;
  };
}

export interface AnalysisResultSet {
  kind: AnalysisDetails["kind"];
  unit: AnalysisDetails["unit"];
  items: AnalysisItem[];
  partial: boolean;
  reasons: string[];
  filesRead?: number;
  bytesRead?: number;
  counts?: Record<string, number>;
  termCounts?: { term: string; retainedOccurrences: number }[];
  changes?: AnalysisDetails["changes"];
  scope?: SearchScopeDetails;
  chunks?: AnalysisDetails["chunks"];
  coverage?: Record<string, CoverageStatus>;
  stats?: AnalysisDetails["stats"];
  redact?: boolean;
}
