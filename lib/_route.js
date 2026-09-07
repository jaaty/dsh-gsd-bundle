// @dsh-gsd/bundle/internal — the phase-54 freeform-routing pure domain core.
//
// The intent classifier `classifyIntent` and recommendation renderer
// `renderRouteRecommendation` for the gsd_route tool (CLH-04). Pure,
// side-effect-free ESM: no host context, no fs, no I/O, no async (D-03). The
// tool's execute path (plan 02) passes the free-text intent string plus the
// present capability descriptors here and returns the rendered recommendation
// text — it never auto-runs the routed step tool (D-02). All branching logic
// lives in this module so it is unit-testable in isolation across the
// intent->command matrix before any routing is recommended (D-03).
//
// Mirrors the pure-helper discipline of lib/_next.js (phase 53), lib/_render.js,
// and lib/_capabilities.js.

import { effectiveRoutableStep } from "./_render.js";
import { allCapabilities, capabilityForTool, buildCapability } from "./_capabilities.js";

// The capability-gated generic fallback recommendation (D-06 / D-08). Only
// reached for empty/garbage/ambiguous intents or when a routed capability is
// absent while gsdOrient is present. gsd_route is itself registered under
// gsdOrient, so gsd_status (also a gsdOrient tool) is guaranteed available in
// the live execute path.
export const FALLBACK_RECOMMENDATION = "gsd_status";

// Commands that require an explicit phase number in the intent (D-09). When a
// matched command is in this set and no phase is found, the recommendation
// notes the missing argument rather than fabricating a phase.
const PHASE_REQUIRED = new Set([
  "gsd_discuss",
  "gsd_spec_phase",
  "gsd_ui_phase",
  "gsd_plan",
  "gsd_gap_analysis",
  "gsd_execute",
  "gsd_code_review",
  "gsd_ui_review",
  "gsd_verify",
  "gsd_validate_phase",
  "gsd_undo",
  "gsd_health",
  "gsd_ship",
  "gsd_extract_learnings",
  "gsd_mempalace_recall",
  "gsd_mempalace_capture",
]);

