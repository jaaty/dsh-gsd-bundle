# Phase 17: phase-branch-isolation - Context

**Gathered:** 2026-08-28T04:40:05.280Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Acquire a per-phase feature branch (phase-<N>) at the start of gsd_discuss and have each phase tool (discuss/plan/execute/verify) commit its planning artefacts to that branch via a shared helper, so gsd_ship preflight passes on a clean feature branch without manual intervention.
**Out of scope:** No changes to gsd_ship's existing push/PR/completion flow beyond what is needed to keep the tree clean; no multi-window/concurrent branch topology; no changes to executor code-commit behaviour (executors already commit on the current branch).
</domain>

<decisions>
## Decisions
### Branch acquisition
- **D-01:** At the start of gsd_discuss, acquire branch `phase-<N>` (N = phase number, no padding). `git checkout -b phase-N` when no such branch exists; if already on `phase-N` (resume/re-discuss), stay put. Fail loudly with the real cause if on a different non-base branch.
- **D-02:** Base for the new branch is the current HEAD. If no `origin/HEAD` symbolic ref exists, fall back to `main` for base detection (same fallback ship.js uses).
### Commit strategy
- **D-03:** Add a shared `commitArtifacts(cwd, phase, scope, message)` helper (or equivalent) that stages and commits the just-written planning artefacts. One conventional-commit per tool invocation: discuss commits CONTEXT + DISCUSSION-LOG; plan commits RESEARCH + PLANs; execute commits SUMMARies; verify commits VERIFICATION.
- **D-04:** Committed artefact writes keep the working tree clean so gsd_ship's preflight clean-tree and protected-branch gates pass without manual intervention.
### Error handling
- **D-05:** Branch acquisition is essential: when git is present but checkout fails, throw with the real cause (mirrors ship.js's preflightError cause propagation).
- **D-06:** Auto-commit is best-effort: swallow and surface a warning when there is nothing staged, no git repo/identity, or git is unavailable, so a non-git workspace still completes the phase (mirrors gsd_map_codebase's gitAddCommit tolerance).
### Push timing
- **D-07:** Discuss/plan/execute/verify only commit locally; do NOT push. gsd_ship already pushes `-u origin phase-N` at ship time. Deferring push avoids requiring remote/auth during discuss and avoids churn on re-runs.
### Edge cases
- **D-08:** Non-git / no-git workspace: branch acquisition is a no-op with a warning; commits are best-effort. The phase still runs; ship simply cannot push.
- **D-09:** Dirty working tree at discuss start: create the branch as-is (git checkout -b carries uncommitted files onto the new branch rather than stashing them).
- **D-10:** Re-run / already-discussed phase: reuse the existing phase-N branch and idempotently overwrite CONTEXT/DISCUSSION-LOG on it rather than resetting or failing.
### Claude's Discretion
- Exact placement of the branch-acquire call within gsd_discuss's execute (start, before writing CONTEXT).
- Precise conventional-commit message format and whether the shared commit helper also returns the staged file list for logging.
- Whether commitArtifacts is exposed on the gsdState service or as a local git helper reused by each tool.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Ship preflight branch/clean-tree gates
- `lib/ship.js — steps 2 & 3: clean working tree + protected-branch checks that phase-N must satisfy`
- `lib/ship.js — push -u at ship time (deferred-push target)`
### Current discuss write-only behaviour
- `lib/discuss.js — writeArtifact of CONTEXT/DISCUSSION-LOG, no git interaction today`
### Best-effort git commit precedent
- `lib/map-codebase.js — gitAddCommit tolerance pattern for non-git workspaces`
### Artefact write path & phase naming
- `lib/state.js — writeArtifact / _artifactFile / phaseDirAndBase, phase-<N> naming and base`
</canonical_refs>

<code_context>
## Code Context
- gsd_ship already has async git/gh helpers (promisify(execFile)) and preflightError with cause propagation — reusable patterns for the branch-acquire and commit helpers.
- gsd_map_codebase's gitAddCommit uses execFileSync git -C cwd add/commit with stdio ignore and best-effort swallowing — precedent for commitArtifacts tolerance.
- writeArtifact returns the artifact file path; tools already call it (plan/execute/verify/ui), so a shared commit helper can be invoked right after artefact writes.
- Ship's branch gate regex treats main|master|develop|trunk|release/* as protected; phase-N must not collide with these.
- cwdOf(exec) resolves the working dir in every phase tool (discuss.js, ship.js).
</code_context>

<specifics>
## Specifics
- 'without manual intervention' (CQ-07) — the branch must exist and the tree must be clean by ship preflight.
- Use phase-<N> with N unpadded to match the requirement wording 'phase-<N>'.
- Reuse the existing gsd_ship push at ship time rather than adding a new push.
</specifics>

<deferred>
## Deferred Ideas
- Concurrent multi-window phases sharing one base branch and their merge topology.
- Pushing the phase-N branch earlier than ship (e.g. at branch-acquire) for remote visibility during the phase.
- Auto-committing UI-SPEC / codebase-map / quick-task artefacts, which live outside the per-phase planning flow.
</deferred>


---

*Phase: 17-phase-branch-isolation*
*Context gathered: 2026-08-28*