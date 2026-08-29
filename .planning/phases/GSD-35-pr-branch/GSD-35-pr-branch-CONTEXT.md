# Phase 35: pr-branch - Context

**Gathered:** 2026-08-29T21:59:06.411Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Fold a clean-PR-branch path into gsd_ship (GAP-01): after the capability gates and the pre-ship-verify gate pass on the phase-N working tree, derive a clean branch that carries only the phase's real code — excluding the per-phase planning-artifact subtree while keeping the cross-phase durable artifacts — push that clean branch, and create the phase PR from it. Falls back to the phase-N branch when a phase changes no code.
**Out of scope:** No standalone /gsd-pr-branch command. No history rewrite (filter-branch/force-push). No code-only exclusion of the cross-phase durable artifacts (STATE/ROADMAP/REQUIREMENTS/PROJECT/config/codebase). No change to how durable .planning artifacts are curated/tracked. No new runtime dependencies. Verification/gate logic unchanged (still runs on the phase-N tree).
</domain>

<decisions>
## Decisions
### Filter scope
- **D-01:** The clean branch excludes only the per-phase planning-artifact subtree (`.planning/phases/`). All cross-phase durable files (STATE.md, ROADMAP.md, REQUIREMENTS.md, PROJECT.md, config.json, DEFERRED.md, `.planning/codebase/`) stay in the PR diff so main's orientation stays current. This deliberately narrows upstream /gsd-pr-branch (which excludes all of `.planning/`) because this repo curates the durable artifacts into git.
- **D-02:** Exclusion is implemented as a git pathspec on the merge-base diff — `:(exclude).planning/phases/` — so every file under `.planning/phases/` is dropped and everything else is retained, without enumerating individual artifact types.
### Branch construction & topology
- **D-03:** At ship time the clean branch is created from the base branch's origin HEAD, and the phase's code changes are applied as ONE squash commit: the merged diff of `merge-base(origin/<base>, HEAD) → HEAD`, excluding `.planning/phases/`. This matches 'one phase = one PR'; per-plan atomic history stays on the internal phase-N branch.
- **D-04:** The diff base uses `merge-base(origin/<base>, HEAD)` (reusing fetchGitData's base resolution) so the clean branch stays correct even after main advances or under the multi-window topology (phase 20).
- **D-05:** The clean branch is named `phase-<N>-clean` (zero-padded N). The phase-N branch remains the source of truth for full artifacts and is still pushed.
- **D-06:** No history rewrite / filter-branch / force-push is used; the clean branch is a forward application of the filtered diff only.
### Fallback & gating
- **D-07:** If a phase changes NO files outside `.planning/phases/` (a planning- or doc-only phase), gsd_ship falls back to pushing/PRing the phase-N branch as-is (today's behavior), so planning-only phases still ship.
- **D-08:** Capability gates and the pre-ship-verify gate are unchanged and run on the phase-N working tree (identical code; `.planning` does not affect `npm test`). The clean branch is a presentation/merge layer created only after those gates pass, immediately before push/PR.
### Config & UX
- **D-09:** Clean-PR is ON by default. It is disabled via a new `workflow.clean_pr_branch` config key (default true) and/or a `--no-clean-pr` gsd_ship parameter; the parameter (when passed) overrides config.
- **D-10:** Implementation uses the existing async git CLI helpers + node builtins (node:child_process, node:fs/promises). No new runtime dependencies.
### Claude's Discretion
- Exact squash-commit message template for the clean branch (e.g. 'phase <N>: <name>').
- Test coverage details for the new ship branches in test/*.test.mjs.
- Whether to add a short note in the README 'Faithfulness and scope' section about the clean-branch behavior.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current PR-branch flow
- `lib/ship.js — the ship tool: branch preflight, push, PR body assembly, completePhase commit (steps 3-10)`
- `lib/gates.js — fetchGitData merge-base base resolution reused for the clean-branch diff`
### Clean-PR-branch upstream reference
- `https://github.com/open-gsd/gsd-core/blob/master/commands/gsd/pr-branch.md — upstream /gsd-pr-branch (filters all .planning/; D-01 narrows to the per-phase subtree)`
- `https://github.com/open-gsd/gsd-core/blob/master/gsd-core/references/git-planning-commit.md — planning-dir commit conventions`
### Planning-artifact curation
- `.planning/ROADMAP.md — phase 26 keep-vs-gitignore decision context`
- `.gitignore — volatile .planning churn gitignored; durable artifacts tracked`
</canonical_refs>

<code_context>
## Code Context
- fetchGitData(cwd, git, defaultBranch) resolves mergeBase + changed files via --diff-filter=ACM (lib/gates.js:241-271).
- runCapabilityGates scans the merge-base diff of the phase (lib/gates.js:232).
- ship.js step 6 pushes `-u origin <branch>`; step 8 `gh pr create --base <defaultBranch>`; step 10 commits/pushes the .planning completion state.
- CQ-07 (phase 17): per-phase branch `phase-<N>` acquired at gsd_discuss; MW-01..03 (phase 20) multi-window branch topology.
</code_context>

<specifics>
## Specifics
- PR diffs currently carry PLAN/SUMMARY/STATE noise (gap finding E1).
- GAP-01: 'leave reviewers with only real code changes'.
- The PR body still assembled from planning artefacts (Summary, Changes, Requirements Addressed, Verification, Key Decisions) — unchanged.
</specifics>

<deferred>
## Deferred Ideas
- A standalone /gsd-pr-branch command (out of scope; folded into gsd_ship).
- Code-only exclusion of all .planning (offered option not selected — D-01 keeps root durable files in the PR).
- A review-only parallel branch model (not selected).
- History rewrite / filter-branch / force-push (rejected by D-06).
</deferred>


---

*Phase: 35-pr-branch*
*Context gathered: 2026-08-29*