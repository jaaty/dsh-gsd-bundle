// Offline behavioural tests for the gap-analysis plugin (lib/gap-analysis.js),
// TDD per D-13. Proves gsd_gap_analysis emits a <NN>-COVERAGE.md coverage table
// cross-referencing phase REQ-IDs (ROADMAP → REQUIREMENTS) and CONTEXT D-IDs
// against the runnable plans' frontmatter + prose, with a deterministic
// literal-ID scan (no subagent). Soft gate: warns + flags, never blocks.
//
// Offline only (D-13): FakeFs + fake-ctx, no live boot, no LLM/git/gh.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyGapAnalysis } from "../lib/gap-analysis.js";
import { buildCapability } from "../lib/_capabilities.js";
import { parseDecisionIds, scanCoverage } from "../lib/gap-analysis.js";
import { parseFrontmatter } from "../lib/_shared.js";

// Boot a fresh FakeFs + ctx with state / core-tools / gap-analysis applied.
// gap-analysis injects only ['gsdState','tools'] — NO subagents (D-03).
async function mountGap() {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs);
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  applyGapAnalysis(ctx, {});
  return { fs, ctx };
}

// Bootstrap a .planning/ project through the mounted gsd_init.
async function bootstrap(ctx, phase, requirements) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases: [phase] },
    makeExec(),
  );
}

function runGap(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_gap_analysis");
  assert.ok(t, "gsd_gap_analysis not registered");
  return t.execute(args, makeExec());
}

const PHASE = { name: "gap-demo", goal: "Gap analysis coverage table", requirements: ["GAP-02"] };
const REQUESTS = [{ id: "GAP-02", text: "A post-planning coverage table cross-references REQ and D IDs." }];

// A CONTEXT.md fixture in the exact discuss.js D-ID format (lib/discuss.js:138).
const CONTEXT_D01 = [
  "# Phase 1: gap-demo - Context",
  "",
  "**Gathered:** 2026-08-30T00:00:00.000Z",
  "**Status:** Ready for planning",
  "",
  "<decisions>",
  "## Decisions",
  "### Coverage mechanism",
  "- **D-01:** coverage is a deterministic literal-ID scan",
  "</decisions>",
].join("\n");

describe("gap-analysis: capability registration + chain reroute (D-13 a)", () => {
  test("gsdGapAnalysis descriptor: order 22, role step, tools, next→gsdExecute; gsdPlan.next→gsdGapAnalysis", () => {
    const cap = buildCapability("gsdGapAnalysis");
    assert.equal(cap.order, 22);
    assert.equal(cap.role, "step");
    assert.deepEqual(cap.tools, ["gsd_gap_analysis"]);
    assert.deepEqual(cap.next, ["gsdExecute"]);

    const plan = buildCapability("gsdPlan");
    assert.deepEqual(plan.next, ["gsdGapAnalysis"], "gsdPlan.next must reroute to gsdGapAnalysis");
  });

  test("mounted gap-analysis plugin provides gsdGapAnalysis and registers gsd_gap_analysis tool", async () => {
    const { ctx } = await mountGap();
    assert.ok(ctx.get("gsdGapAnalysis"), "gsdGapAnalysis capability not provided");
    const tool = ctx.tools.find((t) => t.name === "gsd_gap_analysis");
    assert.ok(tool, "gsd_gap_analysis tool not registered");
  });
});

describe("gap-analysis: parseDecisionIds (D-13 b)", () => {
  test("parses D-NN from verbatim discuss.js format, deduped ascending, no plain-bullet false positives", () => {
    const md = [
      "# Phase 1: x - Context",
      "<decisions>",
      "## Decisions",
      "### Area",
      "- **D-01:** first decision",
      "- **D-14:** last decision",
      "- **D-03:** middle decision",
      "### Claude's Discretion",
      "- some plain bullet without a D-ID",
      "- another discretion note",
      "</decisions>",
    ].join("\n");
    const ids = parseDecisionIds(md);
    assert.deepEqual(ids, ["D-01", "D-03", "D-14"]);
  });

  test("D-01 does NOT match a hypothetical D-010 (whole-ID safety)", () => {
    const md = "- **D-010:** ten\n- **D-01:** one\n";
    const ids = parseDecisionIds(md);
    assert.ok(ids.includes("D-01"), "D-01 should be matched");
    assert.ok(ids.includes("D-010"), "D-010 should be matched");
    assert.equal(ids.length, 2, "D-01 must not double-match D-010");
  });

  test("empty / no-decisions CONTEXT returns []", () => {
    assert.deepEqual(parseDecisionIds("# no decisions here\n"), []);
    assert.deepEqual(parseDecisionIds(""), []);
  });
});

