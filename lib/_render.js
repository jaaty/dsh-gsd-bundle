// @dsh-gsd/bundle/internal — the phase-22 capability-aware render/routing helper.
//
// Read-time presentation layer over the phase-21 capability store. Plain ESM,
// no dependencies, no ctx, no I/O — mirrors the lib/_shared.js pure-helper
// pattern (D-05/D-09). It takes capabilities in (via a caller-supplied
// getCapability thunk or a pre-supplied descriptors array) and returns render
// text / routing out, so it is unit-testable without a Cordis boot and never
// holds a module-level ctx.
//
// Both lib/persona.js and lib/core-tools.js (gsd_status) consume this single
// module, so the available-step ordering and next-action routing are
// single-sourced (D-09) and can never advertise an absent step (D-04/D-06).

import {
  CAPABILITY_KEYS,
  buildCapability,
  capabilityForTool,
} from "./_capabilities.js";

// The roles that participate in the loop chain. Everything else (orient/jobs/
// onboarding) is informational and not loop-ordered.
const LOOP_ROLES = ["step", "optional", "alternate"];
const INFO_ROLES = ["orient", "jobs", "onboarding"];

// The stored "next action" strings, keyed by the step name they correspond to.
// Mirrors lib/state.js `_nextActionFor`. The reverse mapping (step -> capability
// key) is derived here so it can be checked against the descriptor `step` field
// and can never drift from the descriptors.
const NEXT_ACTION_TO_STEP = new Map([
  ["discuss-phase", "discuss"],
  ["ui-phase", "ui"],
  ["plan-phase", "plan"],
  ["execute-phase", "execute"],
  ["verify-phase", "verify"],
  ["ship-phase", "ship"],
  ["done", null],
]);

// step -> capability key, derived from the descriptors so it stays in sync.
function stepToKey(step) {
  if (typeof step !== "string" || step === "") return null;
  for (const key of CAPABILITY_KEYS) {
    if (buildCapability(key).step === step) return key;
  }
  return null;
}

/**
 * Collect the currently-available capability descriptors, in CAPABILITY_KEYS
 * order. `getCap` is a callable `(key) => descriptor` thunk; the caller (the
 * persona / gsd_status) binds it to `(k) => ctx.get(k)`. When `getCap` is not
 * callable, the optional pre-supplied `descriptors` array is returned verbatim
 * (used by callers/tests that already hold resolved descriptors). Absent
 * capabilities (thunk returns null/undefined) are dropped, never throwing.
 */
export function availableCapabilities(getCap, descriptors) {
  if (typeof getCap === "function") {
    const out = [];
    for (const key of CAPABILITY_KEYS) {
      const d = getCap(key);
      if (d && typeof d === "object") out.push(d);
    }
    return out;
  }
  return Array.isArray(descriptors) ? descriptors : [];
}

/**
 * Pure string -> capability-key mapping for a stored `next_action` value.
 * `"verify-phase" -> "gsdVerify"`, `"done" -> null`, unknown/empty -> null.
 */
export function capabilityKeyForNextAction(nextAction) {
  if (nextAction === null || nextAction === undefined) return null;
  const step = NEXT_ACTION_TO_STEP.get(String(nextAction));
  if (step === null) return null; // "done"
  return step === undefined ? null : stepToKey(step);
}

/** Loop-chain descriptors (role step|optional|alternate), ascending by order. */
export function loopSteps(descriptors) {
  return (descriptors || [])
    .filter((d) => d && LOOP_ROLES.includes(d.role))
    .slice()
    .sort((a, b) => a.order - b.order);
}

/** Informational descriptors (orient|jobs|onboarding), CAPABILITY_KEYS order. */
export function informationEntries(descriptors) {
  return (descriptors || []).filter((d) => d && INFO_ROLES.includes(d.role));
}

/**
 * Compute the effective routable next step for a stored `next_action`, based
 * ONLY on capability presence (D-04/D-06/D-10): prereq/produces/consumes are
 * advisory and never gate routability. Returns an available loop descriptor,
 * or null when no loop step is available.
 *
 * Rules: if the mapped capability is present, return it. Otherwise return the
 * first available loop step with a strictly greater order than the would-be
 * step; if none is greater, return null. For a null/unknown next_action, fall
 * back to the first present loop step by ascending order.
 */
export function effectiveRoutableStep(nextAction, descriptors) {
  const loop = loopSteps(descriptors);
  if (loop.length === 0) return null;
  const key = capabilityKeyForNextAction(nextAction);
  if (key === null) return loop[0];
  const present = loop.find((d) => d.key === key);
  if (present) return present;
  // The targeted step is absent: advance to the nearest present step with a
  // strictly greater order.
  const targetOrder = buildCapability(key).order;
  return loop.find((d) => d.order > targetOrder) || null;
}

// Stable single spelling of the zero-loop fallback (D-06), shared by the
// snapshot, gsd_status, and renderAvailableSteps so they never diverge.
export const NO_LOOP_NOTICE = "no available loop step";

/** The exact D-06 zero-loop notice string. */
export function renderNoLoopNotice() {
  return NO_LOOP_NOTICE;
}

/**
 * Render the `## Available steps` body for gsd_status (D-04/D-08). Two ordered
 * sub-lists: loop steps (step|optional|alternate) ascending by descriptor.order
 * as `- <step>: <key> (order <order>)`, then informational entries
 * (orient|jobs|onboarding) in CAPABILITY_KEYS position as `- <step>: <key>`.
 * When no loop step is available, returns a single `- no available loop step`
 * line (D-06). Never throws over an empty/malformed descriptors array.
 */
export function renderAvailableSteps(descriptors) {
  const loop = loopSteps(descriptors);
  const info = informationEntries(descriptors);
  const lines = [];
  for (const d of loop) lines.push(`- ${d.step}: ${d.key} (order ${d.order})`);
  if (loop.length === 0) lines.push(`- ${NO_LOOP_NOTICE}`);
  for (const d of info) lines.push(`- ${d.step}: ${d.key}`);
  return lines.join("\n");
}
