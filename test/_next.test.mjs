// Offline unit tests for the phase-53 smart-entry pure classifier
// (lib/_next.js — classifyNextState / renderNextRecommendation), CLH-02 /
// CLH-03. Proves the six-branch D-04 state matrix, precedence, the D-07
// fall-through, and capability-aware degradation, modeled on the pure-helper
// assertions in test/autonomous.test.mjs. No host context, no fs, no I/O.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { classifyNextState, renderNextRecommendation, BRANCH } from "../lib/_next.js";
import { buildCapability } from "../lib/_capabilities.js";

// The full capability descriptor set: the core loop steps plus orient,
// health, milestone-audit, and spec. Used as the default for every branch.
function fullDescriptors() {
  return [
    buildCapability("gsdOrient"),
    buildCapability("gsdMapCodebase"),
    buildCapability("gsdSpec"),
    buildCapability("gsdDiscuss"),
    buildCapability("gsdUi"),
    buildCapability("gsdPlan"),
    buildCapability("gsdGapAnalysis"),
    buildCapability("gsdQuick"),
    buildCapability("gsdExecute"),
    buildCapability("gsdCodeReview"),
    buildCapability("gsdUiReview"),
    buildCapability("gsdVerify"),
    buildCapability("gsdValidatePhase"),
    buildCapability("gsdShip"),
    buildCapability("gsdHealth"),
    buildCapability("gsdMilestoneAudit"),
    buildCapability("gsdLearnings"),
    buildCapability("gsdGraphify"),
    buildCapability("gsdAutonomous"),
  ];
}

// Simulate retiring one capability by filtering its descriptor out.
function without(descriptors, key) {
  return descriptors.filter((d) => d.key !== key);
}

// A representative capability descriptor set: the core loop steps plus the
// orient capability (gsd_next is registered under gsdOrient).
function coreDescriptors() {
  return [
    buildCapability("gsdOrient"),
    buildCapability("gsdSpec"),
    buildCapability("gsdDiscuss"),
    buildCapability("gsdPlan"),
    buildCapability("gsdExecute"),
    buildCapability("gsdVerify"),
    buildCapability("gsdShip"),
  ];
}

// ── snapshot builders ────────────────────────────────────────────────────────

function noProjectSnapshot() {
  return { hasProject: false };
}

function corruptSnapshot(missing) {
  const base = { hasProject: true };
  if (missing === "state") return { ...base, state: undefined, roadmap: { phases: [{ n: 1, name: "p1", status: "pending" }] } };
  if (missing === "roadmap") return { ...base, state: { frontmatter: { active_phase: null, status: "idle" } }, roadmap: undefined };
  return base;
}

function midPhaseSnapshot({ activePhase = "2", status = "plan", nextAction = "plan-phase", phaseStatus = "pending" } = {}) {
  return {
    hasProject: true,
    state: { frontmatter: { active_phase: String(activePhase), status, next_action: nextAction } },
    roadmap: {
      phases: [
        { n: 1, name: "p1", status: "Complete" },
        { n: Number(activePhase), name: "p", status: phaseStatus },
      ],
    },
  };
}

function phaseShippedSnapshot({ pending = [3] } = {}) {
  const phases = [{ n: 1, name: "p1", status: "Complete" }, { n: 2, name: "p2", status: "Complete" }];
  for (const n of pending) phases.push({ n, name: `p${n}`, status: "pending" });
  return {
    hasProject: true,
    state: { frontmatter: { active_phase: null, status: "idle", next_action: null } },
    roadmap: { phases },
  };
}

function milestoneCompleteSnapshot({ auditStatus } = {}) {
  const milestoneAudit = auditStatus ? { status: auditStatus } : undefined;
  return {
    hasProject: true,
    state: { frontmatter: { active_phase: null, status: "idle", next_action: null } },
    roadmap: { phases: [{ n: 1, name: "p1", status: "Complete" }, { n: 2, name: "p2", status: "Complete" }] },
    milestoneAudit,
  };
}

