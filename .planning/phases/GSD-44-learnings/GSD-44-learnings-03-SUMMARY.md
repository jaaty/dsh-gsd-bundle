---
phase: 44-learnings
plan: 03
subsystem: learnings
tags: [learnings, auto-on-ship, ship-hook, soft-gate, tdd]
requires:
  - "lib/learnings.js (gsd_extract_learnings tool + apply; plan 01)"
  - "lib/ship.js (execute body + preflightError pure-helper precedent)"
  - "lib/state.js (readConfig / _defaultConfig workflow.learnings flag)"
provides:
  - "lib/ship.js — pure exported runLearningsOnShip({ cfg, tools, phase, exec }) helper + ship:post auto-on-ship wiring"
affects:
  - "test/ship-async.test.mjs — export-shape regex relaxed to tolerate the new runLearningsOnShip member"
tech-stack: [ESM, node:test, defineTool, pure-helper]
key-files:
  created: []
  modified:
    - "lib/ship.js"
    - "test/learnings.test.mjs"
    - "test/ship-async.test.mjs"
decisions:
  - "D-10: runLearningsOnShip is a pure exported helper (mirrors preflightError) gated by workflow.learnings; finds the gsd_extract_learnings tool and calls execute({ phase, force: true }) inside try/catch; never blocks the ship"
  - "D-06: auto-run uses force:true — the just-shipped phase may already be in phases_extracted from a prior manual run; force re-extracts the final state"
  - "D-09/D-11: the tool's own execute already commits via commitArtifacts (D-11) and degrades to decisions-only on subagent fault (D-09), so never-block holds end-to-end; the hook adds no separate push (Claude's Discretion per D-11)"
  - "DEGR-05: a missing gsd_extract_learnings tool (learnings plugin retired) returns a not-registered/skipped line and never throws — ship keeps working"
metrics:
  duration: single session
  completed_date: 2026-09-01
  tokens: n/a
  tasks: 2
  commits: 2
  actuals:
    tests: 5
status: complete
---

# Phase 44 Plan 03: auto-on-ship learnings hook Summary

Added the best-effort auto-on-ship learnings extraction hook to `lib/ship.js` as a pure, exported, directly-testable helper (`runLearningsOnShip`) — mirroring the existing `preflightError` precedent — then wired it into the `execute` body after the completion commit so it fires for the just-shipped phase.

## What was built

- **lib/ship.js** — added `runLearningsOnShip({ cfg, tools, phase, exec })` (pure, no ctx/git/gsdState): gates on `cfg?.workflow?.learnings` (optional chaining defends against a missing workflow object), finds the registered `gsd_extract_learnings` tool via `tools.find(t => t.name === "gsd_extract_learnings")`, and invokes `tool.execute({ phase, force: true }, exec)` inside try/catch. Returns one log line: a skipped/disabled message (flag off), a not-registered/skipped message (tool absent, DEGR-05), a `learnings: <result>` line (success), or a `learnings: extraction failed (non-blocking): <cause>` line (tool threw, never-blocks-ship D-10). The helper is wired into `execute` after the completion commit + push block and before the final `log.push`/return, with `cfg`, `exec`, and `ctx.tools` already in scope. `force: true` is correct because the just-shipped phase may already be in `phases_extracted` from a prior manual run (D-06 force override). Added `runLearningsOnShip` to the module export statement.
- **test/ship-async.test.mjs** — relaxed the export-shape regex from `/export\s*\{\s*name,\s*inject,\s*apply,\s*preflightError\s*\}/` to `/export\s*\{\s*name,\s*inject,\s*apply,\s*preflightError(?:\s*,\s*runLearningsOnShip)?\s*\}/` so the new optional member is tolerated; no other assertion touched (fetchGitData await, cherry-pick/switch/push matches, and ship.test.mjs's cwdOf(exec) count of 5 are all unaffected — the pure helper adds no cwdOf(exec) call).
- **test/learnings.test.mjs** — appended a new `describe("learnings: runLearningsOnShip helper (auto-on-ship hook, D-10)")` block with 5 offline tests (no mount, no FakeFs, no git/gh, no gsdState) covering: flag-off skip (tool never called), flag-on success (force:true, result line), flag-on tool-throws (non-blocking, cause surfaced, never rejects), flag-on tool-absent (not-registered/skipped), and cfg-absent (optional-chaining defend).

## TDD Gate Compliance

- Task 1 committed `test(44-03):` first (RED) — the suite failed to load because `runLearningsOnShip` was not yet exported (`SyntaxError: does not provide an export named 'runLearningsOnShip'`), the expected RED state.
- Task 2 committed the `feat(44-03):` implementation (GREEN) — the suite then passed (30/30 learnings, 7/7 ship-async, 3/3 ship).
- First scope-matching commit is `test:` — satisfies the tdd_audit ship gate.

## Known Stubs

None. No TODO/FIXME/placeholder markers in the modified files. No skipped tests (`node --test` reports `skipped 0`).

## Threat Flags

None. No shell interpolation, no secrets, no untrusted input. The hook reuses the existing registered tool's `execute` (which commits via the fixed `-C cwd` argument-array `commitArtifacts` seam — D-11) and adds no raw git calls of its own. The pure helper takes only `{ cfg, tools, phase, exec }` and never touches the filesystem or git directly.

## Self-Check: PASSED

- `lib/ship.js` exports `runLearningsOnShip` (grep confirmed `export { name, inject, apply, preflightError, runLearningsOnShip }`).
- Commits exist: `7f33793` (test, RED), `8e410ab` (feat, GREEN).
- `node --test test/learnings.test.mjs` → pass 30 / fail 0 (exit 0).
- `node --test test/ship-async.test.mjs` → pass 7 / fail 0 (exit 0).
- `node --test test/ship.test.mjs` → pass 3 / fail 0 (exit 0).
- `runLearningsOnShip` is a pure helper (no ctx/git/gsdState params), mirroring the preflightError precedent.
- The hook is wired after the completion commit so it fires for the just-shipped phase with force:true (D-06/D-10).