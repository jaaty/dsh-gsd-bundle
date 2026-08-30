// Offline activation harness for @dsh-gsd/bundle (Phase 1: live-mount).
//
// Proves the 14 cordis.patch.yml plugin rows activate inside a fake DSH host:
// each subpath export resolves, apply() runs against one shared fake ctx, and
// the full registration surface is captured (1 persona section, 1 runtime-
// context provider, gsdState service, 16 gsd_* tools, 14 /gsd-* commands).
// Offline only (D-01/D-02): FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { promises as fsPromises } from "node:fs";
import path from "node:path";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { GsdState } from "../lib/state.js";
import { CAPABILITY_KEYS } from "../lib/_capabilities.js";
import {
  CWD,
  PATCH_ROWS,
  makeMountCtx,
  applySubset,
  mountSubset,
  personaBody,
  snapshot,
  initProject,
  presentTools,
  assertNoAbsentToolToken,
  makeExec,
  makeSubagents,
} from "./helpers/mount-harness.mjs";

// Apply all 14 plugins in patch order against a ctx; throw with the offending id.
async function applyAll(ctx) {
  for (const { id, sub } of PATCH_ROWS) {
    const mod = await import(`@dsh-gsd/bundle/${sub}`);
    assert.equal(typeof mod.apply, "function", `${id}: module has no apply()`);
    try {
      mod.apply(ctx, {});
    } catch (e) {
      e.message = `${id} apply() threw: ${e.message}`;
      throw e;
    }
  }
}

// Targeted line-based reader for cordis.patch.yml (NO YAML dependency — per
// D-05/research OQ-1, preserve the zero-dep invariant). Extracts the
// `agent-loop` override row (presence + raw config lines) and the 12 insert
// rows ({id, spec}). The file's regular structure makes a line parser robust.
async function readPatchRows() {
  const file = path.resolve(import.meta.dirname, "../cordis.patch.yml");
  const text = await fsPromises.readFile(file, "utf8");
  const lines = text.split(/\r?\n/);

  let overridePresent = false;
  const agentLoopConfigRaw = [];
  let insertRows = [];

  // Locate the `- id: agent-loop` override row and collect its indented config
  // block until the next top-level `- ` entry.
  let i = 0;
  while (i < lines.length && !/^- id: agent-loop\s*$/.test(lines[i])) i++;
  if (i < lines.length) {
    overridePresent = true;
    i++; // step past the `- id: agent-loop` line into the config block
    while (i < lines.length && !/^- /.test(lines[i])) {
      agentLoopConfigRaw.push(lines[i]);
      i++;
    }
  }

  // Locate the `- insert:` block and scan its rows: `    - id: <id>` followed
  // by `      name: '<spec>'`.
  while (i < lines.length && !/^- insert:\s*$/.test(lines[i])) i++;
  if (i < lines.length) {
    i++; // step past `- insert:`
    while (i < lines.length && !/^- \S/.test(lines[i])) {
      const m = lines[i].match(/^    - id: (\S+)\s*$/);
      if (m) {
        const id = m[1];
        const nameLine = lines[i + 1] || "";
        const sm = nameLine.match(/^      name: '([^']+)'\s*$/);
        assert.ok(sm, `insert row ${id} has no name: line`);
        insertRows.push({ id, spec: sm[1] });
        i += 2;
      } else {
        i++;
      }
    }
  }

  return { overridePresent, agentLoopConfigRaw, insertRows };
}

// The 14 expected insert rows, verbatim from cordis.patch.yml (D-03:
// "exactly the insert block"). Cross-checked against the parsed file so a row
// added/removed in the patch fails the test.
const EXPECTED_INSERT_ROWS = PATCH_ROWS.map(({ id, sub }) => ({
  id,
  spec: `@dsh-gsd/bundle/${sub}`,
}));

