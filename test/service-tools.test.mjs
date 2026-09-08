// MOUNT-04 proof: execute() smoke calls for the 5 gsd_* phase tools that had no
// existing execute test (gsd_new_milestone, gsd_progress, gsd_quick, gsd_ui_phase,
// gsd_verify) plus the gsd_ship fail-loud preflight guard. Reuses the
// registerTool/makeCtx/makeSubagents pattern from tools.test.mjs (D-04) with
// added canned handlers for ui-researcher, ui-checker, and quick labels.
// Offline on FakeFs/fake-ctx throughout — gsd_quick included, now that its
// TASK.md write routes through ctx.fs via GsdState.writeQuickRecord (DUR-06).

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { buildProject, FENCED_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED, VERIFICATION_GAPS } from "./helpers/project.mjs";

const CWD = "/project";
let fs;
let svc;
let ctx;

const exec = {
  agent: { session: { header: { cwd: CWD } } },
  signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
};

// Fake subagents service — mirrors tools.test.mjs's makeSubagents but adds the
// three new canned branches required by the gap tools (ui-researcher,
// ui-checker, quick) per the RESEARCH fake-subagent coverage gap. Writes canned
// artefacts directly to the shared FakeFs and returns a settled result.
function makeSubagents() {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      const label = req.label;
      let text = "done";
      if (label.startsWith("planner") && !label.includes("revise")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md` }, FENCED_PLAN);
        text = "## PLANNING COMPLETE";
      } else if (label.startsWith("plan-checker")) {
        text = "## VERIFICATION PASSED";
      } else if (label.startsWith("execute")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md` }, FENCED_SUMMARY);
        text = "executor done";
      } else if (label.startsWith("verify")) {
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md` }, VERIFICATION_PASSED);
        text = "status: passed, score: 2/2";
      } else if (label.startsWith("plan research")) {
        text = "# RESEARCH\n\n## Open Questions\n\n- none (RESOLVED)\n\nStandard.";
      } else if (label.startsWith("map-codebase")) {
        const focus = label.split(/\s+/)[1] || "tech";
        const docsByFocus = {
          tech: ["STACK", "INTEGRATIONS"],
          arch: ["ARCHITECTURE", "STRUCTURE"],
          quality: ["CONVENTIONS", "TESTING"],
          concerns: ["CONCERNS"],
          "tech+arch": ["STACK", "INTEGRATIONS", "ARCHITECTURE", "STRUCTURE"],
        };
        for (const d of docsByFocus[focus] || []) {
          const lines = [`# ${d}`, "", `**Analysis Date:** 2026-08-22`, ""];
          while (lines.length < 24) lines.push(`- ${d} finding ${lines.length}.`);
          lines.push("", `*${d} analysis: 2026-08-22*`);
          await fs.writeText({ targetKey: `${CWD}/.planning/codebase/${d}.md` }, lines.join("\n"));
        }
        text = `## Mapping Complete\n**Focus:** ${focus}\nDocuments written.`;
      } else if (label.startsWith("ui-researcher")) {
        // >=50 chars so gsd_ui_phase does not short-circuit (lib/ui.js:50).
        text = "# UI-SPEC\n\n## Layout\n\nA two-pane editor: a sidebar listing phases and a main canvas with the phase artefacts. Toolbar at top with action buttons. Status bar at bottom.";
      } else if (label.startsWith("ui-checker")) {
        // contains "VERIFICATION PASSED" so the passed branch is taken (lib/ui.js:61-62).
        text = "## VERIFICATION PASSED\nThe UI-SPEC is complete and unambiguous.";
      } else if (label.startsWith("fast")) {
        // Happy-path branch for gsd_fast_mode (D-04/D-08): the single fresh-context
        // executor writes the phase SUMMARY to the artefact base path on FakeFs,
        // which gsd_fast_mode reads back via readArtifact (D-05).
        await fs.writeText({ targetKey: `${CWD}/.planning/phases/01-auth/01-auth-SUMMARY.md` }, FENCED_SUMMARY);
        text = "fast executor done";
      } else if (label.startsWith("quick boom")) {
        // Failure-isolation branch for gsd_quick_batch: a task whose slug is
        // "boom" fails at spawn so the batch records it and continues (D-04/D-09).
        throw new Error("boom subagent failed");
      } else if (label.startsWith("quick")) {
        // gsd_quick records r.output (lib/quick.js:53).
        text = "quick subagent finished the task";
      }
      return { result: { output: [{ type: "text", text }], stopReason: "completed" }, dispose: () => {} };
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
  // DEGR-07 (D-05): core-tools wraps gsd_job in a ctx.inject(['subagents'])
  // sub-fiber. This fake ctx always provides subagents via get, so the sub-fiber
  // activates (mirrors the mount harness's ctx.inject).
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

