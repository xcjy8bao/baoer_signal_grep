import type { Theme as PiTheme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { SignalGrepLocale } from "../config.js";
import type { SignalGrepInput } from "../service.js";
import type { StructureStatus } from "../types.js";
import type {
  InspectPresentation,
  InspectBatchPresentation,
  MatchesPresentation,
  SignalGrepPresentation,
  SummaryPresentation,
  SummaryRow,
} from "./presentation.js";

export type SignalGrepTheme = Pick<PiTheme, "bold" | "fg">;
type Theme = SignalGrepTheme;

interface TuiCopy {
  budget: string;
  complete: string;
  contextChanged: string;
  contextOmitted: string;
  contextRemaining: string;
  continueSnapshot: string;
  cursorReady: string;
  empty: string;
  error: string;
  expandFullError: string;
  file: string;
  files: string;
  finalPage: string;
  inspect: string;
  inspectBlocked: string;
  matches: string;
  matchesTitle: string;
  moreFiles: string;
  moreLines: string;
  noSymbol: string;
  originalOnExpand: string;
  partial: string;
  partialMatchesTitle: string;
  partialSummaryTitle: string;
  partialEvidence: string;
  paths: string;
  retained: string;
  retainedMatch: string;
  returned: string;
  searching: string;
  selected: string;
  selectedNoMatches: string;
  sourceChanged: string;
  sourceTooLarge: string;
  structure: string;
  structureStatuses: Record<StructureStatus, string>;
  summary: string;
  samples: string;
  locations: string;
  deferred: string;
  failed: string;
}

const COPY = {
  en: {
    budget: "budget",
    complete: "complete",
    contextChanged: "changed context omitted",
    contextOmitted: "context unavailable",
    contextRemaining: "context remaining",
    continueSnapshot: "continue snapshot",
    cursorReady: "cursor ready",
    empty: "No matching lines were found.",
    error: "ERROR",
    expandFullError: "expand for full error",
    file: "file",
    files: "files",
    finalPage: "final page",
    inspect: "INSPECT",
    inspectBlocked: "Current source was not mixed with retained evidence.",
    matches: "matches",
    matchesTitle: "MATCHES",
    moreFiles: "more files",
    moreLines: "more lines",
    noSymbol: "no enclosing symbol",
    originalOnExpand: "expand for original result",
    partial: "partial",
    partialMatchesTitle: "PARTIAL MATCHES",
    partialSummaryTitle: "PARTIAL SEARCH",
    partialEvidence: "retained evidence only; narrow the search before treating it as complete",
    paths: "paths",
    retained: "retained",
    retainedMatch: "retained match",
    returned: "returned",
    searching: "Searching…",
    selected: "selected",
    selectedNoMatches: "selected paths had no retained matches",
    sourceChanged: "SOURCE CHANGED",
    sourceTooLarge: "SOURCE TOO LARGE",
    structure: "structure",
    structureStatuses: {
      available: "available",
      "file-too-large": "file too large",
      "no-symbol": "no symbol",
      "parse-error": "parse error",
      "provider-unavailable": "provider unavailable",
      "source-changed": "source changed",
      "source-unavailable": "source unavailable",
    },
    summary: "SUMMARY",
    samples: "match samples",
    locations: "locations",
    deferred: "deferred",
    failed: "failed",
  },
  "zh-CN": {
    budget: "预算",
    complete: "完整",
    contextChanged: "已省略变化后的上下文",
    contextOmitted: "上下文不可用",
    contextRemaining: "上下文剩余",
    continueSnapshot: "继续快照",
    cursorReady: "可继续翻页",
    empty: "没有找到匹配行。",
    error: "错误",
    expandFullError: "展开查看完整错误",
    file: "个文件",
    files: "个文件",
    finalPage: "最后一页",
    inspect: "源码检查",
    inspectBlocked: "未将当前源码与快照证据混合展示。",
    matches: "处匹配",
    matchesTitle: "匹配结果",
    moreFiles: "个其他文件",
    moreLines: "行其余内容",
    noSymbol: "未找到所属符号",
    originalOnExpand: "展开查看原始结果",
    partial: "部分",
    partialMatchesTitle: "部分保留匹配",
    partialSummaryTitle: "部分保留搜索",
    partialEvidence: "仅包含已保留证据；请缩小搜索范围后再作完整性判断",
    paths: "个路径",
    retained: "已保留",
    retainedMatch: "保留匹配",
    returned: "本页返回",
    searching: "正在搜索…",
    selected: "已选择",
    selectedNoMatches: "个所选路径没有保留匹配",
    sourceChanged: "源码已变化",
    sourceTooLarge: "源码过大",
    structure: "结构",
    structureStatuses: {
      available: "可用",
      "file-too-large": "文件过大",
      "no-symbol": "未找到符号",
      "parse-error": "解析失败",
      "provider-unavailable": "结构提供器不可用",
      "source-changed": "源码已变化",
      "source-unavailable": "源码不可用",
    },
    summary: "摘要",
    samples: "命中样本",
    locations: "个位置",
    deferred: "待续查",
    failed: "失败",
  },
} satisfies Record<SignalGrepLocale, TuiCopy>;

function safeLabel(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) ? "\uFFFD" : character;
  }).join("");
}

