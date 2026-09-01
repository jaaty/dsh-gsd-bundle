// Offline behavioural tests for the learnings plugin (lib/learnings.js), TDD
// per D-14. Covers the full hybrid engine (D-07): the PURE helpers
// (gatherDecisions / resolveLearningsOutput / accumulateRootLearnings /
// checkIdempotency — no ctx, no I/O), the gsd_extract_learnings tool integration
// (per-phase {NN}-LEARNINGS.md shape + root .planning/LEARNINGS.md accumulation +
// STATE not advanced, D-12), the idempotency guard + force override (D-06), the
// missing-required-artifact fail-fast + optional-artifact degradation (D-07 /
// REQ-LEARN-01), and the D-09 subagent-fault degrade-to-decisions-only path.
//
// Offline only (D-14): FakeFs + fake-ctx, no live boot, no LLM/git/gh. The
// gsd-learnings synthesis subagent is a controllable fake factory; git is a fake
// gitFn so commitArtifacts never hits real git.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyLearnings, gatherDecisions, resolveLearningsOutput, accumulateRootLearnings, checkIdempotency } from "../lib/learnings.js";
import { runLearningsOnShip } from "../lib/ship.js";
import { buildCapability } from "../lib/_capabilities.js";
import { parseFrontmatter } from "../lib/_shared.js";

// ── pure helpers (D-14h: no ctx/fs/git params) ──────────────────────────────────

describe("learnings: gatherDecisions (D-07, D-14h — uses parseDecisionEntries)", () => {
  test("parses D-NN entries from CONTEXT markdown, deduped + ascending, with source attribution", () => {
    const md = [
      "## Decisions",
      "- **D-02:** second decision",
      "- **D-01:** first decision",
      "- **D-01:** duplicate first (first occurrence wins)",
      "- plain bullet without D-ID (not matched)",
    ].join("\n");
    const out = gatherDecisions(md);
    assert.equal(out.length, 2);
    assert.deepEqual(out[0], { id: "D-01", text: "first decision", source: "CONTEXT#decisions" });
    assert.deepEqual(out[1], { id: "D-02", text: "second decision", source: "CONTEXT#decisions" });
  });

  test("empty / undefined input → empty array", () => {
    assert.deepEqual(gatherDecisions(""), []);
    assert.deepEqual(gatherDecisions(undefined), []);
    assert.deepEqual(gatherDecisions("no decisions here"), []);
  });
});

describe("learnings: resolveLearningsOutput (D-08 — per-category degrade, never throws)", () => {
  test("accepts a well-formed object with all three arrays of {content, source}", () => {
    const out = resolveLearningsOutput({
      lessons: [{ content: "l", source: "SUMMARY-01#body" }],
      patterns: [{ content: "p", source: "PLAN-01#objective" }],
      surprises: [{ content: "s", source: "VERIFICATION#body" }],
    });
    assert.equal(out.lessons.length, 1);
    assert.equal(out.patterns.length, 1);
    assert.equal(out.surprises.length, 1);
    assert.deepEqual(out.degraded, []);
  });

  test("null / non-object → all categories degraded to empty", () => {
    const out = resolveLearningsOutput(null);
    assert.deepEqual(out.lessons, []);
    assert.deepEqual(out.patterns, []);
    assert.deepEqual(out.surprises, []);
    assert.deepEqual(out.degraded, ["lessons", "patterns", "surprises"]);
  });

  test("missing arrays → those categories degrade, others kept", () => {
    const out = resolveLearningsOutput({ lessons: [{ content: "l", source: "x" }] });
    assert.equal(out.lessons.length, 1);
    assert.deepEqual(out.patterns, []);
    assert.deepEqual(out.surprises, []);
    assert.ok(out.degraded.includes("patterns"));
    assert.ok(out.degraded.includes("surprises"));
    assert.ok(!out.degraded.includes("lessons"));
  });

  test("an entry without a string content/source → that category degrades", () => {
    const out = resolveLearningsOutput({
      lessons: [{ content: 42, source: "x" }],
      patterns: [{ content: "p", source: "x" }, { content: "p2" }],
      surprises: [{ content: "s", source: "x" }],
    });
    assert.deepEqual(out.lessons, []);
    assert.deepEqual(out.patterns, []);
    assert.deepEqual(out.surprises, [{ content: "s", source: "x" }]);
    assert.ok(out.degraded.includes("lessons"));
    assert.ok(out.degraded.includes("patterns"));
    assert.ok(!out.degraded.includes("surprises"));
  });
});

