// Unit tests for the phase-22 capability-aware render/routing helper,
// lib/_render.js. Proves the pure-helper surfaces a caller can consume without
// a Cordis boot: available-capability collection, next-action -> capability
// mapping, loop-step/informational ordering, effective-routable-step routing,
// the Available-steps rendering, and the persona body with absent steps/tools
// omitted (never instructing a missing tool — D-02).
//
// Built against fabricated descriptor arrays (frozen buildCapability output)
// and getCap stubs; no ctx, no I/O, no live DSH boot.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CAPABILITY_KEYS, buildCapability, capabilityForTool } from "../lib/_capabilities.js";
import {
  availableCapabilities,
  capabilityKeyForNextAction,
  loopSteps,
  informationEntries,
  effectiveRoutableStep,
  renderAvailableSteps,
  NO_LOOP_NOTICE,
  renderNoLoopNotice,
  renderPersonaBody,
} from "../lib/_render.js";

// Full set of all 16 descriptors, in CAPABILITY_KEYS order (frozen, like the
// real capability store).
const FULL = CAPABILITY_KEYS.map(buildCapability);

// A subset with gsdVerify and gsdQuick retired.
function without(...keys) {
  const gone = new Set(keys);
  return FULL.filter((d) => !gone.has(d.key));
}

// A zero-loop subset: only informational/onboarding capabilities remain.
const NO_LOOP = FULL.filter((d) => !["step", "optional", "alternate"].includes(d.role));

// The pure loop-step order (by descriptor.order): spec 5, discuss 10, ui 15,
// plan 20, gap-analysis 22, quick 25, execute 30, code-review 35, ui-review 36,
// verify 40, validate 45, ship 50, milestone-audit 52.
const LOOP_ORDER = ["gsdSpec", "gsdDiscuss", "gsdUi", "gsdPlan", "gsdGapAnalysis", "gsdQuick", "gsdExecute", "gsdCodeReview", "gsdUiReview", "gsdVerify", "gsdValidatePhase", "gsdShip", "gsdMilestoneAudit"];

describe("availableCapabilities", () => {
  test("collects only truthy object descriptors from the getCap thunk, in CAPABILITY_KEYS order", () => {
    const present = new Set(["gsdOrient", "gsdDiscuss", "gsdVerify"]);
    const getCap = (k) => (present.has(k) ? buildCapability(k) : undefined);
    const got = availableCapabilities(getCap);
    assert.deepEqual(
      got.map((d) => d.key),
      ["gsdOrient", "gsdDiscuss", "gsdVerify"],
    );
  });

  test("never throws when the getCap thunk returns undefined for an absent key", () => {
    const got = availableCapabilities(() => undefined);
    assert.deepEqual(got, []);
  });

  test("returns the pre-supplied descriptors array verbatim when getCap is omitted", () => {
    assert.equal(availableCapabilities(undefined, FULL), FULL);
    assert.deepEqual(availableCapabilities(undefined), []);
  });
});

describe("capabilityKeyForNextAction", () => {
  test("round-trips every stored next-action string", () => {
    const want = {
      "discuss-phase": "gsdDiscuss",
      "ui-phase": "gsdUi",
      "plan-phase": "gsdPlan",
      "gap-analysis-phase": "gsdGapAnalysis",
      "execute-phase": "gsdExecute",
      "verify-phase": "gsdVerify",
      "ship-phase": "gsdShip",
    };
    for (const [action, key] of Object.entries(want)) {
      assert.equal(capabilityKeyForNextAction(action), key);
    }
  });

  test("maps done and unknown/empty to null", () => {
    assert.equal(capabilityKeyForNextAction("done"), null);
    assert.equal(capabilityKeyForNextAction(null), null);
    assert.equal(capabilityKeyForNextAction(undefined), null);
    assert.equal(capabilityKeyForNextAction(""), null);
    assert.equal(capabilityKeyForNextAction("bogus-phase"), null);
  });
});