async function registerTool(pluginFile, toolName) {
  const mod = await import(`../lib/${pluginFile}.js`);
  const tools = [];
  const c = makeCtx();
  c.tools = { register: (t) => tools.push(t) };
  mod.apply(c, {});
  const t = tools.find((x) => x.name === toolName);
  assert.ok(t, `${toolName} not registered by ${pluginFile}`);
  return { t, c };
}

// Register the gsd_fast_mode tool from lib/quick.js, keeping the ctx (c) so the
// test can reassign c.tools to a gsd_ship spy (array or service shape) for the
// ship-delegation assertion (D-06). Mirrors registerTool but returns the ctx.
async function registerFastTool() {
  const mod = await import("../lib/quick.js");
  const tools = [];
  const c = makeCtx();
  c.tools = { register: (t) => tools.push(t) };
  mod.apply(c, {});
  const t = tools.find((x) => x.name === "gsd_fast_mode");
  assert.ok(t, "gsd_fast_mode not registered by quick");
  return { t, c };
}

// Register the gsd_mvp_phase tool from lib/quick.js, keeping the ctx (c) so the
// test can reassign c.tools to a delegation spy (array or service shape) for the
// propose-then-confirm + delegation-order assertions (D-03/D-05). Mirrors
// registerFastTool but finds "gsd_mvp_phase".
async function registerMvpTool() {
  const mod = await import("../lib/quick.js");
  const tools = [];
  const c = makeCtx();
  c.tools = { register: (t) => tools.push(t) };
  mod.apply(c, {});
  const t = tools.find((x) => x.name === "gsd_mvp_phase");
  assert.ok(t, "gsd_mvp_phase not registered by quick");
  return { t, c };
}

// Register the real quick, plan, execute, and verify plugins on one ctx so the
// real-chain test drives gsd_mvp_phase -> gsd_plan -> gsd_execute -> gsd_verify
// with the actual tools (D-04/D-05). Returns the ctx (c) and the collected tools
// so the test can swap in a gsd_ship spy.
async function registerMvpChain() {
  const tools = [];
  const c = makeCtx();
  c.tools = { register: (t) => tools.push(t) };
  for (const f of ["quick", "plan", "execute", "verify"]) {
    const mod = await import(`../lib/${f}.js`);
    mod.apply(c, {});
  }
  const t = tools.find((x) => x.name === "gsd_mvp_phase");
  assert.ok(t, "gsd_mvp_phase not registered");
  return { t, c, tools };
}

describe("gsd_new_milestone", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("appends phases and updates STATE milestone", async () => {
    const { t } = await registerTool("core-tools", "gsd_new_milestone");
    const res = await t.execute(
      {
        milestoneName: "M2",
        version: "v2.0",
        phases: [{ name: "ship", goal: "Ship it", requirements: ["AUTH-02"] }],
        requirements: [{ id: "AUTH-02", text: "logout" }],
      },
      exec,
    );
    assert.match(res, /New milestone/);
    const rm = await svc.readRoadmap(CWD);
    assert.equal(rm.phases.length, 2);
    assert.equal(rm.phases[1].n, 2);
    assert.equal(rm.milestoneName, "M2");
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.milestone, "v2.0");
  });
});

describe("gsd_progress", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("renders progress without throwing", async () => {
    const { t } = await registerTool("core-tools", "gsd_progress");
    const res = await t.execute({}, exec);
    assert.match(res, /# GSD PROGRESS/);
    assert.match(res, /Phase 01 auth/);
  });

  test("phase-scoped progress lists plan waves", async () => {
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    const { t } = await registerTool("core-tools", "gsd_progress");
    const res = await t.execute({ phase: 1 }, exec);
    assert.match(res, /Phase 1 plans/);
  });
});

