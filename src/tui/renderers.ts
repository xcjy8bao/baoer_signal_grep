import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { SignalGrepLocale } from "../config.js";
import type { SignalGrepInput } from "../service.js";
import type { SignalGrepDetails } from "../types.js";
import {
  localizedErrorText,
  renderSignalGrepCallLines,
  renderSignalGrepPresentationLines,
  localizedSearchingText,
  type SignalGrepTheme,
} from "./layout.js";
import { recognizeSignalGrepResult } from "./presentation.js";

type Theme = SignalGrepTheme;

interface TextContent {
  type: string;
  text?: string;
}

export interface SignalGrepToolResult {
  content: TextContent[];
  details?: SignalGrepDetails;
}

export interface SignalGrepRenderOptions {
  expanded: boolean;
  isError: boolean;
  isPartial: boolean;
}

function resultText(result: SignalGrepToolResult): string | undefined {
  return result.content.find((item) => item.type === "text" && item.text !== undefined)?.text;
}

function textLines(text: string, width: number): string[] {
  return new Text(text, 0, 0).render(Math.max(1, width));
}

function component(render: (width: number) => string[], fallbackText: string): Component {
  return {
    render(width) {
      try {
        return render(width);
      } catch {
        return textLines(fallbackText, width);
      }
    },
    invalidate() {},
  };
}

interface ErrorLineOptions {
  copy: { hint: string; title: string };
  expanded: boolean;
  theme: Theme;
  width: number;
}

function errorLines(text: string, options: ErrorLineOptions): string[] {
  const { copy, expanded, theme, width } = options;
  if (expanded) return textLines(text, width);
  const available = Math.max(1, width);
  const sourceLines = text.split("\n").filter((line) => line.length > 0);
  const shown = sourceLines.slice(0, 4);
  const lines = [
    theme.fg("error", theme.bold(`── ${copy.title} ──`)),
    ...shown.map((line) => theme.fg("error", line)),
  ];
  if (sourceLines.length > shown.length) lines.push(theme.fg("dim", `… ${copy.hint}`));
  return lines.map((line) => truncateToWidth(line, available));
}

export function renderSignalGrepCall(
  input: SignalGrepInput,
  locale: SignalGrepLocale,
  theme: Theme,
): Component {
  return component(
    (width) => renderSignalGrepCallLines(input, locale, theme, width),
    "Signal Grep",
  );
}

export function renderSignalGrepResult(
  result: SignalGrepToolResult,
  options: SignalGrepRenderOptions,
  locale: SignalGrepLocale,
  theme: Theme,
): Component {
  const text = resultText(result);
  if (text === undefined) return new Text("", 0, 0);

  if (options.isPartial) {
    return new Text(theme.fg("warning", localizedSearchingText(locale)), 0, 0);
  }
  if (options.isError) {
    return component(
      (width) =>
        errorLines(text, {
          copy: localizedErrorText(locale),
          expanded: options.expanded,
          theme,
          width,
        }),
      text,
    );
  }
  if (options.expanded) return new Text(text, 0, 0);

  let presentation;
  try {
    presentation = recognizeSignalGrepResult(text, result.details);
  } catch {
    return new Text(text, 0, 0);
  }
  if (!presentation) return new Text(text, 0, 0);
  return component(
    (width) => renderSignalGrepPresentationLines(presentation, locale, theme, width),
    text,
  );
}
