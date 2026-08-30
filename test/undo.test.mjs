// Offline behavioural tests for the undo plugin (lib/undo.js), Phase 41.
// Covers all 12 CONTEXT decisions (D-01 through D-12) with pure domain tests
// + fake-git integration tests. Offline only (D-12): FakeFs + fake gitFn +
// fake-ctx, no real git/fs — mirroring test/validate-phase.test.mjs and
// test/pr-branch.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyUndo } from "../lib/undo.js";
import { parseFrontmatter, zeroPad } from "../lib/_shared.js";

import {
  filterPlanCommits,
  revertArgsFor,
  checkPhaseDependencies,
  checkPlanDependencies,
  renderDryRunReport,
  renderUndoBody,
} from "../lib/undo.js";
import { parseNameStatusZ } from "../lib/_clean-branch.js";

// ── pure domain tests (no ctx, no I/O) ─────────────────────────────────────────

describe("undo: filterPlanCommits (D-03)", () => {
  test("matches only the executor's source commits with the (phaseBase-PP) token", () => {
    const commits = [
      { hash: "a", subject: "feat(GSD-41-undo-01): add undo tool", parents: "p1" },
      { hash: "b", subject: "feat(GSD-41-undo-02): add tests", parents: "p2" },
      { hash: "c", subject: "docs(planning): phase 41 undo plan artefacts", parents: "p3" },
    ];
    const scopeRe = /\(GSD-41-undo-01\)/;
    const filtered = filterPlanCommits(commits, scopeRe);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].hash, "a");
  });

  test("plan-02 token is excluded when filtering for plan-01", () => {
    const commits = [
      { hash: "a", subject: "feat(GSD-41-undo-01): x", parents: "p" },
      { hash: "b", subject: "feat(GSD-41-undo-02): y", parents: "p" },
    ];
    const filtered = filterPlanCommits(commits, /\(GSD-41-undo-02\)/);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].hash, "b");
  });

  test("planning-artefact commits are NOT matched (D-07 scope note)", () => {
    const commits = [
      { hash: "c", subject: "docs(planning): phase 41 undo plan artefacts", parents: "p" },
    ];
    const filtered = filterPlanCommits(commits, /\(GSD-41-undo-01\)/);
    assert.equal(filtered.length, 0);
  });
});

describe("undo: revertArgsFor (OQ-4 / R-1)", () => {
  test("normal commit → revert --no-edit <hash>", () => {
    assert.deepEqual(
      revertArgsFor({ hash: "abc", parents: "def" }),
      ["revert", "--no-edit", "abc"],
    );
  });

  test("merge commit (≥2 parents) → revert --no-edit -m 1 <hash>", () => {
    assert.deepEqual(
      revertArgsFor({ hash: "abc", parents: "def ghi" }),
      ["revert", "--no-edit", "-m", "1", "abc"],
    );
  });

  test("empty parents string is treated as a normal commit", () => {
    assert.deepEqual(
      revertArgsFor({ hash: "abc", parents: "" }),
      ["revert", "--no-edit", "abc"],
    );
  });
});

describe("undo: checkPhaseDependencies (D-05)", () => {
  test("refuses when a later phase is shipped (status Complete)", () => {
    const phases = [
      { n: 41, status: "pending", name: "undo" },
      { n: 42, status: "Complete", name: "next" },
    ];
    const result = checkPhaseDependencies(phases, 41, [{ n: 42, hasSummary: false }]);
    assert.equal(result.refuse, true);
    assert.ok(result.dependents.some((d) => d.includes("phase 42")), "should list phase 42");
    assert.ok(result.dependents.some((d) => d.includes("shipped")), "should cite shipped reason");
  });

  test("refuses when a later phase has a SUMMARY (executed)", () => {
    const phases = [
      { n: 41, status: "pending", name: "undo" },
      { n: 42, status: "pending", name: "next" },
    ];
    const result = checkPhaseDependencies(phases, 41, [{ n: 42, hasSummary: true }]);
    assert.equal(result.refuse, true);
    assert.ok(result.dependents.some((d) => d.includes("phase 42")), "should list phase 42");
    assert.ok(result.dependents.some((d) => d.includes("SUMMARY")), "should cite SUMMARY reason");
  });

  test("allows when later phase is pending and has no SUMMARY", () => {
    const phases = [
      { n: 41, status: "pending", name: "undo" },
      { n: 42, status: "pending", name: "next" },
    ];
    const result = checkPhaseDependencies(phases, 41, [{ n: 42, hasSummary: false }]);
    assert.equal(result.refuse, false);
    assert.equal(result.dependents.length, 0);
  });

  test("allows when there are no later phases", () => {
    const phases = [{ n: 41, status: "pending", name: "undo" }];
    const result = checkPhaseDependencies(phases, 41, []);
    assert.equal(result.refuse, false);
  });
});

