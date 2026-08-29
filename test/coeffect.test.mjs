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

// The six subagent-driven plugins (D-04). Each must declare 'subagents' as a
// hard required coeffect in its inject array.
const SUBAGENT_DRIVEN_SUBS = ["plan", "execute", "verify", "quick", "ui", "map-codebase"];

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
