// Offline behavioural tests for the mempalace auto-hooks wired into the loop
// tools (D-07, D-11h). The hook helpers are PURE ({ cfg, tools, phase, exec } →
// Promise<string>) — no ctx, no git, no gsdState — so they are tested directly
// with a fake tools array (mirrors the runLearningsOnShip / runGraphifyOnShip
// precedent in test/learnings.test.mjs / test/graphify.test.mjs). No mount, no
// FakeFs, no git/gh, no LLM.
//
// Coverage per D-07 / REQ-MP-06:
//   (a) recall hooks (runMempalaceRecallOnDiscuss / runMempalaceRecallOnPlan)
//       gated by mempalace.enabled + recall_on_discuss / recall_on_plan;
//   (b) capture hooks (runMempalaceCaptureOnDiscuss / OnPlan / OnVerify / OnShip)
//       gated by mempalace.enabled + capture_artifacts, with the correct artifact
//       arg per loop point (discuss→CONTEXT, plan→PLAN, verify→SUMMARY,
//       ship→SUMMARY, OQ-3);
//   (c) every hook is onError: skip — a tool fault returns a non-blocking line
//       with the real cause and never rejects (REQ-MP-06);
//   (d) a missing tool returns a not-registered/skipped line, never throws
//       (DEGR-05);
//   (e) absent cfg (no mempalace object) → skipped, defends against missing
//       config via optional chaining.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { runMempalaceRecallOnDiscuss, runMempalaceCaptureOnDiscuss } from "../lib/discuss.js";
import { runMempalaceRecallOnPlan, runMempalaceCaptureOnPlan } from "../lib/plan.js";
import { runMempalaceCaptureOnVerify } from "../lib/verify.js";
import { runMempalaceCaptureOnShip } from "../lib/ship.js";

const exec = {};

// A fake gsd_mempalace_recall / gsd_mempalace_capture tool that records its
// calls and returns a canned result string.
function makeFakeMempalaceTool(name, result) {
  const calls = [];
  const tool = {
    name,
    async execute(args, _exec) {
      calls.push(args);
      return result;
    },
  };
  return { tool, calls };
}

// A fake tool that always throws — used to prove a hook never blocks the loop.
function makeFailingMempalaceTool(name) {
  return {
    name,
    async execute() { throw new Error("mempalace outage"); },
  };
}

// ── recall hooks (D-07, D-11h) ─────────────────────────────────────────────────
// runMempalaceRecallOnDiscuss / runMempalaceRecallOnPlan: gated by
// mempalace.enabled + recall_on_discuss / recall_on_plan, invoke the registered
// gsd_mempalace_recall tool with { phase }, never blocking on fault.

describe("mempalace: runMempalaceRecallOnDiscuss (recall at discuss:pre, D-07)", () => {
  test("mempalace.enabled false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled");
    const cfg = { mempalace: { enabled: false, recall_on_discuss: true } };
    const out = await runMempalaceRecallOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when mempalace is disabled");
    assert.doesNotMatch(out, /recalled/);
  });

  test("recall_on_discuss false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled");
    const cfg = { mempalace: { enabled: true, recall_on_discuss: false } };
    const out = await runMempalaceRecallOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when recall_on_discuss is off");
  });

  test("enabled + recall_on_discuss true + tool present → calls execute({ phase }), returns result line", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled 3 items");
    const cfg = { mempalace: { enabled: true, recall_on_discuss: true } };
    const out = await runMempalaceRecallOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /mempalace recall:/i);
    assert.match(out, /recalled 3 items/);
    assert.deepEqual(calls[0], { phase: 1 }, "recall must invoke the tool with { phase }");
  });

  test("enabled + tool throws → returns non-blocking line with cause, never rejects (REQ-MP-06)", async () => {
    const tool = makeFailingMempalaceTool("gsd_mempalace_recall");
    const cfg = { mempalace: { enabled: true, recall_on_discuss: true } };
    const out = await runMempalaceRecallOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /mempalace outage/, "the real cause must be surfaced");
  });

  test("enabled + tool absent → returns not-registered/skipped, never throws (DEGR-05)", async () => {
    const cfg = { mempalace: { enabled: true, recall_on_discuss: true } };
    const out = await runMempalaceRecallOnDiscuss({ cfg, tools: [], phase: 1, exec });
    assert.match(out, /not registered|skipped/i);
    assert.doesNotMatch(out, /recalled/);
  });

  test("cfg absent (no mempalace object) → skipped, defends against missing config", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled");
    const out = await runMempalaceRecallOnDiscuss({ cfg: undefined, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no mempalace object");
  });
});

