---
phase: 11-phase-dir-resolution
plan: 01
subsystem: gsdState service (data tier)
tags: [phase-dir-resolution, refactor, resolve-once, accessors, nyquist]
dependency_graph:
  requires: []
  provides: [phaseDirAndBase accessor, resolve-once accessors, spy tests]
  affects: [lib/state.js, test/state.test.mjs]
tech-stack: [node, esm, node:test]
key-files:
  created: [.planning/phases/GSD-11-phase-dir-resolution/VALIDATION.md]
  modified: [lib/state.js, test/state.test.mjs]
decisions: [D-01, D-02, D-03, D-04]
metrics:
  duration: 0.2h
  completed: 2026-08-27
actuals:
  tasks: 4
  commits: 4
status: complete
---

# Phase 11 Plan 01: phase-dir-resolution — Summary

Added the `phaseDirAndBase(cwd, phaseNum)` accessor to the `GsdState` service and
refactored the five public artefact accessors (`writeArtifact`/`readArtifact`/
`hasArtifact`/`removeArtifact`/`listPlans`) to resolve the phase dir and base
exactly once per invocation, eliminating the repeated `readRoadmap`/`readConfig`
and the duplicated `phaseDir.split('/').pop()` base derivation (CQ-01, D-01/D-04).

## Changes

- **`lib/state.js`** — added `async phaseDirAndBase(cwd, phaseNum)` that calls
  `_phaseDirName` exactly once and returns `{ dir, base }`; refactored the four
  single-artefact accessors and `listPlans` to `const { dir, base } =
  await this.phaseDirAndBase(cwd, phaseNum)`; made `phaseDir` delegate to
  `phaseDirAndBase`. `_artifactFile(dir, base, suffix)` and all public signatures
  are unchanged (D-02). The phase-N fallback in `_phaseDirName` is untouched
  (D-03).
- **`test/state.test.mjs`** — added the `phaseDirAndBase + resolve-once (CQ-01)`
  suite: `{ dir, base }` shape for a roadmap phase, the `09-phase-9` fallback for
  an absent phase, and spy-counted `_phaseDirName` invocations proving each of the
  four single-artefact accessors resolves once (`calls === 1`) and `listPlans`
  resolves once plus the legitimate per-plan `hasArtifact` calls (`calls === 3`).
- **`.planning/phases/GSD-11-phase-dir-resolution/VALIDATION.md`** — Nyquist
  coverage artefact mapping D-01..D-04 to their automated tests.

## Requirements Addressed

- **CQ-01** — resolve the phase dir/base once per invocation; proven by the
  spy-based `calls === 1` / `calls === 3` assertions.

## Verification

- `node --test test/state.test.mjs` → 40 pass / 0 fail.
- `npm test` (full suite) → 181 pass / 0 fail (baseline 174 + 7 new tests).

## Key Decisions

- **D-01** — `phaseDirAndBase` returns `{ dir, base }` from a single `_phaseDirName` call.
- **D-02** — public accessor signatures and the `_artifactFile` helper unchanged.
- **D-03** — phase-N fallback preserved (resolves to `09-phase-9` for absent phase 9).
- **D-04** — `listPlans` resolves dir/base once; per-plan `hasArtifact` calls kept.

## Known Stubs

None. The `TODO-01` matches in `test/state.test.mjs` are pre-existing fixture
requirement IDs, not stubs.

## Threat Flags

None. Pure path-derivation refactor; no new imports, no security-sensitive
surface, no tier violation (all path logic stays in the data tier).

## TDD Gate Compliance

Not a TDD plan (`type: execute`); no RED→GREEN sequence required.

## Self-Check: PASSED

- `lib/state.js` exists and exports `phaseDirAndBase` (grep match).
- `test/state.test.mjs` contains the `phaseDirAndBase + resolve-once (CQ-01)`
  suite with `calls === 1` (×4) and `calls === 3` assertions.
- `VALIDATION.md` exists with a `## Nyquist Coverage` heading.
- 4 atomic commits created (one per task); full suite green.
