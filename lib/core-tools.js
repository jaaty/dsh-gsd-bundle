// @dsh-gsd/bundle/core-tools — model-facing orientation tools backed by the
// gsdState service: gsd_init (write PROJECT/REQUIREMENTS/ROADMAP/STATE/config),
// gsd_status (read STATE.md), gsd_progress (roadmap + plan progress), and
// gsd_new_milestone. These are the entry points the persona tells the agent to
// call to orient and to bootstrap a project.

import { defineTool } from "@deepseek-ai/dsh-tools";

const name = "gsd-core-tools";
const inject = ["gsdState", "tools"];

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // ── gsd_init ───────────────────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: "gsd_init",
    description: "Initialise a Git Ship Done project in this workspace: writes .planning/PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, and config.json. Call this once at the start of a GSD engagement (opengsd-core /gsd-new-project). Provide the project name, the milestone, the numbered requirements (each with an ID like AUTH-01), and the ordered phases (each a single-sentence goal plus the REQ-IDs it addresses).",
    parameters: {
      name: { type: "string", required: true, description: "Project name." },
      purpose: { type: "string", description: "One-paragraph project purpose / core value." },
      milestoneName: { type: "string", description: "First milestone name." },
      version: { type: "string", description: "Milestone version, e.g. v1.0." },
      requirements: {
        type: "array", required: true,
        description: "Numbered acceptance criteria. Each item: { id (e.g. AUTH-01), text }.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            id: { type: "string", required: true },
            text: { type: "string", required: true },
          },
        },
      },
      phases: {
        type: "array", required: true,
        description: "Ordered phases. Each: { name (slug-ish), goal (single sentence), requirements (REQ-IDs) }.",
        items: {
          type: "object", additionalProperties: false,
          properties: {
            name: { type: "string", required: true },
            goal: { type: "string", required: true },
            requirements: { type: "array", items: { type: "string" } },
          },
        },
      },
      tdd: { type: "boolean" },
      mvp: { type: "boolean" },
      projectCode: { type: "string" },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
      const s = gsd();
      if (!s) throw new Error("gsd_init: gsdState service unavailable");
      if (await s.isProject(cwd)) return "A .planning/ project already exists here. Use gsd_status to orient, or gsd_new_milestone to start a new milestone.";
      const phases = (args.phases || []).map((p, i) => ({
        n: i + 1, name: p.name, goal: p.goal,
        requirements: p.requirements || [], status: "pending",
      }));
      const state = await s.initProject(cwd, {
        name: args.name, purpose: args.purpose,
        milestoneName: args.milestoneName || args.name,
        version: args.version || "v1.0",
        requirements: args.requirements || [],
        phases,
        tdd: args.tdd, mvp: args.mvp, projectCode: args.projectCode,
      });
      // seed progress totals
      const fm = state.frontmatter;
      fm.milestone = args.version || "v1.0";
      fm.milestone_name = args.milestoneName || args.name;
      fm.status = "idle";
      fm.progress.total_phases = phases.length;
      fm.progress.total_plans = 0;
      await s.writeState(cwd, state);
      return `Initialised GSD project "${args.name}" — milestone ${args.milestoneName || args.name} ${args.version || "v1.0"}.\n${phases.length} phase(s), ${(args.requirements || []).length} requirement(s).\n.planning/ created. Next: gsd_discuss on phase 1.`;
    },
    presentCall: (a) => ({ card: "generic", title: "Init GSD project", kind: "other", rawInput: { name: a.name, phases: (a.phases || []).length } }),
  }));

  // ── gsd_status ──────────────────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: "gsd_status",
    description: "Read .planning/STATE.md and ROADMAP.md and return the current GSD loop position: active milestone, active phase + step, recent decisions, blockers, session continuity, and the phase list with statuses. Call this first to orient before any phase work (opengsd reads STATE.md first).",
    parameters: {},
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(_args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
      const s = gsd();
      if (!s) throw new Error("gsd_status: gsdState service unavailable");
      if (!(await s.isProject(cwd))) return "No .planning/ project in this workspace. Run gsd_init to start a GSD project.";
      const state = await s.readState(cwd);
      const roadmap = await s.readRoadmap(cwd);
      const fm = state.frontmatter;
      const lines = [
        "# GSD STATUS",
        "",
        `Milestone: ${fm.milestone_name || fm.milestone || "(none)"}  ${fm.milestone || ""}`,
        `Status: ${fm.status}`,
        `Active phase: ${fm.active_phase || "(none)"}  Step: ${fm.status}`,
        `Next action: ${fm.next_action || "(none)"}`,
        `Progress: ${fm.progress?.completed_phases || 0}/${fm.progress?.total_phases || 0} phases, ${fm.progress?.completed_plans || 0}/${fm.progress?.total_plans || 0} plans (${fm.progress?.percent || 0}%)`,
        "",
        "## Phases",
      ];
      for (const p of (roadmap?.phases || [])) {
        lines.push(`- [${p.status === "Complete" ? "x" : " "}] ${String(p.n).padStart(2, "0")} ${p.name} — ${p.goal} [${(p.requirements || []).join(", ")}]`);
      }
      lines.push("", "## Recent Decisions");
      (state.body.decisions.length ? state.body.decisions : ["(none)"]).forEach((d) => lines.push(`- ${d}`));
      lines.push("", "## Blockers / Concerns");
      (state.body.blockers.length ? state.body.blockers : ["(none)"]).forEach((d) => lines.push(`- ${d}`));
      lines.push("", `Stopped at: ${state.body.continuity.stoppedAt || "(n/a)"}`);
      return lines.join("\n");
    },
    presentCall: () => ({ card: "generic", title: "GSD status", kind: "other" }),
  }));

  // ── gsd_progress ─────────────────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: "gsd_progress",
    description: "Return GSD progress detail: per-phase plan completion counts and the next recommended action (opengsd /gsd-progress).",
    parameters: { phase: { type: "number", description: "Optional phase number to list plan-level progress for." } },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
      const s = gsd();
      if (!(await s.isProject(cwd))) return "No .planning/ project. Run gsd_init first.";
      const roadmap = await s.readRoadmap(cwd);
      const state = await s.readState(cwd);
      const lines = ["# GSD PROGRESS", ""];
      for (const p of (roadmap?.phases || [])) {
        const idx = await s.planIndex(cwd, p.n).catch(() => null);
        const done = idx ? idx.plans.filter((x) => x.has_summary).length : 0;
        const total = idx ? idx.plans.length : 0;
        lines.push(`- Phase ${String(p.n).padStart(2, "0")} ${p.name} [${p.status === "Complete" ? "x" : " "}] — ${done}/${total} plans`);
      }
      if (args.phase != null) {
        const idx = await s.planIndex(cwd, args.phase).catch(() => null);
        if (idx) {
          lines.push("", `## Phase ${args.phase} plans`, "");
          for (const w of Object.keys(idx.waves)) {
            lines.push(`Wave ${w}:`);
            for (const pl of idx.waves[w]) lines.push(`  - ${pl.id} wave=${pl.wave} ${pl.has_summary ? "✓" : "…"} autonomous=${pl.autonomous} reqs=${(pl.requirements || []).join(",")}`);
          }
        }
      }
      lines.push("", `Next action: ${state.frontmatter.next_action || "(none)"}`);
      return lines.join("\n");
    },
    presentCall: () => ({ card: "generic", title: "GSD progress", kind: "other" }),
  }));

  // ── gsd_new_milestone ────────────────────────────────────────────────────────
  ctx.tools.register(defineTool({
    name: "gsd_new_milestone",
    description: "Start a new milestone in an existing GSD project: set the active milestone/version and append new phases to ROADMAP.md (opengsd /gsd-new-milestone).",
    parameters: {
      milestoneName: { type: "string", required: true },
      version: { type: "string", required: true },
      phases: {
        type: "array", required: true,
        items: {
          type: "object", additionalProperties: false,
          properties: {
            name: { type: "string", required: true },
            goal: { type: "string", required: true },
            requirements: { type: "array", items: { type: "string" } },
          },
        },
      },
      requirements: { type: "array", items: { type: "object", additionalProperties: false, properties: { id: { type: "string", required: true }, text: { type: "string", required: true } } } },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd || process.cwd();
      const s = gsd();
      if (!(await s.isProject(cwd))) return "No .planning/ project. Run gsd_init first.";
      const roadmap = await s.readRoadmap(cwd);
      const baseN = (roadmap.phases.reduce((m, p) => Math.max(m, p.n), 0)) + 1;
      const newPhases = (args.phases || []).map((p, i) => ({ n: baseN + i, name: p.name, goal: p.goal, requirements: p.requirements || [], status: "pending" }));
      roadmap.phases.push(...newPhases);
      roadmap.milestoneName = args.milestoneName;
      roadmap.version = args.version;
      await s.writeRoadmap(cwd, roadmap);
      if (args.requirements?.length) {
        const reqs = await s.readRequirements(cwd);
        reqs.push(...args.requirements);
        await s.writeRequirements(cwd, reqs);
      }
      await s.updateStateFrontmatter(cwd, {
        milestone: args.version, milestone_name: args.milestoneName,
        status: "idle", active_phase: null, next_action: "discuss-phase",
      });
      // recompute progress totals from the roadmap (keeps completed/percent in sync)
      await s.recomputeProgress(cwd);
      return `New milestone ${args.milestoneName} ${args.version} started. ${newPhases.length} phase(s) added (starting #${baseN}). Next: gsd_discuss on phase ${baseN}.`;
    },
    presentCall: (a) => ({ card: "generic", title: "New milestone", kind: "other", rawInput: { milestoneName: a.milestoneName } }),
  }));
}

export { name, inject, apply };