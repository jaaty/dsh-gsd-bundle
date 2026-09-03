// Offline behavioural tests for the pause/resume foundation (phase 48, plan 01),
// TDD per D-10. Covers the PURE domain helpers in lib/pause-resume.js (phase
// detection, HANDOFF.json building, .continue-here.md template, async-job
// mapping, incomplete-work fallback, resume-status rendering — no ctx/fs/git
// params) and the new gsdState data-tier accessors in lib/state.js (listPhaseDirs,
// updateContinuity, read/write/deleteHandoff, read/writeContinueHere).
//
// Offline only: FakeFs + fake-ctx, no live boot, no LLM/git/gh. The deleteHandoff
// deletion proof uses the real-fs adapter + a temp dir (FakeFs has no unlink),
// mirroring the removeArtifact test in test/state.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

import { GsdState } from "../lib/state.js";
import {
  detectActivePhase, phaseNumFromDir, mapAsyncJobs, buildHandoff,
  renderContinueHere, detectIncompleteWork, renderResumeStatus,
} from "../lib/pause-resume.js";
import { FakeFs, stateCtx, realFsAdapter } from "./helpers/fake-fs.mjs";
import { buildProject } from "./helpers/project.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";

// ── pure helpers (D-10: no ctx/fs/git params) ──────────────────────────────────