function quote(value: string): string {
  return JSON.stringify(safeLabel(value));
}

function list(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return (Array.isArray(value) ? value : [value]).map(safeLabel).join(", ");
}

function padVisible(value: string, width: number): string {
  const truncated = truncateToWidth(value, Math.max(1, width));
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function finish(lines: string[], width: number): string[] {
  const available = Math.max(1, width);
  return lines.map((line) => truncateToWidth(line, available));
}

function responsiveLimit(width: number, wide: number, medium: number, narrow: number): number {
  if (width >= 72) return wide;
  if (width >= 44) return medium;
  return narrow;
}

function title(text: string, theme: Theme): string {
  return `${theme.fg("borderMuted", "── ")}${theme.fg("toolTitle", theme.bold(text))}${theme.fg("borderMuted", " ──")}`;
}

function statusWord(presentation: SignalGrepPresentation, copy: TuiCopy, theme: Theme): string {
  return presentation.details.status === "complete"
    ? theme.fg("success", copy.complete)
    : theme.fg("warning", copy.partial);
}

function countLine(
  presentation: SignalGrepPresentation,
  copy: TuiCopy,
  theme: Theme,
  width: number,
): string {
  const { details } = presentation;
  const fileUnit = details.totalFiles === 1 ? copy.file : copy.files;
  const files = `${String(details.totalFiles)} ${fileUnit}`;
  const total = theme.bold(String(details.totalMatches));
  if (width < 44) return `${total} · ${files} · ${statusWord(presentation, copy, theme)}`;
  return `${total} ${copy.matches} · ${files} · ${statusWord(presentation, copy, theme)}`;
}

function partialLines(
  presentation: SignalGrepPresentation,
  copy: TuiCopy,
  theme: Theme,
  width: number,
): string[] {
  if (presentation.details.status !== "partial") return [];
  const retained = `! ${copy.retained} ${String(presentation.details.storedMatches)}/${String(presentation.details.totalMatches)}`;
  const text = width < 44 ? retained : `${retained} · ${copy.partialEvidence}`;
  return [theme.fg("warning", text)];
}

function budgetLine(
  presentation: SignalGrepPresentation,
  copy: TuiCopy,
  theme: Theme,
): string | undefined {
  const { details } = presentation;
  if (!details.budgetTier || details.budgetTier === "full") return undefined;
  let remainder = "";
  if (details.contextRemainderPercent !== undefined) {
    remainder = ` · ${String(details.contextRemainderPercent)}% ${copy.contextRemaining}`;
  }
  return theme.fg("dim", `${copy.budget} ${details.budgetTier}${remainder}`);
}

function summaryRow(row: SummaryRow, maximum: number, width: number, theme: Theme): string {
  if (width < 44) {
    const count = String(row.matches);
    const pathWidth = Math.max(1, width - visibleWidth(count) - 2);
    return `${theme.fg("accent", padVisible(row.path, pathWidth))}  ${theme.fg("muted", count)}`;
  }

  const count = String(row.matches);
  const barWidth = width >= 72 ? 20 : 10;
  const maxPathWidth = width >= 72 ? 32 : 20;
  const pathWidth = Math.max(8, Math.min(maxPathWidth, width - barWidth - count.length - 5));
  const filled = Math.max(1, Math.round((row.matches / maximum) * barWidth));
  const bar = `${"█".repeat(filled)}${"─".repeat(Math.max(0, barWidth - filled))}`;
  return `${theme.fg("accent", padVisible(row.path, pathWidth))} ${theme.fg("success", bar)} ${theme.fg("muted", count)}`;
}

function renderSummary(
  presentation: SummaryPresentation,
  copy: TuiCopy,
  theme: Theme,
  width: number,
): string[] {
  const shownLimit = responsiveLimit(width, 6, 5, 4);
  const visibleRows = presentation.rows.slice(0, shownLimit);
  const maximum = Math.max(...visibleRows.map((row) => row.matches), 1);
  const lines = [
    title(
      presentation.details.status === "partial" ? copy.partialSummaryTitle : copy.summary,
      theme,
    ),
    countLine(presentation, copy, theme, width),
    ...partialLines(presentation, copy, theme, width),
    "",
    ...visibleRows.map((row) => summaryRow(row, maximum, width, theme)),
  ];

  const hiddenRows = presentation.rows.length - visibleRows.length;
  const omitted = presentation.details.summaryFilesOmitted ?? 0;
  if (hiddenRows + omitted > 0) {
    lines.push(theme.fg("dim", `… ${String(hiddenRows + omitted)} ${copy.moreFiles}`));
  }
  if (width >= 44 && presentation.previews.length > 0) {
    lines.push("", theme.fg("dim", copy.samples));
    lines.push(
      ...presentation.previews.slice(0, 2).map((line) => theme.fg("toolOutput", safeLabel(line))),
    );
  }
  const budget = budgetLine(presentation, copy, theme);
  if (budget) lines.push("", budget);
  const pageStatus = presentation.details.cursor ? copy.cursorReady : copy.finalPage;
  const footer =
    width < 44
      ? pageStatus
      : `${copy.summary.toLowerCase()} · ${pageStatus} · ${copy.originalOnExpand}`;
  lines.push(theme.fg("dim", footer));
  return finish(lines, width);
}

function styleEvidenceLine(line: string, theme: Theme): string {
  if (/^ \d+:/.test(line)) return theme.fg("toolOutput", line);
  if (/^ \d+-/.test(line)) return theme.fg("dim", line);
  if (line.length > 0 && !line.startsWith(" ")) return theme.fg("accent", line);
  return theme.fg("toolOutput", line);
}

function renderMatches(
  presentation: MatchesPresentation,
  copy: TuiCopy,
  theme: Theme,
  width: number,
): string[] {
  const lineLimit = responsiveLimit(width, 12, 8, 5);
  const visibleBody = presentation.bodyLines.slice(0, lineLimit);
  const lines = [
    title(
      presentation.details.status === "partial" ? copy.partialMatchesTitle : copy.matchesTitle,
      theme,
    ),
    countLine(presentation, copy, theme, width),
    ...partialLines(presentation, copy, theme, width),
    "",
    ...visibleBody.map((line) => styleEvidenceLine(line, theme)),
  ];

  if (presentation.bodyLines.length > visibleBody.length) {
    lines.push(
      theme.fg(
        "dim",
        `… ${String(presentation.bodyLines.length - visibleBody.length)} ${copy.moreLines}`,
      ),
    );
  }

  let range = `${String(presentation.details.returnedMatches)} ${copy.returned}`;
  if (presentation.firstMatch !== undefined && presentation.lastMatch !== undefined) {
    range = `${String(presentation.firstMatch)}–${String(presentation.lastMatch)}/${String(presentation.details.totalMatches)}`;
  }
  const footer = [range];
  if (presentation.details.selectedPaths) {
    footer.push(
      `${copy.selected} ${String(presentation.details.selectedPaths.length)} ${copy.paths}`,
    );
  }
  footer.push(presentation.details.cursor ? copy.cursorReady : copy.finalPage);
  lines.push("", theme.fg("dim", footer.join(" · ")));

  if (presentation.details.selectionMissingPaths?.length) {
    lines.push(
      theme.fg(
        "warning",
        `! ${String(presentation.details.selectionMissingPaths.length)} ${copy.selectedNoMatches}`,
      ),
    );
  }
  if (presentation.details.contextChangedFiles?.length) {
    lines.push(
      theme.fg(
        "warning",
        `! ${copy.contextChanged}: ${String(presentation.details.contextChangedFiles.length)} ${copy.files}`,
      ),
    );
  }
  if (presentation.details.contextOmittedFiles?.length) {
    lines.push(
      theme.fg(
        "warning",
        `! ${copy.contextOmitted}: ${String(presentation.details.contextOmittedFiles.length)} ${copy.files}`,
      ),
    );
  }
  return finish(lines, width);
}

function inspectHeading(presentation: InspectPresentation, copy: TuiCopy): string {
  if (presentation.status === "source-changed") return copy.sourceChanged;
  if (presentation.status === "file-too-large") return copy.sourceTooLarge;
  if (presentation.status === "source-unavailable")
    return copy.structureStatuses[presentation.status];
  return copy.inspect;
}

function renderInspect(
  presentation: InspectPresentation,
  copy: TuiCopy,
  theme: Theme,
  width: number,
): string[] {
  const blocked =
    presentation.status === "source-changed" ||
    presentation.status === "file-too-large" ||
    presentation.status === "source-unavailable";
  const heading = inspectHeading(presentation, copy);
  const lines = [title(heading, theme), theme.fg("accent", presentation.target)];

  if (blocked) {
    lines.push("", theme.fg("warning", `! ${copy.inspectBlocked}`));
    return finish(lines, width);
  }

  if (presentation.descriptor) {
    lines.push(
      theme.fg(
        presentation.status === "available" ? "success" : "warning",
        presentation.status === "no-symbol" ? copy.noSymbol : presentation.descriptor,
      ),
    );
  }
  const sourceLimit = responsiveLimit(width, 12, 8, 5);
  const visibleSource = presentation.sourceLines.slice(0, sourceLimit);
  lines.push("", ...visibleSource.map((line) => theme.fg("toolOutput", line)));
  if (presentation.sourceLines.length > visibleSource.length) {
    lines.push(
      theme.fg(
        "dim",
        `… ${String(presentation.sourceLines.length - visibleSource.length)} ${copy.moreLines}`,
      ),
    );
  }
  const provider = presentation.details.structure?.provider;
  const providerText = provider ? ` · ${safeLabel(provider)}` : "";
  lines.push(
    "",
    theme.fg(
      "dim",
      `${copy.structure} ${copy.structureStatuses[presentation.status]}${providerText} · ${copy.originalOnExpand}`,
    ),
  );
  return finish(lines, width);
}

interface CallView {
  primary: string;
  secondary: string[];
}

function signalGrepTitle(theme: Theme): string {
  return theme.fg("toolTitle", theme.bold("Signal Grep"));
}

function inspectCall(input: SignalGrepInput, copy: TuiCopy, theme: Theme): CallView {
  if (input.matchIndices || input.targets) {
    const count = input.matchIndices?.length ?? input.targets?.length ?? 0;
    return {
      primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", copy.inspect)} ${String(count)} ${copy.locations}`,
      secondary: [],
    };
  }
  const target =
    input.matchIndex === undefined
      ? `${safeLabel(input.path ?? "?")}:${String(input.line ?? "?")}`
      : `${copy.retainedMatch} #${String(input.matchIndex)}`;
  return {
    primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", copy.inspect)} ${theme.fg("muted", target)}`,
    secondary: [],
  };
}

function renderInspectBatch(
  presentation: InspectBatchPresentation,
  copy: TuiCopy,
  theme: Theme,
  width: number,
): string[] {
  const returned = presentation.items.filter((item) => item.status === "returned").length;
  const deferred = presentation.items.filter((item) => item.status === "deferred").length;
  const failed = presentation.items.filter((item) => item.status === "error").length;
  const lines = [
    title(copy.inspect, theme),
    `${String(presentation.items.length)} ${copy.locations} · ${String(returned)} ${copy.returned}`,
  ];
  for (const item of presentation.items) {
    const target = item.path
      ? `${safeLabel(item.path)}:${String(item.line ?? "?")}`
      : `#${String(item.matchIndex ?? item.inputIndex)}`;
    const label =
      item.status === "returned"
        ? copy.returned
        : item.status === "deferred"
          ? copy.deferred
          : copy.failed;
    lines.push(
      theme.fg(
        item.status === "returned" ? "toolOutput" : "warning",
        `${String(item.inputIndex)}. ${target} · ${label}`,
      ),
    );
  }
  if (deferred || failed)
    lines.push(
      theme.fg(
        "warning",
        `${String(deferred)} ${copy.deferred} · ${String(failed)} ${copy.failed}`,
      ),
    );
  lines.push(theme.fg("dim", copy.originalOnExpand));
  return finish(lines, width);
}

function continuationCall(input: SignalGrepInput, copy: TuiCopy, theme: Theme): CallView {
  const secondary: string[] = [input.mode ?? "auto"];
  if (input.paths?.length) {
    secondary.push(`${copy.selected} ${String(input.paths.length)} ${copy.paths}`);
  } else if (input.path) {
    secondary.push(safeLabel(input.path));
  }
  return {
    primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", copy.continueSnapshot)}`,
    secondary,
  };
}

function searchCall(input: SignalGrepInput, theme: Theme): CallView {
  const secondary = [
    safeLabel(input.path ?? "."),
    input.mode ?? "auto",
    input.literal ? "literal" : "regex",
  ];
  if (input.ignoreCase === true) secondary.push("ignore-case");
  else if (input.ignoreCase === false) secondary.push("case-sensitive");
  else secondary.push("smart-case");
  if (input.context !== undefined) secondary.push(`context ${String(input.context)}`);
  const glob = list(input.glob);
  const exclude = list(input.exclude);
  if (glob) secondary.push(`include ${glob}`);
  if (exclude) secondary.push(`exclude ${exclude}`);
  return {
    primary: `${signalGrepTitle(theme)}  ${theme.fg("accent", quote(input.pattern ?? ""))}`,
    secondary,
  };
}

function callView(input: SignalGrepInput, copy: TuiCopy, theme: Theme): CallView {
  if (input.mode === "inspect") return inspectCall(input, copy, theme);
  if (input.cursor) return continuationCall(input, copy, theme);
  return searchCall(input, theme);
}

export function renderSignalGrepCallLines(
  input: SignalGrepInput,
  locale: SignalGrepLocale,
  theme: Theme,
  width: number,
): string[] {
  const { primary, secondary } = callView(input, COPY[locale], theme);
  if (secondary.length === 0) return finish([primary], width);
  const detail = secondary.join(" · ");
  if (width < 44) return finish([`${primary} · ${detail}`], width);
  return finish([primary, theme.fg("dim", detail)], width);
}

export function renderSignalGrepPresentationLines(
  presentation: SignalGrepPresentation,
  locale: SignalGrepLocale,
  theme: Theme,
  width: number,
): string[] {
  const copy = COPY[locale];
  switch (presentation.kind) {
    case "empty":
      return finish(
        [
          title("SIGNAL GREP", theme),
          `${theme.bold("0")} ${copy.matches} · ${theme.fg("success", copy.complete)}`,
          theme.fg("dim", copy.empty),
        ],
        width,
      );
    case "summary":
      return renderSummary(presentation, copy, theme, width);
    case "matches":
      return renderMatches(presentation, copy, theme, width);
    case "inspect":
      return renderInspect(presentation, copy, theme, width);
    case "inspect-batch":
      return renderInspectBatch(presentation, copy, theme, width);
    default:
      throw new Error("Unsupported Signal Grep presentation");
  }
}

export function localizedSearchingText(locale: SignalGrepLocale): string {
  return COPY[locale].searching;
}

export function localizedErrorText(locale: SignalGrepLocale): { hint: string; title: string } {
  const copy = COPY[locale];
  return { hint: copy.expandFullError, title: copy.error };
}