describe("gsd_ui_phase", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("writes UI-SPEC and advances STATE to plan", async () => {
    const { t } = await registerTool("ui", "gsd_ui_phase");
    const res = await t.execute({ phase: 1, notes: "two-pane editor" }, exec);
    assert.match(res, /gsd_ui_phase complete/);
    assert.match(res, /VERIFICATION PASSED/);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-UI-SPEC.md`));
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "plan");
  });
});

describe("gsd_verify", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("writes VERIFICATION status:passed and advances STATE to ship", async () => {
    // gsd_verify returns early if no plans or any plan lacks a SUMMARY (R4).
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.markPlanSummary(CWD, 1, 1, FENCED_SUMMARY);
    const { t } = await registerTool("verify", "gsd_verify");
    const res = await t.execute({ phase: 1 }, exec);
    assert.match(res, /Phase 1 verified/);
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`));
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.status, "ship");
  });
});

// gsd_quick routes its TASK.md write through GsdState.writeQuickRecord → ctx.fs
// (lib/quick.js), so its happy path now runs on pure FakeFs at cwd=/project —
// proving the raw-fs bypass (OQ-1) is gone (DUR-06).
describe("gsd_quick", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("records the task entry through ctx.fs on FakeFs", async () => {
    const { t } = await registerTool("quick", "gsd_quick");
    const res = await t.execute({ task: "fix the typo in README", slug: "fix-typo" }, exec);
    assert.match(res, /gsd_quick done/);

    // TASK.md lands on the FakeFs file map at .planning/quick/<date>-<slug>/TASK.md.
    const key = [...fs.files.keys()].find((k) => k.includes("/.planning/quick/") && k.endsWith("/TASK.md"));
    assert.ok(key, "quick TASK.md not written to FakeFs");
    assert.match(key, /\/.planning\/quick\/\d{4}-\d{2}-\d{2}-fix-typo\/TASK\.md$/);
    const entry = fs.files.get(key);
    assert.match(entry, /# Quick task/);
    assert.match(entry, /fix the typo in README/);
  });
});

