import { describe, expect, test } from "bun:test";
import { excerptText } from "../src/excerpt.js";

describe("excerptText", () => {
  test("keeps a distant focus visible inside a bounded excerpt", () => {
    const source = `${"x".repeat(900)}NEEDLE${"y".repeat(100)}`;
    const excerpt = excerptText(source, 900, 906);

    expect(excerpt.truncated).toBe(true);
    expect(excerpt.text).toContain("NEEDLE");
    expect(excerpt.text.startsWith("…")).toBe(true);
    expect(excerpt.endCharacter).toBe(source.length);
    expect(excerpt.endCharacter - excerpt.startCharacter).toBe(500);
  });

  test("returns short text unchanged", () => {
    expect(excerptText("short", 2, 4)).toEqual({
      text: "short",
      truncated: false,
      startCharacter: 0,
      endCharacter: 5,
    });
  });

  test("rejects an invalid excerpt size", () => {
    expect(() => excerptText("text", 0, 0, 0)).toThrow(
      "Excerpt size must be a positive safe integer",
    );
  });
});