describe("undo: checkPlanDependencies (D-05)", () => {
  test("refuses when a later plan directly depends on the target", () => {
    const plans = [
      { plan: "01", id: "GSD-41-undo-01", depends_on: [] },
      { plan: "02", id: "GSD-41-undo-02", depends_on: ["GSD-41-undo-01"] },
    ];
    const result = checkPlanDependencies(plans, 1);
    assert.equal(result.refuse, true);
    assert.ok(result.dependents.includes("GSD-41-undo-02"));
  });

  test("refuses transitively (plan 03 → 02 → 01)", () => {
    const plans = [
      { plan: "01", id: "GSD-41-undo-01", depends_on: [] },
      { plan: "02", id: "GSD-41-undo-02", depends_on: ["GSD-41-undo-01"] },
      { plan: "03", id: "GSD-41-undo-03", depends_on: ["GSD-41-undo-02"] },
    ];
    const result = checkPlanDependencies(plans, 1);
    assert.equal(result.refuse, true);
  });

  test("allows when a later plan has no path to the target", () => {
    const plans = [
      { plan: "01", id: "GSD-41-undo-01", depends_on: [] },
      { plan: "02", id: "GSD-41-undo-02", depends_on: [] },
    ];
    const result = checkPlanDependencies(plans, 1);
    assert.equal(result.refuse, false);
  });

  test("allows when there are no later plans", () => {
    const plans = [{ plan: "01", id: "GSD-41-undo-01", depends_on: [] }];
    const result = checkPlanDependencies(plans, 1);
    assert.equal(result.refuse, false);
  });
});

describe("undo: renderDryRunReport (OQ-8)", () => {
  test("renders commits, files, dependents=None, and the confirm instruction", () => {
    const report = renderDryRunReport({
      phase: { n: 41, name: "undo" },
      scope: "phase",
      commits: [{ hash: "abc123", subject: "feat(GSD-41-undo-01): x" }],
      files: [{ status: "A", path: "lib/undo.js" }, { status: "R", oldPath: "lib/old.js", newPath: "lib/new.js" }],
      dependents: [],
    });
    assert.match(report, /abc123/);
    assert.match(report, /feat\(GSD-41-undo-01\): x/);
    assert.match(report, /lib\/undo\.js/);
    assert.match(report, /R lib\/old\.js → lib\/new\.js/);
    assert.match(report, /None/);
    assert.match(report, /Re-call gsd_undo with confirm:true/);
  });

  test("renders dependents when present", () => {
    const report = renderDryRunReport({
      phase: { n: 41, name: "undo" },
      scope: "phase",
      commits: [],
      files: [],
      dependents: ["phase 42: next (shipped)"],
    });
    assert.match(report, /phase 42: next \(shipped\)/);
  });
});

describe("undo: renderUndoBody (Claude's Discretion)", () => {
  test("renders the undo record with commits table and timestamp footer", () => {
    const body = renderUndoBody({
      phase: { n: 41, name: "undo" },
      scope: "phase",
      commits: [{ hash: "abc123", subject: "feat(GSD-41-undo-01): x" }],
      files: [{ status: "A", path: "lib/undo.js" }],
      timestamp: "2026-08-30T10:00:00.000Z",
    });
    assert.match(body, /# Phase 41: undo - Undo Record/);
    assert.match(body, /\| hash \| subject \|/);
    assert.match(body, /abc123/);
    assert.match(body, /lib\/undo\.js/);
    assert.match(body, /Undo: \d{4}-\d{2}-\d{2}/);
  });
});

// ── integration tests (FakeFs + fake gitFn + fake-ctx) ─────────────────────────

// Build a scripted fake gitFn that records every args array and returns canned
// responses. Mirrors test/pr-branch.test.mjs scriptedGit. The joined-args key
// is checked first, then the first-argv key.
function scriptedGit(responses = {}, { rejectAll = false } = {}) {
  const calls = [];
  const fn = async (_cwd, args) => {
    calls.push([...args]);
    if (rejectAll) throw new Error("git unavailable");
    const joined = args.join(" ");
    if (Object.prototype.hasOwnProperty.call(responses, joined)) {
      const v = responses[joined];
      return typeof v === "function" ? v() : v;
    }
    const out = responses[args[0]];
    if (out === undefined) throw new Error(`unexpected git call: ${joined}`);
    return out;
  };
  fn.calls = calls;
  return fn;
}

const exec = makeExec();

async function mountUndo({ gitResponses = {}, gitOpts = {} } = {}) {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs);
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  applyUndo(ctx, {});
  const git = scriptedGit(gitResponses, gitOpts);
  ctx.gitFn = git;
  return { fs, ctx, git };
}