// gsd_quick_batch (phase 55, D-01..D-09): runs multiple quick tasks in one
// batch, sequentially, each with its own subagent, TASK.md record, and atomic
// commit. Proves the happy path, failure isolation, slug-collision dedup, and
// the structured { results, summary } return — all offline on FakeFs.
describe("gsd_quick_batch", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  const quickTaskFiles = () =>
    [...fs.files.keys()].filter((k) => k.includes("/.planning/quick/") && k.endsWith("/TASK.md"));

  test("runs multiple tasks sequentially with per-task records and a structured result", async () => {
    const { t } = await registerTool("quick", "gsd_quick_batch");
    const res = await t.execute(
      { tasks: [{ task: "fix typo A", slug: "fix-a" }, { task: "fix typo B", slug: "fix-b" }] },
      exec,
    );

    assert.equal(res.summary.total, 2);
    assert.equal(res.summary.done, 2);
    assert.equal(res.summary.failed, 0);
    assert.equal(res.results.length, 2);
    assert.equal(res.results[0].status, "done");
    assert.equal(res.results[0].slug, "fix-a");
    assert.equal(res.results[1].slug, "fix-b");

    const files = quickTaskFiles();
    assert.equal(files.length, 2, "expected exactly two quick TASK.md records");
    assert.ok(files.some((k) => k.endsWith("-fix-a/TASK.md")), "missing -fix-a/TASK.md");
    assert.ok(files.some((k) => k.endsWith("-fix-b/TASK.md")), "missing -fix-b/TASK.md");
    for (const k of files) assert.match(fs.files.get(k), /# Quick task/);
  });

  test("failure isolation: a failing task is recorded and the batch continues", async () => {
    const { t } = await registerTool("quick", "gsd_quick_batch");
    const res = await t.execute(
      { tasks: [{ task: "good one", slug: "good" }, { task: "bad one", slug: "boom" }, { task: "good two", slug: "good2" }] },
      exec,
    );

    assert.equal(res.summary.total, 3);
    assert.equal(res.summary.done, 2);
    assert.equal(res.summary.failed, 1);
    assert.equal(res.results[1].status, "failed");
    assert.match(res.results[1].error, /boom subagent failed/);

    const boom = quickTaskFiles().find((k) => k.endsWith("-boom/TASK.md"));
    assert.ok(boom, "missing -boom/TASK.md failure record");
    assert.match(fs.files.get(boom), /## Error/);
  });

  test("slug collision dedup appends a numeric suffix", async () => {
    const { t } = await registerTool("quick", "gsd_quick_batch");
    const res = await t.execute(
      { tasks: [{ task: "first", slug: "same" }, { task: "second", slug: "same" }] },
      exec,
    );

    assert.equal(res.results[0].slug, "same");
    assert.equal(res.results[1].slug, "same-2");

    const files = quickTaskFiles();
    assert.equal(files.length, 2, "expected two distinct records after slug dedup");
    assert.ok(files.some((k) => k.endsWith("-same/TASK.md")), "missing -same/TASK.md");
    assert.ok(files.some((k) => k.endsWith("-same-2/TASK.md")), "missing -same-2/TASK.md");
  });

  test("returns a structured object, not a string", async () => {
    const { t } = await registerTool("quick", "gsd_quick_batch");
    const res = await t.execute({ tasks: [{ task: "one", slug: "one" }] }, exec);
    assert.equal(typeof res, "object");
    assert.ok(Array.isArray(res.results));
    assert.equal(typeof res.summary, "object");
  });
});

// gsd_fast_mode (phase 56, D-01..D-08): lightweight single-pass fast path for a
// SIMPLE phase — auto-CONTEXT (fast marker) -> one fresh-context executor ->
// SUMMARY -> lightweight verify (minimal VERIFICATION, status: passed) -> full
// ship via gsd_ship. Proves the happy path, the refuse-already-Complete guard,
// and fail-fast on executor failure — all offline on FakeFs. The ship path
// itself is not driven (per the removal-test convention); the tests assert
// gsd_fast_mode INVOKES gsd_ship via a stubbed ctx.tools spy (array + service
// get() shapes).
describe("gsd_fast_mode", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("single-pass: auto-CONTEXT, SUMMARY, VERIFICATION, and ship delegation", async () => {
    const { t, c } = await registerFastTool();
    const shipCalls = [];
    c.tools = [
      { name: "gsd_ship", execute: async (args) => { shipCalls.push(args); return "PR created: http://x/pull/1"; } },
    ];
    const res = await t.execute({ phase: 1 }, exec);

    assert.match(res, /gsd_fast_mode complete/);
    assert.equal(shipCalls.length, 1, "gsd_ship should be invoked exactly once");
    assert.equal(shipCalls[0].phase, 1);

    // D-03: auto-CONTEXT written with the fast-path marker.
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`));
    const ctxText = fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`);
    assert.ok(ctxText.includes("Auto-generated (discuss skipped — fast path)"), "CONTEXT missing fast-path marker");

    // D-04/D-08: executor wrote the SUMMARY to the artefact base path.
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-SUMMARY.md`));
    assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-SUMMARY.md`), /status: complete/);

    // D-05: lightweight verify wrote a minimal VERIFICATION (status: passed).
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`));
    assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`), /status: passed/);
  });

  test("ship delegation works via the service ctx.tools.get branch (production shape)", async () => {
    const { t, c } = await registerFastTool();
    const shipCalls = [];
    c.tools = {
      get: (name) =>
        name === "gsd_ship"
          ? { execute: async (args) => { shipCalls.push(args); return "PR created: http://x/pull/1"; } }
          : undefined,
    };
    const res = await t.execute({ phase: 1 }, exec);

    assert.match(res, /gsd_fast_mode complete/);
    assert.equal(shipCalls.length, 1, "gsd_ship should be invoked exactly once");
    assert.equal(shipCalls[0].phase, 1);
  });

  test("refuses an already-Complete phase", async () => {
    const { t } = await registerFastTool();
    await svc.completePhase(CWD, 1); // marks phase 1 Complete in ROADMAP
    await assert.rejects(() => t.execute({ phase: 1 }, exec), /already Complete/);
    // No partial state change: the phase stays Complete.
    const rm = await svc.readRoadmap(CWD);
    assert.equal(rm.phases.find((p) => p.n === 1).status, "Complete");
  });

  test("fail-fast: a failing executor stops and leaves the phase uncompleted", async () => {
    const boomSubagents = {
      getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
      async start() {
        throw new Error("fast subagent failed");
      },
    };
    const c = makeCtx();
    const tools = [];
    c.tools = { register: (t) => tools.push(t) };
    c.get = (n) =>
      n === "gsdState" ? svc : n === "subagents" ? boomSubagents : n === "tools" ? c.tools : undefined;
    const mod = await import("../lib/quick.js");
    mod.apply(c, {});
    const t = tools.find((x) => x.name === "gsd_fast_mode");
    assert.ok(t, "gsd_fast_mode not registered");

    await assert.rejects(() => t.execute({ phase: 1 }, exec), /fast subagent failed/);
    // D-07: the phase is NOT marked Complete.
    const rm = await svc.readRoadmap(CWD);
    assert.notEqual(rm.phases.find((p) => p.n === 1).status, "Complete");
  });
});

