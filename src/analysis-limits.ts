/** Shared limits for source analysis, independent of retained grep matches. */
export const MAX_STRUCTURE_FILES = 200;
export const MAX_STRUCTURE_BYTES = 32 * 1024 * 1024;
export const MAX_GIT_DIFF_WORK = 2_000_000;
export const MAX_SYNTAX_NODES = 100_000;
export const MAX_PARSE_TIME_MS = 5_000;
export const MAX_ANALYSIS_RESULTS = 50_000;
export const MAX_ANALYSIS_SNAPSHOTS = 20;
export const MAX_ANALYSIS_STORAGE_BYTES = 32 * 1024 * 1024;
export const ANALYSIS_TTL_MS = 10 * 60 * 1000;
export const MAX_SOURCE_CONTINUATIONS = 20;
export const MAX_SOURCE_CONTINUATION_BYTES = 1024 * 1024;
export const MAX_IMPORT_HOPS = 8;
export const MAX_IMPORT_FILES = 20;
