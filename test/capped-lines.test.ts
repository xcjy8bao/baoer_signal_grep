import { describe, expect, test } from "bun:test";
import { consumeCappedLines } from "../src/capped-lines.js";

async function* chunks(values: string[]): AsyncGenerator<Uint8Array> {
  for (const value of values) yield new TextEncoder().encode(value);
}

describe("consumeCappedLines", () => {
  test("splits only on LF and preserves Unicode line separators", async () => {
    const lines: string[] = [];
    const first = JSON.stringify({ text: "before\u2028after" });
    const second = JSON.stringify({ ok: true });
    await consumeCappedLines(chunks([`${first}\n${second}\n`]), (line) => lines.push(line));
    expect(lines).toEqual([first, second]);
  });

  test("handles UTF-8 chunks split inside a code point", async () => {
    const encoded = new TextEncoder().encode("😀\n");
    const lines: string[] = [];
    await consumeCappedLines(
      {
        async *[Symbol.asyncIterator]() {
          yield encoded.slice(0, 2);
          yield encoded.slice(2);
        },
      },
      (line) => lines.push(line),
    );
    expect(lines).toEqual(["😀"]);
  });

  test("rejects an unterminated line beyond the explicit bound", async () => {
    let failure: unknown;
    try {
      await consumeCappedLines(chunks(["123456"]), () => {}, { maxLineBytes: 5 });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ message: expect.stringContaining("5-byte limit") });
  });
});
