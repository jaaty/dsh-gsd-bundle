---
phase: 35-pr-branch
plan: 01
subsystem: ship / clean-PR-branch core
tags: [pr-branch, clean-branch, gap-01, git, ship]
requires: []
provides: ["lib/_clean-branch.js", "test/pr-branch.test.mjs"]
affects: [gsd_ship (plan 02 wiring)]
tech-stack: [node, esm, node:test, git, gh]
key-files:
  created: ["lib/_clean-branch.js", "test/pr-branch.test.mjs"]
  modified: []
decisions:
  - D-01 (exclude only .planning/phases)
  - D-02 (pathspec + JS predicate share one source)
  - D-03 (one squash commit on clean branch)
  - D-04 (merge-base against origin/<base>)
  - D-05 (phase-<NN>-clean naming)
  - D-06 (no history rewrite; best-effort fetch)
  - D-07 (fallback to phase-N branch on no real change)
  - D-09 (clean-PR resolution)
metrics:
  duration: ~1h
  completed: 2026-08-30
status: complete
---
# Phase 35 Plan 01: pr-branch — Clean-Branch Core Summary

Standalone clean-PR-branch core for GAP-01: a new `lib/_clean-branch.js` module containing the pure domain functions (exclusion filter with rename handling, D-07 fallback predicate, D-05 naming, squash template, D-09 config resolution) plus the integration `buildCleanBranch` that forward-applies the filtered real-code diff as ONE squash commit onto `origin/<base>` with no history rewrite and explicit rename (R) composition.

## Changes

- **`lib/_clean-branch.js` (new, 188 lines):**
  - `EXCLUDE_AFFIX`/`EXCLUDE_PATHSPEC` — single-source exclusion boundary (D-02/CQ-02).
  - `isExcludedPath` — membership test for the per-phase planning subtree.
  - `filterRealChanges` — rename-aware filter keeping durable files + real code, dropping `.planning/phases/` (D-01); an R entry is kept when EITHER side is non-excluded.
  - `phaseChangedCode` — D-07 fallback predicate (reuses the filter).
  - `cleanBranchName` (zero-padded), `squashMessage` — D-05/discretion templates.
  - `resolveCleanPr` — D-09 config resolution (default ON; explicit `false` or `no_clean_pr` disables).
  - `parseNameStatusZ` — NUL-separated `--name-status -z` parser, score-aware (`startsWith("R")` so real-git `R100` renames parse correctly without desyncing).
  - `buildCleanBranch` — integration: best-effort fetch, merge-base vs `origin/<base>`, pre-completion `HEAD` snapshot, D-07 fallback signal, `switch -c` → filtered `checkout` with pathspec → `rm -r` for deletions/rename-old-paths → ONE squash commit → restore phase-N branch.
- **`test/pr-branch.test.mjs` (new, 302 lines):** pure unit tests (filter boundary incl. rename, fallback, naming, squash message, config resolution, parser incl. scored-rename) and scripted-`gitFn` integration tests for `buildCleanBranch` (built, fallback/D-07, deletion-rm, rename composition, best-effort fetch).

## Requirements Addressed

- **GAP-01:** reviewers see only real code — `.planning/phases/` is excluded while durable files (`lib/ship.js`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/codebase/**`) are retained; the D-07 fallback signal lets ship.js keep shipping planning-only phases.

## Verification

- `node --test test/pr-branch.test.mjs` → **19/19 pass**, 0 fail.
- `node --test test/*.test.mjs` → all pass except ONE pre-existing failure unrelated to this plan: `test/repo-hygiene.test.mjs` asserts `.planning/quick/` is untracked, but commit `bf26311` (a prior quick-task) committed `.planning/quick/20260829-main-branch-production/MAIN-BRANCH-PROTECTION.md` under the gitignored dir. Not touched by this plan's files.
- Grep confirmation of every task acceptance criterion: exports present, `parseNameStatusZ` uses `startsWith("R")` and is called by `buildCleanBranch`, `switch -c`/`EXCLUDE_PATHSPEC` checkout/`commit -m`/`switch originalBranch` present, `zeroPad` imported from `_shared`.

## Key Decisions

- D-02: the `:(exclude).planning/phases/` pathspec and the JS predicate both derive from `EXCLUDE_AFFIX`, so they cannot drift.
- D-04: merge-base targets `origin/<base>` (not the local base ref) with a best-effort quiet fetch, keeping the clean branch correct under advanced/multi-window bases.
- D-03/D-06: the clean branch is a forward application of the filtered diff as exactly one squash commit — no history rewrite / filter-branch / force-push.
- D-01 rename rule: `filterRealChanges` keeps an R entry if either side is non-excluded; `buildCleanBranch` issues `rm -r -- oldPath` only when oldPath is non-excluded (the excluded old side falls out of the `:(exclude)` checkout).

## Known Stubs

None. No TODO/FIXME/placeholder or skipped tests introduced.

## Threat Flags

None. This is a presentation/merge-layer; no credential handling or path-traversal surface beyond what the existing gates scan.

## Self-Check

- `lib/_clean-branch.js` exists (188 lines ≥ 110 required) ✓
- `test/pr-branch.test.mjs` exists (302 lines ≥ 120 required) ✓
- Three atomic commits on `phase-35` with scope `(35-01)`:
  - `9ca56b6` feat(35-01): exclusion filter core (D-01/D-02)
  - `95d14e2` feat(35-01): fallback/name/squash/config decision functions (D-07/D-05/D-09)
  - `87a5493` feat(35-01): parseNameStatusZ + buildCleanBranch (D-03/D-04/D-06)
- `grep` acceptance checks all pass ✓

**Self-Check: PASSED**
