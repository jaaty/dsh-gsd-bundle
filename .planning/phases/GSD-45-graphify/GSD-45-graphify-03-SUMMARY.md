---
phase: 45-graphify
plan: 03
subsystem: graphify
tags: [graphify, ship, auto-on-ship, runGraphifyOnShip, tdd]
requires: [GSD-45-graphify-01]
provides: [runGraphifyOnShip auto-on-ship hook, workflow.graphify ship wiring]
affects: [lib/ship.js, test/graphify.test.mjs, test/ship-async.test.mjs]
tech-stack: [node, esm, @deepseek-ai/dsh-tools, node:test]
key-files:
  created: []
  modified: [lib/ship.js, test/graphify.test.mjs, test/ship-async.test.mjs]
decisions: [D-04, D-08, D-09, D-13]
metrics:
  duration: "~30m"
  completed: "2026-09-01"
  actuals:
    tasks: 2
    commits: 2
status: complete
---

# Phase 45 Plan 03: Auto-on-Ship Graphify Hook Summary

Added the best-effort auto-on-ship graphify hook to lib/ship.js as a pure, exported, directly-testable helper — `runGraphifyOnShip({ cfg, tools, exec })` — mirroring the `runLearningsOnShip` precedent, gated by `workflow.graphify`, wired into the execute body after the completion commit so the project-global graph rebuild fires for the just-shipped phase. TDD: helper tests added first (RED), then the helper + wiring (GREEN).

## What was delivered

- **`lib/ship.js`** (modified): added the pure exported `runGraphifyOnShip({ cfg, tools, exec })` helper (D-08). It takes NO ctx/git/gsdState/phase — only cfg, tools, exec — so it is unit-testable offline with a fake tools array (D-04 pure-helper discipline). Gated by `cfg?.workflow?.graphify` (optional chaining defends a missing workflow object); finds the registered `gsd_graphify` tool via `tools.find((t) => t.name === "gsd_graphify")`; invokes `tool.execute({ action: 'build' }, exec)` inside try/catch so a fault never blocks the ship (D-08 never-blocks). Returns a single log line: skipped / result / non-blocking-failure-with-real-cause / not-registered (DEGR-05). Wired into the execute body after the `runLearningsOnShip` call (step 10.6) and before the final `PR created` return, so the auto-run fires for the just-shipped phase. The tool's own execute already commits via `commitArtifacts` (D-09) and preserves the prior graph on failure (D-09). Added `runGraphifyOnShip` to the module export statement.
- **`test/graphify.test.mjs`** (modified): appended a `runGraphifyOnShip helper (auto-on-ship hook, D-08)` describe block with five offline tests (flag-off skip + tool never called; flag-on success calling `{ action: 'build' }` + result line; flag-on tool-throws → non-blocking + cause surfaced + never rejects; flag-on tool-absent → not-registered/skipped; cfg-absent → skipped). Imported `runGraphifyOnShip` from `../lib/ship.js`. No mount, no FakeFs, no git/gh — the helper is pure.
- **`test/ship-async.test.mjs`** (modified): relaxed the export-shape regex to make the new `runGraphifyOnShip` member optional, keeping the suite green after the export statement gained the member.

## TDD Gate Compliance

Compliant. The plan is `type: tdd`. Task 1 committed a `test:` commit (`478dd1b`) before any `feat:` commit; Task 2 committed the `feat:` GREEN commit (`a281926`). The first scope-matching commit is `test:`, satisfying the tdd_audit ship gate.

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests in the delivered files.

## Threat Flags

- The helper invokes the registered tool with a FIXED `{ action: 'build' }` object — no model-supplied value is interpolated into any shell command. No raw git in the helper; the tool's own execute reuses the shared `commitArtifacts` seam (D-09).
- No subagent is spawned by the hook — it only finds and invokes the already-registered `gsd_graphify` tool (D-03/D-08).
- The hook is best-effort and never blocks the ship: a tool throw is caught and surfaced as a non-blocking log line with the real cause (D-08).

## Self-Check: PASSED

- `lib/ship.js` modified and exports `runGraphifyOnShip` (grep confirmed).
- `test/graphify.test.mjs` modified with the helper tests (grep confirmed).
- `test/ship-async.test.mjs` modified (export-shape regex relaxed).
- Commits exist: `478dd1b` (test, RED) and `a281926` (feat, GREEN).
- `node --test test/graphify.test.mjs` exits 0 (29 pass, 0 fail).
- `node --test test/ship.test.mjs test/ship-async.test.mjs` exits 0 (10 pass, 0 fail).

## Notes / Deviations

- The full-suite failures in `test/_capabilities.test.mjs` (19→20 keys), `test/mount.test.mjs`, `test/render.test.mjs`, and `test/removal.test.mjs` are the cross-cutting count/key assertions that plan 01 explicitly documented as "intentionally RED until plan 02 repairs them" — they are plan 02's scope, not this plan's. This plan's three target suites (graphify, ship, ship-async) all pass.
- The helper takes NO `phase` param (unlike `runLearningsOnShip`) because the graph is project-global (D-04/D-08); the auto-run uses `{ action: 'build' }`.
- The hook does NOT push the graph files separately — the tool's execute already calls `commitArtifacts` which stages and commits `.planning` changes locally (D-09). A follow-up push is best-effort and acceptable (Claude's Discretion per D-13); not added.
