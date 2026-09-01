---
phase: 45-graphify
plan: 02
subsystem: graphify
tags: [graphify, knowledge-graph, registration, capability, render, commands, mount]
requires: [GSD-45-graphify-01]
provides: [gsdGraphify registration surface, /gsd-graphify command, ./graphify export, gsd-graphify patch row, PATCH_ROWS entry]
affects: [lib/_render.js, lib/commands.js, cordis.patch.yml, package.json, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/render.test.mjs, test/_capabilities.test.mjs]
tech-stack: [node, esm, @deepseek-ai/dsh-tools, node:test]
key-files:
  created: []
  modified: [lib/_render.js, lib/commands.js, cordis.patch.yml, package.json, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/render.test.mjs, test/_capabilities.test.mjs]
decisions: [D-01]
metrics:
  duration: "~30m"
  completed: "2026-09-01"
  actuals:
    tasks: 2
    commits: 2
status: complete
---

# Phase 45 Plan 02: Graphify Registration Surface Summary

Wired the full registration surface for the gsdGraphify capability (order 54) and repaired every existing test assertion that the new 20th capability broke, so the full test suite passes with the capability integrated.

## What was delivered

- **`lib/_render.js`**: added a `gsdGraphify` entry to `STEP_PARAGRAPHS` (after `gsdLearnings`, before `gsdQuick`) so the persona renders a "- Graphify:" step paragraph when the capability is present. No `NEXT_ACTION_TO_STEP` entry (graphify is an advisory off-loop step that never advances STATE, per D-10).
- **`lib/commands.js`**: added the `/gsd-graphify` command entry (build|status|query <term>) to the COMMANDS array, auto-paired to the gsdGraphify capability via `commandToCapability`.
- **`cordis.patch.yml`**: added the `gsd-graphify` plugin row (`@dsh-gsd/bundle/graphify`) in the insert block after `gsd-learnings`, with a comment explaining the advisory step.
- **`package.json`**: added the `./graphify` subpath export → `./lib/graphify.js`.
- **`test/helpers/mount-harness.mjs`**: added `{ id: "gsd-graphify", sub: "graphify" }` to `PATCH_ROWS` (22 entries, was 21), so the DEGR-05 removal suite auto-extends to include gsdGraphify.
- **`test/mount.test.mjs`**: bumped tool count 23→24, command count 20→21, capability count 19→20, insert rows 21→22, plugin count 21→22, added `gsd_graphify`/`gsd-graphify` to the expected tool/command name lists, added `graphify` to the full-set mountSubset subs array, and extended the Available-steps snapshot regex to include `graphify`.
- **`test/render.test.mjs`**: appended `gsdGraphify` to `LOOP_ORDER`, the loopSteps(subset) expected array, and the `without(...)` list in the no-greater-slot routing test.
- **`test/_capabilities.test.mjs`**: bumped the known-keys length assertion 19→20, the test name to "exposes exactly the 20 known keys", and appended `"gsdGraphify"` to the known-keys array literal.

## TDD Gate Compliance

N/A — this plan is `type: execute` (not tdd). It is the registration-surface companion to plan 01's TDD work; no new behaviour is introduced, only the wiring and the mechanical count/regex/list assertion updates.

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests in the delivered files.

## Threat Flags

- No new security surface. The `/gsd-graphify` command build function only parses the raw input with regexes and returns instruction text; it never interpolates user input into a shell command or a git argv.
- The `gsdGraphify` capability descriptor (order 54, role step, tools `['gsd_graphify']`, commands `['gsd-graphify']`, produces `['graph.json','GRAPH_REPORT.md']`) was added in plan 01; this plan only wires its registration surface and updates the assertions that the new capability breaks.

## Self-Check: PASSED

- `lib/_render.js`, `lib/commands.js`, `cordis.patch.yml`, `package.json`, `test/helpers/mount-harness.mjs` modified (Task 1).
- `test/mount.test.mjs`, `test/render.test.mjs`, `test/_capabilities.test.mjs` modified (Task 2).
- Commits exist: `de84e90` (feat, Task 1) and `f7a5042` (test, Task 2).
- `node --test test/_capabilities.test.mjs test/mount.test.mjs test/render.test.mjs test/removal.test.mjs` exits 0 (62 pass, 0 fail).
- `npm test` exits 0 (781 pass, 0 fail).

## Notes / Deviations

- The `gsdGraphify` STEP_PARAGRAPHS entry was placed after `gsdLearnings` and before `gsdQuick` in the object literal, matching the plan's guidance (the object is keyed by capability key; iteration order follows CAPABILITY_KEYS).
- The paragraph line begins with exactly "- Graphify:" so the removal test's `capLabel` derivation (`step[0].toUpperCase() + step.slice(1)` → "Graphify") and its `!body.includes("- Graphify:")` assertion hold after retirement.
- `test/removal.test.mjs` was NOT modified — it auto-extends via `STEP_CAPS`/`retirementMatrix` and passes unchanged (the gsdGraphify retirement row routes to the discuss-phase fallback, identical to learnings' already-passing behaviour).