// Phase 57 (D-01..D-07): the mvp-phase flow — interactive propose-then-confirm
// scoping (first call returns a GSD_AWAITING_HUMAN marker with the proposed
// slice; a confirm call drives the chain) -> a real PLAN.md via the normal
// gsd_plan path (D-04) -> delegation to the normal loop gsd_execute/gsd_verify/
// gsd_ship (D-05). Fail-fast (D-06): a throwing gsd_plan stops and leaves the
// phase uncompleted. The ship path itself is not driven (per the removal-test
// convention); the tests assert gsd_mvp_phase INVOKES gsd_ship via a stubbed
// ctx.tools spy.
describe("gsd_mvp_phase", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("propose-then-confirm: first call returns a GSD_AWAITING_HUMAN marker with the proposed slice", async () => {
    const { t } = await registerMvpTool();
    const res = await t.execute({ phase: 1 }, exec);

    assert.match(res, /GSD_AWAITING_HUMAN/);
    assert.match(res, /proposed minimal-viable slice/);
    assert.match(res, /decision_id="mvp-1"/);
    // D-03: the pending MVP-SCOPE proposal is written on the first call.
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-MVP-SCOPE.md`));
    assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-MVP-SCOPE.md`), /decision_id: mvp-1/);
    // No CONTEXT.md yet — scoping is not confirmed.
    assert.ok(!fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`));
  });

  test("confirm drives the delegation chain in order (plan -> execute -> verify -> ship)", async () => {
    const { t, c } = await registerMvpTool();
    const calls = [];
    c.tools = [
      { name: "gsd_plan", execute: async () => { calls.push("plan"); return "plan done"; } },
      { name: "gsd_execute", execute: async () => { calls.push("execute"); return "execute done"; } },
      { name: "gsd_verify", execute: async () => { calls.push("verify"); await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED); return "verify done"; } },
      { name: "gsd_ship", execute: async () => { calls.push("ship"); return "PR created: http://x/pull/1"; } },
    ];
    const res = await t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec);

    assert.match(res, /gsd_mvp_phase complete/);
    assert.deepEqual(calls, ["plan", "execute", "verify", "ship"]);
    // D-03: the confirmed CONTEXT is written before planning.
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`));
    assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`), /MVP scoping/);
  });

  test("a non-passed verification stops before ship (lightweight-verify heuristic)", async () => {
    const { t, c } = await registerMvpTool();
    const calls = [];
    c.tools = [
      { name: "gsd_plan", execute: async () => { calls.push("plan"); return "plan done"; } },
      { name: "gsd_execute", execute: async () => { calls.push("execute"); return "execute done"; } },
      // writes a NON-passed VERIFICATION (gaps_found) so the heuristic stops before ship.
      { name: "gsd_verify", execute: async () => { calls.push("verify"); await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_GAPS); return "verify done"; } },
      { name: "gsd_ship", execute: async () => { calls.push("ship"); return "PR created"; } },
    ];
    const res = await t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec);

    assert.match(res, /did not pass verification/);
    assert.deepEqual(calls, ["plan", "execute", "verify"]); // ship NOT invoked
  });

  test("real chain: gsd_plan -> gsd_execute -> gsd_verify produce PLAN/SUMMARY/VERIFICATION and gsd_ship is invoked", async () => {
    const { t, c, tools } = await registerMvpChain();
    const shipCalls = [];
    c.tools = [
      ...tools.filter((x) => x.name !== "gsd_ship"),
      { name: "gsd_ship", execute: async (a) => { shipCalls.push(a); return "PR created: http://x/pull/1"; } },
    ];
    const res = await t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec);

    assert.match(res, /gsd_mvp_phase complete/);
    assert.equal(shipCalls.length, 1, "gsd_ship should be invoked exactly once");
    assert.equal(shipCalls[0].phase, 1);
    // D-04/D-05: the real chain produced the artefacts on FakeFs.
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md`), "PLAN.md not produced by gsd_plan");
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-SUMMARY.md`), "SUMMARY.md not produced by gsd_execute");
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`), "VERIFICATION.md not produced by gsd_verify");
    assert.match(fs.files.get(`${CWD}/.planning/phases/01-auth/01-auth-VERIFICATION.md`), /status: passed/);
  });

  test("fail-fast: a throwing gsd_plan stops and leaves the phase uncompleted", async () => {
    const { t, c } = await registerMvpTool();
    c.tools = [
      { name: "gsd_plan", execute: async () => { throw new Error("planner failed"); } },
    ];
    await assert.rejects(() => t.execute({ phase: 1, confirm: "yes", decision_id: "mvp-1" }, exec), /planner failed/);
    // D-06: the phase is NOT marked Complete.
    const rm = await svc.readRoadmap(CWD);
    assert.notEqual(rm.phases.find((p) => p.n === 1).status, "Complete");
  });
});

