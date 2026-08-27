import { describe, expect, test } from "bun:test";
import {
  effectiveSignalGrepInput,
  grepOverrideConflictSource,
  signalGrepToolName,
} from "../src/index.js";

describe("Signal Grep tool mode", () => {
  test("keeps additive signal_grep as the safe default", () => {
    expect(signalGrepToolName({ overrideBuiltinGrep: false })).toBe("signal_grep");
  });

  test("uses the built-in tool name only when override is explicitly enabled", () => {
    expect(signalGrepToolName({ overrideBuiltinGrep: true })).toBe("grep");
  });

  test("allows replacing the builtin grep but identifies another extension owner", () => {
    expect(
      grepOverrideConflictSource([
        { name: "grep", sourceInfo: { source: "builtin" } },
        { name: "read", sourceInfo: { source: "builtin" } },
      ]),
    ).toBeUndefined();
    expect(
      grepOverrideConflictSource([{ name: "grep", sourceInfo: { source: "npm:another-grep" } }]),
    ).toBe("npm:another-grep");
  });

  test("preserves built-in case-sensitive defaults while honoring explicit input", () => {
    const config = { overrideBuiltinGrep: true };
    expect(effectiveSignalGrepInput({ pattern: "todo" }, config)).toEqual({
      pattern: "todo",
      ignoreCase: false,
    });
    expect(effectiveSignalGrepInput({ pattern: "todo", ignoreCase: true }, config)).toEqual({
      pattern: "todo",
      ignoreCase: true,
    });
    expect(effectiveSignalGrepInput({ cursor: "cursor" }, config)).toEqual({
      cursor: "cursor",
    });
  });
});