// Expected registered tool names (16) — verified against the real modules.
const EXPECTED_TOOL_NAMES = [
  "gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone",
  "gsd_discuss", "gsd_spec_phase", "gsd_plan", "gsd_gap_analysis",
  "gsd_execute", "gsd_verify", "gsd_ship", "gsd_ui_phase", "gsd_quick",
  "gsd_map_codebase", "gsd_job", "gsd_intel_updater",
];

// Expected registered command names (14) — from lib/commands.js (D-03).
const EXPECTED_COMMAND_NAMES = [
  "gsd-init", "gsd-status", "gsd-progress", "gsd-discuss-phase",
  "gsd-spec-phase", "gsd-ui-phase", "gsd-plan-phase", "gsd-gap-analysis",
  "gsd-execute-phase", "gsd-verify-work", "gsd-ship", "gsd-quick",
  "gsd-map-codebase", "gsd-new-milestone",
];

describe("mount: all 14 plugins activate", () => {
  let fs, ctx;
  beforeEach(() => {
    fs = new FakeFs();
    // Supply subagents so the gsd_job sub-fiber activates (DEGR-07 D-05) and
    // the full 14-tool surface is registered.
    ctx = makeMountCtx(fs, { subagents: makeSubagents() });
  });

  test("applies all 14 plugins in patch order without throwing", async () => {
    await applyAll(ctx);
    assert.ok(ctx.provided.has("gsdState"), "gsdState service was not provided");
    assert.ok(ctx.provided.get("gsdState") instanceof GsdState, "gsdState is not a GsdState instance");
    assert.ok(ctx.tools.length === 16, `expected 16 tools, got ${ctx.tools.length}`);
    assert.ok(ctx.commands.length === 14, `expected 14 commands, got ${ctx.commands.length}`);
    assert.ok(ctx.sections.length === 1, `expected 1 section, got ${ctx.sections.length}`);
    assert.ok(ctx.contexts.length === 1, `expected 1 context, got ${ctx.contexts.length}`);

    // DEGR-06: core-tools provides the jobs runtime service and registers a
    // fire-and-forget unload-cancel cleanup effect. Invoking the disposer (the
    // actual un-awaited path) must never throw.
    assert.ok(ctx.provided.has("gsdJobsRuntime"), "gsdJobsRuntime service was not provided");
    const cancelEffect = ctx.effects.find((e) => e.label === "gsdJobsRuntime.cancelAll");
    assert.ok(cancelEffect, "gsdJobsRuntime.cancelAll cleanup effect was not registered");
    assert.doesNotThrow(() => cancelEffect.disposer(), "invoking the unload-cancel disposer must never throw");

    // DEGR-01: all 12 capability services are provided with the documented
    // descriptor shape (D-03: key/step/role/tools/commands/order). Built from
    // CAPABILITY_KEYS so test and source never drift (D-02 camelCase keys).
    assert.ok(CAPABILITY_KEYS.length === 12, `expected 12 capability keys, got ${CAPABILITY_KEYS.length}`);
    for (const key of CAPABILITY_KEYS) {
      const cap = ctx.provided.get(key);
      assert.ok(cap, `capability ${key} was not provided`);
      assert.equal(cap.key, key, `${key}: descriptor key does not match ${cap.key}`);
      assert.equal(typeof cap.step, "string", `${key}: step is not a string`);
      assert.equal(typeof cap.role, "string", `${key}: role is not a string`);
      assert.ok(Array.isArray(cap.tools), `${key}: tools is not an array`);
      assert.ok(cap.tools.length > 0, `${key}: tools is empty`);
      assert.ok(Array.isArray(cap.commands), `${key}: commands is not an array`);
      assert.equal(typeof cap.order, "number", `${key}: order is not a number`);
    }
  });

  test("absent capability leaves its slash command unregistered (DEGR-03)", async () => {
    // Apply every plugin EXCEPT gsd-commands so all 12 capabilities are
    // provided, then withdraw one capability from the provided store and apply
    // gsd-commands: its sub-fiber for that capability must stay inactive (never
    // register the command) while the other 13 commands register normally.
    const ctx2 = makeMountCtx(fs);
    for (const { id, sub } of PATCH_ROWS) {
      if (sub === "commands") continue;
      const mod = await import(`@dsh-gsd/bundle/${sub}`);
      mod.apply(ctx2, {});
    }
    assert.ok(ctx2.provided.has("gsdQuick"), "gsdQuick capability was not provided");
    ctx2.provided.delete("gsdQuick");

    const commandsMod = await import(`@dsh-gsd/bundle/commands`);
    commandsMod.apply(ctx2, {});

    assert.ok(ctx2.commands.length === 13, `expected 13 commands, got ${ctx2.commands.length}`);
    assert.ok(!ctx2.commands.some((c) => c.name === "gsd-quick"), "gsd-quick was registered despite gsdQuick being absent");
    for (const expected of EXPECTED_COMMAND_NAMES) {
      if (expected === "gsd-quick") continue;
      assert.ok(
        ctx2.commands.some((c) => c.name === expected),
        `expected command ${expected} to be registered, got ${ctx2.commands.map((c) => c.name).join(", ")}`,
      );
    }
  });
});

