---
phase: 54-freeform-routing
plan: 02
subsystem: route-wiring
tags: [route, tool-registration, command-registration, capability-aware, integration, CLH-04]
dependency_graph:
  requires: ["GSD-54-freeform-routing-01 (lib/_route.js pure classifier)"]
  provides: ["gsd_route tool + /gsd-route command wired into the host", "test/route-integration.test.mjs"]
  affects: ["lib/_capabilities.js (gsdOrient descriptor)", "test/mount.test.mjs (counts)", "test/_capabilities.test.mjs (gsdOrient exact list)", "test/removal.test.mjs (core-tools retirement)"]
tech-stack: [node, esm, node:test, no-runtime-deps]
key-files:
  created:
    - "test/route-integration.test.mjs"
  modified:
    - "lib/core-tools.js"
    - "lib/commands.js"
    - "lib/_capabilities.js"
    - "test/mount.test.mjs"
    - "test/_capabilities.test.mjs"
    - "test/removal.test.mjs"
decisions:
  - "D-01: gsd_route tool + /gsd-route command registered under the existing gsdOrient capability key (per RESEARCH OQ-1)"
  - "D-02: execute path is recommend-only — classifies via classifyIntent and returns renderRouteRecommendation text, never auto-runs the routed tool, never reads/mutates STATE/ROADMAP"
  - "D-06/D-07: dispatch target set derived from present capability descriptors (availableCapabilities); never-instruct-a-missing-tool invariant"
  - "D-08: garbage intent falls back to gsd_status with a note, never throws"
  - "D-05: tied intent falls back to gsd_status with a clarifying note"
  - "D-10: absent-command degradation routes to nearest present loop step (effectiveRoutableStep) — never names the absent command"
  - "DEGR-03: /gsd-route paired to gsdOrient via the commands apply() loop; retiring gsd-core-tools withdraws both gsd_route and /gsd-route"
metrics:
  duration: "~1h"
  completed_date: "2026-09-07"
  actuals:
    tasks: 3
    commits: 3
status: complete
---

# Phase 54 Plan 02: freeform-routing route wiring Summary

Wired the pure intent classifier from Plan 01 into the host as a real tool + slash command: registered the `gsd_route` tool under the `gsdOrient` capability in `lib/core-tools.js`, added the `/gsd-route` command to `lib/commands.js`, updated the `gsdOrient` descriptor in `lib/_capabilities.js` to advertise both, reconciled the exact-count tests (`mount.test.mjs`, `_capabilities.test.mjs`, `removal.test.mjs`), and added the offline integration suite `test/route-integration.test.mjs`. The execute path is recommend-only (D-02): it classifies the intent and returns the recommended command text, never auto-running the routed tool and never reading/mutating STATE/ROADMAP (out-of-scope). The tool+command ride `gsdOrient`, so retiring `gsd-core-tools` withdraws both (DEGR-03).

## What was delivered

- **`lib/core-tools.js`** — added `import { classifyIntent, renderRouteRecommendation } from "./_route.js"` and registered the `gsd_route` tool (after `gsd_next`) under `gsdOrient`. The execute path gathers present capability descriptors via `availableCapabilities((k) => ctx.get(k))`, calls `classifyIntent(args.intent, descriptors)`, and returns `renderRouteRecommendation(result)` — recommend-only, no gsdState/cwd, no subagent spawn, no STATE mutation.
- **`lib/commands.js`** — added the `/gsd-route` command to the `COMMANDS` array (after `gsd-next`): `{ name: "gsd-route", description, hint: "<intent>", build(raw) }` returning `{ err }` on empty input or `{ text, ack }` otherwise. Paired to `gsdOrient` automatically by the existing `apply()` loop (DEGR-03).
- **`lib/_capabilities.js`** — appended `"gsd_route"` to the `gsdOrient` `tools` array and `"gsd-route"` to its `commands` array, so `capabilityForTool("gsd_route")` returns `"gsdOrient"`.
- **`test/route-integration.test.mjs`** (new, 4 tests) — offline integration suite mirroring `next-integration.test.mjs` (FakeFs + makeMountCtx + makeExec + CWD, no live boot/LLM/git): (1) tracer — `"discuss phase 3"` names `gsd_discuss`, STATE byte-identical, no auto-run; (2) garbage intent → `gsd_status` fallback, never throws; (3) tied intent `"review"` → `gsd_status` fallback with a clarifying note; (4) gsdDiscuss absent → degrades to nearest present step `gsd_plan`, never names `gsd_discuss`. Every test asserts the recommend-only/never-mutates-STATE invariant via `deepEqual(after, before)`.
- **`test/mount.test.mjs`** — reconciled tool count 32→33 and command count 29→30, added `gsd_route`/`gsd-route` to the EXPECTED lists, updated the schema test (32→33) and the DEGR-03 absent-capability command count (28→29).
- **`test/_capabilities.test.mjs`** — updated the gsdOrient exact-list deepEqual to include `gsd_route`/`gsd-route`.
- **`test/removal.test.mjs`** — extended the gsd-core-tools retirement test to assert `gsd_route` and `/gsd-route` are unregistered when `gsdOrient` is withdrawn (DEGR-03, never-instruct-a-missing-tool).

## Requirements addressed

- **CLH-04** — freeform routing: the `gsd_route` tool + `/gsd-route` command wired into the host, recommend-only, capability-aware, with the pure classifier from Plan 01 driving dispatch.

## Key decisions applied

- Registered under `gsdOrient` (per RESEARCH OQ-1) — no new plugin row, capability key, or subpath export.
- Dispatch is recommend-only, never auto-run (D-02) — the execute path returns text only and never reads/mutates STATE/ROADMAP.
- No new runtime dependencies; node builtins + existing pure helpers only.

## Verification

- `node --test test/route-integration.test.mjs` → 4/4 pass.
- `node --test test/mount.test.mjs test/_capabilities.test.mjs` → 28/28 pass.
- `node --test test/route-integration.test.mjs test/removal.test.mjs` → 21/21 pass.
- Full suite `node --test test/*.test.mjs` → 1030/1030 pass (up from 1026 in Plan 01 — the 4 new integration tests; no regressions).
- All plan acceptance criteria greps satisfied; all must_haves truths and artifacts verified.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests in the delivered files.

## Threat Flags

None. The execute path is recommend-only and never mutates STATE/ROADMAP; it never auto-runs a routed tool and never spawns a subagent. The never-instruct-a-missing-tool invariant is enforced by construction (dispatch target set derived from present descriptors) and proven by the integration degradation test and the removal test.

## Self-Check: PASSED

- `lib/core-tools.js` registers `gsd_route` (grep `name: "gsd_route"`), imports `./_route.js`, and calls `classifyIntent(args.intent` in the execute path.
- `lib/commands.js` has `name: "gsd-route"`; `lib/_capabilities.js` advertises `gsd_route`/`gsd-route` under `gsdOrient`.
- `test/route-integration.test.mjs` exists (4 tests, ≥ 80 lines) and covers recommend-only, fallback, ambiguity, and capability-aware degradation.
- `test/mount.test.mjs` asserts tool count 33 and command count 30; `test/_capabilities.test.mjs` gsdOrient exact list includes both; `test/removal.test.mjs` asserts both are unregistered on core-tools retirement.
- Three atomic commits on `phase-54`: `a346ae4` (Task 1), `cb60bda` (Task 2), `888a2bb` (Task 3).
- Working tree clean; full test suite green.
