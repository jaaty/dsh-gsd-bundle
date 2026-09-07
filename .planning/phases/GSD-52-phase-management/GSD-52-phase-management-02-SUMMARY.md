---
phase: 52-phase-management
plan: 02
subsystem: phase-management
tags: [plugin, tool, command, capability, integration, fail-closed, atomic-commit]
requires: [GSD-52-phase-management-01]
provides: [lib/phase-management-plugin.js, test/phase-management-git.test.mjs]
affects: [lib/_capabilities.js, lib/commands.js, package.json, cordis.patch.yml, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs]
tech-stack: [node, esm, dsh-tools, cordis]
key-files:
  created: [lib/phase-management-plugin.js, test/phase-management-git.test.mjs]
  modified: [lib/_capabilities.js, lib/commands.js, package.json, cordis.patch.yml, test/helpers/mount-harness.mjs, test/mount.test.mjs, test/_capabilities.test.mjs, test/render.test.mjs]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08]
metrics:
  duration: 0.4h
  completed: 2026-09-06
  actuals:
    tasks: 3
    commits: 4
status: complete
---

# Phase 52 Plan 02: phase-management plugin + tool + command Summary

Surfaced the Plan-01 pure domain as the interactive `gsd_phase` out-of-band tool: a new `gsd-phase-management` plugin publishes the `gsdPhaseManagement` capability, registers the `gsd_phase` tool (add/insert/remove/reorder/edit against ROADMAP.md + STATE.md with fail-closed validation and one atomic commit), and wires the `/gsd-phase-manage` slash command, package export, and cordis patch row — proven by a FakeFs+gitFn integration suite.

## What was built

- **`lib/phase-management-plugin.js`** (130 lines): the out-of-band loop-step plugin. `name = "gsd-phase-management"`, `inject = ["gsdState", "tools"]` (no sub-agent coeffect, DEGR-07). `apply(ctx)` publishes `gsdPhaseManagement` via `buildCapability` and registers `gsd_phase` with the full fail-closed orchestration: read ROADMAP/REQUIREMENTS/STATE → map args to an action object → `applyPhaseAction` (D-06 gate: `res.ok === false` throws before ANY write) → `writeRoadmap` (regenerates phase table + `## Progress` via stringifyRoadmap, D-05) → clear dangling `active_phase`/`current_phase` when the active phase is removed → `recomputeProgress` (D-05) → `addDecision` → one `commitArtifacts(cwd, null, { scope, message })` atomic commit (D-06). Uses the injectable `ctx.gitFn || defaultGitFn` seam like every other tool.
- **`lib/_capabilities.js`**: appended `gsdPhaseManagement` to `CAPABILITY_KEYS` (23→24) and added its `TABLE` row (`step: "phase-management"`, `role: "out-of-band"`, `tools: ["gsd_phase"]`, `commands: ["gsd-phase-manage"]`, `order: NOT_LOOP_ORDERED`, `consumes: ["ROADMAP.md","STATE.md"]`).
- **`lib/commands.js`**: added the `/gsd-phase-manage` COMMANDS entry whose `build` validates the action word (add|insert|remove|reorder|edit) and routes to `gsd_phase`.
- **`package.json`**: added `"./phase-management"` export → `./lib/phase-management-plugin.js`.
- **`cordis.patch.yml`**: added the `gsd-phase-management` plugin row (`@dsh-gsd/bundle/phase-management`).
- **`test/phase-management-git.test.mjs`** (298 lines, 10 tests / 4 suites): FakeFs+gitFn integration proving successful add/insert/remove/edit write ROADMAP (both tables) + recompute STATE progress; fail-closed atomicity (byte-identical ROADMAP/STATE after a throwing call, zero commits); the `--yes` confirm guard (active-phase and last-pending removal); dangling `active_phase` cleared on active-phase removal; and exactly one atomic commit per successful mutation with phaseNum null + the `phase-management` message.

## Key decisions applied

- **D-01/DEGR-01:** one `gsd_phase` tool + `/gsd-phase-manage` command, paired via the `gsdPhaseManagement` capability so the command registers only while the capability is present.
- **D-02/D-05:** renumbering ripples through ROADMAP + Progress + STATE only; `stringifyRoadmap` regenerates the Progress table and `recomputeProgress` recomputes STATE progress after every mutation.
- **D-03/D-08:** remove/reorder of Complete phases and reorder of the active phase are hard-blocked; remove of the active or last-pending phase requires `confirm:true` (`--yes`).
- **D-04/D-06:** every hard check runs on the proposed mutated doc before any write; on failure nothing is written (fail-closed) and no commit fires.
- **D-07:** add appends at `max+1`; insert/reorder renumber contiguously; edit covers name/goal/requirements/status toggle.

## Verification

- Task 1 tracer: `grep` confirms `gsd_phase`, `gsdPhaseManagement`, `applyPhaseAction`, `recomputeProgress`, `commitArtifacts`, `updateStateFrontmatter` all present; fail-closed gate (`res.ok === false`) precedes every write; `commitArtifacts(cwd, null, {` with message override.
- Task 2: `grep` confirms capability row, command, package export, and cordis row; `CAPABILITY_KEYS.length === 24`.
- Task 3: `node --test test/phase-management-git.test.mjs` → 10 pass / 0 fail.
- Full suite: `npm test` → 974 pass / 0 fail.

## Deviation from plan (documented)

The plan's `files_modified` omitted the registration-counter test harness, but adding a capability + tool + command breaks the fixed counters in `test/mount.test.mjs` (25→26 plugins, 30→31 tools, 27→28 commands, 23→24 capability keys), `test/helpers/mount-harness.mjs` (PATCH_ROWS +1), `test/_capabilities.test.mjs` (23→24 keys), and `test/render.test.mjs` (informationEntries +1). These were updated as part of Task 2 to keep `npm test` green (project constraint). Additionally, the plugin was given the injectable `ctx.gitFn || defaultGitFn` seam (matching add-tests/undo/validate/code-review) so the integration test can capture the atomic commit — the plan's literal `commitArtifacts(cwd, null, {...})` call omitted the gitFn argument, which would have hit real git in tests.

## Known Stubs

None. No TODO/FIXME/placeholder markers; no skipped tests.

## Threat Flags

None. The plugin routes all git through the existing `commitArtifacts` seam with fixed argument arrays (no shell interpolation, no credentials). The critical fail-closed guard (validate-before-write) lives in the domain layer (`applyPhaseAction`) and is re-checked in the tool before any `_write`/commit, as required by RESEARCH.md. No auth, no secrets, no sub-agent spawn.

## Self-Check: PASSED

- `lib/phase-management-plugin.js` exists (130 lines, ≥100 required) and exports `name`, `inject`, `apply`.
- `test/phase-management-git.test.mjs` exists (298 lines, ≥70 required).
- 4 atomic commits landed on `phase-52`: `6c22997` (Task 1), `522d140` (Task 2), `5adddcd` (Task 3), `ca81495` (render expectation).
- Full test suite green (974 pass / 0 fail); working tree clean.