describe("smart-entry classifier: tracer branches", () => {
  test("branch 1 — no .planning project → gsd_init, mutation null", () => {
    const result = classifyNextState(noProjectSnapshot(), coreDescriptors());
    assert.equal(result.branch, BRANCH.NO_PROJECT);
    assert.equal(result.recommendation, "gsd_init");
    assert.equal(result.mutation, null);
  });

  test("branch 4 — mid-phase (active phase pending, status plan) → plan-phase, mutation null", () => {
    const result = classifyNextState(midPhaseSnapshot(), coreDescriptors());
    assert.equal(result.branch, BRANCH.MID_PHASE);
    assert.equal(result.recommendation, "plan-phase");
    assert.equal(result.mutation, null);
  });

  test("renderNextRecommendation names the command with 'Next action:' prefix", () => {
    const text = renderNextRecommendation({ branch: BRANCH.MID_PHASE, recommendation: "plan-phase", mutation: null });
    assert.match(text, /Next action: run plan-phase\./);
    assert.doesNotMatch(text, /auto-run/);
  });
});

describe("smart-entry classifier: six-branch state matrix (D-04)", () => {
  test("(1) branch 2 corrupt — state undefined, roadmap present → gsd_health, mutation null", () => {
    const result = classifyNextState(corruptSnapshot("state"), fullDescriptors());
    assert.equal(result.branch, BRANCH.CORRUPT);
    assert.equal(result.recommendation, "gsd_health");
    assert.equal(result.mutation, null);
  });

  test("(2) branch 2 corrupt — state present, roadmap undefined → gsd_health, mutation null", () => {
    const result = classifyNextState(corruptSnapshot("roadmap"), fullDescriptors());
    assert.equal(result.branch, BRANCH.CORRUPT);
    assert.equal(result.recommendation, "gsd_health");
    assert.equal(result.mutation, null);
  });

  test("(3) branch 3 paused — handoff present → gsd_resume_work, mutation null (precedence 3 before 4)", () => {
    const snapshot = { ...midPhaseSnapshot(), handoff: { phase: 2 } };
    const result = classifyNextState(snapshot, fullDescriptors());
    assert.equal(result.branch, BRANCH.PAUSED);
    assert.equal(result.recommendation, "gsd_resume_work");
    assert.equal(result.mutation, null);
  });

  test("(4) branch 3 paused — continueHere present (handoff undefined) → gsd_resume_work, mutation null", () => {
    const snapshot = { ...midPhaseSnapshot(), continueHere: "# continue here" };
    const result = classifyNextState(snapshot, fullDescriptors());
    assert.equal(result.branch, BRANCH.PAUSED);
    assert.equal(result.recommendation, "gsd_resume_work");
    assert.equal(result.mutation, null);
  });

  test("(5) branch 5 phase-shipped — phase 3 pending (gsdSpec retired) → mutation setActivePhase phaseNum 3 step discuss, recommendation discuss-phase", () => {
    const result = classifyNextState(phaseShippedSnapshot({ pending: [3] }), without(fullDescriptors(), "gsdSpec"));
    assert.equal(result.branch, BRANCH.PHASE_SHIPPED_NEXT);
    assert.deepEqual(result.mutation, { setActivePhase: { phaseNum: 3, step: "discuss" } });
    assert.equal(result.recommendation, "discuss-phase");
  });

  test("(6) branch 5 with gsdSpec present → step spec, recommendation spec-phase", () => {
    const result = classifyNextState(phaseShippedSnapshot({ pending: [3] }), fullDescriptors());
    assert.equal(result.branch, BRANCH.PHASE_SHIPPED_NEXT);
    assert.deepEqual(result.mutation, { setActivePhase: { phaseNum: 3, step: "spec" } });
    assert.equal(result.recommendation, "spec-phase");
  });

  test("(7) branch 5 with gsdSpec retired → step discuss", () => {
    const result = classifyNextState(phaseShippedSnapshot({ pending: [3] }), without(fullDescriptors(), "gsdSpec"));
    assert.equal(result.branch, BRANCH.PHASE_SHIPPED_NEXT);
    assert.deepEqual(result.mutation, { setActivePhase: { phaseNum: 3, step: "discuss" } });
    assert.equal(result.recommendation, "discuss-phase");
  });

  test("(8) branch 6 milestone-complete, no audit → gsd_milestone_audit, mutation null", () => {
    const result = classifyNextState(milestoneCompleteSnapshot({ auditStatus: undefined }), fullDescriptors());
    assert.equal(result.branch, BRANCH.MILESTONE_COMPLETE);
    assert.equal(result.recommendation, "gsd_milestone_audit");
    assert.equal(result.mutation, null);
  });

  test("(9) branch 6 milestone-complete, audit ready-to-close → gsd_new_milestone, mutation null", () => {
    const result = classifyNextState(milestoneCompleteSnapshot({ auditStatus: "ready-to-close" }), fullDescriptors());
    assert.equal(result.branch, BRANCH.MILESTONE_COMPLETE);
    assert.equal(result.recommendation, "gsd_new_milestone");
    assert.equal(result.mutation, null);
  });

  test("(10) D-07 fall-through — status done, pending phases remain → branch PHASE_SHIPPED_NEXT", () => {
    const snapshot = midPhaseSnapshot({ status: "done", nextAction: null });
    const result = classifyNextState(snapshot, fullDescriptors());
    assert.equal(result.branch, BRANCH.PHASE_SHIPPED_NEXT);
  });

  test("(11) D-07 fall-through — status plan but active phase ROADMAP status Complete → branch PHASE_SHIPPED_NEXT", () => {
    const snapshot = midPhaseSnapshot({ status: "plan", nextAction: "plan-phase", phaseStatus: "Complete" });
    // need pending phases to remain so branch 5 matches
    snapshot.roadmap.phases.push({ n: 3, name: "p3", status: "pending" });
    const result = classifyNextState(snapshot, fullDescriptors());
    assert.equal(result.branch, BRANCH.PHASE_SHIPPED_NEXT);
  });

  test("(12) precedence — no-project snapshot with everything else set → branch NO_PROJECT (1 wins)", () => {
    const snapshot = { ...midPhaseSnapshot(), handoff: { phase: 2 }, milestoneAudit: { status: "ready-to-close" } };
    snapshot.hasProject = false;
    const result = classifyNextState(snapshot, fullDescriptors());
    assert.equal(result.branch, BRANCH.NO_PROJECT);
  });

  test("(13) precedence — hasProject true + state undefined + handoff present → branch CORRUPT (2 wins over 3)", () => {
    const snapshot = { hasProject: true, state: undefined, roadmap: { phases: [{ n: 1, name: "p1", status: "pending" }] }, handoff: { phase: 2 } };
    const result = classifyNextState(snapshot, fullDescriptors());
    assert.equal(result.branch, BRANCH.CORRUPT);
  });

  test("(14) capability degradation — retire gsdHealth on corrupt snapshot → fallback gsd_status, never gsd_health", () => {
    const result = classifyNextState(corruptSnapshot("state"), without(fullDescriptors(), "gsdHealth"));
    assert.equal(result.branch, BRANCH.CORRUPT);
    assert.equal(result.recommendation, "gsd_status");
    assert.notEqual(result.recommendation, "gsd_health");
  });

  test("(15) capability degradation — retire gsdMilestoneAudit on milestone-complete-no-audit → fallback gsd_status", () => {
    const result = classifyNextState(milestoneCompleteSnapshot({ auditStatus: undefined }), without(fullDescriptors(), "gsdMilestoneAudit"));
    assert.equal(result.branch, BRANCH.MILESTONE_COMPLETE);
    assert.equal(result.recommendation, "gsd_status");
    assert.notEqual(result.recommendation, "gsd_milestone_audit");
  });

  test("(16) renderNextRecommendation returns a string with 'Next action:' and never 'auto-run'", () => {
    const text = renderNextRecommendation({ branch: BRANCH.NO_PROJECT, recommendation: "gsd_init", mutation: null });
    assert.match(text, /Next action:/);
    assert.doesNotMatch(text, /auto-run/);
  });

  test("classifyNextState never throws on a fully-empty snapshot and returns branch NO_PROJECT", () => {
    const result = classifyNextState({}, fullDescriptors());
    assert.equal(result.branch, BRANCH.NO_PROJECT);
  });
});