// Offline behavioural tests for the add-tests generator (lib/add-tests.js,
// opengsd /gsd-add-tests / GAP-16). TDD per D-12.
//
// Covers every behaviour the CONTEXT decisions call out:
//   - D-01  capability descriptor (gsdAddTests) + /gsd-add-tests command pairing
//   - D-04  completed-phase-only guard; advisory (never advances STATE, never ships)
//   - D-05  deterministic SUMMARY key-files extraction + writer dispatch
//   - D-06  resolveWriterOutput / TEST_WRITER_SCHEMA structured-output validation
//   - D-07  validateTestPaths hard path boundary (never writes impl/traversal)
//   - D-08  atomic commitSourceFiles message + <NN>-ATEST.md report
//   - D-09  single classification gate (--proceed/--auto/--cancel), nothing
//           spawned or written before approval
//   - D-10  degrade-with-flag (UNAVAILABLE ATEST) on writer fault / malformed
//           output / empty accepted set, never rethrowing
//   - D-11  report bugs, never fix; never execute the suite
//   - D-03  the "E2E" tier is Integration/loop-level node:test (mount-harness)
//
// Offline only: FakeFs + fake ctx + fake subagents factory (controllable
// structured output) + fake gitFn (assertable commit argv). No live boot, no
// real subagent, no real git/gh.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { CAPABILITY_KEYS, allCapabilities, NOT_LOOP_ORDERED } from "../lib/_capabilities.js";
import { validateTestPaths, detectTestInfra } from "../lib/validate-phase.js";
import { TEST_WRITER_STATUSES } from "../lib/_agents.js";
import { parseFrontmatter } from "../lib/_shared.js";
import { apply as applyState } from "../lib/state.js";
import {
  extractChangedFiles,
  TEST_WRITER_SCHEMA,
  resolveWriterOutput,
  buildATestBody,
  apply as applyAddTests,
} from "../lib/add-tests.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Task 1: pure helpers + capability descriptor + command pairing (D-01/D-05/D-06)
// ═══════════════════════════════════════════════════════════════════════════════

describe("add-tests: gsdAddTests capability descriptor (D-01)", () => {
  test("gsdAddTests is present in CAPABILITY_KEYS and allCapabilities()", () => {
    assert.ok(CAPABILITY_KEYS.includes("gsdAddTests"), "gsdAddTests must be a known capability");
    const cap = allCapabilities().find((c) => c.key === "gsdAddTests");
    assert.ok(cap, "gsdAddTests descriptor missing from allCapabilities()");
  });

  test("the descriptor is out-of-band, NOT_LOOP_ORDERED, with the declared tools/commands/produces/consumes", () => {
    const cap = allCapabilities().find((c) => c.key === "gsdAddTests");
    assert.equal(cap.role, "out-of-band");
    assert.ok(Array.isArray(cap.tools) && cap.tools.length > 0);
    assert.deepEqual(cap.tools, ["gsd_add_tests"]);
    assert.deepEqual(cap.commands, ["gsd-add-tests"]);
    assert.equal(cap.order, NOT_LOOP_ORDERED);
    assert.deepEqual(cap.produces, ["<NN>-ATEST.md", "TEST files"]);
    assert.deepEqual(cap.consumes, ["SUMMARY.md", "CONTEXT.md", "VERIFICATION.md"]);
  });
});

describe("add-tests: /gsd-add-tests command pairing (D-01)", () => {
  test("gsd-add-tests is the command owned by gsdAddTests", () => {
    const cap = allCapabilities().find((c) => c.key === "gsdAddTests");
    assert.ok(cap, "gsdAddTests descriptor missing");
    // commandToCapability pairs every descriptor command back to its capability.
    assert.ok(cap.commands.includes("gsd-add-tests"), "descriptor must advertise /gsd-add-tests");
    // The tool the command routes to is the gsd_add_tests tool in lib/add-tests.js.
    assert.ok(cap.tools.includes("gsd_add_tests"), "descriptor must own gsd_add_tests");
  });
});

