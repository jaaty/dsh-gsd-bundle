// @dsh-gsd/bundle/quick — the sub-threshold path (opengsd /gsd-quick). For work
// below the loop's threshold (could be fully specified in a single short
// prompt and done in one agent turn): a single fresh-context subagent does the
// task with GSD guarantees (reads STATE.md first, commits atomically) and
// records a one-line entry under .planning/quick/<YYYYMMDD>-<slug>/. No phase
// loop, no plan-checker, no verifier — the lightweight primitive.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { slugify, today, nowIso, parseFrontmatter } from "./_shared.js";
import { spawnSubagent, cwdOf } from "./_runner.js";
import { commitArtifacts, ensurePhaseBranch } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { buildAutoContext } from "./autonomous.js";

const name = "gsd-quick";
const inject = ["gsdState", "tools", "subagents"];

const QUICK_PROMPT = `You are running a gsd-quick task — a small job below the GSD phase-loop threshold.
- Orient: read .planning/STATE.md if it exists, so you don't collide with in-flight work.
- Do the task. Use existing functions and patterns over new machinery.
- Commit atomically with a conventional-commit message; do not blanket "git add -A".
- Write a one-line summary of what you did and the commit hash.
Return that summary.`;

// The fast-mode executor prompt (D-08: wording is executor discretion). The
// single fresh-context executor performs the phase goal in one pass, commits its
// source atomically (mirroring the full-loop executor — commitArtifacts only
// stages .planning, so the executor MUST commit its own source or gsd_ship's
// clean-tree gate fails), and writes the phase SUMMARY to the artefact base path.
const FAST_PROMPT = `You are the fast-mode executor for a SINGLE GSD phase. Do the phase goal in ONE pass.
- Orient: read .planning/STATE.md if it exists, so you don't collide with in-flight work.
- Do the phase goal using existing functions and patterns over new machinery.
- Commit source changes atomically with a conventional-commit message; never blanket "git add -A".
- Write the phase SUMMARY to the artefact base path <base>-SUMMARY.md (under .planning/phases/<base>/) with frontmatter "phase: <base>" and "status: complete" followed by a "# Summary" body.
Return a short summary of what you did plus the commit hash.`;

// Resolve a registered tool by name across BOTH ctx.tools shapes. In the offline
// mount/test harness ctx.tools is an ARRAY (with a .register method); in the real
// DSH runtime ctx.tools is a SERVICE object exposing get(name, scope) (see
// lib/ship.js:68 and the dsh-tools service). A bare Array.isArray branch would
// always throw "gsd_ship tool not registered" in production, so this helper must
// handle both. Returns undefined when neither shape matches.
function findTool(ctx, name) {
  if (Array.isArray(ctx.tools)) return ctx.tools.find((t) => t && t.name === name);
  if (ctx.tools && typeof ctx.tools.get === "function") return ctx.tools.get(name);
  return undefined;
}

// ── mvp-phase scoping helpers (D-03/D-07) ────────────────────────────────────
// proposeMvpSlice derives a proposed minimal-viable slice from the phase goal;
// isGenericConfirm recognises a bare "yes"-style confirmation; buildMvpContext
// writes a CONTEXT.md body that carries the confirmed slice plus the phase
// goal/requirements so the delegated planner has enough to produce a real plan.
function proposeMvpSlice(phase) {
  return `Minimal-viable slice of phase ${phase.n} (${phase.name}): ${phase.goal} — deliver the smallest end-to-end slice that satisfies ${(phase.requirements || []).join(", ") || "the phase requirements"}.`;
}

function isGenericConfirm(confirm) {
  return /^(yes|y|confirm|ok|accept|accept the proposal|proceed)$/i.test(String(confirm).trim());
}

