---
phase: GSD-49-autonomous
plan: 03
subsystem: autonomous-test-suite
tags: [autonomous, tests, offline, mount-harness, fake-subagents, verify-readback, never-advances-state, hard-failure]
requires: [GSD-49-autonomous-02]
provides: [autonomous.test-suite]
affects: [test/autonomous.test.mjs]
tech-stack: [esm, node:test, dsh-tools, cordis-plugin]
key-files:
  created: [test/autonomous.test.mjs]
  modified: []
decisions: [D-01, D-03, D-04, D-05, D-07, D-08, D-09, D-11, D-12]
metrics:
  duration: "~0.5h"
  completed: "2026-09-03"
  tasks: 3
  commits: 1
status: complete
actuals:
  tokens: ~2600
---

# Phase 49 Plan 03: autonomous test suite summary

Proves the gsd_autonomous feature (GAP-15) with an offline, deterministic node:test suite modeled on test/learnings.test.mjs — pure-helper assertions (buildAutoContext / buildAutopilotPrompt / discoverPhases) plus a fake-ctx mount, a controllable fake subagents factory capturing dispatch, a fake gitFn, and the never-advances-STATE invariant (D-10/D-12).

## What landed

- **`test/autonomous.test.mjs`** (all new, 387 lines) — modelled 1:1 on the learnings offline conventions (`FakeFs` + `makeMountCtx`/`makeExec`/`CWD` + `makeAutonomousSubagents` factory + `makeFakeGit`), covering every D-12 behaviour:
  - **Pure helpers**: `discoverPhases` filters `Complete` + sorts ascending by n (incl. null/no-phases no-op guard); `buildAutoContext` produces the `Mode: Auto-generated (discuss skipped — autonomous path)` marker, `Ready for planning`, the ROADMAP goal as `in_scope`, the `Phase 50` footer, and executor discretion; `buildAutopilotPrompt` names the base + phase, lists the `gsd_discuss → gsd_plan → gsd_execute → gsd_verify` sequence, and carries the `no recursion` / `do not call gsd_ship` guards (D-03/D-04/D-10).
  - **Capability/command/inject descriptors**: `gsdAutonomous` is `out-of-band`, `order: -1`, tools `["gsd_autonomous"]`, commands `["gsd-autonomous"]`, produces `STATUS`, consumes `ROADMAP.md`/`CONTEXT.md` (D-01); `/gsd-autonomous` command is registered and its handler routes to the agent with a success ack (D-01).
  - **No-op (D-08)**: all-complete ROADMAP → `nothing to do`, zero spawns.
  - **Auto-CONTEXT shape + dispatch order (D-05/D-07)**: phase without CONTEXT auto-derives one (marker + goal) and is committed; autopilots fire in numeric ascending order `[51, 52]`; each captured request carries `req.parent`.
  - **Skip-discuss-when-context-exists (D-05)**: a seeded human CONTEXT is left byte-identical, no auto-derive marker, the phase still reaches the autopilot.
  - **ROADMAP re-read (D-07)**: a `capture` hook that injects an extra phase at n=2 on the first spawn is picked up after the first phase passes — proves dynamically-inserted phases are discovered.
  - **Verify readback → STATUS (D-11)**: `status: passed` → `- Phase 1 (p1): passed` + `outcome: completed`.
  - **Hard-failure stop (D-09)**: `gaps_found` OR missing VERIFICATION OR autopilot spawn-throw → `outcome: stopped`, `resume: /gsd-autonomous`, stop reason names the phase (+`autopilot` step for a spawn-throw), and no later phase spawns (capture count stops at 1).
  - **Never-mutates-STATE (D-10)**: `status` / `next_action` / `active_phase` in STATE frontmatter are unchanged after a run.

## Verifications

- `node --test test/autonomous.test.mjs` → **15 pass / 0 fail**, exit 0.
- Full suite `npm test` → **914 pass / 0 fail**, exit 0 (was 899 before this plan).
- Acceptance greps all satisfy the plan: `buildCapability` / `gsd-autonomous` / `discoverPhases` / `makeAutonomousSubagents` / `nothing to do` / `Mode: Auto-generated` / `VERIFICATION` (8) / `no recursion` / `resume` (5) / `status` (30); `setActivePhase` literal count 0 (the never-mutates test compares STATE via `readState` frontmatter instead).
- The `resume: /gsd-autonomous` assertion is present in its regex form (`assert.match(res, /resume: \/gsd-autonomous/)`) — matches `/resume/i` as the plan allows.

## Known Stubs

- None. Every runtime path of the PLAN-02 driver (`runAutonomous`, `ensureAutoContext`, `drivePhase`, `readVerifyStatus`, `renderBanner`) is exercised by a fake subagents factory — no phase is ever really executed (R5), which is the intended offline posture. No runtime code in this plan is a stub.

## Threat Flags

- No shell string interpolation: all git operations stay behind the fake `gitFn`/`commitArtifacts` seam; no test touches real git or a real phase.
- No STATE authority escalation is exercised or enabled; the never-mutates-STATE test is the guard proving the tool is advisory (D-10).
- No new runtime dependencies (D-12); the suite is entirely offline (FakeFs + fake-ctx), so `npm test` needs no LLM/git/gh.

## TDD Gate Compliance

This is a `type: execute` plan (not `tdd`), so no test:-before-feat: ordering is mandated; the single commit is `feat:`-scoped. No violation.

## Dev notes (accepted deviations)

- **Single commit for a single-file plan**: the plan defines three tasks that all modify exactly one file (`test/autonomous.test.mjs`) as a cohesive, green-kept test suite authored in one pass. Since intermediate per-task states of the file are not reconstructible as independently-green commits (splitting a single test artifact would produce non-green intermediate commits and churn), the whole file was committed atomically as one `feat(GSD-49-autonomous-03)` commit. This honours the executor's atomic-commit + keep-every-commit-green rule over a literal one-commit-per-task split for a same-file plan.
- Each task's acceptance criteria are nonetheless satisfied by the full committed suite (Task 1: mount + pure helper + capability/command descriptors; Task 2: discovery/no-op/auto-CONTEXT/skip-discuss/dispatch factory tests; Task 3: verify readback/stop/resume/never-mutates tests).

## Self-Check: PASSED

- [x] `test/autonomous.test.mjs` exists and exceeds the 180-line minimum (387 lines).
- [x] `node --test test/autonomous.test.mjs` → 15 pass / 0 fail.
- [x] Full `npm test` → 914 pass / 0 fail, working tree otherwise clean.
- [x] `setActivePhase` literal count is 0; `resume: /gsd-autonomous` asserted; `no recursion` asserted.
- [x] Commit exists: `feat(GSD-49-autonomous-03): add offline gsd_autonomous behavioural test suite`.
