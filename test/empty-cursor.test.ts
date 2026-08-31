import { expect, test } from "bun:test";
import { SignalGrepService } from "../src/service.js";

async function expectFailure(pending: Promise<unknown>, message: string): Promise<void> {
  const failure: unknown = await pending.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ message: expect.stringContaining(message) });
}

test("explicit empty cursors fail before any new scan", async () => {
  let scans = 0;
  const service = new SignalGrepService({
    runRipgrep: () => {
      scans += 1;
      throw new Error("Unexpected scan");
    },
  });
  await Promise.all(
    ["", " ", "\t\n"].map((cursor) =>
      expectFailure(service.search({ cursor, pattern: "value" }, process.cwd()), "Invalid cursor"),
    ),
  );
  expect(scans).toBe(0);
});