async function bootstrap(ctx, phase, requirements) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      projectCode: "GSD",
      requirements,
      phases: [phase],
    },
    makeExec(),
  );
}

function runUndo(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_undo");
  assert.ok(t, "gsd_undo not registered");
  return t.execute(args, exec);
}

// Standard git responses for a phase with one source commit + a planning-artefact
// commit. The phase base name for phase 1 named "undo" with project_code "GSD"
// is "GSD-01-undo".
function baseGitResponses({ logOutput, diffOutput = "A\0lib/undo.js\0" } = {}) {
  return {
    "rev-parse --abbrev-ref HEAD": "phase-1",
    "symbolic-ref refs/remotes/origin/HEAD --short": "origin/main",
    "fetch origin main --quiet": "",
    "merge-base origin/main HEAD": "base123",
    "merge-base main HEAD": "base123",
    "rev-parse HEAD": "head456",
    "log --format=%H%x09%s%x09%P base123..head456": logOutput || "head456\tfeat(GSD-01-undo-01): add undo tool\tparent1",
    "diff --name-status -z base123 head456": diffOutput,
    // Generic revert fallback: any `git revert ...` call succeeds (returns "").
    "revert": "",
    "add .planning": "",
    "diff --cached --name-only": ".planning/phases/GSD-01-undo/GSD-01-undo-UNDO.md",
    "commit": "",
  };
}

// Seed PLAN-01 + SUMMARY-01 artefacts so listPlans reports has_summary.
async function seedPlanAndSummary(ctx, phaseNum = 1, planNum = "01") {
  const gsdState = ctx.get("gsdState");
  const base = `GSD-${zeroPad(phaseNum)}-undo`;
  await gsdState.writeArtifact(CWD, phaseNum, `PLAN-${planNum}`, [
    "---",
    `phase: ${zeroPad(phaseNum)}-undo`,
    `plan: ${planNum}`,
    "---",
    "<objective>implements undo</objective>",
  ].join("\n"));
  await gsdState.writeArtifact(CWD, phaseNum, `SUMMARY-${planNum}`, [
    "---",
    `phase: ${zeroPad(phaseNum)}-undo`,
    `plan: ${planNum}`,
    "status: complete",
    "---",
    "# Summary\nDone.",
  ].join("\n"));
  return { base };
}

