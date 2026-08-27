---
phase: 15-ship-robustness
plan: 01
subsystem: ship
tags: [async, child-process, preflight, error-reporting]
dependency graph:
  requires: []
  provides: [async git/gh helpers, real-cause preflight reporting]
  affects: [lib/ship.js, lib/gates.js]
tech-stack: [node:child_process, node:util, ESM]
key-files:
  created: []
  modified: [lib/ship.js, lib/gates.js]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06]
metrics:
  duration: 0
  completed: 2026-08-27
status: complete
---

# Phase 15 Plan 01: ship-robustness Summary

Converted lib/ship.js's git/gh calls from execFileSync to async via util.promisify(execFile), made fetchGitData await its injectable gitFn, and added real-cause preflight failure reporting (stderr/stdout snippet + Error.cause) while preserving the 'gsd_ship preflight failed:' prefix and all static-wiring source markers.

## Tasks Completed

1. **Task 1** — Converted `run`/`git`/`gitOk`/`gh` to async via `promisify(execFile)` and awaited every git/gh/gitOk call site in ship.js (D-01). The defaultBranch call site is parenthesized before `.replace` to avoid the `await (gitOk(...).replace(...))` precedence bug. No `execFileSync` remains.
2. **Task 2** — Made `fetchGitData` await all four injectable `gitFn` calls in gates.js (D-02). The sync fake gitFn in tests still works under `await` (D-06).
3. **Task 3** — Added exported `preflightError(msg, cause?)` builder and `fail(msg, cause?)` helper; wired real-cause reporting at the four git/gh failure sites (gh auth, git push, gh pr create, completion commit/push) (D-03, D-05). All static markers (`fail(blockError)`, `if (blockError) fail(blockError)`, `6. push branch`, `## Gate Report`, full-cfg `runCapabilityGates({`) preserved verbatim (D-06).

## Verification

- `npm test`: **199/199 pass** (service-tools preflight `/gsd_ship preflight failed:/`, gates fetchGitData + static wiring, gates-ship static wiring all green).
- `grep -c "execFileSync" lib/ship.js` → 0; `promisify(execFile)` present.
- No bare `git(`/`gh(`/`gitOk(` call sites (all awaited); `await fetchGitData(cwd, git, defaultBranch)` present; parenthesized defaultBranch call present.
- `await gitFn(` count in gates.js = 4; no bare `gitFn(` call sites.
- `export { name, inject, apply, preflightError }` present; `fail(blockError)` and `if (blockError) fail(blockError)` markers intact; `gsd_ship preflight failed:` present; `cause` count ≥ 4.

## Known Stubs

None. The `TODO|FIXME|XXX` matches in gates.js are documentation comments describing the marker-regex gate, not actual stubs.

## Threat Flags

No new threat surface. git/gh exec remains in the integration tier; the real-cause message construction (`preflightError`) is pure and testable. No new dependencies added (Node builtins only).

## Self-Check: PASSED

- `lib/ship.js` exists (208 lines ≥ 190) and exports `preflightError`.
- `lib/gates.js` exists (251 lines ≥ 250) and exports `fetchGitData`.
- Three atomic commits created: `b5f67e5`, `9a49d11`, `0fd13a3`.
