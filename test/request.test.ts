import { describe, expect, test } from "bun:test";
import { SignalGrepError } from "../src/errors.js";
import { normalizeRequest } from "../src/request.js";

describe("normalizeRequest", () => {
  test("applies bounded modern defaults", () => {
    expect(normalizeRequest({ pattern: "TODO" })).toEqual({
      pattern: "TODO",
      glob: [],
      exclude: [],
      literal: false,
      hidden: true,
      context: 0,
      pageSize: 100,
      redact: false,
    });
  });

  test("normalizes @ paths without changing search text", () => {
    expect(
      normalizeRequest({
        pattern: " TODO ",
        path: "@src",
        glob: ["*.ts", ""],
        exclude: "node_modules/**",
        context: 20,
        limit: 100,
      }),
    ).toMatchObject({
      pattern: " TODO ",
      path: "src",
      glob: ["*.ts"],
      exclude: ["node_modules/**"],
      context: 20,
      pageSize: 100,
    });
  });

  test("rejects numeric values outside the public integer contract", () => {
    for (const input of [
      { pattern: "TODO", context: 21 },
      { pattern: "TODO", context: -1 },
      { pattern: "TODO", context: 1.5 },
      { pattern: "TODO", limit: 101 },
      { pattern: "TODO", limit: 0 },
      { pattern: "TODO", limit: Number.NaN },
    ]) {
      expect(() => normalizeRequest(input)).toThrow(SignalGrepError);
    }
  });

  test("preserves empty and whitespace-only patterns because ripgrep treats them as valid", () => {
    expect(normalizeRequest({ pattern: "" }).pattern).toBe("");
    expect(normalizeRequest({ pattern: " " }).pattern).toBe(" ");
  });

  test("rejects an omitted pattern", () => {
    expect(() => normalizeRequest({})).toThrow(SignalGrepError);
  });
});