describe("undo: gsd_undo tool integration", () => {
  test("dry-run default: shows commits/files/dependents, issues NO revert, writes NO UNDO.md (D-06)", async () => {
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1 });
    assert.match(res, /head456/);
    assert.match(res, /feat\(GSD-01-undo-01\): add undo tool/);
    assert.match(res, /Re-call gsd_undo with confirm:true/);

    // NO revert call was issued.
    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 0, "dry-run must NOT issue any git revert");

    // NO UNDO.md was written.
    const gsdState = ctx.get("gsdState");
    assert.equal(await gsdState.hasArtifact(CWD, 1, "UNDO"), false, "no UNDO.md on dry-run");
  });

  test("confirm:true executes reverts newest→oldest, writes UNDO.md, returns success (D-02/D-07/D-09)", async () => {
    const log = [
      "h3\tfeat(GSD-01-undo-03): third\tp2",
      "h2\tfeat(GSD-01-undo-02): second\tp1",
      "h1\tfeat(GSD-01-undo-01): first\tp0",
    ].join("\n");
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses({ logOutput: log }) });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /Undo complete/);
    assert.match(res, /Reverted 3 commit\(s\)/);

    // Revert calls in git log order (newest→oldest): h3, h2, h1.
    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 3, "should revert all 3 commits");
    assert.equal(revertCalls[0][revertCalls[0].length - 1], "h3", "first revert is newest (h3)");
    assert.equal(revertCalls[1][revertCalls[1].length - 1], "h2", "second revert is h2");
    assert.equal(revertCalls[2][revertCalls[2].length - 1], "h1", "third revert is oldest (h1)");

    // UNDO.md was written.
    const gsdState = ctx.get("gsdState");
    assert.equal(await gsdState.hasArtifact(CWD, 1, "UNDO"), true, "UNDO.md should be written");
  });

  test("plan-level: reverts only the matching scope-token source commits (D-03/D-07 scope note)", async () => {
    const log = [
      "h1\tfeat(GSD-01-undo-01): first\tp0",
      "h2\tfeat(GSD-01-undo-02): second\tp0",
      "h3\tdocs(planning): phase 1 undo plan artefacts\tp0",
    ].join("\n");
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses({ logOutput: log }) });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1, plan: "01", confirm: true });
    assert.match(res, /Undo complete/);
    assert.match(res, /Reverted 1 commit\(s\)/);
    assert.match(res, /plan-01/);

    // Only the plan-01 source commit (h1) was reverted.
    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 1, "plan-level should revert only the plan-01 commit");
    assert.equal(revertCalls[0][revertCalls[0].length - 1], "h1");

    // The plan-02 commit (h2) and the planning-artefact commit (h3) were NOT reverted.
    const revertedHashes = revertCalls.map((c) => c[c.length - 1]);
    assert.ok(!revertedHashes.includes("h2"), "plan-02 source commit must NOT be reverted");
    assert.ok(!revertedHashes.includes("h3"), "planning-artefact commit must NOT be reverted");

    // Plan-level UNDO.md uses the UNDO-01 suffix.
    const gsdState = ctx.get("gsdState");
    assert.equal(await gsdState.hasArtifact(CWD, 1, "UNDO-01"), true, "plan-level UNDO.md (UNDO-01) should be written");
  });

  test("dependency refusal phase: later completed phase → refuses, no revert, no UNDO.md (D-05)", async () => {
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    // Add a second completed phase.
    const gsdState = ctx.get("gsdState");
    const roadmap = await gsdState.readRoadmap(CWD);
    roadmap.phases.push({ n: 2, name: "next", goal: "next phase", requirements: ["GAP-07"], status: "Complete" });
    await gsdState.writeRoadmap(CWD, roadmap);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1 });
    assert.match(res, /Undo refused/);
    assert.match(res, /phase 2/);

    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 0, "no revert on refusal");
    assert.equal(await gsdState.hasArtifact(CWD, 1, "UNDO"), false, "no UNDO.md on refusal");
  });

  test("dependency refusal plan: later plan depends on target → refuses (D-05)", async () => {
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);
    // Seed plan 02 that depends on plan 01.
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "PLAN-02", [
      "---",
      "phase: 01-undo",
      "plan: 02",
      "depends_on: [\"GSD-01-undo-01\"]",
      "---",
      "<objective>plan 02</objective>",
    ].join("\n"));

    const res = await runUndo(ctx, { phase: 1, plan: "01" });
    assert.match(res, /Undo refused/);

    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 0, "no revert on plan refusal");
  });

  test("idempotency: existing UNDO.md → refuses re-undo, no revert (D-10)", async () => {
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);
    const gsdState = ctx.get("gsdState");
    // Pre-write an UNDO.md.
    await gsdState.writeArtifact(CWD, 1, "UNDO", "---\nphase: 1\n---\nPrior undo.");

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /already exists/);
    assert.match(res, /re-undo/i);

    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 0, "no revert on re-undo refusal");
  });

  test("config soft-gate: workflow.undo === false → soft-skip, no artefact, never throws (D-11)", async () => {
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);
    // Flip the soft gate off.
    const cfgPath = `${CWD}/.planning/config.json`;
    const cfg = JSON.parse((await ctx.fs.readText({ targetKey: cfgPath })) || "{}");
    cfg.workflow = { ...(cfg.workflow || {}), undo: false };
    await ctx.fs.writeText({ targetKey: cfgPath }, JSON.stringify(cfg, null, 2) + "\n");

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /skipped.*undo capability inactive/);

    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 0, "no revert when soft-gated");

    const gsdState = ctx.get("gsdState");
    // The pre-existing UNDO.md from seedPlanAndSummary is NOT there — we didn't
    // write one. Confirm no UNDO.md was created.
    assert.equal(await gsdState.hasArtifact(CWD, 1, "UNDO"), false, "no UNDO.md when soft-gated");
  });

  test("no-git no-op: rev-parse rejects → no-op message, never throws (D-08)", async () => {
    const { ctx, git } = await mountUndo({
      gitResponses: { "rev-parse --abbrev-ref HEAD": "" },
      gitOpts: { rejectAll: true },
    });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /no-op.*git unavailable/);
  });

  test("merge-base fallback: origin/<base> rejects, local <base> succeeds → proceeds (D-08)", async () => {
    // The merge-base origin/main call rejects but merge-base main succeeds.
    const responses = baseGitResponses();
    delete responses["merge-base origin/main HEAD"];
    responses["merge-base main HEAD"] = "base123";
    const { ctx, git } = await mountUndo({ gitResponses: responses });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /Undo complete/);

    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 1, "should proceed with local merge-base fallback");
  });

  test("merge-base both reject → no-op return string, never throws (D-08)", async () => {
    const responses = baseGitResponses();
    delete responses["merge-base origin/main HEAD"];
    delete responses["merge-base main HEAD"];
    const { ctx, git } = await mountUndo({ gitResponses: responses });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /no-op.*could not derive a merge-base/);

    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 0, "no revert when merge-base cannot be derived");
  });

  test("not-a-project: throws 'run gsd_init first'", async () => {
    const { ctx } = await mountUndo();
    // Do NOT bootstrap — no .planning/ project.
    await assert.rejects(
      runUndo(ctx, { phase: 1 }),
      /run gsd_init first/,
    );
  });

  test("phase not in ROADMAP: throws", async () => {
    const { ctx } = await mountUndo();
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await assert.rejects(
      runUndo(ctx, { phase: 999 }),
      /phase 999 not in ROADMAP/,
    );
  });

  test("shipped-phase revert: does NOT call ensurePhaseBranch, operates on current branch (D-04/OQ-6)", async () => {
    const { ctx, git } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);
    // Mark the phase as shipped (Complete).
    const gsdState = ctx.get("gsdState");
    const roadmap = await gsdState.readRoadmap(CWD);
    roadmap.phases[0].status = "Complete";
    await gsdState.writeRoadmap(CWD, roadmap);

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /Undo complete/);
    assert.match(res, /noop-shipped/);

    // ensurePhaseBranch would issue a checkout/switch; assert none was called
    // for the phase branch. The revert still runs on the current branch.
    const checkoutCalls = git.calls.filter((c) => c[0] === "checkout" || c[0] === "switch");
    assert.equal(checkoutCalls.length, 0, "shipped-phase revert must NOT checkout a phase branch");

    // The revert still ran.
    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.ok(revertCalls.length > 0, "revert should run on the current branch for a shipped phase");
  });

  test("merge commit: reverted with -m 1 (OQ-4/R-1)", async () => {
    // A commit with 2 parents (merge commit).
    const log = "merge1\tmerge: combine branches\tparentA parentB";
    const responses = baseGitResponses({ logOutput: log });
    responses["revert --no-edit -m 1 merge1"] = "";
    const { ctx, git } = await mountUndo({ gitResponses: responses });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    const res = await runUndo(ctx, { phase: 1, confirm: true });
    assert.match(res, /Undo complete/);

    const revertCalls = git.calls.filter((c) => c[0] === "revert");
    assert.equal(revertCalls.length, 1);
    assert.deepEqual(revertCalls[0], ["revert", "--no-edit", "-m", "1", "merge1"]);
  });

  test("UNDO.md frontmatter: phase, undone (ISO), scope, base, commits fields (D-09)", async () => {
    const { ctx } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);

    await runUndo(ctx, { phase: 1, confirm: true });

    const gsdState = ctx.get("gsdState");
    const undoText = await gsdState.readArtifact(CWD, 1, "UNDO");
    assert.ok(undoText, "UNDO.md was not written");
    const { frontmatter } = parseFrontmatter(undoText);
    assert.equal(String(frontmatter.phase), "1");
    assert.ok(frontmatter.undone, "undone field should be present");
    assert.match(String(frontmatter.undone), /^\d{4}-\d{2}-\d{2}T/, "undone should be an ISO timestamp");
    assert.equal(frontmatter.scope, "phase");
    assert.equal(frontmatter.base, "main");
    assert.equal(String(frontmatter.commits), "1");
  });

  test("STATE not mutated: gsd_undo does NOT call setActivePhase (D-09)", async () => {
    const { ctx } = await mountUndo({ gitResponses: baseGitResponses() });
    await bootstrap(ctx, { name: "undo", goal: "rollback", requirements: ["GAP-07"] }, [
      { id: "GAP-07", text: "An undo tool." },
    ]);
    await seedPlanAndSummary(ctx);
    const gsdState = ctx.get("gsdState");

    // Read STATE before undo.
    const stateBefore = await gsdState.readState(CWD);
    const nextActionBefore = stateBefore.frontmatter.next_action;

    await runUndo(ctx, { phase: 1, confirm: true });

    // Read STATE after undo — next_action must be unchanged.
    const stateAfter = await gsdState.readState(CWD);
    assert.equal(
      stateAfter.frontmatter.next_action,
      nextActionBefore,
      "gsd_undo must NOT mutate STATE.md loop position (out-of-band, D-09)",
    );
  });
});