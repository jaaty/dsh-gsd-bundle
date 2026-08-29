---
phase: 35-pr-branch
verified: 2026-08-30T00:00:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---
# Phase 35: pr-branch Verification Report

**Goal:** Add a clean-PR-branch path so gsd_ship creates a review branch that filters out .planning/ commits, leaving reviewers with only real code changes (GAP-01).

**Verifier:** gsd-verifier (fresh context, SUMMARY.md claims not trusted — every truth re-checked against the live codebase, the source files, and the passing named tests).

## Goal Achievement → Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| T1 | `.planning/phases/` subtree dropped from review set; durable files (`lib/ship.js`, `.planning/STATE.md`, ROADMAP, REQUIREMENTS, codebase/)** retained** (D-01) | ✓ VERIFIED | `lib/_clean-branch.js:28-53` (`EXCLUDE_AFFIX`/`EXCLUDE_PATHSPEC`/`isExcludedPath`/`filterRealChanges`). Passing named test `filterRealChanges drops .planning/phases entries, keeps durable + code (D-01 exact boundary)` asserts the exact `[lib/ship.js, .planning/STATE.md, .planning/ROADMAP.md, .planning/codebase/STACK.md]` kept set and no surviving `.planning/phases/` path. |
| T2 | Doc-only phase (no change outside `.planning/phases/`) → builder returns `built:false` so ship falls back to phase-N (D-07) | ✓ VERIFIED | `_clean-branch.js:58-60` (`phaseChangedCode`), `157-159` (`return {built:false, reason:"no-real-changes"}`). Passing named test `fallback: all-.planning/phases diff returns built false, issues NO switch (D-07)` asserts no `switch`/`commit` on fallback. |
| T3 | Clean-PR defaults ON; disabled only by explicit `clean_pr_branch:false` config or `no_clean_pr:true` param (D-09) | ✓ VERIFIED | `_clean-branch.js:76-78` (`resolveCleanPr` = `noCleanPr===true ? false : cfg?.workflow?.clean_pr_branch !== false`). Passing named test `resolveCleanPr defaults ON, disables on explicit false or no_clean_pr (D-09)` covers absent-key→ON, null→ON, param-overrides-config. |
| T4 | Rename entry real when either side non-excluded; `git rm` targets only non-excluded oldPath (D-01 boundary) | ✓ VERIFIED | `_clean-branch.js:48-49` (`filterRealChanges` R rule), `174-177` (rm only when `!isExcludedPath(oldPath)`). Passing named tests `rename rule: kept unless BOTH sides are inside .planning/phases` and `rename composition: rm non-excluded oldPath; no rm when oldPath is excluded`. |
| T5 | `gsd_ship` exposes `no_clean_pr` boolean param; clean-PR ON default, param overrides config (D-09) | ✓ VERIFIED | `lib/ship.js:70` param declared; `115` `resolveCleanPr(cfg, args.no_clean_pr)`. Passing static test `ship.js exposes the no_clean_pr param, resolves clean-PR, and imports the clean-branch module (static)`. |
| T6 | Clean branch built after gates (5.5/5.6) pass, before the push; doc-only phase falls back to shipping phase-N (D-08/D-07) | ✓ VERIFIED | `lib/ship.js:151-179` new step `5.7 clean-PR branch` sits textually and logically between `pre-ship-verify: pass` (149) and `6. push branch` (181); `prBranch = branch` default (159), `info.reason → shipping phase branch as-is` (174). Passing static ordering test `(D-08/D-07)` asserts `stepIdx > verifyIdx && stepIdx < pushIdx` and `buildIdx < pushIdx`. |
| T7 | PR created from clean branch when built (`--head`), else phase-N; completion commit always on phase-N (D-03, R1/OQ-2) | ✓ VERIFIED | `ship.js:242` `prArgs.push("--head", prBranch)`; steps 9–10 (`252-277`) commit/push `branch` only (phase-N always checked out after `buildCleanBranch` restores it). Passing static test asserts `prArgs.push("--head", prBranch)` and default `prBranch = branch`. |
| T8 | New projects record `clean_pr_branch:true` in default config (D-09 discoverability) | ✓ VERIFIED | `lib/state.js:196` inside `workflow: { ... }` block, ordered after `commit_docs:true` (195). Passing test `cleanpr-config.test.mjs:19` bounds it inside the workflow object. `test/state.test.mjs` 47/47 green (no default-key set regressed). |
| T9 | README documents the clean-PR branch behaviour | ✓ VERIFIED | `README.md:224-226` `### Clean-PR branch` section: `phase-<N>-clean`, `.planning/phases/` excluded, durable files kept, D-07 fallback, D-09 off-switch. Passing test `cleanpr-config.test.mjs:41`. |
| T10 | Phase emits `GSD-35-pr-branch-VALIDATION.md` (nyquist truth-traceable map) | ✓ VERIFIED | `.planning/phases/GSD-35-pr-branch/GSD-35-pr-branch-VALIDATION.md` exists, 48 lines, per-task table covering P01-T1..T3/P02-T1..T3/P03-T1..T3 with verify commands copied verbatim from the three PLAN.md docs, plus a decision-coverage table and provenance notes. |

## Score

**10/10 must-have truths verified.** 0 behavior-unverified. 0 overrides.

## Deferred Items

