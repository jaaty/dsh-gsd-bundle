// Per-plugin removal suite (DEGR-05 / phase 23).
//
// For each of the 5 role:"step" loop plugins (gsdDiscuss, gsdPlan, gsdExecute,
// gsdVerify, gsdShip), mount the full plugin set minus that one row (D-03:
// never-apply / subset mount) and assert (a) all six effects-reverted surfaces
// are absent (D-04), (b) the remaining loop is still functional end-to-end —
// render/routing/gsd_status coherence plus offline-runnable smoke calls of the
// remaining step tools producing their artefacts (D-05) — and (c) gsd_execute /
// gsd_ship are present + registered + schema-sound only (their git/gh/subagent
// paths are not driven offline). The matrix is data-driven from CAPABILITY_KEYS
// + PATCH_ROWS (D-02) and routing semantics are reused from lib/_render.js
// effectiveRoutableStep (D-06). Offline only (FakeFs + fake-ctx, no live DSH
// boot, no LLM/git/gh) per D-08.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { CAPABILITY_KEYS, buildCapability } from "../lib/_capabilities.js";
import { effectiveRoutableStep } from "../lib/_render.js";
import {
  CWD,
  PATCH_ROWS,
  makeExec,
  mountSubset,
  personaBody,
  snapshot,
  initProject,
  assertNoAbsentToolToken,
} from "./helpers/mount-harness.mjs";
import { FENCED_PLAN, FENCED_SUMMARY, VERIFICATION_PASSED } from "./helpers/project.mjs";

// ── data-driven retirement matrix (D-01/D-02) ───────────────────────────────
// The capability set is exactly the role:"step" loop plugins; each maps to its
// patch-row `sub` via the descriptor `step` label matching the patch row `sub`,
// so adding a row to PATCH_ROWS/CAPABILITY_KEYS extends the suite with no
// structural change.
const STEP_CAPS = CAPABILITY_KEYS.filter((k) => buildCapability(k).role === "step");

function retirementMatrix() {
  return STEP_CAPS.map((capKey) => {
    const cap = buildCapability(capKey);
    const row = PATCH_ROWS.find((r) => r.sub === cap.step);
    assert.ok(row, `no patch row for step "${cap.step}"`);
    return { capKey, sub: cap.step, tool: cap.tools[0], command: cap.commands[0], step: cap.step, order: cap.order };
  });
}

// ── rich fake subagents (D-05) ───────────────────────────────────────────────
// Writes the artefacts the real subagents would produce to the FakeFs,
// parametrized to the bootstrapped phase dir. Mirrors test/tools.test.mjs:117-207.
function makeRichSubagents(fs) {
  const state = { dir: null, base: null };
  const svc = {
    setPhaseDir(dir, base) { state.dir = dir; state.base = base; },
    getProvider: (n) => (n === "spawn" ? { spawn: true } : undefined),
    async start(_n, req) {
      const label = req.label;
      let text = "done";
      if (label.startsWith("planner") && !label.includes("revise")) {
        await fs.writeText({ targetKey: `${state.dir}/${state.base}-01-PLAN.md` }, FENCED_PLAN);
        text = "## PLANNING COMPLETE";
      } else if (label.startsWith("plan-checker")) {
        text = "## VERIFICATION PASSED";
      } else if (label.startsWith("verify")) {
        await fs.writeText({ targetKey: `${state.dir}/${state.base}-VERIFICATION.md` }, VERIFICATION_PASSED);
        text = "status: passed, score: 2/2";
      } else if (label.startsWith("plan research")) {
        text = "# RESEARCH\n\n## Open Questions\n\n- none (RESOLVED)\n\nStandard.";
      }
      return { result: { output: [{ type: "text", text }], stopReason: "completed" }, dispose: () => {} };
    },
  };
  return svc;
}