describe("add-tests: extractChangedFiles — deterministic SUMMARY key-files (D-05)", () => {
  const one = [
    "---",
    "key-files:",
    "  created: [lib/a.js, test/a.test.mjs]",
    "  modified: [lib/a.js, lib/b.js]",
    "---",
    "body",
  ].join("\n");
  const two = "---\nkey-files:\n  created: [test/c.test.mjs]\n---\nbody";

  test("flattens + dedupes key-files.created/modified preserves order", () => {
    assert.deepEqual(extractChangedFiles([one, two], { filter: true }), [
      "lib/a.js",
      "test/a.test.mjs",
      "lib/b.js",
      "test/c.test.mjs",
    ]);
  });

  test("empty summary list yields []", () => {
    assert.deepEqual(extractChangedFiles([], { filter: true }), []);
    assert.deepEqual(extractChangedFiles([null, undefined, ""], { filter: true }), []);
  });

  test("filterSourcePaths prunes root artefacts (.planning/, ROADMAP.md, *-SUMMARY.md, lockfiles)", () => {
    const withRoots = [
      "---",
      "key-files:",
      "  created: [test/a.test.mjs]",
      "  modified: [ROADMAP.md, .planning/STATE.md, lib/impl.js, GSD-50-add-tests-01-SUMMARY.md, package-lock.json]",
      "---",
      "body",
    ].join("\n");
    const out = extractChangedFiles([withRoots], { filter: true });
    assert.deepEqual(out, ["test/a.test.mjs", "lib/impl.js"]);
  });
});

describe("add-tests: resolveWriterOutput validation (D-06)", () => {
  const good = {
    tests_written: [{ path: "test/a.test.mjs", req_id: "GAP-16", content: "import { test } from 'node:test';", type: "Unit" }],
    status: "GENERATED",
  };

  test("accepts a valid object with a well-shaped tests_written + a status in the enum", () => {
    const out = resolveWriterOutput(good);
    assert.ok(out, "valid writer output must resolve truthy");
    assert.equal(out, good);
    // Each accepted status GENERATED/PARTIAL/ESCALATE validates.
    for (const s of TEST_WRITER_STATUSES) {
      assert.ok(resolveWriterOutput({ ...good, status: s }), `status ${s} must validate`);
    }
  });

  test("returns null for non-object / missing or non-array tests_written", () => {
    assert.equal(resolveWriterOutput(null), null);
    assert.equal(resolveWriterOutput(undefined), null);
    assert.equal(resolveWriterOutput("nope"), null);
    assert.equal(resolveWriterOutput({}), null);
    assert.equal(resolveWriterOutput({ status: "GENERATED" }), null);
    assert.equal(resolveWriterOutput({ tests_written: "not-an-array", status: "GENERATED" }), null);
  });

  test("returns null when an entry lacks string path/req_id/content or the status is invalid", () => {
    assert.equal(resolveWriterOutput({ tests_written: [{ path: 123, req_id: 1, content: {} }], status: "GENERATED" }), null);
    assert.equal(resolveWriterOutput({ tests_written: [{ req_id: "X", content: "c" }], status: "GENERATED" }), null);
    assert.equal(resolveWriterOutput({ tests_written: [{ path: "p", req_id: "X", content: "c" }], status: "NOT_A_STATUS" }), null);
    assert.equal(resolveWriterOutput({ tests_written: [], status: "NOT_A_STATUS" }), null);
  });
});

