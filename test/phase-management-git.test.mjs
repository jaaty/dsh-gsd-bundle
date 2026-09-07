// Offline behavioural tests for the gsd_phase tool (lib/phase-management-plugin.js),
// TDD per D-10. Proves the full tool execute path against FakeFs + a fake gitFn:
// successful add/insert/remove/edit mutations write ROADMAP.md (phase table +
// ## Progress table) and recompute STATE progress (D-05), hard failures leave both
// files byte-identical (fail-closed, D-06), the --yes confirm guard is honoured
// (D-08), the dangling active_phase is cleared on active-phase removal, and
// commitArtifacts fires exactly once per successful mutation with phaseNum null.
//
// Offline only (D-10): FakeFs + fake-ctx + fake gitFn, no live boot, no real git.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyPhaseManagement } from "../lib/phase-management-plugin.js";

// ── harness ───────────────────────────────────────────────────────────────────
async function mountPhaseManagement() {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs);
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  applyPhaseManagement(ctx, {});
  return { fs, ctx };
}

// Bootstrap a .planning/ project with the given phases + requirements.
async function bootstrap(ctx, phases, requirements) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases },
    makeExec(),
  );
}

function runPhase(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_phase");
  assert.ok(t, "gsd_phase not registered");
  return t.execute(args, makeExec());
}

// A fake gitFn that records calls and simulates staging/committing.
function makeFakeGit() {
  const calls = [];
  const fakeGit = async (_cwd, args) => {
    calls.push([...args]);
    if (args[0] === "add") return "";
    if (args[0] === "diff" && args[1] === "--cached" && args[2] === "--name-only") {
      const lastAdd = [...calls].reverse().find((c) => c[0] === "add");
      return lastAdd ? lastAdd.slice(1).join("\n") : "";
    }
    if (args[0] === "commit") return "";
    return "";
  };
  return { calls, fakeGit };
}

// The canonical 3-phase fixture: p1 pending, p2 Complete, p3 pending.
const PHASES = [
  { name: "p1", goal: "do one", requirements: ["CLH-01"] },
  { name: "p2", goal: "do two", requirements: ["CLH-02"] },
  { name: "p3", goal: "do three", requirements: ["CLH-03"] },
];
const REQS = [
  { id: "CLH-01", text: "x" },
  { id: "CLH-02", text: "y" },
  { id: "CLH-03", text: "z" },
];

// Mark phase n Complete via the state service (mirrors gsd_validate/completePhase).
async function completePhase(ctx, n) {
  const gsdState = ctx.get("gsdState");
  await gsdState.completePhase(CWD, n);
}

describe("phase-management: capability + tool registration (D-01, DEGR-01)", () => {
  test("mounted plugin provides gsdPhaseManagement and registers gsd_phase", async () => {
    const { ctx } = await mountPhaseManagement();
    assert.ok(ctx.get("gsdPhaseManagement"), "gsdPhaseManagement capability not provided");
    const cap = ctx.get("gsdPhaseManagement");
    assert.equal(cap.role, "out-of-band");
    assert.equal(cap.order, -1, "gsdPhaseManagement must be NOT_LOOP_ORDERED");
    assert.deepEqual(cap.tools, ["gsd_phase"]);
    assert.deepEqual(cap.commands, ["gsd-phase-manage"]);
    const tool = ctx.tools.find((t) => t.name === "gsd_phase");
    assert.ok(tool, "gsd_phase tool not registered");
    assert.ok(tool.parameters.required.includes("action"), "action must be a required parameter");
  });

  test("env fail-fast (D-09): no project throws", async () => {
    const { ctx } = await mountPhaseManagement();
    await assert.rejects(
      runPhase(ctx, { action: "add", name: "p4", goal: "g", requirements: ["CLH-01"] }),
      /no .planning\/ project/,
    );
  });
});

