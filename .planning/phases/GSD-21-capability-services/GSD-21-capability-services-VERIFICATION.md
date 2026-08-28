---
phase: 21-capability-services
verified: 2026-09-03
status: passed
score: 12/12
behavior_unverified: 0
overrides_applied: 0
---

# Phase 21: capability-services Verification Report

## Goal Achievement → Observable Truths

Phase goal: *Each step plugin publishes a capability service declaring the loop step it provides, and the persona and slash-command layer declare coeffects on the capabilities they need.* (Requirements: DEGR-01, DEGR-03)

Goal achieved. `lib/_capabilities.js` is the single source of truth for the 10 capability descriptors; all 8 step plugins plus core-tools publish their camelCase capability via `ctx.provide`; `lib/commands.js` registers every `/gsd-*` command from a per-command sub-fiber gated on its owning capability via the real `ctx.inject` API, so an absent capability leaves no dangling command. Persona rendering from capabilities is correctly deferred to phase 22 (D-06, out of scope).

### Must-have truths (from all 4 PLAN frontmatter + ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T1 | `lib/_capabilities.js` yields a descriptor for each of the 10 known keys with shape `{key, step, role, tools[], commands[], order, prereq, next, produces[], consumes[]}` | ✓ VERIFIED | `lib/_capabilities.js:22-33` (CAPABILITY_KEYS ×10), `:159-179` (`buildCapability` returns all 10 fields); `test/_capabilities.test.mjs` ("every key builds a descriptor with the documented shape") passes |
| T2 | Sorting step capabilities by `order` reproduces discuss→ui→plan→execute→verify→ship, with quick/map-codebase off-chain | ✓ VERIFIED | `lib/_capabilities.js` TABLE orders 10/15/20/30/40/50, ui(15)→plan(20) chain, map-codebase(0), quick(25), orient/jobs −1 sentinel (`NOT_LOOP_ORDERED` `:17`); `test/_capabilities.test.mjs` chain-sort suite passes |
| T3 | Malformed descriptor input throws synchronously (fail-loud) | ✓ VERIFIED | `buildCapability` `:159-166` throws on unknown key, empty tools/step, bad role, non-finite order; `test/_capabilities.test.mjs` `assert.throws` + finite-order checks pass |
| T4 | Applying each step plugin + core-tools publishes its capability, observable in mount `provided` map | ✓ VERIFIED | grep: `ctx.provide(` at `discuss:22`, `ui:21`, `plan:24`, `execute:41`, `verify:24`, `ship:57`, `quick:29`, `map-codebase:116`; `test/mount.test.mjs:220-231` asserts each CAPPABILITY_KEYS present with shape |
| T5 | core-tools publishes BOTH `gsdOrient` and `gsdJobs` from its single apply (D-01) | ✓ VERIFIED | `lib/core-tools.js:36-37` two `ctx.provide` calls; mount asserts both keys in `provided` |
| T6 | No plugin `inject` array or tool registration behaviour changed; publishing purely additive | ✓ VERIFIED | `git log lib/persona.js lib/state.js` shows no phase-21 commit; `const inject = ["gsdState","tools"]` unchanged in all 9 plugin files, `["commands"]` in commands.js:18; tool registrations untouched |
| T7 | With all capabilities present, gsd-commands registers exactly 12 commands via per-command sub-fibers gated on capability | ✓ VERIFIED | `lib/commands.js:200-216` loops COMMANDS → `ctx.inject([capKey,"commands"], ...)`; `test/mount.test.mjs:213` `ctx.commands.length === 12` |
| T8 | When a step capability is absent at load, its slash command is NEVER registered while others still register | ✓ VERIFIED | `test/mount.test.mjs:234-252` negative test: delete `gsdQuick` → 11 commands, no `gsd-quick`; fake `ctx.inject` `:104-111` presence-gated |
| T9 | COMMANDS array + build/phaseNum/send helpers reused unchanged; gsdJobs (no slash command) has no sub-fiber | ✓ VERIFIED | `lib/commands.js:34-181` COMMANDS ×12 intact, helpers `:20-30`; `commandToCapability` built from `allCapabilities()` (`:188-191`); gsdJobs `commands=[]` (`_capabilities.js:66`) contributes no sub-fiber |
| T10 | Mount fake-ctx exposes `ctx.inject` that activates sub-fiber apply synchronously when its inject keys resolve, no-op when any missing | ✓ VERIFIED | `test/mount.test.mjs:104-111` synchronous presence-gated `ctx.inject`; suite green proves activation |
| T11 | Mount test still asserts 14 tools / 12 commands / 1 section / 1 context AND all 10 capability services | ✓ VERIFIED | `test/mount.test.mjs:212-215` (14/12/1/1), `:220-231` (10 capabilities) |
| T12 | Mount variant omitting one capability proves its command unregistered while other 11 stay | ✓ VERIFIED | `test/mount.test.mjs:234-252` |
| R1 (ROADMAP) | DEGR-01 delivered | ✓ | publishes present (T4/T5) |
| R2 (ROADMAP) | DEGR-03 delivered | ✓ | sub-fiber coeffect + negative no-dangling (T7/T8/T9/T12) |

## Score

**12/12 must-have truths verified** (0 failed, 0 behavior_unverified). All are backed by named passing tests (`test/mount.test.mjs`, `test/_capabilities.test.mjs`), so none require a bare "exists" judgment.

## Deferred Items

