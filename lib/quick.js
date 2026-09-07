// @dsh-gsd/bundle/quick — the sub-threshold path (opengsd /gsd-quick). For work
// below the loop's threshold (could be fully specified in a single short
// prompt and done in one agent turn): a single fresh-context subagent does the
// task with GSD guarantees (reads STATE.md first, commits atomically) and
// records a one-line entry under .planning/quick/<YYYYMMDD>-<slug>/. No phase
// loop, no plan-checker, no verifier — the lightweight primitive.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { slugify, today, nowIso } from "./_shared.js";
import { spawnSubagent, cwdOf } from "./_runner.js";
import { commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";

const name = "gsd-quick";
const inject = ["gsdState", "tools", "subagents"];

const QUICK_PROMPT = `You are running a gsd-quick task — a small job below the GSD phase-loop threshold.
- Orient: read .planning/STATE.md if it exists, so you don't collide with in-flight work.
- Do the task. Use existing functions and patterns over new machinery.
- Commit atomically with a conventional-commit message; do not blanket "git add -A".
- Write a one-line summary of what you did and the commit hash.
Return that summary.`;

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this plugin's capability (DEGR-01/D-02). Auto-tracked revertible
  // effect (D-09): retiring the quick plugin withdraws gsdQuick.
  ctx.provide("gsdQuick", buildCapability("gsdQuick"));
  // The batch variant shares the quick step (D-01): a second capability on the
  // same plugin, published via a second ctx.provide call (callable multiple
  // times). Retiring the quick plugin withdraws gsdQuickBatch too.
  ctx.provide("gsdQuickBatch", buildCapability("gsdQuickBatch"));

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
      if (s.isProject) { try { await s.addDecision(cwd, `quick ${today()}-${slug}: ${args.task}`); } catch {} }

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
          if (s.isProject) { try { await s.addDecision(cwd, `quick ${dateSlug}: ${task}`); } catch {} }

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
          } catch {}
          results.push({ slug, status: "failed", error: err });
        }
      }

      const done = results.filter((r) => r.status === "done").length;
      return { results, summary: { total: results.length, done, failed: results.length - done } };
    },
    presentCall: (a) => ({ card: "generic", title: "gsd quick batch", kind: "other", rawInput: { tasks: (a.tasks || []).map((t) => slugify(t?.slug || t?.task || "")) } }),
  }));
}

export { name, inject, apply };