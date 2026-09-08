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
import { apply as applyPlan } from "../lib/plan.js";
import { apply as applyExecute } from "../lib/execute.js";
import { apply as applyVerify } from "../lib/verify.js";

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

describe("gsd_repair per-step oracles, REPAIR.md accumulation, STATE immobility (V6–V10/V14 — D-07/D-10/D-11)", () => {
  beforeEach(async () => {
    await resetHarness();
    ({ c: repairCtx, tool: repairTool } = await buildRepairHarness());
  });

  test("no runnable fix plan stops with the plan tool's real guard text; execute never called (D-11/V6)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    planWritesNoFixPlan = true;
    const res = await repairTool.execute({ phase: 1 }, exec);
    // the stop text must INCLUDE the plan tool's returned guard text
    assert.match(res, /no fix plan \(gap_closure: true\)/);
    assert.match(res, /--gaps-only would run nothing/);
    assert.equal(countDelegates("gsd_plan"), 1);
    assert.equal(countDelegates("gsd_execute"), 0, "execute must never run without a runnable fix plan");
    assert.equal(countDelegates("gsd_verify"), 0);
    const repair = await svc.readArtifact(CWD, 1, "REPAIR");
    assert.match(repair, /## Stop/, "the stop must be recorded in REPAIR.md");
  });

  test("checkpointed execute stops with the verbatim awaiting marker; verify uncalled; no blind re-run (D-11/V7/P5)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    execCheckpointMode = true;
    const res = await repairTool.execute({ phase: 1 }, exec);
    // the marker from lib/_shared.js must be surfaced verbatim through the stop
    assert.ok(res.includes(CK_MARKER), "the GSD_AWAITING_HUMAN marker must reach the report byte-identical");
    assert.match(res, /01-auth-01/, "the cause must name the checkpointed plan");
    assert.match(res, /answer\/decision_id/, "the cause must hand off to the gsd_execute resume channel");
    assert.equal(countDelegates("gsd_plan"), 1);
    assert.equal(countDelegates("gsd_execute"), 1, "no blind re-run of the checkpointed round");
    assert.equal(countDelegates("gsd_verify"), 0, "verify must not run for a round stopped at execute");
  });

  test("budget exhaustion: exactly 2 rounds then stop with the exhausted-budget cause (D-07/V8)", async () => {
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    verifyWrites = ["gaps_found", "gaps_found"];
    const res = await repairTool.execute({ phase: 1 }, exec);
    assert.match(res, /repair budget exhausted/);
    assert.match(res, /Final verification status: gaps_found/);
    assert.match(res, /VERIFICATION\.md/, "the stop must name where the remaining gaps are listed");
    assert.equal(countDelegates("gsd_plan"), 2, "a third round must never start");
    assert.equal(countDelegates("gsd_execute"), 2);
    assert.equal(countDelegates("gsd_verify"), 2);
  });

  test("recovery on round 2 + REPAIR.md accumulation across rounds and invocations (D-10/V8/V9)", async () => {
    // ── invocation 1: gaps → round 1 gaps_found → round 2 passed (recovered)
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    verifyWrites = ["gaps_found", "passed"];
    const res = await repairTool.execute({ phase: 1 }, exec);
    assert.match(res, /RECOVERED/);
    assert.match(res, /Rounds run: 2/);
    const ver = await svc.readArtifact(CWD, 1, "VERIFICATION");
    assert.match(ver, /status: passed/, "the final VERIFICATION artefact on FakeFs must be passed");

    // REPAIR.md after the recovery run: frontmatter + one section per round
    const repair1 = await svc.readArtifact(CWD, 1, "REPAIR");
    const fm1 = parseFrontmatter(repair1).frontmatter;
    assert.equal(fm1.rounds_run, 2);
    assert.equal(fm1.final_status, "passed");
    const body1 = parseFrontmatter(repair1).body;
    assert.match(body1, /## Round 1/);
    assert.match(body1, /## Round 2/);
    assert.match(body1, /resulting verify status: gaps_found/, "Round 1 must name its resulting status");
    assert.match(body1, /resulting verify status: passed/, "Round 2 must name its resulting status");
    assert.match(body1, /gaps: true/, "each round section must name the delegated actions");
    assert.match(body1, /gapsOnly: true/);

    // ── invocation 2: seed gaps again, one round recovers — the log APPENDS
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    verifyWrites = ["passed"];
    const res2 = await repairTool.execute({ phase: 1 }, exec);
    assert.match(res2, /RECOVERED/);
    const repair2 = await svc.readArtifact(CWD, 1, "REPAIR");
    const body2 = parseFrontmatter(repair2).body;
    assert.equal(parseFrontmatter(repair2).frontmatter.final_status, "passed");
    assert.equal((body2.match(/## Round 1/g) || []).length, 2,
      "the first invocation's Round 1 section must survive (append, never truncate)");
    assert.match(body2, /## Round 2/, "the first invocation's Round 2 section must survive too");
    assert.equal((body2.match(/## Round \d/g) || []).length, 3,
      "exactly three round sections after two invocations (2 + 1)");
  });

  test("STATE immobility: no-op, stop-with-cause, and fail-loud delegate exits never touch STATE (D-01/V14)", async () => {
    const stateFm = async () => JSON.stringify((await svc.readState(CWD)).frontmatter);
    // (a) passed no-op
    const before1 = await stateFm();
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED);
    await repairTool.execute({ phase: 1 }, exec);
    assert.equal(await stateFm(), before1, "the no-op exit must not touch STATE");
    // (b) stop-with-cause (human_needed gate stop writes REPAIR.md + commits — no STATE write)
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    const before2 = await stateFm();
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_HUMAN);
    await repairTool.execute({ phase: 1 }, exec);
    assert.equal(await stateFm(), before2, "the gate-stop exit must not touch STATE");
    // (c) a ctx whose tools contain ONLY gsd_repair: fail-loud delegate error, not a STATE write
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    const before3 = await stateFm();
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);
    const saved = repairCtx.tools;
    repairCtx.tools = [repairTool];
    await assert.rejects(() => repairTool.execute({ phase: 1 }, exec), /gsd_plan tool not registered/);
    repairCtx.tools = saved;
    assert.equal(await stateFm(), before3, "the fail-loud delegate exit must not touch STATE");
  });
});

// ── no-fork / no-STATE / no-raw-fs / commit-scope static wiring (V4/V10 — D-01/D-08/D-10/D-12) ──
describe("gsd_repair wiring statics via source assertions (V4/V10 — D-01/D-08/D-10/D-12/DUR-06)", () => {
  const readRepairSrc = () => readFile(new URL("../lib/repair.js", import.meta.url), "utf8");

  test("imports commitArtifacts from ./_git-artifacts.js and uses scope \"repair\" exactly once (V10/D-10)", async () => {
    const src = await readRepairSrc();
    assert.match(src, /import\s*\{\s*commitArtifacts\s*\}\s*from\s*["']\.\/_git-artifacts\.js["']/,
      "repair must ride the shared commitArtifacts seam");
    assert.equal((src.match(/scope: "repair"/g) || []).length, 1,
      'scope: "repair" must appear exactly once (the single commit site)');
  });

  test("delegates, never forks the agent prompts (V4/D-08)", async () => {
    const src = await readRepairSrc();
    assert.doesNotMatch(src, /PLANNER_PROMPT|EXECUTOR_PROMPT|VERIFIER_PROMPT/,
      "repair must not duplicate any delegated tool's subagent prompt");
  });

  test("no inline git logic — the fixed-argument-array discipline stays in the shared seam (D-12)", async () => {
    const src = await readRepairSrc();
    assert.doesNotMatch(src, /promisify\(\s*execFile\s*\)/, "no promisify(execFile) inline");
    assert.doesNotMatch(src, /execFileSync\s*\(\s*["']git["']/, "no synchronous git shell-out");
    assert.doesNotMatch(src, /["']git["']\s*,\s*\[/, "no inline git CLI invocation");
  });

  test("artefact I/O via GsdState accessors; matchesGapClosure reused, never reimplemented (DUR-06/OQ-3)", async () => {
    const src = await readRepairSrc();
    assert.doesNotMatch(src, /node:fs\/promises/, "all .planning/ writes must route through GsdState");
    assert.doesNotMatch(src, /function matchesGapClosure/, "matchesGapClosure must be imported, not redefined");
  });

  test("one-way import direction: repair never imports autonomous (OQ-4)", async () => {
    const src = await readRepairSrc();
    assert.doesNotMatch(src, /from ["']\.\/autonomous\.js["']/, "autonomous imports repair, never the reverse");
  });

  test("repair never advances STATE itself (D-01/V14)", async () => {
    const src = await readRepairSrc();
    assert.doesNotMatch(src, /setActivePhase/, "repair must not call setActivePhase");
    assert.doesNotMatch(src, /completePhase/, "repair must not call completePhase");
    assert.doesNotMatch(src, /setStep\(/, "repair must not call setStep(");
  });
});

describe("gsd_repair full-surface integration through the REAL delegate tools (V15 — D-06/D-08)", () => {
  // Label-keyed fake subagents service for the REAL plan/execute/verify tools,
  // cloned from test/tools.test.mjs makeSubagents (labels: "plan research …",
  // "planner …", "plan-checker …", "execute <plan-id>", "verify phase N").
  // buildProject seeds no RESEARCH.md, so the real gsd_plan delegate spawns the
  // researcher on round 1 (lib/plan.js:116) and SKIPS it on round 2 (plan.js
  // persists RESEARCH.md after the researcher returns, lib/plan.js:132).
  let researchSpawns = 0;
  let plannerSpawns = 0;

  beforeEach(async () => {
    await resetHarness();
    verifyWrites = ["gaps_found", "passed"]; // two-round recovery sequence
    researchSpawns = 0;
    plannerSpawns = 0;
  });

  function makeIntegrationSubagents() {
    return {
      getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
      async start(_n, req) {
        const label = req.label;
        let text = "done";
        if (label.startsWith("plan research")) {
          researchSpawns += 1;
          text = "# RESEARCH\n\nAll research complete for the repair integration smoke.\n\n## Open Questions\n\n- none (RESOLVED)\n\nStandard.";
        } else if (label.startsWith("planner")) {
          // write the NEXT free <PP> fix plan (gap_closure: true) — round 1 → 01,
          // round 2 → 02, mirroring the real gap-closure planner (lib/plan.js:193).
          plannerSpawns += 1;
          const pp = String(plannerSpawns).padStart(2, "0");
          await fs.writeText({ targetKey: `${PHASE_DIR}/01-auth-${pp}-PLAN.md` }, FENCED_PLAN);
          text = "## PLANNING COMPLETE";
        } else if (label.startsWith("plan-checker")) {
          text = "## VERIFICATION PASSED";
        } else if (label.startsWith("execute")) {
          const pp = String(label.split(" ")[1] || "01-auth-01").split("-").pop();
          await fs.writeText({ targetKey: `${PHASE_DIR}/01-auth-${pp}-SUMMARY.md` }, FENCED_SUMMARY);
          text = "executor done";
        } else if (label.startsWith("verify")) {
          const status = verifyWrites.shift() ?? "gaps_found";
          await fs.writeText({ targetKey: VERIFICATION_FILE }, status === "passed" ? VERIFICATION_PASSED : VERIFICATION_GAPS);
          text = `status: ${status}`;
        }
        return { result: { output: [{ type: "text", text }], stopReason: "completed", structured: undefined }, dispose: () => {} };
      },
    };
  }

  test("seeded gaps → two rounds → status passed end-to-end with the real plan/execute/verify tools (V15)", async () => {
    // the REAL gsd_plan stops with its no-CONTEXT guard otherwise (lib/plan.js:94-96)
    await svc.writeArtifact(CWD, 1, "CONTEXT", "# ctx");
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS);

    const c = {
      fs,
      get: (n) => (n === "gsdState" ? svc : n === "subagents" ? makeIntegrationSubagents() : undefined),
      provide() {},
      effect: () => () => {},
    };
    const tools = [];
    c.tools = { register: (t) => tools.push(t) };
    applyPlan(c, {});
    applyExecute(c, {});
    applyVerify(c, {});
    applyRepair(c, {});
    const tool = tools.find((t) => t && t.name === "gsd_repair");
    assert.ok(tool, "gsd_repair must be registered");
    c.tools = tools; // REAL gsd_plan/gsd_execute/gsd_verify + gsd_repair (array shape)

    const res = await tool.execute({ phase: 1 }, exec);
    assert.match(res, /RECOVERED/, "the report must signal recovery through the real machinery");
    assert.match(res, /Rounds run: 2/);

    // all three delegate tools really ran and produced their artefacts
    assert(fs.files.has(`${PHASE_DIR}/01-auth-01-PLAN.md`), "round 1 fix plan must exist");
    assert.match(fs.files.get(`${PHASE_DIR}/01-auth-01-PLAN.md`), /gap_closure: true/);
    assert(fs.files.has(`${PHASE_DIR}/01-auth-01-SUMMARY.md`), "round 1 fix plan must have executed");
    assert(fs.files.has(`${PHASE_DIR}/01-auth-02-PLAN.md`), "round 2 fix plan must exist");
    assert(fs.files.has(`${PHASE_DIR}/01-auth-02-SUMMARY.md`), "round 2 fix plan must have executed");

    // the final VERIFICATION artefact on FakeFs is passed (written by the real verify)
    const ver = await svc.readArtifact(CWD, 1, "VERIFICATION");
    assert.match(ver, /status: passed/);

    // REPAIR.md records the recovery
    const repair = await svc.readArtifact(CWD, 1, "REPAIR");
    const { frontmatter: fm, body } = parseFrontmatter(repair);
    assert.equal(fm.final_status, "passed");
    assert.equal(fm.rounds_run, 2);
    assert.match(body, /## Round 2/);

    // round 2 skipped the researcher (RESEARCH.md persisted by round 1 — OQ-9)
    assert.equal(researchSpawns, 1, "the researcher must spawn exactly once across both rounds");

    // delegated tools own every STATE transition: verify(passed) advanced to ship
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "ship");
    assert.equal(String(st.frontmatter.active_phase), "1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite-level coverage map (for gap-analysis cross-reference).
// Decisions → tests:
//   D-01 (action, never advances STATE)  → "STATE immobility…" test + "never advances STATE" static
//   D-02 (verify route text)             → plan-02 surface; not asserted here
//   D-03 (rounds domain, default 2)      → "rounds validation…" + REPAIR_ROUND_BUDGET === 2 + budget-exhaustion default
//   D-04 (gaps_found-only trigger)       → human_needed / missing-file / unparseable / distinctness tests (zero delegates)
//   D-05 (passed no-op)                  → "no-op on passed…" test
//   D-06 (strict round order)            → "single-round happy path…" args/order assertions + integration test
//   D-07 (budget cap)                    → "budget exhaustion…" + "recovery on round 2…" tests
//   D-08 (delegate, never fork)          → "delegates, never forks…" static + integration through the REAL tools
//   D-10 (REPAIR.md + scope-repair commit) → "recovery on round 2 + REPAIR.md accumulation…" + commitArtifacts/scope statics
//   D-11 (stop-with-cause, no blind retry)→ no-fix-plan / checkpoint-marker tests (exact delegate counts)
//   D-12 (no new deps, arg-array git)    → "no inline git logic…" static
// RESEARCH V-numbers → tests:
//   V1 gate tests · V2 rounds tests · V3 order test · V4 fork static · V5 missing-delegate test
//   V6 no-fix-plan test · V7 checkpoint/marker test · V8 budget+recovery tests · V9 accumulation test
//   V10 commit statics · V13 mount counts (test/mount.test.mjs, plan 01) · V14 STATE immobility · V15 integration test
// ─────────────────────────────────────────────────────────────────────────────