export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_SUMMARY_FILE_LIMIT = 30;
export const MAX_STORED_MATCHES = 50_000;
export const MAX_LINE_CHARACTERS = 500;
export const MAX_RESULT_BYTES = 16 * 1024;
export const MAX_CONTEXT_LINES = 20;

export type SearchMode = "auto" | "summary" | "matches";

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
}

export interface SearchScan {
  request: SearchRequest;
  matches: MatchRecord[];
  totalMatches: number;
  fileCounts: Map<string, number>;
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
  summaryFilesOmitted?: number;
  lineContentTruncated?: number;
  contextOmittedFiles?: string[];
}

export interface SignalGrepResult {
  text: string;
  details: SignalGrepDetails;
}
