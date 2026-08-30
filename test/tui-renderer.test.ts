import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { SignalGrepTheme } from "../src/tui/layout.js";
import { renderSignalGrepCall, renderSignalGrepResult } from "../src/tui/renderers.js";
import type { SignalGrepDetails, StructureStatus } from "../src/types.js";

const theme: SignalGrepTheme = {
  bold: (text) => text,
  fg: (_color, text) => text,
};

function details(overrides: Partial<SignalGrepDetails> = {}): SignalGrepDetails {
  return {
    version: 1,
    mode: "matches",
    status: "complete",
    totalMatches: 3,
    storedMatches: 3,
    totalFiles: 2,
    returnedMatches: 3,
    snapshotComplete: true,
    ...overrides,
  };
}

function textResult(text: string, resultDetails: SignalGrepDetails | undefined) {
  return {
    content: [{ type: "text", text }],
    ...(resultDetails ? { details: resultDetails } : {}),
  };
}

function renderAt(component: ReturnType<typeof renderSignalGrepResult>, width: number): string[] {
  const lines = component.render(width);
  expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
  return lines;
}

function joined(lines: string[]): string {
  return lines.map((line) => line.trimEnd()).join("\n");
}

function collapsed(result: ReturnType<typeof textResult>, locale: "en" | "zh-CN" = "en") {
  return renderSignalGrepResult(
    result,
    { expanded: false, isError: false, isPartial: false },
    locale,
    theme,
  );
}

