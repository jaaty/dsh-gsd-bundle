---
phase: 22-reactive-loop-rendering
verified: 2026-08-29
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 22: Reactive Loop Rendering — Verification Report

**Status: passed · Score: 8/8 must-haves verified · behavior_unverified: 0**

## Goal Achievement

The phase goal — *re-render the persona, runtime-context snapshot, and gsd_status
from the available step capabilities so absent steps are skipped and no missing
tool is ever instructed* — is **achieved**. All three surfaces (persona body,
`gsd:state` snapshot, gsd_status/gsd_progress) are capability-aware through a
single pure helper (`lib/_render.js`), and the offline mount harness proves the
reactivity end-to-end by mounting a plugin *subset* and asserting absent steps are
omitted and never named.

The `summary`-claimed behaviours were independently confirmed against the source
and by executing the logic directly (NOT trusted from SUMMARY): the persona
section body is a per-assembly function dropping absent paragraphs, the snapshot
lists only present loop steps, gsd_status rewrites an absent-step `next_action`
to the nearest present step and prints a correct `## Available steps` section, and
the zero-loop case degrades gracefully everywhere.

## Observables Truths

Roadmap success criteria AND every PLAN `must_haves` (truths) are the must-haves.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A pure module `lib/_render.js` derives ordered loop-step + informational lists, an effective routable next step, and the persona body so absent steps are omitted/instructed-never | ✓ VERIFIED | `lib/_render.js` (248 lines) exports `availableCapabilities`, `capabilityKeyForNextAction`, `loopSteps`, `informationEntries`, `effectiveRoutableStep`, `renderAvailableSteps`, `renderPersonaBody`, `NO_LOOP_NOTICE`. Direct probe: `loopSteps(full)=discuss,ui,plan,quick,execute,verify,ship`; subset missing verify/quick → `discuss,ui,plan,execute,ship` (absent steps dropped). |
| 2 | `lib/_render.js` holds NO module-level ctx and performs NO I/O (pure-helper pattern) | ✓ VERIFIED | No `ctx` anywhere in module; only `import` is `./_capabilities.js`; all functions take capabilities in and return text/route out; no fs/io/http. Header documents the `lib/_shared.js` pure contract. |
| 3 | Persona `gsd:persona` section body is a per-assembly function naming only present capabilities' tools (D-01/D-02) | ✓ VERIFIED | `lib/persona.js:75-86` registers `text: (context) => renderPersonaBody(availableCapabilities((k) => ctx.get(k)))` inside try/catch. `renderPersonaBody` gates `gsd_status` on gsdOrient, `gsd_quick` on gsdQuick, and the fresh-context spawner on gsdPlan/Execute/Verify. Mount test asserts absent tools `gsd_execute`/`gsd_verify`/`gsd_ship`/`gsd_ui_phase`/`gsd_quick`/`gsd_map_codebase` never appear in the subset body. |
| 4 | Runtime-context `gsd:state` snapshot is capability-aware, shows loop position + ordered available steps (D-03/D-06/D-08) | ✓ VERIFIED | `lib/persona.js:33-62` `renderStateContext(context, gsdState, getCap)` consumes `loopSteps(caps)`, appends `Available steps: <present steps>` or `No loop steps are currently available`, and gates `gsd_status` orienting mention on gsdOrient. Mount test asserts `Available steps: discuss, plan.` in the partial-loop and the full chain in the full-set. |
| 5 | `gsd_status` rewrites/replaces a stored `next_action` whose step capability is absent, never advertising an absent step (D-04) | ✓ VERIFIED | `lib/core-tools.js:126-146` computes `caps = availableCapabilities((k)=>ctx.get(k))` and `routable = effectiveRoutableStep(fm.next_action, caps)`; the `Next action` line keeps the original only if its capability is present, else prints the nearest present step's `-phase`, else `NO_LOOP_NOTICE`. Mount test: stored `verify-phase` with gsdVerify dropped → `Next action: ship-phase` (NOT verbatim). |
| 6 | `gsd_status` prints an ordered `## Available steps` section, degrading to a no-loop message in the zero-loop case (D-04/D-06/D-08) | ✓ VERIFIED | `lib/core-tools.js:156-157` pushes `## Available steps` + `renderAvailableSteps(caps)`. Mount test asserts the section lists only present loop steps and omits gsdVerify/`verify:`. `render.test.mjs` + zero-loop test assert the `- no available loop step` line. |
| 7 | Offline mount harness applies a chosen plugin SUBSET and routes `ctx.get` to provided capability descriptors (D-11) | ✓ VERIFIED | `test/mount.test.mjs:140` `applySubset(ctx, subs, config)` imports only the chosen PATCH_ROWS plugins; `makeMountCtx.get` (line 94) returns `provided.has(n) ? provided.get(n) : undefined` after the gsdState/subagents special-cases. |
| 8 | Subset-mount tests prove (a) persona+snapshot omit absent steps/never name tools, (b) gsd_status hides/replaces absent next_action + correct Available-steps, (c) zero-loop/partial-loop degrade gracefully (D-11) | ✓ VERIFIED | `describe("mount: reactive loop rendering (DEGR-02/DEGR-04)")` has 4 passing scenarios: partial-loop persona+snapshot, absent next_action routing, zero-loop, full-set regression — all using the `assertNoAbsentToolToken` invariant. All 4 pass in the suite run. |