describe("mount: cordis.patch.yml rows resolve", () => {
  test("override row present, 14 insert rows resolve via exports + import()", async () => {
    const { overridePresent, agentLoopConfigRaw, insertRows } = await readPatchRows();

    // D-03: the agent-loop override row is asserted only for presence + that it
    // configures a gsd agent (no live merge — D-05 offline preconditions).
    assert.ok(overridePresent, "agent-loop override row not found in cordis.patch.yml");
    assert.ok(
      agentLoopConfigRaw.join("\n").includes("- id: gsd"),
      "agent-loop override does not configure a gsd agent",
    );

    // Exactly the 14 insert rows (D-03).
    assert.ok(insertRows.length === 14, `expected 14 insert rows, got ${insertRows.length}`);
    assert.deepEqual(insertRows, EXPECTED_INSERT_ROWS, "parsed insert rows differ from the expected 14");

    // Each row's name resolves through package.json exports and import().
    const pkgPath = path.resolve(import.meta.dirname, "../package.json");
    const pkg = JSON.parse(await fsPromises.readFile(pkgPath, "utf8"));
    const exports = pkg.exports;
    for (const { id, spec } of insertRows) {
      const sub = spec.replace(/^@dsh-gsd\/bundle\//, "");
      assert.ok(
        exports[`./${sub}`] != null,
        `package.json exports has no key './${sub}' for row ${id}`,
      );
      const mod = await import(`@dsh-gsd/bundle/${sub}`);
      assert.equal(typeof mod.name, "string", `${id}: name is not a string`);
      assert.ok(Array.isArray(mod.inject), `${id}: inject is not an array`);
      assert.equal(typeof mod.apply, "function", `${id}: apply is not a function`);
    }

    // Cross-check captured tool names against the expected 16.
    const fs = new FakeFs();
    const ctx = makeMountCtx(fs, { subagents: makeSubagents() });
    await applyAll(ctx);
    const toolNames = ctx.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, [...EXPECTED_TOOL_NAMES].sort(), "registered tool names mismatch");

    // Cross-check captured command names against the expected 14.
    const commandNames = ctx.commands.map((c) => c.name).sort();
    assert.deepEqual(commandNames, [...EXPECTED_COMMAND_NAMES].sort(), "registered command names mismatch");
  });
});

