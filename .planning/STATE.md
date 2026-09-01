---
gsd_state_version: 1
milestone: v3.0.0
milestone_name: upstream-parity
status: idle
active_phase: null
next_action: null
next_phases: [45]
progress:
  total_phases: 50
  completed_phases: 45
  total_plans: 3
  completed_plans: 119
  percent: 90
current_phase: 45
current_phase_name: graphify
current_plan: 2
last_updated: "2026-09-01T05:26:02.059Z"
state_head: null
last_activity: 2026-09-01
stopped_at: "Phase 45 shipped — PR #52"
paused_at: null
---
# GSD STATE

## Current Position

_No active phase._

## Accumulated Context

### Recent Decisions
- Phase 1: CONTEXT.md sealed — 5 decisions
- Phase 1: planned — 1 plan(s) across 1 wave(s).
- Phase 1 shipped — PR #1 (https://github.com/jaaty/dsh-gsd-bundle/pull/1)
- Phase 2: CONTEXT.md sealed — 4 decisions
- Phase 2: planned — 2 plan(s) across 1 wave(s); checker issues remain after 3 iterations (manual review).
- Phase 2: plan 02 executed — service-tools execute smokes (MOUNT-04); 7 tests green.
- Phase 2 shipped — PR #2 (https://github.com/jaaty/dsh-gsd-bundle/pull/2)
- Phase 3: CONTEXT.md sealed — 7 decisions
- Phase 3: planned — 2 plan(s) across 2 wave(s).
- Phase 3: plan 01 executed — relocated-headless live-boot proof (MOUNT-05 slice): compose 12 rows + agent-loop override, live gsd_status boot exit 0; SUMMARY.md written.
- Phase 3 shipped — PR #4 (https://github.com/jaaty/dsh-gsd-bundle/pull/4)
- Phase 4: CONTEXT.md sealed — 7 decisions
- Phase 4: planned — 2 plan(s) across 2 wave(s).
- Phase 4 shipped — PR #5 (https://github.com/jaaty/dsh-gsd-bundle/pull/5)
- Phase 5: CONTEXT.md sealed — 7 decisions
- Phase 5: planned — 2 plan(s) across 2 wave(s).
- Phase 6: plan 01 executed — prefix-tolerant plan dep resolution (DUR-05); 93 tests green.
- Phase 6: plan 02 executed — gsd_quick TASK.md write routed through ctx.fs via writeQuickRecord (DUR-06); 94 tests green.
- Phase 6 shipped — PR #7 (https://github.com/jaaty/dsh-gsd-bundle/pull/7)
- Phase 7: CONTEXT.md sealed — 7 decisions
- Phase 7: planned — 2 plan(s) across 2 wave(s).
- Phase 7 shipped — PR #8 (https://github.com/jaaty/dsh-gsd-bundle/pull/8)
- Phase 8: CONTEXT.md sealed — 9 decisions
- Phase 8: planned — 3 plan(s) across 3 wave(s).
- Phase 8 shipped — PR #10 (https://github.com/jaaty/dsh-gsd-bundle/pull/10)
- Phase 9: CONTEXT.md sealed — 5 decisions
- Phase 9: planned — 2 plan(s) across 2 wave(s).
- Phase 9: plan 01 executed — real background-job runtime (launchJob/reconcileJobs + detached job-wrapper); 163 tests green.
- Phase 9 shipped — PR #11 (https://github.com/jaaty/dsh-gsd-bundle/pull/11)
- Phase 10: CONTEXT.md sealed — 5 decisions
- Phase 10: planned — 2 plan(s) across 2 wave(s).
- quick 2026-08-25-readme-docs-release: Update the project's README and documentation to (1) fix drift from all the changes made across the 9 shipped phases, and (2) prepare the project for public release and listing in the dsh plugin ecosystem.
- Phase 10 shipped — PR #13 (https://github.com/jaaty/dsh-gsd-bundle/pull/13)
- Phase 11: CONTEXT.md sealed — 4 decisions
- Phase 11: planned — 2 plan(s) across 2 wave(s).
- Phase 11 shipped — PR #14 (https://github.com/jaaty/dsh-gsd-bundle/pull/14)
- Phase 12: CONTEXT.md sealed — 4 decisions
- Phase 12: planned — 2 plan(s) across 1 wave(s).
- Phase 12 shipped — PR #15 (https://github.com/jaaty/dsh-gsd-bundle/pull/15)
- Phase 13: CONTEXT.md sealed — 5 decisions
- Phase 13: planned — 2 plan(s) across 2 wave(s); checker issues remain after 3 iterations (manual review).
- Phase 13: plan 01 executed — GATE_DISPATCH dispatcher map + D-04 fail-fast guard; 190 tests green.
- Phase 13: plan 02 executed — structured planScope derivation (plan.phase/plan.plan, zero-padded) + listPlans phase field; 190 tests green.
- Phase 13 shipped — PR #16 (https://github.com/jaaty/dsh-gsd-bundle/pull/16)
- Phase 14: CONTEXT.md sealed — 5 decisions
- Phase 14: planned — 2 plan(s) across 2 wave(s).
- Phase 14: plan 01 executed — extracted checkpoint prepare/process helpers into lib/_checkpoint.js + unit tests; 199 tests green.
- Phase 14: plan 02 executed — wired prepareCheckpoint/processCheckpoint into gsd_execute + reused idx.runnable in the wave loop; 199 tests green.
- Phase 14 shipped — PR #17 (https://github.com/jaaty/dsh-gsd-bundle/pull/17)
- Phase 15: CONTEXT.md sealed — 6 decisions
- Phase 15: planned — 2 plan(s) across 2 wave(s); checker issues remain after 3 iterations (manual review).
- Phase 15: plan 01 executed — async git/gh helpers (promisify(execFile)) + real-cause preflight reporting; 199 tests green.
- Phase 15: plan 02 executed — preflightError + ship.js async static tests, async-gitFn fetchGitData test; 206 tests green.
- Phase 15 shipped — PR #18 (https://github.com/jaaty/dsh-gsd-bundle/pull/18)
- Phase 16: CONTEXT.md sealed — 8 decisions
- Phase 16: planned — 2 plan(s) across 2 wave(s).
- Phase 16 shipped — PR #19 (https://github.com/jaaty/dsh-gsd-bundle/pull/19)
- Phase 17: CONTEXT.md sealed — 10 decisions
- Phase 17: planned — 3 plan(s) across 2 wave(s).
- Phase 17 shipped — PR #20 (https://github.com/jaaty/dsh-gsd-bundle/pull/20)
- Phase 18: CONTEXT.md sealed — 9 decisions
- Phase 18: planned — 3 plan(s) across 3 wave(s).
- Phase 18 shipped — PR #21 (https://github.com/jaaty/dsh-gsd-bundle/pull/21)
- Phase 19: CONTEXT.md sealed — 8 decisions
- Phase 19: planned — 4 plan(s) across 4 wave(s).
- Phase 19 shipped — PR #22 (https://github.com/jaaty/dsh-gsd-bundle/pull/22)
- Phase 20: CONTEXT.md sealed — 11 decisions
- Phase 20: planned — 3 plan(s) across 2 wave(s).
- Phase 20: plan 03 executed — UI-SPEC / codebase-map / quick auto-commit via shared commitArtifacts seam (MW-03, D-09..D-12); 335 tests green.
- Phase 20 shipped — PR #23 (https://github.com/jaaty/dsh-gsd-bundle/pull/23)
- Milestone v1.7 released — v1.7.0 (all 20 phases shipped) — 20/20 phases shipped, PRs #1..#23, merged to main.
- quick 2026-08-28-milestone-release-v1-7-0: Release milestone job-intel-multiwindow as v1.7.0. Orient against .planning/STATE.md first: the milestone is fully COMPLETE (20/20 phases shipped, PRs #1..#23, all merged to main), branch is main, working tree is clean, and there are currently no git tags. Do the full milestone release end to end and commit + tag atomically.
- All git/gh commands must use explicit argument arrays; never interpolate a model- or user-supplied value into a shell string (release notes file path can be a fixed .planning temp path). Do not push force, do not alter protected refs, do not run git clean/reset --hard.
- If gh CLI is unavailable or unauthenticated, create the tag and push it, and report the gh release step as a warning with the real cause — do not silently skip or fake it.
- The working tree must be left clean on main with the v1.7.0 tag pointing at the release commit.
- Phase 21: CONTEXT.md sealed — 12 decisions
- Phase 21: planned — 4 plan(s) across 3 wave(s).
- Phase 21: plan 01 executed — capability descriptor module (D-05/D-03/D-04/D-10/D-11); 349 tests green.
- Phase 21: plan 04 executed — mount fake-ctx ctx.inject + 10-capability asserts (DEGR-01), absent-capability command test (DEGR-03), tools smoke regression fix; 350 tests green.
- Phase 21 shipped — PR #24 (https://github.com/jaaty/dsh-gsd-bundle/pull/24)
- Phase 22: CONTEXT.md sealed — 11 decisions
- Phase 22: planned — 4 plan(s) across 3 wave(s).
- Phase 22 shipped — PR #25 (https://github.com/jaaty/dsh-gsd-bundle/pull/25)
- Phase 23: CONTEXT.md sealed — 8 decisions
- Phase 23: planned — 2 plan(s) across 2 wave(s).
- Phase 23: plan 01 executed — extracted shared fake-ctx mount harness to test/helpers/mount-harness.mjs (D-07) + optional subagents factory (OQ-1); mount suite refactored to import it; 373 tests green.
- Phase 23: plan 02 executed — per-plugin removal suite test/removal.test.mjs (DEGR-05): data-driven matrix over the 5 step plugins, six effects-reverted surfaces, functional-depth smoke of remaining offline-runnable step tools, execute/ship present+registered+schema-sound; 378 tests green.
- Phase 23 shipped — PR #26 (https://github.com/jaaty/dsh-gsd-bundle/pull/26)
- Phase 24: CONTEXT.md sealed — 6 decisions
- Phase 24: planned — 3 plan(s) across 2 wave(s).
- Phase 24 shipped — PR #27 (https://github.com/jaaty/dsh-gsd-bundle/pull/27)
- Milestone v2.0 released — v2.0.0 (all 24 phases shipped, PRs #1..#27, merged to main).
- quick 2026-08-29-2026-08-29-milestone-release-v2-0-0: Release milestone graceful-removal as v2.0.0. Orient against .planning/STATE.md first: the milestone is fully COMPLETE (24/24 phases shipped, PRs #1..#27, all merged to main), branch is main, working tree is clean, and the existing tag is v1.7.0. Do the full milestone release end to end and commit + tag atomically.
- All git/gh commands must use explicit argument arrays; never interpolate a model- or user-supplied value into a shell string (release notes file path can be a fixed .planning temp path). Do not push force, do not alter protected refs, do not run git clean/reset --hard.
- If gh CLI is unavailable or unauthenticated, create the tag and push it, and report the gh release step as a warning with the real cause — do not silently skip or fake it.
- The working tree must be left clean on main with the v2.0.0 tag pointing at the release commit.
- Phase 25: CONTEXT.md sealed — 5 decisions
- Phase 25: planned — 1 plan(s) across 1 wave(s).
- Phase 25 shipped — PR #28 (https://github.com/jaaty/dsh-gsd-bundle/pull/28)
- Phase 26: CONTEXT.md sealed — 9 decisions
- Phase 26: planned — 3 plan(s) across 2 wave(s).
- Phase 26: planned — 3 plan(s) across 2 wave(s).
- Phase 26: planned — 3 plan(s) across 2 wave(s).
- Phase 26: planned — 3 plan(s) across 2 wave(s).
- Phase 26: planned — 3 plan(s) across 2 wave(s).
- Phase 26: planned — 3 plan(s) across 2 wave(s).
- Phase 26 shipped — PR #29 (https://github.com/jaaty/dsh-gsd-bundle/pull/29)
- Phase 27: CONTEXT.md sealed — 8 decisions
- Phase 27: planned — 3 plan(s) across 2 wave(s).
- Phase 27 shipped — PR #30 (https://github.com/jaaty/dsh-gsd-bundle/pull/30)
- Phase 28: CONTEXT.md sealed — 8 decisions
- Phase 28: planned — 1 plan(s) across 1 wave(s).
- Phase 28 shipped — PR #31 (https://github.com/jaaty/dsh-gsd-bundle/pull/31)
- quick 2026-08-29-milestone-release-v2-1-0: Release milestone public-release-readiness as v2.1.0. Orient against .planning/STATE.md first: the milestone is fully COMPLETE (29/29 phases shipped, PRs #1..#32, all merged to main — PR #32 for phase 29 was merged 2026-08-29T06:01:10Z, merge commit 856b625d7e44407109365a9c01a45b55b94804d6). Branch is main, working tree is clean, and the existing tags are v1.7.0 and v2.0.0 (there is no v2.1.0 tag yet). gh CLI is authenticated as account jaaty.
- All git/gh commands must use explicit argument arrays; never interpolate a model- or user-supplied value into a shell string (the release-notes file path can be a fixed .planning temp path). Do not push force, do not alter protected refs, do not run git clean/reset --hard.
- If gh CLI is unavailable or unauthenticated, create the tag and push it, and report the gh release step as a warning with the real cause — do not silently skip or fake it.
- The working tree must be left clean on main with the v2.1.0 tag pointing at the release commit.
- quick 2026-08-29-readme-v2-1-0-update: Update README.md to reflect the v2.1.0 milestone release. The README is stale: it still presents milestone `graceful-removal` v2.0.0 as the latest release and never mentions the v2.1.0 `public-release-readiness` milestone or the new pre-ship-verify gate. The milestone `public-release-readiness` (v2.1.0) is now complete and released (all 29 phases shipped, PRs #1..#32, merged to main; tag v2.1.0). Use CHANGELOG.md's `[2.1.0]` entry as the source of truth for the milestone content.
- Phase 29: CONTEXT.md sealed — 6 decisions
- Phase 29: planned — 2 plan(s) across 2 wave(s).
- Phase 29 shipped — PR #32 (https://github.com/jaaty/dsh-gsd-bundle/pull/32)
- Phase 30: CONTEXT.md sealed — 10 decisions
- Phase 30: planned — 2 plan(s) across 1 wave(s).
- Phase 30: plan 01 executed — publishable-package metadata: version bumped to 2.2.0 (manifest + lockfile in sync), six metadata fields added (repository/homepage/bugs/author/engines/keywords), files whitelist expanded to ship README-linked docs (DISTRIBUTION/CONTRIBUTING/CODE_OF_CONDUCT/CHANGELOG). 3 commits, SUMMARY.md written.
- Phase 30: planned — 3 plan(s) across 1 wave(s).
- Phase 30: plan 03 executed — README gap fix: reworded the v2.1 release-note bullet to drop the broken `gsd-core-reference.md` filename; npm test green 406/406 closing the regression-seal gap. 1 commit, SUMMARY.md written.
- Phase 30 shipped — PR #33 (https://github.com/jaaty/dsh-gsd-bundle/pull/33)
- Phase 31: CONTEXT.md sealed — 9 decisions
- Phase 31: planned — 1 plan(s) across 1 wave(s).
- Phase 31 shipped — PR #34 (https://github.com/jaaty/dsh-gsd-bundle/pull/34)
- Phase 32: CONTEXT.md sealed — 6 decisions
- Phase 32: planned — 2 plan(s) across 2 wave(s).
- Phase 32: plan 01 executed — SECURITY.md policy (D-01/D-02) + package.json files whitelist + README link (D-05); 3 commits, npm test green 415/415, SUMMARY.md written.
- Phase 32: plan 02 executed — GitHub issue forms (bug_report.yml, feature_request.yml, config.yml) + PULL_REQUEST_TEMPLATE.md (D-03/D-04) + structural test test/security-policy.test.mjs (D-06); 3 commits, npm test green 426/426, SUMMARY.md written.
- quick 2026-08-29-gitignore-npm-cache: Add `.npm-cache/` to the repo's `.gitignore` so the npm cache directory created by phase 31's `--cache` override (D-01) is never tracked. The `.gitignore` currently ignores `node_modules/` and the volatile `.planning/` files. Append a line `.npm-cache/` (with a short comment noting it is the alternate npm cache used by the publish/install `--cache` override) so `git status` is clean and gsd_ship preflight passes. Do not delete the directory from disk; only ignore it. Commit atomically.
- quick 2026-08-29-repo-hygiene-git-skip: Fix test/repo-hygiene.test.mjs so the git-dependent test "volatile .planning/ files are untracked, durable ones tracked (D-06/D-07)" skips gracefully when not running inside a git repository, instead of failing. Root cause: the gsd_ship pre-ship-verify gate (phase 29, lib/preflight-verify.js copyTree) copies the working tree into a temp dir EXCLUDING the .git directory, then runs `npm test`. The repo-hygiene test shells out to `git ls-files .planning/` (via the gitLsFiles helper using execFileSync with cwd: ROOT), which throws "not a git repository" in the temp copy, failing the gate. The tracking-state assertions are only meaningful in the real repo, so the test should skip when git is unavailable. Change the test signature to accept the node:test context `(t)`, wrap the gitLsFiles call in a try/catch, and on failure call `t.skip("not a git repository (pre-ship-verify temp copy)")` and return, leaving the assertions untouched for the normal git-repo case. Do not change any other test or file. Verify with `npm test` (must pass 426/426 in the real repo) and confirm the pre-ship-verify temp-copy path no longer fails on this test. Commit atomically.
- Phase 32 shipped — PR #35 (https://github.com/jaaty/dsh-gsd-bundle/pull/35)
- Phase 33: CONTEXT.md sealed — 5 decisions
- Phase 33: planned — 1 plan(s) across 1 wave(s).
- Phase 33: plan 01 executed — repo homepage set to npm page (D-01), seven topics set (D-02), repo made public + private vuln reporting enabled (D-03/OQ-1), structural test test/repo-config.test.mjs (5 tests); npm test green 431/431, SUMMARY.md written.
- Phase 33 shipped — PR #36 (https://github.com/jaaty/dsh-gsd-bundle/pull/36)
- Phase 34: CONTEXT.md sealed — 5 decisions
- Phase 34: planned — 1 plan(s) across 1 wave(s).
- Phase 34: CONTEXT.md sealed — 7 decisions
- Phase 34: planned — 2 plan(s) across 2 wave(s).
- Phase 34: planned — 1 plan(s) across 1 wave(s).
- Phase 34 shipped — PR #37 (https://github.com/jaaty/dsh-gsd-bundle/pull/37)
- quick 2026-08-29-milestone-release-v2-2-0: Release the `public-launch` milestone as v2.2.0. Orient against `.planning/STATE.md` first: the milestone is fully COMPLETE (34/34 phases shipped, PRs #1..#37 — PR #37 for phase 34 (readme-badges) is merged to main; the last merge commit on main is ab33631a083d51014bd061bf54c7d083d45f7d18). Branch is main, working tree is clean, and the existing tags are v1.7.0, v2.0.0, and v2.1.0 (there is NO v2.2.0 tag yet). package.json version is 2.2.0 and CHANGELOG.md has a verified `## [2.2.0] - 2026-08-29` entry. gh CLI is authenticated as account jaaty.
- quick 2026-08-29-main-branch-protection: Record the main branch protection setup as a quick-task audit entry under .planning/quick/<YYYYMMDD>-main-branch-protection/. This is a documentation-only record; no repo code changes are needed.
- Phase 35: CONTEXT.md sealed — 10 decisions
- Phase 35: planned — 3 plan(s) across 2 wave(s).
- Phase 35 shipped — PR #38 (https://github.com/jaaty/dsh-gsd-bundle/pull/38)
- Phase 36: CONTEXT.md sealed — 12 decisions
- Phase 36: planned — 3 plan(s) across 3 wave(s).
- quick 2026-08-29-fix-tdd-audit-commit-ordering: Fix a latent bug in the ship pipeline's tdd_audit gate that blocks gsd_ship for any plan with interleaved test/feat commits.
- Phase 36 shipped — PR #39 (https://github.com/jaaty/dsh-gsd-bundle/pull/39)
- Phase 37: CONTEXT.md sealed — 14 decisions
- Phase 37: planned — 3 plan(s) across 3 wave(s).
- Phase 38: CONTEXT.md sealed — 14 decisions
- Phase 38: planned — 2 plan(s) across 2 wave(s).
- Phase 39: CONTEXT.md sealed — 12 decisions
- Phase 39: planned — 2 plan(s) across 2 wave(s).
- Phase 40: CONTEXT.md sealed — 12 decisions
- Phase 40: planned — 2 plan(s) across 2 wave(s).
- Phase 41: CONTEXT.md sealed — 12 decisions
- Phase 41: planned — 1 plan(s) across 1 wave(s); checker issues remain after 3 iterations (manual review).
- quick 2026-08-30-pr-body-key-decisions-phase-scoped: Fix a bug in how gsd_ship assembles the "Key Decisions" section of the PR description, so it lists only the decisions made within the shipped phase's PR instead of the project-wide accumulated decision ledger.
- No new runtime dependencies; use only node builtins.
- Keep all existing tests green: run `npm test` and confirm the FULL suite passes (baseline is ~450+ tests including test/gap-analysis.test.mjs and test/ship*.test.mjs). The existing ship test suites do not assert the Key-Decisions content, so this change must not break them.
- Preserve the security discipline: no shell interpolation anywhere; the change is pure JS parsing + a readArtifact call.
- Do NOT touch any other code. Do NOT remove the `s.readArtifact` CONTEXT read from other tools.
- quick 2026-08-30-harden-jobs-unload-cancel-test: Harden the flaky `unload-cancel` tests in test/jobs.test.mjs so the project CI no longer intermittently fails.
- This is a test-only change to test/jobs.test.mjs. Do not modify lib/jobs.js, lib/state.js, or any other source file.
- Preserve the existing assertions' meaning: the test must still prove cancelAll aborts the running job / kills the child and that the persisted manifest ends with reason 'cancelled'. waitForStatus simply waits for the async cancellation to settle.
- Keep the existing helper imports and the existing `waitForStatus` helper (do not add new helpers). Use `assert` from the file's existing import.
- Verify: run `node --test test/jobs.test.mjs` at least 5 times consecutively and confirm it passes 100% (17/17 each time), then run the FULL suite `npm test` and confirm all tests pass (baseline 660 tests).
- Commit atomically with a clear message describing the flake hardening.
- Phase 42: CONTEXT.md sealed — 10 decisions
- Phase 42: planned — 3 plan(s) across 3 wave(s).
- Phase 43: CONTEXT.md sealed — 8 decisions
- Phase 43: planned — 2 plan(s) across 2 wave(s).
- Phase 43: COVERAGE.md written (coverage 67%, gaps: D-01, D-02, D-05)
- Phase 37 shipped — PR #40 (https://github.com/jaaty/dsh-gsd-bundle/pull/40)
- Phase 38 shipped — PR #41 (https://github.com/jaaty/dsh-gsd-bundle/pull/41)
- Phase 39 shipped — PR #42 (https://github.com/jaaty/dsh-gsd-bundle/pull/42)
- Phase 40 shipped — PR #43 (https://github.com/jaaty/dsh-gsd-bundle/pull/43)
- Phase 41 shipped — PR #44 (https://github.com/jaaty/dsh-gsd-bundle/pull/44)
- Phase 42 shipped — PR #47 (https://github.com/jaaty/dsh-gsd-bundle/pull/47)
- Phase 43 shipped — PR #48 (https://github.com/jaaty/dsh-gsd-bundle/pull/48)
- Phase 44: CONTEXT.md sealed — 14 decisions
- Phase 44: planned — 3 plan(s) across 2 wave(s).
- Phase 44 shipped — PR #51 (https://github.com/jaaty/dsh-gsd-bundle/pull/51)
- Phase 45: CONTEXT.md sealed — 13 decisions
- Phase 45: planned — 3 plan(s) across 2 wave(s).
- Phase 45: COVERAGE.md written (coverage 100%, gaps: none)
- Phase 45 shipped — PR #52 (https://github.com/jaaty/dsh-gsd-bundle/pull/52)

### Blockers / Concerns
_none_

## Session Continuity

- Last session: n/a
- Stopped at: n/a
- Resume file: None
