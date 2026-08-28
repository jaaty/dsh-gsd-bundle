---
phase: 18-job-runtime-extensions
plan: 02
subsystem: jobs-runtime
tags: [jobs, subagent, timeout, cancel, scheduler, retry, manifest]
dependency_graph:
  requires: [GSD-18-job-runtime-extensions-01]
  provides: [unified-job-launcher, subagent-background-jobs, timeout-cancel-reasons, fifo-scheduler, manual-retry]
  affects: [lib/jobs.js, lib/job-wrapper.mjs, lib/core-tools.js]
tech-stack: [node:test, node:child_process, node:fs/promises, ESM, zero-dependency]
key-files:
  created: []
  modified: [lib/jobs.js, lib/job-wrapper.mjs, test/jobs.test.mjs]
decisions: [JOBX-01, JOBX-02, JOBX-04, D-01, D-02, D-03, D-04, D-06, D-07, D-08, D-09]
metrics:
  duration: ~30 min
  completed: 2026-08-28
status: complete
actuals:
  tasks: 3
  commits: 1
---

# Phase 18 Plan 02: Subagent Jobs, Timeout/Cancel, FIFO Scheduler and Retry Summary

Extended the jobs runtime domain to launch background SUBAGENT jobs that report through the same per-job result file as shell jobs (JOBX-01), enforce per-job timeouts and cancellation with distinct `timeout`/`cancelled` reasons (JOBX-02), and drain a real FIFO queue up to a concurrency limit with manual retry (JOBX-04) — all routing manifest writes through the state.js accessors and preserving the no-throw invariant on every path (D-09).

## Changes

- **lib/jobs.js**
  - Unified launcher: `launchJob(ctx, s, cwd, opts)` accepts `kind: "shell" | "subagent"`, records the job `pending` (with `attempts`, `timeout`, and the payload needed for retry), then drains through `scheduleJobs`. Returns the re-read entry so a caller sees `running` when under capacity. Effective per-job timeout = `opts.timeout ?? jobsCfg.timeout` (default from config, D-03).
  - New `live` in-flight registry (`jobId -> { kind, handle }`) that timeout/cancel reach into; the subagent `.then` is the only place a subagent entry is removed.
  - `startRun` — the canonical spawner: shell spawns the detached wrapper (new optional timeout argv); subagent fetches the host `subagents` service via `ctx.get("subagents")` and calls `subagents.start(entry.provider || "spawn", {...})` with a JOB-OWNED `new AbortController()` signal (never `exec.signal`), registering `run.result.then(settle, errHandler)` that maps the D-02 result-file shape, writes the file via `ctx.fs` (mkdir parent), always `run.dispose()`s (OQ-6), and records terminal `status` + structured `reason` DIRECTLY via `updateJob` (decoupled from reconcileJobs).
  - `cancelJob` (D-04): shell kills the child and records `failed`/`cancelled`; subagent sets the live `cancelled` flag and aborts the job-owned controller (the `.then` records `cancelled` and removes the live entry). Unknown/already-terminal → clear no-op message, never throws.
  - `reconcileJobs`: preserved the no-throw contract; now writes additive failure `reason` (`timeout` when the result file carries `timeout: true`, else `error`) WITHOUT clobbering an existing reason (D-08). Subagent jobs reconcile through the same result-file path — their `.then` normally writes the terminal state first; when reconcile runs in the narrow window before that, its reason-preserving write is a harmless fallback.
  - `scheduleJobs` (D-07): FIFO `pending→running` drain up to `jobs.concurrency`, setting `started` at real run start (OQ-5), guarding promotion to `pending`-only (R-3), called at the end of `launchJob` and `reconcileJobs`; corrupt manifest never throws (D-09).
  - `retryJob` (D-06): re-runs a failed job's payload as a NEW attempt entry (fresh `JOB-NN` via `appendJob`), annotates the old entry `reason.reason: 'retried'`, respects `max_retries`, and never throws for unknown/non-failed jobs.
- **lib/job-wrapper.mjs** — optional `timeout` argv (seconds, or `-`/absent for none — R-1 backward compatible); a timer kills the child and writes `{ error: "timeout", timeout: true }` (result `writeResult` now carries the `timeout` marker); the timer is cleared on a normal close so a finished run never triggers a false timeout.
- **test/jobs.test.mjs** — added 9 tests covering: subagent run→done with a job-owned signal, `spawn` provider positional arg, result-file write, and a `dispose` spy; subagent non-completed stopReason → `failed` with `reason.reason === 'error'`; shell timeout → `reason.reason === 'timeout'`; subagent timeout (timer abort) → `reason 'timeout'`; subagent cancel → `reason 'cancelled'` without pre-removing the live entry; cancel no-throw for unknown/terminal; FIFO concurrency (concurrency 1 → one running, FIFO promotion on reconcile); retry (new attempt id, old entry `retried`, `max_retries` refusal); retry no-throw.

## Verification

- `node --test test/jobs.test.mjs` → **14 pass, 0 fail**.
- `npm test` (full suite) → **270 pass, 0 fail** (was 261 before this plan).
- grep-verifiable: `new AbortController()`, `run.result.then`, `run.dispose`, `blocksToText`, `ctx.get("subagents")`, `subagents.start(entry.provider || "spawn"`, `export async function cancelJob/scheduleJobs/retryJob`, `result.timeout === true` in reconcileJobs, `reason: { reason: "cancelled"`, `.cancelled = true`, `scheduleJobs(ctx, s, cwd)` from both `launchJob` and `reconcileJobs`, and `child.kill()`/`timeout: true` in the wrapper.

## TDD Gate Compliance

This is a wave-2 execute plan with cross-referenced implementation tasks (Tasks 1–3 form ONE shared pass per the plan objective), so all three files landed together in a single atomic commit before the suite was run. No separate RED/GREEN commits were produced. Note as a deviation from strict RED-first — acceptable given the plan explicitly designated Tasks 1–3 as a single implementation pass.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

- `gsd_job` (the externally-triggerable launch surface) is implemented in plan 03; this plan only adds the underlying `launchJob`/`cancelJob`/`retryJob`/`scheduleJobs` domain. Shell launch still uses an argv array with no interpreter/string interpolation (no injection surface, unchanged from Phase 9).
- No new dependencies added (zero-dependency bundle preserved).

## Self-Check: PASSED

- `lib/jobs.js`, `lib/job-wrapper.mjs`, and `test/jobs.test.mjs` exist and contain the expected changes (verified by grep + the passing test suite).
- Commit `c851643` exists and contains only the three plan files (verified via `git show --stat`); no `.planning/` or unrelated files staged.
- Full test suite green (270 pass).
