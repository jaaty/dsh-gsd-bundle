---
phase: 22-reactive-loop-rendering
plan: 02
subsystem: rendering/routing
tags: [reactive-persona, runtime-context, capability-awareness, persona, snapshot]
dependency_graph:
  requires: ["GSD-22-reactive-loop-rendering-01 (lib/_render.js)", "phase 21 capability services (lib/_capabilities.js)"]
  provides: ["reactive persona section + capability-aware runtime-context snapshot consumed by the DSH host"]
  affects: ["lib/core-tools.js (gsd_status wiring lands in plan 03)"]
tech-stack: [node, esm, node:test, @deepseek-ai/cordis]
key-files:
  created: []
  modified:
    - "lib/persona.js"
    - "test/mount.test.mjs"
decisions:
  - "D-01/D-02: gsd:persona section becomes a per-assembly function; reads capabilities NON-reactively via ctx.get (never inject); names only present capabilities' tools"
  - "D-03/D-06/D-08: renderStateContext takes a getCap thunk and appends an ordered Available-steps annotation (loopSteps ascending) or the no-loop notice"
  - "gsd_status orienting surface gated on gsdOrient: 'Use gsd_status for the full STATE.md.' vs generic 'Use the available step tools for orientation.'"
  - "D-07: try/catch in both section and context providers keeps them never-throwing over absent/malformed capabilities"
metrics:
  duration: "~1 round"
  completed: "2026-08-28"
status: complete
actuals:
  tasks: 2
  commits: 2
  tests: 27 (mount + render), full suite 369 pass / 0 fail
---

# Phase 22 Plan 2: Reactive persona + runtime-context snapshot Summary

Made the two persona surfaces capability-reactive (DEGR-02): the `gsd:persona`
section body is now a per-assembly function that drops absent steps/tools, and
the `gsd:state` runtime-context snapshot routes/list only the currently-present
loop steps — never instructing a missing tool.

## Changes
- **`lib/persona.js`**: removed the static `PERSONA_TEXT`; the `gsd:persona`
  section registers `text: (context) => renderPersonaBody(availableCapabilities((k) => ctx.get(k)))`
  inside a never-throw try/catch (D-07). Reads capabilities NON-reactively via
  `ctx.get`, never `inject` (D-03), so a required coeffect never deactivates the
  persona fiber (D-02/D-06). `renderStateContext(context, gsdState, getCap)` now
  consumes `loopSteps(caps)` to append an ordered `Available steps:` annotation
  (ascending descriptor.order — D-08) or the D-06 no-loop notice, and gates the
  `gsd_status` orienting mention on the gsdOrient capability.
- **`test/mount.test.mjs`**: `makeMountCtx.ctx.get` now returns a stored
  capability descriptor from `ctx.provided` (so persona/snapshot read the subset
  of provided capabilities); the persona-section test evaluates `section.text()`
  as a function; the gsd_init smoke test asserts the `Available steps:`
  annotation and the gsdOrient-gated gsd_status mention.

## Requirements Addressed
- **DEGR-02**: persona body + snapshot omit absent steps and never name their
  tools; asserted the present-tool surface (gsd_status/gsd_quick on the full
  mount) and the capability-aware snapshot annotation.

## Key Decisions
- Section body as a per-assembly function following the already-used `context.text`
  function contract (RESEARCH OQ-1 verified both support function bodies).
- Available-step ordering single-sourced through `lib/_render.js` `loopSteps`
  (reused verbatim from plan 01); snapshot shows a concise ordered step list
  rather than the full `renderAvailableSteps` block (surface discretion per
  CONTEXT, D-08 ordering preserved).
- Dead `PERSONA_TEXT` removed; prose ownership moved into `renderPersonaBody`.

## Verification
- `node --test test/mount.test.mjs test/render.test.mjs` → 27/27 pass.
- Full `npm test` → 369 pass, 0 fail (no regressions).
- One commit per task (2 commits), atomic per-task file sets, both files staged.

## Known Stubs
- None (`lib/persona.js`, `test/mount.test.mjs` carry no TODO/FIXME/placeholder/
  skipped tests).

## Threat Flags
- No new security surface; no I/O, no shell, no network, no secrets. The one
  enforced guarantee — never advertising/instructing an absent step — is
  single-sourced through `lib/_render.js` and re-applied here, so persona and
  snapshot cannot drift from gsd_status (plan 03).

## Self-Check: PASSED
- Created files: none (modifies existing `lib/persona.js`, `test/mount.test.mjs`).
- Both required files exist and are modified as specified; acceptance criteria
  (renderPersonaBody/availableCapabilities/loopSteps/getCap in persona.js, and
  `section.text(` / `Available steps` in mount.test.mjs) grep-verified.
- Commits exist on `phase-22`: `7702007` (Task 1), `69e45e5` (Task 2), both
  scope `GSD-22-reactive-loop-rendering-02`.