describe("phase-management: successful mutations write ROADMAP + recompute STATE (D-05)", () => {
  test("add appends a phase row to the phase table AND the ## Progress table, and increments total_phases", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const before = await gsdState.readState(CWD);
    assert.equal(before.frontmatter.progress.total_phases, 3);

    const res = await runPhase(ctx, { action: "add", name: "p4", goal: "do four", requirements: ["CLH-01"] });
    assert.match(res, /Phase management add complete/);

    const roadmap = await gsdState.readRoadmap(CWD);
    assert.equal(roadmap.phases.length, 4, "add must append a 4th phase");
    const added = roadmap.phases[3];
    assert.equal(added.n, 4);
    assert.equal(added.name, "p4");
    assert.equal(added.status, "pending");

    // The raw ROADMAP text carries the new phase row in BOTH tables.
    const roadmapText = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    assert.match(roadmapText, /\| 04 \| p4 \| do four \| CLH-01 \|/, "phase table must contain the new row");
    assert.match(roadmapText, /\| 04 \| p4 \| pending \|/, "## Progress table must contain the new row");

    // STATE progress recomputed from the roadmap (D-05).
    const after = await gsdState.readState(CWD);
    assert.equal(after.frontmatter.progress.total_phases, 4);
    assert.equal(after.frontmatter.progress.completed_phases, 0);
    assert.equal(after.frontmatter.progress.percent, 0);

    // Exactly one atomic commit with phaseNum null + the phase-management message.
    const commits = git.calls.filter((c) => c[0] === "commit");
    assert.equal(commits.length, 1, "exactly one commit per successful mutation");
    assert.match(commits[0][2], /phase-management add via gsd_phase/);
  });

  test("insert at index 0 renumbers the following phase # to 02 in both tables", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    await runPhase(ctx, { action: "insert", at: 0, name: "p0", goal: "do zero", requirements: ["CLH-02"] });

    const roadmap = await gsdState.readRoadmap(CWD);
    assert.equal(roadmap.phases.length, 4);
    assert.equal(roadmap.phases[0].name, "p0", "inserted phase must land at index 0");
    assert.equal(roadmap.phases[0].n, 1, "inserted phase renumbers to 01");
    assert.equal(roadmap.phases[1].name, "p1", "original first phase shifts to index 1");
    assert.equal(roadmap.phases[1].n, 2, "original first phase renumbers to 02");

    const roadmapText = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    assert.match(roadmapText, /\| 01 \| p0 \| do zero \| CLH-02 \|/, "phase table must show p0 at 01");
    assert.match(roadmapText, /\| 02 \| p1 \| do one \| CLH-01 \|/, "phase table must show p1 renumbered to 02");
    assert.match(roadmapText, /\| 02 \| p1 \| pending \|/, "## Progress table must show p1 renumbered to 02");
  });

  test("remove of a pending non-active phase removes its rows from both tables and decrements total_phases", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    await runPhase(ctx, { action: "remove", n: 3 });

    const roadmap = await gsdState.readRoadmap(CWD);
    assert.equal(roadmap.phases.length, 2);
    assert.ok(!roadmap.phases.some((p) => p.name === "p3"), "p3 must be removed");

    const roadmapText = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    assert.ok(!roadmapText.includes("p3"), "p3 must be gone from the phase table");
    assert.ok(!roadmapText.includes("do three"), "p3 must be gone from the ## Progress table");

    const after = await gsdState.readState(CWD);
    assert.equal(after.frontmatter.progress.total_phases, 2);
  });

  test("edit toggles a pending phase to Complete and STATE.progress.completed_phases increments", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    await runPhase(ctx, { action: "edit", n: 1, status: "Complete" });

    const roadmap = await gsdState.readRoadmap(CWD);
    assert.equal(roadmap.phases[0].status, "Complete", "edit must toggle p1 to Complete");

    const roadmapText = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    assert.match(roadmapText, /\| 01 \| \[x\] p1 \| do one \| CLH-01 \|/, "phase table must show the [x] toggle");
    assert.match(roadmapText, /\| 01 \| p1 \| \[x\] Complete \|/, "## Progress table must show [x] Complete");

    const after = await gsdState.readState(CWD);
    assert.equal(after.frontmatter.progress.completed_phases, 1, "completed_phases must increment after recompute");
    assert.equal(after.frontmatter.progress.percent, 33, "percent must recompute from the roadmap");
  });
});

