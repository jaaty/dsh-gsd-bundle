---
phase: 23-removal-verification
plan: 02
subsystem: test-suite
tags: [test, removal, DEGR-05, D-01, D-02, D-03, D-04, D-05, D-06, D-08]
dependency_graph:
  requires: [test/helpers/mount-harness.mjs shared fake-ctx mount harness (plan 01)]
  provides: [test/removal.test.mjs per-plugin removal suite proving DEGR-05]
  affects: [lib/_capabilities.js, lib/_render.js (read-only matrix/routing sources)]
tech-stack: [node:test, node:assert/strict, plain-ESM, FakeFs, fake-ctx]
key-files:
  created:
    - test/removal.test.mjs
  modified: []
decisions:
  - D-01: matrix targets exactly the 5 role:"step" loop plugins (gsdDiscuss/gsdPlan/gsdExecute/gsdVerify/gsdShip).
  - D-02: matrix is data-driven from CAPABILITY_KEYS.filter(role==="step") crossed with PATCH_ROWS via the descriptor `step` label matching the patch-row `sub`.
  - D-03: retirement modeled as never-apply / subset mount (no runtime apply-then-revert machinery).
  - D-04: all six effects-reverted surfaces asserted absent for each retired plugin.
  - D-05: remaining offline-runnable step tools (gsd_discuss/gsd_plan/gsd_verify) smoke against a bootstrapped FakeFs project producing CONTEXT.md/PLAN.md/VERIFICATION.md; gsd_execute/gsd_ship present+registered+schema-sound only.
  - D-06: gsd_status next_action rewrite asserted through the REUSED effectiveRoutableStep helper (never redefined).
  - D-08: suite stays offline only (FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh).
metrics:
  duration: ~6 min
  completed: 2026-08-29
status: complete
---

# Phase 23 Plan 02: Per-Plugin Removal Suite Summary

Added the automated per-plugin removal suite `test/removal.test.mjs` (DEGR-05): for each of the 5 role:"step" loop plugins, mount the full plugin set minus that one row and prove all six effects-reverted surfaces are absent while the remaining loop stays functional end-to-end — render/routing/gsd_status coherence plus offline-runnable smoke calls of the remaining step tools producing their artefacts.

## What was done

- **Task 1** — Data-driven retirement matrix (`STEP_CAPS = CAPABILITY_KEYS.filter(k => buildCapability(k).role === "step")` crossed with `PATCH_ROWS` via the descriptor `step` label matching the patch-row `sub`, D-01/D-02) and, for each of the 5 step plugins, the six effects-reverted surface assertions (D-04): capability service absent from `ctx.provided`, tool absent from `ctx.tools`, slash command unregistered from `ctx.commands`, persona omits the step paragraph + never names its tools (`assertNoAbsentToolToken`), snapshot omits the step from Available-steps, and `gsd_status` rewrites a stored `next_action` targeting it via the REUSED `effectiveRoutableStep` (D-06, never redefined).
- **Task 2** — Functional-depth smoke (D-05): a rich fake subagents factory (`makeRichSubagents`, mirroring test/tools.test.mjs) writes PLAN.md / VERIFICATION.md to the FakeFs, and `smokeRemainingSteps` runs the remaining offline-runnable step tools (`gsd_discuss` / `gsd_plan` / `gsd_verify`) against the bootstrapped FakeFs project, pre-seeding whatever the absent tool would have produced (CONTEXT when discuss retired, PLAN-01 when plan retired, SUMMARY-01 before verify) and asserting the artefact files exist. The subagents factory is injected via `mountSubset(subs, { subagents: (fs) => ... })` and cached as a singleton so `setPhaseDir` state persists across `ctx.get("subagents")` calls.
- **Task 3** — `gsd_execute` / `gsd_ship` present + registered + schema-sound assertions for every retirement (their git/gh/subagent paths are NOT driven offline), then full-suite regression.

## Verification

- `node --test test/removal.test.mjs` → **5 pass / 0 fail** (one test per step plugin).
- `npm test` → **378 pass / 0 fail** (373 baseline preserved + 5 removal tests, no regression from the plan-01 harness extraction).

## Commits

- `272f8c3` feat(23-02): data-driven per-plugin removal matrix + six effects-reverted surfaces (DEGR-05)
- `2764e8a` feat(23-02): functional-depth smoke of remaining offline-runnable step tools (D-05)
- `5e6bc81` feat(23-02): assert execute/ship present+registered+schema-sound for every retirement (D-05)

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests introduced.

## Threat Flags

None. This is a test-only phase; no production code changed. The suite stays offline (FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh) per D-08; execute/ship git/gh/subagent paths are present+registered assertions only.

## Self-Check: PASSED

- `test/removal.test.mjs` exists (176 lines) and passes standalone (5/0).
- All three commits exist on `phase-23` (verified by `git log`).
- Full suite passes 378/0.