// ── functional-depth smoke (D-05) ────────────────────────────────────────────
// For a retirement, smoke the remaining offline-runnable step tools
// (gsd_discuss / gsd_plan / gsd_verify) against the bootstrapped FakeFs project,
// pre-seeding whatever the absent tool would have produced, and assert the
// artefact files exist. gsd_execute / gsd_ship are never driven offline.
async function smokeRemainingSteps(ctx, retiredSub) {
  const gsdState = ctx.get("gsdState");
  const { dir, base } = await gsdState.phaseDirAndBase(CWD, 1);
  const rich = ctx.get("subagents"); // triggers the factory, capturing the mount's fs
  rich.setPhaseDir(dir, base);
  const exec = makeExec();
  const has = (name) => ctx.tools.some((t) => t.name === name);

  // CONTEXT — pre-seed when discuss is retired, else run gsd_discuss.
  if (retiredSub === "discuss") {
    await gsdState.writeArtifact(CWD, 1, "CONTEXT", "# Phase 1: p1 - Context\n\n<decisions>\n## Decisions\n- **D-01:** x\n</decisions>");
  } else if (has("gsd_discuss")) {
    const discuss = ctx.tools.find((t) => t.name === "gsd_discuss");
    const res = await discuss.execute({ phase: 1, decisions: [{ area: "a", items: [{ id: "D-01", text: "x" }] }] }, exec);
    assert.match(res, /Discuss complete/);
    assert.ok(await gsdState.hasArtifact(CWD, 1, "CONTEXT"), "gsd_discuss did not write CONTEXT.md");
  }

  // PLAN — pre-seed when plan is retired (so gsd_verify does not early-return),
  // else run gsd_plan (the rich planner subagent writes PLAN-01).
  if (retiredSub === "plan") {
    await gsdState.writeArtifact(CWD, 1, "PLAN-01", FENCED_PLAN);
  } else if (has("gsd_plan")) {
    const plan = ctx.tools.find((t) => t.name === "gsd_plan");
    const res = await plan.execute({ phase: 1 }, exec);
    assert.match(res, /gsd_plan complete/);
    assert.ok(await gsdState.hasArtifact(CWD, 1, "PLAN-01"), "gsd_plan did not write PLAN.md");
  }

  // VERIFY — pre-seed the summary (execute is never driven offline), then run
  // gsd_verify (the rich verify subagent writes VERIFICATION.md).
  if (retiredSub !== "verify" && has("gsd_verify")) {
    await gsdState.writeArtifact(CWD, 1, "SUMMARY-01", FENCED_SUMMARY);
    const verify = ctx.tools.find((t) => t.name === "gsd_verify");
    const res = await verify.execute({ phase: 1 }, exec);
    assert.match(res, /verified|gaps found|human verification/);
    assert.ok(await gsdState.hasArtifact(CWD, 1, "VERIFICATION"), "gsd_verify did not write VERIFICATION.md");
  }
}

describe("removal: per-plugin retirement reverts effects and keeps the loop functional (DEGR-05)", () => {
  for (const { capKey, sub, tool, command, step } of retirementMatrix()) {
    test(`retiring ${capKey} reverts all six effects and keeps the loop functional`, async () => {
      const allSubs = PATCH_ROWS.map((r) => r.sub);
      const subs = allSubs.filter((s) => s !== sub);
      const holder = { rich: null };
      const { ctx } = await mountSubset(subs, { subagents: (fs) => (holder.rich || (holder.rich = makeRichSubagents(fs))) });
      await initProject(ctx);

      // Surface 1 — capability service absent.
      assert.ok(!ctx.provided.has(capKey), `${capKey} capability still provided`);
      // Surface 2 — tool absent.
      assert.ok(!ctx.tools.some((t) => t.name === tool), `${tool} still registered`);
      // Surface 3 — command unregistered.
      assert.ok(!ctx.commands.some((c) => c.name === command), `${command} still registered`);

      // Surface 4 — persona omits the step paragraph + never names its tools.
      const body = personaBody(ctx);
      assertNoAbsentToolToken(ctx, body, `persona (retired ${capKey})`);
      const capLabel = step[0].toUpperCase() + step.slice(1);
      assert.ok(!body.includes(`- ${capLabel}:`), `persona still renders the ${capKey} step paragraph`);

      // Surface 5 — snapshot omits the step from Available-steps.
      const snap = snapshot(ctx);
      assert.ok(!snap.match(new RegExp(`Available steps:[^\n]*${step}`)), `snapshot advertises absent step ${step}`);
      assertNoAbsentToolToken(ctx, snap, `snapshot (retired ${capKey})`);

      // Surface 6 — gsd_status rewrites a stored next_action targeting it.
      const gsdState = ctx.get("gsdState");
      await gsdState.setActivePhase(CWD, 1, step);
      const gsdStatus = ctx.tools.find((t) => t.name === "gsd_status");
      const out = await gsdStatus.execute({}, makeExec());
      const presentDescs = [...ctx.provided.values()].filter(
        (d) => d && typeof d === "object" && typeof d.key === "string" && Array.isArray(d.tools),
      );
      const expected = effectiveRoutableStep(`${step}-phase`, presentDescs);
      const expectedLine = expected ? `Next action: ${expected.step}-phase` : `Next action: no available loop step`;
      assert.match(out, new RegExp(expectedLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assertNoAbsentToolToken(ctx, out, `gsd_status (retired ${capKey})`);

      // Functional depth (D-05): remaining offline-runnable step tools smoke.
      await smokeRemainingSteps(ctx, sub);

      // execute/ship present + registered + schema-sound only (D-05): their
      // git/gh/subagent paths are NOT driven offline.
      for (const [name, cap] of [["gsd_execute", "gsdExecute"], ["gsd_ship", "gsdShip"]]) {
        if (cap === capKey) continue;
        const t = ctx.tools.find((x) => x.name === name);
        assert.ok(t, `${name} not registered after retiring ${capKey}`);
        assert.equal(typeof t.description, "string");
        assert.ok(t.parameters && typeof t.parameters === "object");
        assert.ok(t.output && t.output.schema, `${name} missing output.schema`);
      }
    });
  }
});