describe("phase-management: fail-closed atomicity (D-06)", () => {
  test("remove of a Complete phase throws with the code and leaves both files byte-identical", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await completePhase(ctx, 2);

    const roadmapBefore = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    const stateBefore = await ctx.fs.readText({ targetKey: `${CWD}/.planning/STATE.md` });

    await assert.rejects(
      runPhase(ctx, { action: "remove", n: 2 }),
      /COMPLETE_PHASE_LOCKED/,
      "removing a Complete phase must throw the D-03 guard code",
    );

    const roadmapAfter = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    const stateAfter = await ctx.fs.readText({ targetKey: `${CWD}/.planning/STATE.md` });
    assert.equal(roadmapAfter, roadmapBefore, "ROADMAP.md must be byte-identical after a hard failure");
    assert.equal(stateAfter, stateBefore, "STATE.md must be byte-identical after a hard failure");
    assert.equal(git.calls.filter((c) => c[0] === "commit").length, 0, "no commit on a hard failure");
  });

  test("an unknown REQ-ID on add throws and neither file changes", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const roadmapBefore = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    const stateBefore = await ctx.fs.readText({ targetKey: `${CWD}/.planning/STATE.md` });

    await assert.rejects(
      runPhase(ctx, { action: "add", name: "p4", goal: "g", requirements: ["NOPE-99"] }),
      /UNKNOWN_REQ_ID/,
    );

    const roadmapAfter = await ctx.fs.readText({ targetKey: `${CWD}/.planning/ROADMAP.md` });
    const stateAfter = await ctx.fs.readText({ targetKey: `${CWD}/.planning/STATE.md` });
    assert.equal(roadmapAfter, roadmapBefore, "ROADMAP.md must be byte-identical on unknown REQ-ID");
    assert.equal(stateAfter, stateBefore, "STATE.md must be byte-identical on unknown REQ-ID");
    assert.equal(git.calls.filter((c) => c[0] === "commit").length, 0, "no commit on a hard failure");
  });
});

describe("phase-management: --yes confirm guard + dangling active_phase (D-08)", () => {
  test("remove of the active phase without yes:true throws; with yes:true succeeds and clears active_phase", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    // Make phase 2 the active phase.
    await gsdState.updateStateFrontmatter(CWD, { active_phase: 2 });

    await assert.rejects(
      runPhase(ctx, { action: "remove", n: 2 }),
      /ACTIVE_REMOVE_REQUIRES_YES/,
      "removing the active phase without --yes must throw",
    );

    const res = await runPhase(ctx, { action: "remove", n: 2, yes: true });
    assert.match(res, /Phase management remove complete/);

    const roadmap = await gsdState.readRoadmap(CWD);
    assert.ok(!roadmap.phases.some((p) => p.name === "p2"), "active phase p2 must be removed with --yes");

    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.active_phase, null, "dangling active_phase must be cleared to null");
    assert.equal(state.frontmatter.current_phase, null, "dangling current_phase must be cleared to null");
  });

  test("remove of the last remaining pending phase without --yes throws (LAST_PENDING_REQUIRES_YES)", async () => {
    const { ctx } = await mountPhaseManagement();
    await bootstrap(ctx, PHASES, REQS);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    // Complete p2 and p3 so only p1 remains pending.
    await completePhase(ctx, 2);
    await completePhase(ctx, 3);

    await assert.rejects(
      runPhase(ctx, { action: "remove", n: 1 }),
      /LAST_PENDING_REQUIRES_YES/,
      "removing the last pending phase without --yes must throw",
    );
  });
});
