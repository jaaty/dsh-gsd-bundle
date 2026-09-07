---
phase: 54-freeform-routing
plan: 01
subsystem: intent-classifier
tags: [route, classifier, pure-helper, capability-aware, CLH-04]
dependency_graph:
  requires: []
  provides: ["lib/_route.js", "test/_route.test.mjs"]
  affects: ["lib/core-tools.js (gsd_route execute path, plan 02)", "lib/commands.js (/gsd-route, plan 02)"]
tech-stack: [node, esm, node:test, no-runtime-deps]
key-files:
  created:
    - "lib/_route.js"
    - "test/_route.test.mjs"
  modified: []
decisions:
  - "D-03: pure deterministic intent classifier (no LLM, no new runtime deps) in lib/_route.js"
  - "D-04: phase extraction via /\\bphase\\s*(\\d+)\\b/i with a bare-number fallback for phase-taking commands; option flags mirror lib/commands.js regexes"
  - "D-05: ambiguity (top-two scores tie) falls back to gsd_status, never guesses"
  - "D-06/D-07: dispatch target set derived from present capability descriptors; never-instruct-a-missing-tool invariant"
  - "D-08: empty/garbage intent returns gsd_status fallback with a note, never throws"
  - "D-09: phase-taking command with no phase notes the missing argument, never fabricates"
  - "D-10: absent-command degradation routes to nearest present loop step (effectiveRoutableStep) or gsd_status/present tool, never a different phase"
metrics:
  duration: "~1h"
  completed_date: "2026-09-07"
  actuals:
    tasks: 3
    commits: 3
status: complete
---

# Phase 54 Plan 01: freeform-routing intent classifier Summary

Built the pure, side-effect-free intent classifier core for the gsd_route router (CLH-04): `lib/_route.js` exports `classifyIntent`, `renderRouteRecommendation`, `FALLBACK_RECOMMENDATION`, and `hasCap`, mapping a plain-English intent string to one target GSD command plus extracted phase/options, evaluated capability-aware so absent steps/withdrawn tools are never recommended (D-07). The module performs no I/O and never mutates STATE/ROADMAP; it consumes only the intent string and the present capability descriptors. `test/_route.test.mjs` proves the intent→command matrix, weighted disambiguation, ambiguity, missing-phase, empty/garbage fallback, and the retired-capability never-instruct-a-missing-tool invariant.

## What was delivered

- **`lib/_route.js`** (551 lines) — pure ESM classifier mirroring `lib/_next.js`:
  - `classifyIntent(intent, descriptors)` → `{ matched, command, phase, options, ambiguity, missingArg, absentCapability, degraded, note }`.
  - `renderRouteRecommendation(result)` → `Run the <cmd> tool on phase N.` (never contains "auto-run", D-02).
  - `hasCap`, `FALLBACK_RECOMMENDATION = "gsd_status"`.
  - Internal helpers: `normalizeIntent`, `escapeRegex`, `extractPhase`, `extractOptions`, `matchCommand` (weighted scoring), `firstPresentTool`, `degrade`.
  - Full `SYNONYMS` table covering every routable command except `gsd_route` itself (avoids recursion); `PHASE_REQUIRED` set of 16 phase-taking commands.
  - `degrade()` routes absent loop-step commands to the nearest present step via `effectiveRoutableStep` (D-10), absent orient/out-of-band commands to `gsd_status` only when `gsdOrient` is present, else to a present tool or a generic orientation sentence (D-07).
- **`test/_route.test.mjs`** (159 lines) — 17 offline unit tests across three suites (tracer, full synonym matrix, capability-aware degradation), including the D-07 invariant sweep that retires each capability one at a time and asserts no absent tool is ever instructed.

## Requirements addressed

- **CLH-04** — freeform routing: the pure classifier that maps natural-language utterances to one target GSD command plus extracted parameters, capability-aware, recommend-only.

## Key decisions applied

- Registered under `gsdOrient` (per RESEARCH OQ-1) — the classifier is capability-aware but not state-aware; `gsd_next` remains the mutating smart-entry surface.
- Dispatch is recommend-only, never auto-run (D-02) — the renderer never emits an auto-run instruction.
- No new runtime dependencies; node builtins + existing pure helpers only.

## Verification

- `node --test test/_route.test.mjs` → 17/17 pass.
- Full suite `node --test test/*.test.mjs` → 1026/1026 pass (no regressions).
- All plan acceptance criteria greps satisfied; all must_haves truths and artifacts verified.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests in the delivered files.

## Threat Flags

None. The classifier is pure and side-effect-free; it never mutates STATE/ROADMAP and never auto-runs a routed tool. The never-instruct-a-missing-tool invariant is enforced by construction (dispatch target set derived from present descriptors) and proven by the retired-capability sweep.

## Self-Check: PASSED

- `lib/_route.js` exists (551 lines ≥ 120) and exports `classifyIntent`, `renderRouteRecommendation`, `FALLBACK_RECOMMENDATION`, `hasCap`.
- `test/_route.test.mjs` exists (159 lines ≥ 100).
- Three atomic commits on `phase-54`: `8bcf2b3` (tracer), `652f180` (full synonym table), `98b37fb` (capability-aware degradation).
- Working tree clean; full test suite green.
