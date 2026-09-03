---
phase: GSD-49-autonomous
plan: 01
subsystem: autonomous-orchestrator-scaffold
tags: [autonomous, capability, command, out-of-band, registration]
requires: []
provides: [gsd-autonomous.command, gsdAutonomous.capability, gsd_autonomous.tool, autonomous.mount]
affects: [lib/_capabilities.js, lib/autonomous.js, lib/commands.js, cordis.patch.yml, package.json, mount-harness, _capabilities.test, mount.test, coeffect.test, render.test]
tech-stack: [esm, dsh-tools, cordis-plugin]
key-files:
  created: [lib/autonomous.js]
  modified: [lib/_capabilities.js, lib/commands.js, cordis.patch.yml, package.json, test/helpers/mount-harness.mjs, test/_capabilities.test.mjs, test/mount.test.mjs, test/coeffect.test.mjs, test/render.test.mjs]
decisions: [D-01, D-02, D-07, D-08, D-10]
metrics:
  duration: "~0.5h"
  completed: "2026-09-02"
  tasks: 3
  commits: 4
status: complete
actuals:
  tokens: ~9000
---

# Phase 49 Plan 01: autonomous scaffold summary

Registers the gsdAutonomous out-of-band step capability, its gsd_autonomous tool, and the /gsd-autonomous command, and lands the thinnest end-to-end slice: ROADMAP-driven phase discovery plus a clean "nothing to do" no-op STATUS when every phase of the active milestone is Complete — the scaffolding plans 02 (orchestration) and 03 (tests) build on.

## What landed

- **`lib/_capabilities.js`** — appended `gsdAutonomous` to `CAPABILITY_KEYS` (22 keys) and added a `TABLE` row: `step: "autonomous"`, `role: "out-of-band"`, `tools: ["gsd_autonomous"]`, `commands: ["gsd-autonomous"]`, `order: NOT_LOOP_ORDERED`, `produces: ["VERIFICATION.md","STATUS"]`, `consumes: ["ROADMAP.md","STATE.md","CONTEXT.md"]` (D-01). Verified the descriptor builds correctly (`out-of-band`, order -1).
- **`lib/autonomous.js`** (new) — `{ name: "gsd-autonomous", inject: ["gsdState","tools","subagents"], apply(ctx) }` (D-02). Publishes the capability, registers the `gsd_autonomous` tool with fail-fast guards (gsdState unavailable / no project / unreadable ROADMAP), and exposes the pure `export function discoverPhases(roadmap)` helper that filters to `status !== "Complete"` and sorts by numeric `n` ascending (D-07/D-08). The tool returns a "nothing to do"/"0 remaining" STATUS banner when no phase remains, and a discovery-only "pending" stub loop for the non-empty case (replaced wholesale by plan 02). No subagent is spawned and no STATE mutation occurs in this plan (D-10).
- **`lib/commands.js`** — added the `/gsd-autonomous` COMMANDS entry; the existing `commandToCapability` + sub-fiber loop auto-pairs it to `gsdAutonomous`.
- **`cordis.patch.yml`** — inserted the `gsd-autonomous` → `@dsh-gsd/bundle/autonomous` row (after gsd-mempalace, before gsd-ship).
- **`package.json`** — added the `./autonomous` exports subpath.
- **`test/helpers/mount-harness.mjs`** — added the `{ id: "gsd-autonomous", sub: "autonomous" }` PATCH_ROW and updated the row-count comment (24 plugin rows).
- Registration-count assertions updated so `npm test` stays green: `_capabilities.test.mjs` (22 keys + `gsdAutonomous`), `mount.test.mjs` (tools 29 / commands 26 / capability keys 22 / subset commands 25 / insert rows 24 / tools-schema 29, plus expected tool & command lists), `coeffect.test.mjs` (`autonomous` in `SUBAGENT_DRIVEN_SUBS`), and `render.test.mjs` (`informationEntries` now includes `gsdAutonomous`).

## Verifications

- Task 1 probe: `buildCapability("gsdAutonomous")` prints `out-of-band -1 autonomous ["gsd_autonomous"] ["gsd-autonomous"] ["VERIFICATION.md","STATUS"] ["ROADMAP.md","STATE.md","CONTEXT.md"]`.
- Task 1 smoke: mounting the autonomous plugin provides `gsdAutonomous` and registers `gsd_autonomous`.
- Task 2/3 greps confirmed command/cordis/exports/harness wiring; the three target suites pass.
- Full suite: `npm test` → **899 pass / 0 fail, exit 0**.

## Commits (task-scoped, atomic)

1. `9973138` `feat(GSD-49-autonomous-01): add gsdAutonomous capability + autonomous tool with discovery and nothing-to-do no-op` (Task 1)
2. `6f91833` `feat(GSD-49-autonomous-01): wire /gsd-autonomous command + cordis row + exports subpath + mount-harness row` (Task 2)
3. `6c839c3` `test(GSD-49-autonomous-01): update hard registration-count assertions for the autonomous surface` (Task 3)
4. `1746b32` `test(GSD-49-autonomous-01): include gsdAutonomous in informationEntries ordering assertion` (Task 3 follow-up, discovered during full-suite verification)

## Acceptance criteria

- [x] `gsdAutonomous` builds a descriptor with `role: out-of-band`, `order: -1`, `tools: ["gsd_autonomous"]`, `commands: ["gsd-autonomous"]`, correct produces/consumes.
- [x] `lib/autonomous.js` registers the tool with inject deps `gsdState`/`tools`/`subagents` and a pure `discoverPhases` export; the nothing-to-do path returns a "nothing to do" banner naming the milestone and "0 remaining".
- [x] `/gsd-autonomous` command, cordis.patch.yml row, package.json exports subpath, and PATCH_ROW all land and are paired/mountable.
- [x] Registration-count suites pass with the new surface; full `npm test` green (899 pass).
- [x] No subagents spawned by plan 01; STATE is not mutated (D-10).

## Known Stubs

- The non-empty remaining-phases path is a **stub banner** (status "pending" + "driven by gsd_autonomous") — the actual orchestration (auto-derived CONTEXT write, per-phase autopilot dispatch, verify readback) lands in `GSD-49-autonomous-02`. This is intentional per the plan (`do not build the orchestration here`).

## Threat Flags

- None for the scaffold: no shell string interpolation (no git invocations in plan 01), no STATE authority escalation, no new runtime dependencies (D-12).

## TDD Gate Compliance

## Self-Check: PASSED

- [x] `lib/autonomous.js` exists (min_lines 60 exceeded).
- [x] `export function discoverPhases` present in `lib/autonomous.js`.
- [x] `lib/_capabilities.js` contains `gsdAutonomous` (key + TABLE row) and builds a valid descriptor.
- [x] Four task-scoped commits exist and the working tree is clean.
- [x] Full test suite passes (899/899).
