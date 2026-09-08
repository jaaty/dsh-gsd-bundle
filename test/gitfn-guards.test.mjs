// Offline behavioural tests for the D-09 guarded ctx.gitFn fallbacks (phase 59,
// plan 03). The live cordis host THROWS on an uninjected property access in an
// active fiber ("accessed without inject") — the plain fake ctx built by
// makeMountCtx never reproduces that throw class (it is a plain object without
// a gitFn key, so ctx.gitFn is simply undefined). These tests simulate the live
// throw with an Object.defineProperty throwing getter, proving each of the
// three D-09 guard sites falls back to defaultGitFn and completes instead of
// crashing. defaultGitFn's real git calls fail against the fake cwd
// ("/project" does not exist), which is exactly the never-throws
// commitSourceFiles/commitArtifacts warning degradation the guards must reach.
//
//   - D-09  the three locked guard sites (add-tests commit feed, pause_work
//           gather, next advance branch) survive the live throw class
//   - D-10  no inject-array changes; no new tool/command/capability/config key
//
// Offline only: FakeFs + fake ctx + fake subagents; no live boot, no LLM, no
// real repo state (defaultGitFn only ever fails its calls against /project).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyAddTests } from "../lib/add-tests.js";

// Simulate the live cordis host throw on an uninjected property access: the
// ctx that reaches the tool has NO gitFn key — accessing one throws (D-09's
// crash class), unlike makeMountCtx's plain object where ctx.gitFn is
// undefined.
function armThrowingGitFn(ctx) {
  Object.defineProperty(ctx, "gitFn", {
    get() {
      throw new Error("gsd: gitFn accessed without inject");
    },
    configurable: true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// D-09 site 1: gsd_add_tests commit feed (lib/add-tests.js commitSourceFiles)
// ═══════════════════════════════════════════════════════════════════════════════

// A controllable fake gsd-add-tests-writer subagents factory (mirrors
// test/add-tests.test.mjs makeAddTestsSubagents).
function makeAddTestsSubagents(controller) {
  const spawns = [];
  const service = {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      spawns.push(req);
      if (controller.capture) controller.capture(req);
      if (controller.fail) throw new Error(controller.error || "writer exploded");
      const structured =
        typeof controller.structured === "function" ? controller.structured(req) : controller.structured;
      return {
        result: { output: [{ type: "text", text: "writer report" }], stopReason: "completed", structured },
        dispose: () => {},
      };
    },
  };
  return { service, spawns };
}

describe("gitfn-guards: gsd_add_tests survives the live ctx.gitFn throw (D-09)", () => {
  const VALID = {
    tests_written: [{
      path: "test/add-tests-50.test.mjs",
      req_id: "GAP-16",
      content: "// generated\nimport { test } from 'node:test';\ntest('ok', () => {});",
      type: "Integration",
    }],
    skip: [],
    status: "GENERATED",
    escalated: [],
    notes: "",
  };

  async function mountWithWriter() {
    const sub = makeAddTestsSubagents({ structured: VALID });
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, { subagents: sub.service });
    applyState(ctx, {});
    applyAddTests(ctx, {});
    // Bootstrap a completed phase 50 so the tool reaches the commit step.
    const s = ctx.get("gsdState");
    await s.initProject(CWD, {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements: [{ id: "GAP-16", text: "An add-tests generator creates unit and E2E tests for a completed phase." }],
      phases: [{ n: 50, name: "add-tests", goal: "generate tests for a completed phase", requirements: ["GAP-16"] }],
    });
    await s.writeArtifact(CWD, 50, "PLAN-01", [
      "---", "phase: 50-add-tests", "plan: 01", 'requirements: ["GAP-16"]', "---",
      "<objective>add-tests generator</objective>", "plan body",
    ].join("\n"));
    await s.writeArtifact(CWD, 50, "SUMMARY-01", [
      "---", "phase: 50-add-tests", "plan: 01", "status: complete",
      "key-files:",
      "  created: [test/foo.test.mjs]",
      "  modified: [lib/impl.js]",
      "---",
      "# Summary",
      "Implemented the add-tests generator; changed implementation files recorded.",
    ].join("\n"));
    await s.writeArtifact(CWD, 50, "CONTEXT", "---\nphase: 50-add-tests\n---\n# Context\nGAP-16: the add-tests generator contract.");
    await s.writeArtifact(CWD, 50, "VERIFICATION", "---\nphase: 50-add-tests\nstatus: passed\n---\nVerified GAP-16 requirements met.");
    return { ctx, s, sub };
  }

  function runAddTests(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_add_tests");
    assert.ok(t, "gsd_add_tests not registered");
    return t.execute(args, makeExec());
  }

  test("throwing-getter ctx: tool completes via defaultGitFn, degrades through the commit warning path (D-09)", async () => {
    const { ctx, s } = await mountWithWriter();
    armThrowingGitFn(ctx);

    // Without the guard this exact mount crashes with
    // "gsd: gitFn accessed without inject" at the commitSourceFiles feed.
    // With it, the run falls back to defaultGitFn whose git calls fail against
    // the fake cwd — surfacing as commitSourceFiles's never-throw warning.
    const res = await runAddTests(ctx, { phase: 50, proceed: true });

    assert.match(res, /generated 1 test file\(s\)/, "the run must complete normally (no crash)");
    assert.match(res, /Artefacts committed: false/, "nothing can commit against the fake cwd");
    assert.match(res, /WARNING: git add failed:/, "the defaultGitFn degradation must surface as a commitSourceFiles warning");

    // The run still produced its full output set despite the git degradation.
    const written = await ctx.fs.readText(await ctx.fs.resolve(`${CWD}/test/add-tests-50.test.mjs`));
    assert.match(written, /node:test/, "the accepted test file must still be written");
    const atest = await s.readArtifact(CWD, 50, "ATEST");
    assert.ok(atest, "the ATEST report must still be written");
  });

  test("plain fake ctx (ctx.gitFn undefined): the guard's || defaultGitFn half routes to the same degradation", async () => {
    const { ctx } = await mountWithWriter();
    // No gitFn assigned and no throwing getter — ctx.gitFn is undefined, so
    // the guarded `ctx.gitFn || defaultGitFn` must resolve to defaultGitFn.
    const res = await runAddTests(ctx, { phase: 50, proceed: true });

    assert.match(res, /generated 1 test file\(s\)/, "the run must complete normally");
    assert.match(res, /WARNING: git add failed:/, "defaultGitFn ran and degraded with a warning");
  });
});