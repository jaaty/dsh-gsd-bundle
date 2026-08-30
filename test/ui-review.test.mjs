// Offline behavioural tests for the ui-review loop-step plugin
// (lib/ui-review.js), TDD per D-12. Proves gsd_ui_review produces a
// <NN>-UI-REVIEW.md with 6 pillar scores (each 1-4, overall /24), per-pillar
// findings with file:line evidence, and top-3 priority fixes from a fresh-context
// gsd-ui-auditor subagent, and advances STATE to 'ui-review' with next_action
// verify-phase. Offline only: FakeFs + fake-ctx + fake subagents. Plan 02 adds
// the edge-case tests: config-gate soft-skip, empty-scope soft-skip, UNAVAILABLE
// degrade (fault + malformed), screenshot gitignore gate, and the re-audit/view
// dispatch (D-02/D-03/D-07/D-09/D-10).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD, PATCH_ROWS, mountSubset, personaBody } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { buildCapability, CAPABILITY_KEYS } from "../lib/_capabilities.js";
import { loopSteps, renderPersonaBody } from "../lib/_render.js";
import { parseFrontmatter } from "../lib/_shared.js";
import {
  resolvePillars,
  computeOverall,
  countFindings,
  discoverFrontendFiles,
  ensureScreenshotGitignore,
  globToRegExp,
  matchesAnyGlob,
  FRONTEND_GLOBS,
} from "../lib/ui-review.js";

// Lazily import the plugin under test so the capability + wiring tests run
// before lib/ui-review.js is fully wired.
async function applyUiReview(ctx) {
  const m = await import("../lib/ui-review.js");
  m.apply(ctx, {});
}

// ── capability + loop wiring ──────────────────────────────────────────────────

describe("ui-review: capability + loop wiring", () => {
  test("buildCapability('gsdUiReview') returns the expected descriptor", () => {
    const c = buildCapability("gsdUiReview");
    assert.equal(c.key, "gsdUiReview");
    assert.equal(c.step, "ui-review");
    assert.equal(c.role, "step");
    assert.equal(c.order, 36);
    assert.deepEqual([...c.tools], ["gsd_ui_review"]);
    assert.deepEqual([...c.commands], ["gsd-ui-review"]);
    assert.deepEqual([...c.next], ["gsdVerify"]);
    assert.deepEqual([...c.produces], ["UI-REVIEW.md"]);
    assert.deepEqual([...c.consumes], ["SUMMARY.md"]);
  });

  test("CAPABILITY_KEYS lists gsdUiReview between gsdCodeReview and gsdVerify", () => {
    const idxReview = CAPABILITY_KEYS.indexOf("gsdCodeReview");
    const idxUi = CAPABILITY_KEYS.indexOf("gsdUiReview");
    const idxVerify = CAPABILITY_KEYS.indexOf("gsdVerify");
    assert.ok(idxUi > idxReview, "gsdUiReview must come after gsdCodeReview");
    assert.ok(idxUi < idxVerify, "gsdUiReview must come before gsdVerify");
  });

  test("loopSteps orders gsdUiReview (36) between execute (30) and verify (40)", () => {
    const steps = loopSteps([
      buildCapability("gsdExecute"),
      buildCapability("gsdCodeReview"),
      buildCapability("gsdUiReview"),
      buildCapability("gsdVerify"),
    ]);
    assert.equal(steps.length, 4);
    assert.equal(steps[0].order, 30);
    assert.equal(steps[1].order, 35);
    assert.equal(steps[2].order, 36);
    assert.equal(steps[2].key, "gsdUiReview");
    assert.equal(steps[3].order, 40);
  });

  test("renderPersonaBody renders a Ui-review paragraph only when present", () => {
    const withUi = renderPersonaBody([
      buildCapability("gsdSpec"),
      buildCapability("gsdExecute"),
      buildCapability("gsdUiReview"),
      buildCapability("gsdVerify"),
    ]);
    assert.match(withUi, /^- Ui-review:/m);

    const withoutUi = renderPersonaBody([
      buildCapability("gsdSpec"),
      buildCapability("gsdExecute"),
      buildCapability("gsdVerify"),
    ]);
    assert.doesNotMatch(withoutUi, /^- Ui-review:/m);
  });

  test("setActivePhase('ui-review') sets next_action to verify-phase", async () => {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    const gsdState = ctx.get("gsdState");
    await gsdState.initProject(CWD, {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements: [{ id: "UI-01", text: "ui review step" }],
      phases: [{ name: "ui-demo", goal: "ui review", requirements: ["UI-01"] }],
    });
    await gsdState.setActivePhase(CWD, 1, "ui-review");
    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.status, "ui-review");
    assert.equal(state.frontmatter.next_action, "verify-phase");
  });

  test("readConfig surfaces ui_review:true default", async () => {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    applyState(ctx, {});
    applyCoreTools(ctx, {});
    const gsdState = ctx.get("gsdState");
    await gsdState.initProject(CWD, {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements: [{ id: "UI-01", text: "x" }],
      phases: [{ name: "p1", goal: "g", requirements: ["UI-01"] }],
    });
    const cfg = await gsdState.readConfig(CWD);
    assert.equal(cfg.workflow.ui_review, true);
  });
});

