---
phase: 22-reactive-loop-rendering
plan: 03
subsystem: gsd_status/gsd_progress routing
tags: [capability-awareness, next-action routing, available-steps, read-time, gsd_status, gsd_progress]
dependency_graph:
  requires: ["phase-01 lib/_render.js (effectiveRoutableStep/renderAvailableSteps/availableCapabilities/NO_LOOP_NOTICE)", "phase-21 capability store (lib/_capabilities.js)"]
  provides: ["capability-aware gsd_status + gsd_progress that never advertise an absent step as actionable"]
  affects: ["lib/core-tools.js"]
tech-stack: [node, esm, node:test, @deepseek-ai/cordis, @deepseek-ai/dsh-tools]
key-files:
  created: []
  modified:
    - "lib/core-tools.js"
decisions:
  - "D-04: gsd_status rewrites/replaces a stored next_action whose step capability is absent via effectiveRoutableStep, never advertising an absent step"
  - "D-08: gsd_status adds an ordered '## Available steps' section rendered by renderAvailableSteps (loop by descriptor.order, informational in CAPABILITY_KEYS order)"
  - "D-06: zero-loop case degrades to NO_LOOP_NOTICE on both the Next action line and the Available steps section"
  - "D-07: every capability-routed computation wrapped in try/catch never-throw guard; absent/malformed capabilities degrade, never crash"
  - "D-09: gsd_progress final Next action line routes through the same single-source helper (RESEARCH Risk 1.4) so no-missing-tool holds on both surfaces"
  - "D-05: lib/state.js untouched; routing computed purely by the read-time wrapper"
metrics:
  duration: "~1 round"
  completed: "2026-08-28"
status: complete
actuals:
  tasks: 2
  commits: 2
  tests: 19 (phase-01 helper tests still pass; full suite 369/369 pass)
---

# Phase 22 Plan 3: Make gsd_status / gsd_progress capability-aware (DEGR-04) Summary

Wired the phase-01 `lib/_render.js` single-source helper into `lib/core-tools.js`
so gsd_status and gsd_progress read the present capability descriptors via
`ctx.get` at execute time (read-time wrapper, D-05), route the stored
`next_action` through `effectiveRoutableStep`, and never advertise an absent
step as actionable on either surface (D-04, DEGR-04).

## Changes
- **`lib/core-tools.js`** (import added + both tool closures updated):
  - `gsd_status`: imports `availableCapabilities / capabilityKeyForNextAction /
    effectiveRoutableStep / renderAvailableSteps / NO_LOOP_NOTICE`; computes the
    present capabilities once (`availableCapabilities((k) => ctx.get(k))`) and a
    `routable` fallback in a `try/catch` (D-07 never-throw). The `Next action`
    line now prints the original `next_action` only when its own step capability
    is present; otherwise the nearest present step's `-phase`; otherwise
    `NO_LOOP_NOTICE`. Adds an `## Available steps` section
    (`renderAvailableSteps(caps)` split on newlines) between Progress and
    Phases — ordered loop list + informational entries, degrading to a single
    no-loop line in the zero-loop case (D-06/D-08).
  - `gsd_progress`: routes its final `Next action` line through the same
    capability-aware rule (present capability keeps the original; else nearest
    present step; else `NO_LOOP_NOTICE`) inside the same never-throw guard, so
    the no-missing-tool promise holds on the second surface (RESEARCH Risk 1.4,
    D-09 single-sourcing).
  - `lib/state.js` is untouched (D-05) — routing/rendering is read-time only.

## Requirements Addressed
- **DEGR-04**: The step machine routes and advertises only through available
  step capabilities. gsd_status rewrites/replaces an absent-step
  `next_action`, and both gsd_status and gsd_progress never instruct a missing
  tool. The full no-missing-tool invariant is structurally enforced by single-
  sourcing routing through `lib/_render.js`.

## Key Decisions
- Both tool closures share the single `lib/_render.js` helper (D-09) rather than
  duplicating routing logic.
- Every capability-routed computation is wrapped in a `try/catch` that degrades
  to a handled fallback (never throws over an absent/malformed capability)
  (D-07).
- `availableCapabilities((k) => ctx.get(k))` uses the non-reactive, always-
  optional `ctx.get` read — capabilities are NOT added to the tool's inject
  (consistent with D-02/D-06 poll-vs-inject).

## Verification
- `node --test test/render.test.mjs` → 19/19 pass (phase-01 helper unaffected).
- Full `npm test` → 369/369 pass, 0 fail (no regressions).
- `node -e import('./lib/core-tools.js')` → loads without syntax/import error.
- Grep: `availableCapabilities` appears in both the gsd_status (line 126) and
  gsd_progress (line 224) closures; `effectiveRoutableStep`, `renderAvailableSteps`,
  `NO_LOOP_NOTICE`, `capabilityKeyForNextAction`, and `## Available steps` all
  present.
- Two commits, one per task, on `phase-22` with scope
  `GSD-22-reactive-loop-rendering-03`.

## Known Stubs
- None. `lib/core-tools.js` carries no TODO/FIXME/placeholder/skipped tests.

## Threat Flags
- No new security surface. The enforced guarantee is DEGR-04: gsd_status and
  gsd_progress never present an absent step as actionable. It is enforced by
  single-sourcing the routing/render logic through the pure `lib/_render.js`
  helper rather than duplicating it. No I/O, no shell, no network, no secrets.

## Self-Check: PASSED
- Created files: none (this plan only modifies `lib/core-tools.js`).
- Modified file exists and loads: `lib/core-tools.js`.
- Commits exist: `a5eccd4` (Task 1), `4e94d18` (Task 2), both on `phase-22`.
- All acceptance criteria met for both tasks; full test suite green.
