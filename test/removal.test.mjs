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

describe("removal: per-plugin retirement reverts effects and keeps the loop functional (DEGR-05)", () => {
  for (const { capKey, sub, tool, command, step } of retirementMatrix()) {
    test(`retiring ${capKey} reverts all six effects and keeps the loop functional`, async () => {
      const allSubs = PATCH_ROWS.map((r) => r.sub);
      const subs = allSubs.filter((s) => s !== sub);
      const { ctx } = await mountSubset(subs);
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
    });
  }
});
