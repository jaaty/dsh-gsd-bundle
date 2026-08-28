---
phase: 20-multi-window-topology
plan: 02
subsystem: lib/_git-artifacts.js — ensurePhaseBranch acquire flow (local/remote join + best-effort early push)
tags: [git, ensurePhaseBranch, joined-local, joined-remote, bestEffortPush, refExists, D-03, D-05, D-06, D-07, D-08, MW-01, MW-02]
dependency_graph:
  requires: ["GSD-20-multi-window-topology-01 (commitArtifacts seam — untouched here)"]
  provides: "ensurePhaseBranch acquires an existing phase-N locally or remotely (join) instead of failing checkout -b, and best-effort pushes phase-N at acquire on every non-noop path with a fixed '-C cwd' arg array"
  affects: []
tech-stack: [Node.js, node:test, ESM, node:fs/promises, node:child_process promisify(execFile)]
key-files:
  created: []
  modified:
    - lib/_git-artifacts.js
    - test/_git-artifacts.test.mjs
decisions:
  - "D-03: local or remote phase-N exists → join (git checkout / checkout --track) instead of failing checkout -b."
  - "D-05/D-06: best-effort git push -u origin phase-N on every non-noop acquire path; push/fetch failures swallow into warnings, never throw."
  - "D-08: fail-loud non-base guard applies only to the NEW-phase create path; joining an existing phase from a non-base branch does not throw (OQ-2)."
  - "OQ-1: branch existence probed with fixed git show-ref --verify --quiet; OQ-3: absent tracking ref triggers best-effort fetch origin phase-N --no-tags discovery fallback."
metrics:
  duration: "short (three-wave, three tasks)"
  completed_date: 2026-08-28
  commits: 3
actuals:
  tasks: 3
  commits: 3
status: complete
---

# Phase 20 Plan 02: EnsurePhaseBranch local/remote join + best-effort early push Summary

Extends `ensurePhaseBranch` (the phase-branch acquire seam) to support the parallel multi-window topology (MW-01): joining an already-existing `phase-N` locally or remotely instead of failing `checkout -b`, with a best-effort early `git push -u origin phase-N` on every non-noop acquire path (MW-02). Adds private fixed-arg helpers `bestEffortPush` and `refExists`, and keys the fake `scriptedGit` by full args so the two distinct `show-ref` probes are scriptable independently.

## What was done

**Task 1 — best-effort early push (commit `87e8b42`):** Added a private `bestEffortPush(cwd, gitFn, branch)` helper issuing `gitFn(cwd, ["push","-u","origin",branch])` inside try/catch, returning `{ ok: true }` or `{ ok: false, warning: "early push failed: <msg>" }` without rethrowing (D-06). Wired it into the `present` and `created` acquire paths, attaching `push` onto the returned object. The `noop` path does not push. Updated the two tests that asserted `calls.at(-1)` deep-equals `["checkout","-b","phase-7"]` (now the trailing push would be last) to presence checks (`hasCall(-b)` / `hasCall(push)`), and added two tests: create+push-success asserting `push.ok === true`, and push-failure best-effort (`rejectArg:"push"`) asserting `action:"created"` / `push.ok === false` / `push.warning` matches `/early push failed/` with no throw.

**Task 2 — local join + create-only fail-loud guard (commit `ea6538b`):** Added a private `refExists(cwd, gitFn, ref)` helper probing `git show-ref --verify --quiet <ref>` (success→true, rejection→false, fixed `-C cwd` arg array, D-07). In `ensurePhaseBranch`, after deriving `defaultBranch`, probe `refs/heads/phase-N`; when present, `git checkout phase-N` (no `-b`), best-effort push, return `{ action: "joined-local", push }`. Moved the fail-loud `current !== defaultBranch` guard below the join so it applies only to the create path (D-08) — joining an existing phase from an unrelated non-base branch no longer throws (OQ-2), while creating a new phase from a non-base branch still throws. Extended `scriptedGit` to resolve full-args (`args.join(" ")`) keys before `argv[0]` so `refs/heads/phase-7` vs `refs/remotes/origin/phase-7` probes are scriptable independently, and to support function-valued responses. Added tests: local-join from main (`joined-local`, bare `["checkout","phase-7"]`, no `-b`), join from non-base `foo` (no throw, OQ-2), and preserved create-path throw from `foo` (D-08).

