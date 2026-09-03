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
  test("zero results expand a narrow path to the project root before claiming absence", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(join(root, "vite.config.ts"), "export const onlyAtRoot = 'only-at-root';\n");
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
      const scoped = await service.search({ pattern: "only-at-root", path: "src" }, root);
      expect(scoped.text).toContain("only-at-root");
      expect(scoped.text).toContain('Scope expanded: requested path "src" had no matches');
      expect(scoped.details.scope).toEqual({
        path: ".",
        requestedPath: "src",
        glob: [],
        exclude: [],
        hidden: true,
        expandedToProjectRoot: true,
        assertion: "project-wide",
      });
      const filtered = await service.search({ pattern: "Needle", exclude: "**/*" }, root);
      expect(filtered.text).toContain("filters were applied");
      expect(filtered.text).toContain('project root "."');
      await service.shutdown();
    } finally {
      await removeFixture(root);
    }
  });
  test("keeps retained matches but omits context after the source file changes", async () => {
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
      expect(retained.text).not.toContain("shorter file");
      expect(retained.text).toContain("Context omitted for 1 changed file");
      expect(retained.details.contextChangedFiles).toEqual(["moving.ts"]);
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

  test("optionally redacts credentials from text and structured details", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(join(root, ".env"), "API_KEY=super-secret-value\n");
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
      const unredacted = await service.search(
        { pattern: "API_KEY", path: ".env", literal: true },
        root,
      );
      expect(unredacted.text).toContain("super-secret-value");
      expect(unredacted.details.redactionApplied).toBeUndefined();
      const result = await service.search(
        { pattern: "API_KEY", path: ".env", literal: true, redact: true },
        root,
      );
      expect(result.text).toContain("[REDACTED]");
      expect(result.text).not.toContain("super-secret-value");
      expect(JSON.stringify(result.details)).not.toContain("super-secret-value");
      expect(result.details.redactedCount).toBeGreaterThan(0);
      await service.shutdown();
    } finally {
      await removeFixture(root);
    }
  });

  test("redaction policy survives ordinary and analysis cursor continuation", async () => {
    const root = await createTodoFixture();
    try {
      await writeFile(
        join(root, ".env"),
        `${Array.from({ length: 40 }, (_, index) => `API_KEY=secret-${String(index)} TOKEN=token-${String(index)}`).join("\n")}\n`,
      );
      const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
      const ordinary = await service.search(
        { pattern: "API_KEY", literal: true, mode: "matches", limit: 1, redact: true },
        root,
      );
      expect(ordinary.details.nextRequest).toMatchObject({ redact: true });
      const ordinaryCursor = ordinary.details.cursor;
      if (!ordinaryCursor) throw new Error("Expected ordinary cursor");
      const ordinaryNext = await service.search({ cursor: ordinaryCursor }, root);
      expect(ordinaryNext.details.redactionApplied).toBe(true);
      expect(ordinaryNext.text).not.toContain("secret-");

      const analysis = await service.search({ anyOf: ["API_KEY", "TOKEN"], redact: true }, root);
      expect(analysis.details.nextRequest).toMatchObject({ redact: true });
      const analysisCursor = analysis.details.nextRequest?.cursor;
      if (!analysisCursor) throw new Error("Expected analysis cursor");
      const analysisNext = await service.search({ cursor: analysisCursor }, root);
      expect(analysisNext.details.redactionApplied).toBe(true);
      expect(analysisNext.text).not.toContain("secret-");
      expect(analysisNext.text).not.toContain("token-");
      await service.shutdown();
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
