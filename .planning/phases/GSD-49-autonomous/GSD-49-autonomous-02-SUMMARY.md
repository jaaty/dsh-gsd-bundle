---
phase: GSD-49-autonomous
plan: 02
subsystem: autonomous-orchestrator
tags: [autonomous, orchestration, autopilot, auto-context, verify-readback, hard-failure]
requires: [GSD-49-autonomous-01]
provides: [autonomous.driver, buildAutoContext, buildAutopilotPrompt, ensureAutoContext, drivePhase, readVerifyStatus, runAutonomous]
affects: [lib/autonomous.js]
tech-stack: [esm, dsh-tools, cordis-plugin]
key-files:
  created: []
  modified: [lib/autonomous.js]
decisions: [D-03, D-04, D-05, D-06, D-07, D-09, D-11, D-13]
metrics:
  duration: "~0.6h"
  completed: "2026-09-03"
  tasks: 3
  commits: 4
status: complete
actuals:
  tokens: ~8000
---

# Phase 49 Plan 02: autonomous orchestration summary

Implements the full autonomous orchestration engine — the auto-derived minimal CONTEXT write path, the single-fresh-context autopilot per phase, verify-status readback into a per-phase STATUS, ROADMAP re-read between phases, hard-failure stop, and the banner report — replacing the plan-01 stub loop.

## What landed

