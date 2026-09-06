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

  if (action.op === "add") {
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
  } else {
    return { ok: false, code: "UNKNOWN_ACTION", error: `unknown action op "${action.op}"` };
  }

  const out = { milestoneName: doc.milestoneName, version: doc.version, phases };
  const check = validateRoadmapDoc(out, reqIds);
  if (!check.ok) return check;
  return { ok: true, doc: out };
}
