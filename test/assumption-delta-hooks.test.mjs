// Offline unit tests for the assumption-delta orchestrating hook
// (runAssumptionDeltaOnPlan + buildAssumptionDeltaPrompt in lib/assumption-delta.js),
// TDD per D-04/D-05/D-06/D-08. The hook is a PURE synchronous function over
// { cfg, scopeText } — no ctx, no fs, no git, no state accessor (D-01/D-08) — so it
// is tested directly with plain objects. No mount, no FakeFs, no git/gh, no LLM.
//
// Coverage per D-04/D-05/D-06/D-08:
//   (a) config gate — workflow.assumption_delta !== true → skipped, no promptBlock,
//       no log raise (D-04);
//   (b) skipped-before-detected — gate on but no scanable scope text → skipped,
//       NEVER a bare detected:false (D-06);
//   (c) detected → promptBlock contains the promote-vs-add-alongside question +
//       the <assumption_delta_decision> instruction + the signals, and a logLine is
//       raised (D-05);
//   (d) gate on + no signal → detected:false, no promptBlock;
//   (e) never-throws soft gate — a hostile scopeText still returns without throwing
//       (D-08);
//   (f) the hook takes ONLY { cfg, scopeText } and never advances STATE (D-08);
//   (g) buildAssumptionDeltaPrompt — the one identity-model question, the signal
//       list, the <assumption_delta_decision> recording instruction (noun-now-primary,
//       promote|add-alongside|no-change, one-line rationale, add-alongside as accepted
//       debt), and the D-07 invariant/contract test companion note.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  runAssumptionDeltaOnPlan,
  buildAssumptionDeltaPrompt,
} from "../lib/assumption-delta.js";

describe("assumption-delta: runAssumptionDeltaOnPlan — config gate (D-04)", () => {
  test("workflow.assumption_delta !== true → skipped, no promptBlock, no log raise", () => {
    const r = runAssumptionDeltaOnPlan({ cfg: { workflow: { assumption_delta: false } }, scopeText: "adds a second platform" });
    assert.ok(r.skipped, "must be skipped when the gate is off");
    assert.ok(!("detected" in r), "a skipped result must not carry a detected key");
    assert.ok(!r.promptBlock, "no prompt block when skipped");
    assert.ok(!r.logLine, "no log line when skipped");
  });

  test("cfg absent (no workflow object) → skipped, defends against missing config", () => {
    const r = runAssumptionDeltaOnPlan({ cfg: {}, scopeText: "adds a second platform" });
    assert.ok(r.skipped, "absent workflow.assumption_delta must skip (not a clean negative)");
    assert.ok(!("detected" in r));
  });

  test("cfg undefined → skipped, never throws", () => {
    const r = runAssumptionDeltaOnPlan({ cfg: undefined, scopeText: "adds a second platform" });
    assert.ok(r.skipped);
    assert.ok(!("detected" in r));
  });
});

describe("assumption-delta: runAssumptionDeltaOnPlan — skipped-before-detected (D-06)", () => {
  test("gate on but empty scopeText → skipped, NEVER a bare detected:false", () => {
    const r = runAssumptionDeltaOnPlan({ cfg: { workflow: { assumption_delta: true } }, scopeText: "" });
    assert.ok(r.skipped, "no scanable scope text must resolve skipped, not detected:false");
    assert.ok(!("detected" in r), "a skipped payload must not carry a detected key — the fabrication guard");
    assert.ok(!r.promptBlock);
  });

  test("gate on but whitespace-only scopeText → skipped", () => {
    const r = runAssumptionDeltaOnPlan({ cfg: { workflow: { assumption_delta: true } }, scopeText: "   \n\t  " });
    assert.ok(r.skipped);
    assert.ok(!("detected" in r));
  });

  test("gate on but scopeText undefined → skipped", () => {
    const r = runAssumptionDeltaOnPlan({ cfg: { workflow: { assumption_delta: true } }, scopeText: undefined });
    assert.ok(r.skipped);
    assert.ok(!("detected" in r));
  });
});