describe("gap-analysis: scanCoverage + REQ lookup end-to-end (D-13 c)", () => {
  test("GAP-02 covered via plan01 frontmatter+body, plan02 frontmatter-only; D-01 covered via plan01 body", async () => {
    const { ctx } = await mountGap();
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    // CONTEXT with one decision.
    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT_D01);

    // PLAN-01: frontmatter requirements includes GAP-02; body mentions GAP-02 and D-01.
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-gap-demo",
      "plan: 01",
      "requirements: [\"GAP-02\"]",
      "---",
      "<objective>covers GAP-02 and mentions D-01</objective>",
      "This plan implements GAP-02 per decision D-01.",
    ].join("\n"));

    // PLAN-02: frontmatter requirements includes GAP-02; body mentions neither.
    await gsdState.writeArtifact(CWD, 1, "PLAN-02", [
      "---",
      "phase: 01-gap-demo",
      "plan: 02",
      "requirements: [\"GAP-02\"]",
      "---",
      "<objective>frontmatter only</objective>",
      "This plan does not mention any IDs in its prose body.",
    ].join("\n"));

    const res = await runGap(ctx, { phase: 1 });
    assert.match(res, /Gap analysis complete/i);

    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    assert.ok(cov, "COVERAGE.md was not written");
    // Table header present.
    assert.match(cov, /\| ID \| Source \| Text \| Covered \| Plan\(s\) \| Evidence \|/);

    // GAP-02 row: Covered Y, evidence shows plan 01 (both) and plan 02 (frontmatter/declared).
    assert.match(cov, /GAP-02.*REQUIREMENTS.*Y/);
    assert.match(cov, /declared, not elaborated/i, "plan02 frontmatter-only should be flagged 'declared, not elaborated'");

    // D-01 row: Covered Y via plan 01 body.
    assert.match(cov, /D-01.*CONTEXT.*Y/);
  });

  test("scanCoverage pure function: frontmatter-only → covered + 'declared, not elaborated' classification", () => {
    const plans = [
      { id: "P-01", requirements: ["GAP-02"], body: "mentions GAP-02 and D-01 here" },
      { id: "P-02", requirements: ["GAP-02"], body: "no ids in this prose" },
    ];
    const rows = scanCoverage(["GAP-02", "D-01"], plans);
    assert.equal(rows.length, 2);

    const gap = rows.find((r) => r.id === "GAP-02");
    assert.equal(gap.covered, true);
    assert.equal(gap.evidence.length, 2);
    const e1 = gap.evidence.find((e) => e.planId === "P-01");
    assert.equal(e1.where, "both");
    const e2 = gap.evidence.find((e) => e.planId === "P-02");
    assert.equal(e2.where, "frontmatter");

    const d = rows.find((r) => r.id === "D-01");
    assert.equal(d.covered, true);
    assert.equal(d.evidence.length, 1);
    assert.equal(d.evidence[0].where, "body");
  });

  test("scanCoverage: uncovered ID has covered=false and empty evidence", () => {
    const rows = scanCoverage(["GAP-99"], [{ id: "P-01", requirements: [], body: "nothing relevant" }]);
    assert.equal(rows[0].covered, false);
    assert.deepEqual(rows[0].evidence, []);
  });
});

describe("gap-analysis: orphan IDs (D-09, D-13 d)", () => {
  test("phantom IDs in plan body/frontmatter not in phase reqs or CONTEXT appear under Orphan IDs", async () => {
    const { ctx } = await mountGap();
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT_D01);
    // PLAN-01 body mentions GAP-99 (not in phase.requirements) and D-99 (not in CONTEXT).
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-gap-demo",
      "plan: 01",
      "requirements: [\"GAP-02\"]",
      "---",
      "<objective>orphan test</objective>",
      "This plan covers GAP-02 and references GAP-99 and D-99 in prose.",
    ].join("\n"));

    const res = await runGap(ctx, { phase: 1 });
    assert.match(res, /Gap analysis complete/i);

    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    assert.match(cov, /## Orphan IDs/);
    assert.match(cov, /GAP-99/);
    assert.match(cov, /D-99/);
    // The orphan section should name the source plan id.
    assert.match(cov, /01-gap-demo-01/);
  });
});

