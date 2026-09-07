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

  // ── Branch 4 (MID_PHASE): active phase + step not done/shipped (D-07) ────
  // NOTE: branches 2, 3, 5, 6 are added in Task 2. For Task 1 the classifier
  // handles the no-project and mid-phase branches; other states fall through.
  if (s.state && s.roadmap) {
    const fm = s.state.frontmatter || {};
    const activePhase = fm.active_phase;
    if (activePhase !== null && activePhase !== undefined && String(activePhase) !== "") {
      const activeNum = Number(activePhase);
      const phase = s.roadmap.phases.find((p) => p.n === activeNum);
      const phaseComplete = phase ? phase.status === "Complete" : false;
      const statusDone = fm.status === "done";
      // D-07 fall-through: done status OR Complete phase -> not a no-op
      // (branch 5 handles this in Task 2).
      if (!statusDone && !phaseComplete) {
        const desc = effectiveRoutableStep(fm.next_action, descriptors);
        const rec = desc ? stepToRecommendation(desc.step) : FALLBACK_RECOMMENDATION;
        return { branch: BRANCH.MID_PHASE, recommendation: rec, mutation: null };
      }
    }
  }

  // Remaining branches (2 corrupt, 3 paused, 5 phase-shipped-next, 6
  // milestone-complete) are implemented in Task 2. Until then, fall through to
  // a safe orientation fallback so the classifier never throws.
  return { branch: BRANCH.NO_PROJECT, recommendation: FALLBACK_RECOMMENDATION, mutation: null };
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