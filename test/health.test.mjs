// Offline behavioural tests for the health diagnostic's pure scan core
// (lib/health.js) and the GsdState config accessors it depends on (lib/state.js),
// TDD per D-10. Proves the deterministic pure-JS integrity checks (phase/plan
// numbering, orphan SUMMARYs, plans-without-SUMMARY, DISCUSSION-LOG-without-
// CONTEXT info, config.json validation, STATE/ROADMAP disagreement, phase-dir
// naming) plus severity classification, all unit-testable with no ctx / no I/O
// (D-03).
//
// Offline only (D-10): FakeFs + fake-ctx, no live boot, no LLM/git/gh.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs, stateCtx } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { GsdState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyHealth } from "../lib/health.js";
import { buildCapability } from "../lib/_capabilities.js";
import { parseFrontmatter } from "../lib/_shared.js";
import {
  checkPhaseDirNaming,
  checkNumbering,
  checkOrphanSummaries,
  checkPlansWithoutSummary,
  checkDiscussionLogWithoutContext,
  checkConfig,
  checkStateRoadmap,
  classifyIssue,
  repairConfig,
} from "../lib/health.js";

// ── fixture helpers ────────────────────────────────────────────────────────────

// A phaseFiles map: { dirName: [fileNames] }.
function phaseFiles(entries) {
  return entries;
}

// The canonical default config shape (mirrors _defaultConfig({}) in state.js).
function defaultConfig() {
  return {
    gsd_state_version: "1.0",
    workflow: {
      discuss_mode: "discuss",
      nyquist_validation: true,
      pattern_mapper: true,
      tdd_mode: false,
      mvp_mode: false,
      use_worktrees: false,
      agent_hint_routing: true,
      text_mode: false,
      commit_docs: true,
      clean_pr_branch: true,
      code_review: true,
      code_review_depth: "standard",
      ui_review: true,
      validate_phase: true,
    },
    context_window: 200000,
    project_code: null,
    response_language: null,
    jobs: { timeout: 60, concurrency: 2, max_retries: 3 },
  };
}

describe("health: checkPhaseDirNaming (D-04 a, D-10)", () => {
  test("NN-slug dirs pass; non-zero-padded and no-NN dirs fail with W-01", () => {
    const ok = checkPhaseDirNaming(["GSD-42-health", "42-health", "GSD-01-auth"]);
    assert.deepEqual(ok, [], "well-formed NN-slug dirs must produce no issues");

    const bad = checkPhaseDirNaming(["GSD-4-health", "health", "42"]);
    assert.equal(bad.length, 3, "each malformed dir must produce a W-01 warning");
    for (const issue of bad) {
      assert.equal(issue.code, "W-01");
      assert.equal(issue.severity, "warning");
      assert.equal(issue.repairable, false);
      assert.match(issue.fix, /rename/i);
    }
  });
});

describe("health: checkNumbering (D-04 a, D-10)", () => {
  test("monotonic zero-padded sequence passes", () => {
    const issues = checkNumbering(["GSD-01-auth", "GSD-02-spec", "GSD-03-plan"]);
    assert.deepEqual(issues, []);
  });

  test("duplicate NN fails with W-02", () => {
    const issues = checkNumbering(["GSD-01-auth", "GSD-01-spec"]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "W-02");
    assert.equal(issues[0].severity, "warning");
    assert.equal(issues[0].repairable, false);
  });

  test("non-monotonic order fails with W-02", () => {
    const issues = checkNumbering(["GSD-03-plan", "GSD-01-auth"]);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "W-02");
  });
});

