---
phase: 51-drop-clean-branch
verified: 2026-09-02
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 51: drop-clean-branch Verification Report

## Goal Achievement

**Goal:** Remove the clean-PR branch feature so `gsd_ship` pushes and PRs the phase-NN branch directly, leaving one branch per phase.

**Requirements:** SHIP-CLEAN-01, SHIP-CLEAN-04 (SHIP-CLEAN-02/03 are internal sub-goals from CONTEXT specifics).

This is a pure removal. Verification was performed by direct inspection of the codebase (grep/glob/read), not by trusting SUMMARY.md claims. All static assertions and the full runtime suite confirm the removal is complete and the surviving `parseNameStatusZ` relocation keeps `lib/undo.js` working.

## Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | `lib/undo.js` still parses name-status diffs correctly after `parseNameStatusZ` moves to `lib/_shared.js` (undo dry-run report keeps working) | ✓ VERIFIED | `parseNameStatusZ` defined at `lib/_shared.js:409`; `lib/undo.js:35` imports it from `./_shared.js`; `test/undo.test.mjs:25` imports from `../lib/_shared.js`; `test/undo.test.mjs` passes in the full suite. |
| 2 | `lib/_clean-branch.js` is NOT deleted by plan 01 (deleted by plan 02 after relocation) | ✓ VERIFIED | Plan-internal sequencing constraint honored: plan 01 committed only the relocation; `lib/_clean-branch.js` is absent now (deleted by plan 02 commit `aeea67d`). |
| 3 | `gsd_ship` pushes and PRs the phase-NN branch directly; no phase-NN-clean branch is built, pushed, or cherry-picked (SHIP-CLEAN-01) | ✓ VERIFIED | `grep` for `cleanBranch\|cleanPr\|prBranch\|no_clean_pr\|_clean-branch\|--head\|buildCleanBranch\|resolveCleanPr` in `lib/ship.js` returns nothing. |
| 4 | `lib/_clean-branch.js` no longer exists and no `lib/` or `test/` file references it | ✓ VERIFIED | `test -f lib/_clean-branch.js` → absent. Only two intentional provenance comments remain (`lib/_shared.js:400`, `test/_shared.test.mjs:397`), not functional references. |
| 5 | The completion-state commit lands on phase-NN and is pushed there only; the PR is created with `--base` and no `--head` (D-02) | ✓ VERIFIED | `lib/ship.js:228` `["pr", "create", "--title", title, "--body-file", tmp, "--base", defaultBranch]` (no `--head`); completion-state push at `lib/ship.js:256` `git push origin branch` with no cherry-pick. |
| 6 | `workflow.clean_pr_branch` is removed from `_defaultConfig` in `lib/state.js` (D-04) | ✓ VERIFIED | `grep clean_pr_branch lib/state.js` → nothing. |
| 7 | `lib/health.js` needs no direct edit: W-05/R-02 derive from `Object.keys(defaultConfig.workflow)` | ✓ VERIFIED | `grep clean_pr_branch lib/health.js` → nothing; health behaviour is derived from the state.js config schema (single source of truth). |
| 8 | `test/health.test.mjs` contains no `clean_pr_branch` string and its assertions are reworked to `ai_integration_phase` | ✓ VERIFIED | `grep clean_pr_branch test/health.test.mjs` → nothing; `test/health.test.mjs` passes in the full suite. |

## Score

**8/8 must-haves verified.** No truth failed, no artifact missing/stub, no key link unwired, no blocker anti-pattern, no human-verification item.

## Deferred Items

- Defensive cleanup of stale remote `phase-NN-clean` branches — out of scope (user deletes manually).
- Any change to phase-branch acquisition at gsd_discuss (phase 17) — unchanged.
- Changing GitHub squash-merge behaviour — unchanged.

