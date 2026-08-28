// @dsh-gsd/bundle capability descriptors — the single source of truth for the
// plug-in capability surface (DEGR-01/D-04). Plain ESM, no dependencies, no
// ctx, no I/O — mirrors the lib/_shared.js pure-helper pattern (D-05).
//
// Every loop-step plugin (plus gsdOrient/gsdJobs from core-tools and the
// map-codebase plugin) publishes a camelCase capability via ctx.provide(key,
// buildCapability(key)). The descriptor carries the rich, advisory metadata
// (order / prereq / next / produces / consumes) that phase 22 rendering and
// routing consume; phase 21 only stores it, never enforces it (D-03/D-11).

// The six descriptor roles (D-03). `step` marks the core loop steps; the rest
// are off-chain or non-loop entries.
export const ROLES = Object.freeze(["step", "optional", "alternate", "onboarding", "orient", "jobs"]);

// Sentinel marking capabilities that are NOT loop-ordered (gsdOrient/gsdJobs).
// Distinct from every real order value; phase 22's loop renderer filters on it.
export const NOT_LOOP_ORDERED = -1;

// The 10 known capability keys, in a stable order: the onboarding map step
// (order 0) and the not-loop-ordered orient/jobs pairs come first, then the
// main loop chain (discuss -> ui -> plan -> quick -> execute -> verify -> ship).
export const CAPABILITY_KEYS = Object.freeze([
  "gsdMapCodebase",
  "gsdOrient",
  "gsdJobs",
  "gsdDiscuss",
  "gsdUi",
  "gsdPlan",
  "gsdQuick",
  "gsdExecute",
  "gsdVerify",
  "gsdShip",
]);

// ── descriptor table (single source of truth, D-04) ─────────────────────────−
// step/role/tools/commands/order per the D-04 mapping. prereq/next/produces/
// consumes are advisory metadata per the CONTEXT specifics; stored now, enforced
// in phase 22. `step` is a short human label of the loop step.
const TABLE = {
  gsdMapCodebase: {
    step: "map-codebase",
    role: "onboarding",
    tools: ["gsd_map_codebase", "gsd_intel_updater"],
    commands: ["gsd-map-codebase"],
    order: 0,
    prereq: [],
    next: [],
    produces: [],
    consumes: [],
  },
  gsdOrient: {
    step: "orient",
    role: "orient",
    tools: ["gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone"],
    commands: ["gsd-init", "gsd-status", "gsd-progress", "gsd-new-milestone"],
    order: NOT_LOOP_ORDERED,
    prereq: [],
    next: [],
    produces: [],
    consumes: [],
  },
  gsdJobs: {
    step: "jobs",
    role: "jobs",
    tools: ["gsd_job"],
    commands: [],
    order: NOT_LOOP_ORDERED,
    prereq: [],
    next: [],
    produces: [],
    consumes: [],
  },
  gsdDiscuss: {
    step: "discuss",
    role: "step",
    tools: ["gsd_discuss"],
    commands: ["gsd-discuss-phase"],
    order: 10,
    prereq: [],
    next: ["gsdPlan"],
    produces: ["CONTEXT.md"],
    consumes: [],
  },
  gsdUi: {
    step: "ui",
    role: "optional",
    tools: ["gsd_ui_phase"],
    commands: ["gsd-ui-phase"],
    order: 15,
    prereq: ["gsdDiscuss"],
    next: ["gsdPlan"],
    produces: ["UI-SPEC.md"],
    consumes: [],
  },
  gsdPlan: {
    step: "plan",
    role: "step",
    tools: ["gsd_plan"],
    commands: ["gsd-plan-phase"],
    order: 20,
    prereq: ["gsdDiscuss"],
    next: ["gsdExecute"],
    produces: ["PLAN.md"],
    consumes: ["CONTEXT.md"],
  },
  gsdQuick: {
    step: "quick",
    role: "alternate",
    tools: ["gsd_quick"],
    commands: ["gsd-quick"],
    order: 25,
    prereq: [],
    next: [],
    produces: [],
    consumes: [],
  },
  gsdExecute: {
    step: "execute",
    role: "step",
    tools: ["gsd_execute"],
    commands: ["gsd-execute-phase"],
    order: 30,
    prereq: ["gsdPlan"],
    next: ["gsdVerify"],
    produces: ["SUMMARY.md"],
    consumes: ["PLAN.md"],
  },
  gsdVerify: {
    step: "verify",
    role: "step",
    tools: ["gsd_verify"],
    commands: ["gsd-verify-work"],
    order: 40,
    prereq: ["gsdExecute"],
    next: ["gsdShip"],
    produces: ["VERIFICATION.md"],
    consumes: ["SUMMARY.md"],
  },
  gsdShip: {
    step: "ship",
    role: "step",
    tools: ["gsd_ship"],
    commands: ["gsd-ship"],
    order: 50,
    prereq: ["gsdVerify"],
    next: [],
    produces: [],
    consumes: ["VERIFICATION.md"],
  },
};

function fail(key, reason) {
  throw new Error(`buildCapability: ${key} ${reason}`);
}

// Fail-loud (D-10): throw synchronously on malformed input. Consumers are
// responsible for tolerating an *absent* capability at read time; this guard
// only rejects an actually-malformed descriptor at construction.
export function buildCapability(key) {
  const row = TABLE[key];
  if (!row) fail(key, "is not a known capability key");
  if (!Array.isArray(row.tools) || row.tools.length === 0) fail(key, "tools must be a non-empty array");
  if (!Array.isArray(row.commands)) fail(key, "commands must be an array");
  if (typeof row.step !== "string" || row.step === "") fail(key, "step must be a non-empty string");
  if (!ROLES.includes(row.role)) fail(key, `role must be one of ${ROLES.join(", ")}`);
  if (!Number.isFinite(row.order)) fail(key, "order must be a finite number");
  return Object.freeze({
    key,
    step: row.step,
    role: row.role,
    tools: Object.freeze([...row.tools]),
    commands: Object.freeze([...row.commands]),
    order: row.order,
    prereq: Object.freeze([...row.prereq]),
    next: Object.freeze([...row.next]),
    produces: Object.freeze([...row.produces]),
    consumes: Object.freeze([...row.consumes]),
  });
}

// Convenience: descriptors for every known key, in CAPABILITY_KEYS order.
export function allCapabilities() {
  return CAPABILITY_KEYS.map(buildCapability);
}
