import type { ByteRange, SourceReference } from "./source-document.js";
import type { SignalGrepInput } from "./service.js";

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
  changes?: { base: string; target: string; scope: string; side: string };
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
}
