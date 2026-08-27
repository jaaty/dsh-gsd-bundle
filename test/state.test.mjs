// GsdState service tests against an in-memory fake host fs. No real filesystem,
// no subagents, no git/gh — fully deterministic.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

import { GsdState } from "../lib/state.js";
import { resolvePlanDep } from "../lib/_shared.js";
import { FakeFs, stateCtx, realFsAdapter } from "./helpers/fake-fs.mjs";
import {
  buildProject,
  REQS,
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

  test("writeArtifact(CHECKPOINT-01) maps to <base>-01-CHECKPOINT.md and round-trips (D-01)", async () => {
    // BUG: _artifactFile only knew PLAN|SUMMARY, so CHECKPOINT-01 fell through
    // to <base>-CHECKPOINT-01.md — never matching the <base>-<PP>-CHECKPOINT.md
    // layout the resume path reads. Now the per-plan group includes CHECKPOINT.
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const content = `---
plan: 01-auth-01
last_completed_task: 1
checkpoint_reason: checkpoint:human-verify
committed_hashes: []
---
# Checkpoint`;
    const written = await svc.writeArtifact(CWD, 1, "CHECKPOINT-01", content);
    assert.equal(path.basename(written), "01-auth-01-CHECKPOINT.md");
    assert.ok(fs.files.has(`${CWD}/.planning/phases/01-auth/01-auth-01-CHECKPOINT.md`));
    assert.equal(await svc.readArtifact(CWD, 1, "CHECKPOINT-01"), content);
    assert.equal(await svc.hasArtifact(CWD, 1, "CHECKPOINT-01"), true);
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

describe("removeArtifact", () => {
  test("removeArtifact deletes a persisted CHECKPOINT artefact on a real fs (D-06 primitive)", async () => {
    // FakeFs is in-memory with no unlink; use the real-fs adapter + a temp dir
    // to prove removeArtifact actually deletes the file on disk.
    const tmp = await mkdtemp(path.join(os.tmpdir(), "gsd-remove-"));
    try {
      const svc = new GsdState(stateCtx(realFsAdapter()), {});
      await svc.initProject(tmp, {
        name: "Test", purpose: "p", milestoneName: "M1", version: "v1.0",
        requirements: [],
        phases: [{ name: "auth", goal: "g", requirements: [] }],
      });
      const content = "---\nplan: 01-auth-01\nlast_completed_task: 1\n---\n# Checkpoint";
      await svc.writeArtifact(tmp, 1, "CHECKPOINT-01", content);
      assert.equal(await svc.hasArtifact(tmp, 1, "CHECKPOINT-01"), true);
      await svc.removeArtifact(tmp, 1, "CHECKPOINT-01");
      assert.equal(await svc.hasArtifact(tmp, 1, "CHECKPOINT-01"), false);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
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
    // BUG: the structured `phase` field is the source for planScope (D-02) —
    // it must be emitted by listPlans alongside `plan`. The value "1" is tied to
    // the listPlans(CWD, 1) call below; if the fixture phase number ever changes,
    // update this assertion to match the actual phaseNum argument.
    assert.equal(fenced.phase, "1");
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

  test("prefixed project: non-prefixed depends_on resolves and gates wave 2 (DUR-05)", async () => {
    // BUG: with a project_code the plan id is prefixed (GSDB-01-auth-01) but the
    // planner wrote depends_on as the bare "01-auth-01"; exact-match resolution
    // never matched, so the wave-2 plan either ran too early (planIndex) or was
    // blocked forever (execute). Prefix-tolerant resolution fixes both.
    const fs = new FakeFs();
    const svc = new GsdState(stateCtx(fs), {});
    await svc.initProject(CWD, {
      name: "T", purpose: "p", milestoneName: "M1", version: "v1.0",
      requirements: REQS,
      phases: [{ name: "auth", goal: "g", requirements: ["AUTH-01", "TODO-01"] }],
      projectCode: "GSDB",
    });
    // plan 1 = wave 1 (no deps); plan 2 = wave 2, depends_on the non-prefixed id.
    await svc.writeArtifact(CWD, 1, "PLAN-01", `---
phase: 01-auth
plan: 01
type: tdd
wave: 1
depends_on: []
files_modified: ["src/a.js"]
autonomous: true
requirements: ["AUTH-01"]
---
<objective>w1</objective><tasks></tasks>`);
    await svc.writeArtifact(CWD, 1, "PLAN-02", `---
phase: 01-auth
plan: 02
type: tdd
wave: 2
depends_on: ["01-auth-01"]
files_modified: ["src/b.js"]
autonomous: true
requirements: ["TODO-01"]
---
<objective>w2</objective><tasks></tasks>`);

    const plans1 = await svc.listPlans(CWD, 1);
    assert.equal(plans1.find((p) => p.plan === "1").id, "GSDB-01-auth-01"); // prefixed base
    assert.equal(resolvePlanDep(plans1, "01-auth-01").id, "GSDB-01-auth-01"); // prefix-tolerant

    // plan 2 blocked while its wave-1 dep has no SUMMARY.
    let idx = await svc.planIndex(CWD, 1);
    assert.ok(!idx.runnable.some((p) => p.plan === "2"), "wave-2 blocked before wave-1 SUMMARY");

    // once the wave-1 SUMMARY exists, wave 2 becomes runnable.
    await svc.markPlanSummary(CWD, 1, 1, FENCED_SUMMARY);
    idx = await svc.planIndex(CWD, 1);
    assert.ok(idx.runnable.some((p) => p.plan === "2"), "wave-2 runnable after wave-1 SUMMARY");
  });

  test("an unresolvable depends_on fails loud with a named error (DUR-05 D-03)", async () => {
    const fs = new FakeFs();
    const svc = new GsdState(stateCtx(fs), {});
    await svc.initProject(CWD, {
      name: "T", purpose: "p", milestoneName: "M1", version: "v1.0",
      requirements: REQS,
      phases: [{ name: "auth", goal: "g", requirements: ["AUTH-01"] }],
      projectCode: "GSDB",
    });
    await svc.writeArtifact(CWD, 1, "PLAN-01", `---
phase: 01-auth
plan: 01
type: tdd
wave: 2
depends_on: ["99-nonexistent-01"]
files_modified: ["src/a.js"]
autonomous: true
requirements: ["AUTH-01"]
---
<objective>x</objective><tasks></tasks>`);
    await assert.rejects(
      () => svc.planIndex(CWD, 1),
      /unresolved plan dependency "99-nonexistent-01"/,
    );
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

// MOUNT-03: extend the existing PLAN/SUMMARY round-trip coverage to the full
// artefact surface (PROJECT, REQUIREMENTS, ROADMAP, STATE, config.json, plus
// the per-phase CONTEXT/RESEARCH/VERIFICATION artefacts). Each structured
// accessor is asserted on the projected subset it actually preserves, per the
// documented parse asymmetries (ROADMAP slug injection; STATE
// last_updated/last_activity mutation + active_phase numeric-string coercion).
describe("planning artefact round-trip", () => {
  test("readProject returns PROJECT.md verbatim (read fidelity; no public writer)", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const PROJ = "# @my-proj\n\nA purpose paragraph with detail.\n";
    await fs.writeText(
      { targetKey: `${CWD}/.planning/PROJECT.md` },
      PROJ,
    );
    assert.equal(await svc.readProject(CWD), PROJ);
  });

  test("writeArtifact/readArtifact round-trips CONTEXT verbatim", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const body = "---\nphase: 01-auth\ngathered: 2026-08-22\n---\n# Context\n\nGathered decisions.\n";
    await svc.writeArtifact(CWD, 1, "CONTEXT", body);
    assert.equal(await svc.readArtifact(CWD, 1, "CONTEXT"), body);
    assert.equal(await svc.hasArtifact(CWD, 1, "CONTEXT"), true);
  });

  test("writeArtifact/readArtifact round-trips RESEARCH verbatim", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const body = "---\nresearcher: gsd-phase-researcher\n---\n# Research\n\nFindings here.\n";
    await svc.writeArtifact(CWD, 1, "RESEARCH", body);
    assert.equal(await svc.readArtifact(CWD, 1, "RESEARCH"), body);
    assert.equal(await svc.hasArtifact(CWD, 1, "RESEARCH"), true);
  });

  test("writeArtifact/readArtifact round-trips VERIFICATION verbatim", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const body = "---\nphase: 01-auth\nstatus: passed\n---\n# Verification\n\nAll checks green.\n";
    await svc.writeArtifact(CWD, 1, "VERIFICATION", body);
    assert.equal(await svc.readArtifact(CWD, 1, "VERIFICATION"), body);
    assert.equal(await svc.hasArtifact(CWD, 1, "VERIFICATION"), true);
  });

  test("writeRequirements/readRequirements round-trips with no loss", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const reqs = [
      { id: "AUTH-01", text: "User can log in", complete: true },
      { id: "AUTH-02", text: "User can log out", complete: false },
      { id: "TODO-01", text: "Add a task", complete: false },
    ];
    await svc.writeRequirements(CWD, reqs);
    assert.deepEqual(await svc.readRequirements(CWD), reqs);
  });

  test("writeRoadmap/readRoadmap round-trips modulo slug injection", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const roadmap = await svc.readRoadmap(CWD);
    roadmap.milestoneName = "M2";
    roadmap.version = "v2.0";
    roadmap.phases = [
      { n: 1, name: "auth", goal: "Add login", requirements: ["AUTH-01"], status: "pending" },
      { n: 2, name: "ship", goal: "Ship it", requirements: [], status: "Complete" },
    ];
    await svc.writeRoadmap(CWD, roadmap);
    const back = await svc.readRoadmap(CWD);
    assert.equal(back.milestoneName, "M2");
    assert.equal(back.version, "v2.0");
    assert.deepEqual(back.phases.map(p => ({n:p.n, name:p.name, goal:p.goal, requirements:p.requirements, status:p.status})), [
      {n:1, name:"auth", goal:"Add login", requirements:["AUTH-01"], status:"pending"},
      {n:2, name:"ship", goal:"Ship it", requirements:[], status:"Complete"},
    ]);
  });

  test("writeState/readState round-trips modulo last_updated/last_activity and numeric-scalar coercion of active_phase", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const doc = await svc.readState(CWD);
    doc.frontmatter.status = "plan";
    doc.frontmatter.active_phase = "1";
    doc.frontmatter.milestone = "v1.0";
    doc.body.position = "Phase 1: discuss";
    doc.body.decisions = ["D-01: use cookies", "D-02: use jwt"];
    doc.body.blockers = ["need design"];
    doc.body.continuity = { lastSession: "2026-08-22", stoppedAt: "discuss", resumeFile: "src/a.js" };
    await svc.writeState(CWD, doc);
    const back = await svc.readState(CWD);

    // Projected frontmatter: exclude last_updated/last_activity (writeState
    // mutates them, lib/state.js:252-253) and active_phase (string "1" is
    // emitted unquoted and coerced back to Number 1 by coerceScalar,
    // lib/_shared.js:35) — asserted separately below.
    const inFm = { ...doc.frontmatter };
    delete inFm.last_updated;
    delete inFm.last_activity;
    delete inFm.active_phase;
    const outFm = { ...back.frontmatter };
    delete outFm.last_updated;
    delete outFm.last_activity;
    delete outFm.active_phase;
    assert.deepEqual(outFm, inFm);

    // The coerced scalar's value is preserved modulo type.
    assert.equal(String(back.frontmatter.active_phase), doc.frontmatter.active_phase);

    // _stringifyState only emits position/decisions/blockers/continuity
    // (lib/state.js:196-217) — this is the faithful body contract.
    assert.deepEqual(back.body, {
      position: "Phase 1: discuss",
      decisions: ["D-01: use cookies", "D-02: use jwt"],
      blockers: ["need design"],
      continuity: { lastSession: "2026-08-22", stoppedAt: "discuss", resumeFile: "src/a.js" },
    });
  });

  test("initProject->readConfig round-trips the config", async () => {
    const fs = new FakeFs();
    const svc = new GsdState(stateCtx(fs), {});
    await svc.initProject(CWD, {
      name: "T", purpose: "p", milestoneName: "M1", version: "v1.0",
      requirements: [],
      phases: [{ name: "auth", goal: "g", requirements: [] }],
      tdd: true, mvp: true, projectCode: "GSDB", discussMode: "text",
    });
    const cfg = await svc.readConfig(CWD);
    assert.equal(cfg.gsd_state_version, "1.0");
    assert.equal(cfg.workflow.tdd_mode, true);
    assert.equal(cfg.workflow.mvp_mode, true);
    assert.equal(cfg.project_code, "GSDB");
    assert.equal(cfg.workflow.discuss_mode, "text");
    assert.equal(cfg.context_window, 200000);
    assert.equal(cfg.workflow.use_worktrees, false);
    assert.equal(cfg.workflow.commit_docs, true);
  });
});

describe("WINDOWS ledger accessors (DUR-03, D-02/D-06)", () => {
  test("readWindows on a fresh project returns { entries: [], corrupt: false } without throwing", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    assert.deepEqual(await svc.readWindows(CWD), { entries: [], corrupt: false });
  });

  test("appendWindow assigns WIN-01 then WIN-02 on successive calls, read back losslessly", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const w1 = await svc.appendWindow(CWD, { phase: 1, step: "execute", summary: "Ran plan 01" });
    const w2 = await svc.appendWindow(CWD, { phase: 1, step: "verify", summary: "Verified" });
    assert.equal(w1.id, "WIN-01");
    assert.equal(w2.id, "WIN-02");
    assert.equal(w1.phase, 1);
    assert.equal(w1.step, "execute");
    assert.ok(fs.files.has(`${CWD}/.planning/WINDOWS.md`));
    const { entries, corrupt } = await svc.readWindows(CWD);
    assert.equal(corrupt, false);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].id, "WIN-01");
    assert.equal(entries[1].id, "WIN-02");
    assert.equal(entries[0].summary, "Ran plan 01");
  });

  test("appendWindow copies the optional checkpoint reference (D-07)", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const w = await svc.appendWindow(CWD, { phase: 1, step: "execute", summary: "resume", checkpoint: "CHECKPOINT-02" });
    const { entries } = await svc.readWindows(CWD);
    assert.equal(w.checkpoint, "CHECKPOINT-02");
    assert.equal(entries[0].checkpoint, "CHECKPOINT-02");
  });

  test("a corrupt WINDOWS.md body yields { entries: [], corrupt: true } with no throw", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await fs.writeText({ targetKey: `${CWD}/.planning/WINDOWS.md` }, "# WINDOWS\n## FOO\n- phase: 1\n");
    assert.deepEqual(await svc.readWindows(CWD), { entries: [], corrupt: true });
  });
});

