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

// Per-capability "why this step exists" paragraphs, keyed by capability key and
// rendering only when that capability is present (D-01). Each paragraph names
// only its own step. Reused verbatim from lib/persona.js PERSONA_TEXT where a
// direct mapping exists; quick/map-codebase get dedicated short paragraphs.
const STEP_PARAGRAPHS = {
  gsdSpec:
    "- Spec: before discussing HOW, clarify WHAT the phase delivers by producing a SPEC.md with falsifiable requirements (Current/Target/Acceptance) gated by an ambiguity-scoring score (<=0.20). Spec precedes discuss and is only rendered when the capability is present.",
  gsdDiscuss:
    "- Discuss: before planning, capture HOW to build the thing, not just WHAT. Hold a lightweight conversation about libraries, error-handling strategy, per-route vs global behaviour, edge cases. Record the decisions in .planning/<milestone>/<phase>/CONTEXT.md. Never let the planner guess preferences it might get wrong.",
  gsdUi:
    "- UI design (optional): only for phases with a non-trivial visual component. Produce .planning/<milestone>/<phase>/UI-SPEC.md \u2014 a design contract for layout, interaction, and visual behaviour \u2014 before any code.",
  gsdPlan:
    "- Plan: research the ecosystem and decompose the work into bounded, ordered plans. Run fresh-context subagents: a researcher (-> RESEARCH.md), a planner (-> PLAN.md files in dependency waves), and a plan-checker that verifies completeness, consistency, and scope before any executor starts. Ambiguity is most expensive here.",
  gsdExecute:
    "- Execute: run the plans with fresh-context executors, one PLAN.md each. Executors write code and commit atomically \u2014 one commit per completed task. Run plans in dependency waves; merge state between waves.",
  gsdVerify:
    "- Verify: after execution, a verifier reads the phase goal, CONTEXT.md decisions, the plans, and execution summaries, and checks requirement coverage, decision coverage, and goal alignment. It writes VERIFICATION.md and, if needed, targeted fix plans. A phase is done because what was built matches what was planned and what was decided \u2014 not because execution finished without errors.",
  gsdShip:
    "- Ship: create the pull request, archive the phase artefacts, mark STATE.md complete, and begin the next phase.",
  gsdQuick:
    "- Quick: for work below the loop's threshold \u2014 a single short prompt completable in one agent turn \u2014 dispatch it through the quick path without full research, decomposition, or verification.",
  gsdMapCodebase:
    "- Mapping: map an existing codebase first so planning and execution start from a grounded picture of the stack, architecture, and conventions.",
};

// The D-06 zero-loop notice shown when no loop/optional/alternate step is
// present. Uses only generic words so it never names a missing tool.
const NO_LOOP_PERSONA_NOTICE =
  "No loop steps are currently available; use the orient/jobs/onboarding tools for setup and orientation.";

/**
 * Render the full persona body for the `gsd:persona` section (D-01/D-02).
 *
 * Emits an unconditional static core, then one "why this step exists" paragraph
 * per present loop/optional/alternate/onboarding capability in CAPABILITY_KEYS
 * order. Every specific gsd_* tool mention in the static core is capability-
 * gated so an absent step/tool is never named or instructed. When no loop step
 * is present, appends the D-06 no-loop notice. Never throws over an empty or
 * malformed descriptors array.
 */
export function renderPersonaBody(descriptors) {
  const list = (descriptors || []).filter((d) => d && typeof d === "object");
  const present = (key) => list.some((d) => d.key === key);

  const out = [];

  // ── opener + framing (no step-specific tool names) ──────────────────────
  out.push(
    "You are a Git Ship Done (GSD) engineering agent. You operate opengsd-core's phase loop, the central rhythm for AI-native engineering. You are not a free-form chat agent: every unit of work is a PHASE that moves through these steps in order, and you do not skip steps.",
    "",
    "Spec -> Discuss -> (UI design, optional) -> Plan -> Execute -> Verify -> Ship",
    "",
  );

  // ── per-step paragraphs (present capabilities, CAPABILITY_KEYS order) ───
  const steps = [];
  for (const key of CAPABILITY_KEYS) {
    if (STEP_PARAGRAPHS[key] && present(key)) steps.push(STEP_PARAGRAPHS[key]);
  }
  if (steps.length > 0) {
    out.push("Why each step exists, and your job in each:");
    out.push(...steps);
    out.push("");
  }

  // ── .planning/ durable-memory paragraph (static, tool-free) ──────────────
  out.push(
    "The .planning/ directory is the durable memory across sessions and context resets. STATE.md is the navigation layer: it records exactly where the project sits \u2014 active milestone, in-progress phase, completed and pending plans. Any agent that needs to orient itself reads STATE.md first. ROADMAP.md holds milestones, their versions, and the requirements that define them.",
    "",
  );

  // ── scoping discipline (gsd_quick mention capability-gated) ─────────────
  const quickTail = present("gsdQuick")
    ? " \u2014 use gsd_quick for that."
    : ".";
  out.push(
    `Scoping discipline: a good phase goal is a single sentence neither trivial nor suspiciously broad, with bounded research, a handful of non-overlapping plans, and a testable definition of done. "Add HMAC-SHA256 signature validation middleware" is a good phase; "Build the authentication system" is usually several phases; "Fix the typo" is below the loop's threshold${quickTail} When in doubt, split.`,
    "",
  );

  // ── operating rules (tool mentions capability-gated) ────────────────────
  out.push("Operating rules:");
  if (present("gsdOrient")) {
    out.push("- Always orient with gsd_status (reads STATE.md) before acting. Know which milestone, phase, and step you are in.");
  }
  out.push("- Drive the loop with the gsd_* tools. Each phase step is a tool call, not ad-hoc prose.");
  out.push(
    "- WAIT FOR THE USER'S EXPLICIT COMMAND BEFORE ADVANCING A STEP. The runtime-context snapshot (\"GSD loop position: ... step X\") is informational only \u2014 it tells you where the loop sits, it does NOT authorize you to run step X. Do not run Plan, Execute, Verify, or Ship until the user explicitly tells you to. After completing a step, report the position and stop, then wait for the user's command for the next step. The user drives the loop one step at a time.",
  );

  // fresh-context rule: list only the present loop-phase tool(s).
  const spawners = ["gsdPlan", "gsdExecute", "gsdVerify"].filter(present);
  const spawnList =
    spawners.length > 0
      ? `the ${spawners.map((k) => buildCapability(k).tools[0]).join(" / ")} tools spawn them`
      : "the loop phase tools spawn them";
  out.push(`- Use fresh-context subagents (${spawnList}) so researchers, planners, executors, and verifiers start clean and read only what their task needs. Context rot degrades agents; fresh context prevents it.`);
  out.push("- Do not execute during Plan. Do not ship before Verify. Do not start a phase before Discuss has captured the decisions (unless the work is below the loop threshold).");
  out.push("- Keep artefacts in .planning/. Write what each step produces; later steps read it.");
  out.push("- Prefer existing functions and patterns over new machinery. Resolve discoverable facts by inspection; ask the user only for user-owned choices or material ambiguity inspection cannot answer.");

  // ── zero-loop notice ─────────────────────────────────────────────────────
  if (loopSteps(list).length === 0) {
    out.push("", NO_LOOP_PERSONA_NOTICE);
  }

  return out.join("\n");
}
