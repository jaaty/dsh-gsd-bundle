# Phase 21 Plan 03: Per-Command Capability-Gated Sub-Fibers Summary

Rewired `lib/commands.js` so each `/gsd-*` slash command is registered by its own sub-fiber whose inject pairs the owning step capability with the host `commands` service (via the real Cordis `ctx.inject`/`ctx.plugin` sub-fiber API), so an absent or retired step capability reactively unregisters its command with no dangling commands (DEGR-03, D-07/D-08).

---
phase: 21-capability-services
plan: 03
subsystem: capability-services
tags: [capability-services, command-registration, reactive-sub-fiber, degr-03]
dependency graph:
  requires: [GSD-21-capability-services-01]
  provides: [per-command capability-gated registration in lib/commands.js]
  affects: [test/mount.test.mjs (Plan 04), test/tools.test.mjs (slash-command smoke, handoff)]
tech-stack: [node, esm, @deepseek-ai/cordis, @deepseek-ai/dsh-llm]
key-files:
  created: []
  modified:
    - lib/commands.js
decisions:
  - D-01 (orient/jobs split) — gsdJobs owns no slash command, contributes no sub-fiber
  - D-04 (per-plugin mapping) — command→capability pairing built from allCapabilities() descriptors
  - D-07 (per-command sub-fiber inject [capabilityKey,'commands']) — implemented via ctx.inject/inject plugin (RESEARCH Q-1: ctx.use does not exist)
  - D-08 (COMMANDS stays declarative, wrap each entry) — array + build/phaseNum/send reused verbatim
metrics:
  duration: "~6 min"
  completed: "2026-09-03"
status: complete
actuals:
  tokens: ~2800
  tasks: 3
  commits: 1
---

## What was built

**`lib/commands.js`** — the `apply(ctx)` body was rewritten from a single `ctx.effect` that registered all 12 commands, into per-command sub-fibers:

- A `commandToCapability` map is built by iterating `allCapabilities()` from `lib/_capabilities.js` (imported) and mapping every command a descriptor advertises back to its capability key — the D-04/D-08 single-source-of-truth pairing. gsdJobs advertises `commands = []`, so it contributes no pairing.
- Each command's sub-fiber is started via `ctx.inject([capKey, "commands"], (subCtx) => subCtx.commands.register({ ... }))`. The sub-fiber apply returns the disposer from `ctx.commands.register` so the sub-fiber's unload truly unregisters that one command (D-07).
- **Critical API correction (RESEARCH Q-1):** CONTEXT D-07 text says `ctx.use`, but `ctx.use` does **not** exist in `@deepseek-ai/cordis` 4.0.1. The D-07 contract is honoured using the real sub-fiber API `ctx.inject(injectArray, callback)` (shorthand for `ctx.plugin({ inject, apply })`).
- `const name = "gsd-commands"`, `const inject = ["commands"]`, `phaseNum`, `send`, and the entire 12-entry `COMMANDS` array (with its inline `build` helpers) are unchanged (D-08).
- An absent step capability leaves its sub-fiber inactive (never registers the command); retiring a capability reactively withdraws it (no dangling commands — DEGR-03).

## Verification

- Task 1 `node -e` parse check: module parses, `typeof apply === 'function'`. Grep gates pass: `ctx.inject(` present, `ctx.commands.register` present, 12 `name: "gsd-` entries in COMMANDS.
- Task 2 present-path: a throwaway node script with a presence-gated fake `ctx.inject` + all 10 capabilities provided registered **exactly 12 commands** (`12 commands ok`).
- Task 3 absent-path: same harness with `gsdQuick` missing from `provided` registered **11 commands with no `gsd-quick`** (`absent-capability ok: 11 commands, no gsd-quick`) — the DEGR-03 negative contract (no dangling command) proven against the refactor.

## Acceptance criteria & must_haves

- `lib/commands.js` exists, exports `name`/`inject`/`apply`, `apply` ≥ 45 lines with per-command sub-fiber wiring ✅
- `ctx.inject(` invoked with an inject array containing the capability key; `ctx.commands.register` still called inside the sub-fiber; COMMANDS array intact with 12 entries ✅
- With all capabilities present → exactly 12 commands registered via sub-fibers ✅
- With a step capability absent → its command never registered, others still registered ✅
- `lib/_capabilities.js` linked via import; handler/disposer contract preserved ✅

## TDD Gate Compliance

Not a TDD plan (no RED/GREEN test-driven tasks). Verification was done via throwaway node scripts, not committed tests.

## Known Stubs / Handoff

**Regression handoff to Plan 04 (wave 3, depends on this plan):** the refactor makes `lib/commands.js` call `ctx.inject`, and two existing test files still use fake-ctxs that lack `ctx.inject`, so `npm test` reports **8 failures** after this plan lands:

- `test/mount.test.mjs` — 7 failures ("applies all 12 plugins in patch order", "cordis.patch.yml rows resolve", "persona orients at STATE.md", "runtime-context provider", "gsd_init smoke", "uninitialised-cwd hint", "all 14 registered tools have a valid compiled schema"). `test/mount.test.mjs` is **Plan 04's owned file** and its Task 1/2 extend `makeMountCtx` with a synchronous presence-gated `ctx.inject`, so these are expected to resolve in Plan 04.
- `test/tools.test.mjs:1158` — 1 failure ("slash command --query builds a tool call with the query string"): that smoke test calls `applyCommands(c, {})` with a hand-built ctx that has `effect` + `commands.register` but **no `ctx.inject` and no capability services**, so gsd-commands now registers zero commands. This file is **not** in Plan 04's `files_modified` list and **not** in this plan's list. The minimal fix is to give its fake ctx a presence-gated `ctx.inject` (and provide the needed capability keys, e.g. `gsdMapCodebase` for the gsd-map-codebase command it probes). **Flagged for the orchestrator** to assign to Plan 04 (its Task 3 claims "fix any failures introduced by the commands.js refactor" / "per-plugin smoke suites stay green") or to gap-closure — this executor is constrained to commit only `lib/commands.js`.

No TODO/FIXME/placeholder/skipped tests remain in `lib/commands.js`.

## Threat Flags

The only security-relevant wiring in the phase is command registration being an authorizing surface; the chosen per-command sub-fiber placement (presence-gated, inject on the owning step capability + `commands`) means a `/gsd-*` command cannot survive the withdrawal of the tool it drives (DEGR-03). No data-tier or domain-tier security surface introduced. No credential/secret handling.

## Self-Check: PASSED

- `lib/commands.js` exists and parses; `apply` re-wired and re-exports `name`/`inject`/`apply` ✅
- Atomic commit present on `phase-21`:
  - `1018c9a feat(GSD-21-capability-services-03): Refactor lib/commands.js to per-command sub-fibers (DEGR-03, D-07/D-08)` ✅
- Working tree: `lib/commands.js` committed clean; remaining modifications (`lib/core-tools.js`, `lib/discuss.js`, `lib/execute.js`, `lib/map-codebase.js`, `lib/plan.js`, `lib/quick.js`, `lib/ship.js`, `lib/ui.js`, `lib/verify.js`) are **Plan 02's in-flight parallel work**, not touched by this plan; `.planning/async-jobs.json` is the pre-existing unrelated modification. ✅
