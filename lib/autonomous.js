// @dsh-gsd/bundle/autonomous — the autonomous out-of-band orchestrator
// (opengsd /gsd-autonomous / GAP-15). It drives every remaining incomplete
// phase of the active milestone end-to-end without per-phase manual prompting.
//
// This plan (PLAN 01) lands the THINNEST end-to-end slice: the gsdAutonomous
// capability, the gsd_autonomous tool, fail-fast environment guards, phase
// discovery + ordering, and a clean "nothing to do" no-op STATUS when there are
// no incomplete phases. The per-phase orchestration loop (auto-CONTEXT write +
// autopilot subagent dispatch + verify readback) lands in PLAN 02, and the
// offline tests land in PLAN 03.
//
// Design constraints (D-01/D-02/D-07/D-08/D-10):
//   - out-of-band step capability: orchestrates the loop, not a linear loop step.
//   - inject deps: gsdState (state accessors), tools (register), subagents
//     (hard coeffect for the PLAN-02 autopilot; declared now at D-02).
//   - never advances STATE's loop position itself (D-10); the step
//     tools it will cause to run set STATE themselves.
//   - all remaining incomplete phases in numeric ascending order; no --from/--to/
//     --only flags (D-08).
//
// Security posture: no shell interpolation, no STATE authority escalation.

import { defineTool } from "@deepseek-ai/dsh-tools";
import { cwdOf, spawnSubagent } from "./_runner.js";
import { buildCapability } from "./_capabilities.js";
import { nowIso, zeroPad, slugify, parseFrontmatter } from "./_shared.js";
import { ensurePhaseBranch, commitArtifacts } from "./_git-artifacts.js";

const name = "gsd-autonomous";
// D-02: gsdState + tools are hard coeffects; 'subagents' is declared as a hard
// coeffect too (the PLAN-02 orchestrator spawns the per-phase autopilot via the
// host subagents service — DEGR-07, mirroring plan/execute/verify/milestone-audit).
const inject = ["gsdState", "tools", "subagents"];

// Pure helper (no ctx / no I/O — unit-testable directly, mirroring milestone-audit).
// Discover the remaining incomplete phases of the active milestone and order them
// by numeric phase number ascending (D-07/D-08). A phase is complete when its
// roadmap status is exactly "Complete" (shipped). Returns [] when roadmap is
// null / has no phased list, so the caller's no-op guard is trivial.
export function discoverPhases(roadmap) {
  const phases = roadmap && Array.isArray(roadmap.phases) ? roadmap.phases : [];
  return phases
    .filter((p) => p && p.status !== "Complete")
    .sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));
}

// ── auto-derived minimal CONTEXT (D-05/D-06) ──────────────────────────────────
// Pure builder (no ctx / no I/O — unit-testable directly). Returns a schema-
// faithful 7-block CONTEXT.md string derived from a ROADMAP phase { n, name,
// goal, requirements }. Mirrors the block skeleton of gsd_discuss
// (lib/discuss.js:166-221) but auto-derived per D-05, marked "Auto-generated
// (discuss skipped — autonomous path)", with full executor discretion. The goal
// becomes the single <domain> in_scope line, and every optional block degrades
// to a neutral placeholder so downstream parsers (learnings parseDecisionEntries,
// graphify) read it cleanly.
export function buildAutoContext(phase) {
  const n = phase?.n ?? 0;
  const name = phase?.name ?? "phase";
  const goal = phase?.goal ?? "";
  const lines = [
    `# Phase ${zeroPad(n)}: ${name} - Context`,
    "",
    `**Gathered:** ${nowIso()}`,
    "**Mode: Auto-generated (discuss skipped — autonomous path)**",
    "**Status:** Ready for planning",
    "",
    "<domain>",
    "## Phase Boundary",
    `**In scope:** ${goal}`,
    "**Out of scope:** (not specified)",
    "</domain>",
    "",
    "<decisions>",
    "## Decisions",
    "### Claude's Discretion",
    "The executor has full discretion over implementation choices for this auto-generated phase.",
    "</decisions>",
    "",
    "<canonical_refs>",
    "## Canonical References",
    "",
    "**Downstream agents MUST read these before planning or implementing.**",
    "",
    "Auto-generated phase — no external specs; requirements captured in ROADMAP.",
    "</canonical_refs>",
    "",
    "<code_context>",
    "## Code Context",
    "- (none identified)",
    "</code_context>",
    "",
    "<specifics>",
    "## Specifics",
    "- (none)",
    "</specifics>",
    "",
    "<deferred>",
    "## Deferred Ideas",
    "- (none)",
    "</deferred>",
    "",
    "---",
    "",
    `*Phase: ${zeroPad(n)}-${slugify(name)}*`,
  ];
  return lines.join("\n");
}

