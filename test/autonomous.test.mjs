// Offline behavioural tests for the autonomous plugin (lib/autonomous.js),
// GAP-15 / D-12. Proves the gsd_autonomous feature satisfies "an autonomous
// path can drive all remaining phases end-to-end without per-phase manual
// prompting" with a deterministic node:test suite modeled on
// test/learnings.test.mjs: pure-helper assertions (buildAutoContext /
// buildAutopilotPrompt / discoverPhases) plus a fake-ctx mount, a controllable
// fake subagents factory that captures dispatch, a fake gitFn, and the
// never-advances-STATE invariant (D-10).
//
// Offline only (D-12): FakeFs + fake-ctx + fake subagents + fake git. No live
// boot, no LLM, no real git. The per-phase autopilot is a controllable fake; a
// real phase is never executed (R5).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyAutonomous, buildAutoContext, buildAutopilotPrompt, discoverPhases } from "../lib/autonomous.js";
import { apply as applyCommands } from "../lib/commands.js";
import { buildCapability } from "../lib/_capabilities.js";

// ── pure helpers (D-14h: no ctx / no I/O) ────────────────────────────────────

describe("autonomous: discoverPhases (D-07/D-08 — filters Complete, sorts ascending)", () => {
  test("filters status Complete and sorts by numeric n ascending", () => {
    const roadmap = {
      phases: [
        { n: 50, name: "done", status: "Complete" },
        { n: 52, name: "p2", status: "pending" },
        { n: 51, name: "p1", status: "pending" },
      ],
    };
    assert.deepEqual(discoverPhases(roadmap), [
      { n: 51, name: "p1", status: "pending" },
      { n: 52, name: "p2", status: "pending" },
    ]);
  });

  test("null / no phases → empty array (no-op guard)", () => {
    assert.deepEqual(discoverPhases(null), []);
    assert.deepEqual(discoverPhases({ phases: [] }), []);
  });
});

describe("autonomous: buildAutoContext (D-05 — auto-derived minimal CONTEXT)", () => {
  test("produces a schema-faithful context with the auto-generated marker, goal, and ready status", () => {
    const ctx = buildAutoContext({
      n: 50, name: "add-tests", goal: "add tests", requirements: ["GAP-16"],
    });
    assert.match(ctx, /Mode: Auto-generated \(discuss skipped — autonomous path\)/);
    assert.match(ctx, /Ready for planning/);
    // the ROADMAP goal becomes the single <domain> in_scope line
    assert.match(ctx, /add tests/);
    // footer naming the phase base
    assert.match(ctx, /Phase 50/);
    // executor-discretion decision present
    assert.match(ctx, /full discretion/i);
  });
});

describe("autonomous: buildAutopilotPrompt (D-03/D-04 — inline step sequence + guards)", () => {
  test("names the phase, lists the 4-tool sequence, and carries the no-recursion guard", () => {
    const p = buildAutopilotPrompt({ base: "GSD-50-add-tests", phaseNum: 50, phaseName: "add-tests" });
    assert.match(p, /GSD-50-add-tests/);
    assert.match(p, /Phase 50/);
    assert.match(p, /gsd_discuss/);
    assert.match(p, /gsd_plan/);
    assert.match(p, /gsd_execute/);
    assert.match(p, /gsd_verify/);
    // the child spawns with no toolFilter, so the prompt is the only recursion /
    // ship / lifecycle defence (D-10)
    assert.match(p, /no recursion/);
    assert.match(p, /do not call gsd_ship/);
  });
});

// ── integration ───────────────────────────────────────────────────────────────

