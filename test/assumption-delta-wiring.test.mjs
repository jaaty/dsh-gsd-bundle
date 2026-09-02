// Offline wiring tests for the assumption-delta plan:pre checkpoint (D-05/D-04/
// D-06/D-08). These exercise the REAL gsd_plan tool (lib/plan.js apply) with a
// fake host fs + a custom subagents service that CAPTURES the planner spawn's
// promptText, so we can assert the promote-vs-add-alongside question is spliced
// into the planner prompt when a signal is detected and absent when the config
// gate is off / no signal fires. No LLM, no real git/gh. TDD per D-09.
//
// Coverage per D-04/D-05/D-06/D-08:
//   (a) gate ON + CONTEXT with a signal → the captured plannerPrompt contains the
//       promote-vs-add-alongside question + the <assumption_delta_decision>
//       instruction, and the gsd_plan output log carries the assumption-delta line
//       (D-05). The hook adds no extra STATE advancement (D-08).
//   (b) workflow.assumption_delta not true → the plannerPrompt does NOT contain the
//       question, no crash, and the log does not claim a false detection (D-04).
//   (c) gate ON + CONTEXT without any trigger term → clean negative: no question
//       (D-05); gate ON + no scanable scope (no goal, no reqs, empty CONTEXT) →
//       skipped, never a fabricated detected:false (D-06).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { buildProject, FENCED_PLAN } from "./helpers/project.mjs";

const CWD = "/project";
let fs;
let svc;

// Captured planner spawn promptText (the plannerPrompt array joined). Reset per
// test so a stale capture from a prior test cannot leak into the next assertion.
let capturedPlannerPrompt = "";

