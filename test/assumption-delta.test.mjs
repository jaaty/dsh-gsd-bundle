// Offline unit tests for the pure assumption-delta detector (lib/assumption-delta.js),
// TDD per D-09. The detector is a PURE function over phase-scope text returning a
// typed IR ({ detected, signals[], terms }) — no ctx, no fs, no git, no I/O (D-01).
// Modeled on the upstream matrix (.analysis/gsd-core/tests/assumption-delta.test.cjs)
// but ESM (.mjs) importing from ../lib/assumption-delta.js.
//
// Coverage per D-09:
//   (a) result shape — always { detected, signals[], terms }; terms echo the
//       effective (resolved) term set actually used;
//   (b) pluralization / optional / chosen firing across the curated vocabulary;
//   (c) no-signal phases do NOT fire (low false-positive);
//   (d) FALSE-POSITIVE GUARD: bare "or" never fires a pluralization signal;
//   (e) FALSE-POSITIVE GUARD: a trigger term inside a fenced code block does not
//       fire; an unrelated fence does not suppress a genuine prose trigger;
//   (f) each signal carries a non-empty snippet containing the matched term;
//   (g) CRLF input behaves identically to LF input;
//   (h) empty / whitespace / non-string inputs degrade to detected:false without
//       throwing;
//   (i) custom term override/merge + normalizeTerms/resolveTerms hardening.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  detectAssumptionDelta,
  DEFAULT_ASSUMPTION_DELTA_TERMS,
} from "../lib/assumption-delta.js";

