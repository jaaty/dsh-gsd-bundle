---
phase: 29-pre-ship-verify
plan: 01
subsystem: ship
tags: [ship, preflight, verify, npm, gate]
dependency-graph:
  requires: []
  provides: [preflight-verify module, ship.js wiring, test coverage]
  affects: [lib/ship.js, lib/preflight-verify.js, test/preflight-verify.test.mjs]
tech-stack: [node, esm, node:test, node:fs/promises, node:child_process]
key-files:
  created:
    - lib/preflight-verify.js
    - test/preflight-verify.test.mjs
  modified:
    - lib/ship.js
decisions:
  - D-01: temp copy via fs.cp excluding node_modules/.git
  - D-02: gate runs after capability gates, before push
  - D-03: skip_verify boolean flag skips the gate only
  - D-04: failure via preflightError with real cause
  - D-05: new lib/preflight-verify.js module + test file
  - D-06: fail on any failure; temp dir removed in finally; flag-only skip
metrics:
  duration: 2026-08-29
  completed: true
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 29 Plan 01: pre-ship-verify Summary

Delivered the full vertical slice of the pre-ship-verify gate: a pure `lib/preflight-verify.js` module (`runPreflightVerify` + `copyTree` + `makeTempDir` + `cleanupTempDir`), its wiring into the `gsd_ship` execute body between the capability gates and the push, and a test file proving the module and the wiring — making SHIP-01 real and verified.

## What was built

- **`lib/preflight-verify.js`** — pure ESM module using only node builtins. `runPreflightVerify(tempDir, execFile?)` runs `npm ci` then `npm test` in order via an injectable `execFile` (default `promisify(execFile)`), returning `{ status, step, output }` and never throwing. `copyTree` uses `fs.cp` with a filter excluding `node_modules`/`.git` subtrees (D-01). `makeTempDir`/`cleanupTempDir` wrap `fs.mkdtemp`/`fs.rm`.
- **`lib/ship.js`** — imports the module, adds the `skip_verify` boolean tool parameter (D-03), and runs the gate between the capability-gate block and the push step (D-02). On failure it calls the existing `fail(...)` helper (which throws `preflightError` with the real cause, D-04); the temp dir is always removed in a `finally` (D-06). `skip_verify` skips the gate only, independent of `skip_gates`.
- **`test/preflight-verify.test.mjs`** — 7 tests: `runPreflightVerify` branches with an injected fake `execFile` (pass, npm ci fail, npm test fail, ENOENT), `copyTree` exclusion against a real temp dir, `cleanupTempDir`, and static ship.js wiring assertions (gate before push, `skip_verify` param, module import).

## Verification

- `node --test test/preflight-verify.test.mjs` — 7/7 pass.
- `node --test test/ship-async.test.mjs` — 6/6 pass (preflightError + async static assertions intact).
- `node --test test/gates-ship.test.mjs` — 14/14 pass (existing capability-gate wiring intact).
- Full `npm test` — 413/413 pass, 0 fail.

## Commits

- `e727830` feat(29-01): add pure pre-ship-verify module
- `5e0c02f` feat(29-01): wire pre-ship-verify gate into gsd_ship
- `50112ad` test(29-01): cover pre-ship-verify module and ship.js wiring

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests introduced.

## Threat Flags

None. The gate is a pre-push check; a failing gate aborts before any push/PR I/O. No new external dependencies, no secrets, no network beyond the intended `npm ci` registry access (which fails the ship with the real cause per D-06).

## Self-Check: PASSED

- `lib/preflight-verify.js` exists and exports all four functions (verified via import).
- `lib/ship.js` imports the module, exposes `skip_verify`, and runs the gate before the push marker.
- `test/preflight-verify.test.mjs` exists and passes.
- Three atomic commits exist on branch `phase-29`.
