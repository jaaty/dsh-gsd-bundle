---
phase: 11-phase-dir-resolution
plan: 02
subsystem: phase tools (presentation tier)
tags: [phase-dir-resolution, refactor, resolve-once, tools, base-derivation]
dependency_graph:
  requires: [GSD-11-phase-dir-resolution-01]
  provides: [phase tools resolving dir/base once via phaseDirAndBase]
  affects: [lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js]
tech-stack: [node, esm, node:test]
key-files:
  created: []
  modified: [lib/plan.js, lib/execute.js, lib/verify.js, lib/ui.js]
decisions: [D-01]
metrics:
  duration: 0.1h
  completed: 2026-08-27
actuals:
  tasks: 3
  commits: 2
status: complete
---

# Phase 11 Plan 02: phase-dir-resolution — Summary

Replaced the copy-pasted `const phaseDir = await s.phaseDir(cwd, args.phase); const base = phaseDir.split("/").pop();` pattern in the four phase tools (gsd_plan, gsd_execute, gsd_verify, gsd_ui_phase) with a single `phaseDirAndBase(cwd, args.phase)` call that yields both dir and base, per D-01. This is the presentation-tier half of CQ-01: the duplicated base derivation is gone from every tool while the local `phaseDir` variable name is preserved so all existing prompt-string interpolations stay byte-for-byte identical. lib/ship.js is intentionally untouched (verified: it never had the pattern).

## Changes

- **`lib/plan.js`** — replaced lines 43-44 with `const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);`. All later interpolations (lines 78, 107, 117, 125) unchanged.
- **`lib/execute.js`** — replaced lines 57-58 with the same single line. Interpolation at line 175 unchanged.
- **`lib/verify.js`** — replaced lines 38-39 with the same single line. Interpolations at lines 72, 90, 91 unchanged.
- **`lib/ui.js`** — replaced lines 35-36 with the same single line. Interpolation at line 47 unchanged.
- **`lib/ship.js`** — NOT touched (no phaseDir/base derivation present).

## Requirements Addressed

- **CQ-01** — the phase tools resolve the phase dir/base once per invocation via `phaseDirAndBase`; the copy-pasted `phaseDir.split('/').pop()` base derivation is eliminated from the tool layer.

## Verification

- `node --test test/tools.test.mjs` → 43 pass / 0 fail (after each task).
- `npm test` (full suite) → 181 pass / 0 fail.
- `grep -rn 'phaseDir.split("/").pop()' lib/` → 0 matches.
- `grep -rn 's.phaseDir(cwd, args.phase)' lib/` → 0 matches.

## Key Decisions

- **D-01** — each tool calls `phaseDirAndBase(cwd, args.phase)` once and destructures `{ dir: phaseDir, base }`, keeping the local `phaseDir` name so all prompt-string interpolations stay unchanged.

## Known Stubs

None.

## Threat Flags

None. Pure presentation-tier refactor; no new imports, no security-sensitive surface, no tier violation (all path logic stays in the data tier).

## TDD Gate Compliance

Not a TDD plan (`type: execute`); no RED→GREEN sequence required.

## Self-Check: PASSED

- `lib/plan.js`, `lib/execute.js`, `lib/verify.js`, `lib/ui.js` each contain exactly one `const { dir: phaseDir, base } = await s.phaseDirAndBase(cwd, args.phase);` (grep match, 1 per file).
- `grep -rn 'phaseDir.split("/").pop()' lib/` returns 0 matches.
- `grep -rn 's.phaseDir(cwd, args.phase)' lib/` returns 0 matches.
- Full suite green (181 pass / 0 fail).
- 2 atomic commits created (Task 1: plan.js; Task 2: execute/verify/ui). Task 3 was verification-only with no new file changes to commit.
