import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runOwnedProcess } from "../src/owned-process.js";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
let isolated = "";
let worker = "";
let config = "";

async function execute(
  executable: string,
  args: string[],
  cwd: string,
  input?: string,
  extraEnv?: NodeJS.ProcessEnv,
) {
  const chunks: Buffer[] = [];
  const env = { ...process.env, ...extraEnv };
  delete env.NODE_OPTIONS;
  const result = await runOwnedProcess(
    {
      executable,
      args,
      cwd,
      env,
      signal: AbortSignal.timeout(15_000),
      ...(input !== undefined ? { input: Buffer.from(input) } : {}),
    },
    async (stdout) => {
      for await (const chunk of stdout) chunks.push(Buffer.from(chunk));
    },
  );
  return { ...result, output: Buffer.concat(chunks).toString("utf8") };
}

beforeAll(async () => {
  isolated = await mkdtemp(join(tmpdir(), "signal-grep-syntax-install-"));
  const scope = join(repository, "node_modules", "@ast-grep");
  await mkdir(join(isolated, "node_modules", "@ast-grep"), { recursive: true });
  await Promise.all(
    (await readdir(scope))
      .filter(
        (name) =>
          name === "napi" ||
          name.startsWith("napi-") ||
          name === "lang-go" ||
          name === "setup-lang",
      )
      .map((name) =>
        cp(join(scope, name), join(isolated, "node_modules", "@ast-grep", name), {
          recursive: true,
          dereference: true,
        }),
      ),
  );
  await writeFile(join(isolated, "package.json"), JSON.stringify({ type: "module" }));
  const installedSource = join(isolated, "node_modules", "pi-plugin-signal-grep", "src");
  await mkdir(installedSource, { recursive: true });
  await Promise.all(
    ["syntax-worker.mjs", "syntax-worker.toml"].map((asset) =>
      cp(join(repository, "src", asset), join(installedSource, asset)),
    ),
  );
  worker = join(installedSource, "syntax-worker.mjs");
  config = join(installedSource, "syntax-worker.toml");
}, 20_000);

afterAll(async () => {
  if (isolated) await rm(isolated, { recursive: true, force: true });
});

const fixtures = [
  { language: "javascript", text: "class A { #read(){return 1;} }", kind: "method_definition" },
  { language: "typescript", text: "function f<T>(x:T):T{return x;}", kind: "function_declaration" },
  { language: "tsx", text: "const F = <T,>(x:T) => <div>{String(x)}</div>;", kind: "jsx_element" },
  {
    language: "go",
    text: "package p\nfunc F[T any](x T) T { return x }",
    kind: "function_declaration",
  },
];

describe("production parser assets", () => {
  test("Node runs all four grammars with only the actual installed production packages", async () => {
    expect((await readdir(join(isolated, "node_modules"))).toSorted()).toEqual([
      "@ast-grep",
      "pi-plugin-signal-grep",
    ]);
    await Promise.all(
      fixtures.map(async (fixture) => {
        const result = await execute("node", [worker], isolated, JSON.stringify(fixture));
        expect(result.code).toBe(0);
        expect(result.output).toContain('"status":"ok"');
        expect(result.output).toContain(`"kind":"${fixture.kind}"`);
        expect(result.output).not.toContain('"text":');
      }),
    );
  }, 20_000);

  test("Bun runs the same assets without install scripts, a Go compiler, or Ctags", async () => {
    await Promise.all(
      fixtures.map(async (fixture) => {
        const result = await execute(
          process.execPath,
          [`--config=${config}`, "--no-env-file", "--no-macros", "--no-install", worker],
          isolated,
          JSON.stringify(fixture),
        );
        expect(result.code).toBe(0);
        expect(result.output).toContain('"status":"ok"');
        expect(result.output).toContain(`"kind":"${fixture.kind}"`);
      }),
    );
  }, 20_000);

  test("explicit runtime config overrides project preload and ignores environment files", async () => {
    const project = join(isolated, "untrusted-project");
    const globalConfig = join(isolated, "global-config");
    await mkdir(project);
    await mkdir(globalConfig);
    const marker = join(project, "executed");
    const preload = join(project, "preload.mjs");
    await writeFile(
      preload,
      `import {writeFileSync} from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "executed");`,
    );
    await writeFile(join(project, "bunfig.toml"), 'preload = ["./preload.mjs"]\n');
    await writeFile(join(globalConfig, ".bunfig.toml"), `preload = [${JSON.stringify(preload)}]\n`);
    await writeFile(join(project, ".env"), "SYNTAX_UNTRUSTED_ENV=loaded\n");
    await writeFile(
      join(project, "probe.mjs"),
      'process.stdout.write(process.env.SYNTAX_UNTRUSTED_ENV ?? "not-loaded");',
    );
    const env = { XDG_CONFIG_HOME: globalConfig };
    const control = await execute(
      process.execPath,
      [join(project, "probe.mjs")],
      project,
      undefined,
      env,
    );
    expect(control.code).toBe(0);
    expect(control.output).toBe("loaded");
    expect(await readFile(marker, "utf8")).toBe("executed");
    await rm(marker);
    const safe = await execute(
      process.execPath,
      [
        `--config=${config}`,
        "--no-env-file",
        "--no-macros",
        "--no-install",
        join(project, "probe.mjs"),
      ],
      project,
      undefined,
      env,
    );
    expect(safe.code).toBe(0);
    expect(safe.output).toBe("not-loaded");
    await assert.rejects(stat(marker), { code: "ENOENT" });
    const parser = await execute(
      process.execPath,
      [`--config=${config}`, "--no-env-file", "--no-macros", "--no-install", worker],
      project,
      JSON.stringify(fixtures[3]),
      env,
    );
    expect(parser.code).toBe(0);
    expect(parser.output).toContain('"status":"ok"');
    await assert.rejects(stat(marker), { code: "ENOENT" });
  }, 20_000);

  test("missing Go native parser fails explicitly without trying a runtime build", async () => {
    const directory = join(isolated, "node_modules", "@ast-grep", "lang-go");
    const prebuilds = join(directory, "prebuilds");
    const held = join(directory, "prebuilds-disabled");
    await rename(prebuilds, held);
    try {
      const result = await execute("node", [worker], isolated, JSON.stringify(fixtures[3]));
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("No parser found");
      expect(result.output).not.toContain('"status":"ok"');
      await assert.rejects(stat(join(directory, "parser.so")), { code: "ENOENT" });
    } finally {
      await rename(held, prebuilds);
    }
  }, 20_000);

  test("Bun cannot auto-install a parser when runtime dependencies are absent", async () => {
    const dependency = join(isolated, "node_modules", "@ast-grep");
    const held = join(isolated, "ast-grep-disabled");
    await rename(dependency, held);
    try {
      const result = await execute(
        process.execPath,
        [`--config=${config}`, "--no-env-file", "--no-macros", "--no-install", worker],
        isolated,
        JSON.stringify(fixtures[0]),
      );
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("@ast-grep/napi");
      await assert.rejects(stat(dependency), { code: "ENOENT" });
    } finally {
      await rename(held, dependency);
    }
  }, 20_000);
});