describe("autonomous: gsd_autonomous tool (integration)", () => {
  async function mountAutonomous({ subagents } = {}) {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, { subagents });
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyAutonomous(ctx, {});
    applyCommands(ctx, {});
    return { fs, ctx };
  }

  // Bootstrap a .planning/ project via gsd_init (creates PROJECT/REQUIREMENTS/
  // ROADMAP/STATE/config). gsd_init assigns 1-based n in the order given.
  async function bootstrap(ctx, phases, requirements) {
    const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
    assert.ok(gsdInit, "gsd_init not registered");
    await gsdInit.execute(
      { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases },
      makeExec(),
    );
  }

  // Overwrite ROADMAP with explicit phase numbers + statuses (discovery /
  // ordering tests need specific n and Complete markers).
  async function seedRoadmap(ctx, phases) {
    const gsdState = ctx.get("gsdState");
    await gsdState.writeRoadmap(CWD, {
      milestoneName: "M1",
      version: "v1.0",
      phases,
    });
    return gsdState;
  }

  // A controllable fake subagents service that captures each spawn request. When
  // `controller.fail` is set the spawn throws (D-09 subagent-fault path). `start`
  // AWAITS the capture hook so a capture that re-writes ROADMAP (ROADMAP-re-read
  // test) completes before the driver's verify readback (D-07).
  function makeAutonomousSubagents(controller) {
    return {
      getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
      async start(_n, req) {
        if (controller.capture) await controller.capture(req);
        if (controller.fail) throw new Error("autonomous subagent exploded");
        return { result: { output: [{ type: "text", text: "autopilot done" }], stopReason: "completed" }, dispose: () => {} };
      },
    };
  }

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

  function runAutonomous(ctx) {
    const t = ctx.tools.find((x) => x.name === "gsd_autonomous");
    assert.ok(t, "gsd_autonomous not registered");
    return t.execute({}, makeExec());
  }

  // ── capability + command + inject descriptors (D-01) ────────────────────────
  test("gsdAutonomous capability registered, out-of-band, order -1, tools/commands/produces/consumes match (D-01)", async () => {
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents({}) });
    assert.ok(ctx.provided.has("gsdAutonomous"), "gsdAutonomous must be provided");
    const cap = buildCapability("gsdAutonomous");
    assert.equal(cap.role, "out-of-band");
    assert.equal(cap.order, -1);
    assert.deepEqual([...cap.tools], ["gsd_autonomous"]);
    assert.deepEqual([...cap.commands], ["gsd-autonomous"]);
    assert.ok(cap.produces.includes("STATUS"), "produces must include STATUS");
    assert.ok(cap.consumes.includes("ROADMAP.md"), "consumes must include ROADMAP.md");
    assert.ok(cap.consumes.includes("CONTEXT.md"), "consumes must include CONTEXT.md");
  });

  test("/gsd-autonomous command is paired to the capability and routes to the tool (D-01)", async () => {
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents({}) });
    const cmd = ctx.commands.find((c) => c.name === "gsd-autonomous");
    assert.ok(cmd, "/gsd-autonomous command must be registered");
    // handler routes the invocation to the agent (no required args → no err)
    const followups = [];
    const out = await cmd.handler({
      rawInput: "",
      agent: { followup: (m) => followups.push(m) },
    });
    assert.equal(out.kind, "success");
    assert.match(out.text, /Autonomous/i);
    assert.equal(followups.length, 1, "the agent must receive a followup instructing it to run gsd_autonomous");
  });

  // ── (a) no-op when all phases complete (D-08) ────────────────────────────────
  test("(a) all phases complete → 'nothing to do', zero subagents spawned (D-08)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx, fs } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "Complete" }]);

    const res = await runAutonomous(ctx);
    assert.match(res, /nothing to do/);
    assert.equal(ctrl.captures.length, 0, "no subagent may be spawned when nothing is incomplete");
  });

  // ── (b) auto-CONTEXT shape + dispatch order (D-05/D-07) ─────────────────────
  test("(b) auto-derives minimal CONTEXT for a phase without one; dispatches in numeric order (D-05/D-07)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx, fs } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = await seedRoadmap(ctx, [
      { n: 52, name: "p2", goal: "g2", requirements: ["GAP-16"], status: "pending" },
      { n: 51, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" },
    ]);
    // Pre-seed p1 (n=51) VERIFICATION to passed so the driver's verify gate lets
    // the run continue to reach p2 (BEHAVIOURAL CONTRACT — the fake autopilot
    // does not write VERIFICATION, so the gate would otherwise stop on "missing").
    await gsdState.writeArtifact(CWD, 51, "VERIFICATION", "---\nstatus: passed\n---\n");

    const res = await runAutonomous(ctx);

    // dispatch order = numeric ascending: p1(51) then p2(52)
    const order = ctrl.captures.map((r) => {
      const m = r.prompt[0].text.match(/Phase (\d+)/);
      return m ? Number(m[1]) : null;
    });
    assert.deepEqual(order, [51, 52], "autopilots must be dispatched in numeric ascending order");

    // p1 had no CONTEXT → auto-derived with the marker + goal as in_scope
    const ctxText = await gsdState.readArtifact(CWD, 51, "CONTEXT");
    assert.match(ctxText, /Mode: Auto-generated \(discuss skipped — autonomous path\)/);
    assert.match(ctxText, /g1/);
    assert.match(res, /Phase 51 \(p1\)/);
    // every captured request carries a parent (the driving agent session)
    for (const r of ctrl.captures) assert.ok(r.parent, "autopilot request must carry the parent agent");
  });

  // ── (c) skip-discuss-when-context-exists (D-05) ──────────────────────────────
  test("(c) existing CONTEXT is left unchanged and no CONTEXT is re-derived (D-05)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" }]);
    const seeded = "---\nphase: 1\n---\n## Decisions\n- **D-01:** human-derived\n";
    await gsdState.writeArtifact(CWD, 1, "CONTEXT", seeded);

    await runAutonomous(ctx);

    // the run reaches the autopilot (i.e. plans) without re-deriving CONTEXT
    assert.equal(ctrl.captures.length, 1, "the phase must be dispatched");
    // the seeded CONTEXT is unchanged (skip-discuss)
    const after = await gsdState.readArtifact(CWD, 1, "CONTEXT");
    assert.equal(after, seeded, "existing CONTEXT must not be overwritten");
    assert.doesNotMatch(after, /Auto-generated/, "auto-derived marker must be absent for a human CONTEXT");
  });

  // ── (d) ROADMAP re-read between phases picks up inserted phases (D-07) ──────
  test("(d) ROADMAP is re-read after a passed phase and newly inserted phases are driven (D-07)", async () => {
    let done = false;
    const ctrl = { captures: [] };
    ctrl.capture = async (req) => {
      ctrl.captures.push(req);
      if (done) return;
      done = true;
      // on the FIRST spawn, inject an extra incomplete phase at n=2 so the
      // driver's post-phase ROADMAP re-read discovers it (D-07)
      await ctrl.gsdState.writeRoadmap(CWD, {
        milestoneName: "M1",
        version: "v1.0",
        phases: [
          { n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" },
          { n: 2, name: "pnew", goal: "gnew", requirements: ["GAP-16"], status: "pending" },
          { n: 3, name: "p2", goal: "g2", requirements: ["GAP-16"], status: "pending" },
        ],
      });
    };
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = await seedRoadmap(ctx, [
      { n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" },
      { n: 3, name: "p2", goal: "g2", requirements: ["GAP-16"], status: "pending" },
    ]);
    ctrl.gsdState = gsdState;
    // p1 passes its verify gate so the driver re-reads ROADMAP
    await gsdState.writeArtifact(CWD, 1, "VERIFICATION", "---\nstatus: passed\n---\n");

    await runAutonomous(ctx);

    const numbers = ctrl.captures.map((r) => {
      const m = r.prompt[0].text.match(/Phase (\d+)/);
      return m ? Number(m[1]) : null;
    });
    assert.ok(numbers.includes(2), "a phase inserted during the run must be picked up after the ROADMAP re-read");
  });

  // ── (e) verify-status readback → STATUS summary (D-04/D-11) ─────────────────
  test("(e) verify passed → per-phase STATUS 'passed' and overall 'completed' (D-11)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" }]);
    await gsdState.writeArtifact(CWD, 1, "VERIFICATION", "---\nstatus: passed\n---\n");

    const res = await runAutonomous(ctx);
    assert.match(res, /- Phase 1 \(p1\): passed/);
    assert.match(res, /outcome: completed/);
  });

  // ── (f) non-passed verify → hard-failure stop + resume (D-09) ───────────────
  test("(f) verify gaps_found → stopped, resume command, no later phase spawns (D-09)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = await seedRoadmap(ctx, [
      { n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" },
      { n: 2, name: "p2", goal: "g2", requirements: ["GAP-16"], status: "pending" },
    ]);
    await gsdState.writeArtifact(CWD, 1, "VERIFICATION", "---\nstatus: gaps_found\n---\n");

    const res = await runAutonomous(ctx);
    assert.match(res, /outcome: stopped/);
    assert.match(res, /resume: \/gsd-autonomous/);
    assert.match(res, /gaps_found/);
    assert.match(res, /Phase 1/);
    // no later phase (p2, n=2) is spawned after the first failure
    assert.equal(ctrl.captures.length, 1, "the run must stop on the first hard failure");
  });

  test("(f) missing VERIFICATION → stopped (nothing written by the autopilot is a stop, D-09)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" }]);

    const res = await runAutonomous(ctx);
    assert.match(res, /outcome: stopped/);
    assert.match(res, /resume: \/gsd-autonomous/);
    assert.match(res, /missing/, "missing VERIFICATION must surface as a stop reason");
  });

  // ── (g) subagent spawn throw → hard-failure stop naming the autopilot step (D-09) ─
  test("(g) autopilot spawn throw → stopped, autopilot step named, no later phase (D-09)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents({ fail: true, capture: (req) => ctrl.captures.push(req) }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedRoadmap(ctx, [
      { n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "pending" },
      { n: 2, name: "p2", goal: "g2", requirements: ["GAP-16"], status: "pending" },
    ]);

    const res = await runAutonomous(ctx);
    assert.match(res, /outcome: stopped/);
    assert.match(res, /resume: \/gsd-autonomous/);
    assert.match(res, /autopilot/, "the stop reason must name the autopilot step");
    assert.match(res, /Phase 1/);
    assert.equal(ctrl.captures.length, 1, "the run must stop before spawning p2");
  });

  // ── (h) never mutates STATE (D-10) ──────────────────────────────────────────
  test("(h) gsd_autonomous does NOT advance STATE (D-10 — advisory, soft gate)", async () => {
    const ctrl = { captures: [] };
    ctrl.capture = (req) => ctrl.captures.push(req);
    const { ctx } = await mountAutonomous({ subagents: makeAutonomousSubagents(ctrl) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-16"] }], [{ id: "GAP-16", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = await seedRoadmap(ctx, [{ n: 1, name: "p1", goal: "g1", requirements: ["GAP-16"], status: "Complete" }]);

    const before = await gsdState.readState(CWD);
    await runAutonomous(ctx);
    const after = await gsdState.readState(CWD);

    assert.equal(after.frontmatter.status, before.frontmatter.status, "STATE status must not change");
    assert.equal(after.frontmatter.next_action, before.frontmatter.next_action, "STATE next_action must not change");
    assert.equal(after.frontmatter.active_phase, before.frontmatter.active_phase, "STATE active_phase must not change");
  });
});
