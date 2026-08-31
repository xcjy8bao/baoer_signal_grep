import { abortError } from "./errors.js";
import { excerptText } from "./excerpt.js";
import { readWorkspaceDocument } from "./source-document.js";
import { sameSourceRevision } from "./source.js";
import { MAX_SOURCE_FILE_BYTES, type SearchSnapshot } from "./types.js";

/** At most five reads, two disjoint windows/file, seven lines/window. */
export async function summarySourcePreviews(
  snapshot: SearchSnapshot,
  paths: string[],
  maxBytes: number,
  cwd: string,
  signal?: AbortSignal,
) {
  const rows: string[] = [];
  const indices: number[] = [];
  let bytes = 0;
  let filesRead = 0;
  let windows = 0;
  const reasons: string[] = [];
  for (const path of paths) {
    if (filesRead >= 5 || maxBytes - bytes < 256) break;
    const matches = snapshot.matches.flatMap((match, index) =>
      match.displayPath === path ? [{ match, index }] : [],
    );
    const first = matches[0];
    if (!first) continue;
    const revision = snapshot.sourceRevisions.get(first.match.absolutePath);
    if (!revision || revision.size > MAX_SOURCE_FILE_BYTES) {
      reasons.push(`${path}: preview source unverified or over 5 MiB`);
      continue;
    }
    filesRead += 1;
    try {
      // oxlint-disable-next-line no-await-in-loop -- prior rendered windows determine whether later source reads fit the shared preview budget.
      const document = await readWorkspaceDocument(path, cwd, signal);
      if (
        document.reference.origin.kind !== "worktree" ||
        !sameSourceRevision(revision, document.reference.origin.revision) ||
        !document.utf8
      ) {
        reasons.push(`${path}: preview source changed or is not lossless UTF-8`);
        continue;
      }
      let lastEnd = 0;
      let perFile = 0;
      for (const { match, index } of matches) {
        if (perFile >= 2) break;
        const start = Math.max(1, match.lineNumber - 3);
        const end = Math.min(document.lineStarts.length, start + 6);
        if (start <= lastEnd) continue;
        const lineRows: string[] = [];
        for (let line = start; line <= end; line += 1) {
          const value = document.slice(document.lineRange(line)).replace(/\n$/, "");
          const excerpt = excerptText(value);
          lineRows.push(
            `${line}: ${excerpt.text}${excerpt.truncated ? " [preview line truncated]" : ""}`,
          );
        }
        const row = `${path}:${match.lineNumber} {match #${index + 1}} [source preview lines ${start}-${end}]\n${lineRows.join("\n")}`;
        if (bytes + Buffer.byteLength(row) + 2 > maxBytes) continue;
        rows.push(row);
        indices.push(index + 1);
        bytes += Buffer.byteLength(row) + 2;
        windows += 1;
        perFile += 1;
        lastEnd = end;
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError"))
        throw abortError();
      if (!(error instanceof Error) || !("code" in error || error.name === "SourceDocumentError"))
        throw error;
      reasons.push(`${path}: preview unavailable`);
    }
  }
  return { text: rows.join("\n\n"), indices, windows, filesRead, reasons };
}
