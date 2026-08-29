// @dsh-gsd/bundle/core-tools — model-facing orientation tools backed by the
// gsdState service: gsd_init (write PROJECT/REQUIREMENTS/ROADMAP/STATE/config),
// gsd_status (read STATE.md), gsd_progress (roadmap + plan progress), and
// gsd_new_milestone. These are the entry points the persona tells the agent to
// call to orient and to bootstrap a project.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { reconcileJobs, launchJob, cancelJob, retryJob } from "./jobs.js";
import { cwdOf } from "./_runner.js";
import { buildCapability } from "./_capabilities.js";
import { availableCapabilities, capabilityKeyForNextAction, effectiveRoutableStep, renderAvailableSteps, NO_LOOP_NOTICE } from "./_render.js";

const name = "gsd-core-tools";
const inject = ["gsdState", "tools"];

// Render one async-job manifest entry as a single gsd_status / gsd_job line.
// `status` stays 'done'/'failed' (D-08 backward compatible); the additive
// `reason` (and its detail) is appended inline when present.
function jobLine(j) {
  const base = `- ${j.id}: ${j.kind || "?"} — ${j.status} — ${j.result || j.started || ""}`;
  if (j.reason && j.reason.reason) {
    let line = `${base} [reason: ${j.reason.reason}]`;
    if (j.reason.detail) line += ` (${j.reason.detail})`;
    return line;
  }
  return base;
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // D-01 split: publish the capability surface — gsdOrient is the model-bound
  // orientation surface a future scrum-style swap would replace; gsdJobs is the
  // model-agnostic job surface kept on a model swap. Both ride this plugin's
  // fiber lifecycle as auto-tracked revertible effects (D-09); retiring
  // core-tools withdraws both capabilities with no manual dispose.
  ctx.provide("gsdOrient", buildCapability("gsdOrient"));
  ctx.provide("gsdJobs", buildCapability("gsdJobs"));

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
      const cwd = cwdOf(exec);
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
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_status: gsdState service unavailable");
      if (!(await s.isProject(cwd))) return "No .planning/ project in this workspace. Run gsd_init to start a GSD project.";
      const state = await s.readState(cwd);
      const roadmap = await s.readRoadmap(cwd);
      const fm = state.frontmatter;
      // D-04/D-06/D-08: read the present capability descriptors once at execute
      // time via ctx.get (non-reactive, always-optional poll). gsd_status is an
      // orientation surface and must NEVER throw over an absent/malformed
      // capability (D-07), so every capability-routed computation is wrapped in
      // a try/catch that degrades to a null/handled fallback.
      const caps = availableCapabilities((k) => ctx.get(k));
      const routable = (() => {
        try {
          return effectiveRoutableStep(fm.next_action, caps);
        } catch {
          return null;
        }
      })();
      let nextActionValue;
      try {
        const nextKey = capabilityKeyForNextAction(fm.next_action);
        if (fm.next_action && nextKey && caps.some((d) => d.key === nextKey)) {
          nextActionValue = fm.next_action;
        } else if (routable && routable.step) {
          nextActionValue = `${routable.step}-phase`;
        } else {
          nextActionValue = NO_LOOP_NOTICE;
        }
      } catch {
        nextActionValue = NO_LOOP_NOTICE;
      }
      const lines = [
        "# GSD STATUS",
        "",
        `Milestone: ${fm.milestone_name || fm.milestone || "(none)"}  ${fm.milestone || ""}`,
        `Status: ${fm.status}`,
        `Active phase: ${fm.active_phase || "(none)"}  Step: ${fm.status}`,
        `Next action: ${nextActionValue}`,
        `Progress: ${fm.progress?.completed_phases || 0}/${fm.progress?.total_phases || 0} phases, ${fm.progress?.completed_plans || 0}/${fm.progress?.total_plans || 0} plans (${fm.progress?.percent || 0}%)`,
        "",
        "## Available steps",
        ...renderAvailableSteps(caps).split("\n"),
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

      // D-05/D-06: surface the WINDOWS multi-window ledger and the async-jobs
      // registry through gsd_status. Missing file = an explicit empty-section
      // line; corrupt file = a short warning line. gsd_status is an orientation
      // surface and must NEVER throw over a bad ledger — reads funnel through the
      // plan-01 accessors, which already degrade to { entries: [], corrupt } and
      // return on their own; the .catch() guards any unexpected accessor throw.
      const windows = await s.readWindows(cwd).catch(() => ({ entries: [], corrupt: true }));
      // D-05: reconcile the async-jobs manifest to real done/failed state before
      // it is read, so the Async Jobs section reflects actual running/done/failed
      // outcomes rather than a registry-only record. The .catch(() => null) keeps
      // gsd_status an orientation surface that never throws (D-06).
      await reconcileJobs(ctx, s, cwd).catch(() => null);
      const jobs = await s.readJobs(cwd).catch(() => ({ entries: [], corrupt: true }));

      lines.push("", "## Windows");
      if (windows?.corrupt) lines.push("- WINDOWS.md is corrupt — windows unavailable.");
      else if (!windows?.entries?.length) lines.push("- No windows recorded.");
      else {
        // most recent 3 windows first (the ledger is append-only, newest last)
        for (const w of windows.entries.slice(-3).reverse()) {
          const hasStep = w.phase !== undefined && w.step !== undefined;
          lines.push(hasStep
            ? `- ${w.id}: phase ${w.phase} ${w.step} — closed ${w.closed || ""}`
            : `- ${w.id}: ${w.summary || w.closed || ""}`);
        }
      }

      lines.push("", "## Async Jobs");
      if (jobs?.corrupt) lines.push("- async-jobs.json is corrupt — jobs unavailable.");
      else if (!jobs?.entries?.length) lines.push("- No jobs.");
      else {
        for (const j of jobs.entries) lines.push(jobLine(j));
      }

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
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!(await s.isProject(cwd))) return "No .planning/ project. Run gsd_init first.";
      const roadmap = await s.readRoadmap(cwd);
      const state = await s.readState(cwd);
      // D-04 no-missing-tool promise on the second surface: route the final
      // next-action line through the same capability-aware helper, never
      // throwing over an absent/malformed capability (D-07).
      const caps = availableCapabilities((k) => ctx.get(k));
      const routed = (() => {
        try {
          const na = state.frontmatter.next_action;
          const routable = effectiveRoutableStep(na, caps);
          const nextKey = capabilityKeyForNextAction(na);
          if (na && nextKey && caps.some((d) => d.key === nextKey)) return na;
          if (routable && routable.step) return `${routable.step}-phase`;
          return NO_LOOP_NOTICE;
        } catch {
          return NO_LOOP_NOTICE;
        }
      })();
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
      lines.push("", `Next action: ${routed}`);
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
      const cwd = cwdOf(exec);
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

  // ── gsd_job ──────────────────────────────────────────────────────────────────
  // Single interactive background-job management tool (JOBX-03, D-05). launch |
  // status | cancel | retry, kind shell | subagent. Delegates to the jobs.js
  // domain API (launchJob/cancelJob/retryJob/reconcileJobs). It is an
  // externally-triggerable launch surface, so it NEVER throws over a bad
  // manifest and returns a clear message for every non-actionable case (D-04/
  // D-05/D-09). Subagent launch passes `parent: exec.agent` only — NOT
  // exec.signal (D-01), so the job-owned AbortSignal (built in jobs.js) binds
  // the run. Shell launch takes an argv array passed through verbatim (no
  // string→argv splitting, so no quoting/whitespace ambiguity or injection).
  ctx.tools.register(defineTool({
    name: "gsd_job",
    description: "Launch and manage background jobs interactively (JOBX-03). Actions: launch | status | cancel | retry; kind: shell | subagent. Shell launch takes an argv array; subagent launch takes a prompt (with optional label/provider). Returns a readable job id + status/result line. Unknown action/job returns a clear message and never throws.",
    parameters: {
      action: { type: "string", required: true, enum: ["launch","status","cancel","retry"], description: "What to do with the job." },
      kind: { type: "string", enum: ["shell","subagent"], description: "Job kind for launch." },
      argv: { type: "array", items: { type: "string" }, description: "Command argv array for a shell job (verbatim; no shell interpretation)." },
      cwd: { type: "string", description: "Optional working directory for a shell job." },
      prompt: { type: "string", description: "Prompt for a subagent job." },
      label: { type: "string", description: "Optional label for a subagent job." },
      provider: { type: "string", description: "Optional subagent provider (default 'spawn')." },
      timeout: { type: "number", description: "Optional per-job timeout in seconds (D-03)." },
      id: { type: "string", description: "Job id for status/cancel/retry." },
      max_retries: { type: "number", description: "Optional max retry cap override for action=retry." },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      try {
        const cwd = cwdOf(exec);
        const s = gsd();
        if (!s) return "gsd_job: gsdState service unavailable";
        const action = args.action;
        if (action === "launch") {
          const kind = args.kind;
          if (kind !== "shell" && kind !== "subagent") return "gsd_job: invalid kind — must be 'shell' or 'subagent'";
          if (kind === "shell") {
            if (!Array.isArray(args.argv) || args.argv.length === 0) return "gsd_job: shell launch requires a non-empty argv array";
            const job = await launchJob(ctx, s, cwd, { kind: "shell", command: args.argv, timeout: args.timeout, cwd: args.cwd });
            return `launched ${job.id} (shell) — ${job.status}`;
          }
          if (!args.prompt || !String(args.prompt).trim()) return "gsd_job: subagent launch requires a prompt";
          const job = await launchJob(ctx, s, cwd, {
            kind: "subagent", prompt: args.prompt, label: args.label, provider: args.provider,
            parent: exec.agent, timeout: args.timeout,
          });
          return `launched ${job.id} (subagent) — ${job.status}`;
        }
        if (action === "status") {
          if (!args.id) return "gsd_job: status requires an id";
          await reconcileJobs(ctx, s, cwd).catch(() => null);
          const { entries } = await s.readJobs(cwd);
          const job = entries.find((e) => e.id === args.id);
          if (!job) return `job ${args.id} not found`;
          return jobLine(job).replace(/^- /, "");
        }
        if (action === "cancel") {
          if (!args.id) return "gsd_job: cancel requires an id";
          const res = await cancelJob(ctx, s, cwd, args.id);
          if (res.ok) {
            const { entries } = await s.readJobs(cwd);
            const job = entries.find((e) => e.id === args.id);
            return `cancelled ${args.id}${job && job.reason ? ` [reason: ${job.reason.reason}]` : ""}`;
          }
          return res.message;
        }
        if (action === "retry") {
          if (!args.id) return "gsd_job: retry requires an id";
          const res = await retryJob(ctx, s, cwd, args.id, { maxRetries: args.max_retries });
          if (res.ok) return `retried ${args.id} as ${res.newId}; old entry marked retried`;
          return res.message;
        }
        return `gsd_job: unknown action '${action}' — expected launch, status, cancel, or retry`;
      } catch (err) {
        return `gsd_job: ${String((err && err.message) || err)}`;
      }
    },
    presentCall: (a) => ({ card: "generic", title: "gsd_job", kind: "other", rawInput: { action: a.action, kind: a.kind } }),
  }));
}

export { name, inject, apply };