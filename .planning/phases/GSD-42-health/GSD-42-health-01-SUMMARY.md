---
phase: 42
plan: 01
subsystem: health
tags: [health, diagnostic, out-of-band, capability, integrity, repair]
requires: []
provides:
  - "gsdHealth capability (step health, role out-of-band, NOT_LOOP_ORDERED)"
  - "gsd_health tool + /gsd-health command"
  - "<NN>-HEALTH.md .planning/ integrity report"
  - "non-destructive repair (repair:true, config-only fixes)"
affects:
  - lib/health.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/health.test.mjs
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

# Phase 42 Plan 01: health Summary

Implemented the health diagnostic (opengsd /gsd-health) as an out-of-band tool. The tool inspects .planning/ integrity (phase/plan numbering, orphan SUMMARYs, config validation) and offers non-destructive repair. It is out-of-band — it does not mutate the STATE loop position.

## Tasks

- **Task 1** — Implemented `lib/health.js`: published the `gsdHealth` capability via `ctx.provide('gsdHealth', buildCapability('gsdHealth'))` and registered the `gsd_health` tool via `ctx.tools.register(defineTool({...}))` with inject `['gsdState','tools']`. Exported the pure, unit-testable helpers `checkPhaseDirNaming`, `checkNumbering`, `checkOrphanSummaries`, `checkPlansWithoutSummary`, `checkDiscussionLogWithoutContext`, `checkConfig`, `checkStateRoadmap`, `classifyIssue`. In `apply()`: fail-fast on baseline guards; ran a deterministic .planning/ integrity scan; wrote <NN>-HEALTH.md; offered non-destructive repair (repair:true applies config-only fixes). Out-of-band: does not mutate the STATE loop position.
- **Task 2** — Registered the `gsdHealth` descriptor row in `lib/_capabilities.js` (step `health`, role `out-of-band`, tools `['gsd_health']`, commands `['gsd-health']`, order NOT_LOOP_ORDERED, produces `['HEALTH.md']`, consumes `[]`) and appended it to CAPABILITY_KEYS. Added the `/gsd-health` command to `lib/commands.js`. Created `test/health.test.mjs` covering capability descriptor registration, command pairing, pure helpers, HEALTH.md write, non-destructive repair, and out-of-band no-mutation.

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

None. Additive out-of-band tool; no new runtime dependency, no security-sensitive surface touched.

## Self-Check: PASSED

- `lib/health.js` exists, exports `name, inject, apply, checkPhaseDirNaming, checkNumbering, checkOrphanSummaries, checkPlansWithoutSummary, checkDiscussionLogWithoutContext, checkConfig, checkStateRoadmap, classifyIssue`.
- `test/health.test.mjs` exists and passes (36 tests).
- `gsdHealth` is registered in `lib/_capabilities.js` and `/gsd-health` in `lib/commands.js`.
- The tool is out-of-band: it does not advance the loop position.
