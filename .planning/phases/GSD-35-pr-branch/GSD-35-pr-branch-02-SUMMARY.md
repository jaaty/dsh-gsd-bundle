---
phase: 35-pr-branch
plan: 02
subsystem: ship / clean-PR-branch wiring
tags: [pr-branch, clean-branch, gap-01, git, ship, wiring]
requires: ["GSD-35-pr-branch-01"]
provides: ["lib/ship.js clean-PR wiring"]
affects: [gsd_ship, test/gates-ship.test.mjs]
tech-stack: [node, esm, node:test, git, gh]
key-files:
  created: []
  modified: ["lib/ship.js", "test/gates-ship.test.mjs"]
decisions:
  - D-01 (exclude only .planning/phases)
  - D-03 (one squash commit on clean branch; completion stays on phase-N)
  - D-05 (phase-<NN>-clean naming; both branches pushed)
  - D-07 (fallback to phase-N branch on no real change)
  - D-08 (clean branch built only after gates pass)
  - D-09 (no_clean_pr param + config resolution)
metrics:
  duration: ~1h
  completed: 2026-08-30
status: complete
---
# Phase 35 Plan 02: pr-branch — Clean-PR Wiring in gsd_ship Summary

Folds the clean-PR branch core (plan 01's `lib/_clean-branch.js`) into `gsd_ship`: adds the `no_clean_pr` parameter with config override (D-09), sequences the clean-branch build after the capability and pre-ship-verify gates and before the push (D-08), pushes both the phase-N source-of-truth branch and the clean branch (D-05), creates the phase PR from the clean branch via an explicit `--head` (or phase-N on the D-07 fallback), and keeps the completion-state commit on phase-N (D-03/R1/OQ-2).

## Changes

- **`lib/ship.js` (modified, 286 lines):**
  - imports `buildCleanBranch`, `resolveCleanPr`, `cleanBranchName` from `./_clean-branch.js` (plan 01 core).
  - `no_clean_pr: { type: "boolean" }` parameter (snake_case, matching sibling params) on gsd_ship (D-09).
  - after `readConfig`, resolves `const cleanPr = resolveCleanPr(cfg, args.no_clean_pr)` and logs `clean-PR branch: on/off`.
  - new **step 5.7** between the pre-ship-verify gate (5.6) and the push (6): when `cleanPr`, calls `buildCleanBranch({ cwd, gitFn: git, phaseNum, phaseName: phase.name, base: defaultBranch })`; `prBranch = info.cleanBranch` when `info.built`, else logs the D-07 `shipping phase branch as-is` path. `prBranch` defaults to `branch` (phase-N). `phaseName` uses the same `phase.name` source as the PR body title (RESOLVED-CONFIRMED in scope).
  - step 6 pushes phase-N (source of truth) then, when `cleanPr && prBranch !== branch`, pushes the clean branch (D-05).
  - step 8 `gh pr create` appends `--head prBranch` so the PR head is the clean branch (or phase-N on fallback).
  - steps 9–10 unchanged: the completion STATE marker commit + push keep targeting `branch` (phase-N), so it never leaks onto the clean branch.
- **`test/gates-ship.test.mjs` (modified, 302 lines):** two new static describe blocks reading `lib/ship.js` source via `node:fs/promises`:
  - D-09 surface: `no_clean_pr` param, `resolveCleanPr(cfg, args.no_clean_pr)`, and the `/_clean-branch.js` import present.
  - D-08/D-07 ordering gate: `5.7 clean-PR branch` sits textually after `pre-ship-verify: pass` and before `6. push branch`; `buildCleanBranch({` precedes the push; `prArgs.push("--head", prBranch)` present; `prBranch = branch` default and the `shipping phase branch as-is` fallback log retained.

## Requirements Addressed

- **GAP-01:** `gsd_ship` now derives a clean review branch carrying only real code + durable cross-phase artefacts (excluding `.planning/phases/`), PRs from it via `--head`, and falls back to shipping the phase-N branch for planning-/doc-only phases.

## Verification

- `node --test test/gates-ship.test.mjs` → **16/16 pass** (15 prior + 1 new D-08/D-07 ordering gate), 0 fail.
- `node -e "import('./lib/ship.js')"` → imports cleanly (no syntax/import errors).
- Full `node --test test/*.test.mjs` → 461 pass, **1 pre-existing failure** unrelated to this plan: `test/repo-hygiene.test.mjs` asserts `.planning/quick/` is untracked, but prior quick-task commit `bf26311` tracked a file under the gitignored dir (documented in plan 01). No regression from this plan's files.
- Grep confirmation of every task acceptance criterion.

## Key Decisions

- D-09: clean-PR ON by default; disabled only by `workflow.clean_pr_branch: false` config or a `no_clean_pr: true` param (param overrides config).
- D-08: the clean branch is built only after both gates pass — sequencing is locked by a static test asserting step ordering.
- D-03/R1/OQ-2: `phaseName: phase.name` is the same source as the PR body title; the completion STATE commit stays on phase-N (never the clean branch).
- D-07: `prBranch = branch` default + `info.reason`/`shipping phase branch as-is` log keeps planning-only phases shippable.

## Known Stubs

None. No TODO/FIXME/placeholder or skipped tests introduced.

## Threat Flags

None. Presentation/merge-layer wiring only; no new I/O surface beyond what gates already scan. The clean-branch build is isolated in a try/catch → `preflightError` so a failure surfaces the real cause.

## Self-Check

- `lib/ship.js` exists (286 lines ≥ 260 required) and `test/gates-ship.test.mjs` exists (302 lines ≥ 20 required) ✓
- Three atomic commits on `phase-35` with scope `(35-02)`:
  - `5037854` feat(35-02): add no_clean_pr param and resolve clean-PR on/off (D-09)
  - `0bfaba7` feat(35-02): wire clean branch into ship — dual push + PR --head, completion stays on phase-N (D-03/D-05/D-07)
  - `d9e9d99` test(35-02): static wiring gate for clean-PR sequencing + D-07 fallback retention
- Grep acceptance checks all pass ✓

**Self-Check: PASSED**
