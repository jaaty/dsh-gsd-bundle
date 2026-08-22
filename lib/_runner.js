// @dsh-gsd/bundle internal — spawn a fresh-context subagent via the host
// `subagents` service (the in-process `spawn` provider gives a clean-context
// child, exactly opengsd's fresh-context researcher/planner/executor/verifier)
// and collect its settled output.

import { blocksToText } from "./_shared.js";

export async function spawnSubagent(ctx, exec, { label, promptText, outputSchema }) {
  const subagents = ctx.get("subagents");
  if (!subagents) throw new Error("gsd: the `subagents` service is unavailable — the bundle needs the host spawn provider (@deepseek-ai/dsh-subagent + dsh-subagent-spawn-in-process)");
  const provider = subagents.getProvider ? subagents.getProvider("spawn") : undefined;
  if (!provider) throw new Error("gsd: the `spawn` subagent provider is not registered — install/enable @deepseek-ai/dsh-subagent-spawn-in-process");
  const req = {
    label: label || "gsd subagent",
    prompt: [{ type: "text", text: promptText }],
    parent: exec.agent,
    signal: exec.signal,
  };
  if (outputSchema) req.outputSchema = outputSchema;
  const run = await subagents.start("spawn", req);
  try {
    const result = await run.result;
    return {
      output: blocksToText(result.output),
      stopReason: result.stopReason,
      diagnostic: result.diagnostic,
      structured: result.structured,
    };
  } finally {
    run.dispose();
  }
}

// Build a <planning_context> block from a list of {label, content} entries,
// truncating very large artefacts so a fresh 200k context stays usable.
export function planningContext(entries, maxPerFile = 60000) {
  const parts = ["<planning_context>"];
  for (const e of entries) {
    if (!e || e.content === undefined || e.content === null || e.content === "") continue;
    let c = String(e.content);
    if (c.length > maxPerFile) c = c.slice(0, maxPerFile) + "\n…(truncated)…\n";
    parts.push(`### ${e.label}`, "```", c, "```", "");
  }
  parts.push("</planning_context>");
  return parts.join("\n");
}

export function cwdOf(exec) {
  return exec?.agent?.session?.header?.cwd || process.cwd();
}