describe("mempalace: runMempalaceRecallOnPlan (recall at plan:pre, D-07)", () => {
  test("mempalace.enabled false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled");
    const cfg = { mempalace: { enabled: false, recall_on_plan: true } };
    const out = await runMempalaceRecallOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when mempalace is disabled");
  });

  test("recall_on_plan false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled");
    const cfg = { mempalace: { enabled: true, recall_on_plan: false } };
    const out = await runMempalaceRecallOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when recall_on_plan is off");
  });

  test("enabled + recall_on_plan true + tool present → calls execute({ phase }), returns result line", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled 5 items");
    const cfg = { mempalace: { enabled: true, recall_on_plan: true } };
    const out = await runMempalaceRecallOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /mempalace recall:/i);
    assert.match(out, /recalled 5 items/);
    assert.deepEqual(calls[0], { phase: 1 }, "recall must invoke the tool with { phase }");
  });

  test("enabled + tool throws → returns non-blocking line with cause, never rejects (REQ-MP-06)", async () => {
    const tool = makeFailingMempalaceTool("gsd_mempalace_recall");
    const cfg = { mempalace: { enabled: true, recall_on_plan: true } };
    const out = await runMempalaceRecallOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /mempalace outage/, "the real cause must be surfaced");
  });

  test("enabled + tool absent → returns not-registered/skipped, never throws (DEGR-05)", async () => {
    const cfg = { mempalace: { enabled: true, recall_on_plan: true } };
    const out = await runMempalaceRecallOnPlan({ cfg, tools: [], phase: 1, exec });
    assert.match(out, /not registered|skipped/i);
  });

  test("cfg absent (no mempalace object) → skipped, defends against missing config", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_recall", "recalled");
    const out = await runMempalaceRecallOnPlan({ cfg: undefined, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no mempalace object");
  });
});

// ── capture hooks (D-07, D-11h) ────────────────────────────────────────────────
// runMempalaceCaptureOnDiscuss / OnPlan / OnVerify / OnShip: gated by
// mempalace.enabled + capture_artifacts, invoke the registered
// gsd_mempalace_capture tool with { phase, artifact }, never blocking on fault.
// The artifact arg is the loop-point's phase artefact (OQ-3): discuss→CONTEXT,
// plan→PLAN, verify→SUMMARY, ship→SUMMARY.

describe("mempalace: runMempalaceCaptureOnDiscuss (capture at discuss:post, D-07)", () => {
  test("mempalace.enabled false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: false, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when mempalace is disabled");
  });

  test("capture_artifacts false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: true, capture_artifacts: false } };
    const out = await runMempalaceCaptureOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when capture_artifacts is off");
  });

  test("enabled + capture_artifacts true + tool present → calls execute({ phase, artifact: 'CONTEXT' })", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured CONTEXT");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /mempalace capture:/i);
    assert.match(out, /captured CONTEXT/);
    assert.deepEqual(calls[0], { phase: 1, artifact: "CONTEXT" }, "discuss:post must file CONTEXT.md (OQ-3)");
  });

  test("enabled + tool throws → returns non-blocking line with cause, never rejects (REQ-MP-06)", async () => {
    const tool = makeFailingMempalaceTool("gsd_mempalace_capture");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnDiscuss({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /mempalace outage/, "the real cause must be surfaced");
  });

  test("enabled + tool absent → returns not-registered/skipped, never throws (DEGR-05)", async () => {
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnDiscuss({ cfg, tools: [], phase: 1, exec });
    assert.match(out, /not registered|skipped/i);
  });

  test("cfg absent (no mempalace object) → skipped, defends against missing config", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const out = await runMempalaceCaptureOnDiscuss({ cfg: undefined, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no mempalace object");
  });
});

