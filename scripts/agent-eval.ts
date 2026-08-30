import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

interface Task {
  id: string;
  repo: string;
  category: string;
  prompt: string;
  requiredFiles: string[];
  requiredSymbolGroups: string[][];
  requiredBehaviorGroups: string[][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected a JSON object");
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected a number");
  return value;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected an array");
  return value;
}

function optionalNumber(value: unknown): number {
  return value === undefined ? 0 : number(value);
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestText = await readFile(join(projectRoot, "docs/evaluation/0.5.6/tasks.json"), "utf8");
const manifest = record(JSON.parse(manifestText));
const manifestHash = createHash("sha256").update(manifestText).digest("hex");
const limits = record(manifest.limits);
const model = record(manifest.model);
const tasks: Task[] = array(manifest.tasks).map((value) => {
  const task = record(value);
  return {
    id: string(task.id),
    repo: string(task.repo),
    category: string(task.category),
    prompt: string(task.prompt),
    requiredFiles: array(task.requiredFiles).map(string),
    requiredSymbolGroups: array(task.requiredSymbolGroups).map((group) => array(group).map(string)),
    requiredBehaviorGroups: array(task.requiredBehaviorGroups).map((group) =>
      array(group).map(string),
    ),
  };
});

const variant = process.argv[2];
const fixtureRootArgument = process.argv[3];
const outputRootArgument = process.argv[4];
const extensionPath = process.argv[5];
if (
  (variant !== "vanilla" && variant !== "candidate") ||
  !fixtureRootArgument ||
  !outputRootArgument ||
  (variant === "candidate" && !extensionPath)
) {
  throw new Error(
    "Usage: bun scripts/agent-eval.ts vanilla|candidate FIXTURE_ROOT OUTPUT_ROOT [EXTENSION]",
  );
}
const fixtureRoot = resolve(fixtureRootArgument);
const outputRoot = resolve(outputRootArgument);
await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, `${variant}-manifest.sha256`), `${manifestHash}\n`);

