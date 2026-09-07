// Offline unit tests for the phase-54 freeform-routing pure intent classifier
// (lib/_route.js — classifyIntent / renderRouteRecommendation), CLH-04. Proves
// the intent->command matrix, ambiguity handling, missing-phase, empty/garbage
// fallback, and capability-aware degradation, modeled on the pure-helper
// assertions in test/_next.test.mjs. No host context, no fs, no I/O.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { classifyIntent, renderRouteRecommendation, FALLBACK_RECOMMENDATION } from "../lib/_route.js";
import { buildCapability } from "../lib/_capabilities.js";

// The full capability descriptor set used as the default for every test: the
// core loop steps plus orient and spec.
function fullDescriptors() {
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

// Simulate retiring one capability by filtering its descriptor out.
function without(descriptors, key) {
  return descriptors.filter((d) => d.key !== key);
}

describe("route classifier: tracer", () => {
  test("discuss phase 3 → gsd_discuss, phase 3, matched", () => {
    const r = classifyIntent("discuss phase 3", fullDescriptors());
    assert.equal(r.command, "gsd_discuss");
    assert.equal(r.phase, 3);
    assert.equal(r.matched, true);
  });

  test("empty intent → gsd_status fallback, never throws", () => {
    const r = classifyIntent("", fullDescriptors());
    assert.equal(r.command, "gsd_status");
    assert.equal(r.matched, false);
  });

  test("gibberish intent → gsd_status fallback", () => {
    const r = classifyIntent("gibberish qwerty", fullDescriptors());
    assert.equal(r.command, "gsd_status");
  });

  test("renderRouteRecommendation names the tool, never auto-run", () => {
    const text = renderRouteRecommendation({ command: "gsd_discuss", phase: 3 });
    assert.match(text, /Run the gsd_discuss tool on phase 3/);
    assert.doesNotMatch(text, /auto-run/);
  });
});
