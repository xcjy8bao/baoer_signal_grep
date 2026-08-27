import { describe, expect, test } from "bun:test";
import { buildRipgrepArguments, createRipgrepRunner } from "../src/rg.js";
import type { SearchRequest } from "../src/types.js";
import { createTodoFixture, removeFixture } from "./helpers.js";

const request: SearchRequest = {
  pattern: "TODO",
  glob: [],
  exclude: [],
  literal: false,
  hidden: true,
  context: 0,
  pageSize: 20,
};

describe("ripgrep runner", () => {
  test("always excludes Git internals while retaining hidden search", () => {
    const args = buildRipgrepArguments(request, "/repo");
    expect(args).toContain("--hidden");
    expect(args).toContain("!.git/**");
    expect(args).toContain("!**/.git/**");
    expect(args.slice(-3)).toEqual(["--", "TODO", "/repo"]);
  });

  test("counts every match while retaining only the configured bound", async () => {
    const root = await createTodoFixture();
    try {
      const result = await createRipgrepRunner({ maxStoredMatches: 3 })(request, root);
      expect(result.totalMatches).toBe(33);
      expect(result.matches).toHaveLength(3);
      expect(result.snapshotComplete).toBe(false);
      expect([...result.fileCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(33);
    } finally {
      await removeFixture(root);
    }
  });

  test("fails immediately for an already aborted search", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createRipgrepRunner()(request, ".", controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
