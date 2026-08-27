import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { normalizeRequest, type RawSearchInput } from "../src/request.js";
import { createRipgrepRunner } from "../src/rg.js";

interface ReferenceMatch {
  path: string;
  line: number;
  text: string;
}

interface DifferentialCase {
  name: string;
  input: RawSearchInput;
  referenceFlags: string[];
}

function sortMatches(left: ReferenceMatch, right: ReferenceMatch): number {
  return (
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.text.localeCompare(right.text)
  );
}

const roots = new Set<string>();

async function createDifferentialFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-differential-"));
  roots.add(root);
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "dist"), { recursive: true });
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "src", "app.ts"), "todo lower\nTODO upper\nTODO[1]\ncafé\n");
  await writeFile(join(root, "src", "view.tsx"), "todo view\nTODO view upper\n");
  await writeFile(join(root, "docs", "guide.md"), "todo guide\n");
  await writeFile(join(root, "dist", "generated.ts"), "todo generated\n");
  await writeFile(join(root, ".hidden.ts"), "todo hidden\n");
  await writeFile(join(root, "ignored.ts"), "todo ignored\n");
  await writeFile(join(root, "unicode-文件.ts"), "CAFÉ\ncafé\n");
  await writeFile(join(root, "space name.txt"), " TODO spaced \njust spaces   \n");
  await writeFile(join(root, ".gitignore"), "ignored.ts\n");
  await writeFile(join(root, ".git", "config"), "todo git internals\n");
  return root;
}

function decodeText(value: { text?: string; bytes?: string }): string {
  if (typeof value.text === "string") return value.text;
  return Buffer.from(value.bytes ?? "", "base64").toString("utf8");
}

async function runReference(
  root: string,
  input: RawSearchInput,
  flags: string[],
): Promise<ReferenceMatch[]> {
  const searchPath = resolve(root, input.path ?? ".");
  const process = Bun.spawn(
    [
      "rg",
      "--json",
      "--line-number",
      "--color=never",
      "--no-heading",
      ...flags,
      "--glob",
      "!.git/**",
      "--glob",
      "!**/.git/**",
      "--",
      input.pattern ?? "",
      searchPath,
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const timeout = setTimeout(() => process.kill(), 5_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  clearTimeout(timeout);
  if (exitCode !== 0 && exitCode !== 1) throw new Error(stderr || `rg exited ${exitCode}`);

  const matches: ReferenceMatch[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const event = JSON.parse(line);
    if (event.type !== "match") continue;
    const rawPath = decodeText(event.data.path);
    const absolutePath = isAbsolute(rawPath) ? rawPath : resolve(root, rawPath);
    matches.push({
      path: relative(root, absolutePath).replaceAll("\\", "/"),
      line: event.data.line_number,
      text: decodeText(event.data.lines).replaceAll("\r", "").replace(/\n$/, ""),
    });
  }
  return matches;
}

const cases: DifferentialCase[] = [
  {
    name: "smart-case lowercase with hidden files",
    input: { pattern: "todo" },
    referenceFlags: ["--hidden", "--smart-case"],
  },
  {
    name: "smart-case uppercase",
    input: { pattern: "TODO" },
    referenceFlags: ["--hidden", "--smart-case"],
  },
  {
    name: "literal metacharacters",
    input: { pattern: "TODO[1]", literal: true },
    referenceFlags: ["--hidden", "--fixed-strings", "--smart-case"],
  },
  {
    name: "multiple include globs with an exclusion",
    input: {
      pattern: "todo",
      glob: ["*.ts", "*.tsx"],
      exclude: ["dist/**", ".hidden.ts"],
    },
    referenceFlags: [
      "--hidden",
      "--glob",
      "*.ts",
      "--glob",
      "*.tsx",
      "--glob",
      "!dist/**",
      "--glob",
      "!.hidden.ts",
      "--smart-case",
    ],
  },
  {
    name: "hidden files disabled",
    input: { pattern: "todo", hidden: false },
    referenceFlags: ["--smart-case"],
  },
  {
    name: "forced Unicode-insensitive matching",
    input: { pattern: "café", ignoreCase: true },
    referenceFlags: ["--hidden", "--ignore-case"],
  },
  {
    name: "explicit case-sensitive lowercase matching",
    input: { pattern: "todo", ignoreCase: false },
    referenceFlags: ["--hidden", "--case-sensitive"],
  },
  {
    name: "anchored alternation within a scoped path",
    input: { pattern: "^(todo|TODO)", path: "src", ignoreCase: false },
    referenceFlags: ["--hidden", "--case-sensitive"],
  },
  {
    name: "literal leading and trailing whitespace",
    input: { pattern: " TODO spaced ", literal: true },
    referenceFlags: ["--hidden", "--fixed-strings", "--smart-case"],
  },
  {
    name: "empty regex without hidden traversal",
    input: { pattern: "", hidden: false, ignoreCase: false },
    referenceFlags: ["--case-sensitive"],
  },
];

afterEach(async () => {
  await Promise.all([...roots].map((root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("ripgrep differential contract", () => {
  for (const entry of cases) {
    test(`matches independent rg output for ${entry.name}`, async () => {
      const root = await createDifferentialFixture();
      const [scan, reference] = await Promise.all([
        createRipgrepRunner()(normalizeRequest(entry.input), root),
        runReference(root, entry.input, entry.referenceFlags),
      ]);
      const actual = scan.matches
        .map((match) => ({
          path: match.displayPath,
          line: match.lineNumber,
          text: match.lineContent,
        }))
        .toSorted(sortMatches);

      expect(scan.snapshotComplete).toBe(true);
      expect(scan.totalMatches).toBe(reference.length);
      expect(actual).toEqual(reference.toSorted(sortMatches));
      expect(Object.fromEntries(scan.fileCounts)).toEqual(
        reference.reduce<Record<string, number>>((counts, match) => {
          counts[match.path] = (counts[match.path] ?? 0) + 1;
          return counts;
        }, {}),
      );
    }, 10_000);
  }
});