describe("async-jobs registry accessors (DUR-04, D-04/D-06)", () => {
  test("readJobs on a fresh project returns { entries: [], corrupt: false } without throwing", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    assert.deepEqual(await svc.readJobs(CWD), { entries: [], corrupt: false });
  });

  test("appendJob assigns JOB-01 then JOB-02; updateJob flips status to done and records completed", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const j1 = await svc.appendJob(CWD, { kind: "subagent", status: "running" });
    const j2 = await svc.appendJob(CWD, { kind: "subagent", status: "pending" });
    assert.equal(j1.id, "JOB-01");
    assert.equal(j2.id, "JOB-02");
    assert.equal(j1.status, "running");
    assert.ok(fs.files.has(`${CWD}/.planning/async-jobs.json`));

    const updated = await svc.updateJob(CWD, "JOB-01", { status: "done", result: "ok" });
    assert.equal(updated.status, "done");
    assert.equal(updated.result, "ok");
    assert.ok(updated.completed);

    const { entries } = await svc.readJobs(CWD);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].status, "done");
    assert.equal(entries[0].result, "ok");
    assert.equal(entries[1].id, "JOB-02");
  });

  test("updateJob for an unknown id returns null", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    assert.equal(await svc.updateJob(CWD, "JOB-99", { status: "done" }), null);
  });

  test("a corrupt async-jobs.json body yields { entries: [], corrupt: true } with no throw", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await fs.writeText({ targetKey: `${CWD}/.planning/async-jobs.json` }, "{ not valid json !!");
    assert.deepEqual(await svc.readJobs(CWD), { entries: [], corrupt: true });
  });

  test("a non-array async-jobs.json body also degrades to corrupt", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await fs.writeText({ targetKey: `${CWD}/.planning/async-jobs.json` }, `{"not":"an array"}`);
    assert.deepEqual(await svc.readJobs(CWD), { entries: [], corrupt: true });
  });
});

