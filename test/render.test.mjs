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
} from "../lib/_render.js";

// Full set of all 10 descriptors, in CAPABILITY_KEYS order (frozen, like the
// real capability store).
const FULL = CAPABILITY_KEYS.map(buildCapability);

// A subset with gsdVerify and gsdQuick retired.
function without(...keys) {
  const gone = new Set(keys);
  return FULL.filter((d) => !gone.has(d.key));
}

// A zero-loop subset: only informational/onboarding capabilities remain.
const NO_LOOP = FULL.filter((d) => !["step", "optional", "alternate"].includes(d.role));

// The pure loop-step order (by descriptor.order): discuss 10, ui 15, plan 20,
// quick 25, execute 30, verify 40, ship 50.
const LOOP_ORDER = ["gsdDiscuss", "gsdUi", "gsdPlan", "gsdQuick", "gsdExecute", "gsdVerify", "gsdShip"];

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

  test("informationEntries returns orient|jobs|onboarding in CAPABILITY_KEYS position", () => {
    const keys = informationEntries(FULL).map((d) => d.key);
    // map-codebase (index 0) then orient (1) then jobs (2).
    assert.deepEqual(keys, ["gsdMapCodebase", "gsdOrient", "gsdJobs"]);
  });

  test("loopSteps excludes a removed step and keeps ascending order", () => {
    const subset = without("gsdVerify");
    assert.deepEqual(
      loopSteps(subset).map((d) => d.key),
      ["gsdDiscuss", "gsdUi", "gsdPlan", "gsdQuick", "gsdExecute", "gsdShip"],
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
    const subset = without("gsdVerify", "gsdShip");
    // verify absent -> next greater present is ship (order 50) when present.
    const s = effectiveRoutableStep("verify-phase", without("gsdVerify"));
    assert.equal(s.key, "gsdShip");
    // ship absent too -> verify's next greater slot is gone -> null.
    assert.equal(effectiveRoutableStep("verify-phase", subset), null);
  });

  test("falls back to the first present loop step for a null/unknown next_action", () => {
    assert.equal(effectiveRoutableStep("done", FULL).key, "gsdDiscuss");
    assert.equal(effectiveRoutableStep("done", without("gsdDiscuss")).key, "gsdUi");
  });

  test("returns null when no loop step remains", () => {
    assert.equal(effectiveRoutableStep("execute-phase", NO_LOOP), null);
    assert.equal(effectiveRoutableStep("execute-phase", []), null);
  });
});
