---
phase: 22-reactive-loop-rendering
plan: 01
subsystem: rendering/routing
tags: [capability-awareness, render, routing, persona, pure-helper]
dependency_graph:
  requires: ["phase 21 capability services (lib/_capabilities.js)"]
  provides: ["lib/_render.js pure helper consumed by persona (02) and gsd_status (03)"]
  affects: ["lib/persona.js", "lib/core-tools.js"]
tech-stack: [node, esm, node:test, @deepseek-ai/cordis]
key-files:
  created:
    - "lib/_render.js"
    - "test/render.test.mjs"
  modified:
    - "lib/_capabilities.js"
decisions:
  - "D-09 single-source helper placed in new lib/_render.js (pure, no module ctx, no I/O)"
  - "D-02 tool->capability mapping single-sourced via new pure export capabilityForTool(tool)"
  - "D-08 two ordered sub-lists: loop (role step|optional|alternate by descriptor.order) + informational (orient|jobs|onboarding in CAPABILITY_KEYS position)"
  - "D-06 zero-loop notice single-spelled via NO_LOOP_NOTICE constant shared by snapshot/gsd_status"
  - "D-01/D-02 renderPersonaBody: static core + per-step paragraphs, absent steps/tools omitted"
metrics:
  duration: "~1 round"
  completed: "2026-08-28"
status: complete
actuals:
  tasks: 3
  commits: 3
  tests: 19 (15 new helper tests across lib/_render.js + renderAvailableSteps + renderPersonaBody)
---

# Phase 22 Plan 1: Capability render/routing helper Summary

Built the single-source, pure-by-construction `lib/_render.js` capability
render/routing helper (D-09) plus its offline unit tests — the tracer slice both
the persona (plan 02) and gsd_status (plan 03) consume, proving absent steps are
excluded from ordered lists, routed around, and never instructed.

## Changes
- **`lib/_capabilities.js`**: added pure export `capabilityForTool(tool)` — the
  tool→capability-key lookup derived from the descriptor TABLE, single-sourcing
  the "never instruct a missing tool" mapping (D-02).
- **`lib/_render.js`** (new, 248 lines): exports `availableCapabilities`,
  `capabilityKeyForNextAction`, `loopSteps`, `informationEntries`,
  `effectiveRoutableStep`, `renderAvailableSteps`, `NO_LOOP_NOTICE`,
  `renderNoLoopNotice`, `renderPersonaBody`. Pure-by-construction: takes a
  `getCapability` thunk (caller-bound to `ctx.get`) or a pre-supplied descriptor
  array, returns text/route; never holds a module-level ctx, never does I/O.
- **`test/render.test.mjs`** (new): 19 passing tests covering capability
  collection, next-action→key mapping round-trip, ordering (loop by
  `descriptor.order`, informational by `CAPABILITY_KEYS` position), routable-step
  fallback, Available-steps rendering + zero-loop notice, and `renderPersonaBody`
  including a helper-level invariant that no `gsd_*` token appears whose
  capability is absent in the mount.

## Requirements Addressed
- **DEGR-02**: `renderPersonaBody` omits absent steps/tools; tested that
  `gsd_verify`/`gsd_quick` are absent when their capabilities are retired, and
  the no-absent-token invariant holds across full/partial/zero-loop sets.
- **DEGR-04**: `effectiveRoutableStep` + `renderAvailableSteps` route and render
  only through capability-present steps (D-04/D-06/D-08); gsd_status wiring lands
  in plan 03.

## Key Decisions
- New `lib/_render.js` following the `lib/_shared.js` pure-helper pattern (D-09);
  `lib/_capabilities.js` unchanged in spirit, only gaining the pure
  `capabilityForTool` export (preserves its "no ctx, no I/O" contract).
- Ordering single-sourced: loop sub-list by ascending `descriptor.order`
  (10→…→50), informational sub-list in `CAPABILITY_KEYS` position.
- Zero-loop fallback single-spelled via `NO_LOOP_NOTICE`.

## Verification
- `node --test test/render.test.mjs` → 19/19 pass.
- Full `npm test` → 369 pass, 0 fail (no regressions).
- One commit per task (3 commits), atomic per-task file sets.

## Known Stubs
- None (`lib/_render.js`, `lib/_capabilities.js`, `test/render.test.mjs` carry no
  TODO/FIXME/placeholder/skipped tests).

## Threat Flags
- No new security surface. The only hard guarantee enforced is DEGR-04/D-04 —
  never presenting an absent step as actionable — which is structurally enforced
  by single-sourcing the routing/render logic in one pure module rather than
  duplicating in persona + core-tools. No I/O, no shell, no network, no secrets.

## Self-Check: PASSED
- Created files exist: `lib/_render.js`, `test/render.test.mjs`.
- Modified: `lib/_capabilities.js` (adds `capabilityForTool`).
- Commits exist: `0859fa0` (Task 1), `6a967d2` (Task 2), `f0b6556` (Task 3);
  all on `phase-22` with scope `GSD-22-reactive-loop-rendering-01`.
- All required exports present and grep-verified; acceptance criteria met for all
  three tasks.
