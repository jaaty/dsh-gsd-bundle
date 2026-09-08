// Offline suite for the phase-58 node-repair engine (lib/repair.js) — plan 03.
// Proves RESEARCH §6 validation architecture V1–V10 and V15 on FakeFs with
// counting fake delegates: the trigger gate (V1), rounds validation (V2),
// strict round order and delegate args (V3), no-fork delegation statics (V4),
// fail-loud missing delegate (V5), per-step artefact oracles (V6/V7), budget
// exhaustion + recovery (V8), REPAIR.md accumulation (V9), the scope-repair
// commit wiring (V10), STATE immobility (V14), and one happy-path end-to-end
// recovery through the REAL gsd_plan/gsd_execute/gsd_verify tools (V15).
//
// No network, no real git (commitArtifacts fails soft by design against the
// fake cwd), no LLM — mirrors test/tools.test.mjs (node --test +
// node:assert/strict, FakeFs + fake ctx, offline only).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { buildProject, FENCED_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED, VERIFICATION_GAPS } from "./helpers/project.mjs";
import { awaitingMarker, parseFrontmatter } from "../lib/_shared.js";
import { apply as applyRepair, REPAIR_ROUND_BUDGET } from "../lib/repair.js";

const CWD = "/project";
const PHASE_DIR = `${CWD}/.planning/phases/01-auth`;
const REPAIR_FILE = `${PHASE_DIR}/01-auth-REPAIR.md`;
const VERIFICATION_FILE = `${PHASE_DIR}/01-auth-VERIFICATION.md`;

let fs;
let svc;
let capture;
let repairCtx;
let repairTool;

// ── controller switches + counters (reset per test) ──────────────────────────
// The fake gsd_plan writes the NEXT free <PP> fix plan per call (01, 02, 03…),
// faithfully mirroring the real gap-closure planner instruction
// ("write the fix plan at the next free <PP>", lib/plan.js:193): round 2 of a
// multi-round test must produce a NEW runnable fix plan (gap_closure: true
// without a SUMMARY), because round 1's plan 01 already has its SUMMARY.
let planCalls = 0;
let lastPlanPP = null;
let planWritesNoFixPlan = false;
let execCheckpointMode = false;
let verifyWrites = [];

// The real lib/plan.js no-fix-plan guard string (lib/plan.js:199) so the
// stop-cause test exercises the real failure text, not a paraphrase.
const NO_FIX_PLAN_MSG =
  `gsd_plan: gap-closure mode but no fix plan (gap_closure: true) was produced in ${PHASE_DIR} after re-prompting. ` +
  `gsd_execute --gaps-only would run nothing. Planner output:\nplanner claimed ## PLANNING COMPLETE but wrote no fix plan file.`;

// A persisted CHECKPOINT artefact with the CHECKPOINT_DECISION frontmatter
// shape from test/tools.test.mjs:89-97 (decision checkpoint with decision_id).
const CHECKPOINT_ART = `---
plan: 01-auth-01
last_completed_task: 1
checkpoint_reason: pick a db
committed_hashes: ["a"]
checkpoint_kind: decision
decision_id: 01-auth-01-ck1
---
# checkpoint`;

// The exact awaiting marker the fake checkpointed gsd_execute returns (P5) —
// built from the shared helper so the surfaced line is byte-identical to what
// the real gsd_execute emits.
const CK_MARKER = awaitingMarker({ plan: "01-auth-01", decision_id: "01-auth-01-ck1", kind: "decision", question: "pick a db" });

const VERIFICATION_HUMAN = `---
phase: 01-auth
status: human_needed
score: 1/2
---
# Verification`;

const VERIFICATION_BANANA = `---
phase: 01-auth
status: banana
score: 1/2
---
# Verification`;

const VERIFICATION_NO_STATUS = `---
phase: 01-auth
score: 1/2
---
# Verification`;

// exec mirrors test/tools.test.mjs:112-115.
const exec = {
  agent: { session: { header: { cwd: CWD } } },
  signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
};

