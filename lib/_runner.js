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

// Build a <planning_context> block from a list of {label, content} entries.
//
// Per-file: any content longer than `maxPerFile` is sliced to `maxPerFile` with
// an inline "…(truncated)…" marker appended (unchanged default semantics).
// Total budget: when `maxTotal > 0`, the summed length of all entry CONTENT
// (labels/fences/blank lines excluded per D-01) may not exceed `maxTotal` — whole
// entries are dropped from the END first (head/earliest preserved), and only if
// the remaining head still exceeds the budget is that last kept entry trimmed to
// fit. `maxTotal <= 0` means "no total cap" (the per-file cap still applies).
// Dedup: an entry whose coerced content string is byte-identical to an already
// kept entry is skipped (first occurrence wins). Empty / null / undefined /
// whitespace-only entries are skipped. Non-string content is coerced with
// String(). Returns `{ text, truncated }` where `text` is the assembled block and
// `truncated` is the list of `{ label, originalChars, keptChars }` for every
// entry whose final kept length is below its original length (covers per-file
// caps, total-budget drops and trims, including fully-dropped entries with
// keptChars 0). When any truncation occurs, an inline audit line naming the
// truncated labels is appended inside the block so the fresh subagent sees the
// elision.
export function planningContext(entries, maxPerFile = 60000, maxTotal = 0) {
  const seen = new Set();
  const kept = [];
  for (const e of entries) {
    if (!e || e.content === undefined || e.content === null) continue;
    const raw = String(e.content);
    if (raw.trim() === "") continue; // empty/null/undefined/whitespace-only skip
    if (seen.has(raw)) continue; // exact-content dedup, first occurrence wins
    seen.add(raw);
    let c = raw;
    if (c.length > maxPerFile) c = c.slice(0, maxPerFile) + "\n…(truncated)…\n";
    kept.push({ label: e.label, content: c, originalChars: raw.length, keptChars: c.length });
  }
  // Total budget (maxTotal <= 0 means no total cap). Trim from the END.
  if (maxTotal > 0) {
    let sum = kept.reduce((acc, k) => acc + k.content.length, 0);
    if (sum > maxTotal) {
      for (let i = kept.length - 1; i >= 1 && sum > maxTotal; i--) {
        sum -= kept[i].content.length;
        kept[i].content = "";
        kept[i].keptChars = 0;
      }
      if (sum > maxTotal) {
        const head = kept[0];
        head.content = head.content.slice(0, Math.max(0, maxTotal));
        head.keptChars = head.content.length;
      }
    }
  }
  const truncated = kept
    .filter((k) => k.keptChars < k.originalChars)
    .map((k) => ({ label: k.label, originalChars: k.originalChars, keptChars: k.keptChars }));
  const parts = ["<planning_context>"];
  for (const k of kept) {
    if (k.keptChars === 0) continue; // fully-dropped trailing entry
    parts.push(`### ${k.label}`, "```", k.content, "```", "");
  }
  if (truncated.length > 0) {
    const labels = truncated.map((t) => t.label).join(", ");
    parts.push(`…(${truncated.length} entries truncated: ${labels})…`);
  }
  parts.push("</planning_context>");
  return { text: parts.join("\n"), truncated };
}

export function cwdOf(exec) {
  return exec?.agent?.session?.header?.cwd || process.cwd();
}