---
phase: 46-mempalace
plan: 02
subsystem: mempalace
tags: [mempalace, auto-hooks, discuss, plan, verify, ship, tdd]
requires: [GSD-46-mempalace-01]
provides: [GSD-46-mempalace-03, GSD-46-mempalace-04]
affects: [lib/discuss.js, lib/plan.js, lib/verify.js, lib/ship.js, test/ship-async.test.mjs]
tech-stack: [node, esm, dsh-tools]
key-files:
  created:
    - test/mempalace-hooks.test.mjs
  modified:
    - lib/discuss.js
    - lib/plan.js
    - lib/verify.js
    - lib/ship.js
    - test/ship-async.test.mjs
decisions: [D-07, D-11h, REQ-MP-06, OQ-3]
metrics:
  duration: "~20 min"
  completed: "2026-09-02"
  actuals:
    tokens: 0
    tasks: 2
    commits: 2
status: complete
---

# Phase 46 Plan 02: mempalace auto-hooks — Summary

Wired the best-effort mempalace auto-hooks into the loop tools (D-07): discuss.js fires recall at discuss:pre and capture at discuss:post; plan.js fires recall at plan:pre and capture at plan:post; verify.js fires capture at verify:post; ship.js fires capture at ship:post (re-filing SUMMARY.md, OQ-3). Each hook is a PURE, exported, directly-testable helper gated by mempalace.enabled + the relevant sub-key, wrapped so a fault NEVER blocks the loop step (onError: skip, REQ-MP-06).

## What was delivered

- **`lib/discuss.js`**: added two pure exported helpers `runMempalaceRecallOnDiscuss` (gated by `mempalace.enabled` + `recall_on_discuss`, invokes `gsd_mempalace_recall` with `{ phase }`) and `runMempalaceCaptureOnDiscuss` (gated by `capture_artifacts`, invokes `gsd_mempalace_capture` with `{ phase, artifact: "CONTEXT" }`, OQ-3). Wired into `execute`: recall at discuss:pre (after the guards, before CONTEXT assembly), capture at discuss:post (after `commitArtifacts`). Both log lines appended to the return string.
- **`lib/plan.js`**: added `runMempalaceRecallOnPlan` (gated by `recall_on_plan`, `{ phase }`) and `runMempalaceCaptureOnPlan` (gated by `capture_artifacts`, `{ phase, artifact: "PLAN" }`, OQ-3). Wired recall at plan:pre (before research) and capture at plan:post (after `commitArtifacts`).
- **`lib/verify.js`**: added `runMempalaceCaptureOnVerify` (gated by `capture_artifacts`, `{ phase, artifact: "SUMMARY" }`, OQ-3). Wired capture at verify:post (after `commitArtifacts`); the line is included in the return.
- **`lib/ship.js`**: added `runMempalaceCaptureOnShip` (gated by `capture_artifacts`, `{ phase, artifact: "SUMMARY" }`, OQ-3). Wired at ship:post alongside the learnings/graphify hooks (after the completion commit + push).
- **`test/mempalace-hooks.test.mjs`** (36 tests): pure-helper tests for all six hook helpers — gating by `mempalace.enabled` + sub-keys, correct artifact arg per loop point, never-block on fault (REQ-MP-06), tool-absent skip (DEGR-05), and absent-cfg skip (optional chaining).
- **`test/ship-async.test.mjs`**: updated the static export-list regex to allow the new `runMempalaceCaptureOnShip` export (a necessary consequence of the ship.js change).

## TDD Gate Compliance

Compliant. Task 1 committed a `test(46-02):` commit (RED — helpers not yet exported, import failed) before Task 2's `feat(46-02):` commit (GREEN — all 36 hook tests pass). The `test:` commit precedes the `feat:` commit, satisfying the tdd_audit ship gate for a `type: tdd` plan.

## Known Stubs

None. All six hook helpers are fully implemented and wired. The `gsd_mempalace_capture` tool body (staging + mine + room mapping + idempotency + mirror_kg) is already implemented in `lib/mempalace.js` from plan 01 and is not a stub.

## Threat Flags

- The auto-hooks invoke the registered `gsd_mempalace_recall` / `gsd_mempalace_capture` tools by name; each helper is wrapped in try/catch so a tool fault is surfaced as a non-blocking log line and never rejects the loop step (REQ-MP-06). No new exec seam, no shell interpolation, no raw git added in this plan — the hooks only call the already-injectable tool `execute` seam.
- `test/ship-async.test.mjs` was updated to accommodate the new ship.js export; the full suite is green (815 pass, 0 fail).

## Self-Check: PASSED

- `test/mempalace-hooks.test.mjs` exists (≥ 120 min_lines) and all 36 tests pass (`node --test test/mempalace-hooks.test.mjs` → 36 pass, 0 fail).
- All six helpers exported: `runMempalaceRecallOnDiscuss`/`runMempalaceCaptureOnDiscuss` in `lib/discuss.js`, `runMempalaceRecallOnPlan`/`runMempalaceCaptureOnPlan` in `lib/plan.js`, `runMempalaceCaptureOnVerify` in `lib/verify.js`, `runMempalaceCaptureOnShip` in `lib/ship.js`.
- Hooks wired: `gsd_mempalace_recall` referenced in `lib/discuss.js` (recall at discuss:pre), `gsd_mempalace_capture` referenced in `lib/ship.js` (capture at ship:post).
- Full suite: `node --test test/*.test.mjs` → 815 pass, 0 fail.
- Commits: `9e6c5cc` (test RED), `be878dd` (feat GREEN). Working tree clean.