## Score

**8/8 must-have truths VERIFIED.** behavior_unverified: 0. No truth PRESENT_BEHAVIOR_UNVERIFIED.

## Deferred Items

Filtered against later/later milestones — correctly out of scope for this phase:

- **Broken-chain detection** (produces/consumes; plan absent ⇒ execute cannot run) — deferred by user decision; noted in CONTEXT out_of_scope and verified not implemented (routability depends only on capability presence, `effectiveRoutableStep`, D-10).
- **Automated per-plugin removal test suite** (DEGR-05) — explicitly phase 23; zero-loop/partial-loop here prove rendering/routing reactivity only, not plugin-retirement hygiene.
- **Background-job live-registry effect-scoping + subagents coeffect** (DEGR-06/07) — phase 24.
- **Pluggable milestone/phase/requirement tracking** — future milestone.

## Required Artifacts

| Artifact | Exists | Substantive | Wired | Notes |
|----------|:------:|:-----------:|:-----:|-------|
| `lib/_render.js` (plan 01) | ✓ (248 lines) | ✓ all 8 required exports present; NO_LOOP_NOTICE correct | ✓ consumed by persona.js + core-tools.js | Pure, no ctx, no I/O |
| `test/render.test.mjs` (plan 01) | ✓ | ✓ 19 tests | ✓ imports `../lib/_render.js` | Ordering, mapping, routing, persona omit + never-instruct invariant |
| `lib/persona.js` (plan 02) | ✓ (105 lines) | ✓ §body function; renderStateContext(getCap) | ✓ imports `./_render.js` | 2 commits; exports `{name,inject,apply}` |
| `lib/core-tools.js` (plan 03) | ✓ (388 lines) | ✓ gsd_status + gsd_progress routing | ✓ imports `./_render.js` | 2 commits; both closures use `availableCapabilities` |
| `test/mount.test.mjs` (plan 04) | ✓ (625 lines) | ✓ makeMountCtx.get extends; applySubset; 4 reactive scenarios | ✓ uses `provided.has(n)`, `section.text({` | 1 commit |

No artifact is missing or a stub.

## Key Link Verification

| Link | Pattern | Status |
|------|---------|:------:|
| `lib/_render.js` → `lib/_capabilities.js` (CAPABILITY_KEYS, capabilityForTool) | `import {...} from "./_capabilities.js"` (line 18) | **WIRED** |
| `test/render.test.mjs` → `lib/_render.js` | `import {...} from "../lib/_render.js"` (line 25); uses capabilityForTool (line 175) | **WIRED** |
| `lib/persona.js` → `lib/_render.js` (renderPersonaBody/availableCapabilities/loopSteps) | line 15 | **WIRED** |
| `lib/core-tools.js` → `lib/_render.js` (availableCapabilities/effectiveRoutableStep/renderAvailableSteps/NO_LOOP_NOTICE/capabilityKeyForNextAction) | line 11 | **WIRED** |
| `test/mount.test.mjs` ctx.get → provided capability descriptors | `provided.has(n) ? provided.get(n) : undefined` (line 94) | **WIRED** |
| `test/mount.test.mjs` persona section invoked as function | `section.text({` (lines 355, 455) | **WIRED** |

