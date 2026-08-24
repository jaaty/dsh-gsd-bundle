---
phase: 05-window-ledger
plan: 02
subsystem: status-surface
tags: [DUR-03, DUR-04, D-05, D-06, D-07, gsd_status, gsd_execute, presentation, integration]
requires: [GSD-05-window-ledger-01]
provides: [gsd_status Windows+AsyncJobs sections, gsd_execute window/job write-path producers, resume checkpoint reference]
affects: [lib/core-tools.js, lib/execute.js, test/tools.test.mjs]
tech-stack: [node, esm, node:test]
key-files:
  modified: [lib/core-tools.js, lib/execute.js, test/tools.test.mjs]
decisions:
  - D-05: gsd_status gains '## Windows' and '## Async Jobs' sections rendered from the plan-01 accessors, keeping the existing 'Stopped at:' continuity line as the last line.
  - D-06: Missing/corrupt ledgers render an explicit empty-section/warning line in gsd_status, never throwing (orientation surface must not crash).
  - D-07: gsd_execute's window entry carries the resumed plan id as a checkpoint reference on the resume path.
  - D-03/D-04: gsd_execute appends one WIN-<seq> window per run and a JOB-<seq> record per dispatched executor (running -> done/failed with result); registry only, no job runtime.
metrics:
  duration: ~18 min
  completed_date: 2026-08-24
  tasks: 3
  commits: 3
status: complete
---

# Phase 5 Plan 2: gsd_status Windows/Async-Jobs Surface & gsd_execute Write-Path Producers Summary

Surfaced the plan-01 WINDOWS ledger and async-jobs registry through gsd_status (two new sections, missing/corrupt-tolerant, continuity preserved) and wired gsd_execute's write-path so DUR-03/DUR-04 are demonstrable end-to-end: one window per run, one job per dispatched executor reconciled to done/failed with a result, and a resumed-plan checkpoint reference on the resume path (D-07).

## What was built

- **`lib/core-tools.js` (gsd_status)** — added `## Windows` and `## Async Jobs` sections after `## Blockers / Concerns` and before the existing `Stopped at:` line. Both are rendered purely from the plan-01 accessors (`s.readWindows(cwd)` / `s.readJobs(cwd)`), so missing files render `No windows recorded.` / `No jobs.` and corrupt ledgers render a short warning line (`WINDOWS.md is corrupt — windows unavailable.` / `async-jobs.json is corrupt — jobs unavailable.`). Each accessor call is wrapped in `.catch(() => ({ entries: [], corrupt: true }))` so gsd_status never throws over a bad ledger (D-06). The Windows section shows up to the 3 most recent entries (newest first). The final `Stopped at:` continuity line is preserved as the last line (D-05).
- **`lib/execute.js` (gsd_execute)** — added the DUR-03/D-04 write-path producers:
  - Captures `startedAt = nowIso()` and the current `step` from STATE once per run.
  - For every dispatched executor, appends a `JOB-<seq>` record (`kind: "subagent"`, `status: "running"`) and threads the `job` through the reconcile.
  - In the results handler, detects a `CHECKPOINT-<PP>` artefact (`checkpointed`) and reconciles each job to a terminal status: `done` + `checkpointed (resumable)` on a checkpoint stop, `done` + `SUMMARY written` on success, else `failed` + stopReason/output. `updateJob` records `completed` automatically. A missing job record (null from updateJob) is logged and tolerated, never thrown.
  - After the wave loop, appends exactly one `WIN-<seq>` window per run (`phase`, `step`, `summary: "Executed <done>/<total> plans"`), and on the resume path carries the resumed plan id as its `checkpoint` reference (D-07). Spawn counts are unchanged.

## Tests

- **`test/tools.test.mjs`** — new `gsd_status` cases: fresh project renders both empty sections + continuity; seeded windows/jobs render `WIN-01`/`JOB-01`; corrupt `async-jobs.json` and corrupt `WINDOWS.md` each render a warning, never reject, and keep `Stopped at:`. New `gsd_execute` cases: a successful run writes `.planning/WINDOWS.md` (WIN-01) and `.planning/async-jobs.json` (JOB-01, status `done`, result `SUMMARY written`); a checkpoint stop writes a done job whose result mentions `checkpoint` plus a window; the resume path carries the resumed plan id as the window's checkpoint reference.

**Test result:** `npm test` → 80 pass, 0 fail (full suite).

## TDD Gate Compliance

No TDD gate required — this is a non-TDD integration/presentation plan (all tasks `type="auto"` with co-located tests). No `test:`-then-`feat:` RED/GREEN split was specified.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced (grep scan clean).

## Threat Flags

- **Corrupt-ledger crash (highest-blast-radius risk)**: fully contained — gsd_status reads only through the plan-01 accessor choke point, which returns `{ entries, corrupt }` without throwing; the `.catch()` wrapper additionally guards against any unexpected accessor throw. Corrupt async-jobs.json / WINDOWS.md verified to render a warning line and keep continuity.
- `updateJob` returning `null` (job id absent) is handled gracefully (logged, not thrown).
- No new shell/network/subprocess surface; jobs are registry records only — gsd_execute never spawns additional subagents for the ledger (spawn counts unchanged).

## Self-Check: PASSED

- `lib/core-tools.js` renders `## Windows`, `## Async Jobs`, `No windows recorded`, `No jobs`, calls `readWindows(cwd)` and `readJobs(cwd)`, and keeps the `Stopped at:` line (all confirmed by grep + tests).
- `lib/execute.js` calls `appendWindow(cwd`, `appendJob(cwd`, and `updateJob(cwd`, and imports `nowIso` (confirmed by grep + compile via `node --check`).
- Three atomic commits, one per task (`feat(GSD-05-window-ledger-02): …`), all on `phase-5`; nothing staged beyond each task's files.
- All three plan `must_haves` truths and both `key_links` verified by grep + passing tests; full `npm test` passes (80/80).