describe("health: checkOrphanSummaries (D-04 b, D-10)", () => {
  test("SUMMARY with no matching PLAN yields W-03; matching pair yields none", () => {
    const orphan = checkOrphanSummaries(phaseFiles({
      "GSD-42-health": ["GSD-42-health-01-SUMMARY.md"],
    }));
    assert.equal(orphan.length, 1);
    assert.equal(orphan[0].code, "W-03");
    assert.equal(orphan[0].severity, "warning");
    assert.equal(orphan[0].repairable, false);

    const pair = checkOrphanSummaries(phaseFiles({
      "GSD-42-health": ["GSD-42-health-01-PLAN.md", "GSD-42-health-01-SUMMARY.md"],
    }));
    assert.deepEqual(pair, []);
  });
});

describe("health: checkPlansWithoutSummary (D-04 c, D-06, D-10)", () => {
  test("PLAN with no SUMMARY yields I-01 info (may be in progress); matching pair yields none", () => {
    const info = checkPlansWithoutSummary(phaseFiles({
      "GSD-42-health": ["GSD-42-health-01-PLAN.md"],
    }));
    assert.equal(info.length, 1);
    assert.equal(info[0].code, "I-01");
    assert.equal(info[0].severity, "info");
    assert.equal(info[0].repairable, false);
    assert.match(info[0].message, /in progress/i);

    const pair = checkPlansWithoutSummary(phaseFiles({
      "GSD-42-health": ["GSD-42-health-01-PLAN.md", "GSD-42-health-01-SUMMARY.md"],
    }));
    assert.deepEqual(pair, []);
  });
});

describe("health: checkDiscussionLogWithoutContext (D-06, R-4, D-10)", () => {
  test("DISCUSSION-LOG without CONTEXT yields I-02 info (normal mid-phase); both/neither yields none", () => {
    const info = checkDiscussionLogWithoutContext(phaseFiles({
      "GSD-42-health": ["DISCUSSION-LOG.md"],
    }));
    assert.equal(info.length, 1);
    assert.equal(info[0].code, "I-02");
    assert.equal(info[0].severity, "info");
    assert.equal(info[0].repairable, false);
    assert.match(info[0].message, /phase branch/i);

    const both = checkDiscussionLogWithoutContext(phaseFiles({
      "GSD-42-health": ["DISCUSSION-LOG.md", "GSD-42-health-CONTEXT.md"],
    }));
    assert.deepEqual(both, []);

    const neither = checkDiscussionLogWithoutContext(phaseFiles({
      "GSD-42-health": ["GSD-42-health-01-PLAN.md"],
    }));
    assert.deepEqual(neither, []);
  });
});

