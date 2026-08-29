import { describe, expect, test } from "bun:test";
import { message } from "../src/messages.js";

describe("localized messages", () => {
  test("keeps English as the exact default contract", () => {
    expect(message("en", "healthOverrideMode")).toBe("override built-in grep");
    expect(message("en", "overrideEnableRefused", { source: "npm:owner" })).toBe(
      'Cannot enable Signal Grep override: "npm:owner" is installed and owns the public "grep" tool name. Remove it first, or keep using additive "signal_grep".',
    );
  });

  test("formats Simplified Chinese command text and dynamic values", () => {
    expect(message("zh-CN", "commandHealthDescription")).toBe(
      "显示 ripgrep、结构提供器可用性和内存快照用量",
    );
    expect(message("zh-CN", "healthDegradedMode", { source: "npm:owner" })).toBe(
      "已降级为附加 signal_grep（冲突：npm:owner）",
    );
  });

  test("fails clearly when a required dynamic value is missing", () => {
    expect(() => message("zh-CN", "healthDegradedMode")).toThrow(
      "Missing Signal Grep message parameter: source",
    );
  });
});
