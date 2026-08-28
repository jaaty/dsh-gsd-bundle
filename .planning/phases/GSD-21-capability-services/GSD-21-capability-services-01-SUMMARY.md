# Phase 21 Plan 01: Capability Descriptor Module Summary

Created the pure helper module `lib/_capabilities.js` — the single source of truth for all 10 capability descriptors, the known-key list, the role enum, and the fail-loud `buildCapability` builder — plus a focused unit test proving the descriptor model, the D-04 mapping, the role enum, the order-sorted chain, and fail-loud validation. This is the foundation every other plan in the phase imports from (D-05 / D-10 / D-03 / D-04 / D-11).

---
phase: 21-capability-services
plan: 01
subsystem: capability-services
tags: [capabilities, capability-descriptor, pure-helper, reactive-plugin-surface]
dependency graph:
  requires: []
  provides: [allCapabilities, buildCapability, CAPABILITY_KEYS, ROLES]
  affects: [lib/commands.js, all 8 step plugins, lib/core-tools.js, lib/map-codebase.js, test/mount.test.mjs]
tech-stack: [node, esm, node:test]
key-files:
  created:
    - lib/_capabilities.js
    - test/_capabilities.test.mjs
  modified: []
decisions:
  - D-01 (capability granularity — orient/jobs split) reflected in the table
  - D-02 (camelCase keys) — 10 keys exported
  - D-03 (rich descriptor shape + 6-value role enum) — shape and ROLES frozen
  - D-04 (per-plugin mapping) — exact tools/commands/role/order table
  - D-05 (pure-helper module pattern) — plain ESM, no ctx, no I/O, no deps
  - D-10 (fail-loud registration) — buildCapability throws on malformed input
  - D-11 (order values + off-chain sentinel) — NOT_LOOP_ORDERED = -1 sentinel
metrics:
  duration: "~4 min"
  completed: "2026-09-03"
status: complete
actuals:
  tokens: ~2600
  tasks: 2
  commits: 2
---

## What was built

**`lib/_capabilities.js`** — plain ESM with no imports (zero-dep invariant). Exports:

- `ROLES` — frozen 6-tuple `["step","optional","alternate","onboarding","orient","jobs"]` (D-03).
- `CAPABILITY_KEYS` — frozen, ordered list of the 10 camelCase keys (gsdMapCodebase, gsdOrient, gsdJobs, gsdDiscuss, gsdUi, gsdPlan, gsdQuick, gsdExecute, gsdVerify, gsdShip) (D-02).
- `NOT_LOOP_ORDERED = -1` — sentinel for the not-loop-ordered orient/jobs capabilities (D-11).
- `buildCapability(key)` — accepts a known key, validates fail-loud (D-10), returns a fresh frozen descriptor `{ key, step, role, tools[], commands[], order, prereq, next, produces[], consumes[] }`.
- `allCapabilities()` — convenience: descriptors for every key in order.

The private `TABLE` is the single source of truth (D-04): exact tools/commands/role/order for all 10. `prereq/next/produces/consumes` are populated per the CONTEXT specifics (discuss→CONTEXT.md, plan consumes CONTEXT produces PLAN.md, execute consumes PLAN produces SUMMARY.md, verify consumes SUMMARY produces VERIFICATION.md, ship consumes VERIFICATION.md, ui produces UI-SPEC.md) as advisory metadata — stored now, NOT enforced (phase 21 scope).

**`test/_capabilities.test.mjs`** — 11 tests / 4 suites covering: the 10-key surface (DEGR-01), the role enum, the full descriptor shape for every key, the exact D-04 mapping (gsdOrient tools/commands, gsdJobs empty commands, gsdMapCodebase two tools, role values), the D-11 order-sorted chain (discuss→ui→plan→execute→verify→ship, quick between ui and execute, map-codebase before discuss), and D-10 fail-loud validation.

## Verification

- Task 1 `node -e` probe: `buildCapability('gsdPlan')` returns correct descriptor; unknown key throws; `CAPABILITY_KEYS.length === 10` → `ok 10`.
- `node --test test/_capabilities.test.mjs` → 11 pass, 0 fail.
- Full `npm test` → 349 pass, 0 fail (no regression; the new module is not yet imported by any existing plugin).

## Acceptance criteria

- `lib/_capabilities.js` exists and exports `ROLES`, `CAPABILITY_KEYS`, `buildCapability` ✅
- Unknown-key throws (proved by task 1 probe + unit test) ✅
- `CAPABILITY_KEYS.length === 10` ✅
- `CAPABILITY_KEYS` and `ROLES` imported in the test; chain-sort assertion present ✅

## TDD Gate Compliance

Not a TDD plan (no RED/GREEN test-driven tasks); the unit test was authored alongside the module. No test-first gate applies here.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests.

## Threat Flags

None. The module is pure, frozen, and returns fresh copies — callers cannot corrupt the shared table. `buildCapability` throws (it never silently returns a malformed descriptor), which the phase relies on so `apply`'s `ctx.provide(...)` naturally throws-in-apply on a bad builder (D-10).

## Self-Check: PASSED

- Created files exist: `lib/_capabilities.js` and `test/_capabilities.test.mjs` ✅
- Two atomic commits present on `phase-21`:
  - `9bd2d96 feat(GSD-21-capability-services-01): add capability descriptor module`
  - `1def644 test(GSD-21-capability-services-01): cover capability descriptor model`
- Working tree clean apart from the pre-existing `.planning/async-jobs.json` modification (untouched by this plan) ✅