describe("loopSteps / informationEntries ordering (D-08)", () => {
  test("loopSteps returns role step|optional|alternate, ascending by order", () => {
    assert.deepEqual(
      loopSteps(FULL).map((d) => d.key),
      LOOP_ORDER,
    );
  });

  test("informationEntries returns orient|jobs|onboarding|out-of-band in CAPABILITY_KEYS position", () => {
    const keys = informationEntries(FULL).map((d) => d.key);
    // map-codebase (index 0) then orient (1) then jobs (2); gsdUndo (out-of-band)
    // and gsdHealth (out-of-band) are last in CAPABILITY_KEYS after gsdShip.
    assert.deepEqual(keys, ["gsdMapCodebase", "gsdOrient", "gsdJobs", "gsdUndo", "gsdHealth"]);
  });

  test("loopSteps excludes a removed step and keeps ascending order", () => {
    const subset = without("gsdVerify");
    assert.deepEqual(
      loopSteps(subset).map((d) => d.key),
      ["gsdSpec", "gsdDiscuss", "gsdUi", "gsdPlan", "gsdGapAnalysis", "gsdQuick", "gsdExecute", "gsdCodeReview", "gsdUiReview", "gsdValidatePhase", "gsdShip", "gsdMilestoneAudit"],
    );
  });

  test("zero-loop inputs yield empty lists without throwing", () => {
    assert.deepEqual(loopSteps([]), []);
    assert.deepEqual(loopSteps(NO_LOOP), []);
    assert.deepEqual(informationEntries([]), []);
  });
});

describe("effectiveRoutableStep (D-04/D-06/D-10)", () => {
  test("keeps a present target step", () => {
    const s = effectiveRoutableStep("verify-phase", FULL);
    assert.equal(s.key, "gsdVerify");
  });

  test("advances to the nearest present step with strictly greater order when target is absent", () => {
    // verify absent -> next greater present is validate (order 45), not ship.
    const s = effectiveRoutableStep("verify-phase", without("gsdVerify"));
    assert.equal(s.key, "gsdValidatePhase");
    // validate absent too -> next greater present is ship (order 50).
    assert.equal(effectiveRoutableStep("verify-phase", without("gsdVerify", "gsdValidatePhase")).key, "gsdShip");
    // verify + validate + ship absent -> verify's next greater slot is
    // milestone-audit (order 52), the step after ship.
    assert.equal(effectiveRoutableStep("verify-phase", without("gsdVerify", "gsdValidatePhase", "gsdShip")).key, "gsdMilestoneAudit");
    // verify + validate + ship + milestone-audit absent -> no greater slot -> null.
    assert.equal(effectiveRoutableStep("verify-phase", without("gsdVerify", "gsdValidatePhase", "gsdShip", "gsdMilestoneAudit")), null);
  });

  test("falls back to the first present loop step for a null/unknown next_action", () => {
    assert.equal(effectiveRoutableStep("done", FULL).key, "gsdSpec");
    assert.equal(effectiveRoutableStep("done", without("gsdDiscuss")).key, "gsdSpec");
  });

  test("returns null when no loop step remains", () => {
    assert.equal(effectiveRoutableStep("execute-phase", NO_LOOP), null);
    assert.equal(effectiveRoutableStep("execute-phase", []), null);
  });

  test("gap-analysis-phase routes to gsdGapAnalysis when present, else nearest greater (D-02)", () => {
    // Present: the mapped step resolves directly.
    assert.equal(effectiveRoutableStep("gap-analysis-phase", FULL).key, "gsdGapAnalysis");
    // Absent (retired): advance to the nearest present loop step with order > 22,
    // which is gsdQuick (order 25) — the routing correction that keeps the
    // removal suite's retiring-gsdGapAnalysis surface 6 in sync.
    assert.equal(effectiveRoutableStep("gap-analysis-phase", without("gsdGapAnalysis")).key, "gsdQuick");
  });
});

describe("renderAvailableSteps / NO_LOOP_NOTICE (D-08/D-06)", () => {
  test("lists loop steps ascending by order before informational entries", () => {
    const out = renderAvailableSteps(FULL);
    const lines = out.split("\n");
    assert.ok(out.includes("spec: gsdSpec (order 5)"));
    assert.ok(out.includes("discuss: gsdDiscuss (order 10)"));
    assert.ok(out.includes("verify: gsdVerify (order 40)"));
    assert.ok(out.includes("map-codebase: gsdMapCodebase"));
    assert.ok(lines.includes("- orient: gsdOrient"));
    assert.ok(lines.includes("- jobs: gsdJobs"));
    // spec precedes discuss (order 5 before 10).
    assert.ok(lines.indexOf(lines.find((l) => l.startsWith("- spec:"))) < lines.indexOf(lines.find((l) => l.startsWith("- discuss:"))));
    // discuss precedes verify (order 10 before 40).
    assert.ok(lines.indexOf(lines.find((l) => l.startsWith("- discuss:"))) < lines.indexOf(lines.find((l) => l.startsWith("- verify:"))));
  });

  test("zero-loop sets render the no-loop notice and do not throw", () => {
    const out = renderAvailableSteps(NO_LOOP);
    assert.ok(out.includes(`- ${NO_LOOP_NOTICE}`));
    assert.equal(renderAvailableSteps([]), `- ${NO_LOOP_NOTICE}`);
    assert.equal(renderNoLoopNotice(), NO_LOOP_NOTICE);
    assert.equal(NO_LOOP_NOTICE, "no available loop step");
  });
});

