// @dsh-gsd/bundle/pause-resume — the PURE domain core for the pause-work /
// resume-work utility commands (phase 48, GAP-14). These helpers turn gathered
// state into the HANDOFF.json object and the .continue-here.md template, detect
// the active phase, map non-terminal async jobs, detect incomplete work, and
// render a resume status. They are PURE: no ctx/fs/git params, no node builtins
// (mirror lib/learnings.js / lib/graphify.js), so they are directly unit-testable.
//
// The tools in Plan 02 assemble a `gathered` state object from the gsdState
// accessors and pass it into buildHandoff / renderContinueHere. The gathered
// shape is documented below (D-08 / OQ-2).

import { nowIso, stringifyFrontmatter, stripPlanPrefix } from "./_shared.js";

// ── phase detection (D-03) ────────────────────────────────────────────────────
// Given a phase dir name like "GSD-48-pause-resume-work" or "48-pause-resume-work",
// strip an optional leading project-code token (reuse stripPlanPrefix semantics:
// a leading token followed by a two-digit segment is the prefix) and return the
// leading two-digit phase number as a Number; null when no leading digits match.
export function phaseNumFromDir(name) {
  const stripped = stripPlanPrefix(name);
  const m = String(stripped).match(/^(\d{2})/);
  return m ? Number(m[1]) : null;
}

// phaseDirs is an array of { name, hasPlan } in most-recent-first order (the
// caller sorts by mtime desc, falling back to name desc). Return the first entry
// whose hasPlan is true as { phaseDir, phaseNum }; null when none has a plan.
export function detectActivePhase(phaseDirs) {
  for (const d of phaseDirs || []) {
    if (d && d.hasPlan) {
      return { phaseDir: d.name, phaseNum: phaseNumFromDir(d.name) };
    }
  }
  return null;
}

// ── async-job mapping (D-07 / OQ-3) ────────────────────────────────────────────
// Filter the job manifest to non-terminal jobs (status not in ['done','failed'])
// and map each to the handoff shape. The bundle manifest lacks upstream's
// expected_artifacts / resume_command, so the resume command is derived.
export function mapAsyncJobs(entries) {
  return (entries || [])
    .filter((e) => e && e.status !== "done" && e.status !== "failed")
    .map((e) => ({
      job_id: e.id,
      backend: e.kind,
      status: e.status,
      plan: e.plan,
      phase: e.phase,
      result: e.result,
      resume_command: `gsd_job status ${e.id}`,
    }));
}

// ── HANDOFF.json building (D-02 / D-08 / OQ-2) ────────────────────────────────
// The gathered state object the tool assembles:
//   { context: "phase"|"default", phase, phase_name, phase_dir, plan, task,
//     total_tasks, status, completed_tasks: [{id,name,status,commit?}],
//     remaining_tasks: [{id,name,status}], blockers: [{description,type,workaround?}],
//     async_jobs: [...], decisions: [{decision,rationale,phase}],
//     uncommitted_files: [path], next_action, context_notes, timestamp }
// Return a HANDOFF.json object with EXACTLY the D-08 fields, preserving nulls.
export function buildHandoff(gathered) {
  const g = gathered || {};
  return {
    version: "1.0",
    timestamp: g.timestamp || nowIso(),
    context: g.context,
    phase: g.phase,
    phase_name: g.phase_name,
    phase_dir: g.phase_dir,
    plan: g.plan,
    task: g.task,
    total_tasks: g.total_tasks,
    status: "paused",
    completed_tasks: g.completed_tasks,
    remaining_tasks: g.remaining_tasks,
    blockers: g.blockers,
    async_jobs: g.async_jobs,
    decisions: g.decisions,
    uncommitted_files: g.uncommitted_files,
    next_action: g.next_action,
    context_notes: g.context_notes,
  };
}

// Render a list of strings or {name|id|decision|description, status?} objects
// into markdown bullet lines for the .continue-here.md template sections.
function listText(items) {
  if (!Array.isArray(items) || items.length === 0) return "_none_";
  return items.map((it) => {
    if (typeof it === "string") return `- ${it}`;
    if (it && typeof it === "object") {
      const name = it.name || it.id || it.decision || it.description || "";
      const extra = it.status ? ` (${it.status})` : "";
      return `- ${name}${extra}`;
    }
    return `- ${String(it)}`;
  }).join("\n");
}

// ── .continue-here.md template (D-02 / D-08) ──────────────────────────────────
// Return a markdown string whose body contains the six D-08 sections as XML-style
// tags, each populated from the corresponding gathered field, with a frontmatter
// block (--- delimited) carrying context, phase, status, last_updated.
export function renderContinueHere(gathered) {
  const g = gathered || {};
  const fm = {
    context: g.context,
    phase: g.phase,
    status: "paused",
    last_updated: g.timestamp || nowIso(),
  };
  const sections = [
    ["current_state", g.context_notes || ""],
    ["completed_work", listText(g.completed_tasks)],
    ["remaining_work", listText(g.remaining_tasks)],
    ["decisions_made", listText(g.decisions)],
    ["blockers", listText(g.blockers)],
    ["next_action", g.next_action || ""],
  ];
  const body = sections
    .map(([tag, content]) => `<${tag}>\n${content}\n</${tag}>`)
    .join("\n\n");
  return `${stringifyFrontmatter(fm)}\n${body}\n`;
}

// ── incomplete-work fallback (D-04) ───────────────────────────────────────────
// plans is an array of { id, has_summary }; return the ids whose has_summary is
// false as incompletePlans. continueHereFiles is an array of paths returned
// verbatim.
export function detectIncompleteWork(plans, continueHereFiles) {
  const incompletePlans = (plans || [])
    .filter((p) => p && p.has_summary === false)
    .map((p) => p.id);
  return { incompletePlans, continueHereFiles: continueHereFiles || [] };
}

// ── resume status rendering (D-04) ────────────────────────────────────────────
// Return a human-readable status string naming the phase/plan/task, the
// next_action, and any blockers/async_jobs. Never throws on a partial handoff —
// degrade missing fields to "(n/a)".
export function renderResumeStatus(handoff) {
  const h = handoff || {};
  const phase = h.phase ?? "(n/a)";
  const plan = h.plan ?? "(n/a)";
  const task = h.task ?? "(n/a)";
  const lines = [`Resume context: phase ${phase}, plan ${plan}, task ${task}`];
  lines.push(`Next action: ${h.next_action ?? "(n/a)"}`);
  if (Array.isArray(h.blockers) && h.blockers.length) {
    lines.push(`Blockers: ${h.blockers.map((b) => (typeof b === "string" ? b : (b && b.description) || JSON.stringify(b))).join("; ")}`);
  }
  if (Array.isArray(h.async_jobs) && h.async_jobs.length) {
    lines.push(`Async jobs: ${h.async_jobs.map((j) => `${j.job_id} (${j.status})`).join(", ")}`);
  }
  return lines.join("\n");
}
