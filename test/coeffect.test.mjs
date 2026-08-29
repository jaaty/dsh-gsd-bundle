// Static coeffect assertions for the subagent-driven plugins (DEGR-07, D-04).
//
// The six subagent-driven plugins (plan, execute, verify, quick, ui,
// map-codebase) are entirely subagent-driven: their tools read ctx.get('subagents')
// and throw if absent. Declaring 'subagents' as a hard required coeffect in their
// top-level inject array makes their fiber stay inactive when the subagents host
// service is absent (reactive coeffect activation/deactivation). This suite proves
// the declaration statically by reading each module's inject array.
//
// Offline only (D-06): FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { mountSubset, makeSubagents } from "./helpers/mount-harness.mjs";

// The six subagent-driven plugins (D-04). Each must declare 'subagents' as a
// hard required coeffect in its inject array.
const SUBAGENT_DRIVEN_SUBS = ["plan", "execute", "verify", "quick", "ui", "map-codebase"];

// The non-subagent core-tools surfaces that must stay active when subagents is
// absent (D-05, phase-22 D-03 graceful degradation).
const CORE_TOOLS_TOOLS = ["gsd_init", "gsd_status", "gsd_progress", "gsd_new_milestone"];

describe("subagents coeffect on subagent-driven plugins (DEGR-07 / D-04)", () => {
  for (const sub of SUBAGENT_DRIVEN_SUBS) {
    test(`${sub} declares 'subagents' (and keeps gsdState + tools) in its inject array`, async () => {
      const mod = await import(`@dsh-gsd/bundle/${sub}`);
      assert.ok(Array.isArray(mod.inject), `${sub}: inject is not an array`);
      assert.ok(
        mod.inject.includes("subagents"),
        `${sub}: inject does not include 'subagents' (got ${JSON.stringify(mod.inject)})`,
      );
      // Guard against accidental removal of the existing coeffects.
      assert.ok(mod.inject.includes("gsdState"), `${sub}: inject lost 'gsdState'`);
      assert.ok(mod.inject.includes("tools"), `${sub}: inject lost 'tools'`);
    });
  }
});

describe("core-tools gsd_job sub-fiber coeffect (DEGR-07 / D-05)", () => {
  test("gsd_job activates when subagents is present; other surfaces stay active", async () => {
    const { ctx } = await mountSubset(["core-tools"], { subagents: makeSubagents() });
    const names = ctx.tools.map((t) => t.name);
    assert.ok(names.includes("gsd_job"), "gsd_job not registered when subagents is present");
    for (const n of CORE_TOOLS_TOOLS) {
      assert.ok(names.includes(n), `${n} should be registered when subagents is present`);
    }
    assert.ok(ctx.provided.has("gsdOrient"), "gsdOrient not provided when subagents is present");
    assert.ok(ctx.provided.has("gsdJobs"), "gsdJobs not provided when subagents is present");
  });

  test("gsd_job deactivates when subagents is absent; other surfaces stay active", async () => {
    const { ctx } = await mountSubset(["core-tools"], { subagents: null });
    const names = ctx.tools.map((t) => t.name);
    assert.ok(!names.includes("gsd_job"), "gsd_job registered despite subagents being absent");
    for (const n of CORE_TOOLS_TOOLS) {
      assert.ok(names.includes(n), `${n} should stay active when subagents is absent`);
    }
    assert.ok(ctx.provided.has("gsdOrient"), "gsdOrient should stay provided when subagents is absent");
    assert.ok(ctx.provided.has("gsdJobs"), "gsdJobs should stay provided when subagents is absent");
  });
});
