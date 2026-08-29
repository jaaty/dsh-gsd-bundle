---
gsd_state_version: 1
milestone: v2.0
milestone_name: graceful-removal
status: idle
active_phase: null
next_action: null
next_phases: [24]
progress:
  total_phases: 24
  completed_phases: 24
  total_plans: 3
  completed_plans: 64
  percent: 100
current_phase: 24
current_phase_name: composability-hardening
current_plan: 3
last_updated: "2026-08-29T02:20:32.066Z"
state_head: null
last_activity: 2026-08-29
stopped_at: "Milestone v2.0 released — v2.0.0 (all 24 phases shipped)"
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

STEPS (in this order):

1) READ the project to confirm state before changing anything: read .planning/ROADMAP.md, .planning/STATE.md, package.json, and README.md (note its current heading/version references). All 24 phases (01 live-mount … 24 composability-hardening) are marked complete — confirm this before tagging.

2) Bump the npm package version from 1.7.0 to 2.0.0 in package.json (the "version" field only — do not change name, exports, scripts, or dependencies).

3) Update README.md so it reflects that milestone graceful-removal v2.0 is COMPLETE and released: update the "Release status" section (currently says milestone job-intel-multiwindow v1.7 is complete/released as v1.7.0) to state that milestone graceful-removal v2.0 is complete and released as v2.0.0, covering all 24 phases (PRs #1..#27). Add/adjust a short release note describing the v2.0 milestone's delivered capabilities: the capability-services layer (each step plugin publishes a capability service declaring its loop step; persona + slash-command layer declare coeffects), reactive-loop-rendering (persona/runtime-context/gsd_status re-render from available step capabilities so absent steps are skipped), removal-verification (automated per-plugin removal test proving every step plugin can be retired with effects reverted and the loop stays functional), and composability-hardening (effect-scoped background-job live registry so unload/HMR cancels running jobs; subagents coeffect declared in every consuming plugin). Keep the existing public-release/plugin-ecosystem framing intact. Do not rewrite unrelated content.

4) Update .planning/ROADMAP.md to mark milestone graceful-removal v2.0 as released/complete (e.g. a status note that all 24 phases shipped and the milestone is released as v2.0.0), leaving the per-phase table accurate.

5) Update .planning/STATE.md to record the milestone release: set the status/stopped_at to reflect "Milestone v2.0 released — v2.0.0 (all 24 phases shipped)" and append a recent decision line noting the milestone release. Use the project's normal STATE mutation conventions via the gsdState artefact model (writeArtifact/writeQuickRecord or a structured edit) rather than raw node:fs bypass.

6) Run the test suite to confirm nothing broke: `node --test test/*.test.mjs` — it must pass (currently 396 tests green; this is a release-only change so it should stay green).

7) Commit ALL of the above atomically with a single conventional-commit message, e.g. `chore(release): release milestone graceful-removal as v2.0.0` (stage the specific changed files: package.json, README.md, .planning/ROADMAP.md, .planning/STATE.md, plus the .planning/quick/<date>-<slug>/ record this task creates). Do NOT use `git add -A` blanket staging beyond those. Do not push force. Commit onto main (the current branch).

8) Create an ANNOTATED git tag at the new commit: `git tag -a v2.0.0 -m "Milestone graceful-removal v2.0.0 — 24 phases shipped"`.

9) Push the tag to origin: `git push origin v2.0.0` (and push main if it is not already up to date).

10) Create a GitHub Release for tag v2.0.0 against the repository (origin https://github.com/jaaty/dsh-gsd-bundle) using the gh CLI, titled "v2.0.0" with release notes that enumerate the milestone: the goal (graceful-removal — proving the whole GSD plugin bundle is swappable/customizable), that all 24 phases shipped (PRs #1..#27), and a short bulleted summary of the key delivered capabilities. The v2.0 milestone (phases 21-24) delivered: capability-services (each step plugin publishes a capability service declaring the loop step it provides; persona and slash-command layer declare coeffects on the capabilities they need), reactive-loop-rendering (persona, runtime-context snapshot, and gsd_status re-render from the available step capabilities so absent steps are skipped and no missing tool is ever instructed), removal-verification (an automated per-plugin removal test proving every single step plugin can be retired with its effects reverted and the remaining loop still functional end-to-end), and composability-hardening (effect-scoping the background-job live registry to its owning fiber so unloading/HMR cancels running jobs, and declaring the subagents coeffect in every consuming plugin so temporal and spatial composability hold for the job runtime and subagent paths). Also note the broken_windows gate hardening (diff-based scanning of added lines + xit word-boundary fix) landed during phase 24. Use `gh release create v2.0.0 --notes-file <tmp>` and clean up the temp notes file.

11) Write a one-line quick-task summary (this task tool records it) and verify the tag exists (`git tag` shows v2.0.0) and the release was created.

IMPORTANT CONSTRAINTS:
- All git/gh commands must use explicit argument arrays; never interpolate a model- or user-supplied value into a shell string (release notes file path can be a fixed .planning temp path). Do not push force, do not alter protected refs, do not run git clean/reset --hard.
- If gh CLI is unavailable or unauthenticated, create the tag and push it, and report the gh release step as a warning with the real cause — do not silently skip or fake it.
- The working tree must be left clean on main with the v2.0.0 tag pointing at the release commit.

### Blockers / Concerns
_none_

## Session Continuity

- Last session: n/a
- Stopped at: n/a
- Resume file: None
