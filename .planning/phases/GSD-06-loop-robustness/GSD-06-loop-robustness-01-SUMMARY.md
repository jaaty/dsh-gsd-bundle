---
phase: 06-loop-robustness
plan: 01
subsystem: plan-dependency-resolution
tags: [dependencies, depends_on, prefix, fail-loud, planner-prompt, gsd_execute, planIndex]
requires: []
provides: [DUR-05]
affects: [lib/state.js, lib/execute.js, lib/_agents.js, lib/_shared.js]
tech-stack: [node, esm, node--test, FakeFs, fake-subagents]
key-files:
  created:
    - test/_shared.test.mjs (extended)
    - test/state.test.mjs (extended)
    - test/tools.test.mjs (extended)
  modified:
    - lib/_shared.js
    - lib/state.js
    - lib/execute.js
    - lib/_agents.js
decisions:
  - "D-01: PLANNER_PROMPT depends_on guidance + PLAN_CHECKER_PROMPT Dimension 3 now teach the fully-prefixed plan id (project-code + <NN>-<slug>-<PP>, e.g. GSD-01-auth-01); a bare non-prefixed depends_on is a BLOCKER finding."
  - "D-02: Shared prefix-tolerant resolver (stripPlanPrefix / resolvePlanDep) in lib/_shared.js, consumed by both planIndex.runnable (state.js) and the gsd_execute wave-runnable filter + prior-summary lookup (execute.js)."
  - "D-03: An unresolvable depends_on (no match even after prefix normalization) throws a named gsd_phase: unresolved plan dependency error instead of silently breaking a wave."
metrics:
  duration: 2026-08-24
  completed_date: 2026-08-24
  tests: 93
  tasks: 3
  commits: 3
status: complete
---

# Phase 6 Plan 1: Prefix-Tolerant Plan Dependency Resolution — Summary

Fix DUR-05: plan dependency resolution now tolerates the project-code-prefixed plan id (so a non-prefixed `depends_on` like `"01-auth-01"` resolves to `"GSD-01-auth-01"`), the planner/checker prompts teach prefixed ids at authoring time, and an unresolvable `depends_on` fails loud with a named error.

## What was delivered

- **`lib/_shared.js`** — two pure, dependency-free helpers:
  - `stripPlanPrefix(id)` — removes the leading project-code token from a plan id when present, keyed on the zero-padded phase segment; returns a bare id unchanged.
  - `resolvePlanDep(plans, dep)` — exact match first, else prefix-normalized match; returns the plan or `undefined`.
- **`lib/state.js`** — `planIndex.runnable` resolves each `depends_on` via `resolvePlanDep` instead of `plans.find((x) => x.id === d)`. When a dep still matches no plan id, it throws `gsd_phase: unresolved plan dependency "<dep>" — no plan in phase <N> matches after prefix normalization (check depends_on frontmatter)` (plain `Error`, per bundle convention).
- **`lib/execute.js`** — both resolution sites (`idx.plans.find((x) => x.id === d)` in the wave-runnable filter and the prior-summary lookup) now call `resolvePlanDep`, keeping execute consistent with planIndex so wave 2 neither runs too early nor is blocked forever.
- **`lib/_agents.js`** — `PLANNER_PROMPT` depends_on guidance (line 51) now uses the fully-prefixed example `GSD-01-auth-01` with an explicit instruction to match the prefixed base; `PLAN_CHECKER_PROMPT` Dimension 3 now validates that every depends_on uses the fully-prefixed id format and flags a bare non-prefixed value as a BLOCKER.
- **Tests** — `_shared.test.mjs` unit tests for both helpers; `state.test.mjs` a prefixed-project planIndex regression (wave-2 gated until wave-1 SUMMARY, then runnable) and a fail-loud unresolvable-dep case; `tools.test.mjs` a full `gsd_execute` regression proving wave-2 dispatches only after its non-prefixed dep's SUMMARY exists.

## Verification

- `npm test` → **93 tests, 0 failures** across the full suite.
- All task-level acceptance greps satisfied (see Self-Check).

## TDD Gate Compliance

Plan type is `tdd`. Task 1 was a tracer slice that introduced pure helpers **with** their unit tests in a single commit (`test(...)` scope — RED and GREEN landed together as a tracer, which the plan specified as a single auto task). Tasks 2 and 3 were code changes backed by regression tests; Task 2's commit (`feat(...)`) is accompanied by the state/tools tests committed in the same commit. The tracer-first task combined the test and implementation in one commit as its explicit contract; the remaining tasks carry their tests alongside their implementation. No test-commit/impl-commit split was enforced per task, so a strict RED→GREEN sequence is not present; this matches the plan's TDD-as-tracer intent.

## Known Stubs

None. No TODO/FIXME/placeholder/`test.skip` introduced.

## Threat Flags

No security-sensitive capability touched. `resolvePlanDep`/`stripPlanPrefix` are pure string/array operations; the fail-loud message interpolates only the dep value and phase number, no shell metacharacter risk. No new runtime dependencies (`dependencies: {}` preserved).

## Self-Check: PASSED

- `lib/_shared.js` exists; `stripPlanPrefix` (line 380) and `resolvePlanDep` (line 392) present and exported.
- `lib/state.js` imports `resolvePlanDep` (line 23) and calls it in `planIndex.runnable` (line 533); the fail-loud message `unresolved plan dependency` present (line 534).
- `lib/execute.js` imports `resolvePlanDep` (line 26) and calls it at lines 90 and 99.
- `lib/_agents.js` contains `GSD-01-auth-01` in PLANNER_PROMPT (line 51) and `prefixed` in PLAN_CHECKER_PROMPT Dimension 3 (line 118).
- Commits: `test(GSD-06-loop-robustness-01)` (helpers+tests), `feat(GSD-06-loop-robustness-01)` (resolution routing), `docs(GSD-06-loop-robustness-01)` (prompts) — all present via `git log`.
- Full suite green: 93/93.