describe("health: checkConfig (D-04 d, D-06, D-07, OQ-4/OQ-5, D-10)", () => {
  const schema = defaultConfig();

  test("missing config (undefined text) → repairable W-04", () => {
    const issues = checkConfig(undefined, schema);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "W-04");
    assert.equal(issues[0].severity, "warning");
    assert.equal(issues[0].repairable, true);
    assert.match(issues[0].fix, /create config\.json/i);
  });

  test("unparseable JSON → error E-01, not repairable", () => {
    const issues = checkConfig("{ not valid json", schema);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "E-01");
    assert.equal(issues[0].severity, "error");
    assert.equal(issues[0].repairable, false);
  });

  test("valid JSON missing a required workflow key → repairable W-05", () => {
    const cfg = JSON.stringify({ ...schema, workflow: { ...schema.workflow, clean_pr_branch: undefined } });
    const issues = checkConfig(cfg, schema);
    assert.ok(issues.some((i) => i.code === "W-05"), "missing required workflow key must yield W-05");
    const w05 = issues.find((i) => i.code === "W-05");
    assert.equal(w05.severity, "warning");
    assert.equal(w05.repairable, true);
  });

  test("valid JSON missing a required top-level key → repairable W-05", () => {
    const cfg = JSON.stringify({ ...schema, project_code: undefined });
    const issues = checkConfig(cfg, schema);
    assert.ok(issues.some((i) => i.code === "W-05"), "missing required top-level key must yield W-05");
  });

  test("ai_integration_phase is a required workflow key (OQ-4)", () => {
    const cfg = JSON.stringify({ ...schema, workflow: { ...schema.workflow, ai_integration_phase: undefined } });
    const issues = checkConfig(cfg, schema);
    assert.ok(issues.some((i) => i.code === "W-05" && /ai_integration_phase/.test(i.message)));
  });

  test("jobs block is optional (OQ-5): a config without jobs yields no issue", () => {
    const { jobs, ...rest } = schema;
    // rest is missing ai_integration_phase (a required workflow key), so add it
    // to isolate the jobs-optionality assertion from the required-key check.
    const cfg = JSON.stringify({ ...rest, workflow: { ...rest.workflow, ai_integration_phase: true } });
    const issues = checkConfig(cfg, schema);
    assert.ok(!issues.some((i) => i.code === "W-05"), "jobs must not be required");
  });

  test("invalid field value (code_review_depth: 123) → warning W-06, not repairable", () => {
    const cfg = JSON.stringify({ ...schema, workflow: { ...schema.workflow, code_review_depth: 123 } });
    const issues = checkConfig(cfg, schema);
    assert.ok(issues.some((i) => i.code === "W-06"), "invalid field value must yield W-06");
    const w06 = issues.find((i) => i.code === "W-06");
    assert.equal(w06.severity, "warning");
    assert.equal(w06.repairable, false);
  });

  test("fully-valid config yields no issues", () => {
    // ai_integration_phase is a required workflow key (OQ-4), so a fully-valid
    // config must include it.
    const valid = { ...schema, workflow: { ...schema.workflow, ai_integration_phase: true } };
    const issues = checkConfig(JSON.stringify(valid), schema);
    assert.deepEqual(issues, []);
  });
});

describe("health: checkStateRoadmap (D-04 e, D-10)", () => {
  const roadmapPhases = [
    { n: 1, name: "auth", status: "pending" },
    { n: 2, name: "spec", status: "Complete" },
  ];

  test("active_phase not in roadmap → warning W-07", () => {
    const issues = checkStateRoadmap({ active_phase: "99" }, roadmapPhases);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "W-07");
    assert.equal(issues[0].severity, "warning");
    assert.equal(issues[0].repairable, false);
  });

  test("active_phase is a roadmap phase marked done → warning W-08", () => {
    const issues = checkStateRoadmap({ active_phase: "2" }, roadmapPhases);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "W-08");
    assert.equal(issues[0].severity, "warning");
  });

  test("consistent pair → no issue", () => {
    const issues = checkStateRoadmap({ active_phase: "1" }, roadmapPhases);
    assert.deepEqual(issues, []);
  });
});

describe("health: classifyIssue (D-05, D-06, D-10)", () => {
  test("any error → broken", () => {
    const issues = [
      { code: "E-01", severity: "error" },
      { code: "W-04", severity: "warning" },
    ];
    assert.equal(classifyIssue(issues), "broken");
  });

  test("warnings only → degraded", () => {
    const issues = [
      { code: "W-01", severity: "warning" },
      { code: "I-01", severity: "info" },
    ];
    assert.equal(classifyIssue(issues), "degraded");
  });

  test("empty / info-only → healthy", () => {
    assert.equal(classifyIssue([]), "healthy");
    assert.equal(classifyIssue([{ code: "I-01", severity: "info" }]), "healthy");
  });
});

