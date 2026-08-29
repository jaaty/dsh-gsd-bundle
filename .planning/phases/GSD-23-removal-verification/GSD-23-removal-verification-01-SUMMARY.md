---
phase: 23-removal-verification
plan: 01
subsystem: test-harness
tags: [test, harness, refactor, DEGR-05, D-07]
dependency_graph:
  requires: []
  provides: [test/helpers/mount-harness.mjs shared fake-ctx mount harness for plan 02]
  affects: [test/mount.test.mjs, test/removal.test.mjs (plan 02)]
tech-stack: [node:test, node:assert/strict, plain-ESM, FakeFs]
key-files:
  created:
    - test/helpers/mount-harness.mjs
  modified:
    - test/mount.test.mjs
decisions:
  - D-07: shared fake-ctx mount harness extracted to test/helpers/mount-harness.mjs, imported by both mount and removal suites.
  - OQ-1: makeMountCtx/mountSubset accept an optional subagents service object OR factory `(fs) => service`, defaulting to the simple stub.
metrics:
  duration: ~4 min
  completed: 2026-08-29
status: complete
---

# Phase 23 Plan 01: Shared Mount Harness Extraction Summary

Extracted the shared fake-ctx mount harness from `test/mount.test.mjs` into `test/helpers/mount-harness.mjs` (D-07) so the existing mount suite and the new per-plugin removal suite (plan 02) share a single source of the fake-ctx machinery, with the only behavioural addition being an optional subagents service/factory (OQ-1).

## What was done

- **Task 1** — Created `test/helpers/mount-harness.mjs` exporting all 12 members (`CWD`, `PATCH_ROWS`, `makeSubagents`, `makeExec`, `makeMountCtx`, `applySubset`, `mountSubset`, `personaBody`, `snapshot`, `initProject`, `presentTools`, `assertNoAbsentToolToken`) with byte-identical signatures to the original in-file definitions. `makeMountCtx`/`mountSubset` accept an optional `subagents` service object or factory `(fs) => service`, defaulting to the simple stub. `ctx.effect` still invokes its callback synchronously (R-3); `ctx.inject` still returns a no-op disposer when any non-`commands` inject key is missing (DEGR-03).
- **Task 2** — Refactored `test/mount.test.mjs` to import the shared harness, deleting the in-file definitions of `CWD`, `PATCH_ROWS`, `gsdStateSvc`, `makeSubagents`, `makeMountCtx`, `applySubset`, and the reactive-block helpers (`mountSubset`, `personaBody`, `snapshot`, `initProject`, `presentTools`, `assertNoAbsentToolToken`). Kept `applyAll`, `readPatchRows`, `EXPECTED_*` constants, and all describe/test blocks unchanged. Replaced the two inline `exec` objects with `makeExec()`.

## Verification

- `node --check test/helpers/mount-harness.mjs` → exit 0.
- `node --check test/mount.test.mjs` → exit 0.
- `npm test` → **373 pass / 0 fail** (baseline preserved, no regression from the extraction).

## Commits

- `7300026` feat(23-01): extract shared fake-ctx mount harness (D-07)
- `14765ca` refactor(23-01): import shared mount harness in mount suite (D-07)

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests introduced.

## Threat Flags

None. This is a test-layer refactor; no production code changed, no new external surface.

## Self-Check: PASSED

- `test/helpers/mount-harness.mjs` exists and exports all 12 members (verified by grep).
- `test/mount.test.mjs` imports the harness and no longer defines `makeMountCtx` inline (verified by grep).
- Both commits exist on `phase-23` (verified by `git log`).
- Full suite passes 373/0.