describe("gsd_ship", () => {
  test("preflight fails loud on a non-repo cwd", async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
    // Seed a PASSED verification so gate 1 passes (lib/ship.js:56-59).
    await svc.writeArtifact(CWD, 1, "VERIFICATION", VERIFICATION_PASSED);
    const { t } = await registerTool("ship", "gsd_ship");
    // cwd "/project" does not exist on the real filesystem, so gitOk returns ""
    // and gate 3 fires "could not determine current branch" (lib/ship.js:68),
    // producing the /gsd_ship preflight failed:/ throw (D-03 fail-loud guard).
    await assert.rejects(() => t.execute({ phase: 1 }, exec), /gsd_ship preflight failed:/);
  });
});

// Phase 19 (CBQX-01): the codebase-map drift manifest round-trips through
// gsdState's artefact model (DUR-06 — write routes via _write → ctx.fs, never
// raw node:fs). Follows the existing gsdState codebase-doc fixture pattern:
// buildProject + FakeFs at CWD, service methods called via `svc`.
describe("gsdState codebase-map manifest", () => {
  beforeEach(async () => {
    fs = new FakeFs();
    svc = await buildProject(fs, CWD);
    ctx = makeCtx();
  });

  test("returns null before any write and for a corrupt payload", async () => {
    assert.equal(await svc.readCodebaseManifest(CWD), null);
    // corrupt JSON -> null (tolerant, never throws)
    fs.files.set(`${CWD}/.planning/codebase/.map-manifest.json`, "{ not valid json");
    assert.equal(await svc.readCodebaseManifest(CWD), null);
    // non-array JSON -> null
    fs.files.set(`${CWD}/.planning/codebase/.map-manifest.json`, JSON.stringify({ paths: [] }));
    assert.equal(await svc.readCodebaseManifest(CWD), null);
  });

  test("round-trips records through write -> read with no data loss", async () => {
    const records = [
      { path: "src/a.ts", size: 12, hash: "abc123" },
      { path: "src/b.ts", size: 8, hash: "def456" },
    ];
    await svc.writeCodebaseManifest(CWD, records);
    const read = await svc.readCodebaseManifest(CWD);
    assert.deepEqual(read, records);
    // manifest lands on FakeFs at the expected .planning artefact path
    assert.ok(fs.files.has(`${CWD}/.planning/codebase/.map-manifest.json`));
  });

  test("a second write overwrites the previous manifest", async () => {
    await svc.writeCodebaseManifest(CWD, [{ path: "a.ts", size: 1, hash: "h1" }]);
    await svc.writeCodebaseManifest(CWD, [{ path: "b.ts", size: 2, hash: "h2" }]);
    const read = await svc.readCodebaseManifest(CWD);
    assert.deepEqual(read, [{ path: "b.ts", size: 2, hash: "h2" }]);
  });
});