# Phase 11: phase-dir-resolution — Validation (Nyquist coverage)

## Nyquist Coverage

`nyquist_validation: true` is set in `.planning/config.json`. Every new behaviour
introduced by this phase (the `phaseDirAndBase` accessor and the resolve-once
refactor of the five artefact accessors) has a named automated test, and no
3-consecutive-task window across the phase's plans lacks an automated verify
command. Every locked decision D-01..D-04 is mapped to the test(s) that prove it
below.

## Decision → automated-test mapping

| Decision | Automated test(s) | File |
|---|---|---|
| **D-01** (add `phaseDirAndBase(cwd, phaseNum)` returning `{ dir, base }`; tools/accessors call it once) | "phaseDirAndBase returns { dir, base } for a roadmap phase (D-01)"; "writeArtifact resolves dir/base exactly once", "readArtifact resolves dir/base exactly once", "hasArtifact resolves dir/base exactly once", "removeArtifact resolves dir/base exactly once" (each asserts `calls === 1`) | `test/state.test.mjs` |
| **D-02** (public accessor signatures stable; private `_artifactFile(dir, base, suffix)` helper unchanged) | Existing round-trip tests "writeArtifact(PLAN-01) maps to <base>-01-PLAN.md, read back round-trips", "writeArtifact(SUMMARY-01) maps to <base>-01-SUMMARY.md", "writeArtifact(CHECKPOINT-01) maps to <base>-01-CHECKPOINT.md and round-trips (D-01)" assert exact basenames unchanged | `test/state.test.mjs` |
| **D-03** (phase-N fallback preserved, not fail-loud) | "phaseDirAndBase preserves the phase-N fallback for an absent phase (D-03)" asserts `base === '09-phase-9'` for an absent phase 9 | `test/state.test.mjs` |
| **D-04** (listPlans resolves dir/base once, not twice) | "listPlans resolves dir/base once plus one per-plan hasArtifact (D-04)" asserts `calls === 3` (1 own resolution + 2 legitimate per-plan `hasArtifact` calls) | `test/state.test.mjs` |

## Phase-goal truths backed by these tests

- **CQ-01** — "Resolve the phase directory and base once per tool invocation and
  pass them down, removing the repeated readRoadmap/readConfig and the duplicated
  base derivation" — backed by the `phaseDirAndBase + resolve-once (CQ-01)` suite
  in `test/state.test.mjs`: each of the five accessors resolves `_phaseDirName`
  exactly once per invocation (spy-counted), and the existing round-trip tests
  prove the artefact filenames and behaviour are unchanged.

## Task coverage (dimension 8)

Every task across the phase's plans is guarded by an automated `node --test`
verify command, so no 3-consecutive-task window lacks coverage.

| Plan | Task | Verify command |
|---|---|---|
| 01 | Task 1 — add `phaseDirAndBase` + refactor `writeArtifact` (tracer) | `node --test test/state.test.mjs` |
| 01 | Task 2 — refactor read/has/removeArtifact to resolve once | `node --test test/state.test.mjs` |
| 01 | Task 3 — refactor `listPlans` + `phaseDir` delegate | `node --test test/state.test.mjs` |
| 01 | Task 4 — spy-based resolve-once + fallback tests, this VALIDATION.md | `node --test test/state.test.mjs` + D-01..D-04 grep + Nyquist grep |

## Full-suite gate

The complete bundle suite for this phase is `node --test test/*.test.mjs` (or
`npm test`). The `test/state.test.mjs` regression run for this plan is green:
**40 tests, 40 pass, 0 fail**, including the new `phaseDirAndBase + resolve-once
(CQ-01)` suite and the pre-existing accessor round-trip tests.
