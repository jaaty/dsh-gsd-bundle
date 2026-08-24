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
//
// Checkpoint-resume (phase 4): an executor that stops at a checkpoint:* task
// returns a structured checkpoint object via spawnSubagent's result.structured.
// The orchestrator persists that as the per-plan <base>-<PP>-CHECKPOINT.md
// artefact (via writeArtifact) and leaves the plan incomplete (no SUMMARY, so it
// stays in the incomplete set). On a later run, gsd_execute reads that artefact,
// validates last_completed_task against the plan's task_count (fail-loud on a
// corrupt/out-of-range value rather than silently re-running from task 1), and
// appends a "RESUME from checkpoint: tasks 1..N done, begin at N+1" instruction
// plus the recorded context to the executor prompt. When a SUMMARY confirms the
// plan completed, any stale CHECKPOINT artefact is removed (SUMMARY wins).

import { defineTool } from "@deepseek-ai/dsh-tools";
import { zeroPad, matchesGapClosure, nowIso, parseFrontmatter, stringifyFrontmatter, resolvePlanDep, decisionIdFor, awaitingDecision, awaitingMarker } from "./_shared.js";
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
      "answer": { type: "string", description: "The human's answer to a pending decision checkpoint; applied to the matching decision_id on resume (D-03/D-06)." },
      "decision_id": { type: "string", description: "Identifier of the pending decision this answer answers; must match the checkpoint's stored decision_id to be applied (D-03/D-06)." },
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
      if (args.gapsOnly) plans = plans.filter((p) => matchesGapClosure(p.gap_closure));
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
      // DUR-03/D-04 write-path timestamps + window step captured once per run.
      const startedAt = nowIso();
      const fmStatus = (await s.readState(cwd)).frontmatter;
      const step = fmStatus.status || "execute";

      for (const [w, wavePlans] of waves) {
        // skip plans blocked by unfinished deps
        const runnable = wavePlans.filter((p) => (p.depends_on || []).every((d) => resolvePlanDep(idx.plans, d)?.has_summary));
        const blocked = wavePlans.filter((p) => !runnable.includes(p));
        if (blocked.length) log.push(`wave ${w}: skipping ${blocked.map((p) => p.id).join(", ")} (deps incomplete)`);

        // dispatch executors in parallel within the wave
        const runnables = await Promise.all(runnable.map(async (p) => {
          const planContent = await s.readArtifact(cwd, args.phase, `PLAN-${zeroPad(Number(p.plan))}`);
          const priorSummaries = (p.depends_on || []).length
            ? (await Promise.all((p.depends_on || []).map((d) => {
                const dep = resolvePlanDep(idx.plans, d);
                return dep ? s.readArtifact(cwd, args.phase, `SUMMARY-${zeroPad(Number(dep.plan))}`).catch(() => "") : "";
              }))).filter(Boolean).join("\n\n")
            : "";
          // DUR-02 / D-03 / D-04 / D-05: a persisted CHECKPOINT-<PP> (with no
          // SUMMARY) makes this plan resumable — skip tasks 1..N, begin at N+1.
          // D-01/D-05 (conversational UAT): a checkpointed plan with no available
          // human answer is AWAITING — gsd_execute returns a GSD_AWAITING_HUMAN
          // marker and spawns no executor. D-02: the marker handoff is the only
          // human channel — never an inline blocking prompt in this tool.
          const cpSuffix = `CHECKPOINT-${zeroPad(Number(p.plan))}`;
          let resumeInstr = "";
          let checkpointFm = null;
          if (await s.hasArtifact(cwd, args.phase, cpSuffix)) {
            const cpText = await s.readArtifact(cwd, args.phase, cpSuffix);
            const { frontmatter } = parseFrontmatter(cpText);
            checkpointFm = frontmatter;
            const n = frontmatter.last_completed_task;
            if (!Number.isInteger(n) || n < 1 || n >= p.task_count) {
              throw new Error(`gsd_execute: invalid ${cpSuffix} artefact for plan ${p.id}: last_completed_task=${n}, task_count=${p.task_count}`);
            }
            resumeInstr = `RESUME from checkpoint: tasks 1..${n} are done; begin at task ${n + 1}. Prior checkpoint context:\n${cpText}`;
          }
          // D-05: awaiting gate — if the plan is checkpointed but no human answer
          // is available (neither a matching answer+decision_id on this call nor a
          // persisted human_answer), do NOT execute; emit the marker instead.
          const awaiting = checkpointFm ? awaitingDecision(checkpointFm, args.answer, args.decision_id) : false;
          if (awaiting) {
            return {
              p,
              awaiting: true,
              marker: awaitingMarker({
                plan: p.id,
                decision_id: checkpointFm.decision_id || decisionIdFor(p.id, checkpointFm.last_completed_task),
                kind: checkpointFm.checkpoint_kind || "decision",
                question: checkpointFm.checkpoint_reason || "",
              }),
            };
          }
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
            ...(resumeInstr ? [resumeInstr] : []),
          ].join("\n\n");
          // DUR-04/D-03: record the planned executor as a running async job
          // (registry only — gsd_execute reconciles it to done/failed below).
          const job = await s.appendJob(cwd, {
            kind: "subagent", plan: p.id, phase: args.phase,
            status: "running", started: startedAt,
          });
          return { p, job, thunk: () => spawnSubagent(ctx, exec, { label: `execute ${p.id}`, promptText: prompt }) };
        }));

        // D-05: collect awaiting markers — these plans are never dispatched, so
        // their marker lines must be appended to the log outside the dispatch.
        const awaitingMarkers = runnables.filter((r) => r.awaiting).map((r) => r.marker);

        const results = await Promise.all(runnables.filter((r) => !r.awaiting).map(async ({ p, thunk, job }) => {
          const r = await thunk();
          // A checkpoint stop: the executor returned structured checkpoint state
          // (no SUMMARY) — persist it as the per-plan CHECKPOINT-<PP> artefact so
          // a later run can resume (DUR-01, D-01).
          const cp = r.structured?.checkpoint;
          if (cp && typeof cp === "object") {
            if (!Number.isInteger(cp.last_completed_task) || cp.last_completed_task < 1 || cp.last_completed_task >= p.task_count) {
              throw new Error(`gsd_execute: executor returned invalid checkpoint for plan ${p.id}: last_completed_task=${cp.last_completed_task}, task_count=${p.task_count}`);
            }
            await s.writeArtifact(cwd, args.phase, `CHECKPOINT-${zeroPad(Number(p.plan))}`, stringifyFrontmatter({
              plan: p.id,
              last_completed_task: cp.last_completed_task,
              checkpoint_reason: cp.checkpoint_reason ?? null,
              committed_hashes: cp.committed_hashes ?? [],
            }));
            // DUR-04: reconcile the running job to a terminal status. A checkpoint
            // stop is a resumable (non-failure) stop, so the job records 'done'
            // with a 'checkpointed' result rather than being left 'running'.
            if (job) {
              const updated = await s.updateJob(cwd, job.id, { status: "done", result: "checkpointed (resumable)" }).catch(() => null);
              if (!updated) log.push(`wave ${w}: ${p.id} job ${job.id} reconcile skipped (record absent)`);
            }
            return { p, ok: false, checkpointed: true, checkpointed_at: cp.last_completed_task, out: r.output, stopReason: r.stopReason, diagnostic: r.diagnostic };
          }
          // confirm SUMMARY written
          const ok = await s.hasArtifact(cwd, args.phase, `SUMMARY-${zeroPad(Number(p.plan))}`);
          if (ok) {
            // D-06: a completed SUMMARY wins over any stale CHECKPOINT artefact.
            const cpSuffix = `CHECKPOINT-${zeroPad(Number(p.plan))}`;
            if (await s.hasArtifact(cwd, args.phase, cpSuffix)) await s.removeArtifact(cwd, args.phase, cpSuffix);
            await s.markPlanSummary(cwd, args.phase, Number(p.plan), await s.readArtifact(cwd, args.phase, `SUMMARY-${zeroPad(Number(p.plan))}`));
            for (const req of (p.requirements || [])) await s.markRequirementComplete(cwd, req);
            done++;
          }
          // DUR-04/D-07: reconcile the running job to a terminal status. A
          // CHECKPOINT-<PP> artefact means the executor stopped at a resumable
          // checkpoint (not a failure) even though no SUMMARY was written.
          const checkpointed = await s.hasArtifact(cwd, args.phase, `CHECKPOINT-${zeroPad(Number(p.plan))}`);
          const jobStatus = checkpointed ? "done" : (ok ? "done" : "failed");
          const jobResult = checkpointed
            ? "checkpointed (resumable)"
            : (ok ? "SUMMARY written" : (r.stopReason || (r.output || "").slice(0, 120)));
          if (job) {
            const updated = await s.updateJob(cwd, job.id, { status: jobStatus, result: jobResult }).catch(() => null);
            if (!updated) log.push(`wave ${w}: ${p.id} job ${job.id} reconcile skipped (record absent)`);
          }
          return { p, ok, out: r.output, stopReason: r.stopReason, diagnostic: r.diagnostic };
        }));

        for (const r of results) {
          if (r.checkpointed) log.push(`wave ${w}: ${r.p.id} ⏸ checkpointed at task ${r.checkpointed_at}`);
          else if (r.ok) log.push(`wave ${w}: ${r.p.id} ✓ (${r.out.slice(0, 120).replace(/\n/g, " ")})`);
          else log.push(`wave ${w}: ${r.p.id} ✗ — no SUMMARY.md written (stopReason=${r.stopReason}). ${r.diagnostic || r.out.slice(0, 200)}`);
        }
        // D-01/D-05: append the awaiting markers for plans that were NOT executed
        // because they await a human decision. Each line is the stable marker the
        // driving agent regex-detects and turns into a host-level question handoff.
        for (const m of awaitingMarkers) log.push(m);

        // post-wave regression gate (best-effort): run the project test command if discoverable
        // (left to the executor's own <verify>; the orchestrator does not run the full suite.)
      }

      // DUR-03/D-07: record ONE window per gsd_execute run (append-only ledger).
      // On the resume path a CHECKPOINT-<PP> artefact exists for the resumed
      // plan; carry that plan id as the window's checkpoint reference so a later
      // session can jump from the window log to the exact checkpoint.
      const resumed = [];
      for (const p of plans) {
        if (await s.hasArtifact(cwd, args.phase, `CHECKPOINT-${zeroPad(Number(p.plan))}`)) resumed.push(p.id);
      }
      await s.appendWindow(cwd, {
        phase: String(args.phase),
        step,
        summary: `Executed ${done}/${idx.plans.length} plans`,
        ...(resumed.length ? { checkpoint: resumed[0] } : {}),
      });

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
