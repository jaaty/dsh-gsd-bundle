---
phase: 55-quick-batch
plan: 02
subsystem: commands
tags: [quick, batch, command, slash-command]
dependency_graph:
  requires: [GSD-55-quick-batch-01]
  provides: [gsd-quick-batch slash command]
  affects: [lib/commands.js]
tech-stack: [dsh-llm, cordis]
key-files:
  created: []
  modified: [lib/commands.js]
decisions: [D-01, DEGR-03]
metrics:
  duration: "~5 min"
  completed: "2026-09-07"
  tasks: 1
  commits: 1
status: complete
---

# Phase 55 Plan 2: quick-batch command Summary

Adds the `/gsd-quick-batch` slash command to the COMMANDS array so a user can trigger a quick batch from the command layer, paired to the gsdQuickBatch capability via the existing commandToCapability mechanism (DEGR-03).

## What was built

- **`lib/commands.js`** — added a new `gsd-quick-batch` entry to the `COMMANDS` array immediately after the existing `gsd-quick` entry (D-01):
  - `name: "gsd-quick-batch"`, `description` describing a batch of quick tasks each with its own subagent/record/atomic commit, `hint: "<task1> | <task2> | ..."`.
  - `build(raw)`: splits `raw.trim()` on the pipe separator `|`, trims each part, filters out empty parts; if the resulting array is empty returns `{ err: "Usage: /gsd-quick-batch <task1> | <task2> | ..." }`; otherwise returns `{ text: "Run the gsd_quick_batch tool with these tasks: <JSON>", ack: "Quick batch → gsd_quick_batch." }`.
  - No separate capability/tool registration added here — the `gsdQuickBatch` capability (plan 01) already advertises `commands: ["gsd-quick-batch"]`, so `commandToCapability` pairs it automatically and the capability-gated sub-fiber registers the command only while `gsdQuickBatch` is present (DEGR-03).

## Verification

- `node --check lib/commands.js` passes.
- All grep acceptance criteria pass: `name: "gsd-quick-batch"`, `gsd_quick_batch tool`, and `Usage: /gsd-quick-batch` all present in `lib/commands.js`.
- Per plan note, `npm test` is EXPECTED to print failures in wave 2 (hard-coded `EXPECTED_COMMAND_NAMES` / `ctx.commands.length === 30` in `test/mount.test.mjs` are only updated in plan 03 Task 1); this plan is judged by its grep criteria only.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The command is a thin router that injects a user-role message via the existing `send`/`createUserMessage` seam; it introduces no new git invocation, no shell strings, and no secrets/credentials.

## TDD Gate Compliance

This is a `type: execute` plan (not `type: tdd`), so no `test:`-before-`feat:` ordering is required. Command-pairing coverage lands in plan 03's test updates.

## Self-Check: PASSED

- Created files exist: `lib/commands.js` present and syntax-checked.
- Commit exists: `09983e1` (Task 1) on branch `phase-55`.
