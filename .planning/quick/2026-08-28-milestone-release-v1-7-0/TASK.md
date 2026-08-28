# Quick task 2026-08-28-milestone-release-v1-7-0

**Task:** Release milestone job-intel-multiwindow as v1.7.0. Orient against .planning/STATE.md first: the milestone is fully COMPLETE (20/20 phases shipped, PRs #1..#23, all merged to main), branch is main, working tree is clean, and there are currently no git tags. Do the full milestone release end to end and commit + tag atomically.

STEPS (in this order):

1) READ the project to confirm state before changing anything: read .planning/ROADMAP.md, .planning/STATE.md, package.json, and the README.md (note its current heading/version references). All 20 phases (01 live-mount … 20 multi-window-topology) are marked complete — confirm this before tagging.

2) Bump the npm package version from 0.1.0 to 1.7.0 in package.json (the "version" field only — do not change name, exports, scripts, or dependencies).

3) Update README.md so it reflects that milestone v1.7 is COMPLETE and released: if it lists phase/feature status, mark all 20 phases done; update any version reference to v1.7.0; add (or adjust) a short release/install note stating the milestone is complete. Keep the existing public-release/plugin-ecosystem framing intact. Do not rewrite unrelated content.

4) Update .planning/ROADMAP.md to mark milestone job-intel-multiwindow v1.7 as released/complete (e.g. a status note that all 20 phases shipped and the milestone is released as v1.7.0), leaving the per-phase table accurate.

5) Update .planning/STATE.md to record the milestone release: set the status/stopped_at to reflect "Milestone v1.7 released — v1.7.0 (all 20 phases shipped)" and append a recent decision line noting the milestone release. Use the project's normal STATE mutation conventions via the gsdState artefact model (writeArtifact/writeQuickRecord or a structured edit) rather than raw node:fs bypass.

6) Run the test suite to confirm nothing broke: `node --test test/*.test.mjs` — it must pass (currently 338 tests green; this is a release-only change so it should stay green).

7) Commit ALL of the above atomically with a single conventional-commit message, e.g. `chore(release): release milestone job-intel-multiwindow as v1.7.0` (stage the specific changed files: package.json, README.md, .planning/ROADMAP.md, .planning/STATE.md, plus the .planning/quick/<date>-<slug>/ record this task creates). Do NOT use `git add -A` blanket staging beyond those. Do not push force. Commit onto main (the current branch).

8) Create an ANNOTATED git tag at the new commit: `git tag -a v1.7.0 -m "Milestone job-intel-multiwindow v1.7.0 — 20 phases shipped"`.

9) Push the tag to origin: `git push origin v1.7.0` (and push main if it is not already up to date).

10) Create a GitHub Release for tag v1.7.0 against the repository (origin https://github.com/jaaty/dsh-gsd-bundle) using the gh CLI, titled "v1.7.0" with release notes that enumerate the milestone: the goal (job-intel-multiwindow), that all 20 phases shipped (PRs #1..#23), and a short bulleted summary of the key delivered capabilities (mount/live-boot, phase-loop tooling, checkpoint-resume, window ledger WINDOWS.md + async-jobs manifest, conversational UAT loop, capability gates, real background-job runtime with subagent/timeout/retry, codebase-query intel mode with drift detection / targeted updater, phase-dir/const refactor cleanup, per-phase feature-branch isolation, and the phase-20 multi-window topology: parallel concurrent-phase branches on a shared base, early best-effort branch push, and auto-commit of out-of-flow artefacts). Use `gh release create v1.7.0 --notes-file <tmp>` and clean up the temp notes file.

11) Write a one-line quick-task summary (this task tool records it) and verify the tag exists (`git tag` shows v1.7.0) and the release was created.

IMPORTANT CONSTRAINTS:
- All git/gh commands must use explicit argument arrays; never interpolate a model- or user-supplied value into a shell string (release notes file path can be a fixed .planning temp path). Do not push force, do not alter protected refs, do not run git clean/reset --hard.
- If gh CLI is unavailable or unauthenticated, create the tag and push it, and report the gh release step as a warning with the real cause — do not silently skip or fake it.
- The working tree must be left clean on main with the v1.7.0 tag pointing at the release commit.
**Run:** 2026-08-28T22:00:15.377Z

## Result

Release complete end-to-end. Summary of what was done:

**Milestone `job-intel-multiwindow` v1.7 released as `v1.7.0`.**

- **Oriented** against `.planning/STATE.md`: 20/20 phases complete (PRs #1–#23), `status: idle`, branch main, clean tree, no prior tags — confirmed before changing anything.
- **package.json** — version bumped `0.1.0 → 1.7.0` (name/exports/scripts/deps untouched).
- **README.md** — added a Release-status note (milestone complete), updated the Status section to list all 20 shipped phases released as v1.7.0, and corrected the now-stale "intel mode not implemented" bullet (phase 19 delivered it). Plugin-ecosystem/public-release framing kept intact.
- **ROADMAP.md** — added a top-of-file status note that all 20 phases shipped and v1.7.0 is released; per-phase tables left accurate.
- **STATE.md + quick record** — mutated through the **gsdState artefact model** (host-fs-compatible adapter using `updateStateFrontmatter`/`addDecision`/`writeQuickRecord`, no raw bypass): `status: complete`, `stopped_at: "Milestone v1.7 released — v1.7.0 (all 20 phases shipped)"`, plus a release decision line and `.planning/quick/2026-08-28-release-multiwindow-v1.7.0/TASK.md`.
- **Tests** — `node --test test/*.test.mjs`: **338 pass, 0 fail**.
- **Commit** — `4ff3957 chore(release): release milestone job-intel-multiwindow as v1.7.0` (5 files staged explicitly; no blanket add).
- **Tag** — annotated `v1.7.0` pointing at `4ff3957`, created.
- **Pushed** — `main` (`9b7da53..4ff3957`) and tag `v1.7.0` to origin.
- **GitHub Release** — created via `gh release create` (title "v1.7.0", notes enumerating the milestone, not draft/prerelease): https://github.com/jaaty/dsh-gsd-bundle/releases/tag/v1.7.0. Temp notes file cleaned up.

**Final state verified:** working tree clean on `main`, tag `v1.7.0` present and pointing at the release commit, `main` in sync with origin, release live.

One-line quick-task summary: `Released milestone job-intel-multiwindow as v1.7.0 (commit 4ff3957, 338 tests green, annotated tag + GitHub Release).`