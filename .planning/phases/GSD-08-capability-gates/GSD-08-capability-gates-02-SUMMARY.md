---
phase: 08-capability-gates
plan: 02
subsystem: lib/gates.js + lib/ship.js — capability-gate orchestration & ship wiring
tags: [gates, gsd-ship, orchestration, integration, git-adapter]
requires: [GSD-08-capability-gates-01]
provides: []
affects: [lib/ship.js (capability gates before push), test/service-tools.test.mjs (gsd_ship still green)]
tech-stack: [node, esm]
key-files:
  created: []
  modified:
    - lib/gates.js
    - lib/ship.js
    - test/gates.test.mjs
decisions:
  - D-05 failing required gate blocks the ship before any push/PR I/O via the existing fail()
  - D-06 skip via config gates.<name>: false or the validated skip_gates tool parameter
  - D-07 every gate's pass/fail/skipped is reported in a "## Gate Report" section on every run
  - D-08 runCapabilityGates takes the FULL config (cfg.gates) and defaults all three gates enabled
  - D-04 fetchGitData scopes to the merge-base diff (--diff-filter=ACM) so only phase changed files are scanned
metrics:
  duration: 2026-08-24
  completed_date: 2026-08-24
status: complete
---

# Phase 08 Plan 02: Capability-Gate Orchestration & Ship Wiring Summary

Wired the Phase-8 capability-gate gatekeeper end-to-end into gsd_ship: added the pure `runCapabilityGates` orchestration seam and the injectable `fetchGitData` git adapter to `lib/gates.js`, then made `gsd_ship` run all three gates between the gh-auth preflight and the push, emit a Gate Report on every run, and block via `fail()` when a required gate fails — delivering CAP-01 and CAP-02.

## What was delivered

- **`runCapabilityGates({cfg, gitData, plans, skipGates})`** (lib/gates.js, pure): resolves gate flags via `resolveGatesConfig`, runs each enabled evaluator over the phase's changed files, and folds findings into one report line per gate — `security: pass|fail — <file>: matched <pattern>`, `broken_windows: pass|fail — <file>: <marker>`, `tdd_audit: pass|fail — <planId>: <reason>`, or `<gate>: skipped`. Returns `{reportLines, blockError}`; `blockError` is a single message naming each failing gate with its first finding detail, set only when an enabled gate failed (D-05/D-06/D-07). Takes the **full `cfg`** (never a pre-extracted gates sub-object) so `cfg.gates.{security,broken_windows,tdd_audit}` disables consistently across evaluator/seam/ship (D-08).
- **`fetchGitData(cwd, gitFn, base)`** (lib/gates.js, integration): injectable git wrapper mirrors ship.js's `git()`. Resolves the base from `args.base` or `origin/HEAD` (defaulting to `main`), computes `git merge-base HEAD <base>`, `git diff --name-only --diff-filter=ACM <mergeBase> HEAD` for changed files, reads each existing file's contents via `node:fs/promises` (skipping unreadable/deleted), and `git log --format=%s <mergeBase>..HEAD` for commit subjects — returning `{changedFiles, contentMap, commitSubjects}`. Empty merge-base (HEAD==base) yields empty changed files/subjects (D-04).
- **`gsd_ship` wiring** (lib/ship.js): imports `runCapabilityGates`/`fetchGitData`; registers a validated `skip_gates` string[] parameter (enum of the three gate names, unknown names rejected); runs the gates in a new step 5.5 between gh-auth (step 5) and the push (step 6), reusing the `plans` from `listPlans` (moved up from step 7) and `defaultBranch`; appends `## Gate Report` lines to the output log on **every** run; calls `fail(blockError)` when a required gate fails — before any push/PR I/O (CAP-01/CAP-02/D-05).

## Commit history (all on `phase-8`, scope `(08-02)`)

1. `feat(08-02): runCapabilityGates gate orchestration` — Task 1 seam + 6 unit tests
2. `feat(08-02): fetchGitData adapter` — Task 2 git adapter + 3 unit tests
3. `feat(08-02): wire capability gates into gsd_ship` — Task 3 ship wiring + static wiring test

## TDD Gate Compliance

Plan 02 is `type: execute` (not `type: tdd`), so the RED→GREEN contract is not required for this plan. All three tasks are `feat(08-02):` commits, each landing green with covering unit/static tests. No task lacks a covering test.

## Known Stubs

None. The only `TODO`/`FIXME`/`XXX` strings in `lib/gates.js` are explanatory comments describing the broken-windows marker regex, not stubs.

## Threat Flags

- The security gate remains pure **path matching** — it never reads or emits secret file contents. `fetchGitData` reads changed-file contents only so the broken-windows gate can scan code for markers; no content is logged or returned to callers beyond the in-memory contentMap consumed by the evaluator.
- `fetchGitData` is wired with the real `git()` (execFileSync) helper in ship.js; the injectable `gitFn` is only used by tests. A git failure on a real run surfaces as a thrown gsd_ship preflight error (fail path), which is the intended blocking behaviour.
- `.planning/REQUIREMENTS.md` and `.planning/STATE.md` carry pre-existing working-tree modifications (CAP checkboxes marked complete by the plan-tracking process) that are outside this plan's task `<files>`; they were intentionally not committed here.

## Self-Check

- `lib/gates.js` (269 lines) exports all nine required symbols (`secretPatterns`, `globToRegex`, `securityGate`, `brokenWindowsGate`, `tddAuditGate`, `resolveGatesConfig`, `runCapabilityGates`, `fetchGitData`, `GATE_NAMES`) — import check returned ALL-EXPORTS-OK.
- `lib/ship.js` (192 lines) imports `runCapabilityGates`/`fetchGitData` (line 15), registers `skip_gates`, runs `fetchGitData` (line 94) before the push (line 99), appends `## Gate Report`, and calls `fail(blockError)`.
- `test/gates.test.mjs` — `node --test` → 34 tests, 34 pass (includes runCapabilityGates, fetchGitData, and the static ship wiring checks).
- `test/service-tools.test.mjs` — 7 tests pass (existing gsd_ship test still green).
- Full `npm test` → 144 tests, 144 pass, 0 fail (no regressions).
- All three `feat(08-02):` commits present on `phase-8`; no stray files committed by my tasks.

## Self-Check: PASSED
