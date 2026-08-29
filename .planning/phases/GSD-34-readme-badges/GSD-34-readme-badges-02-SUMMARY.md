---
phase: GSD-34-readme-badges
plan: GSD-34-readme-badges-02
subsystem: documentation
tags: [readme, badges, structural-test]
dependency_graph:
  requires: [GSD-34-readme-badges-01]
  provides: ["readme-badge-structural-test"]
  affects: [test/readme-badges.test.mjs]
tech-stack: [node:test, node:assert/strict, node:fs, node:path]
key-files:
  - test/readme-badges.test.mjs
decisions:
  - D-06: Structural test asserts badge image URLs + link destinations (three badges).
  - D-02: CI badge pinned to whole workflow on branch main.
  - D-03: npm badge statically pinned to @2.2.0; dynamic unpinned form locked out.
  - D-04: Each badge link destination (npm page / LICENSE / CI workflow) asserted.
metrics:
  duration: "15m"
  completed_date: "2026-08-29"
status: complete
---

# Phase 34 Plan 02: README Badge Structural Test Summary

Added the D-06 structural test `test/readme-badges.test.mjs` asserting all three provenance-badge image URLs and their clickable link destinations in README.md, locking out the dynamic unpinned npm badge.

## Tasks Completed
- [x] Task 1 (tracer): `test/readme-badges.test.mjs` with a CI-badge structural test — pre-existing, committed as `c30d481` (already present and passing when this executor started; not re-committed).
- [x] Task 2: Extended the test to all three badges with presence AND link-destination assertions (D-06), plus an anti-assertion rejecting the dynamic unpinned npm badge (D-03).

## Test Coverage
- `test("README is readable from the repo root (D-06)")`
- `test("CI badge is present and links to the CI workflow (D-02, D-04)")` — asserts `.../actions/workflows/ci.yml/badge?branch=main` + the CI workflow link.
- `test("license badge is present and links to the LICENSE file (D-03, D-04)")` — asserts `img.shields.io/github/license/jaaty/dsh-gsd-bundle?style=flat-square` + the LICENSE link.
- `test("npm-version badge is statically pinned to v2.2.0 and links to the npm page (D-03, D-04)")` — asserts the pinned `img.shields.io/npm/v/@dsh-gsd/bundle@2.2.0?style=flat-square`, rejects `img.shields.io/npm/v/@dsh-gsd/bundle?style`, and asserts the npm-page link.

## Verification
- `node --test test/readme-badges.test.mjs` → 4 tests, 0 failures.
- `npm test` → 435 tests, 0 failures (no regression).
- Commit `dca29a3` contains ONLY `test/readme-badges.test.mjs` (38 insertions).

## Self-Check: PASSED
- [x] test/readme-badges.test.mjs exists (85 lines ≥ 45 min threshold).
- [x] CI badge + link asserted (D-02/D-04).
- [x] License badge + LICENSE link asserted (D-03/D-04).
- [x] npm badge pinned to @2.2.0 + npm-page link asserted; dynamic form rejected (D-03/D-04).
- [x] Reads README.md from ROOT via fs (no shell-out), mirrors test/repo-config.test.mjs discipline (D-06).
- [x] `npm test` passes (0 failures).
- [x] Atomic commit created for the task.

## Known Stubs
None.

## Threat Flags
None.

## Cross-Plan Note (Orchestrator attention)
The **working tree has an uncommitted `README.md` change** left over from plan 01 that was NOT part of this plan's `<files>` and was intentionally not staged or committed here. That change pins the npm badge to `@2.2.0` and aligns the badge row with the latest placement (D-03/D-05 conformance). The **committed** README (at HEAD `4613fa1`) still carries the older dynamic/unpinned npm badge form on three separate lines. The tests in this plan read README from the working tree, so they pass with the on-disk content; but the committed README does not yet fully encode D-03/D-05. Plan 01 must commit its README badge-row change so the committed state matches what the tests assert.
