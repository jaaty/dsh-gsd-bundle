---
phase: 17-phase-branch-isolation
plan: 02
subsystem: discuss git-artifact wiring
tags: [git, branch, commit, discuss, wiring, tracer]
dependency-graph:
  requires: ["GSD-17-phase-branch-isolation-01"]
  provides: ["lib/discuss.js phase-branch wiring", "test/discuss-artifacts.test.mjs"]
  affects: []
tech-stack:
  - "ESM"
  - "node --test / node:assert/strict"
  - "node:fs/promises (readFile)"
key-files:
  created:
    - "test/discuss-artifacts.test.mjs"
  modified:
    - "lib/discuss.js"
decisions:
  - "D-01 acquire phase-<N> at the start of gsd_discuss execute, before any artefact write"
  - "D-03 one conventional-commit per tool invocation, via the shared commitArtifacts helper"
  - "D-04 commit .planning wholesale so STATE.md + phase dir are both captured"
  - "D-06 best-effort commit, swallow no-git/nothing-staged failures with a warning"
  - "D-09 dirty-tree carry left to git checkout -b (no stash/reset)"
  - "D-10 re-run stays on existing phase-<N> (helper stays put)"
metrics:
  duration: "short"
  completed: "2026-08-28"
  tasks: 2
  commits: 2
status: complete
---

# Phase 17 Plan 02: gsd_discuss phase-branch wiring Summary

Wired the shared git-artifact seam (plan 01) into `gsd_discuss` as the tracer end-to-end slice: the phase acquires `phase-<N>` at the very start of execute (before CONTEXT is written) and best-effort commits `.planning` after the STATE advance, so the phase branch and clean tree that gsd_ship preflight needs begin to exist here.

## What was built

- **`lib/discuss.js`** — imports `ensurePhaseBranch` + `commitArtifacts` from `./_git-artifacts.js`. Inside `execute()`: after the phase-existence check and before `nowIso()`/CONTEXT assembly it calls `await ensurePhaseBranch(cwd, args.phase)` (D-01/D-10); after `setActivePhase` + `addDecision` it calls `await commitArtifacts(cwd, args.phase, { scope: "discuss", phaseName: phase.name })` (D-03/D-04/D-06). The returned message now reports the branch action/branch and the commit status + staged file count, appending the helper warning when present, and preserves the "Next: gsd_plan" guidance.
- **`test/discuss-artifacts.test.mjs`** — 4 static source-assertion tests (mirroring `test/ship.test.mjs`'s read-lib style, no real git/fs): the import of both helpers; `ensurePhaseBranch(cwd, args.phase)` called exactly once and textually before the CONTEXT write/assembly (D-01 placement); `commitArtifacts(..., { scope: "discuss", phaseName: phase.name })` called exactly once and textually after `setActivePhase`/`addDecision` (D-03/D-04 ordering); and no inline `promisify(execFile)`/`execFileSync("git",...)`/`git -C` in discuss.js (D-03 no duplication).

## TDD Gate Compliance

Not a TDD phase plan — no `test:`-before-`feat:` ordering required. The feature edit and its static wiring test were both authored, then verified against the full suite.

## Commits (one per task)

- `f059e0e` `feat(GSD-17-phase-branch-isolation-02): wire phase-branch acquire + artefact commit into gsd_discuss` (Task 1, lib/discuss.js)
- `2b17972` `test(GSD-17-phase-branch-isolation-02): static wiring test for gsd_discuss phase-branch seam` (Task 2, test/discuss-artifacts.test.mjs)

## Known Stubs

None — no TODO/FIXME/placeholder in the new/changed files.

## Threat Flags

None. All git invocations remain in the shared helper (`lib/_git-artifacts.js`), which uses fixed argument arrays with `-C cwd` — no shell-string interpolation. discuss.js contains no inline git logic (asserted by test). No new dependency added.

## Self-Check: PASSED

- `lib/discuss.js` modified — grep confirms `ensurePhaseBranch(cwd, args.phase)` (×1), `commitArtifacts(cwd, args.phase, { scope: "discuss"` (×1), and `from "./_git-artifacts.js"` (×1) all present.
- `test/discuss-artifacts.test.mjs` created — `node --test test/discuss-artifacts.test.mjs` exits 0 (4 pass).
- Full suite `node --test 'test/*.test.mjs'` → 240 pass, 0 fail.
- Two atomic commits exist (`f059e0e`, `2b17972`), each containing only its task's files.