describe("gap-analysis: soft gate + COVERAGE shape + commit (D-06/D-07, D-13 e,i)", () => {
  test("gaps condition: uncovered REQ → status 'gaps', gap_ids non-empty, coverage_pct < 100, no throw, STATE advances", async () => {
    // Phase declares two REQ-IDs but plans only cover one.
    const { ctx } = await mountGap();
    await bootstrap(ctx, { name: "gap-demo", goal: "g", requirements: ["GAP-02", "GAP-03"] }, [
      { id: "GAP-02", text: "covered req" },
      { id: "GAP-03", text: "uncovered req" },
    ]);
    const gsdState = ctx.get("gsdState");

    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT_D01);
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-gap-demo",
      "plan: 01",
      "requirements: [\"GAP-02\"]",
      "---",
      "<objective>covers GAP-02 only</objective>",
      "Implements GAP-02 per D-01.",
    ].join("\n"));

    // Soft gate: must NOT throw, must write COVERAGE.md, must surface gaps.
    const res = await runGap(ctx, { phase: 1 });
    assert.match(res, /gap|uncovered/i, "summary must surface the gaps");

    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    assert.ok(cov, "COVERAGE.md written on gaps (soft gate, D-06)");
    const { frontmatter } = parseFrontmatter(cov);
    assert.equal(frontmatter.status, "gaps");
    assert.ok(Array.isArray(frontmatter.gap_ids) && frontmatter.gap_ids.includes("GAP-03"));
    assert.ok(frontmatter.coverage_pct < 100, "coverage_pct < 100 when there are gaps");

    // STATE still advances to execute (soft gate never blocks).
    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.status, "execute");
  });

  test("fully-covered condition: status 'covered', gap_ids [], coverage_pct 100", async () => {
    const { ctx } = await mountGap();
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT_D01);
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-gap-demo",
      "plan: 01",
      "requirements: [\"GAP-02\"]",
      "---",
      "<objective>covers all</objective>",
      "Implements GAP-02 and D-01.",
    ].join("\n"));

    await runGap(ctx, { phase: 1 });
    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    const { frontmatter } = parseFrontmatter(cov);
    assert.equal(frontmatter.status, "covered");
    assert.deepEqual(frontmatter.gap_ids, []);
    assert.equal(frontmatter.coverage_pct, 100);
  });

  test("COVERAGE frontmatter carries status, gap_ids, coverage_pct, phase, generated; summary reports commit", async () => {
    const { ctx } = await mountGap();
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT_D01);
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-gap-demo",
      "plan: 01",
      "requirements: [\"GAP-02\"]",
      "---",
      "<objective>shape test</objective>",
      "Covers GAP-02 and D-01.",
    ].join("\n"));

    const res = await runGap(ctx, { phase: 1 });
    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    const { frontmatter } = parseFrontmatter(cov);
    for (const key of ["status", "gap_ids", "coverage_pct", "phase", "generated"]) {
      assert.ok(key in frontmatter, `frontmatter missing key: ${key}`);
    }
    assert.match(res, /Artefacts committed:/, "summary should report the commit outcome");
  });
});