// ── gsd_ui_review writes UI-REVIEW.md from an auditor subagent ───────────────

// A controllable fake auditor subagents factory (mirrors makeReviewerSubagents
// from test/code-review.test.mjs). fail=true makes start() throw (D-10).
function makeAuditorSubagents(controller) {
  return {
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      if (controller.capture) controller.capture(req);
      if (controller.fail) throw new Error("auditor exploded");
      return {
        result: {
          output: [{ type: "text", text: "audited" }],
          stopReason: "completed",
          structured: controller.structured,
        },
        dispose: () => {},
      };
    },
  };
}

async function mountUiReview({ subagents } = {}) {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs, { subagents });
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  await applyUiReview(ctx);
  return { fs, ctx };
}

// Pre-seed a frontend file so discovery (D-03) finds at least one file and the
// tool proceeds to write UI-REVIEW.md instead of soft-skipping.
async function seedFrontendFile(fs, rel = "src/App.tsx") {
  const target = await fs.resolve(`${CWD}/${rel}`);
  await fs.writeText(target, "export const App = () => <div>hi</div>;\n");
  return rel;
}

async function bootstrapUiReview(ctx) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    {
      name: "demo",
      milestoneName: "M1",
      version: "v1.0",
      requirements: [{ id: "UI-01", text: "A ui-review step produces UI-REVIEW.md." }],
      phases: [{ name: "ui-demo", goal: "ui review step", requirements: ["UI-01"] }],
    },
    makeExec(),
  );
}

function runUiReview(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_ui_review");
  assert.ok(t, "gsd_ui_review not registered");
  return t.execute(args, makeExec());
}

// A valid structured auditor result: 6 pillars (one per name enum), each with a
// score 1-4, a key_finding, and at least one finding with a valid severity;
// top_fixes with 3 entries; screenshots "not captured (no dev server)".
const VALID_AUDIT = {
  pillars: [
    { name: "Copywriting", score: 3, key_finding: "copy is mostly clear", findings: [{ severity: "WARNING", file: "src/App.tsx", lines: "1", title: "vague button label", evidence: "button says 'Go'" }] },
    { name: "Visuals", score: 3, key_finding: "visuals are consistent", findings: [{ severity: "WARNING", file: "src/App.tsx", lines: "2", title: "missing alt", evidence: "img without alt" }] },
    { name: "Color", score: 2, key_finding: "color contrast issues", findings: [{ severity: "WARNING", file: "src/App.tsx", lines: "3", title: "low contrast", evidence: "gray on gray" }] },
    { name: "Typography", score: 3, key_finding: "type scale is fine", findings: [{ severity: "WARNING", file: "src/App.tsx", lines: "4", title: "font size", evidence: "small text" }] },
    { name: "Spacing", score: 3, key_finding: "spacing is ok", findings: [{ severity: "WARNING", file: "src/App.tsx", lines: "5", title: "tight padding", evidence: "padding 2px" }] },
    { name: "Experience Design", score: 2, key_finding: "flow has friction", findings: [{ severity: "BLOCKER", file: "src/App.tsx", lines: "6", title: "no error state", evidence: "form has no error" }] },
  ],
  top_fixes: [
    { issue: "low contrast", impact: "users cannot read", fix: "increase contrast" },
    { issue: "no error state", impact: "users confused", fix: "add error state" },
    { issue: "vague label", impact: "users unsure", fix: "clarify label" },
  ],
  screenshots: "not captured (no dev server)",
};

