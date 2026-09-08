// Offline behavioural tests for the code-review loop-step plugin
// (lib/code-review.js), TDD per D-14. Proves gsd_code_review produces a
// <NN>-REVIEW.md with severity-classified findings (BLOCKER/WARNING/INFO) from a
// fresh-context reviewer subagent, soft-skips on the config gate, degrades to
// UNAVAILABLE on subagent fault, and advances STATE to 'review' with
// next_action verify-phase. Offline only: FakeFs + fake-ctx + fake subagents.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD, PATCH_ROWS, mountSubset, personaBody } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { buildCapability, CAPABILITY_KEYS } from "../lib/_capabilities.js";
import { loopSteps, renderPersonaBody } from "../lib/_render.js";
import { parseFrontmatter } from "../lib/_shared.js";
import { resolveFindings, severityCounts, resolveFixFlags, computeScope, validateFiles, filterSourcePaths, filterBySeverity, hasBlockingFindings, applyAnchorEdits, excerpt, resolveFixStatus } from "../lib/code-review.js";
import { commitSourceFiles } from "../lib/_git-artifacts.js";
import { CODE_FIXER_PROMPT } from "../lib/_agents.js";

// Lazily import the plugin under test (created in Task 2) so the capability +
// wiring tests in Task 1 run before lib/code-review.js exists.
async function applyCodeReview(ctx) {
  const m = await import("../lib/code-review.js");
  m.apply(ctx, {});
}

// ── capability + loop wiring ──────────────────────────────────────────────────

describe("code-review: capability + loop wiring", () => {
  test("buildCapability('gsdCodeReview') returns the expected descriptor", () => {
    const c = buildCapability("gsdCodeReview");
    assert.equal(c.key, "gsdCodeReview");
    assert.equal(c.step, "code-review");
    assert.equal(c.role, "step");
    assert.equal(c.order, 35);
    assert.deepEqual([...c.tools], ["gsd_code_review"]);
    assert.deepEqual([...c.commands], ["gsd-code-review"]);
    assert.deepEqual([...c.next], ["gsdVerify"]);
    assert.deepEqual([...c.produces], ["REVIEW.md", "REVIEW-FIX.md"]);
    assert.deepEqual([...c.consumes], ["SUMMARY.md"]);
  });

  test("CAPABILITY_KEYS lists gsdCodeReview between gsdExecute and gsdVerify", () => {
    const idxReview = CAPABILITY_KEYS.indexOf("gsdCodeReview");
    const idxExecute = CAPABILITY_KEYS.indexOf("gsdExecute");
    const idxVerify = CAPABILITY_KEYS.indexOf("gsdVerify");
    assert.ok(idxReview > idxExecute, "gsdCodeReview must come after gsdExecute");
    assert.ok(idxReview < idxVerify, "gsdCodeReview must come before gsdVerify");
  });

  test("loopSteps orders gsdCodeReview (35) between execute (30) and verify (40)", () => {
    const steps = loopSteps([
      buildCapability("gsdExecute"),
      buildCapability("gsdCodeReview"),
      buildCapability("gsdVerify"),
    ]);
    assert.equal(steps.length, 3);
    assert.equal(steps[0].order, 30);
    assert.equal(steps[1].order, 35);
    assert.equal(steps[1].key, "gsdCodeReview");
    assert.equal(steps[2].order, 40);
  });

  test("renderPersonaBody renders a code-review paragraph only when present", () => {
    const withReview = renderPersonaBody([
      buildCapability("gsdSpec"),
      buildCapability("gsdExecute"),
      buildCapability("gsdCodeReview"),
      buildCapability("gsdVerify"),
    ]);
    assert.match(withReview, /^- Code review:/m);

    const withoutReview = renderPersonaBody([
      buildCapability("gsdSpec"),
      buildCapability("gsdExecute"),
      buildCapability("gsdVerify"),
    ]);
    assert.doesNotMatch(withoutReview, /^- Code review:/m);
  });

  test("setActivePhase('review') sets next_action to verify-phase", async () => {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    const gsdState = ctx.get("gsdState");
    await gsdState.initProject(CWD, {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements: [{ id: "CR-01", text: "code review step" }],
      phases: [{ name: "cr-demo", goal: "code review", requirements: ["CR-01"] }],
    });
    await gsdState.setActivePhase(CWD, 1, "review");
    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.status, "review");
    assert.equal(state.frontmatter.next_action, "verify-phase");
  });

  test("readConfig surfaces code_review:true and code_review_depth:'standard' defaults", async () => {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    const gsdState = ctx.get("gsdState");
    await gsdState.initProject(CWD, {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements: [{ id: "CR-01", text: "x" }],
      phases: [{ name: "p1", goal: "g", requirements: ["CR-01"] }],
    });
    const cfg = await gsdState.readConfig(CWD);
    assert.equal(cfg.workflow.code_review, true);
    assert.equal(cfg.workflow.code_review_depth, "standard");
  });
});

// ── gsd_code_review writes REVIEW.md from a reviewer subagent ────────────────

// A controllable fake reviewer subagents factory (mirrors makeScorer from
// test/spec.test.mjs:50-66). fail=true makes start() throw (D-09 UNAVAILABLE).
function makeReviewerSubagents(controller) {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      if (controller.capture) controller.capture(req);
      if (controller.fail) throw new Error("reviewer exploded");
      return {
        result: {
          output: [{ type: "text", text: "reviewed" }],
          stopReason: "completed",
          structured: controller.structured,
        },
        dispose: () => {},
      };
    },
  };
}

async function mountReview({ subagents } = {}) {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs, { subagents });
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  await applyCodeReview(ctx);
  return { fs, ctx };
}

// Pre-seed a source file so the 3-tier scoper (D-08) finds at least one file
// and the tool proceeds to write REVIEW.md instead of soft-skipping.
async function seedSourceFile(fs, rel = "lib/sample.js") {
  const target = await fs.resolve(`${CWD}/${rel}`);
  await fs.writeText(target, "export const x = 1;\n");
  return rel;
}

async function bootstrapReview(ctx) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements: [{ id: "CR-01", text: "A code-review step produces REVIEW.md." }],
      phases: [{ name: "cr-demo", goal: "code review step", requirements: ["CR-01"] }],
    },
    makeExec(),
  );
}

function runReview(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_code_review");
  assert.ok(t, "gsd_code_review not registered");
  return t.execute(args, makeExec());
}

const FINDINGS_BLOCKER = {
  findings: [
    {
      id: "CR-01",
      severity: "BLOCKER",
      file: "lib/foo.js",
      lines: "42",
      title: "null deref",
      evidence: "x.y on line 42 when x may be null",
      suggestion: "guard null before access",
    },
  ],
};

