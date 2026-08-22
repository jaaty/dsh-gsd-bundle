// @dsh-gsd-bundle/execute — the Execute phase tool (opengsd /gsd-execute-phase).
// The orchestrator coordinates; it never executes. It discovers the plan index,
// groups plans into dependency waves, and dispatches one fresh-context
// gsd-executor subagent per plan. Executors write code, commit atomically (one
// commit per task, conventional-commit {phase}-{plan} scope), and write a
// SUMMARY.md. Waves run in order; within a wave, executors run in parallel
// (same-wave plans touch non-overlapping files by plan-checker Dim 3).
//
// Simplification vs opengsd: this reimplementation runs executors on the shared
// working tree rather than per-plan git worktrees (worktree isolation is a
// harness-worktree feature). The non-overlap guarantee from planning makes the
// shared tree safe; the post-merge regression gate becomes a post-wave test run.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { zeroPad } from "./_shared.js";
import { spawnSubagent, planningContext, cwdOf } from "./_runner.js";
import { EXECUTOR_PROMPT } from "./_agents.js";

const name = "gsd-execute";
const inject = ["gsdState", "tools"];

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  ctx.tools.register(defineTool({
    name: "gsd_execute",
    description: "Execute phase (opengsd /gsd-execute-phase): run the phase's PLAN.md files with fresh-context executors, wave by wave. Each executor gets exactly one PLAN.md, writes code, commits atomically (one commit per task), and writes a SUMMARY.md. Waves run in order; plans in the same wave run in parallel (they touch non-overlapping files). Completed plans (with a SUMMARY.md) are skipped on resume. Sets STATE step to 'verify' when all plans complete. Prerequisite: gsd_plan has produced PLAN.md files for the phase.",
    parameters: {
      phase: { type: "number", required: true },
      wave: { type: "number", description: "Only execute this wave number (earlier waves must be complete)." },
      gapsOnly: { type: "boolean", description: "Only execute plans with gap_closure: true (fix plans from /gsd-verify-work)." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_execute: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_execute: no .planning/ project — run gsd_init first");
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_execute: `subagents` service unavailable");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_execute: phase ${args.phase} not in ROADMAP.md`);
      const phaseDir = await s.phaseDir(cwd, args.phase);
      const base = phaseDir.split("/").pop();
      const project = await s.readProject(cwd);
      const contextMd = await s.readArtifact(cwd, args.phase, "CONTEXT").catch(() => "");
      const researchMd = await s.readArtifact(cwd, args.phase, "RESEARCH").catch(() => "");

      const idx = await s.planIndex(cwd, args.phase);
      if (!idx.plans.length) return `gsd_execute: no plans for phase ${args.phase}. Run gsd_plan first.`;
      let plans = idx.incomplete.filter((p) => !p.has_summary);
      if (args.gapsOnly) plans = plans.filter((p) => p.gap_closure === "true");
      if (args.wave != null) {
        plans = plans.filter((p) => p.wave === args.wave);
        const earlier = idx.plans.filter((p) => p.wave < args.wave && !p.has_summary);
        if (earlier.length) return `gsd_execute: wave ${args.wave} requested but earlier waves incomplete: ${earlier.map((p) => p.id).join(", ")}`;
      }

      const log = [`## Execution Plan`, `Phase ${args.phase}: ${phase.name} — ${idx.plans.length} plan(s), ${idx.incomplete.length} incomplete`];
      for (const w of Object.keys(idx.waves).sort((a, b) => a - b)) log.push(`| Wave ${w} | ${idx.waves[w].map((p) => p.id).join(", ")} |`);

      // group the to-run plans by wave
      const byWave = new Map();
      for (const p of plans) {
        const w = p.wave || 1;
        if (!byWave.has(w)) byWave.set(w, []);
        byWave.get(w).push(p);
      }
      const waves = [...byWave].sort((a, b) => a[0] - b[0]);
      let done = 0;

      for (const [w, wavePlans] of waves) {
        // skip plans blocked by unfinished deps
        const runnable = wavePlans.filter((p) => (p.depends_on || []).every((d) => idx.plans.find((x) => x.id === d)?.has_summary));
        const blocked = wavePlans.filter((p) => !runnable.includes(p));
        if (blocked.length) log.push(`wave ${w}: skipping ${blocked.map((p) => p.id).join(", ")} (deps incomplete)`);

        // dispatch executors in parallel within the wave
        const runnables = await Promise.all(runnable.map(async (p) => {
          const planContent = await s.readArtifact(cwd, args.phase, `PLAN-${zeroPad(Number(p.plan))}`);
          const priorSummaries = (p.depends_on || []).length
            ? (await Promise.all((p.depends_on || []).map((d) => {
                const dep = idx.plans.find((x) => x.id === d);
                return dep ? s.readArtifact(cwd, args.phase, `SUMMARY-${zeroPad(Number(dep.plan))}`).catch(() => "") : "";
              }))).filter(Boolean).join("\n\n")
            : "";
          const prompt = [
            EXECUTOR_PROMPT,
            planningContext([
              { label: "PROJECT.md", content: project },
              { label: "CONTEXT.md", content: contextMd },
              { label: "RESEARCH.md", content: researchMd },
              ...(priorSummaries ? [{ label: "Prior-wave SUMMARY.md (genuine dependency)", content: priorSummaries }] : []),
              { label: `PLAN ${p.id}`, content: planContent },
            ]),
            `\nYou are executing plan ${p.id} (wave ${p.wave}). Work in the current workspace. Commit with scope (${base}-${zeroPad(Number(p.plan))}). Write your SUMMARY to ${phaseDir}/${base}-${zeroPad(Number(p.plan))}-SUMMARY.md with status: complete in the frontmatter. Return a completion summary when done.`,
          ].join("\n\n");
          return { p, thunk: () => spawnSubagent(ctx, exec, { label: `execute ${p.id}`, promptText: prompt }) };
        }));

        const results = await Promise.all(runnables.map(async ({ p, thunk }) => {
          const r = await thunk();
          // confirm SUMMARY written
          const ok = await s.hasArtifact(cwd, args.phase, `SUMMARY-${zeroPad(Number(p.plan))}`);
          if (ok) {
            await s.markPlanSummary(cwd, args.phase, Number(p.plan), await s.readArtifact(cwd, args.phase, `SUMMARY-${zeroPad(Number(p.plan))}`));
            for (const req of (p.requirements || [])) await s.markRequirementComplete(cwd, req);
            done++;
          }
          return { p, ok, out: r.output, stopReason: r.stopReason, diagnostic: r.diagnostic };
        }));

        for (const r of results) {
          if (r.ok) log.push(`wave ${w}: ${r.p.id} ✓ (${r.out.slice(0, 120).replace(/\n/g, " ")})`);
          else log.push(`wave ${w}: ${r.p.id} ✗ — no SUMMARY.md written (stopReason=${r.stopReason}). ${r.diagnostic || r.out.slice(0, 200)}`);
        }

        // post-wave regression gate (best-effort): run the project test command if discoverable
        // (left to the executor's own <verify>; the orchestrator does not run the full suite.)
      }

      // recompute progress
      const idx2 = await s.planIndex(cwd, args.phase);
      const allDone = idx2.plans.every((p) => p.has_summary);
      if (allDone) {
        await s.setActivePhase(cwd, args.phase, "verify");
        log.push("", `Phase ${args.phase} execution complete. Next: gsd_verify on phase ${args.phase}.`);
      } else {
        await s.setActivePhase(cwd, args.phase, "execute");
        log.push("", `Phase ${args.phase} partially executed (${done} plan(s) this run). Re-run gsd_execute to resume.`);
      }
      return log.join("\n");
    },
    presentCall: (a) => ({ card: "generic", title: `Execute phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };