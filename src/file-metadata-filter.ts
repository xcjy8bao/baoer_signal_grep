import { resolve } from "node:path";
import { abortError } from "./errors.js";
import { getSourceRevision, matchesModificationTime } from "./source.js";
import { MAX_SOURCE_REVISION_CONCURRENCY, type SourceRevision } from "./types.js";

export interface ModificationTimeFilterResult {
  paths: string[];
  partial: boolean;
  reasons: string[];
}

/** Apply a worktree mtime filter to an already enumerated path set with bounded metadata reads. */
export async function filterPathsByModificationTime(
  cwd: string,
  paths: readonly string[],
  modifiedAfterMs?: number,
  modifiedBeforeMs?: number,
  signal?: AbortSignal,
): Promise<ModificationTimeFilterResult> {
  if (modifiedAfterMs === undefined && modifiedBeforeMs === undefined)
    return { paths: [...paths], partial: false, reasons: [] };

  const retained: string[] = [];
  const reasons = new Set<string>();
  for (let offset = 0; offset < paths.length; offset += MAX_SOURCE_REVISION_CONCURRENCY) {
    if (signal?.aborted) throw abortError();
    const batch = paths.slice(offset, offset + MAX_SOURCE_REVISION_CONCURRENCY);
    // oxlint-disable-next-line no-await-in-loop -- batches keep filesystem metadata concurrency and memory bounded.
    const revisions = await Promise.all(
      batch.map(async (path): Promise<{ path: string; revision?: SourceRevision }> => {
        const revision = await getSourceRevision(resolve(cwd, path));
        return revision ? { path, revision } : { path };
      }),
    );
    for (const { path, revision } of revisions) {
      if (!revision) {
        reasons.add(
          `Modification time unavailable for ${path}; it was excluded from the filtered set`,
        );
        continue;
      }
      if (matchesModificationTime(revision, modifiedAfterMs, modifiedBeforeMs)) retained.push(path);
    }
  }
  return { paths: retained, partial: reasons.size > 0, reasons: [...reasons] };
}
