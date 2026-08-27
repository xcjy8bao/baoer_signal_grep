import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { createTodoFixture, removeFixture } from "./helpers.js";

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to fail");
}

describe("search semantics", () => {
  test("keeps retained match content stable after the source file changes", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(join(root, "moving.ts"), "before\nTODO stable\nafter\n");
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
      const summary = await service.search(
        { context: 1, literal: true, mode: "summary", pattern: "TODO stable" },
        root,
      );
      const cursor = summary.details.cursor;
      if (!cursor) throw new Error("Expected a stable detail cursor");

      await writeFile(join(root, "moving.ts"), "shorter file");
      const retained = await service.search({ cursor }, root);

      expect(retained.text).toContain("2: TODO stable");
      expect(retained.text).toContain("1- shorter file");
    } finally {
      await removeFixture(root);
    }
  });

  test("applies literal, case, and include-glob controls together", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(join(root, "Case.ts"), "Needle[1]\n");
      await writeFile(join(root, "Case.md"), "Needle[1]\n");
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });

      const exact = await service.search(
        {
          glob: "*.ts",
          ignoreCase: false,
          literal: true,
          mode: "matches",
          pattern: "Needle[1]",
        },
        root,
      );
      const wrongCase = await service.search(
        {
          glob: "*.ts",
          ignoreCase: false,
          literal: true,
          mode: "matches",
          pattern: "needle[1]",
        },
        root,
      );

      expect(exact.details.totalMatches).toBe(1);
      expect(exact.text).toContain("Case.ts");
      expect(exact.text).not.toContain("Case.md");
      expect(wrongCase.details.totalMatches).toBe(0);
    } finally {
      await removeFixture(root);
    }
  });

  test("propagates invalid regex and missing executable failures", async () => {
    const root = await createTodoFixture();
    try {
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
      const invalidRegex = await captureFailure(service.search({ pattern: "(" }, root));
      expect(invalidRegex).toBeInstanceOf(Error);
      if (!(invalidRegex instanceof Error)) throw new Error("Expected an Error instance");
      expect(invalidRegex.message).toContain("regex parse error");

      const unavailable = new SignalGrepService({
        runRipgrep: createRipgrepRunner({ executable: "signal-grep-rg-does-not-exist" }),
      });
      const missingExecutable = await captureFailure(unavailable.search({ pattern: "TODO" }, root));
      expect(missingExecutable).toBeInstanceOf(Error);
      if (!(missingExecutable instanceof Error)) throw new Error("Expected an Error instance");
      expect(missingExecutable.message).toContain("ripgrep executable not found");
    } finally {
      await removeFixture(root);
    }
  });
});