The following requirements are explicitly deferred to later milestones per CONTEXT scope and are NOT expected in this phase (correctly not implemented):
- DEGR-02 / DEGR-04 (persona + gsd_status rendering the loop from capabilities; STATE.md routing through available steps) → phase 22.
- DEGR-05 (per-plugin removal/reactivity suite) → phase 23.
- DEGR-06 / DEGR-07 (job-registry effect-scoping; `subagents` inject coeffect) → phase 24.
- Produces/consumes enforcement / broken-chain detection → phase 22 (metadata stored now, not enforced — confirmed).

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Verdict |
|---|---|---|---|---|
| `lib/_capabilities.js` | ✓ | 184 lines; exports `ROLES`, `CAPABILITY_KEYS`, `buildCapability`, `NOT_LOOP_ORDERED`, `allCapabilities` | Imported by `lib/commands.js:15` and all publishing plugins | PASS |
| `lib/core-tools.js` | ✓ | adds 2 `ctx.provide` in apply | Imports `buildCapability`; consumes `_capabilities.js` | PASS |
| 8 step plugins (`discuss/ui/plan/execute/verify/ship/quick/map-codebase`) | ✓ | one `ctx.provide` each | Import `buildCapability`; consume `_capabilities.js` | PASS |
| `lib/commands.js` | ✓ | 219 lines; per-command sub-fibers | `ctx.inject([capKey,"commands"])` + `ctx.commands.register`, gated on all 10 capabilities | PASS |
| `test/_capabilities.test.mjs` | ✓ | 11 tests / 4 suites | imports `ROLES, CAPABILITY_KEYS, buildCapability` from `lib/_capabilities.js` | PASS |
| `test/mount.test.mjs` | ✓ | extended `makeMountCtx` + capability + negative assertions | `ctx.inject` drives per-command sub-fibers | PASS |

## Key Link Verification

| Link from → to | Via | Status |
|---|---|---|
| `test/_capabilities.test.mjs` → `lib/_capabilities.js` | `import { ROLES, CAPABILITY_KEYS, buildCapability }` + per-key/role/chain/fail-loud assertions | WIRED |
| `lib/{core-tools,discuss,ui,plan,execute,verify,ship,quick,map-codebase}.js` → `lib/_capabilities.js` | `import { buildCapability }` + `ctx.provide("<KEY>", buildCapability("<KEY>"))` | WIRED |
| `lib/commands.js` → `lib/_capabilities.js` | `import { allCapabilities }`; `commandToCapability` map from descriptor `.commands` | WIRED |
| `lib/commands.js` → `ctx.commands` | each sub-fiber apply: `subCtx.commands.register({...})` returns disposer | WIRED |
| `test/mount.test.mjs` → `lib/_capabilities.js` | `import { CAPABILITY_KEYS }`; asserts each provided with shape | WIRED |
| `test/mount.test.mjs` → `ctx.inject` | `makeMountCtx` defines synchronous presence-gated `inject` | WIRED |

## Data-Flow Trace

1. `lib/_capabilities.js` is the single table (D-04) — all 10 descriptors originate here.
2. Each step/orient/jobs plugin calls `ctx.provide(key, buildCapability(key))` in `apply` → puts the descriptor into the mount `provided` store / live Cordis reflect store.
3. `lib/commands.js` builds `commandToCapability` from `allCapabilities()` and, per command, calls `ctx.inject([capKey, "commands"], subCtx => subCtx.commands.register(...))`.
4. When the capability is present the sub-fiber activates and registers exactly its one command; when absent (or withdrawn) it stays inactive / deactivates and the command is never (or no longer) registered — no dangling command.
5. `test/mount.test.mjs` exercises step 2's output (10 provided) and step 3's output (12 commands; 11 when `gsdQuick` withdrawn).

## Behavioral Spot-Checks

- Full suite `npm test` → **350 pass, 0 fail** across 83 suites (includes `mount.test.mjs` with the 14/12/1/1 + 10-capability + negative assertions, and `_capabilities.test.mjs` with 11 passing).
- Isolated behavioral run `node --test test/_capabilities.test.mjs` → 11 pass, 0 fail (chain-sort, role enum, D-04 mapping, fail-loud).

## Requirements Coverage

| REQ-ID | In scope | Delivered | Evidence |
|---|---|---|---|
| DEGR-01 | yes | delivered | 10 capabilities published (T4/T5/T11); mount asserts all 10 with shape |
| DEGR-03 | yes | delivered | per-command sub-fiber coeffect, negative no-dangling (T7/T8/T9/T12) |
| DEGR-02 | no (phase 22) | not required | persona/state rendering untouched (D-06); `git log` confirms no phase-21 commit |
| DEGR-04 | no (phase 22) | not required | STATE.md routing deferred |
| DEGR-05 | no (phase 23) | not required | removal suite deferred |
| DEGR-06/07 | no (phase 24) | not required | job-registry / subagents coeffect deferred |

## Anti-Patterns Found

None. No unreferenced `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`/`TODO` markers in any phase-21 file (`lib/_capabilities.js`, `lib/commands.js`, all publishing plugins, `test/_capabilities.test.mjs`, `test/mount.test.mjs`). No skipped/todo/cancelled tests (0 skipped, 0 todo in the suite run).

## Human Verification Required

None. All must-have truths are programmatically verified against source inspection plus passing named tests. No visual/real-time/external component. No `<verify><human-check>` blocks in the PLAN files. Behavior_unverified count = 0.

## Gaps Summary

No gaps. Status: **passed**.
