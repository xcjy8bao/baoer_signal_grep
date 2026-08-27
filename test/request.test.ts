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
    });
  });

  test("normalizes @ paths and numeric bounds without changing search text", () => {
    expect(
      normalizeRequest({
        pattern: " TODO ",
        path: "@src",
        glob: ["*.ts", ""],
        exclude: "node_modules/**",
        context: 99,
        limit: 999,
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

  test("preserves empty and whitespace-only patterns because ripgrep treats them as valid", () => {
    expect(normalizeRequest({ pattern: "" }).pattern).toBe("");
    expect(normalizeRequest({ pattern: " " }).pattern).toBe(" ");
  });

  test("rejects an omitted pattern", () => {
    expect(() => normalizeRequest({})).toThrow(SignalGrepError);
  });
});