// Ensure a CONTEXT.md exists for an incomplete phase before the autopilot runs
// gsd_plan (which fail-fasts on a missing CONTEXT — lib/plan.js:95-96). When the
// phase already has a CONTEXT.md, return { wrote: false } and skip auto-deriving
// (D-05: skip discuss entirely when CONTEXT exists). Otherwise acquire the
// phase-<N> feature branch (Risk R2 — settling D-13: the auto-CONTEXT write must
// not pollute the base branch and must leave a clean feature branch for a later
// gsd_ship preflight), write the minimal CONTEXT via the state accessor, and
// commit it via the shared commitArtifacts seam (D-06). Any thrown error
// (e.g. ensurePhaseBranch failing loud on an unrelated non-base branch) is a
// hard failure the driver surfaces as a stop.
async function ensureAutoContext(cwd, s, ctx, phase, exec) {
  if (await s.hasArtifact(cwd, phase.n, "CONTEXT")) {
    return { wrote: false };
  }
  await ensurePhaseBranch(cwd, phase.n); // throws on hard failure → driver stops
  const path = await s.writeArtifact(cwd, phase.n, "CONTEXT", buildAutoContext(phase));
  const commit = await commitArtifacts(cwd, phase.n, { scope: "autonomous", phaseName: phase.name });
  return { wrote: true, path, commit };
}

// ── per-phase autopilot dispatch (D-03/D-04) ──────────────────────────────────
// Pure builder (no ctx / no I/O). Returns the self-contained instruction a
// fresh-context autopilot subagent receives for ONE phase. The child shares the
// cordis ctx with no toolFilter (RESEARCH: spawnSubagent passes no toolFilter,
// so every gsd_* step tool is callable), so this prompt text is the ONLY defence
// against recursion, shipping, and milestone lifecycle — hence the explicit
// guard list (D-04/D-10). The agent is told to call gsd_discuss on the phase
// ONLY IF no CONTEXT.md exists yet, and told to re-check via gsd_status / the
// artefact presence (hasArtifact) rather than trust any "write happened" note,
// so a race or stale flag cannot trigger a spurious empty discuss (R3).
export function buildAutopilotPrompt({ base, phaseNum, phaseName }) {
  return [
    `You are the autonomous autopilot for a SINGLE GSD phase: Phase ${phaseNum} (${phaseName}), artefact base "${base}".`,
    "",
    `Drive this one phase end-to-end by calling the gsd_* step tools INLINE, in exactly this order, for Phase ${phaseNum} only:`,
    "1. gsd_discuss on phase " + phaseNum + " — but ONLY if the phase has no CONTEXT.md yet. Re-check by running gsd_status (or confirming the CONTEXT artefact's presence) rather than trusting a note; gsd_autonomous may have already auto-derived a minimal CONTEXT for this phase. If a CONTEXT.md already exists, skip gsd_discuss entirely.",
    "2. gsd_plan on phase " + phaseNum + ".",
    "3. gsd_execute on phase " + phaseNum + ".",
    "4. gsd_verify on phase " + phaseNum + ".",
    "",
    "Guard rails you MUST follow:",
    "- do not call gsd_autonomous (no recursion)",
    "- do not call gsd_ship",
    "- do not run any milestone-lifecycle tool",
    "",
    `After gsd_verify completes, read the phase's VERIFICATION.md status and report it. Return: the phase number (${phaseNum}), the verification status, and the VERIFICATION.md path.`,
  ].join("\n");
}

// Drive one phase through its autopilot subagent (D-03). First ensure a
// CONTEXT.md exists (auto-deriving + committing when absent), then resolve the
// phase's artefact base, spawn exactly one fresh-context autopilot for the phase,
// and return its output on success. A thrown error from spawnSubagent (spawn/
// run failure) is caught and returned as { ok: false, step: "autopilot" } so the
// driver can record the hard failure (D-09). The autopilot itself invokes
// gsd_discuss/gsd_plan/gsd_execute/gsd_verify inline in the shared cordis ctx.
async function drivePhase(cwd, s, ctx, exec, phase, roadmap) {
  await ensureAutoContext(cwd, s, ctx, phase, exec); // throws → hard failure
  const { base, dir } = await s.phaseDirAndBase(cwd, phase.n);
  const promptText = buildAutopilotPrompt({ base, phaseNum: phase.n, phaseName: phase.name });
  try {
    const r = await spawnSubagent(ctx, exec, { label: `autonomous phase ${phase.n}`, promptText });
    return { ok: true, subagentOutput: r.output, dir };
  } catch (e) {
    return { ok: false, step: "autopilot", reason: e && e.message ? e.message : String(e) };
  }
}

