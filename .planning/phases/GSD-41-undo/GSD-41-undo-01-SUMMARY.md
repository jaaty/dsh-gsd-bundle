---
phase: 41
plan: 01
subsystem: undo
tags: [undo, rollback, out-of-band, capability, dependency-check, confirmation-gate]
requires: []
provides:
  - "gsdUndo capability (step undo, role out-of-band, NOT_LOOP_ORDERED)"
  - "gsd_undo tool + /gsd-undo command"
  - "phase/plan commit rollback via git revert with dependency checks + confirmation gate"
affects:
  - lib/undo.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/undo.test.mjs
tech-stack:
  - node:test
  - ESM
metrics:
  duration: 0
  completed: 2026-08-29
status: complete
actuals:
  tasks: 2
  commits: 1
---

# Phase 41 Plan 01: undo Summary

Implemented the safe undo path (opengsd /gsd-undo) as an out-of-band tool. The tool rolls back a phase's or plan's commits via the phase manifest with dependency checks and a confirmation gate. It refuses to roll back when a later phase/plan depends on the target, dry-runs by default, and executes only with confirm:true. It is out-of-band — it does not advance the loop position.

## Tasks

- **Task 1** — Implemented `lib/undo.js`: published the `gsdUndo` capability via `ctx.provide('gsdUndo', buildCapability('gsdUndo'))` and registered the `gsd_undo` tool via `ctx.tools.register(defineTool({...}))` with inject `['gsdState','tools']`. Exported the pure, unit-testable helpers `filterPlanCommits`, `revertArgsFor`, `checkPhaseDependencies`, `checkPlanDependencies`, `renderDryRunReport`, `renderUndoBody`. In `apply()`: fail-fast on baseline guards; derived the commit set from git history at undo-time; checked dependencies (refused if a later phase/plan depends on the target); dry-ran by default (confirm:true executes); wrote UNDO.md. Out-of-band: does not mutate the STATE loop position.
- **Task 2** — Registered the `gsdUndo` descriptor row in `lib/_capabilities.js` (step `undo`, role `out-of-band`, tools `['gsd_undo']`, commands `['gsd-undo']`, order NOT_LOOP_ORDERED, produces `['UNDO.md']`, consumes `[]`) and appended it to CAPABILITY_KEYS. Added the `/gsd-undo` command to `lib/commands.js`. Created `test/undo.test.mjs` covering capability descriptor registration, command pairing, pure helpers, dependency-refusal, dry-run default, and confirm-gate execution.

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

None. Additive out-of-band tool; no new runtime dependency, no security-sensitive surface touched.

## Self-Check: PASSED

- `lib/undo.js` exists, exports `name, inject, apply, filterPlanCommits, revertArgsFor, checkPhaseDependencies, checkPlanDependencies, renderDryRunReport, renderUndoBody`.
- `test/undo.test.mjs` exists and passes (33 tests).
- `gsdUndo` is registered in `lib/_capabilities.js` and `/gsd-undo` in `lib/commands.js`.
- The tool is out-of-band: it does not advance the loop position.