describe("health: GsdState config accessors (OQ-3, D-07, D-10)", () => {
  test("readConfigRaw returns the raw config.json text", async () => {
    const fs = new FakeFs();
    const svc = new GsdState(stateCtx(fs), {});
    await svc.initProject(CWD, {
      name: "T", purpose: "p", milestoneName: "M1", version: "v1.0",
      requirements: [], phases: [{ name: "auth", goal: "g", requirements: [] }],
    });
    const raw = await svc.readConfigRaw(CWD);
    assert.equal(typeof raw, "string");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.gsd_state_version, "1.0");
  });

  test("readConfigRaw returns undefined when config.json is absent", async () => {
    const fs = new FakeFs();
    const svc = new GsdState(stateCtx(fs), {});
    const raw = await svc.readConfigRaw(CWD);
    assert.equal(raw, undefined);
  });

  test("defaultConfig returns the canonical shape with all top-level keys", () => {
    const svc = new GsdState(stateCtx(new FakeFs()), {});
    const cfg = svc.defaultConfig();
    for (const key of ["gsd_state_version", "workflow", "context_window", "project_code", "response_language", "jobs"]) {
      assert.ok(key in cfg, `defaultConfig missing key: ${key}`);
    }
    assert.equal(cfg.gsd_state_version, "1.0");
    assert.equal(cfg.workflow.code_review_depth, "standard");
  });

  test("mounted gsdState exposes readConfigRaw + defaultConfig", async () => {
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs);
    applyState(ctx, {});
    const svc = ctx.get("gsdState");
    assert.equal(typeof svc.readConfigRaw, "function");
    assert.equal(typeof svc.defaultConfig, "function");
  });
});

// ── Plan 02: mount + end-to-end + no-loop-corruption + env fail-fast ─────────
// Boot a fresh FakeFs + ctx with state / core-tools / health applied. health
// injects only ['gsdState','tools'] — NO subagents (D-03/DEGR-07).
async function mountHealth() {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs);
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  applyHealth(ctx, {});
  return { fs, ctx };
}

// Bootstrap a .planning/ project through the mounted gsd_init.
async function bootstrap(ctx) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    { name: "demo", milestoneName: "M1", version: "v1.0",
      requirements: [{ id: "GAP-08", text: "x" }],
      phases: [{ name: "health-demo", goal: "g", requirements: ["GAP-08"] }] },
    makeExec(),
  );
}

function runHealth(ctx, args) {
  const t = ctx.tools.find((x) => x.name === "gsd_health");
  assert.ok(t, "gsd_health not registered");
  return t.execute(args, makeExec());
}

describe("health: capability registration + tool wiring (D-01, OQ-1, D-10)", () => {
  test("gsdHealth descriptor: role out-of-band, NOT_LOOP_ORDERED, tools, commands, produces", () => {
    const cap = buildCapability("gsdHealth");
    assert.equal(cap.role, "out-of-band");
    assert.equal(cap.order, -1, "gsdHealth must be NOT_LOOP_ORDERED");
    assert.deepEqual(cap.tools, ["gsd_health"]);
    assert.deepEqual(cap.commands, ["gsd-health"]);
    assert.deepEqual(cap.produces, ["HEALTH.md"]);
  });

  test("mounted health plugin provides gsdHealth and registers gsd_health tool", async () => {
    const { ctx } = await mountHealth();
    assert.ok(ctx.get("gsdHealth"), "gsdHealth capability not provided");
    const tool = ctx.tools.find((t) => t.name === "gsd_health");
    assert.ok(tool, "gsd_health tool not registered");
  });
});

