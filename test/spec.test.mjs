// Offline behavioural tests for the spec-phase plugin (lib/spec.js), TDD per
// D-12. Proves gsd_spec_phase produces a falsifiable SPEC.md (Requirements with
// Current/Target/Acceptance, Boundaries, Constraints, Ambiguity Report) gated
// by an ambiguity-scoring subagent, and advances STATE to the spec step.
//
// Offline only (D-08): FakeFs + fake-ctx + injectable fake scoring subagent, no
// live DSH boot, no LLM/git/gh. The scorer is a controllable fake so gate
// edge-cases (overrun / under-min / UNAVAILABLE) are deterministic.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applySpec } from "../lib/spec.js";

// Boot a fresh FakeFs + ctx with only state / core-tools / spec applied.
// subagents may be a service object or a factory `(fs) => service`.
async function mountSpec({ subagents } = {}) {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs, { subagents });
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  applySpec(ctx, {});
  return { fs, ctx };
}

// Bootstrap a .planning/ project through the mounted gsd_init (R-1: same
// gsdState instance the persona reads). Customisable phase + requirements so
// the auto-derived-defaults path can be exercised.
async function bootstrap(ctx, phase, requirements) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements,
      phases: [phase],
    },
    makeExec(),
  );
}

// A controllable fake scorer controlling what gsd_spec_phase's ambiguity-scoring
// subagent returns. fail=true makes start() throw (D-07 UNAVAILABLE path).
function makeScorer(controller) {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      if (controller.capture) controller.capture(req);
      if (controller.fail) throw new Error("scorer exploded");
      return {
        result: {
          output: [{ type: "text", text: "scored" }],
          stopReason: "completed",
          structured: controller.structured,
        },
        dispose: () => {},
      };
    },
  };
}

const PHASE = { name: "spec-phase", goal: "Clarify WHAT the phase delivers before discuss", requirements: ["M1"] };
const REQUESTS = [{ id: "M1", text: "A spec-phase exists and produces a falsifiable SPEC.md." }];

const PASSING_SCORED = {
  dimensions: [
    { dimension: "goal", score: 0.9, note: "crisp goal" },
    { dimension: "boundary", score: 0.9, note: "clear bounds" },
    { dimension: "constraint", score: 0.9, note: "concrete constraints" },
    { dimension: "acceptance", score: 0.9, note: "falsifiable" },
  ],
  below_minimum: [],
};

function runSpec(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_spec_phase");
  assert.ok(t, "gsd_spec_phase not registered");
  return t.execute(args, makeExec());
}