// The intent->command synonym table (D-03). Each command maps to an array of
// { phrase, weight } entries. Weight 1 = generic single word, weight 2 =
// specific multi-word phrasing, weight 3 = the exact tool/slash-command name.
// The router itself (gsd_route) is deliberately excluded so it is never a
// routing target (avoids recursion).
const SYNONYMS = {
  gsd_discuss: [
    { phrase: "discuss", weight: 1 },
    { phrase: "discussion", weight: 1 },
    { phrase: "seal context", weight: 2 },
    { phrase: "context", weight: 1 },
    { phrase: "gsd_discuss", weight: 3 },
    { phrase: "gsd-discuss-phase", weight: 3 },
  ],
  gsd_spec_phase: [
    { phrase: "spec", weight: 1 },
    { phrase: "specify", weight: 1 },
    { phrase: "spec phase", weight: 2 },
    { phrase: "gsd_spec_phase", weight: 3 },
    { phrase: "gsd-spec-phase", weight: 3 },
  ],
  gsd_ui_phase: [
    { phrase: "ui design", weight: 2 },
    { phrase: "ui spec", weight: 2 },
    { phrase: "ui phase", weight: 2 },
    { phrase: "gsd_ui_phase", weight: 3 },
    { phrase: "gsd-ui-phase", weight: 3 },
  ],
  gsd_plan: [
    { phrase: "plan", weight: 1 },
    { phrase: "planning", weight: 1 },
    { phrase: "plan phase", weight: 2 },
    { phrase: "make a plan", weight: 2 },
    { phrase: "gsd_plan", weight: 3 },
    { phrase: "gsd-plan-phase", weight: 3 },
  ],
  gsd_gap_analysis: [
    { phrase: "gap analysis", weight: 2 },
    { phrase: "coverage", weight: 1 },
    { phrase: "gsd_gap_analysis", weight: 3 },
    { phrase: "gsd-gap-analysis", weight: 3 },
  ],
  gsd_execute: [
    { phrase: "execute", weight: 1 },
    { phrase: "run the plan", weight: 2 },
    { phrase: "execute phase", weight: 2 },
    { phrase: "do the work", weight: 2 },
    { phrase: "gsd_execute", weight: 3 },
    { phrase: "gsd-execute-phase", weight: 3 },
  ],
  gsd_code_review: [
    { phrase: "code review", weight: 2 },
    { phrase: "review", weight: 1 },
    { phrase: "review code", weight: 2 },
    { phrase: "gsd_code_review", weight: 3 },
    { phrase: "gsd-code-review", weight: 3 },
  ],
  gsd_ui_review: [
    { phrase: "ui review", weight: 2 },
    { phrase: "ui audit", weight: 2 },
    { phrase: "review", weight: 1 },
    { phrase: "gsd_ui_review", weight: 3 },
    { phrase: "gsd-ui-review", weight: 3 },
  ],
  gsd_verify: [
    { phrase: "verify", weight: 1 },
    { phrase: "verification", weight: 1 },
    { phrase: "check the work", weight: 2 },
    { phrase: "gsd_verify", weight: 3 },
    { phrase: "gsd-verify-work", weight: 3 },
  ],
  gsd_validate_phase: [
    { phrase: "validate", weight: 1 },
    { phrase: "validation", weight: 1 },
    { phrase: "gsd_validate_phase", weight: 3 },
    { phrase: "gsd-validate-phase", weight: 3 },
  ],
  gsd_ship: [
    { phrase: "ship", weight: 1 },
    { phrase: "create pr", weight: 2 },
    { phrase: "pull request", weight: 2 },
    { phrase: "ship phase", weight: 2 },
    { phrase: "gsd_ship", weight: 3 },
    { phrase: "gsd-ship", weight: 3 },
  ],
  gsd_status: [
    { phrase: "status", weight: 1 },
    { phrase: "orient", weight: 1 },
    { phrase: "where are we", weight: 2 },
    { phrase: "what's the state", weight: 2 },
    { phrase: "gsd_status", weight: 3 },
    { phrase: "gsd-status", weight: 3 },
  ],
  gsd_progress: [
    { phrase: "progress", weight: 1 },
    { phrase: "how far along", weight: 2 },
    { phrase: "gsd_progress", weight: 3 },
    { phrase: "gsd-progress", weight: 3 },
  ],
  gsd_next: [
    { phrase: "next", weight: 1 },
    { phrase: "next action", weight: 2 },
    { phrase: "smart entry", weight: 2 },
    { phrase: "what next", weight: 2 },
    { phrase: "gsd_next", weight: 3 },
    { phrase: "gsd-next", weight: 3 },
  ],
  gsd_init: [
    { phrase: "init", weight: 1 },
    { phrase: "initialise", weight: 1 },
    { phrase: "initialize", weight: 1 },
    { phrase: "bootstrap", weight: 1 },
    { phrase: "start a project", weight: 2 },
    { phrase: "gsd_init", weight: 3 },
    { phrase: "gsd-init", weight: 3 },
  ],
  gsd_quick: [
    { phrase: "quick", weight: 1 },
    { phrase: "quick task", weight: 2 },
    { phrase: "small task", weight: 2 },
    { phrase: "gsd_quick", weight: 3 },
    { phrase: "gsd-quick", weight: 3 },
  ],
  gsd_health: [
    { phrase: "health", weight: 1 },
    { phrase: "check integrity", weight: 2 },
    { phrase: "repair", weight: 1 },
    { phrase: "gsd_health", weight: 3 },
    { phrase: "gsd-health", weight: 3 },
  ],
  gsd_undo: [
    { phrase: "undo", weight: 1 },
    { phrase: "roll back", weight: 2 },
    { phrase: "revert", weight: 1 },
    { phrase: "gsd_undo", weight: 3 },
    { phrase: "gsd-undo", weight: 3 },
  ],
  gsd_milestone_audit: [
    { phrase: "milestone audit", weight: 2 },
    { phrase: "audit milestone", weight: 2 },
    { phrase: "gsd_milestone_audit", weight: 3 },
  ],
  gsd_extract_learnings: [
    { phrase: "learnings", weight: 1 },
    { phrase: "extract learnings", weight: 2 },
    { phrase: "gsd_extract_learnings", weight: 3 },
    { phrase: "gsd-extract-learnings", weight: 3 },
  ],
  gsd_graphify: [
    { phrase: "graphify", weight: 1 },
    { phrase: "knowledge graph", weight: 2 },
    { phrase: "graph", weight: 1 },
    { phrase: "gsd_graphify", weight: 3 },
    { phrase: "gsd-graphify", weight: 3 },
  ],
  gsd_mempalace_recall: [
    { phrase: "mempalace recall", weight: 2 },
    { phrase: "recall", weight: 1 },
    { phrase: "gsd_mempalace_recall", weight: 3 },
    { phrase: "gsd-mempalace-recall", weight: 3 },
  ],
  gsd_mempalace_capture: [
    { phrase: "mempalace capture", weight: 2 },
    { phrase: "capture", weight: 1 },
    { phrase: "gsd_mempalace_capture", weight: 3 },
    { phrase: "gsd-mempalace-capture", weight: 3 },
  ],
  gsd_autonomous: [
    { phrase: "autonomous", weight: 1 },
    { phrase: "drive all phases", weight: 2 },
    { phrase: "gsd_autonomous", weight: 3 },
    { phrase: "gsd-autonomous", weight: 3 },
  ],
  gsd_add_tests: [
    { phrase: "add tests", weight: 2 },
    { phrase: "tests", weight: 1 },
    { phrase: "gsd_add_tests", weight: 3 },
    { phrase: "gsd-add-tests", weight: 3 },
  ],
  gsd_phase: [
    { phrase: "phase manage", weight: 2 },
    { phrase: "add phase", weight: 2 },
    { phrase: "reorder phase", weight: 2 },
    { phrase: "edit phase", weight: 2 },
    { phrase: "gsd_phase", weight: 3 },
    { phrase: "gsd-phase-manage", weight: 3 },
  ],
  gsd_map_codebase: [
    { phrase: "map codebase", weight: 2 },
    { phrase: "map the code", weight: 2 },
    { phrase: "codebase map", weight: 2 },
    { phrase: "gsd_map_codebase", weight: 3 },
    { phrase: "gsd-map-codebase", weight: 3 },
  ],
  gsd_intel_updater: [
    { phrase: "intel updater", weight: 2 },
    { phrase: "remap", weight: 1 },
    { phrase: "update map", weight: 2 },
    { phrase: "gsd_intel_updater", weight: 3 },
  ],
  gsd_pause_work: [
    { phrase: "pause", weight: 1 },
    { phrase: "pause work", weight: 2 },
    { phrase: "gsd_pause_work", weight: 3 },
    { phrase: "gsd-pause-work", weight: 3 },
  ],
  gsd_resume_work: [
    { phrase: "resume", weight: 1 },
    { phrase: "resume work", weight: 2 },
    { phrase: "gsd_resume_work", weight: 3 },
    { phrase: "gsd-resume-work", weight: 3 },
  ],
  gsd_new_milestone: [
    { phrase: "new milestone", weight: 2 },
    { phrase: "start milestone", weight: 2 },
    { phrase: "gsd_new_milestone", weight: 3 },
    { phrase: "gsd-new-milestone", weight: 3 },
  ],
  gsd_job: [
    { phrase: "job", weight: 1 },
    { phrase: "launch job", weight: 2 },
    { phrase: "background job", weight: 2 },
    { phrase: "gsd_job", weight: 3 },
  ],
};

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