describe("mount: persona orients at STATE.md (MOUNT-02)", () => {
  let fs, ctx;

  const exec = makeExec();

  beforeEach(async () => {
    fs = new FakeFs();
    ctx = makeMountCtx(fs, { subagents: makeSubagents() });
    await applyAll(ctx);
  });

  test("persona section is gsd:persona (order -100) with phase-loop text", () => {
    const section = ctx.sections[0];
    assert.equal(section.name, "gsd:persona");
    assert.ok(section.order === -100, `expected order -100, got ${section.order}`);
    // The body is a per-assembly function (RESEARCH OQ-1) — evaluate it with a
    // context object before asserting (mirrors the gsd:state context provider).
    assert.equal(typeof section.text, "function", "persona section text must be an assembly-fresh function");
    const body = section.text({ agent: { session: { header: { cwd: CWD } } } });
    assert.equal(typeof body, "string");
    assert.match(body, /Discuss/);
    assert.match(body, /Ship/);
    // The full-set mount provides every capability, so the step paragraphs and
    // the orient surface must name their tools.
    assert.match(body, /gsd_status/);
    assert.match(body, /gsd_quick/);
  });

  test("runtime-context provider is gsd:state (order 10)", () => {
    const context = ctx.contexts[0];
    assert.equal(context.name, "gsd:state");
    assert.ok(context.order === 10, `expected order 10, got ${context.order}`);
  });

  test("gsd_init smoke orients the context provider at STATE.md", async () => {
    // Single minimal smoke call (D-04): gsd_init writes the .planning/ tree
    // through the SAME provided gsdState (R-1 — do NOT use buildProject, which
    // constructs a separate GsdState and would render "no project").
    const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
    assert.ok(gsdInit, "gsd_init tool not registered");
    const res = await gsdInit.execute(
      {
        name: "demo",
        milestoneName: "M1",
        version: "v1.0",
        requirements: [{ id: "MOUNT-01", text: "x" }],
        phases: [{ name: "p1", goal: "do it", requirements: ["MOUNT-01"] }],
      },
      exec,
    );
    assert.match(res, /Initialised GSD project/);

    // The context provider now renders the loop position at the current STATE.md.
    const out = ctx.contexts[0].text({ agent: { session: { header: { cwd: CWD } } } });
    assert.match(
      out,
      /GSD loop position: milestone .+ \/ (phase .+ \/ step .+|no active phase)/,
      "context provider did not render the loop position",
    );
    // The snapshot must state the wait-for-explicit-command contract (Option A).
    assert.match(
      out,
      /do NOT advance to the next step until the user issues an explicit command/,
      "context provider did not render the wait-for-command contract",
    );
    // The snapshot is capability-aware (D-03/D-08): it lists the ordered
    // available loop steps of the full-set mount. gsdOrient is present, so
    // gsd_status is named as the orienting surface.
    assert.match(out, /Available steps:/, "context provider did not render the available-steps annotation");
    assert.match(out, /discuss/, "available-steps annotation missing the discuss step");
    assert.match(out, /Use gsd_status for the full STATE\.md\./, "gsdOrient present but gsd_status not named");
  });

  test("uninitialised-cwd branch renders the orientation hint", () => {
    const out = ctx.contexts[0].text({ agent: { session: { header: { cwd: "/elsewhere" } } } });
    assert.match(out, /no \.planning\/ project found/);
  });

  test("all 16 registered tools have a valid compiled schema", () => {
    // apply() not throwing already proves defineTool compiled the schema (D-04);
    // assert the shape explicitly for every tool.
    assert.equal(ctx.tools.length, 16);
    for (const t of ctx.tools) {
      assert.equal(typeof t.name, "string", `${t.name}: name is not a string`);
      assert.equal(typeof t.description, "string", `${t.name}: description is not a string`);
      assert.equal(typeof t.parameters, "object", `${t.name}: parameters is not an object`);
      assert.ok(t.parameters !== null, `${t.name}: parameters is null`);
      assert.ok(t.output && t.output.schema, `${t.name}: missing output.schema`);
    }
  });
});

