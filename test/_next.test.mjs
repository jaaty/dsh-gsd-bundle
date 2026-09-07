// Offline unit tests for the phase-53 smart-entry pure classifier
// (lib/_next.js — classifyNextState / renderNextRecommendation), CLH-02 /
// CLH-03. Proves the six-branch D-04 state matrix, precedence, the D-07
// fall-through, and capability-aware degradation, modeled on the pure-helper
// assertions in test/autonomous.test.mjs. No ctx, no fs, no I/O.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { classifyNextState, renderNextRecommendation, BRANCH } from "../lib/_next.js";
import { buildCapability } from "../lib/_capabilities.js";

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

describe("smart-entry classifier: tracer branches (Task 1)", () => {
  test("branch 1 — no .planning project → gsd_init, mutation null", () => {
    const result = classifyNextState({ hasProject: false }, coreDescriptors());
    assert.equal(result.branch, BRANCH.NO_PROJECT);
    assert.equal(result.recommendation, "gsd_init");
    assert.equal(result.mutation, null);
  });

  test("branch 4 — mid-phase (active phase pending, status plan) → plan-phase, mutation null", () => {
    const snapshot = {
      hasProject: true,
      state: {
        frontmatter: { active_phase: "2", status: "plan", next_action: "plan-phase" },
      },
      roadmap: {
        phases: [
          { n: 1, name: "p1", status: "Complete" },
          { n: 2, name: "p2", status: "pending" },
        ],
      },
    };
    const result = classifyNextState(snapshot, coreDescriptors());
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