describe("ui-review: gsd_ui_review writes UI-REVIEW.md from an auditor subagent", () => {
  test("happy path: valid structured audit produces UI-REVIEW.md with 6 pillars /24 + STATE 'ui-review'", async () => {
    const { ctx, fs } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");
    await seedFrontendFile(fs);

    const res = await runUiReview(ctx, { phase: 1 });
    assert.match(res, /UI review complete.*phase 1/si);

    const review = await gsdState.readArtifact(CWD, 1, "UI-REVIEW");
    assert.ok(review, "UI-REVIEW.md was not written");
    const { frontmatter, body } = parseFrontmatter(review);
    assert.equal(frontmatter.overall, 16); // 3+3+2+3+3+2
    assert.equal(frontmatter.screenshots, "not captured (no dev server)");
    assert.equal(frontmatter.blockers, 1);
    assert.equal(frontmatter.warnings, 5);
    for (const name of ["Copywriting", "Visuals", "Color", "Typography", "Spacing", "Experience Design"]) {
      assert.match(body, new RegExp(`## ${name}`));
    }
    assert.match(body, /16\/24/);
    assert.match(body, /## Top 3 Priority Fixes/);
    assert.match(body, /low contrast/);
    assert.match(body, /src\/App\.tsx/);

    // STATE advanced to the ui-review step with verify-phase as next action (D-09).
    const state = await gsdState.readState(CWD);
    assert.equal(state.frontmatter.status, "ui-review");
    assert.equal(state.frontmatter.next_action, "verify-phase");
  });
});

// ── edge cases: soft-gate, empty-scope, UNAVAILABLE, gitignore, re-audit/view ──

describe("ui-review: edge cases (D-02/D-03/D-07/D-09/D-10)", () => {
  test("config-gate soft-skip: workflow.ui_review false → no UI-REVIEW.md, no throw, skip message (D-09)", async () => {
    const { ctx } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");

    // Disable ui review in config.json.
    const cfgPath = `${CWD}/.planning/config.json`;
    const cfgTarget = await ctx.fs.resolve(cfgPath);
    const cfgText = await ctx.fs.readText(cfgTarget);
    const cfg = JSON.parse(cfgText);
    cfg.workflow.ui_review = false;
    await ctx.fs.writeText(cfgTarget, JSON.stringify(cfg, null, 2) + "\n");

    const res = await runUiReview(ctx, { phase: 1 });
    assert.match(res, /skipped/i);
    assert.equal(await gsdState.hasArtifact(CWD, 1, "UI-REVIEW"), false, "UI-REVIEW.md must NOT be written on config-gate skip");
  });

  test("empty-frontend-scope soft-skip: no frontend files → no UI-REVIEW.md, skip message (D-03)", async () => {
    const { ctx } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");

    const res = await runUiReview(ctx, { phase: 1 });
    assert.match(res, /no frontend files/i);
    assert.equal(await gsdState.hasArtifact(CWD, 1, "UI-REVIEW"), false, "UI-REVIEW.md must NOT be written on empty scope");
  });

  test("degrade-with-flag: auditor subagent fault writes UNAVAILABLE UI-REVIEW.md with real cause, never throws (D-10)", async () => {
    const { ctx, fs } = await mountUiReview({ subagents: makeAuditorSubagents({ fail: true }) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");
    await seedFrontendFile(fs);

    // Passing this line IS the "never throws on auditor fault" assertion (D-10).
    const res = await runUiReview(ctx, { phase: 1 });
    assert.match(res, /UNAVAILABLE/);

    const review = await gsdState.readArtifact(CWD, 1, "UI-REVIEW");
    assert.ok(review, "UI-REVIEW.md was NOT written on auditor fault — must degrade, not hard-block");
    assert.match(review, /UNAVAILABLE/);
    assert.match(review, /auditor exploded/);
  });

  test("degrade-with-flag: malformed structured output writes UNAVAILABLE UI-REVIEW.md (D-05/D-10)", async () => {
    const { ctx, fs } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: { not_pillars: true } }) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");
    await seedFrontendFile(fs);

    const res = await runUiReview(ctx, { phase: 1 });
    assert.match(res, /UNAVAILABLE/);
    const review = await gsdState.readArtifact(CWD, 1, "UI-REVIEW");
    assert.ok(review);
    assert.match(review, /UNAVAILABLE/);
  });

  test("screenshot gitignore gate: .planning/ui-reviews/.gitignore written with binary patterns (D-07)", async () => {
    const { ctx, fs } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await bootstrapUiReview(ctx);
    await seedFrontendFile(fs);

    await runUiReview(ctx, { phase: 1 });
    const gitignorePath = await fs.resolve(`${CWD}/.planning/ui-reviews/.gitignore`);
    const content = await fs.readText(gitignorePath);
    assert.match(content, /\.png/);
  });

  test("re-audit/view dispatch: no mode with existing artefact asks the user, does not overwrite (D-02)", async () => {
    const { ctx } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "UI-REVIEW", "existing report");

    const res = await runUiReview(ctx, { phase: 1 });
    assert.match(res, /ask the user/i);
    const review = await gsdState.readArtifact(CWD, 1, "UI-REVIEW");
    assert.equal(review, "existing report", "existing UI-REVIEW.md must NOT be overwritten when no mode is given");
  });

  test("re-audit/view dispatch: mode 'view' returns existing content verbatim, unchanged (D-02)", async () => {
    const { ctx } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");
    await gsdState.writeArtifact(CWD, 1, "UI-REVIEW", "existing report");

    const res = await runUiReview(ctx, { phase: 1, mode: "view" });
    assert.match(res, /existing report/);
    const review = await gsdState.readArtifact(CWD, 1, "UI-REVIEW");
    assert.equal(review, "existing report", "mode 'view' must not overwrite the artefact");
  });

  test("re-audit/view dispatch: mode 're-audit' runs a fresh audit and overwrites (D-02)", async () => {
    let spawnCount = 0;
    const controller = { structured: VALID_AUDIT, capture: () => { spawnCount++; } };
    const { ctx, fs } = await mountUiReview({ subagents: makeAuditorSubagents(controller) });
    await bootstrapUiReview(ctx);
    const gsdState = ctx.get("gsdState");
    await seedFrontendFile(fs);
    await gsdState.writeArtifact(CWD, 1, "UI-REVIEW", "existing report");

    const res = await runUiReview(ctx, { phase: 1, mode: "re-audit" });
    assert.match(res, /UI review complete/i);
    assert.equal(spawnCount, 1, "mode 're-audit' must spawn the auditor");
    const review = await gsdState.readArtifact(CWD, 1, "UI-REVIEW");
    assert.notEqual(review, "existing report", "mode 're-audit' must overwrite the existing artefact");
    assert.match(review, /16\/24/);
  });

  test("fail-fast: no .planning/ project throws a clear error (D-10)", async () => {
    const { ctx } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await assert.rejects(
      runUiReview(ctx, { phase: 1 }),
      /no \.planning\/ project/,
      "should throw when no project exists",
    );
  });

  test("fail-fast: unknown phase throws a clear error (D-10)", async () => {
    const { ctx } = await mountUiReview({ subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    await bootstrapUiReview(ctx);
    await assert.rejects(
      runUiReview(ctx, { phase: 99 }),
      /phase 99 not in ROADMAP/,
      "should throw when phase does not exist",
    );
  });
});

// ── pure helpers ──────────────────────────────────────────────────────────────

describe("ui-review: pure helpers", () => {
  test("resolvePillars rejects malformed output (D-05/D-06)", () => {
    assert.equal(resolvePillars(null), null);
    assert.equal(resolvePillars({}), null);
    assert.equal(resolvePillars({ pillars: "not-array" }), null);
    assert.equal(resolvePillars({ pillars: [] }), null); // wrong count
    assert.equal(resolvePillars({ pillars: VALID_AUDIT.pillars.slice(0, 5) }), null); // 5 not 6
    // invalid score
    const badScore = VALID_AUDIT.pillars.map((p) => ({ ...p }));
    badScore[0].score = 5;
    assert.equal(resolvePillars({ pillars: badScore }), null);
    // invalid severity
    const badSev = VALID_AUDIT.pillars.map((p) => ({ ...p, findings: [{ ...p.findings[0], severity: "BOGUS" }] }));
    assert.equal(resolvePillars({ pillars: badSev }), null);
  });

  test("resolvePillars accepts valid output", () => {
    assert.equal(resolvePillars({ pillars: VALID_AUDIT.pillars }).length, 6);
  });

  test("computeOverall sums the 6 scores", () => {
    assert.equal(computeOverall(VALID_AUDIT.pillars), 16);
  });

  test("countFindings tallies blockers/warnings", () => {
    const counts = countFindings(VALID_AUDIT.pillars);
    assert.equal(counts.blocker, 1);
    assert.equal(counts.warning, 5);
    assert.equal(counts.total, 6);
  });

  test("globToRegExp/matchesAnyGlob match src/App.tsx and reject lib/foo.js", () => {
    assert.equal(matchesAnyGlob("src/App.tsx", FRONTEND_GLOBS), true);
    assert.equal(matchesAnyGlob("lib/foo.js", FRONTEND_GLOBS), false);
    assert.equal(matchesAnyGlob("src/App.tsx", ["src/**/*.{tsx,jsx}"]), true);
    assert.equal(matchesAnyGlob("src/deep/nested/App.tsx", ["src/**/*.{tsx,jsx}"]), true);
    assert.equal(matchesAnyGlob("src/App.tsx", ["src/*.{tsx,jsx}"]), true);
    assert.equal(matchesAnyGlob("src/deep/App.tsx", ["src/*.{tsx,jsx}"]), false);
  });

  test("discoverFrontendFiles finds seeded frontend files and skips node_modules/.planning", async () => {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    await seedFrontendFile(fs, "src/App.tsx");
    await seedFrontendFile(fs, "src/components/Button.tsx");
    await seedFrontendFile(fs, "node_modules/x/index.tsx");
    await seedFrontendFile(fs, ".planning/STATE.md");
    await seedFrontendFile(fs, "lib/foo.js");
    const files = await discoverFrontendFiles(ctx, CWD);
    assert.ok(files.includes("src/App.tsx"));
    assert.ok(files.includes("src/components/Button.tsx"));
    assert.ok(!files.some((f) => f.startsWith("node_modules/")));
    assert.ok(!files.some((f) => f.startsWith(".planning/")));
    assert.ok(!files.includes("lib/foo.js"));
  });

  test("ensureScreenshotGitignore writes .planning/ui-reviews/.gitignore", async () => {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    const p = await ensureScreenshotGitignore(ctx, CWD);
    assert.match(p, /\.planning\/ui-reviews\/\.gitignore/);
    const content = await fs.readText(await fs.resolve(p));
    assert.match(content, /\*\.png/);
  });
});

// ── command + packaging wiring ────────────────────────────────────────────────

describe("ui-review: command + packaging wiring", () => {
  test("PATCH_ROWS includes a ui-review entry", () => {
    assert.ok(PATCH_ROWS.some((r) => r.sub === "ui-review"), "no ui-review patch row");
  });

  test("full mount registers gsd_ui_review tool + gsd-ui-review command", async () => {
    const allSubs = PATCH_ROWS.map((r) => r.sub);
    const { ctx } = await mountSubset(allSubs, { subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    assert.ok(ctx.tools.some((t) => t.name === "gsd_ui_review"), "gsd_ui_review tool not registered");
    assert.ok(ctx.commands.some((c) => c.name === "gsd-ui-review"), "gsd-ui-review command not registered");
  });

  test("retiring ui-review drops both the tool and the command (DEGR-03)", async () => {
    const subs = PATCH_ROWS.map((r) => r.sub).filter((s) => s !== "ui-review");
    const { ctx } = await mountSubset(subs, { subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    assert.ok(!ctx.tools.some((t) => t.name === "gsd_ui_review"), "gsd_ui_review still registered after retirement");
    assert.ok(!ctx.commands.some((c) => c.name === "gsd-ui-review"), "gsd-ui-review still registered after retirement");
    assert.ok(!ctx.provided.has("gsdUiReview"), "gsdUiReview capability still provided after retirement");
  });

  test("persona renders the Ui-review paragraph on full mount and omits it when retired", async () => {
    const allSubs = PATCH_ROWS.map((r) => r.sub);
    const full = await mountSubset(allSubs, { subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    assert.match(personaBody(full.ctx), /^- Ui-review:/m);

    const subs = PATCH_ROWS.map((r) => r.sub).filter((s) => s !== "ui-review");
    const retired = await mountSubset(subs, { subagents: makeAuditorSubagents({ structured: VALID_AUDIT }) });
    assert.doesNotMatch(personaBody(retired.ctx), /^- Ui-review:/m);
  });
});
