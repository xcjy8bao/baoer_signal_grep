import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTodoFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "signal-grep-test-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "noise.ts"),
    `${Array.from({ length: 30 }, (_, index) => `// TODO fix ${index + 1}`).join("\n")}\n`,
  );
  await writeFile(join(root, "src", "app.ts"), "// TODO app\n");
  await writeFile(join(root, "utils.ts"), "// TODO utils\n");
  await writeFile(join(root, "README.md"), "TODO readme\n");
  return root;
}

export async function removeFixture(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

export function extractMatchIds(text: string): string[] {
  const ids: string[] = [];
  let currentFile = "";
  for (const line of text.split("\n")) {
    if (/^ \d+[:|-]/.test(line)) {
      const lineNumber = line.match(/^ (\d+)[:|-]/)?.[1];
      if (lineNumber && currentFile) ids.push(`${currentFile}:${lineNumber}`);
      continue;
    }
    if (line.length > 0 && !line.startsWith("[") && !line.startsWith("Continue with cursor=")) {
      currentFile = line;
    }
  }
  return ids;
}
