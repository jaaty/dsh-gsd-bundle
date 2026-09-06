// @dsh-gsd/bundle phase-management — pure CRUD + validation + renumbering for
// the ROADMAP phase model (CLH-01). Plain ESM, no dependencies, no ctx, no
// fs/git I/O — mirrors lib/_shared.js / lib/_capabilities.js. Operates on the
// parseRoadmap document shape ({ milestoneName, version, phases: [...] }) and
// returns { ok:false, code, error } fail-closed without mutating the input.

import { slugify, stringifyRoadmap, parseRoadmap } from "./_shared.js";

// ── D-04 hard-invariant validation ───────────────────────────────────────────
// Every hard check returns { ok:false, code, error } and leaves the input doc
// untouched. reqIds is a Set of valid REQ-IDs (from parseRequirements).
export function validateRoadmapDoc(doc, reqIds) {
  if (!doc || !Array.isArray(doc.phases)) {
    return { ok: false, code: "ROADMAP_UNPARSEABLE", error: "roadmap document is missing a phases array" };
  }
  const seenSlugs = new Set();
  const seenNames = new Set();
  for (const p of doc.phases) {
    if (!p.goal || String(p.goal).trim() === "") {
      return { ok: false, code: "EMPTY_GOAL", error: `phase ${p.n} (${p.name}) has an empty goal` };
    }
    if (!Array.isArray(p.requirements) || p.requirements.length === 0) {
      return { ok: false, code: "EMPTY_REQUIREMENTS", error: `phase ${p.n} (${p.name}) has no requirements` };
    }
    for (const req of p.requirements) {
      if (!reqIds.has(req)) {
        return { ok: false, code: "UNKNOWN_REQ_ID", error: `phase ${p.n} (${p.name}) references unknown requirement ${req}` };
      }
    }
    const slug = slugify(p.name);
    if (seenSlugs.has(slug)) {
      return { ok: false, code: "DUPLICATE_SLUG", error: `duplicate phase slug "${slug}"` };
    }
    seenSlugs.add(slug);
    if (seenNames.has(p.name)) {
      return { ok: false, code: "DUPLICATE_NAME", error: `duplicate phase name "${p.name}"` };
    }
    seenNames.add(p.name);
  }
  return { ok: true };
}

// ── OQ-1 contiguous renumbering ──────────────────────────────────────────────
// Returns a NEW array where each phase gets n = index+1. Never mutates input.
export function renumber(phases) {
  return phases.map((p, i) => ({ ...p, n: i + 1 }));
}

// ── CRUD dispatch ─────────────────────────────────────────────────────────────
// opts = { reqIds, activePhase, confirm }. activePhase is a number|null.
// Every op works on a deep copy; the input doc is never mutated. On success
// returns { ok:true, doc } where doc.phases deep-equals
// parseRoadmap(stringifyRoadmap(doc)).phases (round-trip invariant, D-05).
export function applyPhaseAction(doc, action, opts) {
  const reqIds = opts.reqIds;
  const activePhase = opts.activePhase ?? null;
  const confirm = opts.confirm === true;

  const phases = doc.phases.map((p) => ({ ...p, requirements: [...p.requirements] }));

  if (action.op === 'add') {
    const maxN = phases.reduce((m, p) => Math.max(m, Number(p.n) || 0), 0);
    const next = {
      n: maxN + 1,
      slug: slugify(action.name),
      name: action.name,
      goal: action.goal,
      requirements: [...(action.requirements || [])],
      status: action.status === "Complete" ? "Complete" : "pending",
    };
    phases.push(next);
  } else if (action.op === 'insert') {
    const at = action.at;
    if (!Number.isInteger(at) || at < 0 || at > phases.length) {
      return { ok: false, code: "INVALID_INDEX", error: `insert index ${at} out of range 0..${phases.length}` };
    }
    const next = {
      slug: slugify(action.name),
      name: action.name,
      goal: action.goal,
      requirements: [...(action.requirements || [])],
      status: action.status === "Complete" ? "Complete" : "pending",
    };
    phases.splice(at, 0, next);
    phases.splice(0, phases.length, ...renumber(phases));
  } else if (action.op === 'remove') {
    const target = phases.find((p) => Number(p.n) === Number(action.n));
    if (!target) return { ok: false, code: "NO_SUCH_PHASE", error: `no phase with number ${action.n}` };
    if (target.status === "Complete") {
      return { ok: false, code: "COMPLETE_PHASE_LOCKED", error: `phase ${target.n} (${target.name}) is Complete and cannot be removed` };
    }
    if (Number(target.n) === Number(activePhase) && !confirm) {
      return { ok: false, code: "ACTIVE_REMOVE_REQUIRES_YES", error: `phase ${target.n} is the active phase; pass confirm:true to remove it` };
    }
    const remainingPending = phases.filter((p) => p.n !== target.n && p.status !== "Complete").length;
    if (!confirm && remainingPending === 0) {
      return { ok: false, code: "LAST_PENDING_REQUIRES_YES", error: `removing phase ${target.n} would leave no pending phases; pass confirm:true` };
    }
    const filtered = phases.filter((p) => p.n !== target.n);
    phases.splice(0, phases.length, ...renumber(filtered));
  } else if (action.op === 'reorder') {
    const target = phases.find((p) => Number(p.n) === Number(action.n));
    if (!target) return { ok: false, code: "NO_SUCH_PHASE", error: `no phase with number ${action.n}` };
    if (target.status === "Complete") {
      return { ok: false, code: "COMPLETE_PHASE_LOCKED", error: `phase ${target.n} (${target.name}) is Complete and cannot be reordered` };
    }
    if (Number(target.n) === Number(activePhase)) {
      return { ok: false, code: "ACTIVE_REORDER_BLOCKED", error: `phase ${target.n} is the active phase and cannot be reordered` };
    }
    const to = action.to;
    if (!Number.isInteger(to) || to < 0 || to >= phases.length) {
      return { ok: false, code: "INVALID_INDEX", error: `reorder target index ${to} out of range 0..${phases.length - 1}` };
    }
    const from = phases.findIndex((p) => p.n === target.n);
    const [moved] = phases.splice(from, 1);
    phases.splice(to, 0, moved);
    phases.splice(0, phases.length, ...renumber(phases));
  } else if (action.op === 'edit') {
    const target = phases.find((p) => Number(p.n) === Number(action.n));
    if (!target) return { ok: false, code: "NO_SUCH_PHASE", error: `no phase with number ${action.n}` };
    if (action.name !== undefined) {
      target.name = action.name;
      target.slug = slugify(action.name);
    }
    if (action.goal !== undefined) target.goal = action.goal;
    if (action.requirements !== undefined) target.requirements = [...action.requirements];
    if (action.status !== undefined) {
      if (action.status !== "Complete" && action.status !== "pending") {
        return { ok: false, code: "INVALID_STATUS", error: `invalid status "${action.status}" (expected Complete or pending)` };
      }
      target.status = action.status;
    }
  } else {
    return { ok: false, code: "UNKNOWN_ACTION", error: `unknown action op "${action.op}"` };
  }

  const out = { milestoneName: doc.milestoneName, version: doc.version, phases };
  const check = validateRoadmapDoc(out, reqIds);
  if (!check.ok) return check;
  return { ok: true, doc: out };
}
