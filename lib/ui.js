// @dsh-gsd/bundle/ui — the optional UI design phase tool (opengsd /gsd-ui-phase).
// Placed between Discuss and Plan for phases with a non-trivial visual
// component. Orchestrates gsd-ui-researcher (-> UI-SPEC.md) and gsd-ui-checker
// (verify the spec is complete enough that two executors would not diverge).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { contextBudget } from "./_shared.js";
import { spawnSubagent, planningContext, cwdOf } from "./_runner.js";
import { commitArtifacts } from "./_git-artifacts.js";
import { UI_RESEARCHER_PROMPT, UI_CHECKER_PROMPT } from "./_agents.js";
import { buildCapability } from "./_capabilities.js";

const name = "gsd-ui";
const inject = ["gsdState", "tools", "subagents"];

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this plugin's capability (DEGR-01/D-02). Auto-tracked revertible
  // effect (D-09): retiring the ui plugin withdraws gsdUi.
  ctx.provide("gsdUi", buildCapability("gsdUi"));

  ctx.tools.register(defineTool({
    name: "gsd_ui_phase",
    description: "UI design phase (opengsd /gsd-ui-phase, optional): produce a UI-SPEC.md design contract (layout, interaction, visual behaviour) for a phase with a visual component, BEFORE planning. Orchestrates a ui-researcher (writes the spec) and a ui-checker (verifies completeness). Run between gsd_discuss and gsd_plan only when the UI is complex enough that ambiguity would produce divergent implementations.",
    parameters: {
      phase: { type: "number", required: true },
      notes: { type: "string", description: "Optional UI notes / references / constraints to seed the researcher." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_ui_phase: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_ui_phase: no .planning/ project — run gsd_init first");
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_ui_phase: `subagents` service unavailable");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_ui_phase: phase ${args.phase} not in ROADMAP.md`);
      const contextMd = await s.readArtifact(cwd, args.phase, "CONTEXT").catch(() => "");
      const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);
      const maxBudget = contextBudget((await s.readConfig(cwd))?.context_window);

      await s.setActivePhase(cwd, args.phase, "ui");

      const notes = [];
      const pc = planningContext(
        [
          { label: "Phase goal", content: `Phase ${args.phase}: ${phase.name}\nGoal: ${phase.goal}` },
          { label: "CONTEXT.md", content: contextMd },
          ...(args.notes ? [{ label: "UI notes", content: args.notes }] : []),
        ],
        60000, maxBudget,
      );
      if (pc.truncated.length) notes.push(`planning-context: truncated ${pc.truncated.length} ${pc.truncated.length === 1 ? "entry" : "entries"} (${pc.truncated.map((t) => t.label).join(", ")}) — capping total context to ${maxBudget} chars`);
      const rPrompt = [
        UI_RESEARCHER_PROMPT,
        pc.text,
        `\nWrite your UI-SPEC.md output as the FULL file contents. The orchestrator will save it to ${phaseDir}/${base}-UI-SPEC.md.`,
      ].join("\n\n");
      const r = await spawnSubagent(ctx, exec, { label: `ui-researcher phase ${args.phase}`, promptText: rPrompt });
      if (!r.output || r.output.trim().length < 50) return `gsd_ui_phase: ui-researcher returned no usable spec (stopReason=${r.stopReason}). ${r.diagnostic || ""}`;
      await s.writeArtifact(cwd, args.phase, "UI-SPEC", r.output);

      // D-10: auto-commit the UI-SPEC onto the currently checked-out branch via
      // the shared seam (best-effort, never throws). Reuses the existing ui
      // scope token message shape `docs(planning): phase <N> <slug> ui artefacts`.
      const commit = await commitArtifacts(cwd, args.phase, { scope: "ui", phaseName: phase.name });

      // verify
      const spec = await s.readArtifact(cwd, args.phase, "UI-SPEC");
      const pc2 = planningContext([{ label: "UI-SPEC.md", content: spec }], 60000, maxBudget);
      if (pc2.truncated.length) notes.push(`planning-context: truncated ${pc2.truncated.length} ${pc2.truncated.length === 1 ? "entry" : "entries"} (${pc2.truncated.map((t) => t.label).join(", ")}) — capping total context to ${maxBudget} chars`);
      const cPrompt = [
        UI_CHECKER_PROMPT,
        pc2.text,
        `\nReturn ## VERIFICATION PASSED or ## ISSUES FOUND.`,
      ].join("\n\n");
      const c = await spawnSubagent(ctx, exec, { label: `ui-checker phase ${args.phase}`, promptText: cPrompt });
      const passed = /VERIFICATION PASSED/i.test(c.output);
      await s.setActivePhase(cwd, args.phase, "plan");
      return [
        `gsd_ui_phase complete for phase ${args.phase}. UI-SPEC.md written.`,
        `ui-spec committed: ${commit.committed}.`,
        passed ? "ui-checker: VERIFICATION PASSED." : `ui-checker ISSUES:\n${c.output}`,
        "Next: gsd_plan on phase " + args.phase + ".",
        ...notes,
      ].join("\n");
    },
    presentCall: (a) => ({ card: "generic", title: `UI phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };