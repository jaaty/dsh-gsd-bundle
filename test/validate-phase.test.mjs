// Offline behavioural tests for the validate-phase plugin (lib/validate-phase.js),
// TDD per D-13. This file covers the deterministic first half of the hybrid
// engine (D-04): the PURE scan helpers (no ctx, no I/O) that map a completed
// phase's requirements to automated tests and build the VALIDATION.md gap table.
// The gsd_nyquist_auditor test-writer and the gap-plan confirmation gate land in
// Plan 02; the integration test proving gsd_validate_phase writes VALIDATION.md
// and advances STATE to the 'validate' step is added in Task 2 / Plan 01.
//
// Offline only (D-13): FakeFs + fake-ctx, no live boot, no LLM/git/gh.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyValidatePhase } from "../lib/validate-phase.js";
import { parseFrontmatter } from "../lib/_shared.js";
import { VALIDATION_AUDITOR_PROMPT } from "../lib/_agents.js";

import {
  detectTestInfra,
  isTestPath,
  validateTestPaths,
  classifyGaps,
  markManualOnly,
  classifyStatus,
  assembleValidationTable,
  VALIDATION_AUDITOR_SCHEMA,
  resolveAuditorOutput,
  needsGapWriting,
  renderSignOff,
} from "../lib/validate-phase.js";
describe("validate-phase: detectTestInfra (D-04/D-05)", () => {
  test("jest.config basename → kind jest with --runInBand", () => {
    const r = detectTestInfra({ configFiles: ["jest.config.js", "package.json"] });
    assert.equal(r.kind, "jest");
    assert.equal(r.suggested_command, "npx jest --runInBand");
    assert.deepEqual(r.testPatterns, ["**/*.test.{js,ts,jsx,tsx}"]);
  });

  test("vitest.config basename → kind vitest with vitest run", () => {
    const r = detectTestInfra({ configFiles: ["vitest.config.ts"] });
    assert.equal(r.kind, "vitest");
    assert.equal(r.suggested_command, "npx vitest run");
    assert.deepEqual(r.testPatterns, ["**/*.test.{js,ts,jsx,tsx}"]);
  });

  test("no jest/vitest config → kind node with node --test, and jest wins over vitest", () => {
    const r = detectTestInfra({ configFiles: ["package.json"] });
    assert.equal(r.kind, "node");
    assert.equal(r.suggested_command, "node --test");
    assert.deepEqual(r.testPatterns, ["**/*.test.{js,mjs}"]);
    const both = detectTestInfra({ configFiles: ["jest.config.js", "vitest.config.ts"] });
    assert.equal(both.kind, "jest", "jest should take precedence over vitest");
  });
});

describe("validate-phase: isTestPath (D-08 shape detection)", () => {
  test("*.test.* and *.spec.* basenames are test paths", () => {
    assert.equal(isTestPath("x.test.mjs"), true);
    assert.equal(isTestPath("src/util.spec.ts"), true);
    assert.equal(isTestPath("a.b.test.jsx"), true);
  });

  test("test_ prefix filenames are test paths", () => {
    assert.equal(isTestPath("test_util.py"), true);
    assert.equal(isTestPath("src/test_math.cpp"), true);
  });

  test("/test/, /tests/, /__tests__/ path segments are test paths", () => {
    assert.equal(isTestPath("src/test/util.js"), true);
    assert.equal(isTestPath("tests/e2e.spec.js"), true);
    assert.equal(isTestPath("__tests__/foo.js"), true);
  });

  test("implementation files are not test paths", () => {
    assert.equal(isTestPath("src/impl.js"), false);
    assert.equal(isTestPath("lib/validate-phase.js"), false);
    assert.equal(isTestPath("package.json"), false);
  });
});

describe("validate-phase: validateTestPaths (D-06/R-5 tool-side boundary)", () => {
  test("accepts test-shaped relative paths and rejects traversal/absolute/impl/empty", () => {
    const { valid, skipped } = validateTestPaths([
      "test/x.test.mjs",
      "../escape.test.js",
      "/abs.test.js",
      "src/impl.js",
      "",
      "test/../escape2.test.js",
      "deep/nested.spec.ts",
    ]);
    assert.deepEqual(valid, ["test/x.test.mjs", "deep/nested.spec.ts"]);
    assert.deepEqual(skipped, ["../escape.test.js", "/abs.test.js", "src/impl.js", "", "test/../escape2.test.js"]);
  });

  test("empty input yields empty valid/skipped", () => {
    assert.deepEqual(validateTestPaths(), { valid: [], skipped: [] });
    assert.deepEqual(validateTestPaths([]), { valid: [], skipped: [] });
  });
});

describe("validate-phase: classifyGaps (D-04/D-08)", () => {
  test("presence of a non-failing test → COVERED", () => {
    const rows = classifyGaps({ "GAP-06": [{ path: "x.test.mjs", failing: false }] });
    assert.deepEqual(rows, [
      { reqId: "GAP-06", classification: "COVERED", testFiles: ["x.test.mjs"] },
    ]);
  });

  test("no test → MISSING", () => {
    const rows = classifyGaps({ "GAP-06": [] });
    assert.deepEqual(rows, [{ reqId: "GAP-06", classification: "MISSING", testFiles: [] }]);
  });

  test("a known-failing test → PARTIAL", () => {
    const rows = classifyGaps({ "GAP-06": [{ path: "x.test.mjs", failing: true }] });
    assert.deepEqual(rows, [{ reqId: "GAP-06", classification: "PARTIAL", testFiles: ["x.test.mjs"] }]);
  });

  test("empty map → []", () => {
    assert.deepEqual(classifyGaps({}), []);
  });
});

describe("validate-phase: markManualOnly + classifyStatus (D-09)", () => {
  const covered = { reqId: "A-01", classification: "COVERED", testFiles: ["a.test.mjs"], manualOnly: false };
  const missing = { reqId: "A-02", classification: "MISSING", testFiles: [], manualOnly: false };

  test("markManualOnly flags listed req ids while preserving classification and immutability", () => {
    const out = markManualOnly([covered, missing], ["A-01"]);
    assert.notEqual(out, [covered, missing], "must return a new array");
    assert.equal(out[0].manualOnly, true);
    assert.equal(out[0].classification, "COVERED");
    assert.equal(out[1].manualOnly, false);
    // The original input rows are untouched.
    assert.equal(covered.manualOnly, false);
  });

  test("classifyStatus validated only when every row is COVERED and not Manual-Only", () => {
    assert.equal(classifyStatus([covered]), "validated");
    assert.equal(classifyStatus([missing]), "validated-partial");
    assert.equal(classifyStatus([{ ...covered, manualOnly: true }]), "validated-partial");
    assert.equal(classifyStatus([covered, missing]), "validated-partial");
  });

  test("classifyStatus treats empty rows as validated-partial (not validated)", () => {
    assert.equal(classifyStatus([]), "validated-partial");
  });
});

describe("validate-phase: assembleValidationTable (D-07/D-08)", () => {
  test("renders the exact header/separator/rows with Manual-Only and test-file joining", () => {
    const rows = [
      { reqId: "A-01", classification: "COVERED", testFiles: ["a.test.mjs", "b.spec.ts"], manualOnly: false },
      { reqId: "A-02", classification: "MISSING", testFiles: [], manualOnly: true },
      { reqId: "A-03", classification: "MISSING", testFiles: [], manualOnly: false },
    ];
    const out = assembleValidationTable(rows);
    const lines = out.split("\n");
    assert.deepEqual(lines[0].split("|"), ["", " REQ ", " Classification ", " Test file(s) ", ""]);
    assert.deepEqual(lines[1], "|---|---|---|");
    assert.match(lines[2], /A-01\s+\|\s+COVERED\s+\|\s+a\.test\.mjs, b\.spec\.ts/);
    assert.match(lines[3], /A-02\s+\|\s+Manual-Only\s+\|\s+—/);
    assert.match(lines[4], /A-03\s+\|\s+MISSING\s+\|\s+—/);
  });
});

describe("validate-phase: VALIDATION_AUDITOR_SCHEMA + resolveAuditorOutput (Plan 02 contract)", () => {
  const good = {
    tests_written: [{ path: "test/gap06.test.mjs", req_id: "GAP-06", content: "import { test } from 'node:test';" }],
    status: "GAPS_FILLED",
    partial: [],
    escalated: [],
    notes: "done",
  };

  test("schema is a frozen object with the restricted object-rooted subset", () => {
    assert.equal(typeof VALIDATION_AUDITOR_SCHEMA, "object");
    assert.ok(Object.isFrozen(VALIDATION_AUDITOR_SCHEMA), "schema must be frozen");
    assert.equal(VALIDATION_AUDITOR_SCHEMA.type, "object");
    assert.ok(
      Array.isArray(VALIDATION_AUDITOR_SCHEMA.required) &&
        VALIDATION_AUDITOR_SCHEMA.required.includes("tests_written") &&
        VALIDATION_AUDITOR_SCHEMA.required.includes("status"),
    );
    assert.equal(VALIDATION_AUDITOR_SCHEMA.additionalProperties, false);
  });

  test("resolveAuditorOutput accepts a valid object with tests_written + status in enum", () => {
    const out = resolveAuditorOutput(good);
    assert.deepEqual(out, good);
  });

  test("resolveAuditorOutput returns null for non-object or missing tests_written", () => {
    assert.equal(resolveAuditorOutput(null), null);
    assert.equal(resolveAuditorOutput("nope"), null);
    assert.equal(resolveAuditorOutput({ status: "GAPS_FILLED" }), null);
    assert.equal(resolveAuditorOutput({ tests_written: "not-an-array", status: "GAPS_FILLED" }), null);
  });

  test("resolveAuditorOutput rejects an entry missing path/req_id/content or an invalid status", () => {
    assert.equal(resolveAuditorOutput({ tests_written: [{ req_id: "X", content: "c" }], status: "GAPS_FILLED" }), null);
    assert.equal(resolveAuditorOutput({ tests_written: [{ path: "p", req_id: "X", content: "c" }], status: "NOPE" }), null);
  });
});

describe("validate-phase: needsGapWriting (Plan 02 gate predicate)", () => {
  const covered = { reqId: "A-01", classification: "COVERED", manualOnly: false };
  const missing = { reqId: "A-02", classification: "MISSING", manualOnly: false };
  const partial = { reqId: "A-03", classification: "PARTIAL", manualOnly: false };
  const manual = { reqId: "A-04", classification: "MISSING", manualOnly: true };

  test("true when any non-manual row is MISSING or PARTIAL", () => {
    assert.equal(needsGapWriting([covered]), false);
    assert.equal(needsGapWriting([covered, missing]), true);
    assert.equal(needsGapWriting([covered, partial]), true);
  });

  test("false when all rows are COVERED or Manual-Only", () => {
    assert.equal(needsGapWriting([covered, manual]), false);
    assert.equal(needsGapWriting([]), false);
  });
});

describe("validate-phase: renderSignOff (Plan 02 Sign-Off section)", () => {
  const covered = { reqId: "A-01", classification: "COVERED", testFiles: ["a.test.mjs"], manualOnly: false };
  const missing = { reqId: "A-02", classification: "MISSING", testFiles: [], manualOnly: false };
  const manual = { reqId: "A-03", classification: "MISSING", testFiles: [], manualOnly: true };

  test("reports the status, open-gap count, and req ids", () => {
    const out = renderSignOff([covered, missing], "validated-partial", []);
    assert.match(out, /validated-partial/);
    assert.match(out, /1 automated-test gap/);
    assert.match(out, /A-02/);
  });

  test("reports no open gaps when all covered", () => {
    const out = renderSignOff([covered], "validated", []);
    assert.match(out, /validated/);
    assert.match(out, /No automated-test gaps remain open/);
  });

  test("notes auditor paths that were rejected/skipped", () => {
    const out = renderSignOff([missing, manual], "validated-partial", ["src/impl.js"]);
    assert.match(out, /src\/impl\.js/);
    assert.match(out, /Manual-Only/);
  });
});

// ── tool integration (D-13): gsd_validate_phase writes VALIDATION.md + advances
// STATE to the 'validate' step. Offline FakeFs mount — no live git (the shared
// commit seam degrades to a warning), no subagent (Plan 02). ───────────────────
describe("validate-phase: gsd_validate_phase tool (Plan 01 vertical slice)", () => {
  const exec = makeExec();

  async function mountValidate() {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyValidatePhase(ctx, {});
    return { fs, ctx };
  }

  async function bootstrap(ctx, phase, requirements) {
    const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
    assert.ok(gsdInit, "gsd_init not registered");
    await gsdInit.execute(
      { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases: [phase] },
      makeExec(),
    );
  }

  function runValidate(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_validate_phase");
    assert.ok(t, "gsd_validate_phase not registered");
    return t.execute(args, exec);
  }

  test("on a completed phase writes VALIDATION.md, classifies a matched req COVERED, and advances STATE to validate (next ship-phase)", async () => {
    const { ctx } = await mountValidate();
    await bootstrap(ctx, { name: "vp-demo", goal: "retro test coverage", requirements: ["GAP-06"] }, [
      { id: "GAP-06", text: "A phase is validated by automated tests covering its requirements." },
    ]);
    const gsdState = ctx.get("gsdState");

    // Simulate a completed phase: PLAN-01 + SUMMARY-01 so listPlans reports
    // has_summary=true (runs without gsd_execute; the fake subagents are absent).
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-vp-demo",
      "plan: 01",
      "requirements: [\"GAP-06\"]",
      "---",
      "<objective>implements GAP-06</objective>",
      "This plan implements GAP-06 per the phase requirements.",
    ].join("\n"));
    await gsdState.writeArtifact(CWD, 1, "SUMMARY-01", [
      "---",
      "phase: 01-vp-demo",
      "plan: 01",
      "status: complete",
      "---",
      "# Phase 1 Plan 1 Summary",
      "Implemented GAP-06; tests added.",
    ].join("\n"));

    // Seed a discovered test file whose basename carries the normalized req token.
    await ctx.fs.writeText({ targetKey: `${CWD}/test/gap06.test.mjs` }, "import { test } from 'node:test'; test('covers GAP-06', () => {});");

    const res = await runValidate(ctx, { phase: 1 });
    assert.match(res, /Validate complete/i);
    assert.match(res, /Next: gsd_ship/);

    const v = await gsdState.readArtifact(CWD, 1, "VALIDATION");
    assert.ok(v, "VALIDATION.md was not written");

    const { frontmatter } = parseFrontmatter(v);
    assert.equal(frontmatter.status, "validated", "expected validated status for a matched test");
    assert.equal(frontmatter.phase, 1);
    assert.equal(frontmatter.test_infra, "node");
    // Per-Task Map marks the req COVERED.
    assert.match(v, /## Per-Task Map/);
    assert.match(v, /GAP-06\s+\|\s+COVERED\s+\|\s+test\/gap06\.test\.mjs/);

    // STATE advanced to the 'validate' step, routing on to ship.
    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.status, "validate");
    assert.equal(state.frontmatter.next_action, "ship-phase");
  });

  test("fails-fast on a non-completed phase (no SUMMARY) without writing VALIDATION.md", async () => {
    const { ctx } = await mountValidate();
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    await assert.rejects(
      runValidate(ctx, { phase: 1 }),
      /not executed \(no SUMMARY found/,
      "should fail-fast on a phase with no summary",
    );
    const gsdState = ctx.get("gsdState");
    assert.equal(await gsdState.hasArtifact(CWD, 1, "VALIDATION"), false, "no VALIDATION.md on a non-executed phase");
  });

  test("soft gate: workflow.validate_phase === false soft-skips with no artefact and never throws", async () => {
    const { ctx } = await mountValidate();
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    const gsdState = ctx.get("gsdState");

    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-vp-demo",
      "plan: 01",
      "requirements: [\"GAP-06\"]",
      "---",
      "<objective>x</objective>",
      "plan body",
    ].join("\n"));
    await gsdState.writeArtifact(CWD, 1, "SUMMARY-01", [
      "---",
      "phase: 01-vp-demo",
      "plan: 01",
      "status: complete",
      "---",
      "# Summary\nDone.",
    ].join("\n"));

    // Flip the soft gate off in the project config.json.
    const cfgPath = `${CWD}/.planning/config.json`;
    const cfg = JSON.parse((await ctx.fs.readText({ targetKey: cfgPath })) || "{}");
    cfg.workflow = { ...(cfg.workflow || {}), validate_phase: false };
    await ctx.fs.writeText({ targetKey: cfgPath }, JSON.stringify(cfg, null, 2) + "\n");

    const res = await runValidate(ctx, { phase: 1 });
    assert.match(res, /skipped \(validate-phase capability inactive\)/);
    assert.equal(await gsdState.hasArtifact(CWD, 1, "VALIDATION"), false, "no VALIDATION.md when soft gate disabled");
  });
});

// ── Plan 02: gap-plan confirmation gate + gsd-nyquist-auditor test-writer ─────
// (D-10 / D-06 / D-12 / D-11 / R-5). FakeFs + fake gsd-nyquist-auditor subagents.
describe("validate-phase: gap-plan gate + auditor test-writer (Plan 02)", () => {
  async function mountValidate({ subagents } = {}) {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, { subagents });
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyValidatePhase(ctx, {});
    return { fs, ctx };
  }

  async function bootstrap(ctx, phase, requirements) {
    const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
    assert.ok(gsdInit, "gsd_init not registered");
    await gsdInit.execute(
      { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases: [phase] },
      makeExec(),
    );
  }

  async function seedCompletedPhase(ctx, reqId) {
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---", "phase: 01-vp-demo", "plan: 01", `requirements: ["${reqId}"]`, "---",
      `<objective>implements ${reqId}</objective>`, "plan body",
    ].join("\n"));
    await gsdState.writeArtifact(CWD, 1, "SUMMARY-01", [
      "---", "phase: 01-vp-demo", "plan: 01", "status: complete", "---",
      "# Summary", `Implemented ${reqId}; tests added.`,
    ].join("\n"));
  }

  function runValidate(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_validate_phase");
    assert.ok(t, "gsd_validate_phase not registered");
    return t.execute(args, makeExec());
  }

  // A controllable fake gsd-nyquist-auditor subagents factory (mirrors the
  // fake reviewer in test/code-review.test.mjs). fail=true makes start() throw.
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

  const VALID_TEST = {
    tests_written: [{ path: "test/gap06.test.mjs", req_id: "GAP-06", content: "import { test } from 'node:test'; test('gap', () => {});" }],
    status: "GAPS_FILLED",
    partial: [],
    escalated: [],
    notes: "done",
  };

  test("gap gate: gaps exist and no gap_decision/auto → awaiting message, nothing written or spawned", async () => {
    const { ctx } = await mountValidate();
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    await seedCompletedPhase(ctx, "GAP-06");
    const gsdState = ctx.get("gsdState");

    const res = await runValidate(ctx, { phase: 1 });
    assert.match(res, /fix-all-gaps/);
    assert.match(res, /skip-for-now/);
    assert.match(res, /cancel/);
    assert.equal(await gsdState.hasArtifact(CWD, 1, "VALIDATION"), false, "no VALIDATION.md before a gate decision");
  });

  test("cancel: aborts with no VALIDATION.md, no subagent, no test writes", async () => {
    const { ctx } = await mountValidate();
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    await seedCompletedPhase(ctx, "GAP-06");
    const gsdState = ctx.get("gsdState");

    const res = await runValidate(ctx, { phase: 1, gap_decision: "cancel" });
    assert.match(res, /cancelled/i);
    assert.equal(await gsdState.hasArtifact(CWD, 1, "VALIDATION"), false, "cancel must not write VALIDATION.md");
  });

  test("skip-for-now: escalates open gaps to Manual-Only, writes validated-partial VALIDATION.md, no test commit", async () => {
    const { ctx } = await mountValidate();
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    await seedCompletedPhase(ctx, "GAP-06");
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runValidate(ctx, { phase: 1, gap_decision: "skip-for-now" });
    assert.match(res, /Validate skipped-for-now/i);

    const v = await gsdState.readArtifact(CWD, 1, "VALIDATION");
    assert.ok(v, "VALIDATION.md must be written on skip-for-now");
    const { frontmatter } = parseFrontmatter(v);
    assert.equal(frontmatter.status, "validated-partial");
    assert.match(v, /## Manual-Only/);
    assert.match(v, /GAP-06\s+\|\s+Manual-Only/);
    // The auditor test-writer must NOT have committed source files.
    assert.equal(
      git.calls.some((c) => c[0] === "commit" && String(c[c.length - 1] || "").includes("fill validation gaps")),
      false,
      "skip-for-now must not commit test files",
    );
  });

  test("fix-all-gaps: auditor writes a valid test file and commitSourceFiles commits 'test(phase-1): fill validation gaps'", async () => {
    const { ctx, fs } = await mountValidate({ subagents: makeAuditorSubagents({ structured: VALID_TEST }) });
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    await seedCompletedPhase(ctx, "GAP-06");
    const gsdState = ctx.get("gsdState");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    const res = await runValidate(ctx, { phase: 1, gap_decision: "fix-all-gaps" });
    assert.match(res, /1 test\(s\) written\/committed/);

    // The auditor-returned test file was written to the FakeFs.
    const written = await ctx.fs.readText(await ctx.fs.resolve(`${CWD}/test/gap06.test.mjs`));
    assert.match(written, /node:test/, "test file content not written");

    // The atomic commit used exactly the D-12 message.
    const commitMsgs = git.calls.filter((c) => c[0] === "commit").map((c) => c[c.length - 1] || "");
    assert.ok(
      commitMsgs.includes("test(phase-1): fill validation gaps"),
      `expected atomic commit message, got ${JSON.stringify(commitMsgs)}`,
    );

    const v = await gsdState.readArtifact(CWD, 1, "VALIDATION");
    assert.ok(v, "VALIDATION.md must be written after a successful audit");
    assert.match(v, /## Sign-Off/);
  });

  test("auditor path: a non-test (impl) path is skipped and never written", async () => {
    const { ctx, fs } = await mountValidate({
      subagents: makeAuditorSubagents({ structured: { tests_written: [{ path: "src/impl.js", req_id: "GAP-06", content: "evil" }], status: "GAPS_FILLED", partial: [], escalated: [] } }),
    });
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    await seedCompletedPhase(ctx, "GAP-06");
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;

    await runValidate(ctx, { phase: 1, gap_decision: "fix-all-gaps" });

    const implStat = await ctx.fs.stat(await ctx.fs.resolve(`${CWD}/src/impl.js`));
    assert.equal(implStat, undefined, "impl file must NOT be written (R-5 hard boundary)");
    assert.equal(
      git.calls.some((c) => c[0] === "commit" && String(c[c.length - 1] || "").includes("fill validation gaps")),
      false,
      "no source-test commit when nothing valid was written",
    );
  });

  test("degrade-with-flag: auditor spawn throw writes a pending/UNAVAILABLE VALIDATION.md, never rethrows", async () => {
    const { ctx } = await mountValidate({ subagents: makeAuditorSubagents({ fail: true }) });
    await bootstrap(ctx, { name: "vp-demo", goal: "g", requirements: ["GAP-06"] }, [{ id: "GAP-06", text: "x" }]);
    await seedCompletedPhase(ctx, "GAP-06");
    const gsdState = ctx.get("gsdState");

    const res = await runValidate(ctx, { phase: 1, gap_decision: "fix-all-gaps" });
    assert.match(res, /UNAVAILABLE/);

    const v = await gsdState.readArtifact(CWD, 1, "VALIDATION");
    assert.ok(v, "VALIDATION.md must be written on auditor fault (degrade, not throw)");
    const { frontmatter } = parseFrontmatter(v);
    assert.equal(frontmatter.status, "pending");
    assert.match(v, /\*\*Status:\*\* UNAVAILABLE/);
    assert.match(v, /auditor exploded/);
  });
});

// ── Plan 02 Task 3: VALIDATION_AUDITOR_PROMPT wording seals D-06 ─────────────
// The auditor prompt (in lib/_agents.js) must pin the hard test-writer boundary:
// never modify implementation files, a bounded maximum of 3 debug iterations, and
// escalate implementation bugs (never touching impl) to Manual-Only.
describe("validate-phase: VALIDATION_AUDITOR_PROMPT pins D-06 (test-writer boundary)", () => {
  test("the prompt forbids modifying implementation files", () => {
    assert.match(VALIDATION_AUDITOR_PROMPT, /never/i);
    assert.match(VALIDATION_AUDITOR_PROMPT, /implementation/i);
    assert.match(VALIDATION_AUDITOR_PROMPT, /test-file path|test files|NEW automated test/i);
  });

  test("the prompt bounds debug iterations to 3 and requires escalating impl bugs", () => {
    assert.match(VALIDATION_AUDITOR_PROMPT, /debug/i);
    assert.match(VALIDATION_AUDITOR_PROMPT, /bounded maximum of 3 debug iterations/i);
    assert.match(VALIDATION_AUDITOR_PROMPT, /escalat/i);
    assert.match(VALIDATION_AUDITOR_PROMPT, /Manual-Only/i);
  });

  test("the prompt requires a single JSON object matching VALIDATION_AUDITOR_SCHEMA, no prose/fences", () => {
    assert.match(VALIDATION_AUDITOR_PROMPT, /EXACTLY a JSON object matching this schema/);
    assert.match(VALIDATION_AUDITOR_PROMPT, /no prose, no Markdown fences/);
    assert.match(VALIDATION_AUDITOR_PROMPT, /"tests_written" array is required/);
  });
});