describe("assumption-delta: detectAssumptionDelta — pure detector (D-09)", () => {
  test("result shape — always carries detected, signals[], terms", () => {
    const r = detectAssumptionDelta("refactor the login function");
    assert.strictEqual(r.detected, false);
    assert.ok(Array.isArray(r.signals));
    assert.strictEqual(r.signals.length, 0);
    assert.ok(r.terms && Array.isArray(r.terms.pluralization));
    assert.ok(Array.isArray(r.terms.optional));
    assert.ok(Array.isArray(r.terms.chosen));
  });

  test("terms echo is the effective term set actually used", () => {
    const r = detectAssumptionDelta("nothing here");
    assert.deepStrictEqual(r.terms.pluralization, [...DEFAULT_ASSUMPTION_DELTA_TERMS.pluralization]);
    assert.deepStrictEqual(r.terms.optional, [...DEFAULT_ASSUMPTION_DELTA_TERMS.optional]);
    assert.deepStrictEqual(r.terms.chosen, [...DEFAULT_ASSUMPTION_DELTA_TERMS.chosen]);
  });

  // ── Primary trigger: pluralization ───────────────────────────────────────
  for (const cue of [
    "second auth method",
    "alternative platform",
    "fallback provider",
    "also support a second region",
    "an additional source of truth",
    "another tenant",
    "a supplementary store",
    "a second platform alongside the existing one",
    "multiple sources of truth",
    "plural primary keys",
    "a 2nd region",
  ]) {
    test(`pluralization fires on: "${cue}"`, () => {
      const r = detectAssumptionDelta(cue);
      assert.strictEqual(r.detected, true, `expected detection for: ${cue}`);
      assert.ok(
        r.signals.some((s) => s.kind === "pluralization"),
        `expected a pluralization signal for: ${cue}`,
      );
    });
  }

  // ── Secondary trigger: required → optional ───────────────────────────────
  for (const cue of ["the field becomes optional", "optionally omitted", "may be optional now"]) {
    test(`optional fires on: "${cue}"`, () => {
      const r = detectAssumptionDelta(cue);
      assert.strictEqual(r.detected, true, `expected detection for: ${cue}`);
      assert.ok(
        r.signals.some((s) => s.kind === "optional"),
        `expected an optional signal for: ${cue}`,
      );
    });
  }

  // ── Secondary trigger: derived → chosen / constant → parameter ───────────
  for (const cue of [
    "value is chosen by the caller",
    "now configurable per tenant",
    "parameterized at runtime",
    "selectable in settings",
    "a custom retry policy",
  ]) {
    test(`chosen fires on: "${cue}"`, () => {
      const r = detectAssumptionDelta(cue);
      assert.strictEqual(r.detected, true, `expected detection for: ${cue}`);
      assert.ok(
        r.signals.some((s) => s.kind === "chosen"),
        `expected a chosen signal for: ${cue}`,
      );
    });
  }

  // ── No-signal phases do NOT fire (low false-positive) ────────────────────
  for (const clean of [
    "refactor the login function",
    "add a unit test for the parser",
    "fix the off-by-one in the loop",
    "update the README install steps",
  ]) {
    test(`no-signal phase does NOT fire: "${clean}"`, () => {
      const r = detectAssumptionDelta(clean);
      assert.strictEqual(r.detected, false, `false positive on: ${clean}`);
      assert.strictEqual(r.signals.length, 0);
    });
  }

  // ── FALSE-POSITIVE GUARD: bare "or" in prose must NOT fire ────────────────
  test('FALSE-POSITIVE GUARD: bare "or" in normal prose does NOT fire', () => {
    const r = detectAssumptionDelta("refactor or rewrite the module to be cleaner");
    assert.strictEqual(r.detected, false, 'bare "or" must not fire — it would make every English sentence trip the gate');
  });

  // ── FALSE-POSITIVE GUARD: trigger term inside a fenced code block ─────────
  test("FALSE-POSITIVE GUARD: trigger term inside a fenced code block does NOT fire", () => {
    const scope = [
      "Add a retry helper to the client.",
      "",
      "```js",
      "const fallback = () => retry(); // internal var name",
      "```",
      "",
      "No architectural change here.",
    ].join("\n");
    const r = detectAssumptionDelta(scope);
    assert.strictEqual(r.detected, false, "a trigger term appearing only inside a fenced code block must not fire");
  });

  test("FALSE-POSITIVE GUARD: trigger term inside a ~~~ fenced block with info string does NOT fire", () => {
    const scope = [
      "Add a retry helper.",
      "",
      "~~~ts",
      "const additional = 1;",
      "~~~",
      "",
      "No architectural change here.",
    ].join("\n");
    const r = detectAssumptionDelta(scope);
    assert.strictEqual(r.detected, false, "a trigger term inside a ~~~ fence must not fire");
  });

  // ── A real signal in prose still fires even when a code block is present ──
  test("signal in prose fires even when an unrelated fenced block is present", () => {
    const scope = [
      "This phase adds a second platform alongside the existing one.",
      "",
      "```js",
      "const x = 1;",
      "```",
    ].join("\n");
    const r = detectAssumptionDelta(scope);
    assert.strictEqual(r.detected, true);
    assert.ok(r.signals.some((s) => s.kind === "pluralization"));
  });

  // ── signal carries a usable context snippet ──────────────────────────────
  test("each signal carries a non-empty snippet with context", () => {
    const r = detectAssumptionDelta("This phase introduces a second authentication method.");
    assert.strictEqual(r.detected, true);
    const sig = r.signals[0];
    assert.ok(typeof sig.snippet === "string" && sig.snippet.length > 0);
    assert.ok(sig.snippet.toLowerCase().includes(sig.term), "snippet should contain the matched term");
  });

  // ── CRLF resilience ───────────────────────────────────────────────────────
  test("CRLF line endings are handled identically to LF", () => {
    const lf = detectAssumptionDelta("adds a second region\nalso configurable");
    const crlf = detectAssumptionDelta("adds a second region\r\nalso configurable");
    assert.strictEqual(lf.detected, true);
    assert.strictEqual(crlf.detected, true);
    assert.strictEqual(lf.signals.length, crlf.signals.length);
  });

  // ── empty / whitespace / non-string inputs degrade to detected:false ──────
  test("empty string → detected:false", () => {
    assert.strictEqual(detectAssumptionDelta("").detected, false);
  });
  test("whitespace-only → detected:false", () => {
    assert.strictEqual(detectAssumptionDelta("   \n\t  ").detected, false);
  });
  test("non-string (null/undefined/number) → detected:false, no throw", () => {
    assert.strictEqual(detectAssumptionDelta(null).detected, false);
    assert.strictEqual(detectAssumptionDelta(undefined).detected, false);
    assert.strictEqual(detectAssumptionDelta(42).detected, false);
  });

  // ── custom term set overrides defaults (config-tunable vocabulary) ────────
  test("custom term set overrides defaults", () => {
    const custom = { pluralization: ["xyzzy"], optional: [], chosen: [] };
    const r = detectAssumptionDelta("this phase adds a second platform", custom);
    assert.strictEqual(r.detected, false, 'default cue "second" must not fire when defaults are overridden');
    assert.deepStrictEqual(r.terms.pluralization, ["xyzzy"]);
    const r2 = detectAssumptionDelta("introduces an xyzzy adapter", custom);
    assert.strictEqual(r2.detected, true);
    assert.ok(r2.signals.some((s) => s.term === "xyzzy"));
  });

  test("partial custom term set merges over defaults per-kind (absent kinds keep defaults)", () => {
    const partial = { pluralization: ["second"] };
    const r = detectAssumptionDelta("now optional", partial);
    assert.strictEqual(r.detected, true, "optional defaults still apply when only pluralization was overridden");
    assert.ok(r.signals.some((s) => s.kind === "optional"));
  });

  // ── Hardening: normalizeTerms / resolveTerms (Codex review fixes) ─────────
  test("normalizeTerms: punctuation-only / empty / dupe terms filtered; lowercased", () => {
    const r = detectAssumptionDelta("adds a second platform", {
      pluralization: ["second", "second", "-", "", "XYZZY"],
      optional: [],
      chosen: [],
    });
    // '-' (punct-only) and '' dropped; dupe 'second' collapsed; 'XYZZY'→'xyzzy'
    assert.deepStrictEqual(r.terms.pluralization, ["second", "xyzzy"]);
    // 'second' survived → detected
    assert.strictEqual(r.detected, true);
  });

  test("normalizeTerms: cap guards a huge/hostile term list (no giant regex / echo)", () => {
    const huge = Array.from({ length: 250 }, (_, i) => `cue${i}`);
    const r = detectAssumptionDelta("routine refactor", { pluralization: huge, optional: [], chosen: [] });
    assert.ok(r.terms.pluralization.length <= 200, `capped to <=200, got ${r.terms.pluralization.length}`);
    assert.strictEqual(r.detected, false);
  });

  test("punctuation-only term does NOT match prose punctuation as a signal", () => {
    const r = detectAssumptionDelta("refactor the parser - keep behavior", {
      pluralization: ["-"],
      optional: [],
      chosen: [],
    });
    assert.strictEqual(r.detected, false, "punctuation-only term must not produce a signal");
    assert.deepStrictEqual(r.terms.pluralization, []);
  });

  test("explicit empty array disables that kind (override present, normalized to [])", () => {
    const r = detectAssumptionDelta("adds a second platform", {
      pluralization: [],
      optional: [],
      chosen: [],
    });
    assert.strictEqual(r.detected, false, "all kinds disabled → nothing fires");
    assert.deepStrictEqual(r.terms.pluralization, []);
  });
});
