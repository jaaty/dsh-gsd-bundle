---
phase: 17-phase-branch-isolation
plan: 01
subsystem: git-artifact seam
tags: [git, branch, commit, phase-loop, foundation]
dependency-graph:
  requires: []
  provides: [lib/_git-artifacts.js ensurePhaseBranch + commitArtifacts, test/_git-artifacts.test.mjs suite]
  affects: [lib/discuss.js, lib/plan.js, lib/execute.js, lib/verify.js]
tech-stack:
  - "node:child_process (execFile/promisify)"
  - "node:util (promisify)"
  - "node --test / node:assert/strict"
  - "ESM"
key-files:
  created:
    - "lib/_git-artifacts.js"
    - "test/_git-artifacts.test.mjs"
decisions:
  - "D-01 branch acquisition at start of gsd_discuss, stay-put on phase-<N>"
  - "D-02 base fallback origin/HEAD -> main"
  - "D-03 one conventional commit per tool invocation"
  - "D-04 stage .planning wholesale so STATE.md + phase dir are both captured"
  - "D-05 fail-loud with real cause on non-base branch / checkout failure"
  - "D-06 best-effort commit, swallow no-git/nothing-staged/add/commit failures with warning"
  - "D-08 non-git no-op with warning, never throws"
  - "D-09 dirty-tree carry left to git checkout -b (no stash/reset)"
  - "D-10 re-run stays on existing phase-<N>"
metrics:
  duration: "short"
  completed: "2026-08-28"
  tests: 9
  commits: 3
status: complete
---

# Phase 17 Plan 01: Shared git-artifact seam Summary

Created the single reusable, testable git seam (`lib/_git-artifacts.js`) that every phase tool will reuse: `ensurePhaseBranch` acquires the `phase-<N>` feature branch, and `commitArtifacts` best-effort commits `.planning` wholesale so gsd_ship's clean-tree + protected-branch preflight pass without manual intervention.

## What was built

- **`lib/_git-artifacts.js`** — exports `ensurePhaseBranch(cwd, phaseNum, gitFn?)` and `commitArtifacts(cwd, phaseNum, { scope, phaseName }, gitFn?)`. Both take an injectable `gitFn(cwd, argsArray)` defaulting to an async `promisify(execFile)` wrapper (mirroring ship.js `git`, not map-codebase's sync `execFileSync`). Every git call uses a fixed argument array with `-C cwd` — never a shell string (security note in the header).
- **`test/_git-artifacts.test.mjs`** — 9 unit tests driving both helpers through a scripted fake `gitFn` (the `fetchGitData` seam pattern), no real git/fs.

## Behaviour covered

- **ensurePhaseBranch:** already on `phase-7` → `present`, no checkout (D-01/D-10); on `main` + `origin/HEAD` → `created`, issues `["checkout","-b","phase-7"]`; no `origin/HEAD` → base falls back to `main` (D-02); on unrelated feature branch → throws naming the branch (D-01/D-05); git unavailable on first call → `noop` + warning, never throws (D-08). Branch name uses unpadded N.
- **commitArtifacts:** happy path stages exactly `".planning"`, commits `docs(planning): phase <N> <slug> <scope> artefacts`, returns the staged file list (OQ-5); nothing staged → `committed:false` + warning, no commit; `add`/`commit` reject → best-effort warning, no throw (D-06). Conventional message asserted by regex.

## TDD Gate Compliance

Not a TDD phase plan — no `test:`-before-`feat:` ordering required. Tests were authored alongside the module and the full suite (236 tests) passes after completion.

## Commits (one per task)

- `feat(17-01): add shared ensurePhaseBranch + commitArtifacts git seam`
- `test(17-02): unit-test ensurePhaseBranch via a fake gitFn`
- `test(17-03): unit-test commitArtifacts via a fake gitFn`

## Known Stubs

None — no TODO/FIXME/placeholder in the new files.

## Threat Flags

None. All git invocations use fixed argument arrays with `-C cwd`; no user/model-supplied string is interpolated into a shell. No new dependency added.

## Self-Check: PASSED

- `lib/_git-artifacts.js` exists (created, 114 lines) and exports both functions (grep confirmed).
- `test/_git-artifacts.test.mjs` exists with 9 passing tests.
- `node --test test/_git-artifacts.test.mjs` exits 0; full suite `node --test 'test/*.test.mjs'` → 236 pass, 0 fail.
- Three atomic commits exist (`5715208`, `f89a6ec`, `ecf6daf`).
