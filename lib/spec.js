// @dsh-gsd/bundle/spec — the Spec step tool (opengsd /gsd-spec-phase). Clarifies
// WHAT a phase delivers before discuss handles HOW. The driving agent holds the
// Socratic interview with the user (or supplies defaults with auto=true), then
// calls gsd_spec_phase to seal a SPEC.md with falsifiable requirements (each
// carrying Current / Target / Acceptance), Boundaries, Constraints, Acceptance
// Criteria and an Ambiguity Report gated at <= 0.20 across four weighted clarity
// dimensions (D-04/D-05). The ambiguity score comes from a fresh-context
// structured-output subagent so it is reviewable and reproducible (D-05); a
// scoring-subagent fault degrades to writing SPEC.md with an UNAVAILABLE report
// and the real cause, never hard-blocking the phase (D-07).
//
// Loop-step plugin mirroring lib/discuss.js (D-01): publishes the gsdSpec
// capability, registers the /gsd-spec-phase command's tool, writes <NN>-SPEC.md
// via writeArtifact, advances STATE to the 'spec' step, and lands the artefacts
// on the phase-<N> branch via the shared git seam.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { nowIso, today } from "./_shared.js";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { ensurePhaseBranch, commitArtifacts } from "./_git-artifacts.js";
import { buildCapability } from "./_capabilities.js";
import { SPEC_SCORER_PROMPT } from "./_agents.js";

const name = "gsd-spec";
// DEGR-07 (D-04/D-05): 'subagents' is a hard required coeffect — the tool spawns
// the ambiguity-scoring subagent, so the fiber must stay inactive when the host
// subagents service is absent. gsdState + tools mirror the other loop steps.
const inject = ["gsdState", "tools", "subagents"];

// Weighted clarity dimensions (RESEARCH 1.2 / D-04). Ambiguity = 1 - weighted
// mean of the four clearness scores. Frozen constants are the single source of
// truth for the gate arithmetic — grep-checked by test/spec.test.mjs.
export const SPEC_WEIGHTS = Object.freeze({
  goal: 0.35,
  boundary: 0.25,
  constraint: 0.20,
  acceptance: 0.20,
});

// Per-dimension minimums (RESEARCH 1.2 / Claude's Discretion). The overall
// <= 0.20 gate AND every dimension >= its minimum are TWO independent gates
// (RESEARCH R-2): the spec tool must flag when EITHER fails, never silently
// accept a dim-minimally-met but overall-ambiguous spec.
export const SPEC_MINIMUMS = Object.freeze({
  goal: 0.75,
  boundary: 0.70,
  constraint: 0.65,
  acceptance: 0.70,
});

export const SPEC_GATE_AMBIGUITY = Object.freeze({ max: 0.20 });

// The structured-output contract for the ambiguity-scoring subagent (D-05),
// mirroring map-codebase's QUERY_ANSWER_SCHEMA restricted object-rooted subset
// (type/properties/required/items/enum — no pattern/format/numeric bounds).
export const SPEC_SCORER_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    dimensions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string", enum: ["goal", "boundary", "constraint", "acceptance"] },
          score: { type: "number" },
          note: { type: "string" },
        },
        required: ["dimension", "score"],
        additionalProperties: false,
      },
    },
    below_minimum: { type: "array", items: { type: "string" } },
  },
  required: ["dimensions"],
  additionalProperties: false,
});

const DIMENSION_LABELS = {
  goal: "Goal Clarity",
  boundary: "Boundary Clarity",
  constraint: "Constraint Clarity",
  acceptance: "Acceptance Criteria",
};

// Given a validated 4-dimension score map, compute the weighted ambiguity, the
// joint gate result, and which dimensions fall below their minimum. Both gates
// are checked jointly (RESEARCH R-2): ambiguity > max OR any dimension < min
// makes gatePass false.
export function computeWeighted(dims) {
  const clarity =
    SPEC_WEIGHTS.goal * dims.goal.score +
    SPEC_WEIGHTS.boundary * dims.boundary.score +
    SPEC_WEIGHTS.constraint * dims.constraint.score +
    SPEC_WEIGHTS.acceptance * dims.acceptance.score;
  const ambiguity = 1 - clarity;
  const belowMin = Object.keys(SPEC_MINIMUMS).filter((k) => dims[k].score < SPEC_MINIMUMS[k]);
  const gatePass = ambiguity <= SPEC_GATE_AMBIGUITY.max && belowMin.length === 0;
  return { ambiguity, clarity, gatePass, belowMin };
}

