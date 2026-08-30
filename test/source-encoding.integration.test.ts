import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";

const fixtures = new Set<string>();
afterEach(async () => {
  await Promise.all([...fixtures].map((root) => rm(root, { recursive: true, force: true })));
  fixtures.clear();
});

for (const batch of [false, true]) {
  test(`${batch ? "batch" : "single"} inspection keeps byte-based matches after invalid UTF-8`, async () => {
    const root = await mkdtemp(join(tmpdir(), "signal-grep-source-encoding-"));
    fixtures.add(root);
    await writeFile(
      join(root, "bytes.txt"),
      Buffer.concat([Buffer.alloc(1_000, 0xff), Buffer.from("\rneedle-target\n")]),
    );
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "needle-target", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    expect(summary.text).toContain("needle-target");
    expect(cursor).toBeDefined();
    if (!cursor) throw new Error("Expected a snapshot cursor");
    const result = await service.search(
      { mode: "inspect", cursor, ...(batch ? { matchIndices: [1] } : { matchIndex: 1 }) },
      root,
    );
    expect(result.text).toContain("needle-target");
    expect(result.text).toMatch(/^1: .*needle-target$/m);
    expect(result.details.status).toBe("complete");
    const source = batch ? result.details.inspections?.[0]?.source : result.details.source;
    expect(source?.truncatedLines).toEqual([1]);
  });

  test(`${batch ? "batch" : "single"} inspection keeps ripgrep line numbers across bare CR and CRLF`, async () => {
    const root = await mkdtemp(join(tmpdir(), "signal-grep-source-encoding-"));
    fixtures.add(root);
    await writeFile(join(root, "cr.txt"), "aaa\rneedle\rbbb\r\nnext\r\n");
    const service = new SignalGrepService({ runRipgrep: createRipgrepRunner() });
    const summary = await service.search({ pattern: "needle", mode: "summary" }, root);
    const cursor = summary.details.cursor;
    expect(cursor).toBeDefined();
    if (!cursor) throw new Error("Expected a snapshot cursor");
    expect(summary.text).toContain("cr.txt:1 {match #1} aaaneedlebbb");
    const result = await service.search(
      { mode: "inspect", cursor, ...(batch ? { matchIndices: [1] } : { matchIndex: 1 }) },
      root,
    );
    expect(result.text).toMatch(/^1: aaaneedlebbb$/m);
    expect(result.text).toMatch(/^2: next$/m);
    expect(result.details.status).toBe("complete");
    const context = await service.search({ pattern: "needle", mode: "matches", context: 1 }, root);
    expect(context.text).toMatch(/^ 1: aaaneedlebbb/m);
    expect(context.text).toMatch(/^ 2- next$/m);
  });
}
