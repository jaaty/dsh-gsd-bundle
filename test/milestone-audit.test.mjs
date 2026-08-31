// Offline behavioural tests for the milestone-audit plugin (lib/milestone-audit.js),
// TDD per D-13. Covers the full hybrid engine (D-03): the PURE close-gate helpers
// (aggregateCloseGate / classifyMilestoneStatus / resolveAuditorOutput — no ctx,
// no I/O), the gsd_milestone_audit tool integration (report write + STATE not
// advanced, D-06), the D-07 subagent gating (skip / force / pass), and the D-08
// degrade-to-UNAVAILABLE path.
//
// Offline only (D-13): FakeFs + fake-ctx, no live boot, no LLM/git/gh. The
// gsd-milestone-auditor subagent is a controllable fake factory; git is a fake
// gitFn so commitArtifacts never hits real git.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyMilestoneAudit } from "../lib/milestone-audit.js";
import { parseFrontmatter } from "../lib/_shared.js";

import {
  aggregateCloseGate,
  classifyMilestoneStatus,
  resolveAuditorOutput,
} from "../lib/milestone-audit.js";

// ── pure close-gate helpers (D-04) ─────────────────────────────────────────────
describe("milestone-audit: aggregateCloseGate (D-04 definition of done)", () => {
  const phases = [
    { n: 1, name: "p1", status: "Complete" },
    { n: 2, name: "p2", status: "Complete" },
  ];
  const requirements = [
    { id: "GAP-09", complete: true },
    { id: "M-02", complete: true },
  ];
  const verifications = { 1: "passed", 2: "passed" };

  test("all shipped + all reqs complete + all verifications passed → ready, no reasons", () => {
    const gate = aggregateCloseGate({ phases, requirements, verifications });
    assert.equal(gate.ready, true);
    assert.deepEqual(gate.reasons, []);
  });

  test("an unshipped phase → not ready with a reason naming the phase", () => {
    const gate = aggregateCloseGate({
      phases: [{ n: 1, name: "p1", status: "pending" }, { n: 2, name: "p2", status: "Complete" }],
      requirements,
      verifications,
    });
    assert.equal(gate.ready, false);
    assert.ok(gate.reasons.some((r) => /Unshipped phases/.test(r) && /1/.test(r)));
  });

  test("an incomplete requirement → not ready with a reason naming the req id", () => {
    const gate = aggregateCloseGate({
      phases,
      requirements: [{ id: "GAP-09", complete: true }, { id: "M-02", complete: false }],
      verifications,
    });
    assert.equal(gate.ready, false);
    assert.ok(gate.reasons.some((r) => /Incomplete requirements/.test(r) && /M-02/.test(r)));
  });

  test("a verification status gaps_found / human_needed / missing → not ready with a reason", () => {
    for (const v of ["gaps_found", "human_needed", "missing"]) {
      const gate = aggregateCloseGate({ phases, requirements, verifications: { 1: v, 2: "passed" } });
      assert.equal(gate.ready, false, `verification ${v} must fail the gate`);
      assert.ok(gate.reasons.some((r) => /without passed verification/.test(r) && /1/.test(r)));
    }
  });
});

describe("milestone-audit: classifyMilestoneStatus (D-06)", () => {
  test("ready gate → ready-to-close", () => {
    assert.equal(classifyMilestoneStatus({ ready: true, reasons: [] }), "ready-to-close");
  });
  test("not-ready gate → not-ready", () => {
    assert.equal(classifyMilestoneStatus({ ready: false, reasons: ["x"] }), "not-ready");
  });
});

describe("milestone-audit: resolveAuditorOutput (D-08)", () => {
  test("accepts an object with an array of item-carrying entries", () => {
    const out = resolveAuditorOutput({ outstanding_items: [{ phase: "1", item: "x", severity: "BLOCKER" }], summary: "s" });
    assert.ok(out);
    assert.equal(out.outstanding_items.length, 1);
  });
  test("rejects null / non-object", () => {
    assert.equal(resolveAuditorOutput(null), null);
    assert.equal(resolveAuditorOutput("nope"), null);
    assert.equal(resolveAuditorOutput(42), null);
  });
  test("rejects a missing outstanding_items array", () => {
    assert.equal(resolveAuditorOutput({ summary: "s" }), null);
  });
  test("rejects an entry without a string item", () => {
    assert.equal(resolveAuditorOutput({ outstanding_items: [{ phase: "1" }] }), null);
    assert.equal(resolveAuditorOutput({ outstanding_items: [{ item: 42 }] }), null);
  });
});