describe("pause-resume: pure helpers (no ctx/fs/git)", () => {
  test("phaseNumFromDir strips a project-code prefix and returns the leading two-digit phase number", () => {
    assert.equal(phaseNumFromDir("GSD-48-pause-resume-work"), 48);
    assert.equal(phaseNumFromDir("48-pause-resume-work"), 48);
    assert.equal(phaseNumFromDir("no-digits"), null);
  });

  test("detectActivePhase returns the first hasPlan entry, or null when none", () => {
    const dirs = [
      { name: "GSD-50-x", hasPlan: false },
      { name: "GSD-48-pause-resume-work", hasPlan: true },
      { name: "GSD-47-y", hasPlan: true },
    ];
    assert.deepEqual(detectActivePhase(dirs), { phaseDir: "GSD-48-pause-resume-work", phaseNum: 48 });
    assert.equal(detectActivePhase([{ name: "GSD-50-x", hasPlan: false }]), null);
    assert.equal(detectActivePhase([]), null);
  });

  test("mapAsyncJobs keeps only non-terminal jobs and derives a resume command", () => {
    const entries = [
      { id: "JOB-01", kind: "shell", status: "running", plan: "01", phase: "1", result: "exit 0" },
      { id: "JOB-02", kind: "subagent", status: "done", plan: "01", phase: "1", result: "exit 0" },
      { id: "JOB-03", kind: "shell", status: "pending", plan: "02", phase: "1", result: null },
      { id: "JOB-04", kind: "subagent", status: "failed", plan: "01", phase: "1", result: "exit 1" },
    ];
    const out = mapAsyncJobs(entries);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { job_id: "JOB-01", backend: "shell", status: "running", plan: "01", phase: "1", result: "exit 0", resume_command: "gsd_job status JOB-01" });
    assert.deepEqual(out[1], { job_id: "JOB-03", backend: "shell", status: "pending", plan: "02", phase: "1", result: null, resume_command: "gsd_job status JOB-03" });
  });

  test("buildHandoff returns the exact D-08 field set with status paused", () => {
    const gathered = {
      context: "phase", phase: "48", phase_name: "pause-resume-work", phase_dir: "GSD-48-pause-resume-work",
      plan: "01", task: 1, total_tasks: 2, completed_tasks: [], remaining_tasks: [],
      blockers: [], async_jobs: [], decisions: [], uncommitted_files: [], next_action: "execute",
      context_notes: "mid-phase", timestamp: "2026-09-03T00:00:00.000Z",
    };
    const h = buildHandoff(gathered);
    assert.equal(h.version, "1.0");
    assert.equal(h.status, "paused");
    assert.equal(h.timestamp, "2026-09-03T00:00:00.000Z");
    assert.equal(h.phase, "48");
    assert.equal(h.next_action, "execute");
    assert.deepEqual(Object.keys(h).sort(), [
      "async_jobs", "blockers", "completed_tasks", "context", "context_notes", "decisions",
      "next_action", "phase", "phase_dir", "phase_name", "plan", "remaining_tasks", "status",
      "task", "timestamp", "total_tasks", "uncommitted_files", "version",
    ].sort());
  });

  test("buildHandoff defaults timestamp to nowIso when absent", () => {
    const h = buildHandoff({ context: "default" });
    assert.ok(h.timestamp);
    assert.equal(h.status, "paused");
  });

  test("renderContinueHere contains all six D-08 section tags and a frontmatter block", () => {
    const gathered = {
      context: "phase", phase: "48", phase_name: "pause-resume-work",
      completed_tasks: [{ id: "t1", name: "Task 1", status: "done" }],
      remaining_tasks: [{ id: "t2", name: "Task 2", status: "pending" }],
      decisions: [{ decision: "D-01", rationale: "x", phase: "48" }],
      blockers: [{ description: "blocked", type: "external" }],
      next_action: "execute plan 01",
      context_notes: "mid-phase",
    };
    const md = renderContinueHere(gathered);
    for (const tag of ["current_state", "completed_work", "remaining_work", "decisions_made", "blockers", "next_action"]) {
      assert.match(md, new RegExp(`<${tag}>`));
      assert.match(md, new RegExp(`</${tag}>`));
    }
    assert.match(md, /^---/);
  });

  test("detectIncompleteWork splits plans by has_summary and returns continue-here files verbatim", () => {
    const plans = [
      { id: "GSD-48-pause-resume-work-01", has_summary: true },
      { id: "GSD-48-pause-resume-work-02", has_summary: false },
    ];
    const files = [".planning/phases/GSD-48-pause-resume-work/.continue-here.md"];
    const out = detectIncompleteWork(plans, files);
    assert.deepEqual(out.incompletePlans, ["GSD-48-pause-resume-work-02"]);
    assert.deepEqual(out.continueHereFiles, files);
  });

  test("renderResumeStatus names next_action and degrades on a partial handoff", () => {
    const full = {
      phase: "48", plan: "01", task: 1, next_action: "execute",
      blockers: [{ description: "b" }], async_jobs: [{ job_id: "JOB-01", status: "running" }],
    };
    const s = renderResumeStatus(full);
    assert.match(s, /phase 48/);
    assert.match(s, /plan 01/);
    assert.match(s, /execute/);
    assert.match(s, /JOB-01/);
    // partial handoff never throws
    const partial = renderResumeStatus({});
    assert.match(partial, /\(n\/a\)/);
    assert.doesNotThrow(() => renderResumeStatus(null));
  });
});

// ── state accessors (gsdState data tier) ────────────────────────────────────────

