---
phase: 15-ship-robustness
plan: 02
subsystem: ship
tags: [async, child-process, preflight, error-reporting, tests]
dependency graph:
  requires: [GSD-15-ship-robustness-01]
  provides: [automated coverage for async conversion + real-cause reporting]
  affects: [test/ship-async.test.mjs, test/gates.test.mjs]
tech-stack: [node:test, node:assert/strict, node:fs/promises, ESM]
key-files:
  created: [test/ship-async.test.mjs]
  modified: [test/gates.test.mjs]
decisions: [D-01, D-02, D-03, D-05, D-06]
metrics:
  duration: 0
  completed: 2026-08-27
status: complete
---

# Phase 15 Plan 02: ship-robustness Summary

Added automated coverage for the plan-01 async conversion and real-cause preflight reporting: a new test file unit-tests the exported preflightError builder and statically proves ship.js is fully async, and an appended fetchGitData test proves an async gitFn works under await — with all existing tests staying green (D-06).

## Tasks Completed

1. **Task 1** — Created `test/ship-async.test.mjs` (62 lines) with a `preflightError` describe block (prefix + trimmed stderr snippet + `Error.cause`; stdout fallback; no-cause exact message; long-stderr cap) and a `ship.js async conversion (static)` describe block (no `execFileSync`, `promisify(execFile)` present, every `git`/`gh`/`gitOk` call site awaited via a `(?<!await )(?<!function )` negative-lookbehind regex that excludes the function definitions, `await fetchGitData(cwd, git, defaultBranch)` present, `preflightError` exported) (D-01, D-03, D-05).
2. **Task 2** — Appended an `"works with an async gitFn returning Promises"` test to the `fetchGitData` describe block in `test/gates.test.mjs` (now 406 lines). It uses an async fake gitFn returning `Promise.resolve(...)` for the symbolic-ref / merge-base / diff / log calls and asserts `changedFiles` and `commitSubjects`, proving the awaited gitFn path works for async fns while the existing sync fakeGitFn tests stay green (D-02, D-06).

## Verification

- `npm test`: **206/206 pass** (199 prior + 7 new: 6 in ship-async, 1 in gates). service-tools preflight `/gsd_ship preflight failed:/`, gates fetchGitData sync fake + static wiring, and gates-ship static wiring all stay green (D-06).
- `node --test test/ship-async.test.mjs` → 6/6 pass.
- `node --test test/gates.test.mjs` → 37/37 pass.
- `grep -c "preflightError" test/ship-async.test.mjs` = 10 (≥ 4); `grep -c "execFileSync"` = 3 (≥ 1, literal inside the doesNotMatch regex).
- `grep -c "works with an async gitFn returning Promises"` = 1; `grep -c "Promise.resolve"` = 5 (≥ 1).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

No new threat surface. The tests are read-only (read lib sources) or use canned in-memory gitFn fakes; no real git/gh I/O is executed. No new dependencies added.

## Self-Check: PASSED

- `test/ship-async.test.mjs` exists (62 lines ≥ 60) and passes.
- `test/gates.test.mjs` exists (406 lines ≥ 388) and passes.
- Two atomic commits created: `cf39885` (Task 1), `7ea513a` (Task 2).
