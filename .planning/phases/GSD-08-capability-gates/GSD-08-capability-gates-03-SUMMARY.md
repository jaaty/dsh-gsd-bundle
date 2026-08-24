---
phase: 08-capability-gates
plan: 03
subsystem: test/gates-ship.test.mjs + .planning/phases/GSD-08-capability-gates/VALIDATION.md — capability-gate enforcement suite & Nyquist coverage
tags: [gates, gsd-ship, enforcement, validation, nyquist]
requires: [GSD-08-capability-gates-02]
provides: []
affects: []
tech-stack: [node, esm, node:test]
key-files:
  created:
    - test/gates-ship.test.mjs
    - .planning/phases/GSD-08-capability-gates/VALIDATION.md
  modified: []
decisions:
  - D-05 a failing required gate produces a blocking message (blockError) and gsd_ship aborts before any push/PR I/O (proven by the static fail(blockError)-before-push wiring check)
  - D-06 a gate disabled in config or passed in skipGates is reported 'skipped' and does not block
  - D-07 every gate's pass/fail/skipped is reported on every run (proven by the mixed-run test)
  - D-08 the gates config block defaults all three gates enabled; a gate set false reports skipped
  - D-09 the tdd-audit gate enforces type:tdd plans regardless of any global tdd_mode flag (proven with a cfg carrying no tdd_mode)
metrics:
  duration: 2026-08-24
  completed_date: 2026-08-24
status: complete
---

# Phase 08 Plan 03: Capability-Gate Enforcement & Nyquist Coverage Summary

Added the acceptance evidence the verifier uses to mark CAP-01 and CAP-02 met: a dedicated `node --test` enforcement suite (`test/gates-ship.test.mjs`, 222 lines, 14 tests) drives the `runCapabilityGates` seam with deterministic in-memory fake config/gitData/plans to lock in CAP-01 (every gate's pass/fail/skipped is reported) and CAP-02 (a failing required gate blocks the ship before push), plus D-05..D-09, and records the D-01..D-09 → automated-test mapping in `VALIDATION.md` (Nyquist gate).

## What was delivered

- **`test/gates-ship.test.mjs`** — four suites proving the gatekeeper requirements:
  - `CAP-01 gate report` (3 tests): a clean run yields 3 report lines each `^(security|broken_windows|tdd_audit): pass$` with `blockError null`; a mixed run (one pass, one skipped, one fail) still reports every gate regardless of outcome (D-07); a failing security gate still reports the other two gates' real status.
  - `CAP-02 blocking` (4 tests): a failing security / broken-windows / tdd-audit gate each yields a non-null `blockError` naming gate + file + reason (D-05), plus an exact-message assertion.
  - `CAP-02 wiring` (1 static test): reads `lib/ship.js` source and asserts `fail(blockError)` is present AND the gate section (`## Gate Report` + `runCapabilityGates`) and the `if (blockError) fail(blockError)` call all appear textually before the "6. push branch" step — proving a failing required gate aborts before any push/PR I/O (CAP-02, D-05).
  - `skip + tdd enforcement` (6 tests): config-disabled gate reports `skipped` and does not block while other gates still report (D-08/D-06); `skipGates` list reports skipped and does not block (D-06); config-disable + skipGates for different gates both respected; and D-09 — tdd-audit fails a `type: tdd` plan with only a `feat:` commit even when the cfg carries no `tdd_mode`, and passes when `test:` precedes `feat:`.
- **`.planning/phases/GSD-08-capability-gates/VALIDATION.md`** — Nyquist coverage artefact at the phase root (alongside CONTEXT.md/RESEARCH.md): a mapping table from every locked decision D-01..D-09 to the named automated tests in `test/gates.test.mjs` and `test/gates-ship.test.mjs`, the CAP-01/CAP-02 phase-goal truths those tests back, and a task-coverage table (dimension 8) proving no 3-consecutive-task window lacks an automated `node --test` verify, closing with the full-suite gate.

## Commit history (all on `phase-8`, scope `(08-03)`)

1. `feat(08-03): CAP-01 gate report suite` — Task 1 (tracer): CAP-01 gate-report suite
2. `feat(08-03): CAP-02 blocking suite` — Task 2: blocking + no-push static wiring proof
3. `feat(08-03): skip + tdd enforcement suite` — Task 3: D-06/D-08/D-09 skip + tdd enforcement
4. `feat(08-03): VALIDATION.md Nyquist coverage` — Task 4: Nyquist coverage artefact

## TDD Gate Compliance

Plan 03 is `type: execute` (not `type: tdd`), so the RED→GREEN contract is not required for this plan. All four tasks are `feat(08-03):` commits, each landing green with the suite passing at every task boundary. No task lacks a covering automated verify.

## Known Stubs

None. The only `TODO`/`FIXME`/`XXX` strings in `test/gates-ship.test.mjs` are test-data literals used by the broken-windows assertions (e.g. `contentMap: { "src/a.js": "// TODO" }` and an `assert.ok(blockError.includes("TODO"))`), not stubs or placeholders.

## Threat Flags

- The suite drives `runCapabilityGates` with in-memory data only — it never reads or emits secret file contents. The security-gate failure cases pass a *file path* (`a/.env`) through `changedFiles`, never file contents.
- The static `lib/ship.js` wiring check reads source text only; it makes no git/gh/fs side effects. All assertions are read-only.
- No new npm dependencies were introduced; the suite uses only `node:test`, `node:assert/strict`, and `node:fs/promises` (for the static read of `lib/ship.js`).
- `.planning/REQUIREMENTS.md` and `.planning/STATE.md` carry pre-existing working-tree modifications (CAP checkboxes marked complete by the plan-tracking process) that are outside this plan's task `<files>`; they were intentionally not committed here.

## Self-Check

- `test/gates-ship.test.mjs` (222 lines ≥ 120) exists and imports `runCapabilityGates` from `../lib/gates.js`; `node --test test/gates-ship.test.mjs` → 14 tests, 14 pass.
- `.planning/phases/GSD-08-capability-gates/VALIDATION.md` exists at the phase root; `grep -cE 'D-0[1-9]'` → 11; `grep -n "Nyquist"` → heading present (lines 1, 3); `grep -n "node --test test/*.test.mjs"` → full-suite gate recorded (lines 51, 56).
- Full suite `node --test test/*.test.mjs` → 158 tests, 158 pass, 0 fail (no regressions; MOUNT-06).
- All four `feat(08-03):` commits present on `phase-8`; no stray files committed by my tasks.

## Self-Check: PASSED
