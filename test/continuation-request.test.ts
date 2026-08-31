import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRipgrepRunner } from "../src/rg.js";
import { SignalGrepService } from "../src/service.js";

test("selected-file follow-ups are complete executable requests and do not rescan", async () => {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-follow-up-"));
  try {
    await writeFile(join(root, "chosen.ts"), "value 1\nvalue 2\nvalue 3\n");
    await writeFile(join(root, "other.ts"), "value 4\n");
    let scans = 0;
    const run = createRipgrepRunner();
    const service = new SignalGrepService({
      runRipgrep: (...args) => {
        scans += 1;
        return run(...args);
      },
    });
    const initial = await service.search({ pattern: "value", mode: "summary", limit: 1 }, root);
    if (!initial.details.cursor) throw new Error("Expected summary cursor");
    const selected = await service.search(
      { cursor: initial.details.cursor, paths: ["chosen.ts"] },
      root,
    );
    const next = selected.details.nextRequest;
    expect(next?.paths).toEqual(["chosen.ts"]);
    expect(selected.text).toContain(JSON.stringify(next));
    if (!next) throw new Error("Expected another page");
    const page = await service.search(next, root);
    expect(page.text).toContain("value 2");
    expect(page.text).not.toContain("value 4");
    expect(scans).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 5000);
