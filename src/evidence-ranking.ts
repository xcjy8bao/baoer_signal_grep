import type { AnalysisItem } from "./analysis-types.js";

/** Preserve evidence tiers; within a tier surface one location per file before repeating a file. */
export function rankEvidence(
  items: readonly AnalysisItem[],
  priority: (item: AnalysisItem) => number,
): AnalysisItem[] {
  const tiers = new Map<number, Map<string, AnalysisItem[]>>();
  const ordered = items.toSorted(
    (a, b) =>
      priority(a) - priority(b) ||
      a.path.localeCompare(b.path) ||
      a.line - b.line ||
      (a.range?.start ?? 0) - (b.range?.start ?? 0),
  );
  for (const item of ordered) {
    const score = priority(item);
    let files = tiers.get(score);
    if (!files) {
      files = new Map();
      tiers.set(score, files);
    }
    let entries = files.get(item.path);
    if (!entries) {
      entries = [];
      files.set(item.path, entries);
    }
    entries.push(item);
  }
  const result: AnalysisItem[] = [];
  for (const files of tiers.values()) {
    const groups = [...files.values()];
    const depth = Math.max(0, ...groups.map((group) => group.length));
    for (let index = 0; index < depth; index += 1)
      for (const group of groups) {
        const item = group[index];
        if (item)
          result.push({
            ...item,
            details: {
              ...item.details,
              rankingOrder: "evidence tier, then round-robin files, then source position",
            },
          });
      }
  }
  return result;
}
