---
phase: 51-drop-clean-branch
plan: 02
subsystem: lib/ship.js, lib/_clean-branch.js, README.md, test/pr-branch.test.mjs, test/gates-ship.test.mjs, test/ship-async.test.mjs
tags: [removal, clean-branch, ship, gsd_ship]
requires: [GSD-51-drop-clean-branch-01]
provides: [gsd_ship pushes and PRs the phase-NN branch directly, lib/_clean-branch.js deleted, README updated]
affects: [lib/ship.js, README.md, test/gates-ship.test.mjs, test/ship-async.test.mjs]
tech-stack: [ESM, node:test]
key-files:
  created: []
  modified: [lib/ship.js, README.md, test/gates-ship.test.mjs, test/ship-async.test.mjs]
  deleted: [lib/_clean-branch.js, test/pr-branch.test.mjs]
decisions: [D-02, D-05]
metrics:
  duration: 0
  completed: 2026-09-02
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 51 Plan 02: Remove clean-branch feature from gsd_ship Summary

Removed the clean-PR branch feature from `gsd_ship` so it pushes and PRs the phase-NN branch directly (D-02), deleted `lib/_clean-branch.js` (after plan 01 relocated `parseNameStatusZ`), updated the README Clean-PR section, and removed/updated the clean-branch tests (D-05). The full suite passes (729 tests, 0 fail), satisfying SHIP-CLEAN-01 and SHIP-CLEAN-04.

## Tasks

- **Task 1** — Removed every clean-branch touchpoint from `lib/ship.js`: the `_clean-branch.js` import, the `no_clean_pr` param, `resolveCleanPr` + log, the step 5.7 build block, the clean-branch push, the `--head prBranch` arg, and the completion-state cherry-pick. The PR is now created with `["pr", "create", "--title", title, "--body-file", tmp, "--base", defaultBranch]` plus optional `--draft` and NO `--head` (gh pr create defaults the head to the current phase-NN branch). `node --check` passes; exports intact. Commit `3b2ddaf`.
- **Task 2** — Deleted `lib/_clean-branch.js` entirely (parseNameStatusZ was relocated to `lib/_shared.js` in plan 01) and replaced the README "Clean-PR branch" section with a statement that `gsd_ship` pushes and PRs the phase-NN branch directly (one branch per phase). Commit `aeea67d`.
- **Task 3** — Deleted `test/pr-branch.test.mjs`, removed the two GSD-35 clean-PR describe blocks from `test/gates-ship.test.mjs`, and removed the clean-branch propagation test from `test/ship-async.test.mjs`. Full suite `npm test` → 729 pass, 0 fail. Commit `fd26992`.

## Known Stubs

None. No TODO/FIXME/placeholder introduced. The two remaining `_clean-branch` string matches in `lib/_shared.js` and `test/_shared.test.mjs` are intentional provenance comments from plan 01's relocation (documenting where `parseNameStatusZ` came from), not functional references to the deleted module.

## Threat Flags

None. This is a pure removal: no new capability, no new runtime dependency, no security-sensitive surface touched. The only surviving shared function (`parseNameStatusZ`) was relocated to the domain tier in plan 01 and keeps `lib/undo.js` working.

## Self-Check: PASSED

- `lib/ship.js` contains no `cleanBranch`/`cleanPr`/`prBranch`/`no_clean_pr`/`_clean-branch`/`--head`/`buildCleanBranch`/`resolveCleanPr` reference (grep returns nothing); the PR-creation line has `--base` and no `--head`; file is 280 lines (min 40) and exports `name, inject, apply, preflightError, runLearningsOnShip`.
- `lib/_clean-branch.js` is absent (`test -f` non-zero); `README.md` has no `phase-<N>-clean`/`no_clean_pr`/`clean_pr_branch`/`clean-PR` reference.
- `test/pr-branch.test.mjs` is absent; `test/gates-ship.test.mjs` and `test/ship-async.test.mjs` have no clean-branch reference (grep returns nothing).
- `npm test` exits 0 (729 pass, 0 fail).
- Commits `3b2ddaf`, `aeea67d`, `fd26992` exist on branch `phase-51`.
