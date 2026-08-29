# Phase 35: pr-branch — VALIDATION (Nyquist truth-traceable map)

Produced by plan 03 to satisfy the repo default `nyquist_validation: true` (`lib/state.js:188`). Each row maps one task's `<verify>` command (copied verbatim from its PLAN.md) to the `<acceptance_criteria>` items it satisfies, so the phase verifier can independently confirm every task's verification target.

## Legend

| Field | Meaning |
|---|---|
| Task ref | `P-<plan>-T<task>` — plan 01, 02, or 03 and the task number within it. |
| verify command | The task's `<verify>` line, copied **verbatim** from the owning PLAN.md. |
| acceptance criteria satisfied | The `<acceptance_criteria>` bullets that the verify command demonstrates. |
| status | `pending` = execution-time row awaiting `gsd_verify`; `documented` = this static doc's own row. |

## Truth-traceable map

| Task ref | verify command (verbatim from PLAN) | acceptance criteria satisfied | status |
|---|---|---|---|
| P01-T1 | `node --test test/pr-branch.test.mjs` | `node --test test/pr-branch.test.mjs` exits 0; grep returns EXCLUDE_AFFIX and EXCLUDE_PATHSPEC defined in lib/_clean-branch.js; test asserts filterRealChanges drops both `.planning/phases/` plain entries AND an R entry whose both sides are excluded; test asserts an R entry with an oldPath/newPath side under lib/ is kept (either-side non-excluded rule) | pending |
| P01-T2 | `node --test test/pr-branch.test.mjs` | `node --test test/pr-branch.test.mjs` exits 0 with the new D-07/D-05/D-09 assertions passing; grep returns `phaseChangedCode`, `cleanBranchName`, `squashMessage`, `resolveCleanPr` as exported functions; resolveCleanPr returns true for an absent clean_pr_branch key (default ON per D-09) | pending |
| P01-T3 | `node --test test/pr-branch.test.mjs` | `node --test test/pr-branch.test.mjs` exits 0 covering the buildCleanBranch behaviors (built, fallback, deletion-rm, rename-composition); grep confirms `parseNameStatusZ` is an exported function detected via `token.startsWith("R")`, and that buildCleanBranch calls `parseNameStatusZ`; parser test feeds the scored rename `R100\0lib/old.js\0lib/renamed.js\0M\0lib/keep.js\0` and asserts exactly the rename pair AND the following `M` record (no desync); grep confirms buildCleanBranch issues `switch -c`, uses EXCLUDE_PATHSPEC in checkout, issues exactly one `commit`, and switches back to originalBranch; rename test asserts `rm -r -- <oldPath>` for non-excluded R oldPath and NO rm when oldPath is under `.planning/phases/`; buildCleanBranch returns built:false + reason "no-real-changes" without branch switches for an all-.planning/phases diff (D-07) | pending |
| P02-T1 | `node --test test/gates-ship.test.mjs` | `node --test test/gates-ship.test.mjs` exits 0; grep confirms `no_clean_pr` parameter and `resolveCleanPr(cfg, args.no_clean_pr)` in lib/ship.js; grep confirms `import ... from "./_clean-branch.js"` in lib/ship.js | pending |
| P02-T2 | `node --test test/gates-ship.test.mjs && node -e "import('./lib/ship.js').then(()=>console.log('ship.js imports OK'))"` | ship.js imports cleanly (no syntax/import errors); grep confirms the `5.7` comment, `buildCleanBranch({`, `prBranch`, and `"--head", prBranch` in lib/ship.js; grep confirms the dual push of prBranch when clean, and that step 10's commit still uses `branch` | pending |
| P02-T3 | `node --test test/gates-ship.test.mjs` | `node --test test/gates-ship.test.mjs` exits 0; ordering assertion holds: 5.7 clean-PR sits between the verify gate and the push step; fallback/assertions (`prBranch = branch` default + `as-is` log) are present in the test | pending |
| P03-T1 | `node --test test/cleanpr-config.test.mjs && node --test test/state.test.mjs` | `node --test test/cleanpr-config.test.mjs` exits 0; `node --test test/state.test.mjs` exits 0 (the only existing file touching `_defaultConfig`; full-suite regression deferred to verify phase); grep confirms `clean_pr_branch: true,` in lib/state.js; lib/state.js is unchanged by any commit in plan 02 (plan 02 touches only lib/ship.js + test/gates-ship.test.mjs) | pending |
| P03-T2 | `node --test test/cleanpr-config.test.mjs` | `node --test test/cleanpr-config.test.mjs` exits 0 (README assertions pass); grep confirms `Clean-PR branch` and `phase-<N>-clean` in README.md | pending |
| P03-T3 | `node --test test/cleanpr-config.test.mjs && grep -c "node --test" .planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md` | `node --test test/cleanpr-config.test.mjs` exits 0; GSD-35-pr-branch-VALIDATION.md exists and is non-empty (min_lines >= 40); grep confirms the file references each task (P01-T1..P01-T3, P02-T1..P02-T3, P03-T1..P03-T2); grep confirms every verify command matches the source plans (>=7 `node --test` verify commands listed, one per task) | pending |

## Decision coverage

The verify commands and acceptance criteria above trace the phase's key decisions to their verification:

| Decision | Verified by |
|---|---|
| D-01 (exclude only `.planning/phases/`) | P01-T1 filter boundary; P01-T3 rename-rm rule; P03-T2 README |
| D-02 (pathspec + JS predicate share one source) | P01-T1 EXCLUDE_AFFIX/EXCLUDE_PATHSPEC grep; P01-T3 EXCLUDE_PATHSPEC checkout assertion |
| D-03 (one squash commit) | P01-T3 one-`commit` assertion |
| D-04 (merge-base against origin/<base>) | P01-T3 buildCleanBranch built/fallback behaviors |
| D-05 (`phase-<N>-clean` naming) | P01-T2 `cleanBranchName` assertions; P03-T2 README naming |
| D-06 (no history rewrite; best-effort fetch) | P01-T3 buildCleanBranch (forward squash only) |
| D-07 (fallback on no real change) | P01-T2 `phaseChangedCode`; P01-T3 built:false fallback; P02-T3 fallback retention |
| D-09 (clean-PR resolution) | P01-T2 `resolveCleanPr` assertions; P02-T1 `no_clean_pr` param; P03-T1 default config key |

## Notes

- **Source-of-truth:** every `verify` command and every `acceptance criteria` bullet above is copied **verbatim** from the three PLAN documents `GSD-35-pr-branch-01/02/03-PLAN.md`. This doc is derived purely from those plans and depends on none of the mutable same-wave outputs (`lib/ship.js`, `test/gates-ship.test.mjs`, `lib/_clean-branch.js` final state).
- There are 8 execution-time tasks across the three plans (P01-T1..T3, P02-T1..T3, P03-T1..T2) plus this doc's own row P03-T3; the `grep -c "node --test"` verify returns ≥ 7 as the acceptance criterion requires.
- Phase verifier (`gsd_verify`) flips the `pending` rows to `passed` after checking requirement / decision / goal coverage and running the suite.
- Requirement: **GAP-01** (reviewers see only real code changes) is the single phase requirement and is covered by the P01 filter tests, the P02 ship wiring, and the P03 config/README surface.