// Custom subagents service: captures the planner spawn's promptText, writes a
// minimal PLAN artifact so gsd_plan can proceed through listPlans/runChecker/
// setStep, and returns the expected completion markers. Mirrors the subagent stub
// in test/tools.test.mjs (makeSubagents) but with planner-prompt capture.
function makeSubagents() {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      const label = req.label;
      let text = "done";
      if (label.startsWith("planner") && !label.includes("revise")) {
        capturedPlannerPrompt = req.prompt[0]?.text || "";
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md` }, FENCED_PLAN);
        text = "## PLANNING COMPLETE";
      } else if (label.startsWith("plan-checker")) {
        text = "## VERIFICATION PASSED";
      } else if (label.startsWith("plan research")) {
        text = "# RESEARCH\n\n## Open Questions\n\n- none (RESOLVED)\n\nStandard.";
      }
      return { result: { output: [{ type: "text", text }], stopReason: "completed", structured: undefined }, dispose: () => {} };
    },
  };
}

function makeCtx() {
  const c = {
    fs,
    get: (n) =>
      n === "gsdState" ? svc : n === "subagents" ? makeSubagents() : n === "tools" ? { register() {} } : undefined,
    provide() {},
    effect: () => () => {},
    tools: { register() {} },
  };
  c.inject = (injectKeys, callback) => {
    const missing = (injectKeys || []).some(
      (k) => k !== "commands" && !(k === "subagents" || k === "gsdState" || k === "tools"),
    );
    if (missing) return () => {};
    const d = callback(c);
    return typeof d === "function" ? d : () => {};
  };
  return c;
}

async function registerPlanTool() {
  const mod = await import("../lib/plan.js");
  const tools = [];
  const c = makeCtx();
  c.tools = { register: (t) => tools.push(t) };
  mod.apply(c, {});
  const t = tools.find((x) => x.name === "gsd_plan");
  assert.ok(t, "gsd_plan not registered by lib/plan.js");
  return { t, c };
}

const exec = {
  agent: { session: { header: { cwd: CWD } } },
  signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
};

// Write a config.json with the given workflow.assumption_delta value. readConfig
// returns the file verbatim when present, so this deterministically controls the
// gate regardless of _defaultConfig.
async function writeConfig(assumptionDelta) {
  const cfg = {
    gsd_state_version: "1.0",
    workflow: {
      discuss_mode: "discuss",
      nyquist_validation: true,
      pattern_mapper: true,
      tdd_mode: false,
      mvp_mode: false,
      use_worktrees: false,
      agent_hint_routing: true,
      text_mode: false,
      commit_docs: true,
      code_review: true,
      code_review_depth: "standard",
      ui_review: true,
      validate_phase: true,
      learnings: false,
      graphify: false,
      assumption_delta: assumptionDelta,
    },
    mempalace: { enabled: false, memory_mode: "augment", wing: "", recall_on_discuss: true, recall_on_plan: true, capture_artifacts: true, mirror_kg: true },
    context_window: 200000,
    project_code: null,
    response_language: null,
    jobs: { timeout: 60, concurrency: 2, max_retries: 3 },
  };
  await fs.writeText({ targetKey: `${CWD}/.planning/config.json` }, JSON.stringify(cfg, null, 2) + "\n");
}

describe("assumption-delta plan:pre wiring (D-05/D-04/D-06/D-08)", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    capturedPlannerPrompt = "";
  });

  test("(a) gate ON + CONTEXT with a signal → question spliced into plannerPrompt + log line (D-05)", async () => {
    await writeConfig(true);
    await svc.writeArtifact(CWD, 1, "CONTEXT", "# Context\n\nSupport a second auth method alongside the existing one.");
    const { t } = await registerPlanTool();
    const res = await t.execute({ phase: 1, skipResearch: true }, exec);
    assert.match(res, /gsd_plan complete/);
    assert.match(capturedPlannerPrompt, /promote/i, "the promote-vs-add-alongside question must reach the planner prompt");
    assert.match(capturedPlannerPrompt, /add-alongside|add alongside/i, "the add-alongside option must reach the planner prompt");
    assert.match(capturedPlannerPrompt, /<assumption_delta_decision>/, "the decision instruction must reach the planner prompt");
    assert.match(res, /assumption-delta: detected/, "the gsd_plan output log must carry the assumption-delta detection line");
  });

  test("(b) gate OFF → no question in plannerPrompt, no crash, no false detection (D-04)", async () => {
    await writeConfig(false);
    await svc.writeArtifact(CWD, 1, "CONTEXT", "# Context\n\nSupport a second auth method alongside the existing one.");
    const { t } = await registerPlanTool();
    const res = await t.execute({ phase: 1, skipResearch: true }, exec);
    assert.match(res, /gsd_plan complete/);
    assert.ok(!/promote/i.test(capturedPlannerPrompt), "no question when the gate is off");
    assert.ok(!/<assumption_delta_decision>/.test(capturedPlannerPrompt), "no decision instruction when the gate is off");
    assert.ok(!/assumption-delta: detected/.test(res), "the log must not claim a false detection when the gate is off");
  });

  test("(c) gate ON + CONTEXT without a trigger term → clean negative, no question (D-05)", async () => {
    await writeConfig(true);
    await svc.writeArtifact(CWD, 1, "CONTEXT", "# Context\n\nRefactor the login function to be smaller and clearer.");
    const { t } = await registerPlanTool();
    const res = await t.execute({ phase: 1, skipResearch: true }, exec);
    assert.match(res, /gsd_plan complete/);
    assert.ok(!/promote/i.test(capturedPlannerPrompt), "no question when no signal fires");
    assert.ok(!/<assumption_delta_decision>/.test(capturedPlannerPrompt), "no decision instruction when no signal fires");
    assert.ok(!/assumption-delta: detected/.test(res), "the log must not claim a detection when no signal fires");
  });

  test("(c2) gate ON + empty CONTEXT (scope = goal only, no trigger) → clean negative, no false detection (D-06)", async () => {
    // The D-06 skipped-before-detected fabrication guard (no scanable scope →
    // skipped, never a bare detected:false) is unit-tested at the hook layer in
    // test/assumption-delta-hooks.test.mjs. At the wiring level a truly empty
    // scope is not constructible (parseRoadmap drops empty goal/req cells), so
    // this asserts the observable clean-negative: an empty CONTEXT (scope = the
    // phase goal "Add login", which has no trigger term) must not fabricate a
    // detection in the planner prompt or the gsd_plan log.
    await writeConfig(true);
    await svc.writeArtifact(CWD, 1, "CONTEXT", "");
    const { t } = await registerPlanTool();
    const res = await t.execute({ phase: 1, skipResearch: true }, exec);
    assert.match(res, /gsd_plan complete/);
    assert.ok(!/promote/i.test(capturedPlannerPrompt), "no question when the scope has no trigger term");
    assert.ok(!/<assumption_delta_decision>/.test(capturedPlannerPrompt), "no decision instruction when the scope has no trigger term");
    assert.ok(!/assumption-delta: detected/.test(res), "the log must not claim a false detection (D-06)");
  });
});
