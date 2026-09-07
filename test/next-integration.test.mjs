// Offline integration tests for the gsd_next smart-entry tool (phase 53,
// CLH-02/CLH-03). Proves the gsd_next execute path classifies the current
// .planning/ state into the six D-04 branches, re-points STATE only on the
// branch-5 auto-advance (guarded by the advance flag), and never mutates STATE
// for branches 1,2,3,4,6 (the never-advances-STATE invariant). Modeled on
// test/autonomous.test.mjs: FakeFs + fake-ctx + fake gitFn, no live boot/LLM/git.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyCommands } from "../lib/commands.js";
import { apply as applyDiscuss } from "../lib/discuss.js";
import { apply as applySpec } from "../lib/spec.js";
import { apply as applyPlan } from "../lib/plan.js";
import { apply as applyHealth } from "../lib/health.js";
import { apply as applyMilestoneAudit } from "../lib/milestone-audit.js";

// Mount the orientation tier + a chosen set of loop plugins so the capability
// descriptors the classifier routes through are present. core-tools provides
// gsdOrient (gsd_init/status/progress/new_milestone/pause/resume/next) + gsdJobs.
async function mountNext(loopPlugins = []) {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs);
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  for (const apply of loopPlugins) apply(ctx, {});
  applyCommands(ctx, {});
  return { fs, ctx };
}

const exec = () => makeExec();

// Bootstrap a .planning/ project via gsd_init (writes PROJECT/REQUIREMENTS/
// ROADMAP/STATE/config). gsd_init assigns 1-based n in the order given.
async function bootstrap(ctx, phases, requirements = [{ id: "CLH-02", text: "x" }]) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases },
    exec(),
  );
}

// Overwrite ROADMAP with explicit phase numbers + statuses.
async function seedRoadmap(ctx, phases) {
  const gsdState = ctx.get("gsdState");
  await gsdState.writeRoadmap(CWD, { milestoneName: "M1", version: "v1.0", phases });
  return gsdState;
}

// A fake gitFn so commitArtifacts is offline: `add` no-ops, `diff --cached` names
// a staged file so the commit path records committed:true, `commit` no-ops.
function makeFakeGit() {
  const calls = [];
  const fakeGit = async (_cwd, args) => {
    calls.push([...args]);
    if (args[0] === "add") return "";
    if (args[0] === "diff" && args[1] === "--cached" && args[2] === "--name-only") return ".planning/STATE.md";
    if (args[0] === "commit") return "";
    return "";
  };
  return { calls, fakeGit };
}

function findNext(ctx) {
  const t = ctx.tools.find((x) => x.name === "gsd_next");
  assert.ok(t, "gsd_next not registered");
  return t;
}

// Read the STATE frontmatter snapshot (or undefined when no STATE.md) for the
// never-advances-STATE invariant.
async function readFm(ctx) {
  const state = await ctx.get("gsdState").readState(CWD);
  return state ? state.frontmatter : undefined;
}

