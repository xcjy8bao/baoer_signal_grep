export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_RESULT_TOKEN_BUDGET = 2_000;
export const CONTEXT_BUDGET_POLICY = {
  fullAboveRemainderPercent: 40,
  criticalBelowRemainderPercent: 12,
  resultTokenBudgets: {
    full: DEFAULT_RESULT_TOKEN_BUDGET,
    tight: 1_000,
    critical: 500,
  },
} as const;
export const ESTIMATED_CHARACTERS_PER_TOKEN = 4;
export const DEFAULT_SUMMARY_FILE_LIMIT = 30;
export const MAX_SELECTED_PATHS = 20;
export const MAX_STORED_MATCHES = 50_000;
export const MAX_LINE_CHARACTERS = 500;
export const MAX_RESULT_BYTES = 16 * 1024;
export const MAX_CONTEXT_LINES = 20;
export const MAX_PROTOCOL_LINE_BYTES = 16 * 1024 * 1024;
export const MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_REVISION_CONCURRENCY = 16;

export type SearchMode = "auto" | "summary" | "matches" | "inspect";

export type ContextBudgetTier = keyof typeof CONTEXT_BUDGET_POLICY.resultTokenBudgets;

export interface ContextBudget {
  tier: ContextBudgetTier;
  contextRemainderPercent: number;
  resultTokenBudget: number;
}

export interface TextPosition {
  line: number;
  character: number;
}

export interface TextRange {
  start: TextPosition;
  end: TextPosition;
  encoding: "utf-8" | "utf-16";
}

export interface MatchOccurrence {
  byteStart: number;
  byteEnd: number;
  range: TextRange;
}

export interface SourceRevision {
  size: number;
  mtimeMs: number;
  inode?: number;
  device?: number;
}

export type StructureStatus =
  | "available"
  | "no-symbol"
  | "provider-unavailable"
  | "source-unavailable"
  | "parse-error"
  | "file-too-large"
  | "source-changed";

export interface SymbolRange {
  startLine: number;
  endLine: number;
}

export interface StructureSymbol {
  name: string;
  kind: string;
  scope: string[];
  range: SymbolRange;
}

export interface StructureDetails {
  status: StructureStatus;
  provider?: string;
  language?: string;
  symbol?: StructureSymbol;
  range?: SymbolRange;
}

export interface SearchRequest {
  pattern: string;
  path?: string;
  glob: string[];
  exclude: string[];
  literal: boolean;
  ignoreCase?: boolean;
  hidden: boolean;
  context: number;
  pageSize: number;
}

export interface MatchRecord {
  absolutePath: string;
  displayPath: string;
  lineNumber: number;
  lineContent: string;
  lineTruncated: boolean;
  occurrences: MatchOccurrence[];
}

export interface SearchScan {
  request: SearchRequest;
  matches: MatchRecord[];
  totalMatches: number;
  fileCounts: Map<string, number>;
  sourceRevisions: Map<string, SourceRevision>;
  snapshotComplete: boolean;
  truncatedLines: number;
}

export interface SearchSnapshot extends SearchScan {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
}

export interface SignalGrepDetails {
  version: 1;
  mode: SearchMode;
  status: "complete" | "partial";
  totalMatches: number;
  storedMatches: number;
  totalFiles: number;
  returnedMatches: number;
  snapshotComplete: boolean;
  cursor?: string;
  summaryFilesShown?: number;
  summaryOffset?: number;
  selectedPaths?: string[];
  selectionMissingPaths?: string[];
  summaryFilesOmitted?: number;
  lineContentTruncated?: number;
  budgetTier?: ContextBudgetTier;
  contextRemainderPercent?: number;
  resultTokenBudget?: number;
  contextOmittedFiles?: string[];
  contextChangedFiles?: string[];
  structure?: StructureDetails;
}

export interface SignalGrepResult {
  text: string;
  details: SignalGrepDetails;
  normalText?: string;
}
