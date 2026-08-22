// @dsh-gsd-bundle/plan — the Plan phase tool (opengsd /gsd-plan-phase).
// Runs three fresh-context subagents in sequence: a researcher (-> RESEARCH.md),
// a planner (-> <NN>-<PP>-PLAN.md files in dependency waves), and a plan-checker
// that verifies the 12 dimensions. A revision loop (max 3 iterations) sends the
// checker's issues back to the planner. The orchestrator (this tool) stays lean:
// it spawns agents, collects results, writes shared state, routes to the next
// step. It never writes plans itself — the planner owns them on disk.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { zeroPad, isClosedPhase } from "./_shared.js";
import { spawnSubagent, planningContext, cwdOf } from "./_runner.js";
import { RESEARCHER_PROMPT, PLANNER_PROMPT, PLAN_CHECKER_PROMPT } from "./_agents.js";

const name = "gsd-plan";
const inject = ["gsdState", "tools"];

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  ctx.tools.register(defineTool({
    name: "gsd_plan",
    description: "Plan phase (opengsd /gsd-plan-phase): research the ecosystem, decompose the phase into bounded PLAN.md files ordered into dependency waves, and verify the plans with a plan-checker (3-iteration revision loop). Spawns fresh-context subagents: gsd-phase-researcher -> RESEARCH.md, gsd-planner -> <NN>-<PP>-PLAN.md, gsd-plan-checker (12 dimensions). Prerequisite: gsd_discuss has sealed CONTEXT.md for the phase. Sets STATE step to 'execute' on success.",
    parameters: {
      phase: { type: "number", required: true },
      force: { type: "boolean", description: "Allow replanning a phase that already passed verification (clears the closed-phase gate)." },
      skipResearch: { type: "boolean", description: "Use the existing RESEARCH.md if present; do not spawn a researcher." },
      forceResearch: { type: "boolean", description: "Re-run the researcher even if RESEARCH.md exists." },
      gaps: { type: "boolean", description: "Gap-closure mode: planner produces fix plans for UAT gaps." },
      tdd: { type: "boolean" },
      mvp: { type: "boolean" },
      noTracer: { type: "boolean", description: "Opt out of the default tracer-first task." },
      granularity: { type: "string", enum: ["coarse", "standard", "fine"] },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_plan: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_plan: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_plan: phase ${args.phase} not in ROADMAP.md`);
      const phaseDir = await s.phaseDir(cwd, args.phase);
      const base = phaseDir.split("/").pop();
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_plan: `subagents` service unavailable — needs the host spawn provider");

      // closed-phase gate (--force reopens a verified phase for replanning)
      if (!args.force && await s.hasArtifact(cwd, args.phase, "VERIFICATION")) {
        const v = await s.readArtifact(cwd, args.phase, "VERIFICATION");
        if (isClosedPhase(v)) throw new Error(`gsd_plan: phase ${args.phase} already passed verification. Re-run with force=true to replan (clears the closed-phase gate).`);
      }
      // CONTEXT.md strongly recommended
      const hasContext = await s.hasArtifact(cwd, args.phase, "CONTEXT");
      if (!hasContext) return `gsd_plan: no CONTEXT.md for phase ${args.phase}. Run gsd_discuss on phase ${args.phase} first to capture implementation decisions.`;

      const cfg = await s.readConfig(cwd);
      const project = await s.readProject(cwd);
      const reqs = (await s.readRequirements(cwd)).map((r) => `- [${r.complete ? "x" : " "}] ${r.id}: ${r.text}`).join("\n");
      const contextMd = await s.readArtifact(cwd, args.phase, "CONTEXT");
      const setStep = async (step) => s.setActivePhase(cwd, args.phase, step);

      await setStep("plan");
      const log = [];

      // ── 1. Research ─────────────────────────────────────────────────────────────
      const hasResearch = await s.hasArtifact(cwd, args.phase, "RESEARCH");
      let researchMd = hasResearch ? await s.readArtifact(cwd, args.phase, "RESEARCH") : "";
      if (!args.skipResearch && (!hasResearch || args.forceResearch)) {
        const prompt = [
          RESEARCHER_PROMPT,
          planningContext([
            { label: "PROJECT.md", content: project },
            { label: "ROADMAP phase goal", content: `Phase ${args.phase}: ${phase.name}\nGoal: ${phase.goal}\nRequirements: ${(phase.requirements || []).join(", ")}` },
            { label: "REQUIREMENTS.md", content: reqs },
            { label: "CONTEXT.md", content: contextMd },
          ]),
          `\nWrite your RESEARCH.md output as the FULL file contents. The orchestrator will save it to ${phaseDir}/${base}-RESEARCH.md.`,
        ].join("\n\n");
        const r = await spawnSubagent(ctx, exec, { label: `plan research phase ${args.phase}`, promptText: prompt });
        if (!r.output || r.output.trim().length < 50) return `gsd_plan: researcher returned no usable RESEARCH.md (stopReason=${r.stopReason}). ${r.diagnostic || ""}`;
        researchMd = r.output;
        await s.writeArtifact(cwd, args.phase, "RESEARCH", researchMd);
        log.push(`researcher: RESEARCH.md written (${researchMd.length} chars).`);
      } else {
        log.push(`researcher: skipped (using existing RESEARCH.md).`);
      }

      // ── 2. Plan ─────────────────────────────────────────────────────────────────
      const prior = args.gaps ? await s.readArtifact(cwd, args.phase, "VERIFICATION").catch(() => "") : "";
      const uat = args.gaps ? await s.readArtifact(cwd, args.phase, "UAT").catch(() => "") : "";
      const plannerPrompt = [
        PLANNER_PROMPT,
        planningContext([
          { label: "PROJECT.md", content: project },
          { label: "ROADMAP phase", content: `Phase ${args.phase}: ${phase.name}\nGoal: ${phase.goal}\nRequirements: ${(phase.requirements || []).join(", ")}` },
          { label: "REQUIREMENTS.md", content: reqs },
          { label: "CONTEXT.md", content: contextMd },
          { label: "RESEARCH.md", content: researchMd },
          ...(args.gaps ? [{ label: "prior VERIFICATION.md (gap-closure)", content: prior }, { label: "UAT.md (gaps)", content: uat }] : []),
        ]),
        `\nMODE: ${args.gaps ? "gap_closure" : "standard"}.`,
        args.tdd ? "TDD: every behaviour-adding task is RED->GREEN->REFACTOR (type: tdd)." : "",
        args.mvp ? "MVP: frame the goal as a user story; lead with a Walking Skeleton slice." : "",
        args.noTracer ? "Tracer-first DISABLED — use horizontal layering." : "Tracer-first ENABLED — lead each plan with a tracer task.",
        args.granularity ? `Granularity: ${args.granularity}.` : "",
        `\nWrite each plan to ${phaseDir}/${base}-<PP>-PLAN.md (zero-padded PP, e.g. ${base}-01-PLAN.md). Use the Write tool. When done, return one of: ## PLANNING COMPLETE / ## PHASE SPLIT RECOMMENDED / ## ⚠ Source Audit / ## CHECKPOINT REACHED / ## PLANNING INCONCLUSIVE.`,
      ].filter(Boolean).join("\n\n");
      const plannerRes = await spawnSubagent(ctx, exec, { label: `planner phase ${args.phase}`, promptText: plannerPrompt });
      log.push(`planner: ${plannerRes.output.slice(0, 200).replace(/\n/g, " ")}`);
      if (/PHASE SPLIT RECOMMENDED/i.test(plannerRes.output)) {
        return `gsd_plan: planner recommends a phase split.\n\n${plannerRes.output}\n\nSplit the phase in ROADMAP (gsd_new_milestone or edit ROADMAP) before re-planning.`;
      }

      // ── 3. Verify (revision loop, max 3) ────────────────────────────────────────
      let plans = await s.listPlans(cwd, args.phase);
      if (!plans.length) return `gsd_plan: planner produced no PLAN.md files in ${phaseDir}. ${plannerRes.output}`;
      let issues = await runChecker(ctx, exec, s, cwd, args.phase, plans, phase, contextMd, researchMd, reqs);
      let iter = 0;
      while (issues && iter < 3) {
        iter++;
        log.push(`plan-checker iteration ${iter}: ISSUES FOUND — revising.`);
        const revisePrompt = [
          PLANNER_PROMPT,
          `The plan-checker found the issues below. REVISE the existing plans at ${phaseDir}/${base}-<PP>-PLAN.md to address every BLOCKER (WARNINGs are advisory). Keep the same plan ids unless a split is required. Re-write the changed files with the Write tool.`,
          `\n## CHECKER ISSUES\n${issues}`,
          `\nReturn ## PLANNING COMPLETE when revisions are done.`,
        ].join("\n\n");
        await spawnSubagent(ctx, exec, { label: `planner revise ${args.phase} #${iter}`, promptText: revisePrompt });
        plans = await s.listPlans(cwd, args.phase);
        issues = await runChecker(ctx, exec, s, cwd, args.phase, plans, phase, contextMd, researchMd, reqs);
      }

      // ── 4. Requirements coverage gate ────────────────────────────────────────────
      const phaseReqs = new Set(phase.requirements || []);
      const covered = new Set();
      for (const p of plans) for (const r of (p.requirements || [])) covered.add(r);
      const missing = [...phaseReqs].filter((r) => !covered.has(r));
      if (missing.length) log.push(`WARNING: requirements not covered by any plan: ${missing.join(", ")}`);

      await setStep("execute");
      await s.addDecision(cwd, `Phase ${args.phase}: planned — ${plans.length} plan(s) across ${new Set(plans.map((p) => p.wave)).size} wave(s)${issues ? "; checker issues remain after 3 iterations (manual review)" : ""}.`);
      const waveSummary = [...new Set(plans.map((p) => p.wave))].sort().map((w) => `wave ${w}: ${plans.filter((p) => p.wave === w).map((p) => p.id).join(", ")}`).join("\n");
      return [
        `gsd_plan complete for phase ${args.phase} (${phase.name}).`,
        ...log,
        "",
        "## Execution Plan",
        `Phase ${args.phase}: ${phase.name} — ${plans.length} plan(s)`,
        waveSummary,
        "",
        issues ? `WARNING: plan-checker still reports issues after ${iter} iteration(s) — review before executing:\n${issues}` : "plan-checker: VERIFICATION PASSED.",
        missing.length ? `WARNING: uncovered requirements: ${missing.join(", ")}` : "",
        "Next: gsd_execute on phase " + args.phase + ".",
      ].filter(Boolean).join("\n");
    },
    presentCall: (a) => ({ card: "generic", title: `Plan phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));

  async function runChecker(ctx, exec, s, cwd, phaseNum, plans, phase, contextMd, researchMd, reqs) {
    const planContents = [];
    for (const p of plans) {
      const c = await s.readArtifact(cwd, phaseNum, `PLAN-${zeroPad(Number(p.plan))}`).catch(() => null);
      if (c) planContents.push({ label: `PLAN ${p.id}`, content: c });
    }
    const prompt = [
      PLAN_CHECKER_PROMPT,
      planningContext([
        { label: "REQUIREMENTS.md", content: reqs },
        { label: "CONTEXT.md", content: contextMd },
        { label: "RESEARCH.md", content: researchMd },
        ...planContents,
      ]),
      `\nReturn ## VERIFICATION PASSED or ## ISSUES FOUND (structured: severity, dimension, plan, issue, fix).`,
    ].join("\n\n");
    const r = await spawnSubagent(ctx, exec, { label: `plan-checker phase ${phaseNum}`, promptText: prompt });
    if (/VERIFICATION PASSED/i.test(r.output)) return null;
    return r.output;
  }
}

export { name, inject, apply };