describe("gsd_next: integration across the six branches", () => {
  // ── (1) no-project path ─────────────────────────────────────────────────────
  test("(1) uninitialised cwd → names gsd_init; STATE.md absent", async () => {
    const { ctx } = await mountNext([]);
    const res = await findNext(ctx).execute({}, exec());
    assert.match(res, /run gsd_init/);
    const gsdState = ctx.get("gsdState");
    assert.equal(await gsdState.readState(CWD), undefined, "STATE.md must be absent on no-project");
  });

  // ── (2) mid-phase path (read-only recommendation; never advances STATE) ─────
  test("(2) mid-phase → names plan-phase; STATE byte-identical", async () => {
    const { ctx } = await mountNext([applyDiscuss, applyPlan]);
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["CLH-02"] }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.setActivePhase(CWD, 1, "plan");

    const before = await readFm(ctx);
    const res = await findNext(ctx).execute({}, exec());
    const after = await readFm(ctx);

    assert.match(res, /run plan-phase/);
    assert.deepEqual(after, before, "mid-phase branch must not mutate STATE");
  });

  // ── (3) auto-advance path (branch 5, discuss) ──────────────────────────────
  test("(3) phase-shipped-next + advance:true → re-points STATE to phase 2 discuss", async () => {
    const { ctx } = await mountNext([applyDiscuss]);
    await bootstrap(ctx, [
      { name: "p1", goal: "g1", requirements: ["CLH-02"] },
      { name: "p2", goal: "g2", requirements: ["CLH-02"] },
    ]);
    const gsdState = await seedRoadmap(ctx, [
      { n: 1, name: "p1", goal: "g1", requirements: ["CLH-02"], status: "Complete" },
      { n: 2, name: "p2", goal: "g2", requirements: ["CLH-02"], status: "pending" },
    ]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await findNext(ctx).execute({ advance: true }, exec());
    const fm = await readFm(ctx);

    assert.equal(String(fm.active_phase), "2", "active_phase must be re-pointed to 2");
    assert.equal(fm.status, "discuss", "status must be discuss");
    assert.equal(fm.next_action, "discuss-phase", "next_action must be discuss-phase");
    assert.match(res, /run discuss-phase/);
    assert.ok(git.calls.some((c) => c[0] === "commit"), "auto-advance must commit the re-pointed STATE");
  });

  // ── (4) auto-advance spec variant (gsdSpec present → step spec) ─────────────
  test("(4) auto-advance with gsdSpec present → step spec, text names spec-phase", async () => {
    const { ctx } = await mountNext([applySpec, applyDiscuss]);
    await bootstrap(ctx, [
      { name: "p1", goal: "g1", requirements: ["CLH-02"] },
      { name: "p2", goal: "g2", requirements: ["CLH-02"] },
    ]);
    await seedRoadmap(ctx, [
      { n: 1, name: "p1", goal: "g1", requirements: ["CLH-02"], status: "Complete" },
      { n: 2, name: "p2", goal: "g2", requirements: ["CLH-02"], status: "pending" },
    ]);
    ctx.gitFn = makeFakeGit().fakeGit;

    const res = await findNext(ctx).execute({ advance: true }, exec());
    const fm = await readFm(ctx);

    assert.equal(String(fm.active_phase), "2");
    assert.equal(fm.status, "spec", "status must be spec when gsdSpec is present");
    assert.equal(fm.next_action, "discuss-phase", "_nextActionFor maps spec→discuss-phase");
    assert.match(res, /run spec-phase/, "recommendation must name the spec-phase command");
  });

  // ── (5) auto-advance with advance:false → STATE unchanged ───────────────────
  test("(5) phase-shipped-next + advance:false → STATE unchanged, notes re-run to re-point", async () => {
    const { ctx } = await mountNext([applyDiscuss]);
    await bootstrap(ctx, [
      { name: "p1", goal: "g1", requirements: ["CLH-02"] },
      { name: "p2", goal: "g2", requirements: ["CLH-02"] },
    ]);
    await seedRoadmap(ctx, [
      { n: 1, name: "p1", goal: "g1", requirements: ["CLH-02"], status: "Complete" },
      { n: 2, name: "p2", goal: "g2", requirements: ["CLH-02"], status: "pending" },
    ]);
    ctx.gitFn = makeFakeGit().fakeGit;

    const before = await readFm(ctx);
    const res = await findNext(ctx).execute({}, exec());
    const after = await readFm(ctx);

    assert.deepEqual(after, before, "advance:false must not re-point STATE");
    assert.match(res, /Re-run gsd_next with advance:true/, "must note that advance:true re-points STATE");
    assert.equal(String(after.active_phase), String(before.active_phase), "active_phase must not change");
  });

  // ── (6) milestone-complete path ─────────────────────────────────────────────
  test("(6) all phases Complete → gsd_milestone_audit; ready-to-close → gsd_new_milestone; STATE untouched", async () => {
    const { ctx } = await mountNext([applyMilestoneAudit]);
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["CLH-02"] }]);
    await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["CLH-02"], status: "Complete" }]);
    const gsdState = ctx.get("gsdState");

    const before = await readFm(ctx);
    const resAudit = await findNext(ctx).execute({}, exec());
    assert.match(resAudit, /run gsd_milestone_audit/);
    assert.deepEqual(await readFm(ctx), before, "milestone-complete (no audit) must not mutate STATE");

    // Seed a ready-to-close audit and re-run.
    await gsdState.writeMilestoneArtifact(CWD, "M1", "---\nstatus: ready-to-close\n---\nbody");
    const resNewM = await findNext(ctx).execute({}, exec());
    assert.match(resNewM, /run gsd_new_milestone/);
    assert.deepEqual(await readFm(ctx), before, "milestone-complete (ready-to-close) must not mutate STATE");
  });

  // ── (7) corrupt path (ROADMAP but no STATE) ─────────────────────────────────
  test("(7) .planning exists but STATE missing → names gsd_health; STATE untouched", async () => {
    const { ctx } = await mountNext([applyHealth]);
    await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["CLH-02"], status: "pending" }]);
    const before = await readFm(ctx);

    const res = await findNext(ctx).execute({}, exec());
    assert.match(res, /run gsd_health/);
    assert.deepEqual(await readFm(ctx), before, "corrupt branch must not mutate STATE");
  });

  // ── (8) paused path via HANDOFF.json ────────────────────────────────────────
  test("(8) HANDOFF.json present → names gsd_resume_work; STATE untouched", async () => {
    const { ctx } = await mountNext([applyDiscuss, applyPlan]);
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["CLH-02"] }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.setActivePhase(CWD, 1, "plan");
    await gsdState.writeHandoff(CWD, { phase_dir: null, phase: "1", next_action: "plan-phase" });

    const before = await readFm(ctx);
    const res = await findNext(ctx).execute({}, exec());
    assert.match(res, /run gsd_resume_work/);
    assert.deepEqual(await readFm(ctx), before, "paused branch must not mutate STATE");
  });

  // ── (8b) paused path via phase-dir .continue-here.md only (D-05) ─────────────
  test("(8b) lone phase-dir .continue-here.md (no HANDOFF) → gsd_resume_work (D-05)", async () => {
    const { ctx } = await mountNext([applyDiscuss, applyPlan]);
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["CLH-02"] }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.setActivePhase(CWD, 1, "plan");
    // Resolve the active phase dir name and write a lone .continue-here.md there.
    const { base } = await gsdState.phaseDirAndBase(CWD, 1);
    await gsdState.writeContinueHere(CWD, base, "resume here");
    // No HANDOFF.json — only the phase-dir pointer remains.

    const before = await readFm(ctx);
    const res = await findNext(ctx).execute({}, exec());
    assert.match(res, /run gsd_resume_work/, "phase-dir pointer must route to gsd_resume_work, not mid-phase");
    assert.deepEqual(await readFm(ctx), before, "paused phase-dir branch must not mutate STATE");
  });

  // ── (9) never-advances-STATE invariant (branches 1,2,3,4,6 × advance true/false) ─
  test("(9) never-advances-STATE: branches 1,2,3,4,6 leave STATE byte-identical (advance true AND false)", async () => {
    // Build one shared mount with the full set of capabilities needed across
    // the non-advancing branches, then exercise each branch with both flag
    // values and deepEqual the frontmatter before/after.
    const { ctx } = await mountNext([applyDiscuss, applyPlan, applyHealth, applyMilestoneAudit]);
    const gsdState = ctx.get("gsdState");
    const next = findNext(ctx);
    ctx.gitFn = makeFakeGit().fakeGit;

    // Branch 1 (no project): no bootstrap.
    {
      const before = await readFm(ctx);
      await next.execute({ advance: true }, exec());
      await next.execute({ advance: false }, exec());
      assert.deepEqual(await readFm(ctx), before, "branch 1 must not mutate STATE");
    }

    // Branch 2 (corrupt): ROADMAP but no STATE.
    await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["CLH-02"], status: "pending" }]);
    {
      const before = await readFm(ctx);
      await next.execute({ advance: true }, exec());
      await next.execute({ advance: false }, exec());
      assert.deepEqual(await readFm(ctx), before, "branch 2 must not mutate STATE");
    }

    // Re-bootstrap a real project for branches 3,4,6.
    const fs2 = new FakeFs();
    const ctx2 = makeMountCtx(fs2);
    applyState(ctx2, {});
    applyCoreTools(ctx2, {});
    applyDiscuss(ctx2, {});
    applyPlan(ctx2, {});
    applyHealth(ctx2, {});
    applyMilestoneAudit(ctx2, {});
    applyCommands(ctx2, {});
    ctx2.gitFn = makeFakeGit().fakeGit;
    const gsdState2 = ctx2.get("gsdState");
    const next2 = findNext(ctx2);
    await bootstrap(ctx2, [{ name: "p1", goal: "g1", requirements: ["CLH-02"] }]);

    // Branch 4 (mid-phase): active phase set, step plan, phase pending.
    await gsdState2.setActivePhase(CWD, 1, "plan");
    {
      const before = await readFm(ctx2);
      await next2.execute({ advance: true }, exec());
      await next2.execute({ advance: false }, exec());
      assert.deepEqual(await readFm(ctx2), before, "branch 4 must not mutate STATE");
    }

    // Branch 3 (paused): write a HANDOFF.json (short-circuits before mid-phase).
    await gsdState2.writeHandoff(CWD, { phase_dir: null, phase: "1", next_action: "plan-phase" });
    {
      const before = await readFm(ctx2);
      await next2.execute({ advance: true }, exec());
      await next2.execute({ advance: false }, exec());
      assert.deepEqual(await readFm(ctx2), before, "branch 3 must not mutate STATE");
    }
    await gsdState2.deleteHandoff(CWD);

    // Branch 6 (milestone complete): all phases Complete.
    await gsdState2.writeRoadmap(CWD, { milestoneName: "M1", version: "v1.0", phases: [{ n: 1, name: "p1", goal: "g1", requirements: ["CLH-02"], status: "Complete" }] });
    // Reset active_phase to null so the classifier reaches branch 6 (not branch 4).
    await gsdState2.updateStateFrontmatter(CWD, { active_phase: null, status: "idle", next_action: null });
    {
      const before = await readFm(ctx2);
      await next2.execute({ advance: true }, exec());
      await next2.execute({ advance: false }, exec());
      assert.deepEqual(await readFm(ctx2), before, "branch 6 must not mutate STATE");
    }
  });
});