describe("mempalace: runMempalaceCaptureOnPlan (capture at plan:post, D-07)", () => {
  test("mempalace.enabled false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: false, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when mempalace is disabled");
  });

  test("capture_artifacts false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: true, capture_artifacts: false } };
    const out = await runMempalaceCaptureOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when capture_artifacts is off");
  });

  test("enabled + capture_artifacts true + tool present → calls execute({ phase, artifact: 'PLAN' })", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured PLAN");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /mempalace capture:/i);
    assert.match(out, /captured PLAN/);
    assert.deepEqual(calls[0], { phase: 1, artifact: "PLAN" }, "plan:post must file PLAN.md (OQ-3)");
  });

  test("enabled + tool throws → returns non-blocking line with cause, never rejects (REQ-MP-06)", async () => {
    const tool = makeFailingMempalaceTool("gsd_mempalace_capture");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnPlan({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /mempalace outage/, "the real cause must be surfaced");
  });

  test("enabled + tool absent → returns not-registered/skipped, never throws (DEGR-05)", async () => {
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnPlan({ cfg, tools: [], phase: 1, exec });
    assert.match(out, /not registered|skipped/i);
  });

  test("cfg absent (no mempalace object) → skipped, defends against missing config", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const out = await runMempalaceCaptureOnPlan({ cfg: undefined, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no mempalace object");
  });
});

describe("mempalace: runMempalaceCaptureOnVerify (capture at verify:post, D-07)", () => {
  test("mempalace.enabled false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: false, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnVerify({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when mempalace is disabled");
  });

  test("capture_artifacts false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: true, capture_artifacts: false } };
    const out = await runMempalaceCaptureOnVerify({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when capture_artifacts is off");
  });

  test("enabled + capture_artifacts true + tool present → calls execute({ phase, artifact: 'SUMMARY' })", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured SUMMARY");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnVerify({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /mempalace capture:/i);
    assert.match(out, /captured SUMMARY/);
    assert.deepEqual(calls[0], { phase: 1, artifact: "SUMMARY" }, "verify:post must file SUMMARY.md (OQ-3)");
  });

  test("enabled + tool throws → returns non-blocking line with cause, never rejects (REQ-MP-06)", async () => {
    const tool = makeFailingMempalaceTool("gsd_mempalace_capture");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnVerify({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /mempalace outage/, "the real cause must be surfaced");
  });

  test("enabled + tool absent → returns not-registered/skipped, never throws (DEGR-05)", async () => {
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnVerify({ cfg, tools: [], phase: 1, exec });
    assert.match(out, /not registered|skipped/i);
  });

  test("cfg absent (no mempalace object) → skipped, defends against missing config", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const out = await runMempalaceCaptureOnVerify({ cfg: undefined, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no mempalace object");
  });
});

describe("mempalace: runMempalaceCaptureOnShip (capture at ship:post, D-07, OQ-3)", () => {
  test("mempalace.enabled false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: false, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnShip({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when mempalace is disabled");
  });

  test("capture_artifacts false → skipped, tool never called", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const cfg = { mempalace: { enabled: true, capture_artifacts: false } };
    const out = await runMempalaceCaptureOnShip({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when capture_artifacts is off");
  });

  test("enabled + capture_artifacts true + tool present → calls execute({ phase, artifact: 'SUMMARY' })", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured SUMMARY");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnShip({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /mempalace capture:/i);
    assert.match(out, /captured SUMMARY/);
    assert.deepEqual(calls[0], { phase: 1, artifact: "SUMMARY" }, "ship:post must re-file SUMMARY.md into milestones (OQ-3)");
  });

  test("enabled + tool throws → returns non-blocking line with cause, never rejects (REQ-MP-06)", async () => {
    const tool = makeFailingMempalaceTool("gsd_mempalace_capture");
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnShip({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /mempalace outage/, "the real cause must be surfaced");
  });

  test("enabled + tool absent → returns not-registered/skipped, never throws (DEGR-05)", async () => {
    const cfg = { mempalace: { enabled: true, capture_artifacts: true } };
    const out = await runMempalaceCaptureOnShip({ cfg, tools: [], phase: 1, exec });
    assert.match(out, /not registered|skipped/i);
  });

  test("cfg absent (no mempalace object) → skipped, defends against missing config", async () => {
    const { tool, calls } = makeFakeMempalaceTool("gsd_mempalace_capture", "captured");
    const out = await runMempalaceCaptureOnShip({ cfg: undefined, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no mempalace object");
  });
});
