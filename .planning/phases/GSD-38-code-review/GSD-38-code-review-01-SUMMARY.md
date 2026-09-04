---
phase: 38
plan: 01
subsystem: code-review
tags: [code-review, review, loop-step, capability, subagent, soft-gate]
requires: []
provides:
  - "gsdCodeReview capability (step code-review, role step, order 35)"
  - "gsd_code_review tool + /gsd-code-review command"
  - "REVIEW.md severity-classified findings (BLOCKER/WARNING/INFO)"
  - "REVIEW-FIX.md via --fix companion with per-fix atomic commits"
affects:
  - lib/code-review.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/code-review.test.mjs
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

# Phase 38 Plan 01: code-review Summary

Implemented the code-review pass (opengsd /gsd-code-review) as a full loop-step plugin. The tool reviews a phase's changed source files into REVIEW.md with severity-classified findings (BLOCKER/WARNING/INFO), and a --fix companion applies findings with per-fix atomic commits into REVIEW-FIX.md. It is a soft gate — advisory, never blocks verify or ship.

## Tasks

- **Task 1** — Implemented `lib/code-review.js`: published the `gsdCodeReview` capability via `ctx.provide('gsdCodeReview', buildCapability('gsdCodeReview'))` and registered the `gsd_code_review` tool via `ctx.tools.register(defineTool({...}))` with inject `['gsdState','tools','subagents']` (the reviewer subagent spawns). Exported the pure, unit-testable helpers `CODE_REVIEWER_SCHEMA`, `resolveFindings`, `severityCounts`, `resolveFixFlags`, `filterBySeverity`, `hasBlockingFindings`, `CODE_FIXER_SCHEMA`, `validateFiles`. In `apply()`: fail-fast on baseline guards; acquired the per-phase feature branch; spawned a fresh-context reviewer subagent (`spawnSubagent`) that reviews the phase's changed source files and returns structured findings; wrote REVIEW.md via `writeArtifact`; the --fix companion applies findings with per-fix atomic commits into REVIEW-FIX.md. Soft gate: never blocks verify or ship.
- **Task 2** — Registered the `gsdCodeReview` descriptor row in `lib/_capabilities.js` (step `code-review`, role `step`, tools `['gsd_code_review']`, commands `['gsd-code-review']`, order 35, produces `['REVIEW.md','REVIEW-FIX.md']`, consumes `['SUMMARY.md']`) and appended it to CAPABILITY_KEYS. Added the `/gsd-code-review` command to `lib/commands.js`. Created `test/code-review.test.mjs` covering capability descriptor registration, command pairing, pure helpers, REVIEW.md write, --fix atomic commits, and soft-gate no-block.

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

None. Additive step plugin; no new runtime dependency, no security-sensitive surface touched.

## Self-Check: PASSED

- `lib/code-review.js` exists, exports `name, inject, apply, CODE_REVIEWER_SCHEMA, resolveFindings, severityCounts, resolveFixFlags, filterBySeverity, hasBlockingFindings, CODE_FIXER_SCHEMA, validateFiles`.
- `test/code-review.test.mjs` exists and passes (50 tests).
- `gsdCodeReview` is registered in `lib/_capabilities.js` and `/gsd-code-review` in `lib/commands.js`.
- The tool is a soft gate: it never blocks verify or ship.
