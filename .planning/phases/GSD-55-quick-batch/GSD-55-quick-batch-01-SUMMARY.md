---
phase: 55-quick-batch
plan: 01
subsystem: quick
tags: [quick, batch, capability, tool, persona]
dependency_graph:
  requires: []
  provides: [gsd_quick_batch tool, gsdQuickBatch capability, snapshot step dedup]
  affects: [lib/quick.js, lib/_capabilities.js, lib/persona.js]
tech-stack: [dsh-tools, schemastery, cordis]
key-files:
  created: []
  modified: [lib/quick.js, lib/_capabilities.js, lib/persona.js]
decisions: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09]
metrics:
  duration: "~10 min"
  completed: "2026-09-07"
  tasks: 3
  commits: 3
status: complete
---

# Phase 55 Plan 1: quick-batch tracer Summary

Adds the `gsd_quick_batch` tool and the `gsdQuickBatch` capability to the quick plugin, plus a snapshot step-list dedup, so multiple quick tasks run in one batch with per-task records, per-task atomic commits, and a structured per-task result list.

## What was built

- **`lib/_capabilities.js`** — added the `gsdQuickBatch` key to `CAPABILITY_KEYS` (immediately after `gsdQuick`) and a `TABLE` descriptor `{ step: "quick", role: "alternate", tools: ["gsd_quick_batch"], commands: ["gsd-quick-batch"], order: 25 }` (D-01).
- **`lib/quick.js`** — added a second `ctx.provide("gsdQuickBatch", buildCapability("gsdQuickBatch"))` and registered the `gsd_quick_batch` tool:
  - Sequential `for...of` over `args.tasks` (D-03, no `Promise.all`), each task spawning one fresh-context subagent via `spawnSubagent` (label `quick <slug>`), writing its own `.planning/quick/<date>-<slug>/TASK.md` via `writeQuickRecord` (D-05), committing atomically via `commitArtifacts(cwd, null, { scope: "quick", message })`, and best-effort `addDecision` (D-07).
  - Slug-collision dedup with a batch-local `Set` and `-2`, `-3`, … numeric suffixes applied before `dateSlug` (D-06).
  - Per-task try/catch failure isolation: a failed task writes a `## Error` TASK.md and pushes `{ slug, status: "failed", error }`, and the loop continues (D-04/D-09). Non-string/empty tasks push a `failed` result and continue.
  - Structured return `{ results, summary: { total, done, failed } }` (D-08) with an object `output.schema` and a `render` that formats one line per task plus a batch-complete line.
  - `presentCall` listing the task slugs.
  - Guards mirroring single `gsd_quick`: throws only on `gsdState`/`subagents` unavailability or a malformed/empty `tasks` array (D-09).
- **`lib/persona.js`** — deduped the snapshot `Available steps:` line via `[...new Set(loop.map((d) => d.step))]` so two capabilities sharing step `"quick"` render once.

## Verification

- `node --check` passes on all three modified files.
- All grep acceptance criteria for Tasks 1–3 pass (capability key + TABLE, `provide("gsdQuickBatch")`, `writeQuickRecord(cwd,`, `commitArtifacts(cwd, null, { scope: "quick"`, `spawnSubagent(ctx, exec,`, `summary: { total:`, `used.has(slug)`, `status: "failed"`, `## Error`, `presentCall`, `catch`, `new Set(loop.map`).
- Per plan note, `npm test` is EXPECTED to print failures in waves 1–2 (hard-coded capability/tool/command counts in `test/mount.test.mjs`, `test/_capabilities.test.mjs`, `test/render.test.mjs` are updated in plan 03 Task 1); this plan is judged by its grep criteria only.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The batch reuses the existing `commitArtifacts` seam (fixed `-C cwd` argument array, never a shell string) and introduces no new git invocation. No secrets or credentials touched.

## TDD Gate Compliance

This is a `type: execute` plan (not `type: tdd`), so no `test:`-before-`feat:` ordering is required. Automated coverage for the batch (slug dedup, failure isolation, structured return) lands in plan 03 Task 2's `gsd_quick_batch` describe block in `test/service-tools.test.mjs`.

## Self-Check: PASSED

- Created files exist: `lib/quick.js`, `lib/_capabilities.js`, `lib/persona.js` all present and syntax-checked.
- Commits exist: `1f87a93` (Task 1), `6c48d20` (Task 2), `845a49e` (Task 3) on branch `phase-55`.
