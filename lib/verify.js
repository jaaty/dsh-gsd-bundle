// @dsh-gsd/bundle/verify — the Verify phase tool (opengsd /gsd-verify-work and
// the verify_phase_goal step). Spawns a fresh-context gsd-verifier that reads
// the phase goal, CONTEXT decisions, plans, and execution summaries, and writes
// a VERIFICATION.md with the faithful frontmatter + status decision tree
// (passed | gaps_found | human_needed). The tool reads the status back and
// routes: passed -> suggest gsd_ship; gaps_found -> suggest gsd_plan --gaps;
// human_needed -> present the human-verification items.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { parseFrontmatter } from "./_shared.js";
import { spawnSubagent, planningContext, cwdOf } from "./_runner.js";
import { VERIFIER_PROMPT } from "./_agents.js";

const name = "gsd-verify";
const inject = ["gsdState", "tools"];

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  ctx.tools.register(defineTool({
    name: "gsd_verify",
    description: "Verify phase (opengsd /gsd-verify-work): spawn a fresh-context verifier that checks the phase goal was ACTUALLY achieved — requirement coverage, decision coverage, goal alignment, must_haves (truths/artifacts/key_links), anti-patterns — and writes VERIFICATION.md. Verification is NOT just testing. Routes on the status: passed -> ready to ship; gaps_found -> re-plan with gsd_plan --gaps; human_needed -> present the human-verification items. Prerequisite: gsd_execute has produced SUMMARY.md files.",
    parameters: {
      phase: { type: "number", required: true },
      gaps: { type: "boolean", description: "Re-verification after gap-closure: focus previously-failed items." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_verify: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_verify: no .planning/ project — run gsd_init first");
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_verify: `subagents` service unavailable");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_verify: phase ${args.phase} not in ROADMAP.md`);
      const phaseDir = await s.phaseDir(cwd, args.phase);
      const base = phaseDir.split("/").pop();

      // gather artefacts
      const project = await s.readProject(cwd);
      const reqs = (await s.readRequirements(cwd)).map((r) => `- [${r.complete ? "x" : " "}] ${r.id}: ${r.text}`).join("\n");
      const contextMd = await s.readArtifact(cwd, args.phase, "CONTEXT").catch(() => "");
      const researchMd = await s.readArtifact(cwd, args.phase, "RESEARCH").catch(() => "");
      const priorVer = await s.readArtifact(cwd, args.phase, "VERIFICATION").catch(() => "");
      const plans = await s.listPlans(cwd, args.phase);
      if (!plans.length) return `gsd_verify: no plans for phase ${args.phase}. Run gsd_plan first.`;
      const summariesMissing = plans.filter((p) => !p.has_summary);
      if (summariesMissing.length) return `gsd_verify: missing SUMMARY.md for ${summariesMissing.map((p) => p.id).join(", ")}. Run gsd_execute first.`;

      const planContents = [];
      const summaryContents = [];
      for (const p of plans) {
        planContents.push({ label: `PLAN ${p.id}`, content: await s.readArtifact(cwd, args.phase, `PLAN-${String(p.plan).padStart(2, "0")}`).catch(() => "") });
        summaryContents.push({ label: `SUMMARY ${p.id}`, content: await s.readArtifact(cwd, args.phase, `SUMMARY-${String(p.plan).padStart(2, "0")}`).catch(() => "") });
      }

      const prompt = [
        VERIFIER_PROMPT,
        planningContext([
          { label: "PROJECT.md", content: project },
          { label: "ROADMAP phase goal + success criteria", content: `Phase ${args.phase}: ${phase.name}\nGoal: ${phase.goal}\nRequirements: ${(phase.requirements || []).join(", ")}` },
          { label: "REQUIREMENTS.md", content: reqs },
          { label: "CONTEXT.md", content: contextMd },
          { label: "RESEARCH.md", content: researchMd },
          ...(priorVer ? [{ label: "prior VERIFICATION.md", content: priorVer }] : []),
          ...planContents,
          ...summaryContents,
        ]),
        args.gaps ? "\nRE-VERIFICATION MODE: focus previously-failed items; quick regression on passed truths." : "",
        `\nWrite VERIFICATION.md with the Write tool to ${phaseDir}/${base}-VERIFICATION.md. DO NOT commit it. Return: status, score, and the report path.`,
      ].filter(Boolean).join("\n\n");

      const r = await spawnSubagent(ctx, exec, { label: `verify phase ${args.phase}`, promptText: prompt });
      // read back the status from the written file (authoritative)
      const verText = await s.readArtifact(cwd, args.phase, "VERIFICATION").catch(() => "");
      let status = "gaps_found";
      let score = "";
      if (verText) {
        const { frontmatter } = parseFrontmatter(verText);
        if (frontmatter.status) status = String(frontmatter.status);
        if (frontmatter.score != null) score = String(frontmatter.score);
      }
      await s.setActivePhase(cwd, args.phase, status === "passed" ? "ship" : "verify");

      const route = {
        passed: `✓ Phase ${args.phase} verified (score ${score || "n/a"}). The phase is closed — replanning is blocked without --force. Next: gsd_ship on phase ${args.phase}.`,
        gaps_found: `✗ Phase ${args.phase}: gaps found (score ${score || "n/a"}). Next: gsd_plan on phase ${args.phase} with gaps=true to produce fix plans, then gsd_execute --gaps-only, then gsd_verify again.`,
        human_needed: `⚠ Phase ${args.phase}: human verification needed (score ${score || "n/a"}). Review the human_verification items in ${phaseDir}/${base}-VERIFICATION.md and confirm before re-verifying.`,
      }[status] || `Phase ${args.phase}: verification status "${status}". See ${phaseDir}/${base}-VERIFICATION.md.`;

      return [
        route,
        "",
        `Verifier output: ${r.output.slice(0, 500)}`,
        r.diagnostic ? `Diagnostic: ${r.diagnostic}` : "",
      ].filter(Boolean).join("\n");
    },
    presentCall: (a) => ({ card: "generic", title: `Verify phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };