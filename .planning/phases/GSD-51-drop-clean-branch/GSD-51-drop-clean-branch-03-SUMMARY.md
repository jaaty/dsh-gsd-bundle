---
phase: 51-drop-clean-branch
plan: 03
subsystem: config + health
tags: [removal, config, health, tests]
requires: []
provides: [SHIP-CLEAN-02, SHIP-CLEAN-04]
affects: [lib/state.js, lib/health.js, test/health.test.mjs]
tech-stack: [node, node:test]
key-files:
  created: []
  modified: [lib/state.js, test/health.test.mjs]
  deleted: [test/cleanpr-config.test.mjs]
decisions: [D-04, D-05]
metrics:
  duration: 2026-09-01
  completed: 2026-09-01
status: complete
actuals:
  tasks: 3
  commits: 2
---

# Phase 51 Plan 03: Remove clean_pr_branch config default and rework health tests

Removed the `workflow.clean_pr_branch` default from `lib/state.js` `_defaultConfig` and reworked the health tests that asserted it as a required/repairable key, then deleted the cleanpr-config test.

## What was done

- **Task 1** — Removed `clean_pr_branch: true,` from the `workflow` block of `_defaultConfig` in `lib/state.js`. In `test/health.test.mjs`: dropped `clean_pr_branch: true` from the local `defaultConfig()` helper (kept in sync with state.js, R-2); reworked the W-05 missing-key test and the R-02 repair test to the still-required `ai_integration_phase` key (merging the now-redundant `ai_integration_phase`-specific tests into them); updated the e2e comment and the `writeConfigMissingWorkflowKeys` helper comment to drop the `clean_pr_branch` mention; removed the `parsed.workflow.clean_pr_branch` repair assertion. `test/health.test.mjs` now contains no `clean_pr_branch` string.
- **Task 2** — Deleted `test/cleanpr-config.test.mjs` (asserted the removed `clean_pr_branch: true` default and the README `phase-<N>-clean` mention).
- **Task 3** — Confirmed the full suite passes (`npm test`: 752 tests, 0 fail).

## Notes

- `lib/health.js` needed no direct edit: its W-05 `requiredWorkflow` and R-02 `repairSet` derive from `Object.keys(defaultConfig.workflow)`, so the `state.js` removal is the single source of truth (R-1). Verified at `lib/health.js:212`.
- No new runtime dependencies introduced (pure removal, D-01).

## Known Stubs

None.

## Threat Flags

None. Pure config-default removal; no new capability, no I/O surface, no security-sensitive change.

## Self-Check: PASSED

- `grep -n "clean_pr_branch" lib/state.js` → no matches.
- `grep -n "clean_pr_branch" test/health.test.mjs` → no matches.
- `node --test test/health.test.mjs` → 36 pass, 0 fail.
- `test -f test/cleanpr-config.test.mjs` → absent.
- `npm test` → 752 pass, 0 fail.
- Commits present: `a9afe95` (Task 1), `179fbe4` (Task 2).
