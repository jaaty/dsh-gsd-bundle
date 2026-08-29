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
});