None. All deferred ideas in CONTEXT.md (standalone `/gsd-pr-branch`, code-only global `.planning/` exclusion, review-only parallel branch, history rewrite/filter-branch/force-push) are explicitly out of scope per D-01/D-06; none belong to a later-milestone phase.

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|---|---|---|---|
| `lib/_clean-branch.js` | ✓ (188 ln ≥ 110) | ✓ exports `EXCLUDE_PATHSPEC, filterRealChanges, isExcludedPath, phaseChangedCode, cleanBranchName, squashMessage, resolveCleanPr, parseNameStatusZ, buildCleanBranch` | ✓ imported + consumed by `lib/ship.js:19,115,162` |
| `test/pr-branch.test.mjs` | ✓ (302 ln ≥ 120) | ✓ pure unit + scripted-gitFn integration incl. scored-rename parse | ✓ 19/19 pass |
| `lib/ship.js` | ✓ (286 ln ≥ 260) | ✓ exports `name, inject, apply, preflightError` | ✓ registered as gsd-ship tool |
| `test/gates-ship.test.mjs` | ✓ (302 ln ≥ 20) | ✓ static wiring + D-08 ordering gate | ✓ 16/16 pass |
| `lib/state.js` | ✓ (674 ln ≥ 195) | ✓ `clean_pr_branch:true` in workflow; exports `makeStateStore, readState, initProject` | ✓ consumed by resolveCleanPr |
| `test/cleanpr-config.test.mjs` | ✓ | ✓ static state+README assertions | ✓ 2/2 pass |
| `GSD-35-pr-branch-VALIDATION.md` | ✓ (48 ln ≥ 40) | ✓ task/decision truth-traceable map | ✓ nyquist doc |

## Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `_clean-branch.js` | `_shared.js` | `import { zeroPad } from "./_shared.js"` (line 21) | WIRED |
| `_clean-branch.js EXCLUDE_AFFIX` | `EXCLUDE_PATHSPEC` | `\`:(exclude)${EXCLUDE_AFFIX}\`` (line 29) — one source drives git pathspec and JS predicate | WIRED |
| `lib/ship.js` | `_clean-branch.js` | imports `buildCleanBranch, resolveCleanPr, cleanBranchName`; `buildCleanBranch({cwd, gitFn, phaseNum, phaseName, base})` at step 5.7 (162) | WIRED |
| `lib/ship.js` step-8 PR create | `prBranch` | `prArgs.push("--head", prBranch)` (242) → PR head is clean branch (or phase-N on fallback) | WIRED |
| `lib/state.js` `_defaultConfig` workflow | `lib/ship.js` resolveCleanPr | `workflow.clean_pr_branch` written default `true` (196), read in `resolveCleanPr(cfg, args.no_clean_pr)` (115) | WIRED |

## Data-Flow Trace

`gsd_ship` step 5.5 reads `cfg` → `resolveCleanPr(cfg, args.no_clean_pr)` decides clean-PR on/off (D-09). Step 5.6 verify gate. Step 5.7, when on: `buildCleanBranch` captures `originalBranch`, best-effort `fetch`, `merge-base origin/<base> HEAD` (D-04), `rev-parse HEAD` pre-completion snapshot (OQ-2), parses `--name-status -z` via `parseNameStatusZ` (score-aware `startsWith("R")`), filters to real changes (D-01 rename-aware), issues D-07 `{built:false}` fallback or builds: `switch -c phase-<N>-clean origin/<base>` → `checkout <head> -- . :(exclude).planning/phases` (D-02 pathspec) → `rm -r` deletion/R-old non-excluded paths (R2) → ONE `commit` (D-03) → `switch` back to phase-N. Step 6 pushes phase-N (source of truth) + clean branch when built (D-05). Step 8 `gh pr create --head prBranch`. Steps 9–10 completion STATE commit lands only on phase-N.

## Behavioral Spot-Checks

One named test per behavior-dependent truth — all pass on a clean tree:
- `node --test test/pr-branch.test.mjs` → **19/19 pass** (`filterRealChanges`, `phaseChangedCode`, `resolveCleanPr`, `parseNameStatusZ` scored-rename, `buildCleanBranch` built/fallback/deletion-rm/rename-composition/best-effort-fetch).
- `node --test test/gates-ship.test.mjs` → **16/16 pass** (D-09 surface; D-08/D-07 ordering gate).
- `node --test test/cleanpr-config.test.mjs` → **2/2 pass**; `node --test test/state.test.mjs` → **47/47 pass**.
- `node -e "import('./lib/ship.js')"` → imports cleanly (no syntax/import errors).

## Requirements Coverage

- **GAP-01** — delivered. gsd_ship now derives a clean `phase-<N>-clean` review branch excluding `.planning/phases/` while keeping durable cross-phase files + real code, PRs from `--head` on that branch, and falls back to phase-N for planning-/doc-only phases. Verified end-to-end through the T1–T10 truths above.

## Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`STUB`/`TODO` markers in the changed source (`lib/_clean-branch.js`, `lib/ship.js`). No unreferenced debt markers. No stubs/skips in the new tests.

## Human Verification Required

None. Every must-have truth is closed by a passing named behavioral or static test; there is no visual, real-time, or external-service element to this phase (the clean-branch orchestration is covered by scripted-gitFn integration tests plus the static wiring gate — the plan's established seam for ship logic).

## Gaps Summary

No gaps. The phase goal is achieved and every must-have truth, artifact, and key link checks out at the implementation/behaviour level.

**Note (non-blocking, pre-existing):** the full suite is 462 tests / 461 pass / 1 fail — `test/repo-hygiene.test.mjs` "volatile .planning/ files are untracked, durable ones tracked". This failure predates phase 35 (quick-task commit `bf26311` tracked `.planning/quick/…/MAIN-BRANCH-PROTECTION.md` under the gitignored dir, before this phase began). It is unrelated to phase 35's files (which do not touch `.planning/quick/`), is explicitly documented in all three plan SUMMARYs, and does not break any phase-35 must-have truth. Not counted toward this phase's score. The pre-ship-verify gate's temp copy skips this test (no git), so it does not block shipping.