No key link is NOT_WIRED. 80%+ stub risk did not materialise — every link is exercised by a passing test.

## Data-Flow Trace

The capability-reactive rendering path is fully connected end to end (verified by
the subset-mount tests which mount a real plugin subset and drive the real
`renderStateContext` / `gsd_status.execute`):

1. Plugin `apply()` → `ctx.provide('gsdDiscuss'|…)` publishes each capability descriptor (phase 21).
2. `makeMountCtx.get` returns the descriptor for any capability key → `availableCapabilities((k)=>ctx.get(k))` collects only the present (subset) descriptors.
3. `loopSteps(caps)` / `informationEntries(caps)` → ordered loop + informational lists.
4. Persona: `renderPersonaBody(caps)` → static core + only present-step paragraphs → `text((ctx)=>…)` rendered per assembly.
5. Snapshot: `renderStateContext(ctx, gsdState, getCap)` → `Available steps: <present>` or no-loop notice.
6. gsd_status: `effectiveRoutableStep(fm.next_action, caps)` + `renderAvailableSteps(caps)` → rewritten `Next action` + `## Available steps`.
7. `assertNoAbsentToolToken` scans each output for `gsd_*` tokens and checks ownership in that mount → proves no missing tool is ever instructed.

This is a real data-flow through the capability store → helper → three surfaces,
not an existence-only stub.

## Behavioral Spot-Checks

One named test executed per behavior-dependent truth (not the full suite):
- `node --test test/render.test.mjs` → **19/19 pass** (ordering, mapping, effectiveRoutableStep fallback, Available-steps, renderPersonaBody omit-absent, never-instruct invariant).
- `node --test test/mount.test.mjs` → **12/12 pass** including the 4 reactive subset-mount tests across all 4 phases.
- Direct probe of `effectiveRoutableStep`: `verify-phase` with gsdVerify absent → `ship` (nearest greater present); with gsdVerify present → `verify`; zero-loop → `null`. Persona never-instruct probe on a subset → all `gsd_*` tokens (`gsd_status`, `gsd_plan`, `gsd_execute`) map to present capabilities, **0 violations**.
- Full `npm test` → **373 pass, 0 fail**.

## Requirements Coverage

| REQ-ID | Status | Evidence |
|--------|:------:|----------|
| **DEGR-02** (persona + runtime-context snapshot render from available step capabilities, skipping absent steps, never instructing a missing tool) | ✓ DELIVERED | persona `gsd:persona` section body function + `gsd:state` snapshot both consume `lib/_render.js`; partial-loop + zero-loop + full-set mount tests prove omission and the never-instruct invariant. |
| **DEGR-04** (gsd_status and the STATE.md step machine route only through available steps, so the loop never advances into an absent step) | ✓ DELIVERED | gsd_status + gsd_progress rewrite/replace an absent-step `next_action` via `effectiveRoutableStep`, print a capability-derived `## Available steps`, and never advertise an absent step; `lib/state.js` untouched (D-05), routing is a read-time wrapper. Mount test asserts `verify-phase` → `ship-phase`. |

Both phase REQ-IDs delivered. **2/2.**

## Anti-Patterns Found

- Unreferenced TBD/FIXME/XXX in touched files (`lib/_render.js`, `lib/persona.js`, `lib/core-tools.js`, `lib/_capabilities.js`, `test/render.test.mjs`, `test/mount.test.mjs`): **none** (grep across all six files). No `placeholder`/`not implemented` markers. No **BLOCKER** debt markers.

## Human Verification Required

None. All must-have truths are programmatically verified via the automated
subset-mount and unit tests, and via direct execution of the routing logic. No
visual/real-time/external-only checks are needed for this rendering/routing phase.

## Gaps Summary

No gaps found. Status: **passed**.

- phase goal: achieved
- must-haves: 8/8 verified
- key links: all WIRED
- requirements coverage: DEGR-02 ✓, DEGR-04 ✓
- anti-patterns: none
- human verification: none required