describe("health: end-to-end gsd_health tool (D-02, D-05, D-10)", () => {
  test("writes HEALTH.md with degraded status + repairable_count when config is missing a required key", async () => {
    const { ctx } = await mountHealth();
    await bootstrap(ctx);
    const gsdState = ctx.get("gsdState");

    // Overwrite config.json missing a required workflow key (clean_pr_branch)
    // and the required ai_integration_phase key → repairable W-05 warnings.
    const cfg = {
      gsd_state_version: "1.0",
      workflow: {
        discuss_mode: "discuss",
        nyquist_validation: true,
        pattern_mapper: true,
        tdd_mode: false,
        mvp_mode: false,
        use_worktrees: false,
        agent_hint_routing: true,
        text_mode: false,
        commit_docs: true,
        code_review: true,
        code_review_depth: "standard",
        ui_review: true,
        validate_phase: true,
      },
      context_window: 200000,
      project_code: null,
      response_language: null,
    };
    await ctx.fs.writeText(
      { targetKey: `${CWD}/.planning/config.json`, displayPath: `${CWD}/.planning/config.json` },
      JSON.stringify(cfg, null, 2),
    );

    const res = await runHealth(ctx, { phase: 1 });
    assert.match(res, /Health check complete/i);

    const health = await gsdState.readArtifact(CWD, 1, "HEALTH");
    assert.ok(health, "HEALTH.md was not written");
    const { frontmatter } = parseFrontmatter(health);
    assert.equal(frontmatter.status, "degraded", "missing required config keys must degrade the report");
    assert.ok(frontmatter.repairable_count > 0, "repairable_count must be > 0 for repairable config warnings");
  });

  test("no-loop-corruption (R-1): health run leaves STATE next_action unchanged (no setActivePhase)", async () => {
    const { ctx } = await mountHealth();
    await bootstrap(ctx);
    const gsdState = ctx.get("gsdState");
    const before = (await gsdState.readState(CWD)).frontmatter.next_action;
    await runHealth(ctx, { phase: 1 });
    const after = (await gsdState.readState(CWD)).frontmatter.next_action;
    assert.equal(after, before, "health must NOT change STATE next_action (out-of-band, no setActivePhase)");
  });

  test("env fail-fast (D-09): no project throws; unknown phase throws", async () => {
    const { ctx } = await mountHealth();
    await assert.rejects(
      runHealth(ctx, { phase: 1 }),
      /no .planning\/ project/,
      "should throw on missing project",
    );
    await bootstrap(ctx);
    await assert.rejects(
      runHealth(ctx, { phase: 99 }),
      /not in ROADMAP/,
      "should throw on unknown phase",
    );
  });
});

// ── Plan 03: repair path (D-07, D-08) ─────────────────────────────────────────
// repairConfig is a pure helper (no ctx / no I/O) that creates a missing
// config.json with defaults and adds missing workflow keys (the _defaultConfig
// workflow set ∪ { ai_integration_phase }, per D-07/OQ-4). The --repair dispatch
// in the gsd_health execute body applies the fixes, reports them in
// repairs_performed[], and re-runs the scan without repair to confirm resolution
// (D-08). Dry-run remains the default and performs no writes.

describe("health: repairConfig pure helper (D-07, D-08, D-10)", () => {
  const schema = defaultConfig();

  test("missing config (undefined) → creates config with defaults + R-01 repair", () => {
    const { config, repairs } = repairConfig(undefined, schema);
    assert.deepEqual(config, schema, "created config must match the canonical default shape");
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].code, "R-01");
    assert.match(repairs[0].message, /created missing config\.json/i);
  });

  test("config missing a workflow key → adds it with value true + R-02 repair", () => {
    const cfg = JSON.stringify({ ...schema, workflow: { ...schema.workflow, clean_pr_branch: undefined } });
    const { config, repairs } = repairConfig(cfg, schema);
    assert.equal(config.workflow.clean_pr_branch, true, "repair must add clean_pr_branch: true");
    assert.ok(repairs.some((r) => r.code === "R-02" && /clean_pr_branch/.test(r.message)));
  });

  test("config missing ai_integration_phase → adds it with value true (OQ-4)", () => {
    const cfg = JSON.stringify({ ...schema, workflow: { ...schema.workflow, ai_integration_phase: undefined } });
    const { config, repairs } = repairConfig(cfg, schema);
    assert.equal(config.workflow.ai_integration_phase, true);
    assert.ok(repairs.some((r) => /ai_integration_phase/.test(r.message)));
  });

  test("complete config → unchanged, repairs: [] (never overwrites existing config)", () => {
    const valid = { ...schema, workflow: { ...schema.workflow, ai_integration_phase: true } };
    const { config, repairs } = repairConfig(JSON.stringify(valid), schema);
    assert.deepEqual(config, valid, "complete config must be returned unchanged");
    assert.deepEqual(repairs, []);
  });

  test("unparseable config → no repair (config null, repairs empty)", () => {
    const { config, repairs } = repairConfig("{ not valid json", schema);
    assert.equal(config, null, "unparseable config must not be repaired");
    assert.deepEqual(repairs, []);
  });
});