function buildMvpContext(phase, slice) {
  return `# Phase ${phase.n}: ${phase.name} - Context (MVP scoping)

**Mode:** MVP-phase scoping (propose-then-confirm)
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** ${slice}
**Out of scope:** The remainder of the phase goal not covered by the confirmed MVP slice.
</domain>

<decisions>
## MVP Scope (confirmed)
- D-01: The confirmed minimal-viable slice for this phase is: ${slice}
- D-02: The full phase goal is: ${phase.goal}
- D-03: The phase requirements addressed by this slice are: ${(phase.requirements || []).join(", ") || "none listed"}
</decisions>`;
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this plugin's capability (DEGR-01/D-02). Auto-tracked revertible
  // effect (D-09): retiring the quick plugin withdraws gsdQuick.
  ctx.provide("gsdQuick", buildCapability("gsdQuick"));
  // The batch variant shares the quick step (D-01): a second capability on the
  // same plugin, published via a second ctx.provide call (callable multiple
  // times). Retiring the quick plugin withdraws gsdQuickBatch too.
  ctx.provide("gsdQuickBatch", buildCapability("gsdQuickBatch"));
  // The fast-mode variant shares the quick step (D-01): a third capability on
  // the same plugin, published via a third ctx.provide call. Retiring the quick
  // plugin withdraws gsdFastMode too.
  ctx.provide("gsdFastMode", buildCapability("gsdFastMode"));
  // The mvp-phase variant shares the quick step (D-01): a fourth capability on
  // the same plugin, published via a fourth ctx.provide call. Retiring the quick
  // plugin withdraws gsdMvpPhase too.
  ctx.provide("gsdMvpPhase", buildCapability("gsdMvpPhase"));

  ctx.tools.register(defineTool({
    name: "gsd_quick",
    description: "Quick task (opengsd /gsd-quick): for work below the GSD phase-loop threshold — a single short prompt completable in one agent turn. Spawns one fresh-context subagent that orients against STATE.md, does the task, commits atomically, and records a one-line entry under .planning/quick/<YYYYMMDD>-<slug>/. Use this instead of the full loop when the work needs no research, no unsettled decisions, and no multi-plan decomposition.",
    parameters: {
      task: { type: "string", required: true, description: "The complete, self-contained task description." },
      slug: { type: "string", description: "Optional slug for the quick-task directory; derived from the task if omitted." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_quick: gsdState service unavailable");
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_quick: `subagents` service unavailable");
      const slug = slugify(args.slug || args.task);
      const dir = `${s.planningRoot(cwd)}/quick/${today()}-${slug}`;

      const r = await spawnSubagent(ctx, exec, { label: `quick ${slug}`, promptText: `${QUICK_PROMPT}\n\nTASK: ${args.task}` });

      // record entry
      const entry = [
        `# Quick task ${today()}-${slug}`,
        "",
        `**Task:** ${args.task}`,
        `**Run:** ${nowIso()}`,
        "",
        "## Result",
        "",
        r.output || "(no output)",
      ].join("\n");
      // Route the record write through the GsdState artefact model (ctx.fs) —
      // never raw fs writes (DUR-06, D-04). The accessor keeps the path
      // .planning/quick/<date>-<slug>/TASK.md and is missing/parent-tolerant.
      await s.writeQuickRecord(cwd, `${today()}-${slug}`, entry);
      // D-11: auto-commit the quick record onto the currently checked-out branch
      // via the shared seam (best-effort, never throws). phaseNum null + a message
      // override because quick has no phase and may run in a project-less /
      // non-repo workspace (the seam no-throws there).
      await commitArtifacts(cwd, null, { scope: "quick", message: `docs(planning): quick ${today()}-${slug}` });
      if (await s.isProject(cwd)) { try { await s.addDecision(cwd, `quick ${today()}-${slug}: ${args.task}`); } catch {} }

      return `gsd_quick done (${today()}-${slug}). Recorded at ${dir}/TASK.md.\n\n${r.output || ""}`;
    },
    presentCall: (a) => ({ card: "generic", title: "gsd quick", kind: "other", rawInput: { slug: slugify(a.slug || a.task) } }),
  }));

  // ── gsd_quick_batch (D-01/D-02/D-03/D-05/D-08) ──────────────────────────────
  // Runs MULTIPLE quick tasks in a single batch, sequentially. Each task spawns
  // one fresh-context subagent (D-03, NO Promise.all — sequential avoids
  // working-tree/git collisions), writes its own .planning/quick/<date>-<slug>/
  // TASK.md record (D-05), commits atomically, and reports a per-task result.
  // A failing task is recorded and the batch continues (D-04/D-09); the tool
  // returns a structured { results, summary } object (D-08).
  ctx.tools.register(defineTool({
    name: "gsd_quick_batch",
    description: "Quick batch (opengsd /gsd-quick-batch): run multiple quick tasks in a single batch, sequentially. Each task spawns one fresh-context subagent that orients against STATE.md, does the task, commits atomically, and records its own one-line entry under .planning/quick/<YYYYMMDD>-<slug>/. Returns a per-task result list with failure isolation — a failed task is recorded and the batch continues.",
    parameters: {
      tasks: { type: "array", required: true, description: "Array of { task, slug? } objects; each task is self-contained and independent." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          results: { type: "array" },
          summary: { type: "object", additionalProperties: true },
        },
      },
      render: (_a, v) => {
        const lines = (v?.results || []).map((r) =>
          r.status === "done" ? `- ${r.slug}: done` : `- ${r.slug}: failed: ${r.error || "unknown error"}`
        );
        const s = v?.summary || {};
        lines.push(`Batch complete: ${s.done ?? 0}/${s.total ?? 0} done, ${s.failed ?? 0} failed.`);
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_quick_batch: gsdState service unavailable");
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_quick_batch: `subagents` service unavailable");
      if (!Array.isArray(args.tasks) || args.tasks.length < 1) {
        throw new Error("gsd_quick_batch: tasks must be a non-empty array");
      }

      const results = [];
      const used = new Set();
      for (const item of args.tasks) {
        const task = typeof item === "string" ? item : item?.task;
        if (typeof task !== "string" || task.trim() === "") {
          results.push({ slug: "", status: "failed", error: "task must be a non-empty string" });
          continue;
        }
        // D-06: dedup colliding slugs within the batch with a numeric suffix
        // (-2, -3, ...) applied BEFORE building dateSlug so each record dir stays
        // distinct.
        const base = slugify(item?.slug || task);
        let slug = base;
        let n = 2;
        while (used.has(slug)) slug = `${base}-${n++}`;
        used.add(slug);
        const dateSlug = `${today()}-${slug}`;

        try {
          const r = await spawnSubagent(ctx, exec, { label: `quick ${slug}`, promptText: `${QUICK_PROMPT}\n\nTASK: ${task}` });

          const entry = [
            `# Quick task ${dateSlug}`,
            "",
            `**Task:** ${task}`,
            `**Run:** ${nowIso()}`,
            "",
            "## Result",
            "",
            r.output || "(no output)",
          ].join("\n");
          await s.writeQuickRecord(cwd, dateSlug, entry);
          await commitArtifacts(cwd, null, { scope: "quick", message: `docs(planning): quick ${dateSlug}` });
          if (await s.isProject(cwd)) { try { await s.addDecision(cwd, `quick ${dateSlug}: ${task}`); } catch {} }

          results.push({ slug, status: "done", output: r.output || "" });
        } catch (e) {
          // D-04/D-09: failure isolation — record the error and continue; never
          // rethrow out of the batch.
          const err = String(e?.message || e);
          try {
            const entry = [
              `# Quick task ${dateSlug}`,
              "",
              `**Task:** ${task}`,
              `**Run:** ${nowIso()}`,
              "",
              "## Error",
              "",
              err,
            ].join("\n");
            await s.writeQuickRecord(cwd, dateSlug, entry);
            // CR-02: commit the failure record like the success path so a failed
            // task's TASK.md error record is not left untracked (best-effort,
            // never throws — the seam no-throws in project-less/non-repo workspaces).
            await commitArtifacts(cwd, null, { scope: "quick", message: `docs(planning): quick ${dateSlug} (failed)` });
          } catch {}
          results.push({ slug, status: "failed", error: err });
        }
      }

      const done = results.filter((r) => r.status === "done").length;
      return { results, summary: { total: results.length, done, failed: results.length - done } };
    },
    presentCall: (a) => ({ card: "generic", title: "gsd quick batch", kind: "other", rawInput: { tasks: (a.tasks || []).map((t) => slugify(t?.slug || t?.task || "")) } }),
  }));

  // ── gsd_fast_mode (D-01..D-08) ─────────────────────────────────────────────
  // Lightweight single-pass fast path for a SIMPLE phase. The caller asserts the
  // phase is simple (a `fast: true` ROADMAP flag is optional metadata, never a
  // hard gate — D-02). Skips spec/discuss/plan/plan-checker/gap-analysis and
  // runs the phase through a single fresh-context executor: auto-CONTEXT -> one
  // executor -> SUMMARY -> lightweight verify -> full ship via gsd_ship. Fail
  // fast and never auto-retry/continue (D-07): a throw leaves the phase
  // uncompleted in STATE and reports the real cause.
  ctx.tools.register(defineTool({
    name: "gsd_fast_mode",
    description: "Fast mode phase N (opengsd /gsd-fast-mode): lightweight single-pass fast path for a SIMPLE phase. Auto-derives a minimal CONTEXT, runs the phase through one fresh-context executor, records a SUMMARY, performs a lightweight verify, and ships the phase the full way (branch + PR + Complete). Refuses a phase already marked Complete in ROADMAP. Additive only — the full loop, gsd_quick, and gsd_quick_batch are untouched.",
    parameters: {
      phase: { type: "number", required: true, description: "The phase number to run through fast mode." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_fast_mode: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_fast_mode: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_fast_mode: unreadable ROADMAP.md");
      const phase = (roadmap.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_fast_mode: phase ${args.phase} not in ROADMAP.md`);
      if (phase.status === "Complete") throw new Error(`gsd_fast_mode: phase ${args.phase} is already Complete — fast mode refuses completed phases`);

      // D-06 branch gate: acquire/join the phase-<N> feature branch (throws on
      // hard failure -> fail-fast, D-07).
      await ensurePhaseBranch(cwd, phase.n);

      // D-03: auto-derive a minimal CONTEXT marked for the fast path.
      const { base } = await s.phaseDirAndBase(cwd, phase.n);
      await s.writeArtifact(cwd, phase.n, "CONTEXT", buildAutoContext(phase, "Auto-generated (discuss skipped — fast path)"));

      // D-04: one fresh-context executor performs the phase goal in a single pass.
      const subagents = ctx.get("subagents");
      if (!subagents) throw new Error("gsd_fast_mode: `subagents` service unavailable");
      const r = await spawnSubagent(ctx, exec, {
        label: `fast phase ${phase.n}`,
        promptText: `${FAST_PROMPT}\n\nPHASE: ${phase.n} (${phase.name})\nARTEFACT BASE: ${base}\nGOAL: ${phase.goal}\nREQUIREMENTS: ${(phase.requirements || []).join(", ")}`,
      });

      // D-05: lightweight verify read-back — confirm SUMMARY + CONTEXT exist,
      // then write a minimal VERIFICATION.md (status: passed) so gsd_ship's gate
      // 1 passes. A missing SUMMARY is a hard failure (D-07).
      const summary = await s.readArtifact(cwd, phase.n, "SUMMARY").catch(() => "");
      if (!summary) throw new Error(`gsd_fast_mode: executor did not write a SUMMARY for phase ${phase.n}`);
      const context = await s.readArtifact(cwd, phase.n, "CONTEXT").catch(() => "");
      if (!context) throw new Error(`gsd_fast_mode: CONTEXT missing for phase ${phase.n}`);
      await s.writeArtifact(cwd, phase.n, "VERIFICATION", `---\nphase: ${base}\nverified: ${today()}\nstatus: passed\nmode: fast\n---\n# Verification\n\nFast-path lightweight verify (D-05): SUMMARY present, CONTEXT present, executor completed.`);

      // D-06: commit the .planning artefacts onto the phase branch.
      await commitArtifacts(cwd, phase.n, { scope: "fast-mode", phaseName: phase.name });

      // D-06: full ship via gsd_ship's path (single-source branch-push + PR +
      // Complete). A throw here propagates (fail-fast, D-07).
      const shipTool = findTool(ctx, "gsd_ship");
      if (!shipTool || typeof shipTool.execute !== "function") throw new Error("gsd_fast_mode: gsd_ship tool not registered — cannot ship");
      const shipOut = await shipTool.execute({ phase: phase.n }, exec);

      return `gsd_fast_mode complete for phase ${phase.n} (${phase.name}).\n\n${shipOut}`;
    },
    presentCall: (a) => ({ card: "generic", title: `Fast mode phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));

  // ── gsd_mvp_phase (D-01..D-07) ─────────────────────────────────────────────
  // Interactive propose-then-confirm scoping (D-03) -> a real PLAN.md via the
  // normal gsd_plan path (D-04) -> delegation to the normal loop
  // gsd_execute/gsd_verify/gsd_ship (D-05). Fail fast and never auto-retry/
  // continue (D-06): a throw leaves the phase uncompleted in STATE and reports
  // the real cause. Additive only — the full loop, gsd_fast_mode, gsd_quick,
  // gsd_quick_batch, and gsd_autonomous are untouched (D-02).
  ctx.tools.register(defineTool({
    name: "gsd_mvp_phase",
    description: "MVP phase N (opengsd /gsd-mvp-phase): interactive propose-then-confirm scoping flow. Proposes a minimal-viable slice of the phase goal and asks you to confirm or adjust it before any planning; then produces a real PLAN.md (via gsd_plan) and delegates execution to the normal loop (gsd_execute -> gsd_verify -> gsd_ship). Refuses a phase already marked Complete in ROADMAP and never auto-retries on failure.",
    parameters: {
      phase: { type: "number", required: true, description: "The phase number to run through the mvp-phase flow." },
      confirm: { type: "string", description: "The user's confirmation or adjusted MVP slice. Omit on the first call to receive the proposed slice." },
      decision_id: { type: "string", description: "The decision id returned by the first call; required to apply a confirm." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_mvp_phase: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_mvp_phase: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_mvp_phase: unreadable ROADMAP.md");
      const phase = (roadmap.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_mvp_phase: phase ${args.phase} not in ROADMAP.md`);
      if (phase.status === "Complete") throw new Error(`gsd_mvp_phase: phase ${args.phase} is already Complete — mvp-phase refuses completed phases`);

      const decisionId = `mvp-${phase.n}`;
      const proposed = proposeMvpSlice(phase);

      // D-03 propose-then-confirm: first call writes the pending MVP-SCOPE
      // proposal and returns an awaiting-human marker; a confirm call (with a
      // matching decision_id) applies the confirmed slice and proceeds.
      if (!args.confirm) {
        await s.writeArtifact(cwd, phase.n, "MVP-SCOPE", `---\ndecision_id: ${decisionId}\n---\n# Proposed MVP slice\n\n${proposed}`);
        return `GSD_AWAITING_HUMAN: mvp-phase phase ${phase.n} (${phase.name}) — proposed minimal-viable slice:\n\n${proposed}\n\nConfirm or adjust by re-invoking gsd_mvp_phase with confirm="<your slice or 'yes'>" and decision_id="${decisionId}".`;
      }
      if (args.decision_id !== decisionId) throw new Error(`gsd_mvp_phase: decision_id mismatch — expected ${decisionId}, got ${args.decision_id}`);

      // D-03 apply the confirmed slice as the scope the PLAN.md is built against.
      const confirmed = isGenericConfirm(args.confirm) ? proposed : args.confirm;
      await s.writeArtifact(cwd, phase.n, "CONTEXT", buildMvpContext(phase, confirmed));

      // D-04 reuse the normal plan path for a schema-faithful PLAN.md. A throw
      // here propagates (fail-fast, D-06).
      const planTool = findTool(ctx, "gsd_plan");
      if (!planTool || typeof planTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_plan tool not registered — cannot plan");
      const planOut = await planTool.execute({ phase: phase.n }, exec);

      // D-05 delegate execution to the normal loop.
      const executeTool = findTool(ctx, "gsd_execute");
      if (!executeTool || typeof executeTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_execute tool not registered — cannot execute");
      const executeOut = await executeTool.execute({ phase: phase.n }, exec);

      // D-05 delegate verification to the normal loop.
      const verifyTool = findTool(ctx, "gsd_verify");
      if (!verifyTool || typeof verifyTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_verify tool not registered — cannot verify");
      const verifyOut = await verifyTool.execute({ phase: phase.n }, exec);

      // D-07/D-06 lightweight-verify heuristic before delegating to ship: read
      // the VERIFICATION.md status back; only a "passed" status proceeds.
      const verText = await s.readArtifact(cwd, phase.n, "VERIFICATION").catch(() => "");
      const { frontmatter } = parseFrontmatter(verText);
      if (frontmatter.status !== "passed") return `gsd_mvp_phase: phase ${phase.n} did not pass verification (status: ${frontmatter.status || "unknown"}). Stopping — the phase is left uncompleted. Re-run gsd_verify or use the full loop.\n\n${verifyOut}`;

      // D-05 delegate the full ship.
      const shipTool = findTool(ctx, "gsd_ship");
      if (!shipTool || typeof shipTool.execute !== "function") throw new Error("gsd_mvp_phase: gsd_ship tool not registered — cannot ship");
      const shipOut = await shipTool.execute({ phase: phase.n }, exec);

      return `gsd_mvp_phase complete for phase ${phase.n} (${phase.name}).\n\n## Plan\n${planOut}\n\n## Execute\n${executeOut}\n\n## Verify\n${verifyOut}\n\n## Ship\n${shipOut}`;
    },
    presentCall: (a) => ({ card: "generic", title: `MVP phase ${a.phase}`, kind: "other", rawInput: { phase: a.phase } }),
  }));
}

export { name, inject, apply };