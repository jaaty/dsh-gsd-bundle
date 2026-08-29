---
phase: 29-pre-ship-verify
plan: 02
subsystem: ship
tags: [ship, preflight, verify, edge-cases, npm, gate]
dependency-graph:
  requires: [GSD-29-pre-ship-verify-01]
  provides: [edge-case test coverage for the pre-ship-verify gate]
  affects: [test/preflight-verify.test.mjs]
tech-stack: [node, esm, node:test, node:fs/promises]
key-files:
  created: []
  modified:
    - test/preflight-verify.test.mjs
decisions:
  - D-06: offline/network failure and npm-not-found fail the ship with the real cause, never silently skipped
  - D-06: temp dir removed in a finally even on failure
  - D-02: npm test only runs after npm ci succeeds (ordering guarded)
metrics:
  duration: 2026-08-29
  completed: true
status: complete
actuals:
  tasks: 2
  commits: 1
---

# Phase 29 Plan 02: pre-ship-verify edge-case hardening Summary

Hardened the pre-ship-verify gate against its D-06 edge cases and confirmed the whole suite still passes on a clean checkout. Plan 01 delivered the vertical slice; this plan proves the failure paths (offline/network failure, temp-dir leak on failure) are deterministic and that the new test file is picked up by the `test/*.test.mjs` glob.

## What was built

- **`test/preflight-verify.test.mjs`** — extended (not rewritten) with a new `pre-ship-verify edge cases (D-06)` describe block, all driven by an injected fake `execFile` so no real npm or network is touched:
  - **Offline/network failure during `npm ci`** — a fake that rejects on the `npm ci` call with `{ stderr: "npm error code ENOTFOUND registry.npmjs.org" }` → asserts `{ status: "fail", step: "npm ci" }` and that `output` includes `ENOTFOUND` (the real cause is surfaced, never silently skipped).
  - **Temp-dir cleanup on failure** — creates a real temp dir via `makeTempDir()`, runs `runPreflightVerify` with a rejecting fake inside a `try/finally` whose `finally` calls `cleanupTempDir`, then asserts the dir no longer exists — proving the ship.js finally-block contract (D-06) is honored even on a failing run.
  - The npm-not-found (ENOENT) and npm-test-failure-ordering edge cases were already covered by plan 01's tests (lines 63-85); they remain green and were not duplicated.

## Verification

- `node --test test/preflight-verify.test.mjs` — 9/9 pass (was 7, +2 new edge-case tests).
- Full `npm test` — 415/415 pass, 0 fail (was 413, +2). The output confirms `test/preflight-verify.test.mjs` is picked up by the `test/*.test.mjs` glob (runPreflightVerify, pre-ship-verify edge cases, copyTree, cleanupTempDir, ship.js wiring all ran).
- No existing test regressed from the `skip_verify` parameter or the new gate wiring.

## Commits

- `50ee823` test(29-02): add pre-ship-verify edge-case tests

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests introduced.

## Threat Flags

None. The added tests only exercise the pure `runPreflightVerify` seam with a fake `execFile` and a self-cleaning real temp dir; no real npm, no network, no secrets, no new dependencies.

## Self-Check: PASSED

- `test/preflight-verify.test.mjs` exists, contains the new edge-case describe block, and passes 9/9.
- `grep -c "ENOTFOUND"` → 2, `grep -c "ENOENT"` → 3, `grep -c "cleanupTempDir"` → 8 (all acceptance-criteria greps exit 0).
- Full `npm test` passes 415/415 with the new test file included.
- One atomic commit exists on branch `phase-29`.
