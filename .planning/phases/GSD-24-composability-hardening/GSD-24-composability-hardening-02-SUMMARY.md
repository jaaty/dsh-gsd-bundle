---
phase: 24-composability-hardening
plan: 02
subsystem: plugin-composability
tags: [coeffect, subagents, inject, DEGR-07, D-04]
dependency_graph:
  requires: []
  provides: ["subagents coeffect declared on the six subagent-driven plugins"]
  affects: ["lib/plan.js", "lib/execute.js", "lib/verify.js", "lib/quick.js", "lib/ui.js", "lib/map-codebase.js", "test/coeffect.test.mjs"]
tech-stack: [node, cordis, dsh-tools]
key-files:
  created: ["test/coeffect.test.mjs"]
  modified: ["lib/plan.js", "lib/execute.js", "lib/verify.js", "lib/quick.js", "lib/ui.js", "lib/map-codebase.js"]
decisions:
  - "D-04: each of the six subagent-driven plugins declares 'subagents' as a hard required coeffect in its inject array, so its fiber stays inactive when the subagents host service is absent."
  - "Static inject assertions live in a new test/coeffect.test.mjs (Claude's Discretion), reading mod.inject from each @dsh-gsd/bundle/<sub> module."
metrics:
  duration: "~2 min"
  completed: "2026-08-29"
  actuals:
    tasks: 2
    commits: 2
status: complete
---

# Phase 24 Plan 02: Subagents Coeffect on Subagent-Driven Plugins — Summary

Declared the `subagents` hard required coeffect on the six subagent-driven plugins (plan, execute, verify, quick, ui, map-codebase) so their fibers stay inactive when the subagents host service is absent (DEGR-07 / D-04), and proved it with static inject assertions in a new test suite.

## Tasks

1. **feat(24-02): declare subagents coeffect on six subagent-driven plugins** (`954ba86`) — changed `const inject = ["gsdState", "tools"];` to `const inject = ["gsdState", "tools", "subagents"];` in lib/plan.js:17, lib/execute.js:34, lib/verify.js:17, lib/quick.js:15, lib/ui.js:14, lib/map-codebase.js:34. Nothing else changed — the tools already read `ctx.get('subagents')` and throw if absent, so the hard coeffect is safe (D-04).
2. **test(24-02): static inject assertions for subagents coeffect** (`8c1dfd7`) — created test/coeffect.test.mjs importing each of the six subs and asserting `Array.isArray(mod.inject)`, `mod.inject.includes("subagents")`, plus guards that `gsdState` and `tools` are retained.

## Verification

- Task 1 verify: `grep -n 'inject = \["gsdState", "tools", "subagents"\]'` returned exactly six lines, one per plugin file.
- Task 2 verify: `node --test test/coeffect.test.mjs` exits 0 — 6 tests pass, 0 fail.

## Requirements Addressed

- **DEGR-07** — the subagents coeffect is declared on every consuming (subagent-driven) plugin, so reactive coeffect activation/deactivation holds.

## Key Decisions

- D-04 applied verbatim: hard required coeffect on the six subagent-driven plugins.
- Static assertions placed in a new `test/coeffect.test.mjs` (Claude's Discretion per CONTEXT), consistent with the existing `Array.isArray(mod.inject)` assertion in test/mount.test.mjs:208.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The change only adds a coeffect declaration to inject arrays and a read-only static test; no new surface, no process/child handling.

## TDD Gate Compliance

Not a TDD plan (no RED/GREEN/REFACTOR structure required by the plan). The test commit (`8c1dfd7`) follows the code commit (`954ba86`) as specified by the plan's task order.

## Self-Check: PASSED

- Created files exist: `test/coeffect.test.mjs` present.
- Modified files exist and contain the expected inject arrays (verified by grep).
- Commits exist: `954ba86`, `8c1dfd7` (confirmed via `git log`).
- `node --test test/coeffect.test.mjs` passes (6/6).

## Note on full-suite run

`node --test test/*.test.mjs` shows a `tools.test.mjs` failure ("gsd_job: live is not defined") caused by plan 01's in-progress refactor of `lib/jobs.js`/`lib/core-tools.js` in the shared working tree (parallel wave-1 executor), not by this plan. This plan's own test passes in isolation.
