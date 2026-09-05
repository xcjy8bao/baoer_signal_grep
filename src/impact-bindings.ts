import { sourceEvidence } from "./analysis-evidence.js";
import { semanticSources, semanticUri } from "./semantic-sources.js";
import { resolve } from "node:path";
import type { AnalysisItem } from "./analysis-types.js";
import type { EvidenceCandidateFile } from "./evidence-candidates.js";
import type { ImpactTarget } from "./impact-target.js";
import type { SourceAccess } from "./source-access.js";
import { byteRange, locations, lspPosition } from "./semantic-protocol.js";
import { withTypeScript } from "./typescript-client.js";
import { syntaxLanguage } from "./syntax.js";
import { SignalGrepError } from "./errors.js";

/** Compiler annotation of the exact-candidate investigation, not an exhaustive workspace reference query. */
export async function bindImpactCandidates(
  target: ImpactTarget,
  files: readonly EvidenceCandidateFile[],
  occurrences: AnalysisItem[],
  access: SourceAccess,
): Promise<{ items: AnalysisItem[]; bound: number }> {
  const syntax = await access.syntax(target.document);
  const name = syntax.nodes.find(
    (node) =>
      node.start >= target.symbol.start &&
      node.end <= target.symbol.end &&
      target.document.text.slice(node.start, node.end) === target.symbol.name &&
      node.kind.endsWith("identifier"),
  );
  if (!name) throw new SignalGrepError("Impact compiler target has no exact identifier position");
  const documents = new Map(
    files
      .filter(
        (file) =>
          file.document.utf8 &&
          ["javascript", "typescript", "tsx"].includes(syntaxLanguage(file.document.path) ?? ""),
      )
      .map((file) => [resolve(access.cwd, file.document.path), file.document]),
  );
  documents.set(resolve(access.cwd, target.document.path), target.document);
  const sourceAt = await semanticSources(access.cwd, documents.values());
  const references = await withTypeScript(
    access.cwd,
    [...documents.values()],
    async (channel) =>
      locations(
        await channel.request("textDocument/references", {
          textDocument: { uri: await semanticUri(access.cwd, target.document.path) },
          position: lspPosition(target.document, name.start),
          context: { includeDeclaration: true },
        }),
      ),
    access.signal,
  );
  const retained = new Map(
    occurrences.map((item) => [
      `${resolve(access.cwd, item.path)}:${String(item.range?.start)}:${String(item.range?.end)}`,
      item,
    ]),
  );
  let bound = 0;
  for (const reference of references) {
    // oxlint-disable-next-line no-await-in-loop -- compiler package paths may use canonical workspace aliases.
    const document = await sourceAt(reference.path);
    if (!document) continue;
    const range = byteRange(document, reference.range);
    const key = `${resolve(access.cwd, document.path)}:${String(range.start)}:${String(range.end)}`;
    const existing = retained.get(key);
    const line = document.lineAt(range.start);
    const evidence = sourceEvidence(document, range);
    const item = existing ?? {
      path: document.path,
      line,
      source: document.reference,
      range,
      excerpt: evidence.excerpt,
    };
    retained.set(key, {
      ...item,
      label: "Compiler-bound impact reference (static; runtime dispatch unproven)",
      details: {
        ...existing?.details,
        excerptRange: evidence.excerptRange,
        excerptTruncated: evidence.excerptTruncated,
        kind: existing ? "impact-occurrence" : "impact-reference",
        binding: "typescript-compiler",
        bindingScope: "verified-candidate-documents",
        certainty: "static",
        score: 100,
        rankingReason: "compiler reference to the selected symbol",
      },
    });
    bound += 1;
  }
  // didOpen pinned all returned source bytes; reject edits before publishing annotations.
  for (const document of documents.values()) {
    // oxlint-disable-next-line no-await-in-loop -- verify each installed source version, retaining no duplicate document cache.
    await access.refresh(document.path, document.reference);
  }
  return { items: [...retained.values()], bound };
}
