---
phase: GSD-56-fast-mode
plan: 02
subsystem: quick
tags: [fast-mode, tests, offline, FakeFs, ship-delegation, fail-fast]
dependency_graph:
  requires: [GSD-56-fast-mode-01]
  provides: [offline gsd_fast_mode test coverage]
  affects: [test/service-tools.test.mjs]
tech-stack: [ESM, node:test, FakeFs]
key-files:
  created: []
  modified:
    - test/service-tools.test.mjs
decisions:
  - D-01: gsd_fast_mode tool surface exercised offline (happy path + service ctx.tools.get branch)
  - D-02: refuse-already-Complete guard proven offline
  - D-05: lightweight verify read-back asserted (minimal VERIFICATION, status: passed)
  - D-07: fail-fast on executor failure proven (phase left uncompleted)
  - D-08: executor-discretion SUMMARY shape asserted via FENCED_SUMMARY (status: complete)
metrics:
  duration: "~10 min"
  completed: "2026-09-07"
  tasks: 2
  commits: 1
status: complete
---

# Phase 56 Plan 02: fast-mode offline tests Summary

Proved the fast-mode behaviour offline on FakeFs, mirroring the existing gsd_quick / gsd_quick_batch describe blocks. Covers the happy path (auto-CONTEXT with the fast marker, SUMMARY, minimal VERIFICATION, ship delegation), the refuse-already-Complete guard, and fail-fast on executor failure. The ship path itself is not driven (per the removal-test convention) — the tests assert gsd_fast_mode invokes gsd_ship via a stubbed ctx.tools spy.

## What was built

- **`test/service-tools.test.mjs`** — added two canned `fast` branches to `makeSubagents` (a `fast boom` fail-fast branch and a `fast` happy-path branch that writes `<base>-SUMMARY.md` to FakeFs), a `registerFastTool` helper (keeps the ctx so `c.tools` can be reassigned to a `gsd_ship` spy), and a `describe("gsd_fast_mode", ...)` block with four tests:
  1. **single-pass happy path** — asserts auto-CONTEXT (fast marker), SUMMARY (`status: complete`), minimal VERIFICATION (`status: passed`), and that `gsd_ship` is invoked exactly once with `phase: 1` (array `ctx.tools` shape).
  2. **service `ctx.tools.get` branch** — proves the `findTool` helper's non-array branch (the real DSH runtime shape) also invokes `gsd_ship`.
  3. **refuses an already-Complete phase** — seeds `completePhase`, asserts the tool rejects with `/already Complete/` and the phase stays Complete.
  4. **fail-fast** — a `boomSubagents` service whose `start()` throws; asserts the tool rejects with `/fast subagent failed/` and the phase is NOT marked Complete.

## Tests

- `node --test test/service-tools.test.mjs`: **18 pass, 0 fail** (4 new gsd_fast_mode tests).
- Full suite `npm test`: **1038 pass, 0 fail** (was 1034; +4).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The tests are offline-only on FakeFs; the real git/gh ship path is not driven (per the removal-test convention). No new security-sensitive surface.

## Self-Check: PASSED

- Created file exists: `test/service-tools.test.mjs` modified and passes `node --check` (via the test run).
- Commit exists: `529bfcd` (`test(56-02): add offline gsd_fast_mode tests (happy path, refuse-complete, fail-fast)`).
- `npm test` passes (1038/1038).