describe("gap-analysis: graceful degradation (D-08/D-10/D-11/D-12, D-13 f-h)", () => {
  test("(f) missing CONTEXT: REQ-only table, no D rows, context:unavailable note, no throw", async () => {
    const { ctx } = await mountGap();
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    // Write a PLAN but NO CONTEXT artefact.
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-gap-demo",
      "plan: 01",
      "requirements: [\"GAP-02\"]",
      "---",
      "<objective>covers GAP-02</objective>",
      "Implements GAP-02 in prose.",
    ].join("\n"));

    // Must NOT throw.
    const res = await runGap(ctx, { phase: 1 });
    assert.match(res, /Gap analysis complete/i);

    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    assert.ok(cov, "COVERAGE.md written even without CONTEXT");
    // REQ row present.
    assert.match(cov, /GAP-02.*REQUIREMENTS.*Y/);
    // No D-ID rows (D-IDs cannot be enumerated without CONTEXT).
    assert.doesNotMatch(cov, /\| D-\d+ \| CONTEXT \|/);
    // Frontmatter context note + body note.
    const { frontmatter } = parseFrontmatter(cov);
    assert.equal(frontmatter.context, "unavailable");
    assert.match(cov, /CONTEXT\.md unavailable/);
  });

  test("(g) no plans: every candidate UNCOVERED, coverage_pct 0, status gaps, no throw, prominent warning", async () => {
    const { ctx } = await mountGap();
    await bootstrap(ctx, { name: "gap-demo", goal: "g", requirements: ["GAP-02", "GAP-03"] }, [
      { id: "GAP-02", text: "req a" },
      { id: "GAP-03", text: "req b" },
    ]);
    const gsdState = ctx.get("gsdState");

    // Write CONTEXT but NO PLAN artefacts.
    await gsdState.writeArtifact(CWD, 1, "CONTEXT", [
      "# Phase 1: gap-demo - Context",
      "<decisions>",
      "## Decisions",
      "### Area",
      "- **D-01:** a decision",
      "</decisions>",
    ].join("\n"));

    // Must NOT throw.
    const res = await runGap(ctx, { phase: 1 });
    assert.match(res, /Gap analysis complete/i);

    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    assert.ok(cov, "COVERAGE.md written with no plans");
    const { frontmatter } = parseFrontmatter(cov);
    assert.equal(frontmatter.status, "gaps");
    assert.equal(frontmatter.coverage_pct, 0);
    // gap_ids should include all candidates.
    assert.ok(frontmatter.gap_ids.includes("GAP-02"));
    assert.ok(frontmatter.gap_ids.includes("GAP-03"));
    assert.ok(frontmatter.gap_ids.includes("D-01"));
    // Every candidate row shows Covered N.
    assert.match(cov, /GAP-02.*N/);
    assert.match(cov, /D-01.*N/);
  });

  test("(h) superseded exclusion + gap_closure inclusion: superseded plan ignored, gap_closure plan counted", async () => {
    const { ctx } = await mountGap();
    await bootstrap(ctx, PHASE, REQUESTS);
    const gsdState = ctx.get("gsdState");

    await gsdState.writeArtifact(CWD, 1, "CONTEXT", CONTEXT_D01);

    // PLAN-01: superseded — must be EXCLUDED.
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", [
      "---",
      "phase: 01-gap-demo",
      "plan: 01",
      "requirements: [\"GAP-02\"]",
      "status: superseded",
      "---",
      "<objective>superseded plan</objective>",
      "Implements GAP-02 and D-01 but should be ignored.",
    ].join("\n"));

    // PLAN-02: gap_closure fix plan — must be INCLUDED.
    await gsdState.writeArtifact(CWD, 1, "PLAN-02", [
      "---",
      "phase: 01-gap-demo",
      "plan: 02",
      "requirements: [\"GAP-02\"]",
      "gap_closure: true",
      "---",
      "<objective>fix plan</objective>",
      "Fix plan implementing GAP-02 and D-01.",
    ].join("\n"));

    const res = await runGap(ctx, { phase: 1 });
    assert.match(res, /Gap analysis complete/i);

    const cov = await gsdState.readArtifact(CWD, 1, "COVERAGE");
    // GAP-02 and D-01 covered via PLAN-02 (not PLAN-01).
    assert.match(cov, /GAP-02.*Y/);
    assert.match(cov, /D-01.*Y/);
    // PLAN-01 id should NOT appear in the evidence.
    assert.doesNotMatch(cov, /01-gap-demo-01/);
    // PLAN-02 id SHOULD appear.
    assert.match(cov, /01-gap-demo-02/);
  });

  test("env fail-fast (D-12): no project throws; unknown phase throws", async () => {
    const { ctx } = await mountGap();
    const gsdState = ctx.get("gsdState");

    // No project bootstrapped → throws /no .planning/ project/.
    await assert.rejects(
      runGap(ctx, { phase: 1 }),
      /no .planning\/ project/,
      "should throw on missing project",
    );

    // Bootstrap a project, then ask for an unknown phase.
    await bootstrap(ctx, PHASE, REQUESTS);
    await assert.rejects(
      runGap(ctx, { phase: 99 }),
      /not in ROADMAP/,
      "should throw on unknown phase",
    );
  });
});