describe("Signal Grep TUI renderers", () => {
  test("renders new, continuation, and inspect calls within narrow and wide widths", () => {
    const calls = [
      renderSignalGrepCall(
        { pattern: "认证\u001b[31m", path: "src/认证", mode: "summary", context: 2 },
        "zh-CN",
        theme,
      ),
      renderSignalGrepCall(
        { cursor: "opaque-secret", mode: "matches", paths: ["src/a.ts", "src/b.ts"] },
        "en",
        theme,
      ),
      renderSignalGrepCall({ mode: "inspect", path: "src/auth.ts", line: 42 }, "en", theme),
    ];

    for (const width of [30, 60, 100]) {
      for (const call of calls) {
        const lines = call.render(width);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        expect(lines.join("\n")).not.toContain("opaque-secret");
        expect(lines.join("\n")).not.toContain("\u001b[31m");
      }
    }
  });

  test("renders complete summaries as responsive ranked evidence", () => {
    const text = [
      "233 matches across 3 files (complete snapshot).",
      "Files 1-3 of 3, ordered by match count.",
      "",
      "src/认证.ts     200",
      "src/noise.ts      30",
      "src/app.ts         3",
      "",
      "Retrieve match details with the same cursor and no mode.",
    ].join("\n");
    const result = textResult(
      text,
      details({
        mode: "summary",
        totalMatches: 233,
        storedMatches: 233,
        totalFiles: 3,
        returnedMatches: 0,
        cursor: "cursor",
        summaryFilesShown: 3,
        summaryFilesOmitted: 0,
        summaryOffset: 0,
      }),
    );
    const before = structuredClone(result);
    const component = collapsed(result);

    const narrow = renderAt(component, 30).join("\n");
    const wide = renderAt(component, 100).join("\n");
    const chinese = renderAt(collapsed(result, "zh-CN"), 60).join("\n");
    expect(narrow).toContain("src/认证.ts");
    expect(narrow).not.toContain("█");
    expect(wide).toContain("SUMMARY");
    expect(wide).toContain("████");
    expect(wide).toContain("cursor ready");
    expect(chinese).toContain("3 个文件");
    expect(chinese).toContain("可继续翻页");
    expect(chinese).not.toContain("files");
    expect(result).toEqual(before);
  });

  test("makes partial retention impossible to mistake for complete evidence", () => {
    const text = [
      "83412 matches across 2 files (PARTIAL snapshot: retained 50000 of 83412 matches; narrow the search to retrieve all matches).",
      "Files 1-2 of 2, ordered by match count.",
      "",
      "generated.ts   31240",
      "vendor.ts      18760",
    ].join("\n");
    const result = textResult(
      text,
      details({
        mode: "summary",
        status: "partial",
        totalMatches: 83_412,
        storedMatches: 50_000,
        totalFiles: 2,
        returnedMatches: 0,
        snapshotComplete: false,
        cursor: "cursor",
        summaryFilesShown: 2,
        summaryFilesOmitted: 0,
      }),
    );
    const component = collapsed(result);

    const output = renderAt(component, 100).join("\n");
    const chinese = renderAt(collapsed(result, "zh-CN"), 60).join("\n");
    expect(output).toContain("PARTIAL SEARCH");
    expect(output).toContain("retained 50000/83412");
    expect(output).toContain("narrow the search");
    expect(output).not.toContain("· complete");
    expect(chinese).toContain("部分保留搜索");
    expect(chinese).toContain("仅包含已保留证据");
    expect(chinese).not.toContain("PARTIAL");
  });

  test("renders grouped match evidence and visible boundary warnings", () => {
    const text = [
      "src/auth.ts",
      " 42: function authenticate(token: string) { {match #1}",
      " 67: throw new AuthError() {match #2}",
      "",
      "src/middleware.ts",
      " 18: await authenticate(token) {match #3}",
      "",
      "[Context omitted for 1 file(s); retained matching lines are still shown.]",
      "",
      "[Matches 4-6 of 12; selected 2 path(s); complete snapshot.]",
      "",
      'Continue with cursor="secret" and the same path selection.',
    ].join("\n");
    const result = textResult(
      text,
      details({
        totalMatches: 12,
        storedMatches: 12,
        totalFiles: 3,
        returnedMatches: 3,
        cursor: "secret",
        selectedPaths: ["src/auth.ts", "src/middleware.ts"],
        selectionMissingPaths: ["src/missing.ts"],
        contextOmittedFiles: ["src/middleware.ts"],
      }),
    );
    const component = collapsed(result);

    const output = renderAt(component, 100).join("\n");
    const chinese = renderAt(collapsed(result, "zh-CN"), 60).join("\n");
    expect(output).toContain("src/auth.ts");
    expect(output).toContain("4–6/12");
    expect(output).toContain("selected 2 paths");
    expect(output).toContain("had no retained matches");
    expect(output).toContain("context unavailable");
    expect(output).not.toContain("secret");
    expect(chinese).toContain("匹配结果");
    expect(chinese).toContain("上下文不可用");
    expect(chinese).not.toContain("MATCHES");
  });

  test("renders all structure statuses without changing inspect evidence", () => {
    const statuses: StructureStatus[] = [
      "available",
      "no-symbol",
      "provider-unavailable",
      "source-unavailable",
      "parse-error",
      "file-too-large",
      "source-changed",
    ];
    const chineseStatuses: Record<StructureStatus, string> = {
      available: "可用",
      "file-too-large": "文件过大",
      "no-symbol": "未找到符号",
      "parse-error": "解析失败",
      "provider-unavailable": "结构提供器不可用",
      "source-changed": "源码已变化",
      "source-unavailable": "源码不可用",
    };

    for (const status of statuses) {
      const blocked = status === "file-too-large" || status === "source-changed";
      const text = blocked
        ? `src/auth.ts:42\n\n[structure: ${status}]`
        : [
            "src/auth.ts:42",
            status === "no-symbol"
              ? "No enclosing symbol found for line 42"
              : "authenticate (function) lines 38-84",
            "",
            "38 │ export function authenticate() {",
            "42 │   return verifyToken(token)",
            "84 │ }",
            "",
            `[structure: ${status}${status === "available" ? " via ctags" : ""}]`,
          ].join("\n");
      const result = textResult(
        text,
        details({
          mode: "inspect",
          totalMatches: 0,
          storedMatches: 0,
          totalFiles: 1,
          returnedMatches: blocked ? 0 : 3,
          structure: { status, ...(status === "available" ? { provider: "ctags" } : {}) },
        }),
      );
      const component = collapsed(result);
      const output = renderAt(component, 60).join("\n");
      const chinese = renderAt(collapsed(result, "zh-CN"), 60).join("\n");
      expect(output).toContain("src/auth.ts:42");
      if (blocked) expect(output).toContain("not mixed");
      else expect(output).toContain(status === "no-symbol" ? "no enclosing symbol" : "38 │");
      expect(chinese).toContain(status === "file-too-large" ? "源码过大" : chineseStatuses[status]);
    }
  });

  test("expanded, malformed, and renderer-failure paths preserve raw text", () => {
    const raw = "opaque raw result\nwith a second line";
    const malformedDetails = details();
    Object.defineProperty(malformedDetails, "version", { value: 999 });
    const malformed = textResult(raw, malformedDetails);
    expect(joined(renderAt(collapsed(malformed), 100))).toBe(raw);
    const unknownModeDetails = details();
    Object.defineProperty(unknownModeDetails, "mode", { value: "future" });
    expect(joined(renderAt(collapsed(textResult(raw, unknownModeDetails)), 100))).toBe(raw);

    const expanded = renderSignalGrepResult(
      textResult(raw, details()),
      { expanded: true, isError: false, isPartial: false },
      "en",
      theme,
    );
    expect(joined(renderAt(expanded, 100))).toBe(raw);

    const throwingTheme: SignalGrepTheme = {
      bold: () => {
        throw new Error("theme failure");
      },
      fg: () => {
        throw new Error("theme failure");
      },
    };
    const summaryText = [
      "1 matches across 1 files (complete snapshot).",
      "Files 1-1 of 1, ordered by match count.",
      "",
      "a.ts       1",
    ].join("\n");
    const failed = renderSignalGrepResult(
      textResult(
        summaryText,
        details({
          mode: "summary",
          totalMatches: 1,
          storedMatches: 1,
          totalFiles: 1,
          returnedMatches: 0,
          summaryFilesShown: 1,
        }),
      ),
      { expanded: false, isError: false, isPartial: false },
      "en",
      throwingTheme,
    );
    expect(joined(renderAt(failed, 100))).toBe(summaryText);
  });

  test("renders streaming and error states independently of search details", () => {
    const result = textResult("Cursor expired.\nRun the search again.", undefined);
    const streaming = renderSignalGrepResult(
      result,
      { expanded: false, isError: false, isPartial: true },
      "zh-CN",
      theme,
    );
    expect(renderAt(streaming, 30).join("\n")).toContain("正在搜索");

    const error = renderSignalGrepResult(
      result,
      { expanded: false, isError: true, isPartial: false },
      "en",
      theme,
    );
    expect(renderAt(error, 30).join("\n")).toContain("ERROR");
    expect(renderAt(error, 30).join("\n")).toContain("Cursor expired");
  });
});