describe("code-review: gsd_code_review writes REVIEW.md from a reviewer subagent", () => {
  test("happy path: structured findings produce REVIEW.md with frontmatter + per-finding rows and STATE 'review'", async () => {
    const { ctx, fs } = await mountReview({ subagents: makeReviewerSubagents({ structured: FINDINGS_BLOCKER }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const rel = await seedSourceFile(fs);

    const res = await runReview(ctx, { phase: 1, files: rel });
    assert.match(res, /Code review complete.*phase 1/si);

    const review = await gsdState.readArtifact(CWD, 1, "REVIEW");
    assert.ok(review, "REVIEW.md was not written");
    const { frontmatter, body } = parseFrontmatter(review);
    assert.equal(frontmatter.status, "issues_found");
    assert.equal(frontmatter.findings.blocker, 1);
    assert.equal(frontmatter.findings.total, 1);
    assert.match(body, /## Blockers/);
    assert.match(body, /null deref/);
    assert.match(body, /lib\/foo\.js/);

    // STATE advanced to the review step with verify-phase as next action (D-13).
    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.status, "review");
    assert.equal(state.frontmatter.next_action, "verify-phase");
  });

  test("clean: empty findings produce REVIEW.md with status 'clean' and total 0", async () => {
    const { ctx, fs } = await mountReview({ subagents: makeReviewerSubagents({ structured: { findings: [] } }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const rel = await seedSourceFile(fs);

    await runReview(ctx, { phase: 1, files: rel });
    const review = await gsdState.readArtifact(CWD, 1, "REVIEW");
    assert.ok(review, "REVIEW.md was not written");
    const { frontmatter } = parseFrontmatter(review);
    assert.equal(frontmatter.status, "clean");
    assert.equal(frontmatter.findings.total, 0);
  });

  test("config-gate soft-skip: workflow.code_review false → no REVIEW.md, no throw, skip message (D-07)", async () => {
    const { ctx } = await mountReview({ subagents: makeReviewerSubagents({ structured: FINDINGS_BLOCKER }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");

    // Disable code review in config.json.
    const cfgPath = `${CWD}/.planning/config.json`;
    const cfgTarget = await ctx.fs.resolve(cfgPath);
    const cfgText = await ctx.fs.readText(cfgTarget);
    const cfg = JSON.parse(cfgText);
    cfg.workflow.code_review = false;
    await ctx.fs.writeText(cfgTarget, JSON.stringify(cfg, null, 2) + "\n");

    const res = await runReview(ctx, { phase: 1 });
    assert.match(res, /skipped/i);
    assert.equal(await gsdState.hasArtifact(CWD, 1, "REVIEW"), false, "REVIEW.md must NOT be written on config-gate skip");
  });

  test("degrade-with-flag: reviewer subagent fault writes UNAVAILABLE REVIEW.md with real cause, never throws (D-09)", async () => {
    const { ctx, fs } = await mountReview({ subagents: makeReviewerSubagents({ fail: true }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const rel = await seedSourceFile(fs);

    // If the tool hard-blocks (throws) the await fails the test — passing this
    // line IS the "never throws on reviewer fault" assertion (D-09).
    const res = await runReview(ctx, { phase: 1, files: rel });
    assert.match(res, /UNAVAILABLE/);

    const review = await gsdState.readArtifact(CWD, 1, "REVIEW");
    assert.ok(review, "REVIEW.md was NOT written on reviewer fault — must degrade, not hard-block");
    assert.match(review, /UNAVAILABLE/);
    assert.match(review, /reviewer exploded/);
  });

  test("degrade-with-flag: malformed structured output writes UNAVAILABLE REVIEW.md (D-05/D-09)", async () => {
    const { ctx, fs } = await mountReview({ subagents: makeReviewerSubagents({ structured: { not_findings: true } }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const rel = await seedSourceFile(fs);

    const res = await runReview(ctx, { phase: 1, files: rel });
    assert.match(res, /UNAVAILABLE/);
    const review = await gsdState.readArtifact(CWD, 1, "REVIEW");
    assert.ok(review);
    assert.match(review, /UNAVAILABLE/);
  });

  test("fail-fast: no .planning/ project throws a clear error (D-09)", async () => {
    const { ctx } = await mountReview({ subagents: makeReviewerSubagents({ structured: FINDINGS_BLOCKER }) });
    // Do NOT bootstrap a project.
    await assert.rejects(
      runReview(ctx, { phase: 1 }),
      /no \.planning\/ project/,
      "should throw when no project exists",
    );
  });

  test("fail-fast: unknown phase throws a clear error (D-09)", async () => {
    const { ctx } = await mountReview({ subagents: makeReviewerSubagents({ structured: FINDINGS_BLOCKER }) });
    await bootstrapReview(ctx);
    await assert.rejects(
      runReview(ctx, { phase: 99 }),
      /phase 99 not in ROADMAP/,
      "should throw when phase does not exist",
    );
  });
});

// ── pure helpers ──────────────────────────────────────────────────────────────

describe("code-review: pure helpers", () => {
  test("resolveFixFlags: --all implies --fix (D-04)", () => {
    assert.deepEqual(resolveFixFlags({ fix: false, all: true, auto: false }), { fix: true, all: true, auto: false });
  });

  test("resolveFixFlags: --auto implies --fix (D-04)", () => {
    assert.deepEqual(resolveFixFlags({ fix: false, all: false, auto: true }), { fix: true, all: false, auto: true });
  });

  test("resolveFixFlags: no flags → fix false", () => {
    assert.deepEqual(resolveFixFlags({}), { fix: false, all: false, auto: false });
  });

  test("resolveFindings rejects malformed output (D-05)", () => {
    assert.equal(resolveFindings(null), null);
    assert.equal(resolveFindings({}), null);
    assert.equal(resolveFindings({ findings: "not-array" }), null);
    assert.equal(resolveFindings({ findings: [{ id: "x", severity: "BOGUS", file: "f", lines: "1", title: "t", evidence: "e" }] }), null);
  });

  test("resolveFindings accepts valid findings", () => {
    const out = { findings: [{ id: "CR-01", severity: "BLOCKER", file: "f", lines: "1", title: "t", evidence: "e" }] };
    assert.equal(resolveFindings(out).length, 1);
  });

  test("severityCounts tallies by severity", () => {
    const counts = severityCounts([
      { severity: "BLOCKER" }, { severity: "BLOCKER" }, { severity: "WARNING" }, { severity: "INFO" },
    ]);
    assert.equal(counts.blocker, 2);
    assert.equal(counts.warning, 1);
    assert.equal(counts.info, 1);
    assert.equal(counts.total, 4);
  });

  test("severityCounts on empty/null is zeroed", () => {
    const counts = severityCounts(null);
    assert.equal(counts.total, 0);
    assert.equal(counts.blocker, 0);
  });
});

// ── command + packaging wiring ────────────────────────────────────────────────

describe("code-review: command + packaging wiring", () => {
  test("PATCH_ROWS includes a code-review entry", () => {
    assert.ok(PATCH_ROWS.some((r) => r.sub === "code-review"), "no code-review patch row");
  });

  test("full mount registers gsd_code_review tool + gsd-code-review command", async () => {
    const allSubs = PATCH_ROWS.map((r) => r.sub);
    const { ctx } = await mountSubset(allSubs, { subagents: makeReviewerSubagents({ structured: { findings: [] } }) });
    assert.ok(ctx.tools.some((t) => t.name === "gsd_code_review"), "gsd_code_review tool not registered");
    assert.ok(ctx.commands.some((c) => c.name === "gsd-code-review"), "gsd-code-review command not registered");
  });

  test("retiring code-review drops both the tool and the command (DEGR-03)", async () => {
    const subs = PATCH_ROWS.map((r) => r.sub).filter((s) => s !== "code-review");
    const { ctx } = await mountSubset(subs, { subagents: makeReviewerSubagents({ structured: { findings: [] } }) });
    assert.ok(!ctx.tools.some((t) => t.name === "gsd_code_review"), "gsd_code_review still registered after retirement");
    assert.ok(!ctx.commands.some((c) => c.name === "gsd-code-review"), "gsd-code-review still registered after retirement");
    assert.ok(!ctx.provided.has("gsdCodeReview"), "gsdCodeReview capability still provided after retirement");
  });

  test("persona renders the code-review paragraph on full mount and omits it when retired", async () => {
    const allSubs = PATCH_ROWS.map((r) => r.sub);
    const full = await mountSubset(allSubs, { subagents: makeReviewerSubagents({ structured: { findings: [] } }) });
    assert.match(personaBody(full.ctx), /^- Code review:/m);

    const subs = PATCH_ROWS.map((r) => r.sub).filter((s) => s !== "code-review");
    const retired = await mountSubset(subs, { subagents: makeReviewerSubagents({ structured: { findings: [] } }) });
    assert.doesNotMatch(personaBody(retired.ctx), /^- Code review:/m);
  });
});

// ── 3-tier file scoping (D-08) ────────────────────────────────────────────────

describe("code-review: 3-tier file scoping (D-08)", () => {
  test("validateFiles rejects path traversal, absolute paths, and shell metacharacters", () => {
    const { valid, skipped } = validateFiles(["lib/foo.js", "../etc/passwd", "/abs/path", "lib/bar.js;rm -rf", "lib/ok.js"]);
    assert.ok(valid.includes("lib/foo.js"));
    assert.ok(valid.includes("lib/ok.js"));
    assert.ok(skipped.includes("../etc/passwd"));
    assert.ok(skipped.includes("/abs/path"));
    assert.ok(skipped.includes("lib/bar.js;rm -rf"));
  });

  test("validateFiles accepts clean relative paths", () => {
    const { valid, skipped } = validateFiles(["lib/foo.js", "test/bar.test.mjs", "plugins/x.js"]);
    assert.equal(skipped.length, 0);
    assert.equal(valid.length, 3);
  });

  test("validateFiles rejects backtick, dollar, ampersand, pipe, angle brackets", () => {
    const bad = ["a`b", "a$b", "a&b", "a|b", "a<b", "a>b"];
    const { valid, skipped } = validateFiles(bad);
    assert.equal(valid.length, 0);
    assert.equal(skipped.length, 6);
  });

  test("computeScope: --files override wins over summary and git diff", () => {
    const r = computeScope({ filesOverride: ["lib/a.js"], summaryFiles: ["lib/b.js"], gitDiffFiles: ["lib/c.js"] });
    assert.equal(r.tier, "files");
    assert.deepEqual(r.files, ["lib/a.js"]);
  });

  test("computeScope: summary wins over git diff when no --files", () => {
    const r = computeScope({ filesOverride: [], summaryFiles: ["lib/b.js"], gitDiffFiles: ["lib/c.js"] });
    assert.equal(r.tier, "summary");
    assert.deepEqual(r.files, ["lib/b.js"]);
  });

  test("computeScope: git diff when no --files and no summary", () => {
    const r = computeScope({ filesOverride: undefined, summaryFiles: [], gitDiffFiles: ["lib/c.js"] });
    assert.equal(r.tier, "git");
    assert.deepEqual(r.files, ["lib/c.js"]);
  });

  test("computeScope: none when all empty", () => {
    const r = computeScope({});
    assert.equal(r.tier, "none");
    assert.deepEqual(r.files, []);
  });

  test("filterSourcePaths drops .planning, artefacts, lockfiles", () => {
    const kept = filterSourcePaths([
      "lib/foo.js",
      ".planning/STATE.md",
      "ROADMAP.md",
      "STATE.md",
      "phases/01-foo-SUMMARY.md",
      "phases/01-foo-VERIFICATION.md",
      "phases/01-foo-PLAN.md",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "test/bar.test.mjs",
    ]);
    assert.ok(kept.includes("lib/foo.js"));
    assert.ok(kept.includes("test/bar.test.mjs"));
    assert.ok(!kept.some((p) => p.startsWith(".planning/")));
    assert.ok(!kept.includes("ROADMAP.md"));
    assert.ok(!kept.includes("STATE.md"));
    assert.ok(!kept.some((p) => p.endsWith("-SUMMARY.md")));
    assert.ok(!kept.some((p) => p.endsWith("-PLAN.md")));
    assert.ok(!kept.some((p) => p.endsWith("-VERIFICATION.md")));
    assert.ok(!kept.includes("package-lock.json"));
    assert.ok(!kept.includes("yarn.lock"));
    assert.ok(!kept.includes("pnpm-lock.yaml"));
  });

  test("tool-level: --files filters traversal/absolute paths and proceeds (D-08)", async () => {
    const captured = [];
    const { ctx } = await mountReview({ subagents: makeReviewerSubagents({ structured: { findings: [] }, capture: (req) => captured.push(req) }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    // Write a source file so the scope has a real file to review.
    const target = await ctx.fs.resolve(`${CWD}/lib/a.js`);
    await ctx.fs.writeText(target, "export const x = 1;\n");

    const res = await runReview(ctx, { phase: 1, files: "lib/a.js,../etc/passwd,/abs/path" });
    assert.match(res, /Code review complete/i);
    const review = await gsdState.readArtifact(CWD, 1, "REVIEW");
    assert.ok(review, "REVIEW.md was written");
    // The reviewer prompt should include the valid file but NOT the traversal paths.
    const promptText = captured[captured.length - 1].prompt[0].text;
    assert.match(promptText, /lib\/a\.js/);
    assert.doesNotMatch(promptText, /\.\.\/etc\/passwd/);
    assert.doesNotMatch(promptText, /\/abs\/path/);
  });

  test("tool-level: empty scope → 'no source files to review' skip, no REVIEW.md (D-08)", async () => {
    const { ctx } = await mountReview({ subagents: makeReviewerSubagents({ structured: { findings: [] } }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");

    const res = await runReview(ctx, { phase: 1 });
    assert.match(res, /no source files to review/i);
    assert.equal(await gsdState.hasArtifact(CWD, 1, "REVIEW"), false, "REVIEW.md must NOT be written on empty scope");
  });

  test("tool-level: SUMMARY key-files extraction pulls created+modified into scope", async () => {
    const captured = [];
    const { ctx, fs } = await mountReview({ subagents: makeReviewerSubagents({ structured: { findings: [] }, capture: (req) => captured.push(req) }) });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");

    // Write the source files referenced in the SUMMARY so existence checks pass.
    await fs.writeText(await fs.resolve(`${CWD}/lib/new.js`), "export const n = 1;\n");
    await fs.writeText(await fs.resolve(`${CWD}/lib/old.js`), "export const o = 2;\n");

    // Write a fake *-SUMMARY.md with key-files frontmatter.
    const summaryBody = "---\n" +
      "phase: 1\n" +
      "plan: 01\n" +
      "key-files:\n" +
      "  created:\n" +
      "    - lib/new.js\n" +
      "  modified:\n" +
      "    - lib/old.js\n" +
      "---\n# Summary\n";
    await gsdState.writeArtifact(CWD, 1, "SUMMARY-01", summaryBody);

    const res = await runReview(ctx, { phase: 1 });
    assert.match(res, /Code review complete/i);
    const promptText = captured[captured.length - 1].prompt[0].text;
    assert.match(promptText, /lib\/new\.js/);
    assert.match(promptText, /lib\/old\.js/);
  });
});

// ── applyAnchorEdits pure helper (D-01/D-02/D-03) ────────────────────────────

describe("code-review: applyAnchorEdits pure helper (D-01/D-02/D-03)", () => {
  const CONTENT = "export const x = 1;\nexport const y = 2;\n";

  test("unique-anchor happy path replaces exactly the intended occurrence", () => {
    const r = applyAnchorEdits(CONTENT, [{ find: "export const y = 2;", replace: "export const y = 20;" }]);
    assert.equal(r.failed, null);
    assert.equal(r.content, "export const x = 1;\nexport const y = 20;\n");
  });

  test("sequential edits: edit 2 validates against the result of edit 1 (evolving content, D-02)", () => {
    const r = applyAnchorEdits(CONTENT, [
      { find: "export const x = 1;", replace: "export const x = 10;" },
      { find: "export const x = 10;", replace: "export const x = 100;" },
    ]);
    assert.equal(r.failed, null);
    assert.equal(r.content, "export const x = 100;\nexport const y = 2;\n");
  });

  test("duplicate anchor (find occurs twice) fails naming the edit and the count", () => {
    const dup = "const a = 1;\nconst a = 1;\n";
    const r = applyAnchorEdits(dup, [{ find: "const a = 1;", replace: "const a = 2;" }]);
    assert.ok(r.failed, "a twice-matching anchor must fail");
    assert.match(r.failed, /edit 1/);
    assert.match(r.failed, /2 times/);
    assert.equal(r.content, dup, "original returned byte-identical");
  });

  test("missing anchor (0 occurrences) fails naming the edit and the count", () => {
    const r = applyAnchorEdits(CONTENT, [{ find: "no such line", replace: "x" }]);
    assert.ok(r.failed);
    assert.match(r.failed, /edit 1/);
    assert.match(r.failed, /0 times/);
    assert.equal(r.content, CONTENT);
  });

  test("empty find string fails", () => {
    const r = applyAnchorEdits(CONTENT, [{ find: "", replace: "x" }]);
    assert.ok(r.failed, "an empty find anchor must be rejected");
    assert.equal(r.content, CONTENT);
  });

  test("replace containing the find string does not corrupt a later edit's matching", () => {
    // Edit 1's replacement embeds edit 2's anchor; edit 2 must still match
    // exactly once against the evolving content and replace correctly (OQ-9).
    const r = applyAnchorEdits("A;\nB;\n", [
      { find: "B;", replace: "B; // B; was here" },
      { find: "B; // B; was here", replace: "C;" },
    ]);
    assert.equal(r.failed, null);
    assert.equal(r.content, "A;\nC;\n");
  });

  test("any failed edit returns the ORIGINAL content byte-identical (D-03 atomicity)", () => {
    const r = applyAnchorEdits(CONTENT, [
      { find: "export const x = 1;", replace: "export const x = 10;" },
      { find: "missing anchor", replace: "zzz" },
    ]);
    assert.ok(r.failed);
    assert.match(r.failed, /edit 2/);
    assert.equal(r.content, CONTENT, "no partial application may escape");
  });
});

// ── --fix per-fix atomic commits + severity filtering (D-04/D-05/D-11/D-12) ──

// A controllable fake subagents factory that routes by label: reviewer vs fixer.
// Mirrors makeReviewerSubagents but supports both subagent roles. Either
// controller's `structured` may be a value or a function(req) → value.
//
// D-06 harness extensions: a controller may ALSO carry
//   - failAt: a 0-based call index (number) or array of indices that throw
//     instead of returning (per-call fault control — e.g. only the re-review
//     faults, or only fixer call 0), and
//   - result: an object or function(req, callIdx) → object merged OVER the
//     default result so tests can override stopReason/diagnostic/structured
//     (e.g. a non-completed max-tokens run with a diagnostic).
// Plain `fail: true` still throws on every call (back-compat).
function makeReviewFixSubagents(reviewerCtrl, fixerCtrl) {
  let reviewerCalls = 0;
  let fixerCalls = 0;
  const shouldFail = (ctrl, idx) => {
    if (typeof ctrl.failAt === "number") return idx === ctrl.failAt;
    if (Array.isArray(ctrl.failAt)) return ctrl.failAt.includes(idx);
    return !!ctrl.fail;
  };
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      if (req.label === "gsd-code-reviewer") {
        const idx = reviewerCalls++;
        if (reviewerCtrl.capture) reviewerCtrl.capture(req);
        if (shouldFail(reviewerCtrl, idx)) throw new Error("reviewer exploded");
        const structured = typeof reviewerCtrl.structured === "function" ? reviewerCtrl.structured(req) : reviewerCtrl.structured;
        const base = { output: [{ type: "text", text: "reviewed" }], stopReason: "completed", structured };
        const override = typeof reviewerCtrl.result === "function" ? reviewerCtrl.result(req, idx) : reviewerCtrl.result;
        return { result: { ...base, ...override }, dispose: () => {} };
      }
      if (req.label === "gsd-code-fixer") {
        const idx = fixerCalls++;
        if (fixerCtrl.capture) fixerCtrl.capture(req);
        if (shouldFail(fixerCtrl, idx)) throw new Error("fixer exploded");
        const structured = typeof fixerCtrl.structured === "function" ? fixerCtrl.structured(req) : fixerCtrl.structured;
        const base = { output: [{ type: "text", text: "fixed" }], stopReason: "completed", structured };
        const override = typeof fixerCtrl.result === "function" ? fixerCtrl.result(req, idx) : fixerCtrl.result;
        return { result: { ...base, ...override }, dispose: () => {} };
      }
      return { result: { output: [], stopReason: "completed" }, dispose: () => {} };
    },
  };
}

// A fake gitFn that records calls and simulates staging/committing. rev-parse
// (the D-12 per-fix hash capture) returns a distinct fake full hash per call,
// recorded in `hashes` in call order so tests can assert exactly which hashes
// landed in REVIEW-FIX.md.
function makeFakeGit() {
  const calls = [];
  const hashes = [];
  let revParseCount = 0;
  const fakeGit = async (_cwd, args) => {
    calls.push([...args]);
    if (args[0] === "rev-parse") {
      revParseCount++;
      const hash = `deadbeef${String(revParseCount).padStart(2, "0")}c0ffee`;
      hashes.push(hash);
      return hash;
    }
    if (args[0] === "add") return "";
    if (args[0] === "diff" && args[1] === "--cached" && args[2] === "--name-only") {
      // Return the staged files from the last "add" call.
      const lastAdd = [...calls].reverse().find((c) => c[0] === "add");
      return lastAdd ? lastAdd.slice(1).join("\n") : "";
    }
    if (args[0] === "commit") return "";
    return "";
  };
  return { calls, fakeGit, hashes };
}

const FINDINGS_MIXED = {
  findings: [
    { id: "CR-01", severity: "BLOCKER", file: "lib/foo.js", lines: "42", title: "null deref", evidence: "x.y on line 42", suggestion: "guard null" },
    { id: "WR-01", severity: "WARNING", file: "lib/bar.js", lines: "10", title: "bad name", evidence: "var x = 1", suggestion: "use const" },
    { id: "IF-01", severity: "INFO", file: "lib/baz.js", lines: "5", title: "style", evidence: "extra space", suggestion: "trim" },
  ],
};

describe("code-review: --fix per-fix atomic commits + severity filtering (D-04/D-05/D-11/D-12)", () => {
  test("filterBySeverity: default scope = BLOCKER + WARNING (no INFO)", () => {
    const filtered = filterBySeverity(FINDINGS_MIXED.findings, false);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((f) => f.severity !== "INFO"));
  });

  test("filterBySeverity: includeInfo=true keeps all three", () => {
    const filtered = filterBySeverity(FINDINGS_MIXED.findings, true);
    assert.equal(filtered.length, 3);
  });

  test("hasBlockingFindings: true when BLOCKER or WARNING present", () => {
    assert.equal(hasBlockingFindings(FINDINGS_MIXED.findings), true);
    assert.equal(hasBlockingFindings([{ severity: "INFO" }]), false);
    assert.equal(hasBlockingFindings([]), false);
  });

  test("resolveFixFlags: fix=true alone → fix true", () => {
    assert.deepEqual(resolveFixFlags({ fix: true, all: false, auto: false }), { fix: true, all: false, auto: false });
  });

  test("commitSourceFiles: stages specific files and commits atomically", async () => {
    const { calls, fakeGit } = makeFakeGit();
    const r = await commitSourceFiles("/proj", ["lib/foo.js"], "fix message", fakeGit);
    assert.equal(r.committed, true);
    assert.deepEqual(r.staged, ["lib/foo.js"]);
    assert.equal(r.message, "fix message");
    // First call should be ["add", "lib/foo.js"]
    assert.deepEqual(calls[0], ["add", "lib/foo.js"]);
    // Then ["diff", "--cached", "--name-only"]
    assert.deepEqual(calls[1], ["diff", "--cached", "--name-only"]);
    // Then ["commit", "-m", "fix message"]
    const commitCall = calls.find((c) => c[0] === "commit");
    assert.ok(commitCall);
    assert.equal(commitCall[1], "-m");
    assert.equal(commitCall[2], "fix message");
  });

  test("commitSourceFiles: nothing-staged path returns committed:false with warning", async () => {
    const fakeGit = async (_cwd, args) => {
      if (args[0] === "add") return "";
      if (args[0] === "diff" && args.includes("--name-only")) return "";
      return "";
    };
    const r = await commitSourceFiles("/proj", ["lib/none.js"], "msg", fakeGit);
    assert.equal(r.committed, false);
    assert.equal(r.staged.length, 0);
    assert.ok(r.warning);
  });

  test("CODE_FIXER_PROMPT is exported and self-contained (no commit/worktree)", () => {
    assert.ok(typeof CODE_FIXER_PROMPT === "string");
    assert.match(CODE_FIXER_PROMPT, /gsd-code-fixer/i);
    assert.match(CODE_FIXER_PROMPT, /Do NOT commit/i);
    assert.match(CODE_FIXER_PROMPT, /Do NOT.*worktree|Do NOT manage worktree/i);
    // Anchor-edit contract (D-02): bounded edits with verbatim exactly-once
    // anchors — the full-file-echo demand is gone.
    assert.match(CODE_FIXER_PROMPT, /edits/);
    assert.match(CODE_FIXER_PROMPT, /verbatim/i);
    assert.match(CODE_FIXER_PROMPT, /exactly once/i);
    assert.doesNotMatch(CODE_FIXER_PROMPT, /FULL fixed file content/i);
  });

  test("--fix: per-fix atomic commits with scoped messages + REVIEW-FIX.md (D-11/D-12)", async () => {
    const { calls: gitCalls, fakeGit, hashes } = makeFakeGit();
    const reviewerCtrl = { structured: FINDINGS_MIXED };
    const spawnOrder = [];
    reviewerCtrl.capture = () => spawnOrder.push("reviewer");
    let fixerCallIdx = 0;
    const fixerCtrl = {
      capture: () => spawnOrder.push("fixer"),
      structured: () => {
        const fixes = [
          {
            id: "CR-01", status: "fixed", file: "lib/foo.js",
            // Two ordered edits: edit 2's anchor only exists after edit 1 lands.
            edits: [
              { find: "export const x = 1;", replace: "export const x = 0;" },
              { find: "export const x = 0;", replace: "export const x = 42; // guarded null" },
            ],
          },
          {
            id: "WR-01", status: "fixed", file: "lib/bar.js",
            edits: [{ find: "export const x = 1;", replace: "const x = 1; // const style" }],
          },
        ];
        return fixes[fixerCallIdx++];
      },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    ctx.gitFn = fakeGit;

    // Pre-write source files so scoping + fixer file reads work.
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    const res = await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    assert.match(res, /REVIEW-FIX/i);

    // One-shot flow (D-04): the reviewer spawns before any fixer spawn.
    assert.equal(spawnOrder[0], "reviewer", "reviewer must spawn before the first fixer");
    assert.equal(spawnOrder[1], "fixer");

    // REVIEW-FIX.md was written with 2 fixes applied (BLOCKER + WARNING, no INFO).
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.ok(fixReport, "REVIEW-FIX.md was not written");
    const { frontmatter, body } = parseFrontmatter(fixReport);
    assert.equal(frontmatter.fixes_applied, 2);
    assert.equal(frontmatter.status, "applied");
    // Real per-fix commit hashes recorded (D-11/D-12): frontmatter commits
    // deep-equal the two rev-parse captures, in fix order.
    assert.deepEqual(frontmatter.commits, [hashes[0], hashes[1]]);

    // Anchor edits were applied to the files (not a full-content echo):
    // foo.js got both ordered edits, bar.js got its single edit.
    const fooContent = await fs.readText(await fs.resolve(`${CWD}/lib/foo.js`));
    assert.equal(fooContent, "export const x = 42; // guarded null\n");
    const barContent = await fs.readText(await fs.resolve(`${CWD}/lib/bar.js`));
    assert.equal(barContent, "const x = 1; // const style\n");

    // Body rows carry the commit hashes (D-11 manual-report shape).
    assert.match(body, new RegExp(hashes[0]));
    assert.match(body, new RegExp(hashes[1]));

    // commitSourceFiles was called twice (one per finding) with scoped messages,
    // each followed by a rev-parse HEAD hash capture (D-12).
    const commitCalls = gitCalls.filter((c) => c[0] === "commit");
    assert.equal(commitCalls.length, 2, "expected 2 per-fix commits");
    assert.match(commitCalls[0][2], /phase 1 review-fix.*F01.*BLOCKER/i);
    assert.match(commitCalls[1][2], /phase 1 review-fix.*F02.*WARNING/i);
    const revParseCalls = gitCalls.filter((c) => c[0] === "rev-parse" && c[1] === "HEAD");
    assert.equal(revParseCalls.length, 2, "expected one rev-parse HEAD per fix commit");
    for (const cc of commitCalls) {
      const idx = gitCalls.indexOf(cc);
      assert.deepEqual(gitCalls[idx + 1], ["rev-parse", "HEAD"], "hash capture must follow each commit");
    }
  });

  test("--fix fail-fast: review UNAVAILABLE → throws (D-09)", async () => {
    const reviewerCtrl = { fail: true };
    const fixerCtrl = { structured: {} };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs);

    await assert.rejects(
      runReview(ctx, { phase: 1, fix: true, files: "lib/sample.js" }),
      /REVIEW\.md.*--fix|run.*code-review.*first/i,
      "should throw when fix=true but review was UNAVAILABLE",
    );
  });

  test("--all: adds INFO to fix scope (D-05)", async () => {
    const reviewerCtrl = { structured: FINDINGS_MIXED };
    let fixerCallIdx = 0;
    const fixerCtrl = {
      structured: () => {
        const fixes = [
          { id: "CR-01", status: "fixed", file: "lib/foo.js", edits: [{ find: "export const x = 1;", replace: "export const x = 0; // guarded" }] },
          { id: "WR-01", status: "fixed", file: "lib/bar.js", edits: [{ find: "export const x = 1;", replace: "const x = 1;" }] },
          { id: "IF-01", status: "fixed", file: "lib/baz.js", edits: [{ find: "export const x = 1;", replace: "export const x = 1; // trimmed" }] },
        ];
        return fixes[fixerCallIdx++];
      },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    await runReview(ctx, { phase: 1, all: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.ok(fixReport);
    const { frontmatter } = parseFrontmatter(fixReport);
    assert.equal(frontmatter.fixes_applied, 3, "--all should fix all 3 findings including INFO");
  });

  test("--fix without --all: INFO findings excluded from fix scope (D-05)", async () => {
    const reviewerCtrl = { structured: FINDINGS_MIXED };
    let fixerCallIdx = 0;
    const fixerCtrl = {
      structured: () => {
        const fixes = [
          { id: "CR-01", status: "fixed", file: "lib/foo.js", edits: [{ find: "export const x = 1;", replace: "export const x = 0; // guarded" }] },
          { id: "WR-01", status: "fixed", file: "lib/bar.js", edits: [{ find: "export const x = 1;", replace: "const x = 1;" }] },
        ];
        return fixes[fixerCallIdx++];
      },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.ok(fixReport);
    const { frontmatter } = parseFrontmatter(fixReport);
    assert.equal(frontmatter.fixes_applied, 2, "without --all, only BLOCKER+WARNING should be fixed");
  });

  test("degrade-on-fixer-fault: per-finding skips with real causes, status 'skipped', never throws (D-06)", async () => {
    const reviewerCtrl = { structured: FINDINGS_MIXED };
    const fixerCtrl = { fail: true };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    // Passing this line IS the "never throws on fixer fault" assertion (D-06).
    const res = await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.ok(fixReport, "REVIEW-FIX.md must be written even when every fix faults");
    const { frontmatter, body } = parseFrontmatter(fixReport);
    // A plain fixer fault is a per-finding skip (D-06), NOT 'unavailable' —
    // that status is reserved for fixer-infrastructure absence.
    assert.equal(frontmatter.status, "skipped");
    assert.equal(frontmatter.fixes_applied, 0);
    assert.equal(frontmatter.fixes_skipped, 2);
    assert.match(body, /fixer exploded/, "each skip must carry its REAL cause");
    assert.doesNotMatch(fixReport, /UNAVAILABLE/i);
  });
});

// ── --fix skip-and-continue + real causes + resolveFixStatus (D-06/D-07) ─────

describe("code-review: --fix skip-and-continue + real causes (D-06/D-07/OQ-1/OQ-3/OQ-12)", () => {
  test("skip-and-continue: fixer call 0 faults, call 1 lands → overall 'applied', fault row carries the real cause (D-06)", async () => {
    const reviewerCtrl = { structured: FINDINGS_MIXED };
    const fixerCtrl = {
      failAt: 0, // only the FIRST fixer call throws; the second completes
      structured: () => ({
        id: "WR-01", status: "fixed", file: "lib/bar.js",
        edits: [{ find: "export const x = 1;", replace: "const x = 1; // const style" }],
      }),
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    const res = await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    assert.match(res, /REVIEW-FIX/i);
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    const { frontmatter, body } = parseFrontmatter(fixReport);
    assert.equal(frontmatter.status, "applied", "≥1 landed fix ⇒ 'applied' even with a faulted finding");
    assert.equal(frontmatter.fixes_applied, 1);
    assert.equal(frontmatter.fixes_skipped, 1);
    assert.match(body, /CR-01/, "the faulted finding gets its own row");
    assert.match(body, /fixer exploded/, "with its real cause, not a generic string");
    // The faulted finding's file stays byte-identical; the second fix landed.
    const foo = await fs.readText(await fs.resolve(`${CWD}/lib/foo.js`));
    assert.equal(foo, "export const x = 1;\n");
    const bar = await fs.readText(await fs.resolve(`${CWD}/lib/bar.js`));
    assert.equal(bar, "const x = 1; // const style\n");
  });

  test("non-completed fixer stopReason: raw stopReason + diagnostic excerpt in the skip cause (D-06/OQ-1/OQ-12)", async () => {
    const reviewerCtrl = { structured: FINDINGS_MIXED };
    const fixerCtrl = {
      result: { stopReason: "max-tokens", diagnostic: "hit the model token ceiling while emitting the edits array", structured: undefined },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    const { frontmatter, body } = parseFrontmatter(fixReport);
    assert.equal(frontmatter.status, "skipped");
    assert.equal(frontmatter.fixes_skipped, 2);
    // The REAL cause contract: the raw stopReason AND the diagnostic excerpt.
    assert.match(body, /fixer did not complete \(stopReason: max-tokens\)/);
    assert.match(body, /hit the model token ceiling while emitting the edits array/);
  });

  test("malformed structured output ({} and null) → skipped with the real cause, not a generic string (D-06)", async () => {
    // structured: {} → an object with no status → the actual value is named.
    {
      const reviewerCtrl = { structured: FINDINGS_MIXED };
      const fixerCtrl = { result: { structured: {} } };
      const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
      const { ctx, fs } = await mountReview({ subagents: subs });
      await bootstrapReview(ctx);
      const gsdState = ctx.get("gsdState");
      const { fakeGit } = makeFakeGit();
      ctx.gitFn = fakeGit;
      await seedSourceFile(fs, "lib/foo.js");
      await seedSourceFile(fs, "lib/bar.js");
      await seedSourceFile(fs, "lib/baz.js");
      await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
      const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
      assert.match(fixReport, /fixer returned malformed structured output \(status: undefined\)/);
    }
    // structured: null → the absent structured output + the stopReason.
    {
      const reviewerCtrl = { structured: FINDINGS_MIXED };
      const fixerCtrl = { result: { structured: null } };
      const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
      const { ctx, fs } = await mountReview({ subagents: subs });
      await bootstrapReview(ctx);
      const gsdState = ctx.get("gsdState");
      const { fakeGit } = makeFakeGit();
      ctx.gitFn = fakeGit;
      await seedSourceFile(fs, "lib/foo.js");
      await seedSourceFile(fs, "lib/bar.js");
      await seedSourceFile(fs, "lib/baz.js");
      await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
      const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
      assert.match(fixReport, /fixer returned no structured output \(stopReason: completed\)/);
    }
  });

  test("exactly ONE fixer attempt per finding — no retry within a run (D-07)", async () => {
    const reviewerCtrl = { structured: FINDINGS_MIXED };
    let fixerSpawns = 0;
    const fixerCtrl = { capture: () => fixerSpawns++, fail: true };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    // 2 fixable findings → exactly 2 fixer spawns; a retry would make 4.
    assert.equal(fixerSpawns, 2);
  });

  test("fixer-infrastructure fault (spawn provider gone) → status 'unavailable', every row unavailable, never throws (D-06/OQ-3)", async () => {
    // A subagents service whose spawn provider unregisters itself right after
    // the reviewer's spawn completes — simulating mid-run infrastructure loss.
    // (A fully-missing service makes the REVIEWER fault too, which hits the
    // locked D-08 --fix fail-fast before the fix loop; the probe is proven via
    // the provider-missing branch, the other half of spawnSubagent's checks.)
    let reviewerStarted = false;
    const subs = {
      getProvider: (n) => (n === "spawn" && !reviewerStarted ? { spawn: true } : undefined),
      async start(_n, req) {
        if (req.label === "gsd-code-reviewer") {
          reviewerStarted = true;
          return { result: { output: [{ type: "text", text: "reviewed" }], stopReason: "completed", structured: FINDINGS_MIXED }, dispose: () => {} };
        }
        throw new Error("fixer must never spawn when the spawn provider is gone");
      },
    };
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    // Must complete without throwing (the probe degrades, never hard-blocks).
    const res = await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    assert.match(res, /REVIEW-FIX/i);
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.ok(fixReport, "REVIEW-FIX.md must be written on infrastructure fault");
    const { frontmatter, body } = parseFrontmatter(fixReport);
    assert.equal(frontmatter.status, "unavailable");
    assert.equal(frontmatter.fixes_applied, 0);
    assert.equal(frontmatter.fixes_skipped, 2, "every fixable finding is recorded");
    assert.match(body, /`spawn` subagent provider is not registered/, "rows carry the verbatim infra cause");
    assert.doesNotMatch(body, /fixed \(commit/, "nothing landed");
  });

  test("resolveFixStatus: the D-06 decision table as a pure function", () => {
    assert.equal(resolveFixStatus([], [], true), "unavailable", "infrastructure fault ⇒ 'unavailable' even with nothing else");
    assert.equal(resolveFixStatus([{ id: "x", status: "fixed" }], [{ id: "y", status: "skipped" }], false), "applied");
    assert.equal(resolveFixStatus([{ id: "x", status: "fixed" }], [], false), "applied");
    assert.equal(resolveFixStatus([], [{ id: "y", status: "skipped", reason: "cause" }], false), "skipped");
    assert.equal(resolveFixStatus([], [], false), "skipped");
  });

  test("excerpt: truncates to the max bound with an ellipsis (OQ-12)", () => {
    assert.equal(excerpt("short"), "short");
    assert.equal(excerpt(""), "");
    assert.equal(excerpt(null), "");
    const long = "x".repeat(500);
    const out = excerpt(long);
    assert.equal(out.length, 401, "400 chars + ellipsis");
    assert.ok(out.endsWith("…"));
    assert.equal(excerpt(long, 10), "xxxxxxxxxx…");
    // Surrounding whitespace is trimmed (repair.js precedent).
    assert.equal(excerpt("  hi  "), "hi");
  });
});

// ── --fix tool-side structural/path validation (OQ-6/OQ-7/OQ-8) ──────────────

describe("code-review: --fix tool-side structural/path validation (OQ-6/OQ-7/OQ-8)", () => {
  const FINDING = { id: "CR-01", severity: "BLOCKER", file: "lib/foo.js", lines: "1", title: "t", evidence: "e", suggestion: "s" };

  // Mount a --fix run with one seeded source file and controllable reviewer
  // findings + fixer structured output (value or fn(req)); returns the fixer
  // spawn count so tests can prove a finding never reached the fixer.
  async function mountFixScenario(findings, fixerStructured, seed = "lib/foo.js") {
    const reviewerCtrl = { structured: { findings } };
    let fixerCalls = 0;
    const fixerCtrl = {
      structured: (req) => {
        fixerCalls++;
        return typeof fixerStructured === "function" ? fixerStructured(req) : fixerStructured;
      },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    ctx.gitFn = makeFakeGit().fakeGit;
    await seedSourceFile(fs, seed);
    const gsdState = ctx.get("gsdState");
    return { ctx, fs, gsdState, getFixerCalls: () => fixerCalls };
  }

  test("status fixed without edits → skipped 'fixer returned no edits', file byte-identical (OQ-6)", async () => {
    const { ctx, fs, gsdState, getFixerCalls } = await mountFixScenario(
      [FINDING],
      { id: "CR-01", status: "fixed", file: "lib/foo.js" },
    );
    await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js" });
    assert.equal(getFixerCalls(), 1, "the fixer did spawn — the tool-side check caught the missing edits");
    const content = await fs.readText(await fs.resolve(`${CWD}/lib/foo.js`));
    assert.equal(content, "export const x = 1;\n", "file must stay byte-identical");
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    const { frontmatter, body } = parseFrontmatter(fixReport);
    assert.equal(frontmatter.fixes_skipped, 1);
    assert.equal(frontmatter.fixes_applied, 0);
    assert.match(body, /fixer returned no edits/);
  });

  test("mismatched fixer id → skipped 'fixer returned output for finding <id>' (OQ-7)", async () => {
    const { ctx, fs, gsdState, getFixerCalls } = await mountFixScenario(
      [FINDING],
      { id: "WR-99", status: "fixed", file: "lib/foo.js", edits: [{ find: "export const x = 1;", replace: "hacked" }] },
    );
    await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js" });
    assert.equal(getFixerCalls(), 1);
    const content = await fs.readText(await fs.resolve(`${CWD}/lib/foo.js`));
    assert.equal(content, "export const x = 1;\n", "mismatched-id output must never be applied");
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.match(fixReport, /fixer returned output for finding WR-99/);
  });

  test("mismatched fixer file → skipped naming the mismatch; finding.file stays the target (OQ-8)", async () => {
    const { ctx, fs, gsdState, getFixerCalls } = await mountFixScenario(
      [FINDING],
      { id: "CR-01", status: "fixed", file: "lib/other.js", edits: [{ find: "export const x = 1;", replace: "redirected" }] },
    );
    await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js" });
    assert.equal(getFixerCalls(), 1);
    const content = await fs.readText(await fs.resolve(`${CWD}/lib/foo.js`));
    assert.equal(content, "export const x = 1;\n", "a mismatched echoed path must not redirect the write");
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.match(fixReport, /fixer returned file lib\/other\.js but the finding targets lib\/foo\.js/);
  });

  test("reviewer finding with an invalid fix target path → skipped without any fixer spawn (OQ-8)", async () => {
    const evil = { id: "CR-01", severity: "BLOCKER", file: "../evil.js", lines: "1", title: "t", evidence: "e", suggestion: "s" };
    const { ctx, gsdState, getFixerCalls } = await mountFixScenario(
      [evil],
      { id: "CR-01", status: "fixed", file: "../evil.js", edits: [{ find: "x", replace: "y" }] },
    );
    await runReview(ctx, { phase: 1, fix: true, files: "lib/foo.js" });
    assert.equal(getFixerCalls(), 0, "the fixer must not spawn for an invalid fix target path");
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.ok(fixReport);
    assert.match(fixReport, /invalid fix target path: \.\.\/evil\.js/);
  });
});

// ── --fix unchanged guards (D-04/D-08) ───────────────────────────────────────

describe("code-review: --fix unchanged guards (D-04/D-08)", () => {
  test("clean review with fix:true → soft-skip, NO REVIEW-FIX.md, no fixer spawn (D-08)", async () => {
    let fixerCalls = 0;
    const reviewerCtrl = { structured: { findings: [] } };
    const fixerCtrl = {
      structured: () => {
        fixerCalls++;
        return { id: "x", status: "fixed", file: "lib/sample.js", edits: [] };
      },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const gsdState = ctx.get("gsdState");
    ctx.gitFn = makeFakeGit().fakeGit;
    const rel = await seedSourceFile(fs);

    const res = await runReview(ctx, { phase: 1, fix: true, files: rel });
    assert.match(res, /clean|no findings/i);
    const fixReport = await gsdState.readArtifact(CWD, 1, "REVIEW-FIX");
    assert.ok(!fixReport, "a clean review must not write REVIEW-FIX.md");
    assert.equal(fixerCalls, 0, "no fixer spawn on a clean review");
  });
});

// ── --auto iteration loop (D-06) ─────────────────────────────────────────────

describe("code-review: --auto iteration loop (D-06)", () => {
  test("early stop: iteration 2 returns INFO-only → stops, does NOT reach cap of 3", async () => {
    let reviewerCallCount = 0;
    let fixerCallCount = 0;
    const reviewerCtrl = {
      structured: () => {
        reviewerCallCount++;
        if (reviewerCallCount === 1) return { findings: [
          { id: "CR-01", severity: "BLOCKER", file: "lib/foo.js", lines: "1", title: "b", evidence: "e", suggestion: "s" },
          { id: "WR-01", severity: "WARNING", file: "lib/bar.js", lines: "2", title: "w", evidence: "e", suggestion: "s" },
          { id: "IF-01", severity: "INFO", file: "lib/baz.js", lines: "3", title: "i", evidence: "e", suggestion: "s" },
        ]};
        // Iteration 2: INFO-only → early stop
        return { findings: [{ id: "IF-01", severity: "INFO", file: "lib/baz.js", lines: "3", title: "i", evidence: "e", suggestion: "s" }] };
      },
    };
    const fixerCtrl = {
      structured: () => {
        fixerCallCount++;
        // Anchor-edit fixtures: unique anchors copied from the seeded content.
        const fixes = [
          { id: "CR-01", status: "fixed", file: "lib/foo.js", edits: [{ find: "export const x = 1;", replace: "export const x = 2; // fixed" }] },
          { id: "WR-01", status: "fixed", file: "lib/bar.js", edits: [{ find: "export const x = 1;", replace: "const x = 1; // const style" }] },
        ];
        return fixes[fixerCallCount - 1];
      },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");
    await seedSourceFile(fs, "lib/bar.js");
    await seedSourceFile(fs, "lib/baz.js");

    const res = await runReview(ctx, { phase: 1, auto: true, files: "lib/foo.js,lib/bar.js,lib/baz.js" });
    // Reviewer spawned: iteration 1 (review) + iteration 2 (re-review) = 2 total.
    assert.equal(reviewerCallCount, 2, "reviewer should be spawned exactly 2 times (early stop after iteration 2)");
    // Fixer spawned once (after iteration 1, before the INFO-only iteration 2).
    assert.equal(fixerCallCount, 2, "fixer should be spawned for iteration 1's 2 blocking findings");
    // Should mention convergence, not cap.
    assert.match(res, /converg|resolved|clean|iteration/i);
    // The round-1 fix actually landed on disk (anchor edits applied, not echoed).
    const fooContent = await fs.readText(await fs.resolve(`${CWD}/lib/foo.js`));
    assert.equal(fooContent, "export const x = 2; // fixed\n");
  });

  test("cap: reviewer always returns BLOCKER → reaches max 3 iterations", async () => {
    let reviewerCallCount = 0;
    let fixerCallCount = 0;
    const reviewerCtrl = {
      structured: () => {
        reviewerCallCount++;
        return { findings: [
          { id: "CR-01", severity: "BLOCKER", file: "lib/foo.js", lines: "1", title: "b", evidence: "e", suggestion: "s" },
        ]};
      },
    };
    const fixerCtrl = {
      structured: () => {
        fixerCallCount++;
        return { id: "CR-01", status: "fixed", file: "lib/foo.js", edits: [{ find: "export const x = 1;", replace: "export const x = 2; // fixed" }] };
      },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs, "lib/foo.js");

    const res = await runReview(ctx, { phase: 1, auto: true, files: "lib/foo.js" });
    // Reviewer spawned 3 times (cap = 3 iterations).
    assert.equal(reviewerCallCount, 3, "reviewer should be spawned 3 times (cap reached)");
    // Fixer spawned after each non-clean review: iterations 1, 2, and 3.
    assert.equal(fixerCallCount, 3, "fixer should be spawned for all 3 iterations (always BLOCKER)");
    assert.match(res, /maximum iteration|cap|3 iteration/i);
  });

  test("clean-on-first: iteration 1 returns no findings → no fixer, reports clean", async () => {
    let reviewerCallCount = 0;
    let fixerCallCount = 0;
    const reviewerCtrl = {
      structured: () => {
        reviewerCallCount++;
        return { findings: [] };
      },
    };
    const fixerCtrl = {
      structured: () => { fixerCallCount++; return {}; },
    };
    const subs = makeReviewFixSubagents(reviewerCtrl, fixerCtrl);
    const { ctx, fs } = await mountReview({ subagents: subs });
    await bootstrapReview(ctx);
    const { fakeGit } = makeFakeGit();
    ctx.gitFn = fakeGit;
    await seedSourceFile(fs);

    const res = await runReview(ctx, { phase: 1, auto: true, files: "lib/sample.js" });
    assert.equal(reviewerCallCount, 1, "reviewer should be spawned only once (clean on first)");
    assert.equal(fixerCallCount, 0, "fixer should NOT be spawned when clean on first review");
    assert.match(res, /clean|no findings/i);
  });
});