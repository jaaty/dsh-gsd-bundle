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

const name = "gsd-quick";
const inject = ["gsdState", "tools"];

const QUICK_PROMPT = `You are running a gsd-quick task — a small job below the GSD phase-loop threshold.
- Orient: read .planning/STATE.md if it exists, so you don't collide with in-flight work.
- Do the task. Use existing functions and patterns over new machinery.
- Commit atomically with a conventional-commit message; do not blanket "git add -A".
- Write a one-line summary of what you did and the commit hash.
Return that summary.`;

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

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
}

export { name, inject, apply };