// Validate the scoring subagent's structured output into a 4-dimension score map.
// Returns null when the output is missing any of the four dimensions, has a
// non-finite / out-of-range score, or is not the expected object shape — the
// caller treats that as an UNAVAILABLE scoring (cannot compute reliably, D-07).
export function resolveScore(structured) {
  if (!structured || !Array.isArray(structured.dimensions)) return null;
  const dims = {};
  for (const d of structured.dimensions) {
    if (!d || !SPEC_WEIGHTS[d.dimension]) return null;
    const score = Number(d.score);
    if (!Number.isFinite(score) || score < 0 || score > 1) return null;
    dims[d.dimension] = { score, note: typeof d.note === "string" ? d.note : "" };
  }
  const required = Object.keys(SPEC_WEIGHTS);
  if (required.some((k) => !dims[k])) return null;
  return {
    dims,
    weighted: computeWeighted(dims),
    below_minimum: Array.isArray(structured.below_minimum) ? structured.below_minimum : [],
  };
}

// Assemble the SPEC.md body (everything except the Ambiguity Report, which is
// appended once the score is known). Falsifiable requirements, boundaries,
// constraints, acceptance criteria, out-of-scope edge/prohibition placeholders
// (D-10), and the interview log.
function assembleSpecBody(args, phase, reqs, iso, dateTs) {
  const lines = [];
  lines.push(`# Phase ${args.phase}: ${phase.name} - Spec`, "");
  lines.push(`**Gathered:** ${iso}`, `**Mode:** ${args.auto ? "auto (defaults derived from ROADMAP)" : "interviewed"}`, "");
  lines.push("## Requirements", "");
  lines.push("_Every requirement is FALSIFIABLE — a test or check proves whether it was met or not. Each carries Current / Target / Acceptance._", "");
  reqs.forEach((req, i) => {
    const label = req.id ? `Req ${req.id}` : `Req ${String(i + 1).padStart(2, "0")}`;
    lines.push(`### ${label}`, "");
    lines.push(`- **Current:** ${req.current !== undefined && req.current !== "" ? req.current : "(not started)"}`);
    lines.push(`- **Target:** ${req.target}`);
    lines.push(`- **Acceptance:** ${req.acceptance}`, "");
  });

  lines.push("## Boundaries", "", `**In scope:** ${args.boundaries?.in_scope || phase.goal}`, `**Out of scope:** ${args.boundaries?.out_of_scope || "(not specified)"}`, "");

  lines.push("## Constraints", "");
  const constraints = Array.isArray(args.constraints) && args.constraints.length ? args.constraints : ["No unresolved implementation decisions yet — clarify in the Discuss step."];
  constraints.forEach((c) => lines.push(`- ${c}`));
  lines.push("");

  lines.push("## Acceptance Criteria", "");
  const act = Array.isArray(args.acceptance_criteria) && args.acceptance_criteria.length ? args.acceptance_criteria : reqs.map((r) => r.acceptance);
  act.forEach((a) => lines.push(`- ${a}`));
  lines.push("");

  lines.push("## Edge Coverage / Prohibitions", "");
  lines.push("_OUT OF SCOPE (later phase): edge-completeness and prohibition probes are handled by a subsequent phase — not by this spec-phase._", "");
  lines.push("");

  lines.push("## Interview Log", "");
  const log = Array.isArray(args.interview_log) && args.interview_log.length ? args.interview_log : args.auto ? ["auto mode: defaults selected from ROADMAP (no interactive interview)"] : ["(interview log not supplied — requirements were provided directly)"];
  log.forEach((l) => lines.push(`- ${l}`));
  lines.push("");

  lines.push("---", "", `*Phase: ${String(args.phase).padStart(2, "0")}-${phase.name}*`, `*Spec gathered: ${dateTs}*`);
  return lines.join("\n");
}

