# Phase 21 Plan 04: Extend the Mount Harness for Capability Services

Extended the offline mount harness (test/mount.test.mjs) for the new capability wiring: the fake-ctx now exposes a synchronous, presence-gated `ctx.inject` so gsd-commands' per-command sub-fibers activate, asserts all 10 capability services with the documented descriptor shape (DEGR-01), keeps the 14/12/1/1 counts, and adds a negative test proving an absent capability leaves its slash command unregistered (DEGR-03), plus a smoke-harness regression fix.

---
phase: 21-capability-services
plan: 04
subsystem: capability-services
tags: [capability-services, mount-harness, ctx-inject, degr-01, degr-03]
dependency graph:
  requires: [GSD-21-capability-services-02, GSD-21-capability-services-03]
  provides: [green suite with capability-services wiring proven (10 capabilities / 12 commands / 14 tools / 1 section / 1 context) + DEGR-03 negative contract test]
  affects: [lib/commands.js (consumes the now-provided ctx.inject), no source changes to plugins]
tech-stack: [node, esm, node:test, cordis]
key-files:
  created: []
  modified:
    - test/mount.test.mjs
    - test/tools.test.mjs
decisions:
  - D-02 (camelCase keys via ctx.provide) — asserted via CAPABILITY_KEYS import, source/test never drift
  - D-03 (rich descriptor shape key/step/role/tools/commands/order) — asserted for all 10 capabilities
  - D-07 (per-command sub-fiber inject [capabilityKey,'commands']) — the fake ctx.inject resolves capability keys from the provided store
  - D-12 (fake-ctx extended for sub-fibers, still asserts 12 commands / 14 tools) — kept 14/12/1/1
  - DEGR-01 (each step plugin publishes a capability) — 10-provided assertion
  - DEGR-03 (command coeffect on capability → no dangling commands) — negative mount test
metrics:
  duration: "~15 min"
  completed: "2026-09-03"
status: complete
actuals:
  tokens: ~2600
  tasks: 3
  commits: 4
---

## What was built

All changes are test-harness wiring — **no source plugin behaviour, descriptor, or `.planning/` artefact model changed** (D-09).

- **`test/mount.test.mjs`**:
  - `makeMountCtx` (lines 58-117) gained a `ctx.inject(injectKeys, callback)` method mirroring the synchronous `ctx.effect` behaviour (RESEARCH §1.6 — the fake must activate synchronously, not async like the real host `_reload`). The host `"commands"` key is always satisfied; any other key resolves only if it exists in the `provided` Map. When every key resolves, the sub-fiber's `callback(ctx)` runs synchronously and its disposer is returned; when any key is missing, an inert `() => {}` disposer is returned and the callback never runs — the command is never registered. gsd-commands passes `[capKey, "commands"]`, so activating on the present-path is exactly right (D-07/D-12).
  - The "applies all 12 plugins" test now asserts `CAPABILITY_KEYS.length === 10` and, for each key, that the provided descriptor is an object with `key`, `step` (string), `role` (string), `tools` (non-empty array), `commands` (array), `order` (number) — the D-03 shape (DEGR-01). Built from the `CAPABILITY_KEYS` import so test and source never drift (D-02). The existing 14-tools / 12-commands / 1-section / 1-context assertions are unchanged.
  - A new negative test proves DEGR-03: apply all `PATCH_ROWS` except gsd-commands, delete `"gsdQuick"` from the provided store, apply gsd-commands, and assert exactly **11** commands register with **no `gsd-quick`** while the other 11 documented command names are present — the "reactive unregister / no dangling command" contract (RESEARCH Q-4).
- **`test/tools.test.mjs:1158`** (slash-command smoke): its hand-built fake-ctx only had `effect` + `commands.register` and no capability services, so after Plan 03's `ctx.inject` refactor it registered zero commands. Fixed by giving it a presence-gated `ctx.inject` and providing `gsdMapCodebase` (the capability that owns `gsd-map-codebase`, per D-04), restoring the single `gsd-map-codebase` registration the test probes.

## Verification

- Task 1 verify: `node --test test/mount.test.mjs` — the fake-ctx `ctx.inject` resolves all capabilities (present-path), the 10-capability assertion and the 14/12/1/1 assertions all pass.
- Task 2 verify: same command — the negative test "absent capability leaves its slash command unregistered (DEGR-03)" passes (11 commands, no gsd-quick).
- Task 3 verify: `npm test` — **exit 0, 350 tests / 350 pass / 0 fail** on the final run; confirms 14 tools / 12 commands / 1 section / 1 context / 10 capabilities with all capabilities present (D-12, RESEARCH Q-2).

## Acceptance criteria & must_haves

- `ctx.inject` defined on the fake ctx object (grep `ctx.inject = ` at mount.test.mjs:104) ✅
- `CAPABILITY_KEYS` imported from `../lib/_capabilities.js` (grep line 17) ✅
- Mount test asserts 14 tools / 12 commands / 1 section / 1 context AND the 10 provided capabilities ✅
- A test deletes one capability from `provided` before applying gsd-commands — `ctx2.provided.delete("gsdQuick")` at line 246 ✅
- `npm test` exits 0 on the current checkout ✅
- All 12 commands and all 14 tools still registered when all capabilities are present ✅
- The mount test asserts 10 capabilities provided (grep `CAPABILITY_KEYS.length === 10`) ✅

## TDD Gate Compliance

Not a TDD plan (test-infrastructure wiring; no RED/GREEN behaviour change to any tool). No test-first gate applies.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced. The remaining `.planning/async-jobs.json` working-tree modification is the known pre-existing unrelated change (noted in Plan 02/03 summaries).

## Threat Flags

None new. This phase only extends the offline test harness; it introduces no runtime security surface. The security-relevant wiring (command registration as an authorizing surface, DEGR-03) is now directly proven by the negative mount test: a `/gsd-*` command cannot be registered when the tool's owning capability is absent. No credential/secret handling.

## Self-Check: PASSED

- Modified files exist and are committed; `test/mount.test.mjs` = 385 lines (created via edits), `test/tools.test.mjs` regression fix in place.
- Four atomic commits on `phase-21`:
  - `64239d7 test(GSD-21-capability-services-04): add ctx.inject to fake-ctx and assert 10 capabilities (DEGR-01)`
  - `3e2869e test(GSD-21-capability-services-04): absent capability leaves its slash command unregistered (DEGR-03)`
  - `304e5e1 test(GSD-21-capability-services-04): give slash-command smoke fake-ctx inject + gsdMapCodebase (regression from Plan 03)`
  - `75b5301 docs(GSD-21-capability-services-04): log plan 04 execution in STATE.md`
- `npm test` exit 0 (350/350). Working tree clean apart from the pre-existing unrelated `.planning/async-jobs.json` modification ✅
