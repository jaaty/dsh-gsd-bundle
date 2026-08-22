// GsdState service tests against an in-memory fake host fs. No real filesystem,
// no subagents, no git/gh — fully deterministic.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { GsdState } from "../lib/state.js";
import { FakeFs, stateCtx } from "./helpers/fake-fs.mjs";
import {
  buildProject,
  FENCED_PLAN,
  FENCELESS_PLAN,
  FENCED_SUMMARY,
  VERIFICATION_PASSED,
  VERIFICATION_GAPS,
} from "./helpers/project.mjs";

const CWD = "/project";

function makeSvc(fs) {
  return new GsdState(stateCtx(fs), {});
}

describe("init + artefact naming", () => {
  test("writeArtifact(PLAN-01) maps to <base>-01-PLAN.md, read back round-trips", async () => {
    // BUG: writeArtifact produced <base>-PLAN-01.md while listPlans globbed
    // <base>-01-PLAN.md — plans were never found, SUMMARYs never detected.
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const written = await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    assert.equal(path.basename(written), "01-auth-01-PLAN.md");
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-PLAN.md`));
    assert.equal(await svc.readArtifact(CWD, 1, "PLAN-01"), FENCED_PLAN);
    assert.equal(await svc.hasArtifact(CWD, 1, "PLAN-01"), true);
  });

  test("writeArtifact(SUMMARY-01) maps to <base>-01-SUMMARY.md", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const written = await svc.writeArtifact(CWD, 1, "SUMMARY-01", FENCED_SUMMARY);
    assert.equal(path.basename(written), "01-auth-01-SUMMARY.md");
  });

  test("writeArtifact creates parent phase dir (host fs may not auto-create)", async () => {
    // BUG: _ensureDir was a no-op; writes relied on an unverified host-fs
    // contract. Now _write ensures parents via node:fs.
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "CONTEXT", "# ctx");
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-CONTEXT.md`));
  });

  test("planningRoot is a public accessor (no cross-boundary _planning)", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    assert.equal(svc.planningRoot(CWD), `${CWD}/.planning`);
  });
});

describe("planIndex", () => {
  test("listPlans parses fenced and fenceless plans; gap_closure as boolean true", async () => {
    // BUG: fenceless PLAN.md frontmatter parsed to {} — requirements, wave,
    // type, gap_closure all lost.
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.writeArtifact(CWD, 1, "PLAN-02", FENCELESS_PLAN);
    const plans = await svc.listPlans(CWD, 1);
    assert.equal(plans.length, 2);
    const fenced = plans.find((p) => p.id === "01-auth-01");
    const fenceless = plans.find((p) => p.id === "01-auth-02");
    assert.deepEqual(fenced.requirements, ["AUTH-01"]);
    assert.equal(fenced.type, "tdd");
    assert.equal(fenced.wave, 1);
    assert.equal(fenced.gap_closure, true);
    assert.deepEqual(fenceless.requirements, ["TODO-01"]);
    assert.equal(fenceless.wave, 1);
    assert.equal(fenceless.gap_closure, true);
    assert.deepEqual(fenceless.files_modified, ["src/auth2.js", "tests/test_auth2.py"]);
    assert.equal(fenceless.objective, "add login 2");
  });

  test("has_summary is true once the SUMMARY-01 artifact exists", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.markPlanSummary(CWD, 1, 1, FENCED_SUMMARY);
    const plans = await svc.listPlans(CWD, 1);
    assert.equal(plans[0].has_summary, true);
  });

  test("planIndex groups waves and computes runnable", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.writeArtifact(CWD, 1, "PLAN-02", FENCELESS_PLAN);
    const idx = await svc.planIndex(CWD, 1);
    assert.equal(idx.plans.length, 2);
    assert.equal(idx.incomplete.length, 2);
    assert.deepEqual(Object.keys(idx.waves), ["1"]);
  });
});

describe("progress counters", () => {
  test("markPlanSummary syncs total_plans and completed_plans", async () => {
    // BUG: total_plans was never updated after gsd_init (always 0), so status
    // reported "X/0 plans".
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.writeArtifact(CWD, 1, "PLAN-02", FENCELESS_PLAN);
    await svc.markPlanSummary(CWD, 1, 1, FENCED_SUMMARY);
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.progress.total_plans, 2);
    assert.equal(st.frontmatter.progress.completed_plans, 1);
  });

  test("completePhase recomputes completed_phases/percent from the roadmap", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.completePhase(CWD, 1);
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.progress.total_phases, 1);
    assert.equal(st.frontmatter.progress.completed_phases, 1);
    assert.equal(st.frontmatter.progress.percent, 100);
    const roadmap = await svc.readRoadmap(CWD);
    assert.equal(roadmap.phases[0].status, "Complete");
  });

  test("recomputeProgress keeps completed_phases and percent consistent", async () => {
    // BUG: gsd_new_milestone recomputed total_phases but left completed_phases/
    // percent stale after appending phases.
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.completePhase(CWD, 1); // phase 1 now Complete (1/1, 100%)
    // add a new milestone phase (mimics gsd_new_milestone appending)
    const roadmap = await svc.readRoadmap(CWD);
    roadmap.phases.push({ n: 2, name: "ship", goal: "Ship it", requirements: [], status: "pending" });
    await svc.writeRoadmap(CWD, roadmap);
    await svc.recomputeProgress(CWD);
    const st = await svc.readState(CWD);
    assert.equal(st.frontmatter.progress.total_phases, 2);
    assert.equal(st.frontmatter.progress.completed_phases, 1);
    assert.equal(st.frontmatter.progress.percent, 50);
  });
});

describe("requirements traceability", () => {
  test("markRequirementComplete flips the checkbox in REQUIREMENTS.md", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.markRequirementComplete(CWD, "AUTH-01");
    const reqs = await svc.readRequirements(CWD);
    const auth = reqs.find((r) => r.id === "AUTH-01");
    assert.equal(auth.complete, true);
  });
});

function awaitBuild(fs) {
  return buildProject(fs, CWD);
}