const countDelegates = (name) => capture.filter((e) => e.name === name).length;

async function resetHarness() {
  fs = new FakeFs();
  svc = await buildProject(fs, CWD);
  capture = [];
  planCalls = 0;
  lastPlanPP = null;
  planWritesNoFixPlan = false;
  execCheckpointMode = false;
  verifyWrites = [];
}

// Counting fake delegates: plain objects { name, execute(args, exec) } that
// push { name, args } into the shared capture array and mutate FakeFs.
function makeFakeDelegates() {
  const plan = {
    name: "gsd_plan",
    async execute(args) {
      capture.push({ name: "gsd_plan", args: { ...args } });
      if (planWritesNoFixPlan) return NO_FIX_PLAN_MSG;
      planCalls += 1;
      const pp = String(planCalls).padStart(2, "0");
      lastPlanPP = pp;
      await fs.writeText({ targetKey: `${PHASE_DIR}/01-auth-${pp}-PLAN.md` }, FENCED_PLAN);
      return "## PLANNING COMPLETE";
    },
  };
  const execute = {
    name: "gsd_execute",
    async execute(args) {
      capture.push({ name: "gsd_execute", args: { ...args } });
      if (execCheckpointMode) {
        // checkpoint stop: persist the CHECKPOINT artefact, write NO SUMMARY,
        // and return the exact awaiting marker line (P5/V7).
        await fs.writeText({ targetKey: `${PHASE_DIR}/01-auth-${lastPlanPP}-CHECKPOINT.md` }, CHECKPOINT_ART);
        return `wave 1: 01-auth-01 ⏸ checkpointed at task 1\n${CK_MARKER}`;
      }
      await fs.writeText({ targetKey: `${PHASE_DIR}/01-auth-${lastPlanPP}-SUMMARY.md` }, FENCED_SUMMARY);
      return "✓ 01-auth-01 complete";
    },
  };
  const verify = {
    name: "gsd_verify",
    async execute(args) {
      capture.push({ name: "gsd_verify", args: { ...args } });
      const status = verifyWrites.shift() ?? "gaps_found";
      await fs.writeText({ targetKey: VERIFICATION_FILE }, status === "passed" ? VERIFICATION_PASSED : VERIFICATION_GAPS);
      return `status: ${status}`;
    },
  };
  return [plan, execute, verify];
}

// Register the REAL gsd_repair (mirroring registerTool in test/tools.test.mjs),
// then expose it through an ARRAY ctx.tools alongside the delegates so
// findTool's Array.isArray branch resolves (lib/repair.js dual-shape lookup).
async function buildRepairHarness() {
  const c = {
    fs,
    get: (n) => (n === "gsdState" ? svc : undefined),
    provide() {},
    effect: () => () => {},
  };
  const tools = [];
  c.tools = { register: (t) => tools.push(t) };
  applyRepair(c, {});
  const tool = tools.find((t) => t && t.name === "gsd_repair");
  assert.ok(tool, "gsd_repair must be registered by lib/repair.js");
  c.tools = [...makeFakeDelegates(), tool];
  return { c, tool };
}