describe("assumption-delta: runAssumptionDeltaOnPlan — detected → promptBlock + logLine (D-05)", () => {
  test("gate on + signal → detected:true, promptBlock with the question + decision instruction, logLine raised", () => {
    const r = runAssumptionDeltaOnPlan({
      cfg: { workflow: { assumption_delta: true } },
      scopeText: "This phase adds a second platform alongside the existing one.",
    });
    assert.strictEqual(r.detected, true);
    assert.ok(r.signals && r.signals.length > 0, "detected result must carry the signals");
    assert.ok(r.promptBlock && r.promptBlock.length > 0, "a prompt block must be produced when detected");
    assert.match(r.promptBlock, /promote/i, "the promote-vs-add-alongside question must be present");
    assert.match(r.promptBlock, /add-alongside|add alongside/i, "the add-alongside option must be present");
    assert.match(r.promptBlock, /<assumption_delta_decision>/, "the recording instruction must be present");
    assert.match(r.promptBlock, /pluralization/i, "the signal kinds must be listed");
    assert.ok(r.logLine && r.logLine.length > 0, "a log line must be raised when detected");
    assert.match(r.logLine, /assumption-delta/i);
  });

  test("gate on + no signal → detected:false, no promptBlock", () => {
    const r = runAssumptionDeltaOnPlan({
      cfg: { workflow: { assumption_delta: true } },
      scopeText: "refactor the login function to be smaller",
    });
    assert.strictEqual(r.detected, false);
    assert.ok(!r.promptBlock, "no prompt block when nothing is detected");
  });
});

describe("assumption-delta: runAssumptionDeltaOnPlan — never-throws soft gate (D-08)", () => {
  test("hostile/punctuation scopeText still returns without throwing", () => {
    const hostile = "-".repeat(5000) + "\n" + "a - b - c - d".repeat(200);
    let r;
    assert.doesNotThrow(() => {
      r = runAssumptionDeltaOnPlan({ cfg: { workflow: { assumption_delta: true } }, scopeText: hostile });
    });
    assert.ok(r, "must return a result, not throw");
  });

  test("takes ONLY { cfg, scopeText } and never advances STATE (no state accessor)", () => {
    // The hook is synchronous and pure: calling it must not mutate anything and
    // must not require a state/ctx object. Assert it returns a plain result and
    // that no setActivePhase-like side effect is reachable (the function has no
    // I/O params — it is a pure function over cfg + scopeText).
    const r = runAssumptionDeltaOnPlan({ cfg: { workflow: { assumption_delta: true } }, scopeText: "adds a second platform" });
    assert.strictEqual(typeof r, "object");
    assert.ok("detected" in r);
    // A pure function: same inputs → same outputs, no external state.
    const r2 = runAssumptionDeltaOnPlan({ cfg: { workflow: { assumption_delta: true } }, scopeText: "adds a second platform" });
    assert.deepStrictEqual(r, r2);
  });
});

describe("assumption-delta: buildAssumptionDeltaPrompt (D-05/D-07)", () => {
  const signals = [
    { kind: "pluralization", term: "second", snippet: "adds a second platform" },
    { kind: "chosen", term: "configurable", snippet: "now configurable per tenant" },
  ];

  test("states the ONE identity-model question (promote vs add-alongside)", () => {
    const block = buildAssumptionDeltaPrompt({ signals });
    assert.match(block, /promote/i);
    assert.match(block, /add-alongside|add alongside/i);
    assert.match(block, /\?/, "the question must be phrased as a question");
  });

  test("lists each detected kind:term signal", () => {
    const block = buildAssumptionDeltaPrompt({ signals });
    assert.match(block, /pluralization/);
    assert.match(block, /chosen/);
    assert.match(block, /second/);
    assert.match(block, /configurable/);
  });

  test("instructs recording an <assumption_delta_decision> with noun-now-primary, decision, rationale, and add-alongside-as-debt", () => {
    const block = buildAssumptionDeltaPrompt({ signals });
    assert.match(block, /<assumption_delta_decision>/);
    assert.match(block, /promote\|add-alongside\|no-change|promote|add-alongside|no-change/);
    assert.match(block, /rationale/i);
    assert.match(block, /debt/i, "add-alongside must be called out as accepted debt");
  });

  test("notes the optional invariant/contract test companion (D-07)", () => {
    const block = buildAssumptionDeltaPrompt({ signals });
    assert.match(block, /invariant|contract|round-trips|use-path/i, "the D-07 invariant-test companion note must be present");
  });

  test("empty signals → still returns a non-empty block (no throw)", () => {
    const block = buildAssumptionDeltaPrompt({ signals: [] });
    assert.ok(typeof block === "string" && block.length > 0);
  });
});
