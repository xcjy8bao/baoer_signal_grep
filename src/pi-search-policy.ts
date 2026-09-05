import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PI_REPLACED_SEARCH_TOOLS, SEARCH_POLICY_GUIDANCE, SearchPolicy } from "./search-policy.js";

export function registerPiSearchPolicy(pi: ExtensionAPI): void {
  const policy = new SearchPolicy(new URL("../plugins/baoer-signal-grep/hooks/", import.meta.url));
  const selectTools = () => {
    const current = pi.getActiveTools();
    const next = current.filter((tool) => !PI_REPLACED_SEARCH_TOOLS.has(tool));
    if (!next.includes("baoer_signal_grep")) next.push("baoer_signal_grep");
    if (next.length !== current.length || next.some((tool, index) => tool !== current[index]))
      pi.setActiveTools(next);
  };
  pi.on("session_start", selectTools);
  pi.on("before_agent_start", (event) => {
    selectTools();
    return { systemPrompt: `${event.systemPrompt}\n\n${SEARCH_POLICY_GUIDANCE}` };
  });
  pi.on("tool_call", async (event, ctx) => policy.check(event.toolName, event.input, ctx.signal));
}