describe("quick-record accessor (DUR-06, D-04/D-05)", () => {
  test("writeQuickRecord routes through ctx.fs to .planning/quick/<date>-<slug>/TASK.md", async () => {
    // A bare GsdState on a fresh FakeFs with NO prior .planning/quick dir — the
    // accessor must be missing/parent-tolerant (must not throw) and the write
    // must land on the FakeFs file map, proving the node:fs bypass is gone.
    const fs = new FakeFs();
    const svc = makeSvc(fs);
    await svc.writeQuickRecord(CWD, "2026-08-24-fix-typo", "# entry");
    assert.ok(fs.files.has(`${CWD}/.planning/quick/2026-08-24-fix-typo/TASK.md`));
    assert.equal(fs.files.get(`${CWD}/.planning/quick/2026-08-24-fix-typo/TASK.md`), "# entry");
  });
});
describe("phaseDirAndBase + resolve-once (CQ-01)", () => {
  // Wrap the service's _phaseDirName with a call counter. phaseDirAndBase routes
  // every accessor through this single method, so counting its invocations proves
  // each accessor resolves the phase dir/base exactly once (CQ-01, D-04).
  function spyPhaseDirName(svc) {
    const orig = svc._phaseDirName.bind(svc);
    let calls = 0;
    svc._phaseDirName = async (...a) => {
      calls += 1;
      return orig(...a);
    };
    return { get calls() { return calls; } };
  }

  test("phaseDirAndBase returns { dir, base } for a roadmap phase (D-01)", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const { dir, base } = await svc.phaseDirAndBase(CWD, 1);
    assert.equal(base, "01-auth");
    assert.equal(dir, `${CWD}/.planning/phases/01-auth`);
  });

  test("phaseDirAndBase preserves the phase-N fallback for an absent phase (D-03)", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const { dir, base } = await svc.phaseDirAndBase(CWD, 9);
    assert.equal(base, "09-phase-9");
    assert.equal(dir, `${CWD}/.planning/phases/09-phase-9`);
  });

  test("writeArtifact resolves dir/base exactly once", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    const count = spyPhaseDirName(svc);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    assert.ok(count.calls === 1);
  });

  test("readArtifact resolves dir/base exactly once", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    const count = spyPhaseDirName(svc);
    await svc.readArtifact(CWD, 1, "PLAN-01");
    assert.ok(count.calls === 1);
  });

  test("hasArtifact resolves dir/base exactly once", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    const count = spyPhaseDirName(svc);
    await svc.hasArtifact(CWD, 1, "PLAN-01");
    assert.ok(count.calls === 1);
  });

  test("removeArtifact resolves dir/base exactly once", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    const count = spyPhaseDirName(svc);
    await svc.removeArtifact(CWD, 1, "PLAN-01");
    assert.ok(count.calls === 1);
  });

  test("listPlans resolves dir/base once plus one per-plan hasArtifact (D-04)", async () => {
    const fs = new FakeFs();
    const svc = await awaitBuild(fs);
    await svc.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
    await svc.writeArtifact(CWD, 1, "PLAN-02", FENCELESS_PLAN);
    const count = spyPhaseDirName(svc);
    const plans = await svc.listPlans(CWD, 1);
    assert.equal(plans.length, 2);
    // 1 for listPlans' own resolution + 2 for the per-plan hasArtifact calls
    // (which are legitimate separate accessor invocations, not eliminated).
    assert.ok(count.calls === 3);
  });
});
function awaitBuild(fs) {
  return buildProject(fs, CWD);
}