// ── integration + subagent gating (Plan 02) ────────────────────────────────────
describe("milestone-audit: gsd_milestone_audit tool (Plan 02)", () => {
  async function mountAudit({ subagents } = {}) {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, { subagents });
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyMilestoneAudit(ctx, {});
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

  // Mark every phase Complete and every requirement complete, and seed a
  // VERIFICATION.md with the given status for each phase. `phases` is the raw
  // gsd_init input (no `n`), so the phase number is the 1-based index.
  async function seedReady(ctx, phases, reqIds, verificationStatus = "passed") {
    const gsdState = ctx.get("gsdState");
    for (let i = 0; i < phases.length; i++) {
      const n = i + 1;
      await gsdState.completePhase(CWD, n);
      await gsdState.writeArtifact(CWD, n, "VERIFICATION", `---\nstatus: ${verificationStatus}\n---\nverified`);
    }
    for (const id of reqIds) await gsdState.markRequirementComplete(CWD, id);
  }

  function runAudit(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_milestone_audit");
    assert.ok(t, "gsd_milestone_audit not registered");
    return t.execute(args || {}, makeExec());
  }

  // A controllable fake gsd-milestone-auditor subagents factory. fail=true makes
  // start() throw; capture records the spawn request.
  function makeAuditorSubagents(controller) {
    return {
      getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
      async start(_n, req) {
        if (controller.capture) controller.capture(req);
        if (controller.fail) throw new Error("auditor exploded");
        const structured =
          typeof controller.structured === "function" ? controller.structured(req) : controller.structured;
        return { result: { output: [{ type: "text", text: "audited" }], stopReason: "completed", structured }, dispose: () => {} };
      },
    };
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

  const VALID_UAT = {
    outstanding_items: [
      { phase: "1", item: "resolve the flaky integration test", severity: "BLOCKER" },
      { phase: "2", item: "document the new env var", severity: "INFO" },
    ],
    summary: "two items outstanding",
  };

  test("ready-to-close: writes the AUDIT.md report, lists UAT items, does NOT advance STATE (D-06)", async () => {
    const { ctx } = await mountAudit({ subagents: makeAuditorSubagents({ structured: VALID_UAT }) });
    const phases = [
      { name: "p1", goal: "g1", requirements: ["GAP-09"] },
      { name: "p2", goal: "g2", requirements: ["M-02"] },
    ];
    await bootstrap(ctx, phases, [{ id: "GAP-09", text: "x" }, { id: "M-02", text: "y" }]);
    await seedReady(ctx, phases, ["GAP-09", "M-02"]);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const before = await gsdState.readState(CWD);
    const res = await runAudit(ctx, {});
    assert.match(res, /ready-to-close/);

    const report = await gsdState.readMilestoneArtifact(CWD, "M1");
    assert.ok(report, "AUDIT.md must be written");
    const { frontmatter } = parseFrontmatter(report);
    assert.equal(frontmatter.status, "ready-to-close");
    assert.equal(frontmatter.uat, "complete");
    assert.match(report, /## Cross-Phase UAT Outstanding Items/);
    assert.match(report, /\[BLOCKER\] 1: resolve the flaky integration test/);
    assert.match(report, /\[INFO\] 2: document the new env var/);
    assert.match(report, /Auditor summary: two items outstanding/);

    // D-06: STATE must be unchanged.
    const after = await gsdState.readState(CWD);
    assert.equal(after.frontmatter.status, before.frontmatter.status, "STATE status must not change");
    assert.equal(after.frontmatter.next_action, before.frontmatter.next_action, "STATE next_action must not change");
  });

  test("not-ready: writes a not-ready report with a Reasons section", async () => {
    const { ctx } = await mountAudit();
    const phases = [{ name: "p1", goal: "g1", requirements: ["GAP-09"] }];
    await bootstrap(ctx, phases, [{ id: "GAP-09", text: "x" }]);
    // Phase 1 has NO VERIFICATION.md → not passed.
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runAudit(ctx, {});
    assert.match(res, /not-ready/);

    const report = await gsdState.readMilestoneArtifact(CWD, "M1");
    assert.ok(report, "AUDIT.md must be written even when not-ready");
    const { frontmatter } = parseFrontmatter(report);
    assert.equal(frontmatter.status, "not-ready");
    assert.match(report, /## Reasons/);
  });

  test("fail-fast: no .planning/ project → rejects", async () => {
    const { ctx } = await mountAudit();
    await assert.rejects(runAudit(ctx, {}), /no \.planning\/ project/);
  });

  test("gating: gate fails and no force → subagent NOT spawned, UAT section SKIPPED", async () => {
    const controller = { capture: null, structured: VALID_UAT };
    const spawned = [];
    controller.capture = (req) => spawned.push(req);
    const { ctx } = await mountAudit({ subagents: makeAuditorSubagents(controller) });
    const phases = [{ name: "p1", goal: "g1", requirements: ["GAP-09"] }];
    await bootstrap(ctx, phases, [{ id: "GAP-09", text: "x" }]);
    // Phase 1 not passed (no VERIFICATION.md) → gate fails.
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runAudit(ctx, {});
    assert.match(res, /not-ready/);
    assert.equal(spawned.length, 0, "subagent must NOT spawn when gate fails and no force");

    const report = await gsdState.readMilestoneArtifact(CWD, "M1");
    assert.match(report, /\*\*Status:\*\* SKIPPED/);
    assert.match(report, /--force/);
  });

  test("gating: gate fails but force:true → subagent IS spawned", async () => {
    const controller = { capture: null, structured: VALID_UAT };
    const spawned = [];
    controller.capture = (req) => spawned.push(req);
    const { ctx } = await mountAudit({ subagents: makeAuditorSubagents(controller) });
    const phases = [{ name: "p1", goal: "g1", requirements: ["GAP-09"] }];
    await bootstrap(ctx, phases, [{ id: "GAP-09", text: "x" }]);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runAudit(ctx, { force: true });
    assert.match(res, /not-ready/);
    assert.equal(spawned.length, 1, "subagent must spawn when --force is set");
    assert.match(spawned[0].prompt[0].text, /gsd-milestone-auditor|milestone/i);

    const report = await gsdState.readMilestoneArtifact(CWD, "M1");
    assert.match(report, /\*\*Status:\*\* COMPLETE/);
  });

  test("gating: gate passes → subagent IS spawned", async () => {
    const controller = { capture: null, structured: VALID_UAT };
    const spawned = [];
    controller.capture = (req) => spawned.push(req);
    const { ctx } = await mountAudit({ subagents: makeAuditorSubagents(controller) });
    const phases = [{ name: "p1", goal: "g1", requirements: ["GAP-09"] }];
    await bootstrap(ctx, phases, [{ id: "GAP-09", text: "x" }]);
    await seedReady(ctx, phases, ["GAP-09"]);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runAudit(ctx, {});
    assert.match(res, /ready-to-close/);
    assert.equal(spawned.length, 1, "subagent must spawn when the gate passes");
  });

  test("degrade: subagent spawn throws → UNAVAILABLE section, tool resolves (D-08)", async () => {
    const { ctx } = await mountAudit({ subagents: makeAuditorSubagents({ fail: true }) });
    const phases = [{ name: "p1", goal: "g1", requirements: ["GAP-09"] }];
    await bootstrap(ctx, phases, [{ id: "GAP-09", text: "x" }]);
    await seedReady(ctx, phases, ["GAP-09"]);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    // The tool must RESOLVE (not reject) even when the subagent throws.
    const res = await runAudit(ctx, {});
    assert.match(res, /ready-to-close/);

    const report = await gsdState.readMilestoneArtifact(CWD, "M1");
    const { frontmatter } = parseFrontmatter(report);
    assert.equal(frontmatter.uat, "unavailable");
    assert.match(report, /\*\*Status:\*\* UNAVAILABLE/);
    assert.match(report, /auditor exploded/);
  });

  test("degrade: malformed structured output → UNAVAILABLE section, tool resolves (D-08)", async () => {
    const { ctx } = await mountAudit({ subagents: makeAuditorSubagents({ structured: { summary: "no items" } }) });
    const phases = [{ name: "p1", goal: "g1", requirements: ["GAP-09"] }];
    await bootstrap(ctx, phases, [{ id: "GAP-09", text: "x" }]);
    await seedReady(ctx, phases, ["GAP-09"]);
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runAudit(ctx, {});
    assert.match(res, /ready-to-close/);

    const report = await gsdState.readMilestoneArtifact(CWD, "M1");
    const { frontmatter } = parseFrontmatter(report);
    assert.equal(frontmatter.uat, "unavailable");
    assert.match(report, /\*\*Status:\*\* UNAVAILABLE/);
    assert.match(report, /malformed structured output/);
  });
});