**Task 3 — remote join + fetch fallback (commit `fa61408`):** When local probe misses, probe `refs/remotes/origin/phase-N`; if absent, best-effort `git fetch origin phase-N --no-tags` (swallowed on failure, D-06) then re-probe. When the remote tracking ref is present, `git checkout --track origin/phase-N`, best-effort push, return `{ action: "joined-remote", push }`. Create path (with its non-base fail-loud guard) runs only when both probes fail after the best-effort fetch. Added tests: direct remote-join via `--track`; fetch-discovery (`fetch` runs, then `--track`, no `-b`); and create-fallback when both probes and the fetch fail (`rejectArg:"fetch"` → `action:"created"`, no throw).

## Requirements addressed

- **MW-01 (parallel topology via join):** existing local/remote `phase-N` branches are joined rather than re-forked, converging same-phase windows on one branch (D-03) with the create path guarded to the correct base (D-08).
- **MW-02 (early phase-branch push):** every non-noop acquire issues a best-effort `git push -u origin phase-N` with failures swallowed to a warning (D-05/D-06).

## Verification

- `node --test test/_git-artifacts.test.mjs` → 20 pass, 0 fail.
- `npm test` (full suite) → 338 pass, 0 fail.
- `grep -c "calls.at(-1)" test/_git-artifacts.test.mjs` == 0 (no stale last-call assertion the push could break).
- `grep -n 'joined-local\|refs/heads/' lib/_git-artifacts.js` → local `show-ref` probe + `joined-local` action present.
- `grep -n 'joined-remote\|--track\|--no-tags'` → remote probe, `["checkout","--track",origin/phase-N]` fixed array, and best-effort fetch present.
- `lib/_git-artifacts.js` is 199 lines (≥ required 180), exports `ensurePhaseBranch` and `commitArtifacts`.
- `grep 'push.*-u.*origin'` → the fixed `["push","-u","origin",branch]` array present.

## Key decisions

- Join detection uses explicit `git show-ref --verify --quiet` probes (OQ-1 strategy 1) rather than parsing `checkout -b` error text — cleaner and testable via the injectable fake `gitFn`.
- The remote-join discovery fetch is restricted to an already-fetched tracking ref plus a best-effort `fetch origin phase-N --no-tags` fallback; any fetch failure degrades silently to create (D-06).
- The fail-loud non-base guard is scoped strictly to new-phase creation (D-08), preserving fork-off-the-wrong-base protection while enabling join-from-anywhere convergence (OQ-2).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced in this plan's two files.

## Threat Flags

- **SECURITY (D-07):** all new git calls (`push -u`, `show-ref --verify --quiet`, `fetch … --no-tags`, `checkout`/`checkout --track`) use fixed literal argument arrays routed through the injectable `gitFn(cwd, argsArray)` seam with `-C cwd`. The branch/base values derive from `phaseNum` (a safe number) and fixed prefixes; no shell strings, no model/supplied interpolation.
- **Best-effort safety (D-06):** early push and the discovery fetch swallow no-remote / network / non-fast-forward failures into warnings and never throw, so offline or no-remote setups still proceed. The authoritative push + PR remains at ship.js (D-02, D-05) — untouched by this plan.
- The early push fires before the phase's CONTEXT write, so the remote `phase-N` briefly carries only the parent commit — acceptable MW-02 visibility behavior (RESEARCH risk 3), documented in comments.

## Self-Check: PASSED

- `lib/_git-artifacts.js` exists, exports `ensurePhaseBranch` and `commitArtifacts` (functions), 199 lines.
- `test/_git-artifacts.test.mjs` exists and passes with 20 tests (incl. all new join/push/fetch tests).
- Three atomic commits exist on `phase-20`: `87e8b42` (feat push), `ea6538b` (feat local join), `fa61408` (feat remote join).
- Working tree contains only the orchestrator-managed `.planning/STATE.md` and `.planning/async-jobs.json` modifications (not part of this plan's files).
