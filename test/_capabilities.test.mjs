// Unit tests for the capability descriptor model in lib/_capabilities.js.
// Proves DEGR-01 (the 11-key capability surface), the D-03 descriptor shape,
// the D-04 per-plugin mapping, the D-03 role enum, the D-11 order-sorted chain,
// and the D-10 fail-loud validation.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ROLES, CAPABILITY_KEYS, buildCapability } from "../lib/_capabilities.js";

describe("capability key surface (DEGR-01)", () => {
  test("exposes exactly the 17 known keys", () => {
    assert.equal(CAPABILITY_KEYS.length, 17);
    for (const key of [
      "gsdOrient",
      "gsdJobs",
      "gsdSpec",
      "gsdDiscuss",
      "gsdUi",
      "gsdPlan",
      "gsdGapAnalysis",
      "gsdExecute",
      "gsdCodeReview",
      "gsdUiReview",
      "gsdVerify",
      "gsdValidatePhase",
      "gsdShip",
      "gsdUndo",
      "gsdHealth",
      "gsdQuick",
      "gsdMapCodebase",
    ]) {
      assert.ok(CAPABILITY_KEYS.includes(key), `missing capability key ${key}`);
    }
  });

  test("role enum is the D-03 seven-tuple", () => {
    assert.deepEqual(ROLES, ["step", "optional", "alternate", "onboarding", "orient", "jobs", "out-of-band"]);
  });

  test("every key builds a descriptor with the documented shape", () => {
    for (const key of CAPABILITY_KEYS) {
      const d = buildCapability(key);
      assert.equal(d.key, key);
      assert.equal(typeof d.step, "string");
      assert.ok(d.step.length > 0);
      assert.ok(ROLES.includes(d.role), `bad role for ${key}`);
      assert.ok(Array.isArray(d.tools));
      assert.ok(Array.isArray(d.commands));
      assert.ok(Number.isFinite(d.order), `non-finite order for ${key}`);
      assert.ok(Array.isArray(d.prereq));
      assert.ok(Array.isArray(d.next));
      assert.ok(Array.isArray(d.produces));
      assert.ok(Array.isArray(d.consumes));
    }
  });
});

describe("capability mapping (D-04)", () => {
  test("gsdOrient tools + commands are exact", () => {
    const d = buildCapability("gsdOrient");
    assert.deepEqual(d.tools, ["gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone"]);
    assert.deepEqual(d.commands, ["gsd-init", "gsd-status", "gsd-progress", "gsd-new-milestone"]);
  });

  test("gsdJobs has no slash command", () => {
    assert.deepEqual(buildCapability("gsdJobs").commands, []);
    assert.deepEqual(buildCapability("gsdJobs").tools, ["gsd_job"]);
  });

  test("gsdMapCodebase exposes two tools", () => {
    assert.deepEqual(buildCapability("gsdMapCodebase").tools, ["gsd_map_codebase", "gsd_intel_updater"]);
  });

  test("gsdUiReview is a step at order 36, between code-review (35) and verify (40)", () => {
    const ui = buildCapability("gsdUiReview");
    assert.equal(ui.role, "step");
    assert.equal(ui.order, 36);
    assert.equal(ui.step, "ui-review");
    assert.deepEqual(ui.tools, ["gsd_ui_review"]);
    assert.deepEqual(ui.commands, ["gsd-ui-review"]);
    assert.deepEqual(ui.next, ["gsdVerify"]);
    assert.deepEqual(ui.produces, ["UI-REVIEW.md"]);
    assert.deepEqual(ui.consumes, ["SUMMARY.md"]);
    const review = buildCapability("gsdCodeReview");
    const verify = buildCapability("gsdVerify");
    assert.ok(ui.order > review.order, "ui-review(36) sorts after code-review(35)");
    assert.ok(ui.order < verify.order, "ui-review(36) sorts before verify(40)");
  });

  test("gsdValidatePhase is a step at order 45, between verify (40) and ship (50)", () => {
    const vp = buildCapability("gsdValidatePhase");
    assert.equal(vp.role, "step");
    assert.equal(vp.step, "validate");
    assert.equal(vp.order, 45);
    assert.deepEqual(vp.tools, ["gsd_validate_phase"]);
    assert.deepEqual(vp.commands, ["gsd-validate-phase"]);
    assert.deepEqual(vp.next, ["gsdShip"]);
    assert.deepEqual(vp.produces, ["VALIDATION.md"]);
    assert.deepEqual(vp.consumes, ["SUMMARY.md", "VERIFICATION.md"]);
    const verify = buildCapability("gsdVerify");
    const ship = buildCapability("gsdShip");
    assert.ok(vp.order > verify.order, "validate-phase(45) sorts after verify(40)");
    assert.ok(vp.order < ship.order, "validate-phase(45) sorts before ship(50)");
  });

  test("role values match the D-04 mapping", () => {
    for (const key of ["gsdSpec", "gsdDiscuss", "gsdPlan", "gsdExecute", "gsdVerify", "gsdShip"]) {
      assert.equal(buildCapability(key).role, "step", `${key} should be step`);
    }
    assert.equal(buildCapability("gsdUi").role, "optional");
    assert.equal(buildCapability("gsdQuick").role, "alternate");
    assert.equal(buildCapability("gsdMapCodebase").role, "onboarding");
    assert.equal(buildCapability("gsdOrient").role, "orient");
    assert.equal(buildCapability("gsdJobs").role, "jobs");
  });
});

