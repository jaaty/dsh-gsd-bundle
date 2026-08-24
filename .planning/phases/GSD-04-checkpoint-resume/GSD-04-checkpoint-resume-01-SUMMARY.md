---
phase: GSD-04-checkpoint-resume
plan: 01
subsystem: lib/state.js artefact data layer
tags: [checkpoint, artefacts, data-layer, state]
requires: []
provides:
  - CHECKPOINT-<PP> artefact naming in _artifactFile (D-01)
  - GsdState.removeArtifact (D-06 cleanup primitive)
affects: [lib/execute.js]
tech-stack: [ESM, node:test, node:fs/promises, FakeFs, realFsAdapter]
key-files:
  created: []
  modified:
    - lib/state.js
    - test/state.test.mjs
decisions:
  - D-01: CHECKPOINT-<PP> maps to <base>-<PP>-CHECKPOINT.md
  - D-06: removeArtifact unlinks a persisted artefact (node:fs/promises, absent-file no-op)
metrics:
  duration: "~2 min"
  completed_date: 2026-08-24
actuals:
  tasks: 2
  commits: 2
status: complete
---
# Phase GSD-04 Plan 01: Extend artefact data layer for CHECKPOINT + removeArtifact Summary

Extended GsdState's artefact API so the per-plan CHECKPOINT artefact is nameable, readable, detectable, and removable through the existing `writeArtifact`/`readArtifact`/`hasArtifact` surface plus a new `removeArtifact` method — the data-layer foundation `gsd_execute` (plan 02) uses to persist and clean up checkpoint state.

## Task 1 — CHECKPOINT artefact mapping (D-01)

Changed the per-plan artefact mapper `_artifactFile` (lib/state.js:365) so its regex group accepts `CHECKPOINT`: `^(PLAN|SUMMARY|CHECKPOINT)-(\d+)$`. The existing `<base>-<PP>-PLAN.md` / `<base>-<PP>-SUMMARY.md` mapping is unchanged, so no PLAN/SUMMARY test regresses. `writeArtifact(cwd, 1, 'CHECKPOINT-01', c)` now produces `<base>-01-CHECKPOINT.md`. Added a round-trip test (test/state.test.mjs) asserting the basename, the on-fake-fs path, and read/has round-trip.

## Task 02 — removeArtifact (D-06 primitive)

Added `GsdState.removeArtifact(cwd, phaseNum, suffix)` (lib/state.js:394) immediately after `hasArtifact`, symmetric with the sibling accessors, deleting the target artefact via dynamically imported `node:fs/promises` `unlink` with an absent-file no-op (same pattern as `_ensureDir` / ship.js). Added a real-fs test (mkdtemp under os.tmpdir + `realFsAdapter`) proving `hasArtifact` flips true → false across `removeArtifact`, with `rm` cleanup in a finally. FakeFs is in-memory (no unlink), hence the real-fs adapter.

## Verification

- `node --test test/state.test.mjs` → 21 pass / 0 fail (was 19).
- `npm test` full suite → 58 pass / 0 fail (baseline 56 + 2 new).
- lib/state.js line count 531 (must_have ≥ 520).
- Both commits conventional-commit scoped `GSD-04-checkpoint-resume-01`.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The checkpoint payload (plan id, task index, commit SHAs) is not security-bearing; deletion is scoped to `.planning/` artefacts under the given cwd via the existing phaseDir resolver.

## Self-Check: PASSED

- `lib/state.js` modified, CHECKPOINT regex present, `removeArtifact` present, 531 lines ≥ 520.
- `test/state.test.mjs` modified, both new tests present and passing.
- 2 commits exist on branch `phase-4`: `02d18c6`, `3a91d82`.
