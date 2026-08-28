# Phase 21 Plan 02: Publish Capability Services From Step Plugins

Added one `ctx.provide(capabilityKey, buildCapability(capabilityKey))` call to each of the 8 step plugins' `apply`, plus two provides (gsdOrient + gsdJobs) in core-tools, so every loop-step plugin publishes its camelCase capability service (DEGR-01) — purely additive and effect-scoped, no `inject` or tool-behaviour change (D-09).

---
phase: 21-capability-services
plan: 02
subsystem: capability-services
tags: [capabilities, capability-publish, ctx-provide, reactive-plugin-surface, degr-01]
dependency graph:
  requires: [GSD-21-capability-services-01]
  provides: [10 published capability services observable in the mount harness `provided` map]
  affects: [test/mount.test.mjs (asserts the 10 provided services — Plan 04), lib/commands.js (Plan 03 consumes via inject)]
tech-stack: [node, esm, cordis, @deepseek-ai/dsh-tools]
key-files:
  created: []
  modified:
    - lib/core-tools.js
    - lib/discuss.js
    - lib/ui.js
    - lib/plan.js
    - lib/execute.js
    - lib/verify.js
    - lib/ship.js
    - lib/quick.js
    - lib/map-codebase.js
decisions:
  - D-01 (split gsdOrient + gsdJobs from core-tools apply) — two distinct provides in one apply
  - D-02 (camelCase keys via ctx.provide) — gsdOrient/gsdJobs + 8 step keys
  - D-04 (per-plugin mapping) — each plugin provides its own capability key via the _capabilities.js builder
  - D-09 (publish mechanism: auto-tracked revertible effect, no inject change) — provides added, inject arrays untouched
  - D-10 (fail-loud: throw-in-apply on malformed builder) — buildCapability throws; apply doesn't swallow
metrics:
  duration: "~10 min"
  completed: "2026-08-28"
status: complete
actuals:
  tokens: ~2300
  tasks: 3
  commits: 2
---

## What was built

Each step/orient/jobs plugin now publishes its capability on activation:

- **`lib/core-tools.js`** — imports `buildCapability`; `apply` publishes `ctx.provide("gsdOrient", ...)` and `ctx.provide("gsdJobs", ...)` after `const gsd = ...`, before the first tool registration. Both live in the single core-tools apply (the two-provides-in-one-apply case, D-01).
- **`lib/discuss.js`** → `gsdDiscuss`, **`lib/ui.js`** → `gsdUi`, **`lib/plan.js`** → `gsdPlan`, **`lib/execute.js`** → `gsdExecute`, **`lib/verify.js`** → `gsdVerify`, **`lib/ship.js`** → `gsdShip`, **`lib/quick.js`** → `gsdQuick`, **`lib/map-codebase.js`** → `gsdMapCodebase` — each adds one `ctx.provide(key, buildCapability(key))` near the top of `apply`.

No plugin's `inject` array was changed (all remain `["gsdState","tools"]`), and no tool registration or behaviour was modified (D-09). `lib/persona.js` and `lib/state.js` are untouched (D-06). `lib/commands.js` is untouched (Plan 03). The capabilities ride each plugin's fiber lifecycle as auto-tracked revertible effects, so retiring a plugin withdraws its capability with no manual dispose (D-09).

## Verification

- Task 1 verify: `import('./lib/core-tools.js')` resolves with an `apply` function → ok.
- Task 2 verify: all 8 step plugins `import()` with an `apply` function → ok.
- Task 3 (partial — see Known Issues below):
  - `CAPABILITY_KEYS` has exactly 10 distinct entries, all camelCase (`/^gsd[A-Z][a-zA-Z]*$/`) → ok.
  - A focused fake-ctx harness (`provide` recording) applied core-tools + all 8 step plugins in patch order: all 10 capabilities published, distinct, each descriptor `key` matching its provide key, no `apply` throw → PASSED.
  - `npm test` → does NOT exit 0 yet (see Known Issues: blocked by Plan 03/04 cross-wave dependency, not by this plan).

## Acceptance criteria

- `lib/core-tools.js` imports `buildCapability` ✅
- Two `ctx.provide` calls for `gsdOrient` + `gsdJobs` in `apply` ✅
- Each of the 8 step plugins contains `ctx.provide("gsd…` for its own key ✅
- No step-plugin `const inject` line changed (grep-verified all 9 files) ✅
- 10 distinct camelCase `CAPABILITY_KEYS` (Set size === 10) ✅
- `npm test` exits 0 — **NOT met, cross-plan dependency** (see Known Issues)

## Known Issues

- **`npm test` is red at this wave boundary, and that is not caused by Plan 02.** Plan 03 (`lib/commands.js`, wave 2) has already landed (commit `1018c9a`) and refactored gsd-commands to use `ctx.inject([capabilityKey, "commands"], apply)` per command. The offline mount harness that loads gsd-commands (`test/mount.test.mjs`) does **not** yet expose `ctx.inject` on its fake ctx — that extension is Plan 04's explicit file (`test/mount.test.mjs`, wave 3), which depends on this plan (02) and Plan 03. Until Plan 04 runs, every failure is `TypeError: ctx.inject is not a function` at `lib/commands.js:202` — confirmed across all 8 failing tests (mount.applyAll + tools.test slash-command). None reference a Plan-02-provided service or a plugin `apply` throw. Plan 02 deliberately does not touch `test/mount.test.mjs` (Plan 04's file) or `lib/commands.js` (Plan 03's file), so it cannot unblock the green suite itself. The suite regresses to green once Plan 04 adds fake-ctx `ctx.inject`.

## TDD Gate Compliance

Not a TDD plan (wiring/additive publishes; no RED/GREEN behaviour change to the tools' own logic). No test-first gate applies.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests were introduced.

## Threat Flags

None new. Capability publishes are effect-scoped and revertible (D-09); `buildCapability` is fail-loud (D-10) and throws in `apply` if a descriptor is ever malformed, so a broken capability cannot silently register. No tool behaviour or authorizing surface changed in this plan; the command-registration surface is Plan 03's scope.

## Self-Check: PASSED

- Created/modified files exist and import cleanly (core-tools + 8 step plugins all `apply` functions) ✅
- Two atomic commits present on `phase-21`:
  - `635c8ae feat(GSD-21-capability-services-02): publish gsdOrient + gsdJobs from core-tools apply`
  - `7bba724 feat(GSD-21-capability-services-02): publish per-step capability in each step plugin apply`
- Working tree clean apart from the pre-existing `.planning/async-jobs.json` modification and the untracked Plan 03 SUMMARY (both untouched by this plan) ✅
