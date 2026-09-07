---
phase: 53-smart-entry
plan: 01
subsystem: smart-entry pure classifier
tags: ["smart-entry", "classifier", "pure-helper", "routing", "CLH-02", "CLH-03"]
requires: ["lib/_render.js (effectiveRoutableStep)", "lib/_capabilities.js (buildCapability)"]
provides: ["lib/_next.js (classifyNextState, renderNextRecommendation, hasCap, BRANCH)"]
affects: []
tech-stack: ["node:test", "node:assert/strict", "ESM"]
key-files:
  created:
    - "lib/_next.js"
    - "test/_next.test.mjs"
  modified: []
decisions:
  - "D-03: classifyNextState is pure — no host context, no fs, no I/O, no async; the tool execute path (plan 02) gathers the snapshot and calls it."
  - "D-04: six branches evaluated top-down in precedence order (1 no-project -> 2 corrupt -> 3 paused -> 4 mid-phase -> 5 phase-shipped-next -> 6 milestone-complete), returning on first match."
  - "D-07: branch 4 falls through to branch 5 when STATE.status is 'done' OR the active phase ROADMAP status is 'Complete' — never a no-op."
  - "D-08: branch 5 selects the lowest-numbered pending phase and sets step 'discuss' (or 'spec' when gsdSpec capability is present); returns mutation { setActivePhase: { phaseNum, step } }."
  - "D-09: branch 6 routes to gsd_milestone_audit, or gsd_new_milestone when an audit reports status 'ready-to-close'; no STATE mutation."
  - "D-06/OQ-2: every routed command is gated on its capability descriptor (gsdOrient/gsdHealth/gsdMilestoneAudit); absent capability degrades to the 'gsd_status' fallback, never naming a missing tool."
  - "D-02: renderNextRecommendation names the command to invoke ('Next action: run <rec>.') but never claims to auto-run it."
metrics:
  duration: "single session"
  completed: "2026-09-07"
  tests: 20
  commits: 3
status: complete
---

# Phase 53 Plan 01: Pure State Classifier Summary

Delivered the pure, side-effect-free six-branch state classifier `classifyNextState` and recommendation renderer `renderNextRecommendation` that the gsd_next tool's execute path (plan 02) will call, with a complete unit-test matrix across all D-04 branches, precedence, the D-07 fall-through, and capability-aware degradation.

## What was built

### lib/_next.js (164 lines, pure)
- `BRANCH` — frozen constant object with the six branch ids (`NO_PROJECT`, `CORRUPT`, `PAUSED`, `MID_PHASE`, `PHASE_SHIPPED_NEXT`, `MILESTONE_COMPLETE`).
- `hasCap(descriptors, key)` — capability-presence helper mirroring the `buildCapability` descriptor shape.
- `classifyNextState(snapshot, descriptors)` — the pure classifier. Evaluates the six D-04 branches top-down, returns on first match as `{ branch, recommendation, mutation }`. Only branch 5 (PHASE_SHIPPED_NEXT) returns a non-null mutation (`{ setActivePhase: { phaseNum, step } }`); every other branch returns `mutation: null`. Branch 4 reuses `effectiveRoutableStep` from `lib/_render.js` as the single source of truth for capability-aware mid-phase routing, with the D-07 fall-through (status `done` OR phase `Complete` -> branch 5). Branch 5 chooses `spec` step when `gsdSpec` is present, else `discuss` (D-08). Branch 6 routes to `gsd_milestone_audit`, or `gsd_new_milestone` when an audit reports `ready-to-close` (D-09).
- `renderNextRecommendation(result)` — pure formatter: `Next action: run <recommendation>.` Never claims to auto-run (D-02).

Purity invariants verified: no `ctx` token anywhere (incl. comments/JSDoc), no `node:fs`, no `await`, no I/O.

### test/_next.test.mjs (242 lines, 20 tests)
Two describe blocks:
- Tracer branches: no-project (branch 1), mid-phase (branch 4), render wording.
- Six-branch state matrix (D-04): branches 2–6, precedence (1>2>3>4>5>6), D-07 fall-through (status done; phase Complete), capability-aware degradation (retire gsdHealth -> fallback; retire gsdMilestoneAudit -> fallback; retire gsdSpec -> step discuss), milestone-complete audit-aware routing (no audit -> audit; ready-to-close -> new-milestone), and the never-throws-on-empty-snapshot guard.

Helpers: `fullDescriptors()`, `without(descriptors, key)`, `coreDescriptors()`, and snapshot builders (`noProjectSnapshot`, `corruptSnapshot`, `midPhaseSnapshot`, `phaseShippedSnapshot`, `milestoneCompleteSnapshot`).

## Acceptance criteria status
All task acceptance criteria satisfied:
- `export function classifyNextState` ✓
- `export function renderNextRecommendation` ✓
- `effectiveRoutableStep` imported ✓
- `hasCap` present ✓
- `node --test test/_next.test.mjs` exits 0 ✓ (20/20 pass)
- No `ctx` token / `node:fs` / `await` in lib/_next.js ✓
- `MILESTONE_COMPLETE`, `PHASE_SHIPPED_NEXT`, `ready-to-close`, `gsdSpec`, `setActivePhase` present ✓
- ≥18 tests (20) ✓; `ready-to-close`, `gsdSpec`, `without(` present ✓

## Known Stubs
None. No TODO/FIXME/placeholder/skipped tests in the produced files.

## Threat Flags
None. `lib/_next.js` is a pure module: no shell interpolation, no filesystem access, no network, no git, no subagent spawning. Its only authority is a returned mutation descriptor object that the plan-02 execute path (not this module) applies via the existing `setActivePhase` mutator.

## TDD Gate Compliance
This plan is `type: execute` (not `type: tdd`), so the tdd_audit ship gate does not apply. Commits follow the conventional-commit prefix with `(53-01)` scope: one `feat` commit per implementation task and one `test` commit for the matrix.

## Self-Check: PASSED
- lib/_next.js exists (164 lines ≥ 90 min_lines) ✓
- test/_next.test.mjs exists (242 lines ≥ 120 min_lines) ✓
- Exports present: classifyNextState, renderNextRecommendation (plus hasCap, BRANCH) ✓
- 3 commits exist on phase-53 branch (2e75d0b, dbf5093, 4f9623c) ✓
- Full project suite: 998 tests, 998 pass, 0 fail ✓