// Read the verify status back from the phase's VERIFICATION.md (D-04/D-11),
// mirroring lib/verify.js:110-117 / lib/milestone-audit.js:128-137: a missing or
// unparseable artefact degrades to { status: "missing" }, else the frontmatter
// `status` (or "missing" when absent). Success for autonomous is exactly
// status === "passed"; anything else is a hard-failure stop (D-09). This does
// NOT issue the verify tool's own routing (human_needed / gaps closure retries
// are deferred).
async function readVerifyStatus(cwd, s, phaseNum) {
  let text = "";
  try {
    text = await s.readArtifact(cwd, phaseNum, "VERIFICATION");
  } catch {
    text = "";
  }
  if (!text) return { status: "missing" };
  const { frontmatter } = parseFrontmatter(text);
  return { status: frontmatter?.status || "missing" };
}

// ── multi-phase orchestration driver (D-07/D-08/D-09/D-10) ────────────────────
// Pure-ish orchestration (uses the gsdState accessors + spawns subagents via
// spawnSubagent — no STATE mutation of its own, D-10). Runs every remaining
// incomplete phase of the active milestone in numeric ascending order. After
// each SUCCESSFUL phase it re-reads ROADMAP and re-runs discoverPhases so
// dynamically inserted phases are picked up before the next iteration (D-07).
// Stops on the FIRST hard failure (branch/context acquisition error, autopilot
// spawn/run error, or a VERIFICATION status !== "passed") — recording the
// failing phase + step and ceasing all further phases (D-09). Never calls
// gsd_ship and never runs milestone lifecycle (D-04/deferred). Returns a plain
// { milestone, phases, outcome, stopReason } object.
async function runAutonomous(cwd, s, ctx, exec) {
  let roadmap = await s.readRoadmap(cwd);
  if (!roadmap) throw new Error("gsd_autonomous: unreadable ROADMAP.md");
  const state = await s.readState(cwd);
  const milestoneName = roadmap.milestoneName || state?.frontmatter?.milestone_name || "milestone";

  // INCOMPLETE-MARKER SEMANTICS (reconciles D-07 with the plan-01 discoverPhases
  // filter): D-07 phrases the filter as `phase_complete !== true`, but the driver
  // deliberately implements it as ROADMAP phase `status !== "Complete"` (the
  // ROADMAP shipped marker). A phase that passed verify but is not yet shipped
  // still has ROADMAP status !== "Complete" and is intentionally re-driven through
  // discuss→plan→execute→verify. Do NOT change discoverPhases to read STATE's
  // `phase_complete` here — that would diverge from this phase goal ("all
  // remaining incomplete phases").
  let remaining = discoverPhases(roadmap);
  if (remaining.length === 0) {
    return { milestone: milestoneName, phases: [], outcome: "nothing_to_do", stopReason: null };
  }

  const statuses = [];
  const processed = new Set(); // phase numbers already driven this run
  let outcome = "completed";
  let stopReason = null;

  // Index-based scan (not for...of) so the re-read of `remaining` after each
  // successful phase — which replaces the array — actually affects iteration:
  // we restart the scan from index 0 on the fresh incomplete set and rely on
  // `processed` to skip phases already driven, catching newly inserted phases
  // wherever they land (D-07).
  let i = 0;
  while (i < remaining.length) {
    const phase = remaining[i];
    i += 1;
    if (processed.has(phase.n)) continue;
    processed.add(phase.n);

    // (1) ensure a CONTEXT.md exists — auto-derive + commit on phase-<N> when
    // absent (D-05/D-06). Any thrown error (fail-loud branch acquire, bad write,
    // bad commit) is a hard failure → stop.
    try {
      await ensureAutoContext(cwd, s, ctx, phase, exec);
    } catch (e) {
      stopReason = `Phase ${phase.n}: branch/context acquisition failed — ${e && e.message ? e.message : String(e)}`;
      statuses.push({ number: phase.n, name: phase.name, status: "failed" });
      outcome = "stopped";
      break;
    }

    // (2) spawn the single fresh-context autopilot that runs
    // discuss→plan→execute→verify inline (D-03/D-04). A spawn/run throw is a
    // hard failure → stop.
    const res = await drivePhase(cwd, s, ctx, exec, phase, roadmap);
    if (!res.ok) {
      stopReason = `Phase ${phase.n}: autopilot failed at step ${res.step} — ${res.reason}`;
      statuses.push({ number: phase.n, name: phase.name, status: "failed" });
      outcome = "stopped";
      break;
    }

    // (3) read the verify status back from VERIFICATION.md (authoritative).
    // Success requires exactly status === "passed"; anything else (missing /
    // gaps_found / human_needed / unparseable) is a hard-failure stop (D-09).
    const { status } = await readVerifyStatus(cwd, s, phase.n);
    statuses.push({ number: phase.n, name: phase.name, status: status === "passed" ? "passed" : status });
    if (status !== "passed") {
      stopReason = `Phase ${phase.n}: verification status "${status}" (non-passed)`;
      outcome = "stopped";
      break;
    }

    // (4) successful phase → re-read ROADMAP to catch inserted phases before the
    // next iteration (D-07), then restart the scan with the processed-set guard.
    roadmap = await s.readRoadmap(cwd);
    remaining = roadmap ? discoverPhases(roadmap) : [];
    i = 0;
  }

  return { milestone: milestoneName, phases: statuses, outcome, stopReason };
}