/** Lowercase + trim the raw intent for matching. Pure. */
function normalizeIntent(intent) {
  return String(intent ?? "").toLowerCase().trim();
}

/** Escape regex metacharacters in a phrase so it matches literally. Pure. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract an explicit phase number from free text (D-04 / OQ-4). Prefers the
 * word-bounded "phase N" form; the bare-number fallback is applied later, only
 * for phase-taking commands.
 * @param {string} intent - normalized intent.
 * @returns {number|null}
 */
function extractPhase(intent) {
  const m = intent.match(/\bphase\s*(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * Extract recognized option flags from the intent (D-04), mirroring the flag
 * regexes used by lib/commands.js. Pure.
 * @param {string} intent - raw intent.
 * @returns {{advance:boolean,fix:boolean,auto:boolean,wave:number|null,depth:string|null}}
 */
function extractOptions(intent) {
  const s = normalizeIntent(intent);
  return {
    advance: /\badvance\b/.test(s),
    fix: /\bfix\b/.test(s),
    auto: /\bauto\b/.test(s),
    wave: Number((s.match(/\bwave\s*(\d+)\b/) || [])[1] || null),
    depth: (s.match(/\bdepth\s+(\S+)\b/) || [])[1] || null,
  };
}

/**
 * Score the normalized intent against the SYNONYMS table. Returns the
 * best-scoring command, its score, and whether the top two scores tie (D-05).
 * @param {string} normalized - normalized intent.
 * @returns {{command:string|null, score:number, ambiguity:boolean}}
 */
function matchCommand(normalized) {
  const scores = [];
  for (const [command, entries] of Object.entries(SYNONYMS)) {
    let score = 0;
    for (const { phrase, weight } of entries) {
      if (new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i").test(normalized)) {
        score += weight;
      }
    }
    if (score > 0) scores.push({ command, score });
  }
  if (scores.length === 0) return { command: null, score: 0, ambiguity: false };
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1];
  const ambiguity = top.score > 0 && second && second.score === top.score;
  return { command: top.command, score: top.score, ambiguity };
}

/**
 * Return the first present tool name across the descriptors, or null when no
 * descriptor is present. Used by degrade() so an absent gsd_status is never
 * instructed (D-07).
 * @param {Array<{key:string}>} descriptors
 * @returns {string|null}
 */
function firstPresentTool(descriptors) {
  for (const d of descriptors || []) {
    if (!d || typeof d !== "object") continue;
    const tools = buildCapability(d.key).tools;
    if (tools && tools.length > 0) return tools[0];
  }
  return null;
}

/**
 * Degrade a best-match command whose capability is absent (D-10). For the
 * tracer this implements the orient/out-of-band branch: route to gsd_status
 * when gsdOrient is present, else to a present tool / a generic orientation
 * sentence. The loop-step branch (nearest-present-step via effectiveRoutableStep)
 * is completed in a later task. Never returns the absent command (D-07).
 * @param {string} command - the absent best-match command.
 * @param {Array<{key:string}>} descriptors
 * @returns {{command:string, note:string}}
 */
function degrade(command, descriptors) {
  const cap = capabilityForTool(command);
  if (hasCap(descriptors, "gsdOrient")) {
    return {
      command: FALLBACK_RECOMMENDATION,
      note: `The ${command} command is unavailable (its ${cap} capability is absent); routing to gsd_status.`,
    };
  }
  const tool = firstPresentTool(descriptors);
  if (tool) {
    return {
      command: tool,
      note: `The ${command} command is unavailable (its ${cap} capability is absent) and gsd_status is also unavailable; routing to ${tool}.`,
    };
  }
  return { command: FALLBACK_RECOMMENDATION, note: "No GSD commands are available; orient manually." };
}

/**
 * Classify a free-text intent into one target GSD command plus extracted
 * parameters, evaluated capability-aware (D-03/D-06/D-07). Pure: consumes only
 * the intent string and the present capability descriptors; performs no I/O and
 * never mutates STATE/ROADMAP.
 *
 * @param {string} intent - the plain-English intent string.
 * @param {Array<{key:string}>} descriptors - present capability descriptors.
 * @returns {{matched:boolean, command:string|null, phase:number|null,
 *   options:{advance:boolean,fix:boolean,auto:boolean,wave:number|null,depth:string|null},
 *   ambiguity:boolean, missingArg:string|null, absentCapability:string|null,
 *   degraded:boolean, note:string|null}}
 */
export function classifyIntent(intent, descriptors) {
  const normalized = normalizeIntent(intent);
  const options = extractOptions(intent);

  // D-08: empty/whitespace intent -> gsd_status fallback, never throws.
  if (normalized === "") {
    return {
      matched: false,
      command: FALLBACK_RECOMMENDATION,
      phase: null,
      options,
      ambiguity: false,
      missingArg: null,
      absentCapability: null,
      degraded: false,
      note: "No intent provided; run gsd_status to orient and provide a clearer intent.",
    };
  }

  const { command, score, ambiguity } = matchCommand(normalized);

  // D-08: garbage intent -> gsd_status fallback.
  if (score === 0) {
    return {
      matched: false,
      command: FALLBACK_RECOMMENDATION,
      phase: null,
      options,
      ambiguity: false,
      missingArg: null,
      absentCapability: null,
      degraded: false,
      note: "Could not match your intent to a GSD command; run gsd_status to orient.",
    };
  }

  // D-05: near-equal matches -> gsd_status fallback, never guess.
  if (ambiguity) {
    return {
      matched: false,
      command: FALLBACK_RECOMMENDATION,
      phase: null,
      options,
      ambiguity: true,
      missingArg: null,
      absentCapability: null,
      degraded: false,
      note: "Multiple commands matched equally; run gsd_status to orient and clarify your intent.",
    };
  }

  // D-04/OQ-4: phase extraction with a bare-number fallback for phase-taking
  // commands.
  let phase = extractPhase(normalized);
  if (phase === null && PHASE_REQUIRED.has(command)) {
    const m = normalized.match(/(?:^|\s)(\d+)(?:\s|$)/);
    if (m) phase = Number(m[1]);
  }

  // D-06/D-07: capability gating — never recommend an absent command.
  const capKey = capabilityForTool(command);
  const present = capKey ? hasCap(descriptors, capKey) : false;
  if (!present) {
    const degraded = degrade(command, descriptors);
    return {
      matched: true,
      command: degraded.command,
      phase,
      options,
      ambiguity: false,
      missingArg: null,
      absentCapability: capKey,
      degraded: true,
      note: degraded.note,
    };
  }

  // D-09: a phase-taking command with no phase -> note the missing argument.
  if (PHASE_REQUIRED.has(command) && phase === null) {
    return {
      matched: true,
      command,
      phase: null,
      options,
      ambiguity: false,
      missingArg: "phase",
      absentCapability: null,
      degraded: false,
      note: `The ${command} command requires a phase number; none was found in the intent.`,
    };
  }

  return {
    matched: true,
    command,
    phase,
    options,
    ambiguity: false,
    missingArg: null,
    absentCapability: null,
    degraded: false,
    note: null,
  };
}

/**
 * Render a classified result into human-facing text that names the command to
 * invoke (with any extracted phase/options) but never claims to auto-run it
 * (D-02). Pure.
 *
 * @param {{command:string|null, phase:number|null, options?:object, note?:string|null}} result
 * @returns {string}
 */
export function renderRouteRecommendation(result) {
  const r = result || {};
  const cmd = r.command || FALLBACK_RECOMMENDATION;
  const opts = r.options || {};
  const parts = [];
  if (r.phase != null) parts.push(`phase ${r.phase}`);
  if (opts.wave != null) parts.push(`wave ${opts.wave}`);
  if (opts.depth) parts.push(`depth ${opts.depth}`);
  if (opts.advance) parts.push("advance");
  if (opts.fix) parts.push("fix");
  if (opts.auto) parts.push("auto");
  const suffix = parts.join(", ");
  const base = suffix ? `Run the ${cmd} tool on ${suffix}.` : `Run the ${cmd} tool.`;
  return r.note ? `${base} ${r.note}` : base;
}
