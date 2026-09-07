// @dsh-gsd/bundle/internal — the phase-53 smart-entry pure domain core.
//
// The state classifier `classifyNextState` and recommendation renderer
// `renderNextRecommendation` for the gsd_next tool (CLH-02 / CLH-03). Pure,
// side-effect-free ESM: no host context, no fs, no I/O, no async (D-03). The tool's
// execute path (plan 02) gathers a state snapshot via the gsdState accessors,
// passes it plus the capability descriptors here, applies the (optional)
// STATE mutation, then returns the rendered text. All branching logic lives
// in this module so it is unit-testable in isolation across the full state
// matrix before any STATE mutation is applied (D-03).
//
// Mirrors the pure-helper discipline of lib/pause-resume.js, lib/_render.js,
// and lib/autonomous.js.

import { effectiveRoutableStep } from "./_render.js";

// The six D-04 classification branches, in precedence order (1 -> 6).
export const BRANCH = Object.freeze({
  NO_PROJECT: "no-project",
  CORRUPT: "corrupt",
  PAUSED: "paused",
  MID_PHASE: "mid-phase",
  PHASE_SHIPPED_NEXT: "phase-shipped-next",
  MILESTONE_COMPLETE: "milestone-complete",
});

// The capability-gated generic fallback recommendation (D-06 / OQ-2). Only
// reached when a routed capability is absent while gsdOrient is present:
// gsd_next is itself registered under gsdOrient, so gsd_status (also a
// gsdOrient tool) is guaranteed available in the live execute path. The
// test matrix retires only gsdHealth / gsdMilestoneAudit, never gsdOrient,
// so the never-instruct-a-missing-tool invariant holds in every reachable
// state.
const FALLBACK_RECOMMENDATION = "gsd_status";

/**
 * Capability-presence helper. Returns true when `descriptors` contains an
 * entry whose `key` equals `key`, mirroring the descriptor shape produced by
 * `buildCapability` (lib/_capabilities.js) and consumed by
 * `availableCapabilities` (lib/_render.js).
 *
 * @param {Array<{key:string}>} descriptors - capability descriptors.
 * @param {string} key - capability key (e.g. "gsdOrient").
 * @returns {boolean}
 */
export function hasCap(descriptors, key) {
  return Array.isArray(descriptors) && descriptors.some((d) => d && d.key === key);
}

// Map a loop-step descriptor's `step` to the stored next-action string
// convention (e.g. "plan" -> "plan-phase"). Mirrors lib/state.js
// `_nextActionFor` and lib/_render.js `NEXT_ACTION_TO_STEP`. Pure.
function stepToRecommendation(step) {
  if (typeof step !== "string" || step === "") return FALLBACK_RECOMMENDATION;
  return `${step}-phase`;
}

/**
 * Classify the current project state into one routing branch (D-04) and
 * return the recommendation + optional STATE mutation descriptor. Evaluates
 * the branches top-down in precedence order and returns on the first match.
 *
 * The `snapshot` is gathered by the tool's execute path (plan 02) from the
 * gsdState accessors; this function performs no I/O of its own.
 *
 * Snapshot contract:
 *   { hasProject: boolean, state: { frontmatter } | undefined,
 *     roadmap: { phases: [{n,name,status}], milestoneName } | undefined,
 *     handoff: object|undefined, continueHere: string|undefined,
 *     milestoneAudit: { status } | undefined }
 *
 * @param {object} snapshot - gathered project state.
 * @param {Array<{key:string,step:string,role:string,order:number}>} descriptors
 *   - capability descriptors (loop + orient + out-of-band).
 * @returns {{branch:string, recommendation:string, mutation:(object|null)}}
 */