describe("spec-phase: gsd_spec_phase writes a falsifiable SPEC.md and advances STATE", () => {
  test("happy path: a scored spec writes SPEC.md with requirements + Ambiguity Report and STATE 'spec'", async () => {
    const { ctx } = await mountSpec({ subagents: makeScorer({ structured: PASSING_SCORED }) });
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");
    assert.ok(gsdState, "gsdState not provided");

    const res = await runSpec(ctx, { phase: 1, auto: true });
    assert.match(res, /Spec complete.*phase 1/si);

    const spec = await gsdState.readArtifact(CWD, 1, "SPEC");
    assert.ok(spec, "SPEC.md was not written");
    assert.match(spec, /## Requirements/);
    assert.match(spec, /## Ambiguity Report/);
    assert.match(spec, /\*\*Current:\*\*/);
    assert.match(spec, /\*\*Target:\*\*/);
    assert.match(spec, /\*\*Acceptance:\*\*/);
    assert.match(spec, /PASSING|PASSED/, "gate should report passing for a low-ambiguity clear spec");

    // STATE advanced to the spec step with discuss as the next action (D-08).
    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.status, "spec", "STATE status is not 'spec'");
    assert.equal(state.frontmatter.next_action, "discuss-phase", "next_action is not 'discuss-phase'");
  });

  test("overrun soft-gate: above-0.20 ambiguity still writes SPEC.md and flags below-min dimensions as assumptions (D-06)", async () => {
    const OVERRUN = {
      dimensions: [
        { dimension: "goal", score: 0.6 },
        { dimension: "boundary", score: 0.6 },
        { dimension: "constraint", score: 0.6 },
        { dimension: "acceptance", score: 0.6 },
      ],
      below_minimum: ["goal", "boundary", "constraint", "acceptance"],
    };
    const { ctx } = await mountSpec({ subagents: makeScorer({ structured: OVERRUN }) });
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    const res = await runSpec(ctx, { phase: 1, auto: true });
    assert.match(res, /gate OVERRUN/i, "output does not report the overrun gate");

    const spec = await gsdState.readArtifact(CWD, 1, "SPEC");
    assert.ok(spec, "SPEC.md was NOT written on overrun — soft gate must still write (D-06)");
    assert.match(spec, /OVERRUN/, "Ambiguity Report does not show gate OVERRUN");
    assert.match(spec, /below min|planner assumption/i, "below-min dimensions not flagged as assumptions");
  });

  test("under-min joint gate: a dimension below its minimum is flagged even when ambiguity <= 0.20 (R-2)", async () => {
    const UNDER_MIN = {
      dimensions: [
        { dimension: "goal", score: 1.0 },
        { dimension: "boundary", score: 1.0 },
        { dimension: "constraint", score: 0.4 },
        { dimension: "acceptance", score: 1.0 },
      ],
      below_minimum: ["constraint"],
    };
    const { ctx } = await mountSpec({ subagents: makeScorer({ structured: UNDER_MIN }) });
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    const res = await runSpec(ctx, { phase: 1, auto: true });
    // Overall ambiguity = 1 - (0.35+0.25+0.08+0.20) = 0.12 <= 0.20, BUT the
    // constraint dimension (0.4) is under its 0.65 minimum. The joint gate must
    // still flag it — never silently accepted.
    assert.match(res, /OVERRUN|assumption/i, "under-min dimension not surfaced in output");
    const spec = await gsdState.readArtifact(CWD, 1, "SPEC");
    assert.ok(spec, "SPEC.md was not written");
    assert.match(spec, /OVERRUN/, "joint gate not reported as OVERRUN for a below-min dimension");
    assert.match(spec, /Constraint Clarity[^\n]*UNDER-MIN/, "constraint dimension not marked UNDER-MIN");
  });

  test("UNAVAILABLE degradation: scoring-subagent fault writes SPEC.md with UNAVAILABLE + real cause, never throws (D-07)", async () => {
    const { ctx } = await mountSpec({ subagents: makeScorer({ fail: true }) });
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    // If the tool hard-blocks (throws) the await just fails the test — passing
    // this line IS the "never throws on scorer fault" assertion (D-07).
    const res = await runSpec(ctx, { phase: 1, auto: true });
    assert.match(res, /UNAVAILABLE/, "output does not report UNAVAILABLE scoring");

    const spec = await gsdState.readArtifact(CWD, 1, "SPEC");
    assert.ok(spec, "SPEC.md was NOT written on scorer fault — must degrade, not hard-block");
    assert.match(spec, /UNAVAILABLE/, "Ambiguity Report not marked UNAVAILABLE");
    assert.match(spec, /scorer exploded/, "real cause not reported in the UNAVAILABLE report");
  });

  test("falsifiability reject (fail-fast, D-11): a requirement without Acceptance throws and writes no SPEC.md", async () => {
    const { ctx } = await mountSpec({ subagents: makeScorer({ structured: PASSING_SCORED }) });
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    await assert.rejects(
      runSpec(ctx, { phase: 1, requirements: [{ id: "X", current: "y", target: "z" }] }),
      /falsifiable/,
      "non-auto call with a requirement lacking Acceptance should throw",
    );
    assert.equal(await gsdState.hasArtifact(CWD, 1, "SPEC"), false, "SPEC.md must NOT be written on falsifiability reject");
  });

  test("auto/interactive dispatch (D-03): auto derives non-undefined defaults; interactive-with-nothing throws guidance", async () => {
    // Phase declares M1 (present in REQUIREMENTS.md) and GHOST (absent) so the
    // auto path must fill GHOST with its own REQ-ID label, never "undefined".
    const { ctx } = await mountSpec({ subagents: makeScorer({ structured: PASSING_SCORED }) });
    await bootstrap(ctx, { name: "spec-phase", goal: "goal", requirements: ["M1", "GHOST"] }, REQUESTS);
    const gsdState = ctx.get("gsdState");

    // auto=true with no requirements → derives defaults, writes an auto-mode log line.
    const res = await runSpec(ctx, { phase: 1, auto: true });
    assert.match(res, /Spec complete/);
    const spec = await gsdState.readArtifact(CWD, 1, "SPEC");
    assert.ok(spec, "auto-derived SPEC.md not written");
    assert.ok(!spec.includes("**Target:** undefined"), "derived SPEC has an 'undefined' Target");
    assert.ok(!spec.includes("**Acceptance:** undefined"), "derived SPEC has an 'undefined' Acceptance");
    assert.match(spec, /auto mode: defaults selected from ROADMAP/, "auto-mode Interview Log line absent");

    // Non-auto (auto omitted) with no requirements → throws Socratic guidance.
    await assert.rejects(
      runSpec(ctx, { phase: 1 }),
      /Socratic interview/,
      "interactive call with nothing supplied should throw interview guidance",
    );
  });
});