function sanitize(text: string): string {
  return text
    .replaceAll(fixtureRoot, "<fixtures>")
    .replaceAll(projectRoot, "<plugin-source>")
    .replaceAll(/Bearer\s+[^\s"']+/g, "Bearer <redacted>")
    .replaceAll(/sk-[A-Za-z0-9_-]{16,}/g, "<redacted-key>");
}

function grade(task: Task, finalAnswer: string, completed: boolean) {
  const lower = finalAnswer.toLowerCase();
  const missingFiles = task.requiredFiles.filter((path) => !lower.includes(path.toLowerCase()));
  const missingSymbols = task.requiredSymbolGroups.filter(
    (group) => !group.some((item) => lower.includes(item.toLowerCase())),
  );
  const missingBehaviors = task.requiredBehaviorGroups.filter(
    (group) => !group.some((item) => lower.includes(item.toLowerCase())),
  );
  const hasLineCitation = /\.(?:ts|rs):\d+|\.(?:ts|rs)#L\d+/.test(finalAnswer);
  return {
    passed:
      completed &&
      finalAnswer.length > 0 &&
      hasLineCitation &&
      missingFiles.length === 0 &&
      missingSymbols.length === 0 &&
      missingBehaviors.length === 0,
    missingFiles,
    missingSymbols,
    missingBehaviors,
    hasLineCitation,
  };
}

async function evaluate(task: Task, repetition: number) {
  const id = `${variant}-${task.id}-${String(repetition)}`;
  const args = [
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-session",
    "--no-approve",
    "--offline",
    "--provider",
    string(model.provider),
    "--model",
    string(model.id),
    "--thinking",
    string(model.thinking),
    "--tools",
    variant === "candidate" ? "read,grep,bash,find,ls,signal_grep" : "read,grep,bash,find,ls",
    "--mode",
    "json",
    "--print",
  ];
  if (variant === "candidate" && extensionPath) args.push("-e", resolve(extensionPath));
  args.push(`${string(manifest.commonPrompt)}\n\n${task.prompt}`);
  const start = performance.now();
  const child = spawn("pi", args, {
    cwd: join(fixtureRoot, task.repo),
    env: { ...process.env, PI_TELEMETRY: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const trace: Record<string, unknown>[] = [];
  const toolCounts: Record<string, number> = {};
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    totalTokens: 0,
    cost: 0,
  };
  let modelTurns = 0;
  let toolRounds = 0;
  let toolCalls = 0;
  let toolResultBytes = 0;
  let toolErrors = 0;
  let finalAnswer = "";
  let failure: string | undefined;
  let stderr = "";
  let outputBytes = 0;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const terminate = (reason: string) => {
    if (failure) return;
    failure = reason;
    const kill = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        // The owned process group may already have exited between the cap and signal.
      }
    };
    kill("SIGTERM");
    killTimer = setTimeout(() => kill("SIGKILL"), 2_000);
  };
  const timeout = setTimeout(() => terminate("wall-time-limit"), number(limits.wallTimeMsPerRun));
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (Buffer.byteLength(stderr) > 32_768) terminate("stderr-limit");
  });
  child.stdout.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > number(limits.maxOutputBytesPerRun)) terminate("output-limit");
  });
  const reader = createInterface({ input: child.stdout });
  reader.on("line", (line) => {
    if (failure || line.trim().length === 0) return;
    try {
      const event = record(JSON.parse(line));
      if (event.type !== "message_end") return;
      const message = record(event.message);
      if (message.role === "assistant") {
        modelTurns += 1;
        const content = array(message.content).map(record);
        const calls = content.filter((block) => block.type === "toolCall");
        const texts = content
          .filter((block) => block.type === "text")
          .map((block) => string(block.text));
        if (calls.length > 0) toolRounds += 1;
        for (const call of calls) {
          const name = string(call.name);
          toolCounts[name] = (toolCounts[name] ?? 0) + 1;
          toolCalls += 1;
          trace.push({ kind: "tool-call", round: toolRounds, name, arguments: call.arguments });
        }
        if (message.usage !== undefined) {
          const item = record(message.usage);
          usage.input += optionalNumber(item.input);
          usage.output += optionalNumber(item.output);
          usage.cacheRead += optionalNumber(item.cacheRead);
          usage.cacheWrite += optionalNumber(item.cacheWrite);
          usage.reasoning += optionalNumber(item.reasoning);
          usage.totalTokens += optionalNumber(item.totalTokens);
          if (item.cost !== undefined) usage.cost += optionalNumber(record(item.cost).total);
        }
        if (message.stopReason === "error" || message.stopReason === "aborted") {
          terminate(`model-${string(message.stopReason)}`);
        }
        if (calls.length === 0 && texts.length > 0) finalAnswer = texts.join("\n");
        trace.push({
          kind: "assistant",
          turn: modelTurns,
          text: texts.join("\n"),
          stopReason: message.stopReason,
        });
        if (modelTurns >= number(limits.maxModelTurns) && calls.length > 0)
          terminate("model-turn-limit");
        if (toolCalls > number(limits.maxToolCalls)) terminate("tool-call-limit");
        if (usage.totalTokens > number(limits.maxTotalUsageTokensPerRun)) terminate("usage-limit");
      } else if (message.role === "toolResult") {
        const texts = array(message.content)
          .map(record)
          .filter((block) => block.type === "text")
          .map((block) => string(block.text));
        const text = texts.join("\n");
        toolResultBytes += Buffer.byteLength(text);
        if (message.isError === true) toolErrors += 1;
        trace.push({
          kind: "tool-result",
          name: message.toolName,
          text,
          isError: message.isError === true,
        });
      }
    } catch (error) {
      terminate(`protocol-error: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", resolveExit);
  }).finally(() => {
    clearTimeout(timeout);
    if (killTimer !== undefined) clearTimeout(killTimer);
    reader.close();
  });
  const result = {
    id,
    variant,
    taskId: task.id,
    repo: task.repo,
    category: task.category,
    repetition,
    manifestHash,
    model: { provider: model.provider, id: model.id, thinking: model.thinking },
    exitCode,
    failure: failure ?? null,
    wallTimeMs: Math.round(performance.now() - start),
    modelTurns,
    toolRounds,
    toolCalls,
    toolCounts,
    toolResultBytes,
    toolErrors,
    usage,
    finalAnswer: sanitize(finalAnswer),
    grading: grade(task, finalAnswer, exitCode === 0 && failure === undefined),
    stderr: sanitize(stderr),
  };
  await writeFile(
    join(outputRoot, `${id}.trace.json`),
    sanitize(JSON.stringify(trace, null, 2)) + "\n",
  );
  await writeFile(join(outputRoot, `${id}.json`), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(
    `${JSON.stringify({
      id,
      passed: result.grading.passed,
      toolRounds,
      toolCalls,
      toolResultBytes,
      wallTimeMs: result.wallTimeMs,
      failure: result.failure,
    })}\n`,
  );
  return result;
}

const jobs = Array.from({ length: number(manifest.repetitions) }, (_, repetition) =>
  tasks.map((task) => ({ task, repetition: repetition + 1 })),
).flat();
let nextIndex = 0;
const workers = Array.from({ length: number(limits.concurrency) }, async () => {
  const results = [];
  while (nextIndex < jobs.length) {
    const job = jobs[nextIndex++];
    if (!job) throw new Error("Evaluation job is missing");
    // oxlint-disable-next-line no-await-in-loop -- each worker owns one bounded subprocess at a time.
    results.push(await evaluate(job.task, job.repetition));
  }
  return results;
});
const results = (await Promise.all(workers))
  .flat()
  .toSorted((left, right) => left.id.localeCompare(right.id));
await writeFile(
  join(outputRoot, `${variant}-results.json`),
  JSON.stringify(results, null, 2) + "\n",
);