// ── Phase-22 reactive subset-mount (D-11 / DEGR-02 / DEGR-04 / D-06) ──────────
// Proves the reactivity contract end-to-end WITHOUT a live DSH boot: mount only
// a chosen SUBSET of the plugin rows, route ctx.get to the provided capability
// descriptors, and assert (a) the persona body + runtime-context snapshot omit
// absent steps and never name their tools, (b) gsd_status hides/replaces a
// next_action that names an absent step and prints a correct ## Available steps
// section, and (c) zero-loop and partial-loop degrade gracefully without
// throwing. The full per-plugin removal suite stays phase 23 (DEGR-05).
describe("mount: reactive loop rendering (DEGR-02/DEGR-04)", () => {
  const exec = makeExec();

  test("partial-loop persona + snapshot drop absent steps and never name their tools (DEGR-02)", async () => {
    // Keep persona/state/core-tools/discuss/plan; drop execute,verify,
    // ship,ui,quick,map-codebase.
    const { ctx } = await mountSubset(["persona", "state", "core-tools", "discuss", "plan"]);

    // Capabilities actually provided: gsdOrient, gsdJobs, gsdDiscuss, gsdPlan.
    for (const key of ["gsdOrient", "gsdJobs", "gsdDiscuss", "gsdPlan"]) {
      assert.ok(ctx.provided.has(key), `${key} not provided`);
    }
    for (const key of ["gsdExecute", "gsdVerify", "gsdShip", "gsdUi", "gsdQuick", "gsdMapCodebase"]) {
      assert.ok(!ctx.provided.has(key), `${key} should be absent`);
    }

    // Unconditional static core survives.
    const body = personaBody(ctx);
    assert.match(body, /Discuss/);
    assert.match(body, /You are a Git Ship Done/);
    // Present step paragraphs are rendered.
    assert.match(body, /- Discuss: before planning/);
    assert.match(body, /- Plan: research the ecosystem/);
    // Present capability-driven tool mentions survive (gsd_status via gsdOrient
    // rule; gsd_plan via the fresh-context spawner rule).
    assert.match(body, /gsd_status/);
    assert.match(body, /the gsd_plan tools spawn them/);
    // Absent-step tools are never named.
    for (const absent of ["gsd_execute", "gsd_verify", "gsd_ship", "gsd_ui_phase", "gsd_quick", "gsd_map_codebase"]) {
      assert.ok(!body.includes(absent), `persona body names absent tool ${absent}`);
    }
    // No absent-step tool token at all (D-02 invariant).
    assertNoAbsentToolToken(ctx, body, "persona body");

    // Snapshot lists only present loop steps (discuss, plan) — no execute/verify.
    await initProject(ctx);
    const snap = snapshot(ctx);
    assert.match(snap, /Available steps: discuss, plan\./);
    for (const absent of ["execute", "verify", "ship"]) {
      assert.ok(!snap.match(new RegExp(`Available steps:[^\\n]*${absent}`)), `snapshot advertises absent step ${absent}`);
    }
    assertNoAbsentToolToken(ctx, snap, "runtime-context snapshot");
  });

  test("gsd_status rewrites an absent-step next_action and shows a correct Available-steps section (DEGR-04)", async () => {
    // Drop verify (and ui/quick/map) but keep ship so the absent verify-phase
    // rewrites to the nearest present step (ship) rather than no-loop.
    const { ctx } = await mountSubset(["state", "core-tools", "discuss", "plan", "execute", "ship"]);
    await initProject(ctx);

    // Set the stored next_action to verify-phase (its capability is absent).
    const gsdState = ctx.get("gsdState");
    assert.ok(gsdState, "gsdState not provided");
    await gsdState.setActivePhase(CWD, 1, "verify");

    const gsdStatus = ctx.tools.find((t) => t.name === "gsd_status");
    assert.ok(gsdStatus, "gsd_status not registered");
    const out = await gsdStatus.execute({}, exec);

    // The absent verify-phase is rewritten (NOT printed verbatim).
    assert.ok(!out.includes("Next action: verify-phase"), "absent verify-phase printed verbatim");
    assert.match(out, /Next action: ship-phase/, "verify-phase not rewritten to nearest present step");
    // Correct Available-steps section listing only present loop steps + info.
    assert.match(out, /## Available steps/);
    assert.match(out, /- discuss: gsdDiscuss \(order 10\)/);
    assert.match(out, /- plan: gsdPlan \(order 20\)/);
    assert.match(out, /- execute: gsdExecute \(order 30\)/);
    assert.match(out, /- ship: gsdShip \(order 50\)/);
    assert.ok(!out.includes("gsdVerify"), "Available steps advertises absent gsdVerify");
    assert.ok(!out.match(/-\s*verify:/), "Available steps advertises absent verify step");
    assertNoAbsentToolToken(ctx, out, "gsd_status output");
  });

  test("zero-loop mount degrades gracefully everywhere (D-06)", async () => {
    // Only persona/state/core-tools → gsdOrient + gsdJobs present, no loop steps.
    const { ctx } = await mountSubset(["persona", "state", "core-tools"]);
    assert.ok(ctx.provided.has("gsdOrient") && ctx.provided.has("gsdJobs"), "orient/jobs should be present");
    for (const key of ["gsdDiscuss", "gsdPlan", "gsdExecute", "gsdVerify", "gsdShip"]) {
      assert.ok(!ctx.provided.has(key), `${key} should be absent in zero-loop`);
    }
    await initProject(ctx);

    // Persona body: static core + no-loop notice, never names a loop tool.
    const body = personaBody(ctx);
    assert.match(body, /You are a Git Ship Done/);
    assert.match(body, /No loop steps are currently available/);
    for (const absent of ["gsd_discuss", "gsd_plan", "gsd_execute", "gsd_verify", "gsd_ship", "gsd_quick"]) {
      assert.ok(!body.includes(absent), `zero-loop persona names absent tool ${absent}`);
    }
    assertNoAbsentToolToken(ctx, body, "zero-loop persona");

    // Snapshot: no-available-step line, oriented through the orient surface.
    const snap = snapshot(ctx);
    assert.match(snap, /No loop steps are currently available\./);
    assertNoAbsentToolToken(ctx, snap, "zero-loop snapshot");

    // gsd_status: next_action replaced with the no-loop notice, never throws.
    const gsdStatus = ctx.tools.find((t) => t.name === "gsd_status");
    const out = await gsdStatus.execute({}, exec);
    assert.match(out, /Next action: no available loop step/);
    assert.ok(!out.includes("Next action: discuss-phase"), "absent discuss-phase advertised verbatim");
    assert.match(out, /## Available steps/);
    assert.match(out, /- no available loop step/);
    assertNoAbsentToolToken(ctx, out, "zero-loop gsd_status");
  });

  test("full-set mount still renders present steps + tools (regression, D-11)", async () => {
    const { ctx } = await mountSubset(["persona", "state", "core-tools", "discuss", "spec", "plan", "gap-analysis", "execute", "verify", "ship", "ui", "quick", "map-codebase"]);
    for (const key of CAPABILITY_KEYS) assert.ok(ctx.provided.has(key), `${key} not provided`);
    await initProject(ctx);

    // Persona body keeps the present-tool surface.
    const body = personaBody(ctx);
    assert.match(body, /Discuss/);
    assert.match(body, /Ship/);
    assert.match(body, /gsd_status/);
    assert.match(body, /gsd_quick/);
    assertNoAbsentToolToken(ctx, body, "full-set persona");

    // Snapshot lists the full loop chain in descriptor order (spec precedes
    // discuss at order 5; gap-analysis order 22 slots between plan and quick).
    const snap = snapshot(ctx);
    assert.match(snap, /Available steps: spec, discuss, ui, plan, gap-analysis, quick, execute, verify, ship\./);

    // gsd_status still advertises the stored next_action when its capability is
    // present (after init, the first routable loop step is spec at order 5, so
    // the stored null next_action routes to spec-phase per D-02).
    const gsdStatus = ctx.tools.find((t) => t.name === "gsd_status");
    const out = await gsdStatus.execute({}, exec);
    assert.match(out, /Next action: spec-phase/, "present spec-phase not advertised");
    assertNoAbsentToolToken(ctx, out, "full-set gsd_status");
  });
});