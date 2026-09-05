#!/usr/bin/env node
import { SearchPolicy } from "./search-policy.js";

const MAX_HOOK_INPUT_BYTES = 256 * 1024;

async function hookInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.byteLength;
    if (size > MAX_HOOK_INPUT_BYTES) throw new Error("Search policy hook input exceeds 256 KiB");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function deny(reason: string): void {
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })}\n`,
  );
}

const inputTimer = setTimeout(() => {
  process.stderr.write("baoer_signal_grep search policy: hook input timed out\n");
  process.exit(2);
}, 3000);
try {
  const input = await hookInput();
  clearTimeout(inputTimer);
  if (
    typeof input !== "object" ||
    input === null ||
    !("hook_event_name" in input) ||
    input.hook_event_name !== "PreToolUse" ||
    !("tool_name" in input) ||
    typeof input.tool_name !== "string" ||
    !("tool_input" in input)
  )
    throw new Error("Search policy received an invalid PreToolUse payload");
  const decision = await new SearchPolicy(new URL("./", import.meta.url)).check(
    input.tool_name,
    input.tool_input,
  );
  if (decision) deny(decision.reason);
} catch (error) {
  clearTimeout(inputTimer);
  // Do not echo command text, paths, or JSON parse errors that could contain credentials.
  deny(
    error instanceof Error && error.message.startsWith("Search policy")
      ? error.message
      : "baoer_signal_grep search policy failed; repair or disable this plugin before retrying",
  );
}
