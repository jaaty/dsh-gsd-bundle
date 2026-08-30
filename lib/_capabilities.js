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
export const ROLES = Object.freeze(["step", "optional", "alternate", "onboarding", "orient", "jobs", "out-of-band"]);

// Sentinel marking capabilities that are NOT loop-ordered (gsdOrient/gsdJobs).
// Distinct from every real order value; phase 22's loop renderer filters on it.
export const NOT_LOOP_ORDERED = -1;

// The 15 known capability keys, in a stable order: the onboarding map step
// (order 0) and the not-loop-ordered orient/jobs pairs come first, then the
// main loop chain (spec -> discuss -> ui -> plan -> gap-analysis -> quick ->
// execute -> code-review -> ui-review -> verify -> validate -> ship). gap-analysis
// (order 22) slots between plan(20) and quick(25) per phase 37 D-02; code-review
// (order 35) slots between execute(30) and verify(40) per phase 38 D-02; ui-review
// (order 36) slots between code-review(35) and verify(40) per phase 39 D-01;
// validate-phase (order 45) slots between verify(40) and ship(50) per phase 40 D-02.
export const CAPABILITY_KEYS = Object.freeze([
  "gsdMapCodebase",
  "gsdOrient",
  "gsdJobs",
  "gsdSpec",
  "gsdDiscuss",
  "gsdUi",
  "gsdPlan",
  "gsdGapAnalysis",
  "gsdQuick",
  "gsdExecute",
  "gsdCodeReview",
  "gsdUiReview",
  "gsdVerify",
  "gsdValidatePhase",
  "gsdShip",
  "gsdUndo",
  "gsdHealth",
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
  gsdSpec: {
    step: "spec",
    role: "step",
    tools: ["gsd_spec_phase"],
    commands: ["gsd-spec-phase"],
    order: 5,
    prereq: [],
    next: ["gsdDiscuss"],
    produces: ["SPEC.md"],
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
    next: ["gsdGapAnalysis"],
    produces: ["PLAN.md"],
    consumes: ["CONTEXT.md"],
  },
  gsdGapAnalysis: {
    step: "gap-analysis",
    role: "step",
    tools: ["gsd_gap_analysis"],
    commands: ["gsd-gap-analysis"],
    order: 22,
    prereq: ["gsdPlan"],
    next: ["gsdExecute"],
    produces: ["COVERAGE.md"],
    consumes: ["PLAN.md", "CONTEXT.md"],
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
  gsdCodeReview: {
    step: "code-review",
    role: "step",
    tools: ["gsd_code_review"],
    commands: ["gsd-code-review"],
    order: 35,
    prereq: ["gsdExecute"],
    next: ["gsdVerify"],
    produces: ["REVIEW.md", "REVIEW-FIX.md"],
    consumes: ["SUMMARY.md"],
  },
  gsdUiReview: {
    step: "ui-review",
    role: "step",
    tools: ["gsd_ui_review"],
    commands: ["gsd-ui-review"],
    order: 36,
    prereq: ["gsdExecute"],
    next: ["gsdVerify"],
    produces: ["UI-REVIEW.md"],
    consumes: ["SUMMARY.md"],
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
  gsdValidatePhase: {
    step: "validate",
    role: "step",
    tools: ["gsd_validate_phase"],
    commands: ["gsd-validate-phase"],
    order: 45,
    prereq: ["gsdVerify"],
    next: ["gsdShip"],
    produces: ["VALIDATION.md"],
    consumes: ["SUMMARY.md", "VERIFICATION.md"],
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
  gsdUndo: {
    step: "undo",
    role: "out-of-band",
    tools: ["gsd_undo"],
    commands: ["gsd-undo"],
    order: NOT_LOOP_ORDERED,
    prereq: [],
    next: [],
    produces: ["UNDO.md"],
    consumes: [],
  },
  gsdHealth: {
    step: "health",
    role: "out-of-band",
    tools: ["gsd_health"],
    commands: ["gsd-health"],
    order: NOT_LOOP_ORDERED,
    prereq: [],
    next: [],
    produces: ["HEALTH.md"],
    consumes: [],
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

// Tool -> capability key lookup. Returns the capability key whose descriptor
// `tools` array includes the given tool name, or undefined for an unknown tool.
// Single-sources the tool->capability mapping with the descriptor TABLE so the
// persona's never-instruct-a-missing-tool gate (D-02) and the renderer drift
// cannot diverge. Plain ESM, no ctx, no I/O.
export function capabilityForTool(tool) {
  if (typeof tool !== "string" || tool === "") return undefined;
  for (const key of CAPABILITY_KEYS) {
    if (TABLE[key].tools.includes(tool)) return key;
  }
  return undefined;
}
