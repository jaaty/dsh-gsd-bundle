// Offline unit tests for the phase-54 freeform-routing pure intent classifier
// (lib/_route.js — classifyIntent / renderRouteRecommendation), CLH-04. Proves
// the intent->command matrix, ambiguity handling, missing-phase, empty/garbage
// fallback, and capability-aware degradation, modeled on the pure-helper
// assertions in test/_next.test.mjs. No host context, no fs, no I/O.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { classifyIntent, renderRouteRecommendation, FALLBACK_RECOMMENDATION } from "../lib/_route.js";
import { buildCapability, allCapabilities } from "../lib/_capabilities.js";

// The full capability descriptor set used as the default for every test: every
// known capability, so every routable command's owning capability is present.
function fullDescriptors() {
  return allCapabilities();
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

describe("route classifier: full synonym matrix (D-03/D-04/D-05/D-08/D-09)", () => {
  test("(a) synonym routing — 'execute phase 2' → gsd_execute, phase 2", () => {
    const r = classifyIntent("execute phase 2", fullDescriptors());
    assert.equal(r.command, "gsd_execute");
    assert.equal(r.phase, 2);
    assert.equal(r.matched, true);
  });

  test("(a) tool-name routing — 'run gsd_verify on phase 4' → gsd_verify, phase 4", () => {
    const r = classifyIntent("run gsd_verify on phase 4", fullDescriptors());
    assert.equal(r.command, "gsd_verify");
    assert.equal(r.phase, 4);
    assert.equal(r.matched, true);
  });

  test("(b) weighted disambiguation — 'ui review' → gsd_ui_review (weight 2 beats code-review's weight-1 'review')", () => {
    const r = classifyIntent("ui review", fullDescriptors());
    assert.equal(r.command, "gsd_ui_review");
    assert.equal(r.ambiguity, false);
  });

  test("(b) weighted disambiguation — 'review code' → gsd_code_review (contiguous phrase wins)", () => {
    const r = classifyIntent("review code", fullDescriptors());
    assert.equal(r.command, "gsd_code_review");
    assert.equal(r.ambiguity, false);
  });

  test("(c) ambiguity (D-05) — bare 'review' ties code-review and ui-review → gsd_status fallback", () => {
    const r = classifyIntent("review", fullDescriptors());
    assert.equal(r.ambiguity, true);
    assert.equal(r.command, "gsd_status");
  });

  test("(d) missing-phase (D-09) — 'discuss' → missingArg phase, never fabricates", () => {
    const r = classifyIntent("discuss", fullDescriptors());
    assert.equal(r.missingArg, "phase");
    assert.equal(r.command, "gsd_discuss");
    assert.equal(r.phase, null);
  });

  test("(e) empty/garbage (D-08) — whitespace and gibberish → gsd_status, never throws", () => {
    const ws = classifyIntent("   ", fullDescriptors());
    assert.equal(ws.command, "gsd_status");
    const gib = classifyIntent("asdf qwerty", fullDescriptors());
    assert.equal(gib.command, "gsd_status");
  });

  test("(f) bare-number fallback (D-04/OQ-4) — 'discuss 3' → phase 3", () => {
    const r = classifyIntent("discuss 3", fullDescriptors());
    assert.equal(r.command, "gsd_discuss");
    assert.equal(r.phase, 3);
  });
});
