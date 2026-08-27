import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";
import { createTodoFixture, extractMatchIds, removeFixture } from "./helpers.js";

const fixtures = new Set<string>();

afterEach(async () => {
  await Promise.all([...fixtures].map(removeFixture));
  fixtures.clear();
});

async function fixture(): Promise<string> {
  const root = await createTodoFixture();
  fixtures.add(root);
  return root;
}

describe("SignalGrepService with ripgrep", () => {
  test("summarizes a broad search before returning detail", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "TODO" }, root);

    expect(result.details).toMatchObject({
      mode: "auto",
      status: "complete",
      totalMatches: 33,
      totalFiles: 4,
      returnedMatches: 0,
      snapshotComplete: true,
    });
    expect(result.text).toContain("33 matches across 4 files (complete snapshot)");
    expect(result.text).toContain("noise.ts");
    expect(result.text).toContain("30");
    expect(result.details.cursor).toBeString();
  });

  test("paginates the stable snapshot without omissions or duplicates", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const pages: string[] = [];
    let result = await service.search({ pattern: "TODO", mode: "matches" }, root);

    while (true) {
      pages.push(result.text);
      const cursor = result.details.cursor;
      if (!cursor) break;
      result = await service.search({ cursor }, root);
    }

    const firstPage = extractMatchIds(pages[0] ?? "");
    const allMatches = pages.flatMap(extractMatchIds);
    expect(firstPage).toHaveLength(20);
    expect(allMatches).toHaveLength(33);
    expect(new Set(allMatches).size).toBe(33);
    expect(allMatches.filter((id) => id.startsWith("noise.ts:"))).toHaveLength(30);
    expect(pages.at(-1)).toContain("Matches 21-33 of 33; complete snapshot");
  });

  test("includes meaningful hidden files, excludes .git, and respects .gitignore", async () => {
    const root = await fixture();
    await mkdir(join(root, ".git", "hooks"), { recursive: true });
    await writeFile(join(root, ".git", "hooks", "sample"), "TODO git internals\n");
    await writeFile(join(root, ".hidden.ts"), "TODO hidden\n");
    await writeFile(join(root, ".gitignore"), "ignored.ts\n");
    await writeFile(join(root, "ignored.ts"), "TODO ignored\n");

    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search({ pattern: "TODO", mode: "summary" }, root);

    expect(result.details.totalMatches).toBe(34);
    expect(result.text).toContain(".hidden.ts");
    expect(result.text).not.toContain(".git/hooks");
    expect(result.text).not.toContain("ignored.ts");
  });

  test("keeps detail output within the byte budget and reports omitted context", async () => {
    const root = await fixture();
    const longLine = `${"x".repeat(600)}\n`;
    await writeFile(
      join(root, "large-context.ts"),
      `${longLine.repeat(20)}TODO target\n${longLine.repeat(20)}`,
    );

    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const result = await service.search(
      { pattern: "TODO target", literal: true, context: 20, mode: "matches" },
      root,
    );

    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(16 * 1024);
    expect(result.details.contextOmittedFiles).toContain("large-context.ts");
    expect(result.text).toContain("TODO target");
  });

  test("honors cancellation while continuing a retained snapshot", async () => {
    const root = await fixture();
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "TODO" }, root);
    const cursor = summary.details.cursor;
    if (!cursor) throw new Error("Expected summary cursor");
    const controller = new AbortController();
    controller.abort();

    await expect(service.search({ cursor }, root, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  test("marks a bounded snapshot partial instead of claiming completeness", async () => {
    const root = await fixture();
    const service = new SignalGrepService({
      runRipgrep: createRipgrepRunner({ maxStoredMatches: 3 }),
    });
    const result = await service.search({ pattern: "TODO" }, root);

    expect(result.details).toMatchObject({
      status: "partial",
      totalMatches: 33,
      storedMatches: 3,
      snapshotComplete: false,
    });
    expect(result.text).toContain("PARTIAL snapshot: retained 3 of 33 matches");
  });
});