describe("add-tests: buildATestBody renders the report (D-11 no-fix note)", () => {
  const body = buildATestBody({
    phaseN: 50,
    phaseName: "add-tests",
    phaseGoal: "goal",
    status: "GENERATED",
    files: [{ path: "test/a.test.mjs", req_id: "GAP-16", type: "Integration" }],
    skipped: [{ path: "lib/x.js", reason: "rejected" }],
    escalated: [{ req_id: "GAP-16", reason: "bug — expected/actual" }],
    gaps: ["GAP-16"],
    suggestedCommand: "node --test test/*.test.mjs",
    notes: "",
    date: "2026-09-04",
  });

  test("buildATestBody renders the header, file list, gaps, command, and a report-only no-fix note", () => {
    assert.match(body, /# Phase 50: add-tests - Add-Tests Report/);
    assert.ok(body.includes("test/a.test.mjs"));
    assert.ok(body.includes("GAP-16"));
    assert.ok(body.includes("node --test test/*.test.mjs"));
    assert.match(body, /Generated:\*\* GENERATED/);
    // The no-fix rule: bugs appear under a report-only section, never fixed (D-11).
    assert.match(body, /## Bugs \(report-only\)/);
    assert.match(body, /bug — expected\/actual/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Task 2: tool behaviour — gate, dispatch, path boundary, atomic commit, advisory,
// degrade, no-fix (D-04/D-05/D-06/D-07/D-08/D-09/D-10/D-11).
// ═══════════════════════════════════════════════════════════════════════════════

// A controllable fake gsd-add-tests-writer subagents factory (mirrors the fake
// auditor in test/validate-phase.test.mjs). Records every spawn so tests can
// assert nothing is spawned before the gate; captures the promptText.
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

// A fake gitFn that records argv and simulates staging/committing so
// commitSourceFiles works and its commit -m message is assertable.
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

describe("add-tests: gsd_add_tests tool behaviour (D-04/D-05/D-06/D-07/D-08/D-09/D-10/D-11)", () => {
  const exec = makeExec();

  async function mountAddTests({ subagents } = {}) {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, { subagents });
    applyState(ctx, {});
    applyAddTests(ctx, {});
    return { fs, ctx };
  }

  async function bootstrapPhase50(ctx) {
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
    // Seed CONTEXT + VERIFICATION with the req token so the writer prompt
    // carries the phase's UAT criteria + req id (D-05).
    await s.writeArtifact(CWD, 50, "CONTEXT", "---\nphase: 50-add-tests\n---\n# Context\nGAP-16: the add-tests generator contract.");
    await s.writeArtifact(CWD, 50, "VERIFICATION", "---\nphase: 50-add-tests\nstatus: passed\n---\nVerified GAP-16 requirements met.");
    return s;
  }

  function runAddTests(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_add_tests");
    assert.ok(t, "gsd_add_tests not registered");
    return t.execute(args, exec);
  }

  test("fail-fast: no .planning/ project rejects", async () => {
    const { ctx } = await mountAddTests();
    await assert.rejects(runAddTests(ctx, { phase: 50 }), /no \.planning\/ project/);
  });

  test("fail-fast: phase not in ROADMAP.md rejects (D-10)", async () => {
    const { ctx } = await mountAddTests();
    const s = ctx.get("gsdState");
    // Project only has phase 1 (no 50) — 999 is not in ROADMAP.
    await s.initProject(CWD, {
      name: "demo", milestoneName: "M1", version: "v1.0",
      requirements: [{ id: "X", text: "x" }],
      phases: [{ n: 1, name: "other", goal: "g", requirements: ["X"] }],
    });
    await assert.rejects(runAddTests(ctx, { phase: 999 }), /phase 999 not in ROADMAP\.md/);
  });

  test("fail-fast: phase not executed (no SUMMARY) rejects without writing an ATEST (D-04/D-10)", async () => {
    const { ctx } = await mountAddTests();
    const s = ctx.get("gsdState");
    await s.initProject(CWD, {
      name: "demo", milestoneName: "M1", version: "v1.0",
      requirements: [{ id: "GAP-16", text: "x" }],
      phases: [{ n: 50, name: "add-tests", goal: "g", requirements: ["GAP-16"] }],
    });
    // PLAN present but NO SUMMARY → phase not executed. The tool throws the
    // D-10 guard "not executed (no SUMMARY found — run gsd_execute first)".
    await s.writeArtifact(CWD, 50, "PLAN-01", "---\nphase: 50-add-tests\nplan: 01\n---\n<objective>t</objective>\nbody");
    await assert.rejects(
      runAddTests(ctx, { phase: 50 }),
      /not executed \(no SUMMARY found — run gsd_execute first\)/,
      "should fail-fast on a completed-phase missing SUMMARY",
    );
    assert.equal(await s.hasArtifact(CWD, 50, "ATEST"), false, "no ATEST on a non-executed phase");
  });

  test("classification gate: no --proceed/--auto → plan returned, NO spawn, NO write (D-09)", async () => {
    const sub = makeAddTestsSubagents({ structured: null });
    const { ctx } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");

    const res = await runAddTests(ctx, { phase: 50 });
    // The gate surfaces the deterministic changed-file scope + proceed/auto/cancel.
    assert.match(res, /test\/foo\.test\.mjs/);
    assert.match(res, /lib\/impl\.js/);
    assert.match(res, /--proceed/);
    assert.match(res, /--auto/);
    assert.match(res, /--cancel/);

    assert.equal(sub.spawns.length, 0, "gate must not spawn the writer");
    assert.equal(await s.hasArtifact(CWD, 50, "ATEST"), false, "gate must not write an ATEST");
    const written = await ctx.fs.stat(await ctx.fs.resolve(`${CWD}/test/foo.test.mjs`));
    assert.equal(written, undefined, "gate must not write any test file");
  });

  test("cancel: no spawn, no write; --cancel alone is intercepted by the gate (D-09)", async () => {
    const sub = makeAddTestsSubagents({ structured: null });
    const { ctx } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");

    // The gate (proceed/auto absent) fires before the cancel branch — safe: no
    // spawn/write happens. This documents the tool's gate-first ordering.
    let res = await runAddTests(ctx, { phase: 50, cancel: true });
    assert.match(res, /--proceed/);
    assert.equal(sub.spawns.length, 0, "cancel must not spawn the writer");
    assert.equal(await s.hasArtifact(CWD, 50, "ATEST"), false, "cancel must not write an ATEST");

    // With --auto (bypassing the gate) the cancel branch is reached and aborts.
    res = await runAddTests(ctx, { phase: 50, cancel: true, auto: true });
    assert.match(res, /cancelled/i);
    assert.equal(sub.spawns.length, 0, "cancel branch must not spawn the writer");
    assert.equal(await s.hasArtifact(CWD, 50, "ATEST"), false, "cancel branch must not write an ATEST");
  });

  test("writer dispatch: accepted tests written, atomically committed, ATEST written (D-05/D-06/D-08)", async () => {
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
    const sub = makeAddTestsSubagents({ structured: VALID });
    const { ctx, fs } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runAddTests(ctx, { phase: 50, proceed: true });
    assert.match(res, /generated 1 test file\(s\)/);

    // The writer-returned test path was written to the FakeFs.
    const written = await ctx.fs.readText(await ctx.fs.resolve(`${CWD}/test/add-tests-50.test.mjs`));
    assert.match(written, /node:test/, "accepted test file content not written");

    // Atomic commit used the exact D-08 message via commitSourceFiles (fake git).
    const commitMsgs = git.calls.filter((c) => c[0] === "commit").map((c) => c[c.length - 1] || "");
    assert.ok(
      commitMsgs.includes("test(phase-50): add unit and E2E tests from add-tests command"),
      `expected atomic commit message, got ${JSON.stringify(commitMsgs)}`,
    );

    // The <NN>-ATEST.md coverage report was written.
    const atest = await s.readArtifact(CWD, 50, "ATEST");
    assert.ok(atest, "ATEST.md must be written after a successful run");
    assert.match(atest, /## Generated Test Files/);
    assert.match(atest, /## Bugs \(report-only\)/);

    // The writer prompt carried the phase_context, the changed-file scope, and the req token.
    assert.equal(sub.spawns.length, 1, "exactly one writer spawn");
    const promptText = sub.spawns[0].prompt[0].text;
    assert.match(promptText, /gsd-add-tests-writer/);
    assert.match(promptText, /GAP-16/);
    assert.match(promptText, /test\/foo\.test\.mjs/);
  });

  test("path hard boundary: traversing/absolute/impl/empty skipped, only test paths written (D-07/R-5)", async () => {
    const sub = makeAddTestsSubagents({
      structured: {
        tests_written: [
          { path: "/abs/etc/passwd", req_id: "GAP-16", content: "x", type: "Unit" },
          { path: "../lib/evil.js", req_id: "GAP-16", content: "x", type: "Unit" },
          { path: "lib/impl.js", req_id: "GAP-16", content: "x", type: "Unit" },
          { path: "test/good1.test.mjs", req_id: "GAP-16", content: "import { test } from 'node:test';", type: "Unit" },
          { path: "", req_id: "GAP-16", content: "x", type: "Unit" },
        ],
        status: "PARTIAL",
        escalated: [],
        notes: "",
      },
    });
    const { ctx, fs } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    await runAddTests(ctx, { phase: 50, proceed: true });

    // Only test/good1.test.mjs is written; the boundary-rejected paths are not.
    const good = await ctx.fs.stat(await ctx.fs.resolve(`${CWD}/test/good1.test.mjs`));
    assert.ok(good, "valid test path must be written");
    for (const bad of ["/abs/etc/passwd", "../lib/evil.js", "lib/impl.js"]) {
      const target = await ctx.fs.resolve(`${CWD}/${bad.replace(/^\/+/, "").replace(/^\.\.\/+/, "")}`);
      assert.equal(await ctx.fs.stat(target), undefined, `boundary-rejected path must NOT be written: ${bad}`);
    }

    // commitSourceFiles was called with ONLY the valid path.
    const adds = git.calls.filter((c) => c[0] === "add").map((c) => c.slice(1));
    assert.deepEqual(adds, [["test/good1.test.mjs"]], "only the valid test path may be staged");

    // The tool-side validateTestPaths contract returns only test-shaped relative
    // non-traversing paths as valid (R-5 hard boundary).
    const { valid, skipped } = validateTestPaths(["../lib/evil.js", "/abs/x", "lib/impl.js", "", "test/good.test.mjs"]);
    assert.deepEqual(skipped, ["../lib/evil.js", "/abs/x", "lib/impl.js", ""]);
    assert.deepEqual(valid, ["test/good.test.mjs"]);
  });

  test("advisory: successful run never mutates STATE (no setActivePhase/completePhase) (D-04)", async () => {
    const VALID = {
      tests_written: [{ path: "test/add-tests-50.test.mjs", req_id: "GAP-16", content: "import { test } from 'node:test';\ntest('ok', () => {});", type: "Integration" }],
      skip: [],
      status: "GENERATED",
      escalated: [],
      notes: "",
    };
    const sub = makeAddTestsSubagents({ structured: VALID });
    const { ctx } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");
    ctx.gitFn = makeFakeGit().fakeGit;

    const before = await s.readState(CWD);
    await runAddTests(ctx, { phase: 50, proceed: true });
    const after = await s.readState(CWD);

    // STATE is byte-identical: add-tests is advisory, it never advances the loop.
    assert.equal(JSON.stringify(after), JSON.stringify(before), "STATE must be unchanged after add-tests");
    assert.equal(after.frontmatter.status, "idle", "STATE step stays idle (never setActivePhase)");
  });

  test("degrade-with-flag: writer spawn throw writes UNAVAILABLE ATEST, never rethrows (D-10)", async () => {
    const sub = makeAddTestsSubagents({ fail: true, error: "writer exploded" });
    const { ctx } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");

    const res = await runAddTests(ctx, { phase: 50, proceed: true });
    assert.match(res, /UNAVAILABLE/);
    assert.match(res, /writer exploded/);

    const atest = await s.readArtifact(CWD, 50, "ATEST");
    assert.ok(atest, "ATEST must be written on writer fault (degrade, not throw)");
    const { frontmatter } = parseFrontmatter(atest);
    assert.equal(frontmatter.status, "UNAVAILABLE");
    assert.match(atest, /\*\*Status:\*\* UNAVAILABLE/);
    assert.match(atest, /writer exploded/);
    // No accepted test file was written.
    const written = await ctx.fs.stat(await ctx.fs.resolve(`${CWD}/test/add-tests-50.test.mjs`));
    assert.equal(written, undefined, "no test file written on writer fault");
  });

  test("degrade-with-flag: malformed writer output → UNAVAILABLE (D-10)", async () => {
    const sub = makeAddTestsSubagents({ structured: { tests_written: "nope", status: "GENERATED" } });
    const { ctx } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");

    const res = await runAddTests(ctx, { phase: 50, proceed: true });
    assert.match(res, /UNAVAILABLE/);
    assert.match(res, /malformed structured output/);

    const atest = await s.readArtifact(CWD, 50, "ATEST");
    assert.ok(atest);
    assert.match(atest, /\*\*Status:\*\* UNAVAILABLE/);
  });

  test("degrade-with-flag: all writer paths rejected by the boundary → UNAVAILABLE (D-10)", async () => {
    const sub = makeAddTestsSubagents({
      structured: {
        tests_written: [{ path: "lib/impl.js", req_id: "GAP-16", content: "x", type: "Unit" }],
        status: "ESCALATE",
        escalated: [],
        notes: "",
      },
    });
    const { ctx } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");
    ctx.gitFn = makeFakeGit().fakeGit;

    const res = await runAddTests(ctx, { phase: 50, proceed: true });
    assert.match(res, /UNAVAILABLE/);
    assert.match(res, /no accepted test files/);

    const atest = await s.readArtifact(CWD, 50, "ATEST");
    assert.ok(atest);
    assert.match(atest, /\*\*Status:\*\* UNAVAILABLE/);
  });

  test("no-fix bug reporting, and the tool never executes the suite (D-11)", async () => {
    const sub = makeAddTestsSubagents({
      structured: {
        tests_written: [{ path: "test/bug-report.test.mjs", req_id: "GAP-16", content: "import { test } from 'node:test';\ntest('b', () => {});", type: "Unit" }],
        skip: [],
        status: "GENERATED",
        escalated: [{ req_id: "GAP-16", reason: "assertion failed — expected 2, actual 3 in lib/x.js" }],
        notes: "",
      },
    });
    const { ctx, fs } = await mountAddTests({ subagents: sub.service });
    await bootstrapPhase50(ctx);
    const s = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runAddTests(ctx, { phase: 50, proceed: true });

    // The surfaced bug is report-only — it must be flagged but never fixed.
    assert.match(res, /report-only|not fixed/i);
    assert.match(res, /expected 2, actual 3/);
    assert.match(res, /does not execute the suite/);

    // No implementation file was written by the tool.
    const impl = await ctx.fs.stat(await ctx.fs.resolve(`${CWD}/lib/x.js`));
    assert.equal(impl, undefined, "implementation file must never be written/fixed");

    // The tool never ran npm test / node --test (surfaces the command only).
    assert.equal(
      git.calls.some((c) => c[0] === "npm" || (c[0] === "node" && String(c[1] || "").includes("--test"))),
      false,
      "add-tests must not execute the test suite",
    );

    // The suggested run command is surfaced in the report.
    const atest = await s.readArtifact(CWD, 50, "ATEST");
    assert.ok(atest);
    assert.match(atest, /node --test test\/\*\.test\.mjs/);
  });
});