export function classifyNextState(snapshot, descriptors) {
  const s = snapshot || {};

  // ── Branch 1 (NO_PROJECT): .planning/ absent entirely ─────────────────────
  if (!s.hasProject) {
    const rec = hasCap(descriptors, "gsdOrient") ? "gsd_init" : FALLBACK_RECOMMENDATION;
    return { branch: BRANCH.NO_PROJECT, recommendation: rec, mutation: null };
  }

  // ── Branch 2 (CORRUPT): .planning exists but STATE or ROADMAP missing ─────
  // D-04: do NOT mutate STATE, do NOT guess. Route to gsd_health (gated on the
  // gsdHealth capability).
  if (!s.state || !s.roadmap) {
    const rec = hasCap(descriptors, "gsdHealth") ? "gsd_health" : FALLBACK_RECOMMENDATION;
    return { branch: BRANCH.CORRUPT, recommendation: rec, mutation: null };
  }

  // ── Branch 3 (PAUSED): handoff present short-circuits mid-phase (D-05) ───
  // Never re-points STATE; a paused mid-phase session is resumed rather than
  // silently advanced. Route to gsd_resume_work (gated on gsdOrient).
  if (s.handoff || s.continueHere !== undefined) {
    const rec = hasCap(descriptors, "gsdOrient") ? "gsd_resume_work" : FALLBACK_RECOMMENDATION;
    return { branch: BRANCH.PAUSED, recommendation: rec, mutation: null };
  }

  // ── Branch 4 (MID_PHASE): active phase + step not done/shipped (D-07) ────
  if (s.state && s.roadmap) {
    const fm = s.state.frontmatter || {};
    const activePhase = fm.active_phase;
    if (activePhase !== null && activePhase !== undefined && String(activePhase) !== "") {
      const activeNum = Number(activePhase);
      if (Number.isFinite(activeNum)) {
        const phase = s.roadmap.phases.find((p) => p.n === activeNum);
        const phaseComplete = phase ? phase.status === "Complete" : false;
        const statusDone = fm.status === "done";
        // D-07 fall-through: done status OR Complete phase OR a stale
        // active_phase absent from the roadmap -> fall through to branch 5
        // (phase-shipped-next), never a no-op recommendation.
        if (phase && !statusDone && !phaseComplete) {
          const desc = effectiveRoutableStep(fm.next_action, descriptors);
          const rec = desc ? stepToRecommendation(desc.step) : FALLBACK_RECOMMENDATION;
          return { branch: BRANCH.MID_PHASE, recommendation: rec, mutation: null };
        }
      }
    }
  }

  // ── Branch 5 (PHASE_SHIPPED_NEXT): pending phases remain (D-08) ───────────
  // The next phase is the lowest-numbered pending phase (deterministic,
  // survives reordering). Set active at step 'discuss' (or 'spec' when the
  // gsdSpec capability is present, mirroring the spec-first ordering). The
  // recommendation is capability-aware via effectiveRoutableStep.
  const pending = (s.roadmap.phases || []).filter((p) => p && p.status === "pending");
  if (pending.length > 0) {
    const nums = pending.map((p) => p.n).filter((v) => Number.isFinite(v));
    if (nums.length === 0) {
      // No pending phase carries a numeric n — cannot pick a deterministic next
      // phase. Do not re-point STATE with NaN; fall back to a safe recommendation.
      return { branch: BRANCH.PHASE_SHIPPED_NEXT, recommendation: FALLBACK_RECOMMENDATION, mutation: null };
    }
    const nextPhaseNum = Math.min(...nums);
    const step = hasCap(descriptors, "gsdSpec") ? "spec" : "discuss";
    const desc = effectiveRoutableStep(`${step}-phase`, descriptors);
    const rec = desc ? stepToRecommendation(desc.step) : FALLBACK_RECOMMENDATION;
    return {
      branch: BRANCH.PHASE_SHIPPED_NEXT,
      recommendation: rec,
      mutation: { setActivePhase: { phaseNum: nextPhaseNum, step } },
      nextPhase: nextPhaseNum,
    };
  }

  // ── Branch 6 (MILESTONE_COMPLETE): every phase Complete (D-09) ───────────
  // Route to gsd_milestone_audit; when an audit already reports
  // 'ready-to-close', route to gsd_new_milestone instead. This branch re-points
  // neither STATE active_phase nor step — it returns the recommended command.
  if (s.milestoneAudit && s.milestoneAudit.status === "ready-to-close") {
    const rec = hasCap(descriptors, "gsdOrient") ? "gsd_new_milestone" : FALLBACK_RECOMMENDATION;
    return { branch: BRANCH.MILESTONE_COMPLETE, recommendation: rec, mutation: null };
  }
  {
    const rec = hasCap(descriptors, "gsdMilestoneAudit") ? "gsd_milestone_audit" : FALLBACK_RECOMMENDATION;
    return { branch: BRANCH.MILESTONE_COMPLETE, recommendation: rec, mutation: null };
  }
}

/**
 * Render a classified result into human-facing text that names the command
 * to invoke next but never claims to auto-run it (D-02). Pure.
 *
 * @param {{branch:string, recommendation:string, mutation:(object|null)}} result
 * @returns {string}
 */
export function renderNextRecommendation(result) {
  const r = result || {};
  const rec = r.recommendation || FALLBACK_RECOMMENDATION;
  return `Next action: run ${rec}.`;
}