describe("loop ordering by order value (D-11)", () => {
  test("gsdSpec is a step at order 5, before discuss (10)", () => {
    const spec = buildCapability("gsdSpec");
    assert.equal(spec.role, "step");
    assert.equal(spec.order, 5);
    assert.ok(spec.order < buildCapability("gsdDiscuss").order, "spec(5) sorts before discuss(10)");
  });

  test("main chain sorts discuss -> ui -> plan -> execute -> verify -> ship", () => {
    const stepCaps = ["gsdDiscuss", "gsdUi", "gsdPlan", "gsdExecute", "gsdVerify", "gsdShip"];
    const sorted = stepCaps
      .map(buildCapability)
      .sort((a, b) => a.order - b.order)
      .map((d) => d.key);
    assert.deepEqual(sorted, ["gsdDiscuss", "gsdUi", "gsdPlan", "gsdExecute", "gsdVerify", "gsdShip"]);
  });

  test("quick and map-codebase sort off the main chain", () => {
    assert.ok(buildCapability("gsdMapCodebase").order < buildCapability("gsdDiscuss").order, "map-codebase(0) sorts before discuss(10)");
    const ui = buildCapability("gsdUi").order;
    const ex = buildCapability("gsdExecute").order;
    const quick = buildCapability("gsdQuick").order;
    assert.ok(ui < quick && quick < ex, "quick(25) sorts between ui(15) and execute(30)");
  });

  test("gsdGapAnalysis is a step at order 22, rerouting plan->gap-analysis->execute (D-02)", () => {
    const gap = buildCapability("gsdGapAnalysis");
    assert.equal(gap.role, "step");
    assert.equal(gap.order, 22);
    assert.equal(gap.step, "gap-analysis");
    assert.deepEqual(gap.tools, ["gsd_gap_analysis"]);
    assert.deepEqual(gap.commands, ["gsd-gap-analysis"]);
    assert.deepEqual(gap.next, ["gsdExecute"]);
    assert.deepEqual(gap.produces, ["COVERAGE.md"]);
    assert.deepEqual(gap.consumes, ["PLAN.md", "CONTEXT.md"]);
    const plan = buildCapability("gsdPlan");
    const quick = buildCapability("gsdQuick");
    const execute = buildCapability("gsdExecute");
    assert.ok(gap.order > plan.order, "gap-analysis(22) sorts after plan(20)");
    assert.ok(gap.order < quick.order, "gap-analysis(22) sorts before quick(25)");
    assert.ok(gap.order < execute.order, "gap-analysis(22) sorts before execute(30)");
    assert.deepEqual(plan.next, ["gsdGapAnalysis"], "gsdPlan.next rerouted to gsdGapAnalysis");
    assert.deepEqual(gap.next, ["gsdExecute"], "gsdGapAnalysis.next points at gsdExecute");
  });
});

describe("fail-loud validation (D-10)", () => {
  test("unknown key throws", () => {
    assert.throws(() => buildCapability("gsdUnknownKey"), /not a known capability key/);
  });

  test("every order value is finite", () => {
    for (const key of CAPABILITY_KEYS) {
      assert.ok(Number.isFinite(buildCapability(key).order), `${key} order must be finite`);
    }
  });
});
