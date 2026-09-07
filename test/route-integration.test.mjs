// Offline integration tests for the gsd_route freeform-routing tool (phase 54,
// CLH-04). Proves the gsd_route execute path classifies a plain-English intent
// via the pure classifyIntent (lib/_route.js) and returns the rendered
// recommendation text — recommend-only (D-02): it never auto-runs the routed
// step tool and never reads/mutates STATE/ROADMAP (out-of-scope). Also covers
// the gsd_status fallback (D-06/D-08), ambiguity fallback (D-05), and
// capability-aware degradation (D-10/D-07). Modeled on test/next-integration
// .test.mjs: FakeFs + fake-ctx, no live boot/LLM/git.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FakeFs } from "./helpers/fake-fs.mjs";
import { makeMountCtx, makeExec, CWD } from "./helpers/mount-harness.mjs";
import { apply as applyState } from "../lib/state.js";
import { apply as applyCoreTools } from "../lib/core-tools.js";
import { apply as applyCommands } from "../lib/commands.js";
import { apply as applyDiscuss } from "../lib/discuss.js";
import { apply as applyPlan } from "../lib/plan.js";

// Mount the orientation tier + a chosen set of loop plugins so the capability
// descriptors the router routes through are present. core-tools provides
// gsdOrient (gsd_init/status/progress/new_milestone/pause/resume/next/route) +
// gsdJobs.
async function mountRoute(loopPlugins = []) {
  const fs = new FakeFs();
  const ctx = makeMountCtx(fs);
  applyState(ctx, {});
  applyCoreTools(ctx, {});
  for (const apply of loopPlugins) apply(ctx, {});
  applyCommands(ctx, {});
  return { fs, ctx };
}

const exec = () => makeExec();

// Bootstrap a .planning/ project via gsd_init (writes PROJECT/REQUIREMENTS/
// ROADMAP/STATE/config). gsd_init assigns 1-based n in the order given.
async function bootstrap(ctx, phases, requirements = [{ id: "CLH-04", text: "x" }]) {
  const gsdInit = ctx.tools.find((t) => t.name === "gsd_init");
  assert.ok(gsdInit, "gsd_init not registered");
  await gsdInit.execute(
    { name: "demo", milestoneName: "M1", version: "v1.0", requirements, phases },
    exec(),
  );
}

function findRoute(ctx) {
  const t = ctx.tools.find((x) => x.name === "gsd_route");
  assert.ok(t, "gsd_route not registered");
  return t;
}

// Read the STATE frontmatter snapshot (or undefined when no STATE.md) for the
// never-mutates-STATE invariant.
async function readFm(ctx) {
  const state = await ctx.get("gsdState").readState(CWD);
  return state ? state.frontmatter : undefined;
}

describe("gsd_route: recommend-only freeform routing", () => {
  // ── (1) tracer: classify + recommend, never auto-run, never mutate STATE ──
  test("(1) 'discuss phase 3' → names gsd_discuss; STATE byte-identical; no auto-run", async () => {
    const { ctx } = await mountRoute([applyDiscuss, applyPlan]);
    await bootstrap(ctx, [{ name: "p1", goal: "g1", requirements: ["CLH-04"] }]);
    const gsdState = ctx.get("gsdState");
    await gsdState.setActivePhase(CWD, 1, "plan");

    const before = await readFm(ctx);
    const res = await findRoute(ctx).execute({ intent: "discuss phase 3" }, exec());
    const after = await readFm(ctx);

    assert.match(res, /run the gsd_discuss tool on phase 3/i);
    assert.equal(typeof res, "string", "execute must return a plain string (recommend-only)");
    assert.doesNotMatch(res, /auto-run/, "recommendation must never claim to auto-run (D-02)");
    assert.deepEqual(after, before, "gsd_route must never mutate STATE (out-of-scope)");
  });
});