describe("learnings: checkIdempotency (D-06 — O(1) frontmatter-only read)", () => {
  test("no root frontmatter (first extraction) → skip false", () => {
    assert.deepEqual(checkIdempotency(null, 1, false), { skip: false });
    assert.deepEqual(checkIdempotency(undefined, 1, false), { skip: false });
  });

  test("phase already in phases_extracted, no force → skip true with message", () => {
    const r = checkIdempotency({ phases_extracted: [1, 2] }, 1, false);
    assert.equal(r.skip, true);
    assert.match(r.message, /already extracted/);
    assert.match(r.message, /force/);
  });

  test("phase already extracted, force true → skip false (override)", () => {
    const r = checkIdempotency({ phases_extracted: [1, 2] }, 1, true);
    assert.equal(r.skip, false);
  });

  test("phase not in phases_extracted → skip false", () => {
    const r = checkIdempotency({ phases_extracted: [2] }, 1, false);
    assert.equal(r.skip, false);
  });

  test("phases_extracted absent → skip false (degrade, never skip)", () => {
    const r = checkIdempotency({ generated: "x" }, 1, false);
    assert.equal(r.skip, false);
  });
});

describe("learnings: accumulateRootLearnings (D-04, D-05 — append + in-place replace)", () => {
  const phaseBlock1 = "## Phase 1 — p1\n\n### Decisions\n- D-01\n";
  const phaseBlock2 = "## Phase 2 — p2\n\n### Decisions\n- D-02\n";
  const phaseBlock1b = "## Phase 1 — p1\n\n### Decisions\n- D-01 (updated)\n";

  test("no existing root → new file with frontmatter + preamble + one block", () => {
    const out = accumulateRootLearnings(undefined, phaseBlock1, 1, "p1", "demo");
    const { frontmatter, body } = parseFrontmatter(out);
    assert.equal(frontmatter.project_code, "demo");
    assert.deepEqual(frontmatter.phases_extracted, [1]);
    assert.ok(frontmatter.generated);
    assert.match(body, /## Phase 1 — p1/);
    assert.match(body, /carrying-forward|auto-maintained/i);
  });

  test("existing root, new phase → append after (newest last), phases_extracted sorted", () => {
    const first = accumulateRootLearnings(undefined, phaseBlock1, 1, "p1", "demo");
    const second = accumulateRootLearnings(first, phaseBlock2, 2, "p2", "demo");
    const { frontmatter, body } = parseFrontmatter(second);
    assert.deepEqual(frontmatter.phases_extracted, [1, 2]);
    const i1 = body.indexOf("## Phase 1 — p1");
    const i2 = body.indexOf("## Phase 2 — p2");
    assert.ok(i1 > -1 && i2 > -1 && i1 < i2, "phase 1 block must come before phase 2 block");
  });

  test("re-extract existing phase → replace in place, no duplicate, phases_extracted unchanged", () => {
    const first = accumulateRootLearnings(undefined, phaseBlock1, 1, "p1", "demo");
    const withTwo = accumulateRootLearnings(first, phaseBlock2, 2, "p2", "demo");
    const replaced = accumulateRootLearnings(withTwo, phaseBlock1b, 1, "p1", "demo");
    const { frontmatter, body } = parseFrontmatter(replaced);
    assert.deepEqual(frontmatter.phases_extracted, [1, 2]);
    const matches = body.match(/## Phase 1 — p1/g) || [];
    assert.equal(matches.length, 1, "phase 1 block must be replaced, not duplicated");
    assert.match(body, /D-01 \(updated\)/);
    const matches2 = body.match(/## Phase 2 — p2/g) || [];
    assert.equal(matches2.length, 1, "phase 2 block must remain");
  });
});

// ── integration (D-14a/b/c/d/e/f) ───────────────────────────────────────────────

describe("learnings: gsd_extract_learnings tool (integration)", () => {
  async function mountLearnings({ subagents } = {}) {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, { subagents });
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    applyLearnings(ctx, {});
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

  function runLearnings(ctx, args) {
    const t = ctx.tools.find((x) => x.name === "gsd_extract_learnings");
    assert.ok(t, "gsd_extract_learnings not registered");
    return t.execute(args || {}, makeExec());
  }

  // A controllable fake gsd-learnings synthesis subagents factory.
  function makeLearningsSubagents(controller) {
    return {
      getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
      async start(_n, req) {
        if (controller.capture) controller.capture(req);
        if (controller.fail) throw new Error("learnings subagent exploded");
        const structured =
          typeof controller.structured === "function" ? controller.structured(req) : controller.structured;
        return { result: { output: [{ type: "text", text: "synthesized" }], stopReason: "completed", structured }, dispose: () => {} };
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

  const VALID_LEARNINGS = {
    lessons: [{ content: "prefer pure helpers with no ctx params", source: "SUMMARY-01#body" }],
    patterns: [{ content: "hybrid deterministic-scan + gated subagent", source: "PLAN-01#objective" }],
    surprises: [{ content: "adding a capability breaks count assertions", source: "VERIFICATION#body" }],
  };

  // Seed a phase with CONTEXT (decisions), PLAN-01, SUMMARY-01, VERIFICATION.
  async function seedPhase(ctx, n, { context = true, plan = true, summary = true, verification = true } = {}) {
    const gsdState = ctx.get("gsdState");
    if (context) {
      await gsdState.writeArtifact(
        CWD, n, "CONTEXT",
        "---\nphase: " + n + "\n---\n## Decisions\n- **D-01:** first decision\n- **D-02:** second decision\n",
      );
    }
    if (plan) {
      await gsdState.writeArtifact(CWD, n, "PLAN-01", "---\nwave: 1\ntype: execute\n---\n<objective>build it</objective>");
    }
    if (summary) {
      await gsdState.writeArtifact(CWD, n, "SUMMARY-01", "---\nstatus: complete\n---\n# Summary\ndone.");
    }
    if (verification) {
      await gsdState.writeArtifact(CWD, n, "VERIFICATION", "---\nstatus: passed\n---\nverified.");
    }
    return gsdState;
  }

  // ── (a) capability registration + order 53 (D-14a) ────────────────────────────
  test("(a) gsdLearnings capability registered, order 53, step learnings, tools match (D-14a)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    assert.ok(ctx.provided.has("gsdLearnings"), "gsdLearnings must be provided");
    const cap = buildCapability("gsdLearnings");
    assert.equal(cap.order, 53);
    assert.equal(cap.step, "learnings");
    assert.deepEqual([...cap.tools], ["gsd_extract_learnings"]);
    assert.deepEqual([...cap.commands], ["gsd-extract-learnings"]);
  });

  // ── (b) per-phase LEARNINGS.md shape (D-14b, D-03) ────────────────────────────
  test("(b) per-phase LEARNINGS.md: four categories + source attribution + frontmatter counts/missing_artifacts (D-14b)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedPhase(ctx, 1);

    const res = await runLearnings(ctx, { phase: 1 });
    assert.match(res, /LEARNINGS/);

    const gsdState = ctx.get("gsdState");
    const text = await gsdState.readArtifact(CWD, 1, "LEARNINGS");
    assert.ok(text, "per-phase LEARNINGS.md must be written");
    const { frontmatter, body } = parseFrontmatter(text);
    assert.equal(frontmatter.phase, 1);
    assert.ok(frontmatter.project, "frontmatter.project must be set");
    assert.ok(frontmatter.counts, "frontmatter.counts must be present");
    assert.equal(frontmatter.counts.decisions, 2);
    assert.equal(frontmatter.counts.lessons, 1);
    assert.equal(frontmatter.counts.patterns, 1);
    assert.equal(frontmatter.counts.surprises, 1);
    assert.ok(Array.isArray(frontmatter.missing_artifacts));
    // four section headings
    assert.match(body, /## Decisions/);
    assert.match(body, /## Lessons/);
    assert.match(body, /## Patterns/);
    assert.match(body, /## Surprises/);
    // decisions carry CONTEXT#decisions source attribution
    assert.match(body, /\*\*D-01:\*\* first decision \(source: CONTEXT#decisions\)/);
    assert.match(body, /\*\*D-02:\*\* second decision \(source: CONTEXT#decisions\)/);
    // lessons/patterns/surprises carry their source attribution
    assert.match(body, /prefer pure helpers with no ctx params \(source: SUMMARY-01#body\)/);
    assert.match(body, /hybrid deterministic-scan \+ gated subagent \(source: PLAN-01#objective\)/);
  });

  // ── (c) root accumulation — append + in-place replace (D-14c, D-05) ───────────
  // Exercises s.writeRootLearnings (the root-scoped write accessor) via the tool
  // and reads the result back through s.readRootLearnings.
  test("(c) root accumulation: append new phase, in-place replace existing (D-14c, D-05)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(
      ctx,
      [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }, { name: "p2", goal: "g2", requirements: ["GAP-10"] }],
      [{ id: "GAP-10", text: "x" }],
    );
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    await seedPhase(ctx, 1);
    await seedPhase(ctx, 2);

    // extract phase 1 → root has one block, phases_extracted [1]
    await runLearnings(ctx, { phase: 1 });
    let root = await gsdState.readRootLearnings(CWD);
    assert.ok(root, "root LEARNINGS.md must be written");
    let { frontmatter, body } = parseFrontmatter(root);
    assert.deepEqual(frontmatter.phases_extracted, [1]);
    assert.match(body, /## Phase 1 — p1/);

    // extract phase 2 → two blocks newest last, phases_extracted [1,2]
    await runLearnings(ctx, { phase: 2 });
    root = await gsdState.readRootLearnings(CWD);
    ({ frontmatter, body } = parseFrontmatter(root));
    assert.deepEqual(frontmatter.phases_extracted, [1, 2]);
    const i1 = body.indexOf("## Phase 1 — p1");
    const i2 = body.indexOf("## Phase 2 — p2");
    assert.ok(i1 > -1 && i2 > -1 && i1 < i2);

    // re-extract phase 1 with force → replaced, no duplicate, phases_extracted [1,2]
    await runLearnings(ctx, { phase: 1, force: true });
    root = await gsdState.readRootLearnings(CWD);
    ({ frontmatter, body } = parseFrontmatter(root));
    assert.deepEqual(frontmatter.phases_extracted, [1, 2]);
    assert.equal((body.match(/## Phase 1 — p1/g) || []).length, 1);
    assert.equal((body.match(/## Phase 2 — p2/g) || []).length, 1);
  });

  // ── (d) idempotency guard short-circuit + force override (D-14d, D-06) ────────
  test("(d) idempotency: re-run without force short-circuits; with force re-extracts (D-14d, D-06)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedPhase(ctx, 1);

    await runLearnings(ctx, { phase: 1 });
    const gsdState = ctx.get("gsdState");
    const before = await gsdState.readRootLearnings(CWD);

    // re-run without force → already extracted message, root unchanged
    const skipRes = await runLearnings(ctx, { phase: 1 });
    assert.match(skipRes, /already extracted/);
    const after = await gsdState.readRootLearnings(CWD);
    assert.equal(after, before, "root LEARNINGS.md must be unchanged on a skipped re-run");

    // with force → re-extracts (return does NOT match already extracted)
    const forceRes = await runLearnings(ctx, { phase: 1, force: true });
    assert.doesNotMatch(forceRes, /already extracted/);
  });

  // ── (e) missing required artifact fail-fast + optional degradation (D-14e) ───
  test("(e) missing PLAN.md → rejects with PLAN error (REQ-LEARN-01)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    // seed CONTEXT + SUMMARY but NO PLAN
    await seedPhase(ctx, 1, { plan: false });
    await assert.rejects(runLearnings(ctx, { phase: 1 }), /PLAN/);
  });

  test("(e) missing SUMMARY.md → rejects with SUMMARY error (REQ-LEARN-01)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    // seed CONTEXT + PLAN but NO SUMMARY
    await seedPhase(ctx, 1, { summary: false });
    await assert.rejects(runLearnings(ctx, { phase: 1 }), /SUMMARY/);
  });

  test("(e) missing optional artifacts → resolves with missing_artifacts note (D-07)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    // seed CONTEXT + PLAN + SUMMARY but NO VERIFICATION/REVIEW/COVERAGE
    await seedPhase(ctx, 1, { verification: false });

    const res = await runLearnings(ctx, { phase: 1 });
    assert.match(res, /LEARNINGS/);
    const text = await gsdState.readArtifact(CWD, 1, "LEARNINGS");
    const { frontmatter } = parseFrontmatter(text);
    assert.ok(Array.isArray(frontmatter.missing_artifacts));
    assert.ok(frontmatter.missing_artifacts.includes("VERIFICATION"));
  });

  // ── (f) subagent-fault degrade-to-decisions-only (D-14f, D-09) ────────────────
  test("(f) subagent spawn throws → tool RESOLVES, decisions populated, others UNAVAILABLE (D-09)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ fail: true }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedPhase(ctx, 1);

    const res = await runLearnings(ctx, { phase: 1 });
    // must RESOLVE (not reject)
    assert.match(res, /LEARNINGS/);
    assert.match(res, /degrad|unavailable|UNAVAILABLE/i);

    const gsdState = ctx.get("gsdState");
    const text = await gsdState.readArtifact(CWD, 1, "LEARNINGS");
    const { body } = parseFrontmatter(text);
    // decisions still populated from the deterministic gather
    assert.match(body, /\*\*D-01:\*\* first decision/);
    // lessons/patterns/surprises present but degraded
    assert.match(body, /## Lessons/);
    assert.match(body, /UNAVAILABLE/i);
    assert.match(body, /learnings subagent exploded/);
  });

  test("(f) malformed structured output → degrade to decisions-only (D-09)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: { summary: "no arrays here" } }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedPhase(ctx, 1);

    const res = await runLearnings(ctx, { phase: 1 });
    assert.match(res, /LEARNINGS/);
    const gsdState = ctx.get("gsdState");
    const text = await gsdState.readArtifact(CWD, 1, "LEARNINGS");
    const { frontmatter, body } = parseFrontmatter(text);
    // decisions populated
    assert.match(body, /\*\*D-01:\*\* first decision/);
    // lessons/patterns/surprises degraded to empty with UNAVAILABLE note
    assert.equal(frontmatter.counts.lessons, 0);
    assert.equal(frontmatter.counts.patterns, 0);
    assert.equal(frontmatter.counts.surprises, 0);
    assert.match(body, /UNAVAILABLE/i);
  });

  // ── (g) deterministic gather uses parseDecisionEntries (D-14h) ───────────────
  test("(g) decisions come from CONTEXT via parseDecisionEntries, sorted ascending with source (D-14h)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    const gsdState = ctx.get("gsdState");
    // seed CONTEXT with D-02 before D-01 to verify ascending sort
    await gsdState.writeArtifact(
      CWD, 1, "CONTEXT",
      "---\nphase: 1\n---\n## Decisions\n- **D-02:** second\n- **D-01:** first\n",
    );
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", "---\n---\n<objective>o</objective>");
    await gsdState.writeArtifact(CWD, 1, "SUMMARY-01", "---\n---\n# S");
    await gsdState.writeArtifact(CWD, 1, "VERIFICATION", "---\nstatus: passed\n---\nv");

    await runLearnings(ctx, { phase: 1 });
    const text = await gsdState.readArtifact(CWD, 1, "LEARNINGS");
    const { body } = parseFrontmatter(text);
    const i1 = body.indexOf("D-01");
    const i2 = body.indexOf("D-02");
    assert.ok(i1 > -1 && i2 > -1 && i1 < i2, "decisions must be sorted ascending by D-number");
    assert.match(body, /\*\*D-01:\*\* first \(source: CONTEXT#decisions\)/);
    assert.match(body, /\*\*D-02:\*\* second \(source: CONTEXT#decisions\)/);
  });

  // ── (h) STATE not advanced (D-12) ───────────────────────────────────────────
  test("(h) learnings does NOT advance STATE (D-12 — advisory soft gate)", async () => {
    const { ctx } = await mountLearnings({ subagents: makeLearningsSubagents({ structured: VALID_LEARNINGS }) });
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["GAP-10"] }], [{ id: "GAP-10", text: "x" }]);
    const git = makeFakeGit();
    ctx.gitFn = git.fakeGit;
    await seedPhase(ctx, 1);
    const gsdState = ctx.get("gsdState");
    const before = await gsdState.readState(CWD);

    await runLearnings(ctx, { phase: 1 });

    const after = await gsdState.readState(CWD);
    assert.equal(after.frontmatter.status, before.frontmatter.status, "STATE status must not change");
    assert.equal(after.frontmatter.next_action, before.frontmatter.next_action, "STATE next_action must not change");
    assert.equal(after.frontmatter.active_phase, before.frontmatter.active_phase, "STATE active_phase must not change");
  });
});

// ── runLearningsOnShip helper (auto-on-ship hook, D-10) ─────────────────────────
// The helper is PURE ({ cfg, tools, phase, exec } → Promise<string>), so it is
// tested directly with a fake tools array — no mount, no FakeFs, no git/gh, no
// gsdState (mirrors the preflightError precedent ship-async.test.mjs uses).

describe("learnings: runLearningsOnShip helper (auto-on-ship hook, D-10)", () => {
  const exec = {};

  function makeFakeLearningsTool() {
    const calls = [];
    const tool = {
      name: "gsd_extract_learnings",
      async execute(args, _exec) {
        calls.push(args);
        return "extracted phase " + args.phase + " (decisions: 2, lessons: 3)";
      },
    };
    return { tool, calls };
  }

  test("workflow.learnings false → skipped, tool never called (D-10)", async () => {
    const { tool, calls } = makeFakeLearningsTool();
    const cfg = { workflow: { learnings: false } };
    const out = await runLearningsOnShip({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when the flag is off");
    assert.doesNotMatch(out, /extracted/);
  });

  test("workflow.learnings true + tool present → calls execute with force:true, returns result line (D-10, D-06)", async () => {
    const { tool, calls } = makeFakeLearningsTool();
    const cfg = { workflow: { learnings: true } };
    const out = await runLearningsOnShip({ cfg, tools: [tool], phase: 1, exec });
    assert.match(out, /learnings:/i);
    assert.match(out, /extracted phase 1/);
    assert.deepEqual(calls[0], { phase: 1, force: true }, "auto-run must force re-extract (D-06/D-10)");
  });

  test("workflow.learnings true + tool throws → returns non-blocking line with cause, never rejects (D-10)", async () => {
    const failingTool = {
      name: "gsd_extract_learnings",
      async execute() { throw new Error("subagent outage"); },
    };
    const cfg = { workflow: { learnings: true } };
    const out = await runLearningsOnShip({ cfg, tools: [failingTool], phase: 1, exec });
    assert.match(out, /non-blocking|failed/i);
    assert.match(out, /subagent outage/, "the real cause must be surfaced");
  });

  test("workflow.learnings true + tool absent → returns not-registered/skipped, never throws (D-10, DEGR-05)", async () => {
    const cfg = { workflow: { learnings: true } };
    const out = await runLearningsOnShip({ cfg, tools: [], phase: 1, exec });
    assert.match(out, /not registered|skipped/i);
    assert.doesNotMatch(out, /extracted/);
  });

  test("cfg absent (no workflow object) → skipped, defends against missing config (optional chaining)", async () => {
    const { tool, calls } = makeFakeLearningsTool();
    const out = await runLearningsOnShip({ cfg: undefined, tools: [tool], phase: 1, exec });
    assert.match(out, /skipped|disabled/i);
    assert.equal(calls.length, 0, "tool must not be invoked when cfg has no workflow object");
  });
});