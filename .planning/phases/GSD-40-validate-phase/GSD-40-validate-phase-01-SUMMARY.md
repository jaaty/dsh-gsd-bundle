---
phase: 40
plan: 01
subsystem: validate-phase
tags: [validate-phase, validation, loop-step, capability, subagent, soft-gate]
requires: []
provides:
  - "gsdValidatePhase capability (step validate, role step, order 45)"
  - "gsd_validate_phase tool + /gsd-validate-phase command"
  - "<NN>-VALIDATION.md requirement→test coverage report"
  - "gsd-nyquist-auditor test-writer subagent with atomic test commits"
affects:
  - lib/validate-phase.js
  - lib/_capabilities.js
  - lib/commands.js
  - test/validate-phase.test.mjs
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

# Phase 40 Plan 01: validate-phase Summary

Implemented the retro validate-phase audit (opengsd /gsd-validate-phase) as a full loop-step plugin. The tool maps a completed phase's executed work to tests and manual evidence, classifies each requirement COVERED/PARTIAL/MISSING/Manual-Only, writes <NN>-VALIDATION.md with a status frontmatter, and produces tests to close validation gaps for a completed phase (via the gsd-nyquist-auditor test-writer subagent with atomic commits). It is a soft gate — never blocks verify or ship.

## Tasks

- **Task 1** — Implemented `lib/validate-phase.js`: published the `gsdValidatePhase` capability via `ctx.provide('gsdValidatePhase', buildCapability('gsdValidatePhase'))` and registered the `gsd_validate_phase` tool via `ctx.tools.register(defineTool({...}))` with inject `['gsdState','tools','subagents']` (the auditor subagent spawns). Exported the pure, unit-testable helpers `isTestPath`, `validateTestPaths`, `detectTestInfra`, `classifyGaps`, `markManualOnly`, `classifyStatus`, `assembleValidationTable`, `VALIDATION_AUDITOR_SCHEMA`. In `apply()`: fail-fast on baseline guards + phase-not-executed guard; acquired the per-phase feature branch; ran a deterministic requirement→test coverage scan; wrote <NN>-VALIDATION.md via `writeArtifact` with status frontmatter; advanced STATE to 'validate'; spawned the gsd-nyquist-auditor test-writer subagent to write missing tests and commit them atomically. Soft gate: never blocks verify or ship.
- **Task 2** — Registered the `gsdValidatePhase` descriptor row in `lib/_capabilities.js` (step `validate`, role `step`, tools `['gsd_validate_phase']`, commands `['gsd-validate-phase']`, order 45, produces `['VALIDATION.md']`, consumes `['SUMMARY.md','VERIFICATION.md']`) and appended it to CAPABILITY_KEYS. Added the `/gsd-validate-phase` command to `lib/commands.js`. Created `test/validate-phase.test.mjs` covering capability descriptor registration, command pairing, pure helpers, VALIDATION.md write, auditor dispatch, and soft-gate no-block.

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

None. Additive step plugin; no new runtime dependency, no security-sensitive surface touched.

## Self-Check: PASSED

- `lib/validate-phase.js` exists, exports `name, inject, apply, isTestPath, validateTestPaths, detectTestInfra, classifyGaps, markManualOnly, classifyStatus, assembleValidationTable, VALIDATION_AUDITOR_SCHEMA`.
- `test/validate-phase.test.mjs` exists and passes (38 tests).
- `gsdValidatePhase` is registered in `lib/_capabilities.js` and `/gsd-validate-phase` in `lib/commands.js`.
- The tool is a soft gate: it never blocks verify or ship.
