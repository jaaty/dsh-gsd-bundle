---
phase: 36-spec-phase
plan: 01
subsystem: capability-surface / loop-rendering / state-routing
tags: [spec-phase, capability, render, routing, pure-module]
requires: []
provides: [gsdSpec capability descriptor (order 5), spec persona paragraph + opener, spec STATE routing]
affects: lib/_capabilities.js, lib/_render.js, lib/state.js
tech-stack: plain ESM, node:test
key-files:
  created: []
  modified: [lib/_capabilities.js, lib/_render.js, lib/state.js, test/_capabilities.test.mjs, test/render.test.mjs]
decisions:
  - D-01: gsdSpec capability registered as role 'step', order 5, tools ['gsd_spec_phase'], commands ['gsd-spec-phase'], next ['gsdDiscuss'], produces ['SPEC.md'].
  - D-02: Spec persona paragraph added to STEP_PARAGRAPHS and the opener chain names Spec first.
  - D-08: spec routed to next_action 'discuss-phase' via an explicit _nextActionFor('spec') entry.
metrics:
  duration: null
  completed_date: 2026-08-31
status: complete
actuals:
  tokens: null
  tasks: 3
  commits: 3
---

# Phase 36 Plan 01: Spec-phase capability surface Summary

Wired the spec-phase loop step into the pure module surface: a gsdSpec capability descriptor at order 5 (before discuss), a spec persona paragraph + Spec opener in the loop chain, an explicit STATE routing to 'discuss-phase', and spec-aware expectations in the capability and render test suites.

## Tasks completed

1. **Add the gsdSpec capability descriptor (order 5)** — `lib/_capabilities.js`: inserted `"gsdSpec"` into `CAPABILITY_KEYS` between `gsdJobs` and `gsdDiscuss` (index 3), updated the doc comment to 11 keys, and added a `gsdSpec` TABLE row (step `spec`, role `step`, tools `['gsd_spec_phase']`, commands `['gsd-spec-phase']`, order 5, next `['gsdDiscuss']`, produces `['SPEC.md']`). Verified `buildCapability("gsdSpec")` returns the full documented shape.

2. **Render and route spec** — `lib/_render.js`: added a `gsdSpec` step paragraph to `STEP_PARAGRAPHS` (renders only when present) and prepended `Spec -> ` to the persona opener chain. `lib/state.js`: added an explicit `spec: "discuss-phase"` entry to `_nextActionFor` so routing is self-documenting rather than falling back to the default. Verified loopSteps puts gsdSpec first, effectiveRoutableStep("done") → gsdSpec, persona body contains the spec paragraph and Spec opener.

3. **Update capability + render test suites** — `test/_capabilities.test.mjs`: length 10→11, added `gsdSpec` to the key list, added `gsdSpec` to the step-role assertion, and a new test asserting gsdSpec is a step at order 5 (before discuss). `test/render.test.mjs`: prepended `gsdSpec` to `LOOP_ORDER`, updated the removed-step `loopSteps` expectation, updated `effectiveRoutableStep` fallback assertions ("done" → gsdSpec in both FULL and without-gsdDiscuss), and added the spec-first assertion to `renderAvailableSteps`. Both suites green.

## Commits

- `dcd5fc3` feat(36-01): add gsdSpec capability descriptor at order 5
- `baa70fe` feat(36-01): render and route spec step in persona and STATE
- `fb4be75` test(36-01): spec-aware capability and render expectations

## Cross-plan note

Running the full `npm test` shows two pre-existing (expected) failures in `test/mount.test.mjs` ("expected 10 capability keys, got 11" and "gsdSpec not provided") and `test/removal.test.mjs`. These are attributable solely to the `gsd-spec` plugin not yet being mounted — `lib/spec.js` and the mount/coeffect wiring land in sibling Wave-1 plans (mount-harness PATCH_ROWS, package exports, cordis.patch.yml, subagent coeffect). This plan's declared scope (the 5 files listed in files_modified) contains no mount/coeffect changes; the pure-module suites in scope all pass.

## Known Stubs

None.

## Threat Flags

No threat-surface changes introduced. No new dependencies; all git/artefact operations remain behind existing accessors (this plan makes no git or I/O calls — pure module + test edits only). The persona spec paragraph names only its own step and renders capability-gated, preserving the never-instruct-a-missing-tool invariant (verified by the render suite's assertNoAbsentTool).

## Self-Check

- Created/modified files exist: yes — `lib/_capabilities.js`, `lib/_render.js`, `lib/state.js`, `test/_capabilities.test.mjs`, `test/render.test.mjs`.
- Commits exist: `dcd5fc3`, `baa70fe`, `fb4be75` on branch `phase-36`.
- `node --test test/_capabilities.test.mjs test/render.test.mjs` exits 0 (31 pass); `node --test test/state.test.mjs` exits 0 (47 pass).

## Self-Check: PASSED
