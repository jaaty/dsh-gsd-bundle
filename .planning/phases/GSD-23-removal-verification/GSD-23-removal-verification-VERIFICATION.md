---
phase: 23-removal-verification
verified: 2026-08-29
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 23: removal-verification Verification Report

## Goal Achievement

**Goal:** Add an automated per-plugin removal test proving every single step plugin can be retired with its effects reverted and the remaining loop still functional end-to-end. (DEGR-05)

**Verdict:** ACHIEVED. `test/removal.test.mjs` proves, for all 5 `role:"step"` loop plugins, that retiring each reverts all six effects-reverted surfaces and the remaining loop stays functional end-to-end (render/routing/gsd_status coherence + offline-runnable smoke calls producing artefacts). The shared harness was extracted to `test/helpers/mount-harness.mjs` (D-07) with no regression to the existing suite.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | Shared fake-ctx mount harness lives in `test/helpers/mount-harness.mjs` and is imported by BOTH `test/mount.test.mjs` and `test/removal.test.mjs` (D-07) | ✓ VERIFIED | `mount-harness.mjs` exists (208 lines); `mount.test.mjs:30` and `removal.test.mjs:29` both `import ... from "./helpers/mount-harness.mjs"`; in-file `makeMountCtx`/`mountSubset`/`assertNoAbsentToolToken`/`makeSubagents`/`applySubset` definitions removed from `mount.test.mjs` (grep returns none) |
| T2 | `makeMountCtx` accepts an optional subagents service/factory defaulting to the simple stub (OQ-1) | ✓ VERIFIED | `mount-harness.mjs:104` `if (typeof subagents === "function") return subagents(fs);`; `mountSubset` forwards `{ subagents }` to `makeMountCtx` (line 156-161); default `makeSubagents()` stub at line 41 |
| T3 | Per-plugin removal matrix is data-driven from `CAPABILITY_KEYS` (role === "step") crossed with `PATCH_ROWS` (D-02) | ✓ VERIFIED | `removal.test.mjs:37` `CAPABILITY_KEYS.filter((k) => buildCapability(k).role === "step")`; `retirementMatrix()` maps each step cap to its patch-row `sub` via the descriptor `step` label (lines 39-46) |
| T4 | For each of the 5 step plugins, retiring it reverts all six effects-reverted surfaces and the remaining loop stays functional end-to-end (DEGR-05, D-04, D-05) | ✓ VERIFIED | `removal.test.mjs` describe block iterates `retirementMatrix()` (5 tests, one per plugin); six surfaces asserted (lines 131-159); functional-depth smoke (lines 162, 81-119); execute/ship present+registered+schema-sound (lines 166-173). Standalone run: **5 pass / 0 fail** |
| T5 | Harness extraction is non-breaking (baseline preserved) | ✓ VERIFIED | `npm test` → **378 pass / 0 fail** (373 baseline + 5 removal tests) |
| T6 | Routing semantics reused from `effectiveRoutableStep`, never redefined (D-06) | ✓ VERIFIED | `removal.test.mjs:19` imports `effectiveRoutableStep` from `../lib/_render.js`; line 156 computes expected rewrite via the reused helper; no new routing logic |
| T7 | Roadmap success criterion DEGR-05 delivered | ✓ VERIFIED | Automated per-plugin removal test exists, passes, and proves effects-reverted + end-to-end functional for all 5 step plugins |

## Score

**7/7 must-haves verified** (2 plan-01 truths + 2 plan-02 truths + 1 roadmap truth + 2 non-breaking/regression truths). No truth FAILED, no artifact MISSING/STUB, no key link NOT_WIRED, no blocker anti-pattern.

## Deferred Items

