---
phase: 09-job-runtime
plan: 01
subsystem: job-runtime
tags: [background-jobs, child-process, async-jobs, reconcile]
requires: []
provides: [launchJob, reconcileJobs, job-wrapper]
affects: [lib/state.js, lib/core-tools.js]
tech-stack: [node:child_process, node:fs/promises, node:test]
key-files:
  created: [lib/job-wrapper.mjs, lib/jobs.js, test/jobs.test.mjs]
  modified: []
decisions: [D-01, D-02, D-03, D-04, D-06]
metrics:
  duration: 2026-08-25
  completed: 2026-08-25
status: complete
---

# Phase 09 Plan 01: job-runtime — Summary

Built the real background-job runtime engine: a detached child wrapper that runs a shell command and writes a per-job result file, plus a jobs domain module (launchJob/reconcileJobs) that launches jobs asynchronously and reconciles their lifecycle (running → done/failed) in the async-jobs manifest. Delivers JOB-01 and the result-collection half of JOB-02.

## What was built

- **`lib/job-wrapper.mjs`** — standalone detached child script (`node lib/job-wrapper.mjs <jobId> <resultFile> <cmd...>`). Spawns the command as an argv array with **no interpreter/shell option** (D-01/D-02 security), captures stdout/stderr/exit code, and writes `.planning/jobs/<id>.result.json` via `node:fs/promises` (D-03 — the wrapper has no ctx). Any unexpected throw still writes a result file with the error captured.
- **`lib/jobs.js`** — the runtime domain. `launchJob` records the job `running` via `s.appendJob` (started timestamp set by the accessor, D-04), spawns the wrapper `detached: true` + `child.unref()` so the tool call returns immediately and the child survives (D-01 genuinely background), and returns the job record. `reconcileJobs` reads each `running` job's result file through `ctx.fs` with a stat-guard (missing file = still running), parses it in a try/catch (corrupt file = still running, never throws, D-06), and flips to `done` (exit 0) or `failed` (non-zero exit or error) via `s.updateJob`, which sets the `completed` finished timestamp on the first terminal transition (D-04). Returns `{ updated }`.
- **`test/jobs.test.mjs`** — 5 integration tests against a real temp dir + `realFsAdapter` (FakeFs cannot spawn processes): launch records a running JOB-01 with started timestamp; a real zero-exit child reconciles to `done` with captured stdout; a non-zero-exit child reconciles to `failed` with captured stderr; a running job with no result file stays running; a corrupt result file does not throw and leaves the job running.

## Verification

- `node --check` passes on both new lib modules.
- `node --test test/jobs.test.mjs` → 5/5 pass.
- Full suite `npm test` → 163/163 pass (no regressions).
- Wrapper manually exercised: zero-exit writes `exitCode:0` + stdout; non-zero-exit writes `exitCode:3` + stderr.

## TDD Gate Compliance

`tdd_mode: false` in config — tests written alongside implementation, not strictly before. Every task carried an automated verify (Nyquist). No gate violation.

## Known Stubs

None. No TODO/FIXME/placeholder markers in the new files.

## Threat Flags

- **Arbitrary process execution** (security-sensitive): the spawn boundary lives in the integration tier (`lib/job-wrapper.mjs`), a thin child-process boundary. The command is passed as an argv array with no interpreter option, so there is no command-string interpolation or injection surface. Exposure is limited this phase because there is no `gsd_job` launch tool (deferred) — the runner is exercised programmatically. No sandboxing is in scope (per CONTEXT deferred section).
- Detached children may briefly outlive the test process; tests poll for the result file with a bounded timeout and use short commands.

## Self-Check: PASSED

- `lib/job-wrapper.mjs` exists (83 lines ≥ 50), `node --check` ok.
- `lib/jobs.js` exists (73 lines ≥ 60), exports `launchJob` and `reconcileJobs`.
- `test/jobs.test.mjs` exists (119 lines ≥ 80), imports from `../lib/jobs.js`, uses `realFsAdapter` + `mkdtemp`, asserts running/JOB-01/done/failed.
- 3 atomic commits on `phase-9`: `253e7ca`, `d3a342c`, `31e06c5`.