// Render the concise banner-style text report (D-11), consistent with the other
// gsd_* step-tool outputs. Names the milestone, per-phase {number, name, status},
// and the overall outcome; a stopped run appends the stop reason + the resume
// command /gsd-autonomous.
function renderBanner(result) {
  const lines = [
    "┌─ GSD Autonomous ───────────────────────────────┐",
    `│ milestone: ${result.milestone}`,
    `│ outcome: ${result.outcome}`,
    "└─────────────────────────────────────────────────┘",
    "",
    `Autonomous run — milestone ${result.milestone}`,
  ];
  if (result.phases.length === 0) {
    lines.push("- (no remaining incomplete phases)");
  } else {
    for (const p of result.phases) {
      lines.push(`- Phase ${p.number} (${p.name}): ${p.status}`);
    }
  }
  lines.push("");
  if (result.outcome === "nothing_to_do") {
    lines.push("outcome: nothing_to_do — nothing to do");
  } else if (result.outcome === "stopped") {
    lines.push("outcome: stopped");
    lines.push(`stop reason: ${result.stopReason || "unknown"}`);
    lines.push("resume: /gsd-autonomous");
  } else {
    lines.push("outcome: completed");
  }
  return lines.join("\n");
}

function apply(ctx) {
  const gsd = () => ctx.get("gsdState");

  // Publish this out-of-band capability (DEGR-01/D-01). Auto-tracked revertible
  // effect: retiring the autonomous plugin withdraws gsdAutonomous.
  ctx.provide("gsdAutonomous", buildCapability("gsdAutonomous"));

  ctx.tools.register(defineTool({
    name: "gsd_autonomous",
    description: "Autonomous path (opengsd /gsd-autonomous): drive all remaining incomplete phases of the active milestone end-to-end without per-phase manual prompting. For each phase in numeric order it auto-derives a minimal CONTEXT.md when absent and drives it through discuss/plan/execute/verify, then reports a per-phase STATUS. Stops on a hard failure. Never ships and never runs milestone lifecycle.",
    parameters: {},
    output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] },
    async execute(_args, exec) {
      // Fail-fast environmental guards (D-02/D-08), mirroring milestone-audit.
      const cwd = cwdOf(exec);
      const s = gsd();
      if (!s) throw new Error("gsd_autonomous: gsdState service unavailable");
      if (!(await s.isProject(cwd))) throw new Error("gsd_autonomous: no .planning/ project — run gsd_init first");
      const roadmap = await s.readRoadmap(cwd);
      if (!roadmap) throw new Error("gsd_autonomous: unreadable ROADMAP.md");

      // Run the full orchestration: discovery, per-phase auto-CONTEXT + autopilot
      // dispatch, verify readback, ROADMAP re-read, hard-failure stop (D-03..D-11).
      const result = await runAutonomous(cwd, s, ctx, exec);
      return renderBanner(result);
    },
    presentCall: () => ({ card: "generic", title: "Autonomous: drive remaining phases", kind: "other", rawInput: {} }),
  }));
}

export { name, inject, apply };
