---
phase: 52-phase-management
plan: 01
subsystem: phase-management
tags: [pure, domain, roadmap, crud, validation]
requires: []
provides: [lib/phase-management.js, test/phase-management.test.mjs]
affects: [lib/_shared.js]
tech-stack: [node, esm]
key-files:
  created: [lib/phase-management.js, test/phase-management.test.mjs]
  modified: []
decisions: [D-02, D-03, D-04, D-05, D-06, D-07, D-08]
metrics:
  duration: 0.2h
  completed: 2026-09-06
  actuals:
    tasks: 3
    commits: 3
status: complete
---

# Phase 52 Plan 01: phase-management pure domain core Summary

Delivered the dependency-free pure domain core of CLH-01: `lib/phase-management.js` with deterministic CRUD actions (add/insert/remove/reorder/edit), the D-04 hard-invariant validation, the D-03/D-08 destructive-guard rules, and the OQ-1 contiguous renumbering scheme — each operating on the parseRoadmap document shape and returning `{ ok:false, code, error }` fail-closed without mutating the input — proven by an exhaustive pure unit suite.

## What was built

- **`lib/phase-management.js`** (141 lines, plain ESM, zero deps, no ctx/fs/git I/O):
  - `validateRoadmapDoc(doc, reqIds)` — D-04 hard invariants: `ROADMAP_UNPARSEABLE`, `EMPTY_GOAL`, `EMPTY_REQUIREMENTS`, `UNKNOWN_REQ_ID`, `DUPLICATE_NAME`, `DUPLICATE_SLUG`.
  - `renumber(phases)` — OQ-1 contiguous renumbering (`n = index+1`), returns a fresh array, never mutates input.
  - `applyPhaseAction(doc, action, opts)` — dispatches on `action.op` (`add`/`insert`/`remove`/`reorder`/`edit`), works on a deep copy, runs `validateRoadmapDoc` on the mutated doc before returning `ok`, and guarantees `doc.phases` deep-equals `parseRoadmap(stringifyRoadmap(doc)).phases` (round-trip invariant, D-05).
  - Guards: `COMPLETE_PHASE_LOCKED` (D-03, remove/reorder of shipped), `ACTIVE_REORDER_BLOCKED` (D-03, reorder of in-flight), `ACTIVE_REMOVE_REQUIRES_YES` (D-08), `LAST_PENDING_REQUIRES_YES` (D-08), `INVALID_INDEX`, `NO_SUCH_PHASE`, `INVALID_STATUS`, `UNKNOWN_ACTION`.
- **`test/phase-management.test.mjs`** (285 lines, node:test + assert/strict): 26 tests across 7 suites covering every CRUD action, every guard code, every invariant code, and the fail-closed unmutated-input property (13 `assert.deepEqual(doc, before)` checks).

## Key decisions applied

- **D-02/D-05:** renumbering ripples through the phase array only; `stringifyRoadmap` regenerates the `## Progress` table from the same `phases` array, so ROADMAP phase table + Progress stay consistent by construction.
- **D-03:** remove/reorder of a `Complete` phase and reorder of the active phase are hard-blocked (no `--yes` escape for reorder).
- **D-04/D-06:** every hard check runs on the proposed mutated doc before any write; on failure the input doc is left byte-identical (fail-closed).
- **D-07/D-08:** `add` appends at `max+1`; `insert`/`reorder` renumber contiguously; remove of the active or last pending phase requires `confirm:true`.
- **OQ-1:** contiguous renumbering (`n = index+1`) after insert/reorder/remove, accepting the documented phase-dir name divergence (dirs are never moved, per D-02).

## Verification

- Task 1 tracer: sample `add` round-trips through `parseRoadmap(stringifyRoadmap(doc))` yielding 2 phases — passed.
- Task 2 guard check: reorder of a Complete phase returns `{ ok:false, code:'COMPLETE_PHASE_LOCKED' }` — passed.
- Task 3: `node --test test/phase-management.test.mjs` → 26 pass / 0 fail.
- Full suite: `node --test test/*.test.mjs` → 964 pass / 0 fail.

## Known Stubs

None. No TODO/FIXME/placeholder markers; no skipped tests.

## Threat Flags

None. This is a pure, dependency-free module with no I/O, no auth, no secrets, and no git handling. The critical fail-closed guard (validate-before-write) lives in the domain layer, as required by RESEARCH.md — the Wave-2 tool/orchestration plan must keep validation before any `_write`/commit.

## Self-Check: PASSED

- `lib/phase-management.js` exists (141 lines, ≥120 required) and exports `validateRoadmapDoc`, `renumber`, `applyPhaseAction`.
- `test/phase-management.test.mjs` exists (285 lines, ≥60 required).
- 3 atomic commits landed on `phase-52`: `13d017f`, `684bf7c`, `397c329`.
- Full test suite green (964 pass).