- **`lib/autonomous.js`** (all new orchestration, replacing the plan-01 stub non-empty branch):
  - **`buildAutoContext(phase)`** (exported, pure) — schema-faithful minimal CONTEXT.md string derived from a ROADMAP phase `{ n, name, goal, requirements }`: `# Phase <NN>: <name> - Context`, `**Gathered:** <iso>`, the exact `**Mode: Auto-generated (discuss skipped — autonomous path)**` marker, `**Status:** Ready for planning`, a `<domain>` block with `in_scope: <goal>`, a `<decisions>` block with a single `### Claude's Discretion` line granting full executor discretion, and neutral `<canonical_refs>` / `<code_context>` / `<specifics>` / `<deferred>` blocks plus the `*Phase: <NN>-<slug>*` footer (D-05).
  - **`ensureAutoContext(cwd, s, ctx, phase, exec)`** — skips with `{ wrote: false }` when a CONTEXT already exists (D-05 skip-discuss); otherwise acquires the `phase-<N>` feature branch via `ensurePhaseBranch` (settling Risk R2 / D-13 — the auto-CONTEXT write must not pollute the base branch and must leave a clean feature branch for a later gsd_ship preflight), writes via `s.writeArtifact`, and commits via the shared `commitArtifacts` seam (D-06). A thrown branch-acquire error propagates as a hard failure (D-09).
  - **`buildAutopilotPrompt({ base, phaseNum, phaseName })`** (exported, pure) — self-contained prompt naming the one phase by number and its artefact base, instructing the inline `gsd_discuss` (ONLY if no CONTEXT exists — re-check via gsd_status/hasArtifact rather than trust a note, R3) → `gsd_plan` → `gsd_execute` → `gsd_verify` sequence, and carrying the exact guard list "do not call gsd_autonomous (no recursion)", "do not call gsd_ship", "do not run any milestone-lifecycle tool" (D-04/D-10 — the child spawns with no toolFilter, so the prompt is the only recursion/ship/lifecycle defence).
  - **`drivePhase(cwd, s, ctx, exec, phase, roadmap)`** — ensures CONTEXT, resolves the phase base via `s.phaseDirAndBase`, spawns exactly one fresh-context autopilot via `spawnSubagent`, returns `{ ok, subagentOutput, dir }`, and returns `{ ok: false, step: "autopilot", reason }` on a spawn/run throw (D-03).
  - **`readVerifyStatus(cwd, s, phaseNum)`** — reads the VERIFICATION.md via `s.readArtifact` + `parseFrontmatter`, returning `{ status: "missing" }` for an absent/unparseable artefact and `frontmatter.status` otherwise; success is exactly `"passed"` (D-04/D-11). It does NOT issue the verify tool's routing (deferred per D-09).
  - **`runAutonomous(cwd, s, ctx, exec)`** — the multi-phase driver: reads ROADMAP, derives the milestone name, filters to incomplete phases via the existing `discoverPhases` (`status !== "Complete"` — reconciled in a code comment against D-07's `phase_complete !== true` phrasing), runs each in ascending `n`; per phase it ensures CONTEXT, dispatches the autopilot, reads the verify status back; stops on the FIRST hard failure (branch/context error, autopilot error, or non-`passed` verify) recording the failing phase + step and ceasing all later phases (D-09); re-reads ROADMAP and re-derives `remaining` after every successful phase (D-07, via an index-based scan with a `processed` phase-number set so inserted phases are caught wherever they land). Never calls `gsd_ship`, never runs milestone lifecycle, and never advances STATE (D-04/D-10). Nothing-to-do returns `{ outcome: "nothing_to_do" }` (D-08 no-op guard).
  - **`renderBanner(result)`** — the concise D-11 banner report: milestone header, per-phase `- Phase <n> (<name>): <status>` lines, overall outcome (`completed` | `stopped` | `nothing_to_do`), and for a stopped run a `stop reason:` line plus the `resume: /gsd-autonomous` command. The `gsd_autonomous` execute now guards + calls `runAutonomous` and returns `renderBanner(result)`.

## Verifications

- Task 1 probe: `buildAutoContext` returns a context containing the `Mode: Auto-generated` header and the phase goal as in_scope (printed `ok`, length 818).
- Task 2 probe: `buildAutopilotPrompt` contains `gsd_discuss`/`gsd_plan`/`gsd_execute`/`gsd_verify` and the base `GSD-50-add-tests`.
- Task 3 probe: `discoverPhases` filters the `Complete` phase and orders `[1, 3]` ascending.
- Combined probe: all three exported helpers (buildAutoContext / buildAutopilotPrompt / discoverPhases) load and return expected content.
- Full suite: `npm test` → **899 pass / 0 fail, exit 0**.

## Commits (task-scoped, atomic)

1. `bd7b8ae` `feat(GSD-49-autonomous-02): add buildAutoContext + ensureAutoContext auto-CONTEXT path` (Task 1)
2. `87cf8fd` `feat(GSD-49-autonomous-02): add buildAutopilotPrompt + drivePhase + readVerifyStatus` (Task 2)
3. `7e1fee3` `feat(GSD-49-autonomous-02): implement multi-phase orchestration driver + banner report` (Task 3)
4. `b62fcde` `fix(GSD-49-autonomous-02): pass ctx through to ensureAutoContext in the driver loop` (Task 3 follow-up)

## Acceptance criteria

- [x] `buildAutoContext` is exported and returns a schema-faithful minimal CONTEXT with the `Mode: Auto-generated (discuss skipped — autonomous path)` marker, `in_scope: <goal>`, `Ready for planning`, and executor discretion; `ensureAutoContext` acquires `phase-<N>` via `ensurePhaseBranch`, writes + commits via `commitArtifacts`, and returns `{ wrote: false }` when CONTEXT already exists.
- [x] `buildAutopilotPrompt` is exported, names the phase + base, instructs the exact `gsd_discuss → gsd_plan → gsd_execute → gsd_verify` sequence (skip-discuss via hasArtifact), and carries the explicit "no recursion" / "do not call gsd_ship" / "do not run any milestone-lifecycle tool" guards; `drivePhase` spawns via `spawnSubagent`; `readVerifyStatus` returns the VERIFICATION status with a "missing" fallback.
- [x] The `execute` drives every incomplete phase end-to-end (single autopilot subagent per phase), re-reads ROADMAP between phases, accumulates a per-phase STATUS, stops on the first hard failure with a banner + `resume: /gsd-autonomous`, and never ships / runs lifecycle / calls `setActivePhase` (count 0) / invokes gsd_ship as an executable tool (count 0 — only the forbiddance string + comments).
- [x] Full test suite green (899 pass); working tree clean after all 4 commits.

## Known Stubs

- The offline automated tests for this orchestration (mount + fake subagents factory covering dispatch shape, no-op, ordering, auto-CONTEXT shape, skip-discuss, hard-failure stop, never-mutates-STATE) land in `GSD-49-autonomous-03`. No runtime code in this plan is a stub.

## Threat Flags

- No shell string interpolation: all git calls are fixed-arg arrays via the shared `ensurePhaseBranch`/`commitArtifacts` seam; `spawnSubagent` passes fixed `{ label, promptText }` args with no toolFilter (the fresh child legitimately needs all gsd_* tools).
- No STATE authority escalation: the tool never forces a phase to "complete" and never calls the step-tool STATE writers; it is advisory at the run level (D-10). The `buildAutopilotPrompt` forbiddance text is the recursion/ship/lifecycle defence because a child spawns with full tool access.
- No new runtime dependencies (D-12).

## TDD Gate Compliance

This is a `type: execute` plan (not `tdd`), so no test:-before-feat: ordering is mandated; all task commits are `feat:`/`fix:`. The dedicated test plan (`GSD-49-autonomous-03`) covers the offline behavioural tests.

## Self-Check: PASSED

- [x] `lib/autonomous.js` exceeds the 170-line minimum (350 lines).
- [x] Exported `buildAutoContext`, `buildAutopilotPrompt`, `discoverPhases` present.
- [x] `spawnSubagent`, `ensurePhaseBranch`, `commitArtifacts`, `readArtifact`, `phaseDirAndBase`, `readRoadmap`, `resume: /gsd-autonomous` all present.
- [x] `setActivePhase` literal count is 0; executable `gsd_ship` call count is 0.
- [x] Four task-scoped commits exist and the working tree is clean.
- [x] Full test suite passes (899/899).
