// @dsh-gsd/bundle/discuss — the Discuss phase tool. opengsd's discuss-phase
// holds a lightweight conversation to capture HOW to build (not just WHAT) and
// seals a CONTEXT.md. The model gathers the decisions through conversation
// (ask_user_question), then calls gsd_discuss to write the sealed artefact:
// the seven blocks <domain> <decisions> <canonical_refs> <code_context>
// <specifics> <deferred>, D-NN decision ids, and the mandatory footer.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today, slugify } from "./_shared.js";

const name = "gsd-discuss";
const inject = ["gsdState", "tools"];

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  ctx.tools.register(defineTool({
    name: "gsd_discuss",
    description: "Discuss phase (opengsd /gsd-discuss-phase): seal the implementation decisions for a phase into .planning/phases/<NN>-<slug>/<NN>-CONTEXT.md. First hold the discussion with the user to capture HOW to build (libraries, error strategy, per-route vs global, edge-case behaviour); then call this tool with the structured decisions. Writes the seven CONTEXT blocks (domain, decisions with D-NN ids, canonical_refs — mandatory, code_context, specifics, deferred), a DISCUSSION-LOG.md audit trail, advances STATE to 'Ready for planning', and commits. Prerequisite: gsd_init run; the phase exists in ROADMAP.md.",
    parameters: {
      phase: { type: "number", required: true, description: "Phase number from ROADMAP.md." },
      domain: {
        type: "object", additionalProperties: false,
        description: "Phase boundary.",
        properties: {
          in_scope: { type: "string", description: "What this phase delivers." },
          out_of_scope: { type: "string", description: "What is explicitly out of scope." },
        },
      },
      decisions: {
        type: "array", required: true,
        description: "Decision areas. Each: { area, items: [{ id (D-NN), text }] }.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            area: { type: "string", required: true },
            items: {
              type: "array",
              items: {
                type: "object", additionalProperties: false,
                properties: {
                  id: { type: "string", required: true, description: "Decision id, e.g. D-01." },
                  text: { type: "string", required: true },
                },
              },
            },
          },
        },
      },
      discretion: { type: "array", description: "Delegated areas left to the executor's judgement.", items: { type: "string" } },
      canonical_refs: {
        type: "array",
        description: "Mandatory canonical references. Each: { topic, refs: [path — description] }.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            topic: { type: "string", required: true },
            refs: { type: "array", items: { type: "string" } },
          },
        },
      },
      code_context: { type: "array", description: "Reusable assets / patterns / integration points found in the codebase.", items: { type: "string" } },
      specifics: { type: "array", description: "Concrete 'I want it like X' references captured verbatim.", items: { type: "string" } },
      deferred: { type: "array", description: "Ideas belonging in other phases.", items: { type: "string" } },
      discussionLog: { type: "string", description: "Optional human-readable audit trail for DISCUSSION-LOG.md." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
      const s = gsd();
      if (!s) throw new Error("gsd_discuss: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_discuss: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_discuss: phase ${args.phase} not in ROADMAP.md`);
      const iso = nowIso();
      const date = today();

      // ── assemble CONTEXT.md (faithful 7-block structure) ──────────────────────
      const lines = [
        `# Phase ${args.phase}: ${phase.name} - Context`,
        "",
        `**Gathered:** ${iso}`,
        "**Status:** Ready for planning",
        "",
        "<domain>",
        "## Phase Boundary",
        `**In scope:** ${args.domain?.in_scope || phase.goal}`,
        `**Out of scope:** ${args.domain?.out_of_scope || "(not specified)"}`,
        "</domain>",
        "",
        "<decisions>",
        "## Decisions",
      ];
      for (const area of (args.decisions || [])) {
        lines.push(`### ${area.area}`);
        for (const it of (area.items || [])) lines.push(`- **${it.id}:** ${it.text}`);
      }
      if (args.discretion?.length) {
        lines.push("### Claude's Discretion");
        for (const d of args.discretion) lines.push(`- ${d}`);
      }
      lines.push("</decisions>", "");

      lines.push("<canonical_refs>", "## Canonical References", "", "**Downstream agents MUST read these before planning or implementing.**", "");
      if (args.canonical_refs?.length) {
        for (const c of args.canonical_refs) {
          lines.push(`### ${c.topic}`);
          for (const r of (c.refs || [])) lines.push(`- \`${r}\``);
        }
      } else {
        lines.push("No external specs — requirements fully captured in decisions above");
      }
      lines.push("</canonical_refs>", "");

      lines.push("<code_context>", "## Code Context");
      (args.code_context?.length ? args.code_context : ["(none identified)"]).forEach((c) => lines.push(`- ${c}`));
      lines.push("</code_context>", "");

      lines.push("<specifics>", "## Specifics");
      (args.specifics?.length ? args.specifics : ["(none)"]).forEach((c) => lines.push(`- ${c}`));
      lines.push("</specifics>", "");

      lines.push("<deferred>", "## Deferred Ideas");
      (args.deferred?.length ? args.deferred : ["(none)"]).forEach((c) => lines.push(`- ${c}`));
      lines.push("</deferred>", "");

      lines.push("", "---", "", `*Phase: ${String(args.phase).padStart(2, "0")}-${slugify(phase.name)}*`, `*Context gathered: ${date}*`);

      const ctxPath = await s.writeArtifact(cwd, args.phase, "CONTEXT", lines.join("\n"));
      if (args.discussionLog) await s.writeArtifact(cwd, args.phase, "DISCUSSION-LOG", `# Phase ${args.phase}: ${phase.name} — Discussion Log\n\n${args.discussionLog}\n`);

      // advance STATE: this phase is now ready for planning
      await s.setActivePhase(cwd, args.phase, "plan");
      await s.addDecision(cwd, `Phase ${args.phase}: CONTEXT.md sealed — ${(args.decisions || []).reduce((n, a) => n + (a.items || []).length, 0)} decisions`);

      return `Discuss complete for phase ${args.phase} (${phase.name}). Wrote ${ctxPath}. STATE advanced to 'plan'. Next: gsd_plan on phase ${args.phase}.`;
    },
    presentCall: (a) => ({ card: "generic", title: `Discuss phase ${a.phase}`, kind: "other", rawInput: { decisions: (a.decisions || []).length } }),
  }));
}

export { name, inject, apply };