// Build the Ambiguity Report block. When scoring is AVAILABLE render the
// per-dimension table + overall ambiguity + joint gate. When UNAVAILABLE, report
// the real cause (D-07) and never fabricate a score.
function buildReport(score, scoring, scoreError) {
  if (scoring !== "AVAILABLE" || !score) {
    return [
      "## Ambiguity Report", "",
      "**Status:** UNAVAILABLE", "",
      `_The ambiguity-scoring subagent could not score this draft. Cause: ${scoreError || "unknown"}. The SPEC.md is still written; the planner should treat the un-scored clarity dimensions as assumptions and re-clarify them._`, "",
    ].join("\n");
  }
  const rows = Object.keys(SPEC_WEIGHTS).map((k) => {
    const s = score.dims[k].score;
    const min = SPEC_MINIMUMS[k];
    const status = s >= min ? "PASS" : "UNDER-MIN";
    return `| ${DIMENSION_LABELS[k]} | ${s.toFixed(2)} | ${min.toFixed(2)} | ${status} |`;
  });
  const flagLine = score.weighted.belowMin.length
    ? `**Flagged as planner assumptions:** ${score.weighted.belowMin.map((k) => `${DIMENSION_LABELS[k]} (below min ${SPEC_MINIMUMS[k]})`).join(", ")}`
    : "No dimension is below its minimum.";
  return [
    "## Ambiguity Report", "",
    "| Dimension | Score | Min | Status |",
    "|---|---|---|---|",
    ...rows,
    "", `**Overall Ambiguity:** ${score.weighted.ambiguity.toFixed(3)}  (max ${SPEC_GATE_AMBIGUITY.max})`, "",
    `**Gate:** ${score.weighted.gatePass ? "PASSING" : "OVERRUN"} — requires ambiguity <= ${SPEC_GATE_AMBIGUITY.max} AND all four dimensions at/above their minima`, "",
    flagLine, "",
  ].join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this loop step's capability (DEGR-01/D-02). Auto-tracked
  // revertible effect: retiring the spec plugin withdraws gsdSpec.
  ctx.provide("gsdSpec", buildCapability("gsdSpec"));

  ctx.tools.register(defineTool({
    name: "gsd_spec_phase",
    description: "Spec phase (opengsd /gsd-spec-phase): produce a SPEC.md with falsifiable requirements (Current/Target/Acceptance) gated by an ambiguity-scoring score (<=0.20 across four weighted clarity dimensions). Run before discuss. First hold the Socratic interview to clarify WHAT the phase delivers (or pass auto=true to derive defaults from ROADMAP); then call this tool to seal SPEC.md, which discuss then consumes as locked what/why input.",
    parameters: {
      phase: { type: "number", required: true },
      auto: { type: "boolean" },
      goal: { type: "string" },
      background: { type: "string" },
      requirements: { type: "array", items: { type: "object", additionalProperties: true, properties: { id: { type: "string" }, current: { type: "string" }, target: { type: "string" }, acceptance: { type: "string" } } } },
      boundaries: { type: "object", additionalProperties: true },
      constraints: { type: "array", items: { type: "string" } },
      acceptance_criteria: { type: "array", items: { type: "string" } },
      interview_log: { type: "array", items: { type: "string" } },
    },
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(args, exec) {
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_spec_phase: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_spec_phase: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      const phase = (roadmap?.phases || []).find((p) => p.n === args.phase);
      if (!phase) throw new Error(`gsd_spec_phase: phase ${args.phase} not in ROADMAP.md`);

      // D-01/D-10: acquire the per-phase feature branch before any artefact
      // write, the same seam gsd_discuss uses.
      const branchInfo = await ensurePhaseBranch(cwd, args.phase);

      // Resolve requirements: explicit args win; else auto derives defaults from
      // ROADMAP + REQUIREMENTS.md; else a non-auto call with nothing supplied
      // throws Socratic-interview guidance (D-03).
      let reqs = Array.isArray(args.requirements) && args.requirements.length ? args.requirements : null;
      let derivedAuto = false;
      if (!reqs) {
        if (args.auto) {
          derivedAuto = true;
          const reqsMeta = await s.readRequirements(cwd);
          const textById = new Map(reqsMeta.map((r) => [r.id, r.text]));
          // ROADMAP phase.requirements is a flat array of REQ-ID strings, so map
          // each id to its REQUIREMENTS.md text; fall back to the REQ-ID itself
          // so a Target is never "undefined".
          reqs = (phase.requirements || []).filter((x) => typeof x === "string" && x.trim() !== "").map((reqId) => ({
            id: reqId,
            current: "(not started)",
            target: textById.get(reqId) || reqId,
            acceptance: `REQ-${reqId} delivered and its acceptance criteria verified by gsd_verify`,
          }));
        } else {
          throw new Error("gsd_spec_phase: no requirements supplied — hold the Socratic interview (or pass auto=true to derive defaults from ROADMAP)");
        }
      }

      // Falsifiability guard (fail-fast, D-11 / D specifics): every requirement
      // must carry a non-empty Acceptance check.
      for (const req of reqs) {
        if (!req || !String(req.acceptance || "").trim()) {
          throw new Error("gsd_spec_phase: every requirement must be falsifiable — provide a non-empty Acceptance check (Current/Target/Acceptance)");
        }
      }

      const iso = nowIso();
      const dateTs = today();
      const body = assembleSpecBody(args, phase, reqs, iso, dateTs);

      // Score via the fresh-context structured subagent, degrading on fault
      // (D-07): an error/timeout/unavailable scorer writes SPEC.md with an
      // UNAVAILABLE report + real cause, never throwing after env validation.
      const promptText = [
        SPEC_SCORER_PROMPT,
        "",
        "<phase_context>",
        `Phase goal: ${phase.goal}`,
        `REQ-IDs: ${(phase.requirements || []).join(", ") || "(none declared)"}`,
        "</phase_context>",
        "",
        "<spec_draft>",
        body,
        "</spec_draft>",
      ].join("\n");

      let score = null;
      let scoring = "AVAILABLE";
      let scoreError = null;
      try {
        const r = await spawnSubagent(ctx, exec, { label: "spec-ambiguity-scorer", promptText, outputSchema: SPEC_SCORER_SCHEMA });
        const parsed = resolveScore(r.structured);
        if (parsed) score = parsed;
        else scoring = "UNAVAILABLE"; // structured missing/four-dim-malformed
      } catch (e) {
        scoring = "UNAVAILABLE";
        scoreError = (e && e.message) || String(e);
      }

      const specFull = body + "\n" + buildReport(score, scoring, scoreError);

      // Write SPEC.md (the ONLY artefact write — routed through ctx.fs, CQ-01).
      const ctxPath = await s.writeArtifact(cwd, args.phase, "SPEC", specFull);

      // D-08: SPEC does not gate/block discuss. Advance STATE to the spec step
      // (next_action routes to discuss via _nextActionFor('spec')).
      await s.setActivePhase(cwd, args.phase, "spec");
      const ambiguityStr = score ? score.weighted.ambiguity.toFixed(3) : "UNAVAILABLE";
      await s.addDecision(cwd, `Phase ${args.phase}: SPEC.md sealed (ambiguity ${ambiguityStr})`);

      // Best-effort commit of the just-written artefacts (CQ-07/MW-03), the same
      // out-of-flow auto-commit pattern as discuss.
      const commit = await commitArtifacts(cwd, args.phase, { scope: "spec", phaseName: phase.name });

      const gateText = score ? (score.weighted.gatePass ? "PASSING" : "OVERRUN") : "UNAVAILABLE";
      let flagNote = "";
      if (score && score.weighted.belowMin.length) {
        flagNote = ` Below-minimum dimension(s) flagged as planner assumptions: ${score.weighted.belowMin.join(", ")}.`;
      } else if (!score) {
        flagNote = ` Scoring UNAVAILABLE (cause: ${scoreError || "unknown"}); the planner should treat clarity dimensions as assumptions.`;
      }

      let branchNote = ` Branch: ${branchInfo.action} (${branchInfo.branch}).`;
      let commitNote = ` Artefacts committed: ${commit.committed} (${commit.staged.length} file(s)).`;
      if (commit.warning) commitNote += ` WARNING: ${commit.warning}.`;

      return `Spec complete for phase ${args.phase} (${phase.name}). Wrote ${ctxPath}. Ambiguity ${ambiguityStr}, gate ${gateText}.${flagNote} STATE advanced to 'spec'.${branchNote}${commitNote} Next: gsd_discuss on phase ${args.phase} (SPEC is locked what/why input).`;
    },
    presentCall: (a) => ({ card: "generic", title: `Spec phase ${a.phase}`, kind: "other", rawInput: { auto: !!a.auto } }),
  }));
}

export { name, inject, apply };
