---
phase: 20-multi-window-topology
plan: 01
subsystem: lib/_git-artifacts.js — shared commitArtifacts seam
tags: [git, commitArtifacts, message-override, D-12, MW-03]
dependency_graph:
  requires: []
  provides: "commitArtifacts(cwd, phaseNum, { scope, phaseName, message }, gitFn) with null-safe phaseNum + message override — the seam out-of-flow auto-commit (Plan 03) builds on"
  affects: [lib/ui.js (Plan 03), lib/map-codebase.js (Plan 03), lib/quick.js (Plan 03)]
tech-stack: [Node.js, node:test, ESM, node:fs/promises, node:child_process promisify(execFile)]
key-files:
  created: []
  modified:
    - lib/_git-artifacts.js
    - test/_git-artifacts.test.mjs
decisions:
  - "D-12: commitArtifacts takes opts whole; message resolved as opts.message || default template; phaseNum may be null for out-of-flow writers."
  - "Default message template docs(planning): phase <N> <slug> <scope> artefacts kept byte-identical; phase-tool call sites untouched."
metrics:
  duration: "short (single-wave, two tasks)"
  completed_date: 2026-08-28
  commits: 2
actuals:
  tasks: 2
  commits: 2
status: complete
---

# Phase 20 Plan 01: Extend commitArtifacts seam with message override Summary

Extends the shared `commitArtifacts` git-artifact seam so out-of-flow writers (UI-SPEC / codebase-map / quick, MW-03 Plan 03) that have no phase can commit `.planning` with an exact override message and a null `phaseNum`, without disturbing any existing phase-tool call site.

## What was done

**Task 1 — D-12 seam extension (commit `e33eb70`):** Changed the signature from `commitArtifacts(cwd, phaseNum, { scope, phaseName }, gitFn)` to `commitArtifacts(cwd, phaseNum, opts = {}, gitFn)` where `opts` may carry `{ scope, phaseName, message }`. The commit message now resolves at a single point — `opts.message || \`docs(planning): phase ${phaseNum} ${slugify(opts.phaseName)} ${opts.scope} artefacts\`` — so an override message (with `phaseNum: null`) skips phase interpolation entirely, while calls omitting `message` reproduce the default template byte-for-byte. `lib/_git-artifacts.js` now 121 lines (≥ required 114). Added three unit tests (override+null / default-backward-compat / best-effort-on-add).

**Task 2 — backward-compat regression (commit `0829df6`):** Added a static test describe block in `test/_git-artifacts.test.mjs` that reads the four phase-tool sources (`discuss`/`plan`/`execute`/`verify`) and asserts each calls `commitArtifacts(cwd, args.phase, { scope: "<tool>", phaseName: phase.name })` exactly once with no `message:` key — proving the signature change introduced no second call and no message override at the existing call sites.

## Requirements addressed

- **MW-03 (out-of-flow auto-commit foundation):** the `commitArtifacts` seam is now phase-agnostic and override-capable, ready for the UI-SPEC / codebase-map / quick call sites on Plan 03.

## Verification

- `node --test test/_git-artifacts.test.mjs` → 12 pass, 0 fail (7 commitArtifacts incl. 3 new).
- `node --test test/_git-artifacts.test.mjs test/discuss-artifacts.test.mjs test/phase-tools-git.test.mjs` → 31 pass, 0 fail.
- `npm test` (full suite) → 322 pass, 0 fail.
- `grep -c "opts.message ||" lib/_git-artifacts.js` == 1 (single override resolution point).
- All four phase-tool call sites match their verbatim literal, once each.

## Key decisions

- `opts` is received whole (not pre-destructured) so the message override resolves at exactly one source point, matching the plan's acceptance criterion and keeping the D-12 override semantics unambiguous.
- Default message template is unchanged, preserving backward compatibility with the existing structural tests (`discuss-artifacts.test.mjs`, `phase-tools-git.test.mjs`).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced in this plan's two files.

## Threat Flags

- **Best-effort safety preserved (D-06/D-08):** the null-phaseNum path keeps the same no-throw best-effort semantics as the phase path — `git add`/commit failures return `{ committed: false, warning }` and never throw. Existing D-08 fail-loud behavior (non-base branch for a NEW phase) lives in `ensurePhaseBranch`, untouched here.
- **SECURITY (D-07):** no new git invocations were introduced; `lib/_git-artifacts.js` continues to use fixed argument arrays with `-C cwd` through the injectable `gitFn` seam — no shell strings, no model/supplied interpolation.

## Self-Check: PASSED

- `lib/_git-artifacts.js` exists and exports `commitArtifacts` (function) — verified by load test.
- `test/_git-artifacts.test.mjs` exists and passes with the new tests.
- Two atomic commits exist on `phase-20`: `e33eb70` (feat) and `0829df6` (test).
- Working tree contains only the pre-existing `.planning/async-jobs.json` modification (not part of this plan's files).