None. CONTEXT.md lists no deferred ideas; no `<verify><human-check>` blocks in either PLAN.md.

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|----------|--------|-------------|-------|
| `test/helpers/mount-harness.mjs` (min 120 lines, 12 exports) | ✓ (208 lines) | ✓ exports all 12: `CWD`, `PATCH_ROWS`, `makeSubagents`, `makeExec`, `makeMountCtx`, `applySubset`, `mountSubset`, `personaBody`, `snapshot`, `initProject`, `presentTools`, `assertNoAbsentToolToken` | ✓ imported by both suites |
| `test/mount.test.mjs` (min 300 lines, refactored) | ✓ (454 lines) | ✓ keeps `applyAll`, `readPatchRows`, `EXPECTED_*`, all 4 describe blocks | ✓ imports harness, uses `makeExec()` |
| `test/removal.test.mjs` (min 120 lines) | ✓ (176 lines) | ✓ data-driven matrix, six surfaces, smoke depth, execute/ship schema-sound | ✓ passes standalone 5/0 |

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `test/mount.test.mjs` | `test/helpers/mount-harness.mjs` | `from "./helpers/mount-harness.mjs"` (line 30) | WIRED |
| `test/helpers/mount-harness.mjs` | `test/helpers/fake-fs.mjs` | `import { FakeFs } from "./fake-fs.mjs"` (line 16) | WIRED |
| `test/removal.test.mjs` | `test/helpers/mount-harness.mjs` | `from "./helpers/mount-harness.mjs"` (line 29) | WIRED |
| `test/removal.test.mjs` | `lib/_capabilities.js` | `CAPABILITY_KEYS.filter` (line 37) | WIRED |
| `test/removal.test.mjs` | `lib/_render.js` | `effectiveRoutableStep` (lines 19, 156) | WIRED |

## Data-Flow Trace

The smoke calls genuinely produce artefacts (not just present+registered). For each retirement, `smokeRemainingSteps` runs the remaining offline-runnable step tools and asserts the artefact file exists via `gsdState.hasArtifact`:

- **retire discuss:** CONTEXT pre-seeded; `gsd_plan` runs (asserts PLAN-01 exists, line 107); `gsd_verify` runs (asserts VERIFICATION exists, line 117).
- **retire plan:** `gsd_discuss` runs (asserts CONTEXT exists, line 96); PLAN-01 pre-seeded; `gsd_verify` runs (asserts VERIFICATION exists).
- **retire execute:** `gsd_discuss` + `gsd_plan` + `gsd_verify` all run (asserts CONTEXT/PLAN-01/VERIFICATION).
- **retire verify:** `gsd_discuss` + `gsd_plan` run (asserts CONTEXT/PLAN-01); VERIFY skipped.
- **retire ship:** `gsd_discuss` + `gsd_plan` + `gsd_verify` all run.

The rich subagents factory (`makeRichSubagents`) writes PLAN.md / VERIFICATION.md to the FakeFs via `fs.writeText`, and is injected through `mountSubset(subs, { subagents: (fs) => ... })` (line 127), so the mount's fs is captured. The `hasArtifact` assertions would fail if the smoke did not write — the passing suite confirms data-flowing. Surface 6 (gsd_status rewrite) is a real behavioral assertion: it sets the active phase to the retired step and asserts the output matches the `effectiveRoutableStep`-computed rewrite.

## Behavioral Spot-Checks

- `node --test test/removal.test.mjs` → **5 pass / 0 fail** (one test per step plugin: gsdDiscuss, gsdPlan, gsdExecute, gsdVerify, gsdShip).
- `npm test` (full suite) → **378 pass / 0 fail** (baseline preserved + 5 removal tests).

## Requirements Coverage

| REQ-ID | Delivered | Evidence |
|--------|-----------|----------|
| DEGR-05 | ✓ | `test/removal.test.mjs` automated per-plugin removal test, passing 5/0 |

## Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX/TODO markers in `test/removal.test.mjs` or `test/helpers/mount-harness.mjs` (grep returns none). No skipped/todo tests (0 skipped, 0 todo in full run).

## Human Verification Required

None. This is a test-only, offline phase (FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh per D-08). All six effects-reverted surfaces and the functional-depth smoke are programmatically asserted and pass. No visual/real-time/external verification is needed.

## Gaps Summary

No gaps found. Status: **passed**.
