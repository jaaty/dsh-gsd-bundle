---
phase: 22-reactive-loop-rendering
plan: 04
subsystem: rendering/routing tests
tags: [subset-mount, reactivity, DEGR-02, DEGR-04, DEGR-06, offline-tests, mount-harness]
dependency_graph:
  requires: ["GSD-22-reactive-loop-rendering-01 (lib/_render.js)", "GSD-22-reactive-loop-rendering-02 (lib/persona.js)", "GSD-22-reactive-loop-rendering-03 (lib/core-tools.js)"]
  provides: ["offline subset-mount proof that persona/snapshot/gsd_status react to available step capabilities (DEGR-02/DEGR-04/D-06)"]
  affects: ["test/mount.test.mjs"]
tech-stack: [node, esm, node:test, @deepseek-ai/cordis]
key-files:
  created: []
  modified:
    - "test/mount.test.mjs"
decisions:
  - "D-11: makeMountCtx.get returns a stored capability descriptor from ctx.provided for any capability key (via provided.has), so persona/gsd_status read the mounted subset"
  - "applySubset(ctx, subs, config) helper applies only a chosen subset of the 12 PATCH_ROWS plugins, importing each subpath and wrapping errors with the offending id"
  - "Reactive describe-block: partial-loop, absent-next_action routing, zero-loop, and full-set regression scenarios, all offline"
  - "D-02 invariant: assertNoAbsentToolToken scans every gsd_* token and asserts its owning capability was provided in that mount"
  - "D-06: zero-loop asserts persona no-loop notice + snapshot no-available-step line + gsd_status 'no available loop step' without throwing"
  - "D-05: lib/state.js not touched; routing/rendering asserted read-time only"
metrics:
  duration: "~1 round"
  completed: "2026-08-28"
status: complete
actuals:
  tasks: 2
  commits: 1
  tests: 373 (4 new reactive mount tests; full suite green)
---

# Phase 22 Plan 4: Reactive subset-mount test harness Summary

Extended the offline mount harness with subset-mount + zero-loop test scenarios
proving the phase-22 reactivity contract end-to-end (D-11): the persona body and
runtime-context snapshot omit absent steps and never name their tools, gsd_status
hides/replaces an absent-step next_action and prints a correct## Available steps
section, and zero-loop/partial-loop degrade gracefully without throwing — all
without a live DSH boot.

## Changes
- **`test/mount.test.mjs`**:
  - `makeMountCtx.get` now resolves a capability descriptor from `ctx.provided`
    for any capability key (`provided.has(n) ? provided.get(n) : undefined`),
    after the `gsdState`/`subagents` special-cases — so the persona, gsd_status
    and the `_render` helper read the subset of capabilities actually applied.
  - New `applySubset(ctx, subs, config)` helper: locates each subpath in
    PATCH_ROWS, imports `@dsh-gsd/bundle/<sub>`, asserts `apply()` exists, calls
    it, and wraps any throw with the offending id (mirrors `applyAll`).
  - New top-level `describe("mount: reactive loop rendering (DEGR-02/DEGR-04)")`
    with a `mountSubset(subs)` helper and four scenarios:
    1. **Partial-loop** (persona+state+core-tools+discuss+plan; drop
       execute/verify/ship/ui/quick/map): persona body keeps the static core +
       present-step paragraphs + capability-driven tool mentions (gsd_status via
       gsdOrient, "the gsd_plan tools spawn them"), never names an absent tool;
       snapshot lists only `discuss, plan`.
    2. **Absent next_action routing**: with verify dropped, sets the stored
       `next_action` to `verify-phase`, asserts gsd_status rewrites it to
       `ship-phase` (nearest present step) rather than printing it verbatim, and
       shows a correct## Available steps section with only present loop steps.
    3. **Zero-loop** (persona+state+core-tools only): persona shows the no-loop
       notice, never names a loop tool; snapshot shows `No loop steps are
       currently available.`; gsd_status prints `Next action: no available loop
       step` and `- no available loop step` — never throwing.
    4. **Full-set regression** (all step plugins): persona/snapshot/gsd_status
       still render present steps/tools and the full ordered chain; gsd_status
       still advertises a stored `discuss-phase` whose capability is present.
  - Reusable `assertNoAbsentToolToken(ctx, text, label)` invariant scans every
    `gsd_*` token in an output and asserts its owning capability was provided in
    that mount — the DEGR-02/D-04 "never instruct a missing tool" check, asserted
    across all four scenarios.

## Requirements Addressed
- **DEGR-02**: subset-mount tests prove the persona body + snapshot omit absent
  steps and never name their tools (partial-loop scenario) while keeping present
  tools, and the no-absent-token invariant holds for persona + snapshot.
- **DEGR-04**: gsd_status hides/replaces an absent-step next_action and shows a
  correct Available-steps section (routing scenario); zero-loop and partial-loop
  degrade gracefully (D-06) without throwing.
- **D-11**: the offline mount harness applies a chosen plugin subset and routes
  ctx.get to the provided capability descriptors; the full per-plugin removal
  suite stays phase 23 (DEGR-05).

## Key Decisions
- The existing test already invoked the persona section `text` as a per-assembly
  function (plan-02 change); this plan keeps that pattern and asserts against the
  function's output.
- Scenarios initialise a project via the mounted `gsd_init` tool (state +
  core-tools provide gsdState) before asserting snapshot/gsd_status, matching the
  real assembly flow.
- Tool-naming assertions reflect actual `lib/_render.js` prose: `gsd_discuss` is
  not named in the discuss paragraph body, so present-tool presence is asserted
  via `gsd_status` (gsdOrient rule) and the fresh-context spawner rule, while the
  D-02 no-absent-token invariant is the load-bearing absent-check.
- `lib/state.js`, `lib/_render.js`, `lib/persona.js`, `lib/core-tools.js` are
  unchanged by this plan (test-only).

## Verification
- `node --test test/mount.test.mjs test/render.test.mjs` → 31/31 pass.
- Full `npm test` → 373 pass, 0 fail (no regressions).
- Grep: `provided.has(n)`, `applySubset`, `reactive loop rendering`,
  `Next action: no available loop step` all present in test/mount.test.mjs.
- Acceptance criteria met for both tasks; one atomic commit.
- Commit: `06a3744` on `phase-22`, scope `GSD-22-reactive-loop-rendering-04`.

## Known Stubs
- None. `test/mount.test.mjs` carries no TODO/FIXME/placeholder/skipped tests.

## Threat Flags
- No new security surface; pure test-file change. No I/O, no shell, no network,
  no secrets. The enforced guarantee — the offline suite proves persona/snapshot/
  gsd_status never advertise or instruct an absent step — is single-sourced
  through `lib/_render.js` (plans 01-03) and driven here by the no-absent-token
  invariant.

## Self-Check: PASSED
- Modified file exists and loads: `test/mount.test.mjs`.
- Commit exists: `06a3744` on `phase-22` with scope
  `GSD-22-reactive-loop-rendering-04`.
- All acceptance criteria met for both tasks; full test suite green.