None of these belong to a later milestone phase; all are explicitly deferred by CONTEXT.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Verdict |
|---|---|---|---|---|
| `lib/_shared.js` | ✓ | 548 lines (min 40); exports `parseNameStatusZ` | ✓ imported by `lib/undo.js` and `test/undo.test.mjs` | PASS |
| `test/_shared.test.mjs` | ✓ | has `parseNameStatusZ` describe block (lines 397-426) covering normal/rename/trailing-NUL/truncated/empty | ✓ imports from `../lib/_shared.js` | PASS |
| `lib/ship.js` | ✓ | 280 lines (min 40); exports `name, inject, apply, preflightError, runLearningsOnShip` | ✓ no clean-branch code; PR create with `--base` no `--head` | PASS |
| `README.md` | ✓ | 249 lines (min 40); no `phase-<N>-clean`/`no_clean_pr`/`clean_pr_branch`/`clean-PR` reference | ✓ doc-consistency | PASS |
| `lib/state.js` | ✓ | no `clean_pr_branch` in `_defaultConfig` | ✓ health derives from it | PASS |
| `test/health.test.mjs` | ✓ | no `clean_pr_branch` string; assertions reworked to `ai_integration_phase` | ✓ passes | PASS |

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `lib/undo.js` | `lib/_shared.js` | `import { parseNameStatusZ } from "./_shared.js"` (line 35) | WIRED |
| `test/undo.test.mjs` | `lib/_shared.js` | `import { parseNameStatusZ } from "../lib/_shared.js"` (line 25) | WIRED |
| `lib/ship.js` | `gh pr create` | `["pr", "create", "--title", ..., "--base", defaultBranch]` with no `--head` (line 228) | WIRED |
| `lib/state.js` | `lib/health.js` | health W-05/R-02 derive from `Object.keys(defaultConfig.workflow)`; state.js removal is the single source of truth | WIRED |

## Data-Flow Trace

- **parseNameStatusZ relocation:** `lib/_clean-branch.js` (deleted) → `lib/_shared.js:409` → consumed by `lib/undo.js:328` (dry-run report) and `test/_shared.test.mjs` (direct unit coverage). No dangling import; `grep _clean-branch lib/undo.js test/undo.test.mjs` returns nothing.
- **gsd_ship PR flow:** phase-NN branch pushed at step 6 (`lib/ship.js:173`); PR created with `--base` and no `--head` (line 228, head defaults to current phase-NN branch); completion-state commit lands on phase-NN and is pushed there only (line 256). No clean-branch build, push, or cherry-pick anywhere.

## Behavioral Spot-Checks

- **Full suite (`npm test`):** 729 tests, 0 fail, 0 skipped. This is the single named behavioral check covering the behavior-dependent truths (undo dry-run via `test/undo.test.mjs`, health config via `test/health.test.mjs`, ship wiring via `test/gates-ship.test.mjs`/`test/ship-async.test.mjs`, relocated function via `test/_shared.test.mjs`). PASS.

## Requirements Coverage

| REQ-ID | Delivered | Evidence |
|---|---|---|
| SHIP-CLEAN-01 | ✓ | `gsd_ship` no longer builds/pushes a clean branch; PR head is phase-NN directly (no clean-branch code in `lib/ship.js`; PR create with `--base` no `--head`). |
| SHIP-CLEAN-04 | ✓ | `test/pr-branch.test.mjs` and `test/cleanpr-config.test.mjs` deleted; `test/gates-ship.test.mjs`/`test/ship-async.test.mjs`/`test/health.test.mjs` updated; full suite passes (729/0). |
| SHIP-CLEAN-02 (internal) | ✓ | `no_clean_pr` param and `workflow.clean_pr_branch` config removed; health repair stops requiring the key. |
| SHIP-CLEAN-03 (internal) | ✓ | `parseNameStatusZ` relocated to `lib/_shared.js`; `lib/undo.js` keeps working. |

## Anti-Patterns Found

None. The only `TBD`/`FIXME`/`XXX`/`TODO` matches in the changed files are test-fixture data strings (e.g. `"TODO-01"` requirement IDs, `"// TODO"` content in `test/gates-ship.test.mjs` fixtures), not unreferenced debt markers in implementation code. No BLOCKER debt marker.

## Human Verification Required

None. This is a pure removal with no visual, real-time, or external component; every truth is programmatically verifiable via static grep and the passing runtime suite.

## Gaps Summary

No gaps found. The phase goal is fully achieved: the clean-PR branch feature is removed, `gsd_ship` pushes and PRs the phase-NN branch directly, the shared `parseNameStatusZ` survives in `lib/_shared.js` keeping `lib/undo.js` working, and the full test suite passes (729/0).