describe("gsd_repair trigger gate, rounds domain, and delegation contract (V1/V2/V3/V5 — D-03..D-06)", () => {
  beforeEach(async () => {
    await resetHarness();
    ({ c: repairCtx, tool: repairTool } = await buildRepairHarness());
  });

  test("single-round happy path: strict plan→execute→verify order with exact delegate args (D-06/V3)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    verifyWrites = ["passed"];
    const res = await repairTool.execute({ phase: 1 }, exec);
    assert.match(res, /RECOVERED/, "the report must signal recovery");
    assert.match(res, /Rounds run: 1/);
    assert.deepEqual(capture.map((e) => e.name), ["gsd_plan", "gsd_execute", "gsd_verify"],
      "one round must delegate in exactly plan → execute → verify order");
    assert.deepEqual(capture.map((e) => e.args), [
      { phase: 1, gaps: true },
      { phase: 1, gapsOnly: true },
      { phase: 1, gaps: true },
    ], "delegate args must be exactly { phase, gaps } / { phase, gapsOnly } / { phase, gaps }");
  });

  test("no-op on passed: zero delegate calls and no REPAIR.md written (D-05/V1)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED);
    const res = await repairTool.execute({ phase: 1 }, exec);
    assert.match(res, /already passed verification/);
    assert.equal(capture.length, 0, "a passed phase must spawn zero delegate calls");
    assert(!fs.files.has(REPAIR_FILE), "the no-op exit must not write REPAIR.md");
  });

  test("human_needed stop with zero delegate calls (D-04/V1)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_HUMAN);
    const res = await repairTool.execute({ phase: 1 }, exec);
    assert.match(res, /human_needed/);
    assert.match(res, /human_verification items/, "the cause must point at the human-owned items");
    assert.equal(capture.length, 0, "human-owned items are not machine-fixable plan gaps");
  });

  test("missing-file stop with zero delegate calls (D-04/V1)", async () => {
    // fresh project: buildProject seeds NO VERIFICATION.md
    const res = await repairTool.execute({ phase: 1 }, exec);
    assert.match(res, /VERIFICATION\.md is missing or unreadable/);
    assert.match(res, /run gsd_verify first/);
    assert.equal(capture.length, 0);
  });

  test("unparseable stop with zero delegate calls — bad status value AND absent status field (D-04/V1)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_BANANA);
    const bananaRes = await repairTool.execute({ phase: 1 }, exec);
    assert.match(bananaRes, /missing or unrecognized status field/);
    assert.equal(capture.length, 0);
    // second shape: frontmatter present but with NO status field at all
    await fs.writeText({ targetKey: VERIFICATION_FILE }, VERIFICATION_NO_STATUS);
    const noStatusRes = await repairTool.execute({ phase: 1 }, exec);
    assert.match(noStatusRes, /missing or unrecognized status field/);
    assert.equal(capture.length, 0);
  });

  test("the three gate-stop causes are three distinct messages (D-04)", async () => {
    // (a) human_needed
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_HUMAN);
    const humanRes = await repairTool.execute({ phase: 1 }, exec);
    // (b) missing-file — fresh project, no VERIFICATION seeded
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    const missingRes = await repairTool.execute({ phase: 1 }, exec);
    // (c) unparseable
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_BANANA);
    const unparseableRes = await repairTool.execute({ phase: 1 }, exec);
    assert.notEqual(humanRes, missingRes);
    assert.notEqual(missingRes, unparseableRes);
    assert.notEqual(humanRes, unparseableRes);
    assert.equal(capture.length, 0, "no gate exit may call a delegate");
  });

  test("missing gsd_plan delegate fails loud with the named error (V5)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    const saved = repairCtx.tools;
    repairCtx.tools = [repairTool]; // no delegates registered
    await assert.rejects(() => repairTool.execute({ phase: 1 }, exec), /gsd_plan tool not registered/);
    repairCtx.tools = saved;
    assert.equal(capture.length, 0);
  });

  test("rounds validation: 0/3/1.5 fail loud before any delegate call; rounds:1 honored (D-03/V2)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    assert.equal(REPAIR_ROUND_BUDGET, 2, "the hard-coded default budget is 2");
    for (const bad of [0, 3, 1.5]) {
      const res = await repairTool.execute({ phase: 1, rounds: bad }, exec);
      assert.match(res, /rounds must be an integer between 1 and 2/);
      assert.equal(capture.length, 0, `rounds:${bad} must stop before any delegate call`);
    }
    verifyWrites = ["passed"];
    const res = await repairTool.execute({ phase: 1, rounds: 1 }, exec);
    assert.match(res, /RECOVERED/);
    assert.deepEqual(capture.map((e) => e.name), ["gsd_plan", "gsd_execute", "gsd_verify"],
      "rounds:1 must run exactly one plan + one execute + one verify call");
  });
});