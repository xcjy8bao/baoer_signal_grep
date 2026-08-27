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
      pageSize: 20,
    });
  });

  test("normalizes lists, @ paths, and numeric bounds", () => {
    expect(
      normalizeRequest({
        pattern: " TODO ",
        path: "@src",
        glob: ["*.ts", " "],
        exclude: "node_modules/**",
        context: 99,
        limit: 999,
      }),
    ).toMatchObject({
      pattern: "TODO",
      path: "src",
      glob: ["*.ts"],
      exclude: ["node_modules/**"],
      context: 20,
      pageSize: 100,
    });
  });

  test("rejects an empty pattern", () => {
    expect(() => normalizeRequest({ pattern: " " })).toThrow(SignalGrepError);
  });
});