describe("pause-resume: state accessors (gsdState data tier)", () => {
  test("listPhaseDirs returns [] on an absent phases dir and lists created phase dirs", async () => {
    const fs = new FakeFs();
    const svc = await buildProject(fs);
    assert.deepEqual(await svc.listPhaseDirs(CWD), []);
    await svc.writeArtifact(CWD, 1, "CONTEXT", "# ctx");
    const dirs = await svc.listPhaseDirs(CWD);
    assert.equal(dirs.length, 1);
    assert.equal(dirs[0].name, "01-auth");
  });

  test("updateContinuity sets resumeFile + stoppedAt and round-trips through readState", async () => {
    const fs = new FakeFs();
    const svc = await buildProject(fs);
    const doc = await svc.updateContinuity(CWD, {
      stoppedAt: "2026-09-03T00:00:00Z",
      resumeFile: ".planning/phases/01-auth/.continue-here.md",
    });
    assert.equal(doc.body.continuity.resumeFile, ".planning/phases/01-auth/.continue-here.md");
    assert.equal(doc.body.continuity.stoppedAt, "2026-09-03T00:00:00Z");
    assert.equal(doc.frontmatter.stopped_at, "2026-09-03T00:00:00Z");
    const reread = await svc.readState(CWD);
    assert.equal(reread.body.continuity.resumeFile, ".planning/phases/01-auth/.continue-here.md");
    assert.equal(reread.body.continuity.stoppedAt, "2026-09-03T00:00:00Z");
  });

  test("writeHandoff then readHandoff round-trips the object", async () => {
    const fs = new FakeFs();
    const svc = await buildProject(fs);
    const handoff = { version: "1.0", context: "default", status: "paused", next_action: "execute" };
    const p = await svc.writeHandoff(CWD, handoff);
    assert.equal(p, `${CWD}/.planning/HANDOFF.json`);
    assert.deepEqual(await svc.readHandoff(CWD), handoff);
  });

  test("readHandoff returns undefined on a corrupt HANDOFF.json", async () => {
    const fs = new FakeFs();
    const svc = await buildProject(fs);
    await svc.writeHandoff(CWD, { version: "1.0" });
    const target = await svc.ctx.fs.resolve(`${CWD}/.planning/HANDOFF.json`);
    await svc.ctx.fs.writeText(target, "{ not json");
    assert.equal(await svc.readHandoff(CWD), undefined);
  });

  test("deleteHandoff removes the file and is a no-op when absent (real fs)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "gsd-handoff-"));
    try {
      const svc = new GsdState(stateCtx(realFsAdapter()), {});
      await svc.initProject(tmp, {
        name: "T", purpose: "p", milestoneName: "M1", version: "v1.0",
        requirements: [], phases: [],
      });
      await svc.writeHandoff(tmp, { version: "1.0" });
      assert.ok(await svc.readHandoff(tmp));
      await svc.deleteHandoff(tmp);
      assert.equal(await svc.readHandoff(tmp), undefined);
      await svc.deleteHandoff(tmp); // no-op when absent — must not throw
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("writeContinueHere/readContinueHere round-trip at phase-dir and root paths", async () => {
    const fs = new FakeFs();
    const svc = await buildProject(fs);
    const p1 = await svc.writeContinueHere(CWD, "01-auth", "# continue phase");
    assert.equal(p1, `${CWD}/.planning/phases/01-auth/.continue-here.md`);
    assert.equal(await svc.readContinueHere(CWD, "01-auth"), "# continue phase");
    const p2 = await svc.writeContinueHere(CWD, "", "# continue root");
    assert.equal(p2, `${CWD}/.planning/.continue-here.md`);
    assert.equal(await svc.readContinueHere(CWD, ""), "# continue root");
  });
});

// ── integration (D-10: tools over FakeFs + fake gitFn) ─────────────────────────

describe("pause-resume: gsd_pause_work / gsd_resume_work tools (integration)", () => {
  async function mount() {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    return { fs, ctx };
  }

  async function bootstrap(ctx, phases, requirements) {
    const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
    assert.ok(gsdInit, "gsd_init not registered");
    await gsdInit.execute(
      { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases },
      makeExec(),
    );
  }

  // A controllable fake gitFn that records calls and simulates add/diff/commit
  // (model on test/learnings.test.mjs makeFakeGit).
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

  function runPause(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_pause_work");
    assert.ok(t, "gsd_pause_work not registered");
    return t.execute(args || {}, makeExec());
  }

  function runResume(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_resume_work");
    assert.ok(t, "gsd_resume_work not registered");
    return t.execute(args || {}, makeExec());
  }

  // ── gsd_pause_work ────────────────────────────────────────────────────────────

  test("gsd_pause_work with an active phase writes HANDOFF.json + phase-dir .continue-here.md", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", "---\nwave: 1\ntype: execute\n---\n<objective>build it</objective>");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runPause(ctx);
    assert.match(res, /HANDOFF\.json/);
    assert.ok(await gsdState.readHandoff(CWD), "HANDOFF.json must be written");
    assert.ok(await gsdState.readContinueHere(CWD, "01-p1"), "phase-dir .continue-here.md must be written");
  });

  test("gsd_pause_work with no active phase writes HANDOFF.json + root .continue-here.md", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runPause(ctx);
    assert.match(res, /HANDOFF\.json/);
    assert.ok(await gsdState.readHandoff(CWD), "HANDOFF.json must be written");
    assert.ok(await gsdState.readContinueHere(CWD, ""), "root .continue-here.md must be written");
  });

  test("gsd_pause_work issues a WIP commit via the fake gitFn", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", "---\nwave: 1\ntype: execute\n---\n<objective>build it</objective>");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    await runPause(ctx);
    const commit = git.calls.find((c) => c[0] === "commit");
    assert.ok(commit, "a commit call must be issued");
    assert.match(commit[2], /^wip:/, "commit message must start with wip:");
  });

  test("gsd_pause_work records non-terminal async jobs in the handoff", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", "---\nwave: 1\ntype: execute\n---\n<objective>build it</objective>");
    await gsdState.appendJob(CWD, { kind: "shell", status: "running", plan: "01", phase: "1" });
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    await runPause(ctx);
    const handoff = await gsdState.readHandoff(CWD);
    assert.ok(handoff, "HANDOFF.json must be written");
    assert.ok(Array.isArray(handoff.async_jobs), "async_jobs must be an array");
    assert.equal(handoff.async_jobs.length, 1);
    assert.equal(handoff.async_jobs[0].job_id, "JOB-01");
    assert.equal(handoff.async_jobs[0].resume_command, "gsd_job status JOB-01");
  });

  test("gsd_pause_work with no project rejects with a no-.planning error", async () => {
    const { ctx } = await mount();
    await assert.rejects(runPause(ctx), /no \.planning\/ project/);
  });

  // ── gsd_resume_work ─────────────────────────────────────────────────────────

  test("gsd_resume_work consumes a HANDOFF.json, updates continuity, and deletes it", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeHandoff(CWD, {
      version: "1.0", context: "phase", phase: "1", phase_name: "p1", phase_dir: "01-p1",
      plan: "01", task: 1, total_tasks: 2, status: "paused", next_action: "execute plan 01",
      completed_tasks: [], remaining_tasks: [], blockers: [], async_jobs: [], decisions: [],
      uncommitted_files: [], context_notes: "mid-phase",
    });

    const res = await runResume(ctx);
    assert.match(res, /execute plan 01/);
    assert.match(res, /resumed from handoff/i);

    const doc = await gsdState.readState(CWD);
    assert.ok(doc.body.continuity.resumeFile, "resumeFile must be set");
    assert.ok(doc.frontmatter.stopped_at, "stopped_at must be set");
    assert.equal(await gsdState.readHandoff(CWD), undefined, "one-shot HANDOFF.json must be deleted");
  });

  test("gsd_resume_work falls back to detecting a PLAN-without-SUMMARY", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", "---\nwave: 1\ntype: execute\n---\n<objective>build it</objective>");

    const res = await runResume(ctx);
    assert.match(res, /incomplete/i);
    assert.match(res, /01-p1-01/);
  });

  test("gsd_resume_work returns a clean nothing-to-resume status when there is no work", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const res = await runResume(ctx);
    assert.match(res, /nothing to resume/i);
  });

  test("gsd_resume_work is advisory — never mutates STATE status or next_action", async () => {
    const { ctx } = await mount();
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-14"] }], [{ id: "GAP-14", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeHandoff(CWD, {
      version: "1.0", context: "default", status: "paused", next_action: "execute",
    });
    const before = await gsdState.readState(CWD);
    const statusBefore = before.frontmatter.status;
    const nextBefore = before.frontmatter.next_action;

    await runResume(ctx);

    const after = await gsdState.readState(CWD);
    assert.equal(after.frontmatter.status, statusBefore, "status must be unchanged (D-04)");
    assert.equal(after.frontmatter.next_action, nextBefore, "next_action must be unchanged (D-04)");
  });

  test("gsd_resume_work with no project rejects with a no-.planning error", async () => {
    const { ctx } = await mount();
    await assert.rejects(runResume(ctx), /no \.planning\/ project/);
  });
});