// Write a config.json missing the required workflow keys clean_pr_branch and
// ai_integration_phase (both repairable W-05 warnings). Returns the raw text.
async function writeConfigMissingWorkflowKeys(ctx) {
  const cfg = {
    gsd_state_version: "1.0",
    workflow: {
      discuss_mode: "discuss",
      nyquist_validation: true,
      pattern_mapper: true,
      tdd_mode: false,
      mvp_mode: false,
      use_worktrees: false,
      agent_hint_routing: true,
      text_mode: false,
      commit_docs: true,
      code_review: true,
      code_review_depth: "standard",
      ui_review: true,
      validate_phase: true,
    },
    context_window: 200000,
    project_code: null,
    response_language: null,
  };
  const text = JSON.stringify(cfg, null, 2);
  await ctx.fs.writeText(
    { targetKey: `${CWD}/.planning/config.json`, displayPath: `${CWD}/.planning/config.json` },
    text,
  );
  return text;
}

describe("health: repair dispatch (D-07, D-08, D-10)", () => {
  test("dry-run (repair omitted): no writes, repairs_performed absent, config unchanged", async () => {
    const { ctx } = await mountHealth();
    await bootstrap(ctx);
    const gsdState = ctx.get("gsdState");
    const originalText = await writeConfigMissingWorkflowKeys(ctx);

    const res = await runHealth(ctx, { phase: 1 });
    assert.match(res, /Health check complete/i);
    assert.match(res, /repairable/i);

    const after = await gsdState.readConfigRaw(CWD);
    assert.equal(after, originalText, "dry-run must not modify config.json");

    const health = await gsdState.readArtifact(CWD, 1, "HEALTH");
    const { frontmatter } = parseFrontmatter(health);
    assert.equal(frontmatter.repairs_performed, undefined, "dry-run must not set repairs_performed");
  });

  test("--repair: applies config-only fixes, reports repairs_performed, config updated", async () => {
    const { ctx } = await mountHealth();
    await bootstrap(ctx);
    const gsdState = ctx.get("gsdState");
    await writeConfigMissingWorkflowKeys(ctx);

    const res = await runHealth(ctx, { phase: 1, repair: true });
    assert.match(res, /Health check complete/i);

    const after = await gsdState.readConfigRaw(CWD);
    const parsed = JSON.parse(after);
    assert.equal(parsed.workflow.clean_pr_branch, true, "repair must add clean_pr_branch");
    assert.equal(parsed.workflow.ai_integration_phase, true, "repair must add ai_integration_phase");

    const health = await gsdState.readArtifact(CWD, 1, "HEALTH");
    const { frontmatter } = parseFrontmatter(health);
    assert.ok(Array.isArray(frontmatter.repairs_performed), "repairs_performed must be present after --repair");
    assert.ok(frontmatter.repairs_performed.length > 0, "repairs_performed must be non-empty");
  });

  test("re-run after --repair: previously-repairable config issue resolved (D-08)", async () => {
    const { ctx } = await mountHealth();
    await bootstrap(ctx);
    const gsdState = ctx.get("gsdState");
    await writeConfigMissingWorkflowKeys(ctx);

    await runHealth(ctx, { phase: 1, repair: true });

    const res2 = await runHealth(ctx, { phase: 1 });
    assert.match(res2, /Health check complete/i);

    const health = await gsdState.readArtifact(CWD, 1, "HEALTH");
    const { frontmatter } = parseFrontmatter(health);
    assert.equal(frontmatter.status, "healthy", "after repair the config issue should be resolved");
    assert.equal(frontmatter.repairable_count, 0, "repairable_count should be 0 after repair");
  });
});