describe("renderPersonaBody (D-01/D-02/D-06)", () => {
  // Invariant proof: no gsd_* token whose capability is absent in the given
  // descriptor set may be named in the rendered persona (never-instruct-a-
  // missing-tool contract).
  function assertNoAbsentTool(body, descriptors) {
    const presentCaps = new Set((descriptors || []).map((d) => d.key));
    const tokens = body.match(/gsd_[a-z_]+/g) || [];
    for (const tok of tokens) {
      const capKey = capabilityForTool(tok);
      assert.notEqual(
        capKey,
        undefined,
        `token ${tok} has no known capability mapping — persona named an unknown tool`,
      );
      assert.ok(
        presentCaps.has(capKey),
        `persona named ${tok} but capability ${capKey} is absent in this mount`,
      );
    }
  }

  test("static core + present steps render on the full set", () => {
    const body = renderPersonaBody(FULL);
    assert.ok(body.includes("Discuss"));
    assert.ok(body.includes("Execute"));
    assert.ok(body.includes("gsd_status")); // gsdOrient present
    assert.ok(body.includes("gsd_quick")); // gsdQuick present
    assertNoAbsentTool(body, FULL);
  });

  test("gap-analysis paragraph renders when present, omits when absent, and names no gsd_* tool (D-02 token rule)", () => {
    const fullBody = renderPersonaBody(FULL);
    assert.ok(fullBody.includes("- Gap-analysis:"), "FULL persona missing the Gap-analysis paragraph");
    // The gap-analysis paragraph must contain NO gsd_* token at all (the
    // assertNoAbsentToolToken regex /gsd_[a-z]+/g would otherwise extract
    // "gsd_gap" from a literal "gsd_gap_analysis" and fail every retirement
    // row where gsdGapAnalysis is present).
    const gapLine = fullBody.split("\n").find((l) => l.startsWith("- Gap-analysis:"));
    assert.ok(gapLine, "Gap-analysis paragraph line not found");
    assert.equal(gapLine.match(/gsd_[a-z]+/g), null, "Gap-analysis paragraph names a gsd_* tool token");
    assertNoAbsentTool(fullBody, FULL);

    const sansBody = renderPersonaBody(without("gsdGapAnalysis"));
    assert.ok(!sansBody.includes("- Gap-analysis:"), "persona still renders Gap-analysis when gsdGapAnalysis absent");
    assertNoAbsentTool(sansBody, without("gsdGapAnalysis"));
  });

  test("absent verify/quick step paragraphs and tools are omitted", () => {
    const body = renderPersonaBody(without("gsdVerify", "gsdQuick"));
    assert.ok(!body.includes("Verify:"));
    assert.ok(!body.includes("gsd_verify"));
    assert.ok(!body.includes("gsd_quick"));
    // The fresh-context rule must drop the absent tool name.
    assert.ok(!body.includes("the gsd_plan / gsd_execute / gsd_verify"));
    assertNoAbsentTool(body, without("gsdVerify", "gsdQuick"));
  });

  test("zero-loop set shows the no-loop notice and never names a loop tool", () => {
    const body = renderPersonaBody(NO_LOOP);
    assert.ok(body.includes("No loop steps are currently available"));
    assert.ok(!body.includes("gsd_discuss"));
    assertNoAbsentTool(body, NO_LOOP);
  });

  test("partial spawner set lists only the present fresh-context tools", () => {
    // Plan + Execute present, Verify absent -> only gsd_plan / gsd_execute named.
    const body = renderPersonaBody(without("gsdVerify"));
    assert.ok(body.includes("the gsd_plan / gsd_execute tools spawn them"));
    assert.ok(!body.includes("gsd_verify"));
    assertNoAbsentTool(body, without("gsdVerify"));
  });
});
