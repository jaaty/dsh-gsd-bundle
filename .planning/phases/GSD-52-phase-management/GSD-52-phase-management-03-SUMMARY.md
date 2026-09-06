---
phase: 52-phase-management
plan: 03
subsystem: phase-management
tags: [test, registration, removal, mount, degr-05, schema]
requires: [GSD-52-phase-management-02]
provides: [test/tools.test.mjs, test/removal.test.mjs]
affects: [test/helpers/mount-harness.mjs, test/mount.test.mjs, test/tools.test.mjs, test/removal.test.mjs]
tech-stack: [node, esm, node:test]
key-files:
  created: []
  modified: [test/helpers/mount-harness.mjs, test/tools.test.mjs, test/removal.test.mjs]
decisions: [D-01, D-03, D-05, D-07, DEGR-05]
metrics:
  duration: 0.3h
  completed: 2026-09-06
  actuals:
    tasks: 3
    commits: 3
status: complete
---

# Phase 52 Plan 03: registration/removal test-surface sync Summary

Brought the mount/removal test surface in sync with the gsd_phase tool, gsdPhaseManagement capability, and /gsd-phase-manage command surfaced by Plan 02: fixed the stale PATCH_ROWS header count, added a gsd_phase schema smoke to tools.test.mjs, and added a dedicated out-of-band retirement case to removal.test.mjs proving DEGR-05.

## What was built

- **`test/helpers/mount-harness.mjs`**: the `gsd-phase-management` PATCH_ROWS row was already added by Plan 02 (26 rows); this plan corrected the stale header comment ("The 24 plugin rows" → "The 26 plugin rows") so the file's own documentation matches its content.
- **`test/tools.test.mjs`**: new `describe("gsd_phase")` block with two tests — (1) the compiled schema exposes the action enum `["add","insert","remove","reorder","edit"]`, the top-level `required: ["action"]` array, and the per-action flag fields (`name`/`goal` string, `requirements` string-array, `at`/`n`/`to` number, `status` enum `["Complete","pending"]`, `yes` boolean) plus `output.schema`; (2) an invalid action value is rejected by the schema before execute runs.
- **`test/removal.test.mjs`**: new `describe("removal: gsd-phase-management (out-of-band)")` block with two tests — (1) mounting the full PATCH_ROWS set minus `phase-management` leaves `gsdPhaseManagement` capability, `gsd_phase` tool, and `/gsd-phase-manage` command all absent while the step capabilities (gsdOrient/gsdDiscuss/gsdPlan/gsdExecute/gsdVerify/gsdShip) remain provided; (2) mounting the full set registers all three surfaces. Proves DEGR-05 for the out-of-band plugin, which the role:"step" retirement matrix does not cover.

## Key decisions applied

- **D-01/DEGR-05:** the out-of-band plugin's retirement reverts its three surfaces (capability + tool + command) with the loop otherwise intact.
- **D-03/D-05/D-07:** the schema smoke pins the action enum and flag fields that the fail-closed CRUD tool exposes.
- **mount.test.mjs counters** (26 plugins / 31 tools / 28 commands / 24 capability keys) were already updated by Plan 02 and verified green — no further change needed.

## Verification

- Task 1: `grep` confirms `gsd-phase-management` in PATCH_ROWS and 26 `id: "gsd-` entries; header comment now reads 26.
- Task 2: `node --test test/tools.test.mjs` → 71 pass / 0 fail (2 new gsd_phase tests).
- Task 3: `node --test test/removal.test.mjs` → 16 pass / 0 fail (2 new out-of-band tests).
- Full suite: `npm test` → 978 pass / 0 fail (baseline 974 + 4 new tests).

## Deviation from plan (documented)

- Plan 02 had already landed the PATCH_ROWS row and all mount.test.mjs counter/EXPECTED-list updates, so Task 1 reduced to the header-comment correction and Task 2's mount.test.mjs portion was already complete. The remaining net-new work (tools.test.mjs schema smoke + removal.test.mjs out-of-band case) was delivered as planned.
- The `registerTool` helper imports `../lib/<pluginFile>.js`; the phase-management plugin module is `phase-management-plugin.js` (not `phase-management.js`, which is the pure domain module with no `apply`), so the smoke uses `registerTool("phase-management-plugin", "gsd_phase")`.
- The compiled schema represents `required` as a top-level array (`required: ["action"]`), not a per-field `required: true`, so the assertion checks `t.parameters.required`.

## Known Stubs

None. No TODO/FIXME/placeholder markers; no skipped tests.

## Threat Flags

None. Test-only changes; no runtime code, no git/fs mutation beyond the existing FakeFs harness, no auth/secrets.

## Self-Check: PASSED

- `test/helpers/mount-harness.mjs` modified (header comment 26).
- `test/tools.test.mjs` modified (gsd_phase describe block, 2 tests).
- `test/removal.test.mjs` modified (out-of-band describe block, 2 tests).
- 3 atomic commits landed on `phase-52`: `e6a2ced` (Task 1), `3cf914a` (Task 2), `25be38a` (Task 3).
- Full test suite green (978 pass / 0 fail); working tree clean.
