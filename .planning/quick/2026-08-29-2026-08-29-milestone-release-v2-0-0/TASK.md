# Quick task 2026-08-29-2026-08-29-milestone-release-v2-0-0

**Task:** Release milestone graceful-removal as v2.0.0. Orient against .planning/STATE.md first: the milestone is fully COMPLETE (24/24 phases shipped, PRs #1..#27, all merged to main), branch is main, working tree is clean, and the existing tag is v1.7.0. Do the full milestone release end to end and commit + tag atomically.

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
**Run:** 2026-08-29T02:20:32.039Z

## Result

Milestone `graceful-removal` released as **v2.0.0** end to end.

**What I did:**
- Bumped `package.json` version `1.7.0` → `2.0.0` (version field only).
- Updated `README.md` — "Release status" now states milestone `graceful-removal` v2.0 is complete/released as `v2.0.0` (24 phases, PRs #1–#27), added a v2.0 release note (capability-services, reactive-loop-rendering, removal-verification, composability-hardening), and refreshed the bottom "Status" section.
- Marked `.planning/ROADMAP.md` released as `v2.0.0` (all 24 phases shipped) with the per-phase table left accurate.
- Updated `.planning/STATE.md` — `stopped_at` set to "Milestone v2.0 released — v2.0.0 (all 24 phases shipped)" and appended a milestone-release decision line.
- Created the quick record at `.planning/quick/2026-08-28-milestone-release-v2-0-0/TASK.md`.
- Ran the suite: **393 tests pass, 0 fail**.
- Committed atomically, tagged `v2.0.0`, pushed tag + main, and created the GitHub Release.

**Verification:** working tree clean on `main`; `git tag` shows `v2.0.0`; `git describe --tags --exact-match HEAD` → `v2.0.0`; release live at https://github.com/jaaty/dsh-gsd-bundle/releases/tag/v2.0.0.

**Commit:** `3179502` — `chore(release): release milestone graceful-removal as v2.0.0`

Note: the task mentioned "396 tests green" but the actual suite reports 393 tests — all green, no failures.