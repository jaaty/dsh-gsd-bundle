---
phase: 18-job-runtime-extensions
verified: 2026-08-28
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 18: job-runtime-extensions Verification Report

## Goal Achievement

Goal: "Extend the background-job runtime to launch subagent jobs, enforce timeouts/cancellation, expose a gsd_job launch tool, and support retry/queueing." Requirements: JOBX-01, JOBX-02, JOBX-03, JOBX-04.

All four requirements are delivered and verified against the actual codebase (lib/jobs.js, lib/job-wrapper.mjs, lib/state.js, lib/core-tools.js) plus the full 280-test suite, independent of SUMMARY claims.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T-01 | Background SUBAGENT jobs launch without awaiting, using a job-owned AbortSignal (not exec.signal), and report through the per-job result file; non-completed stopReason → failed | ✓ VERIFIED | lib/jobs.js `startSubagentRun` (lines 90-175): `new AbortController()` (101), `subagents.start(entry.provider \|\| "spawn", {...signal: ac.signal})` (104-110), `run.result.then(settle, errHandler)` (174), `run.dispose()` (152, 169), `blocksToText` import (22), result file written via ctx.fs (149-151). Tests pass: "subagent job runs to done... with a job-owned signal", "subagent non-completed stopReason flips to failed with reason 'error'". |
| T-02 | Per-job timeout enforced with distinct reason 'timeout' | ✓ VERIFIED | Shell: lib/job-wrapper.mjs timeout argv parse (28), timer `child.kill()` + `timeout: true` marker (79-84, 89-97); reconcileJobs writes `reason: {reason:'timeout'}` on `result.timeout === true` (234-235). Subagent: timeout timer sets `timedOut` flag + aborts controller (126-135); `.then` reads flag → reason 'timeout' (158). Tests pass: "shell job exceeding its timeout flips to failed with reason 'timeout'", "subagent timeout (timer abort) records reason 'timeout'". |
| T-03 | Cancellation with distinct reason 'cancelled'; no-throw for unknown/terminal | ✓ VERIFIED | lib/jobs.js `cancelJob` (182-203): shell kills + records 'cancelled' (198-201); subagent sets `rec.handle.cancelled = true` + aborts, `.then` records 'cancelled' and removes live entry (192-194). Unknown/already-terminal returns message, never throws (185-188). Tests pass: "subagent cancel records reason 'cancelled'...", "cancelJob never throws for an unknown or already-terminal job". |
| T-04 | gsd_job tool registered with launch/status/cancel/retry actions and shell/subagent kinds | ✓ VERIFIED | lib/core-tools.js: `name: "gsd_job"` (264), action enum ["launch","status","cancel","retry"] (267), kind enum ["shell","subagent"] (268), argv/prompt/timeout/id/max_retries schema (269-276); imports launchJob/cancelJob/retryJob/reconcileJobs (8). Execute delegates to domain (290, 294, 310, 320); unknown action returns message (324). Mount tests: EXPECTED_TOOL_NAMES includes gsd_job (175), 13 tools (196). |
| T-05 | gsd_job launch passes `parent: exec.agent` but NOT exec.signal for subagent (D-01) | ✓ VERIFIED | lib/core-tools.js execute (294-297): subagent launch passes `parent: exec.agent, timeout` only, no exec.signal; the job-owned AbortController in jobs.js binds the run. Shell launch passes argv array verbatim (290), no string→argv splitting (no injection surface). |
| T-06 | FIFO queue scheduler promotes pending→running up to concurrency, setting started on promote | ✓ VERIFIED | lib/jobs.js `scheduleJobs` (252-266): reads manifest, counts running, promotes pending up to `jobsCfg.concurrency`, calls startRun, guards pending-only (259), sets started via startRun→updateJob (80, 123). Wired into launchJob (59) and reconcileJobs (244). Test passes: "FIFO scheduler promotes only up to concurrency and preserves order". |
| T-07 | Manual retry creates a new attempt entry, marks old 'retried', respects max_retries | ✓ VERIFIED | lib/jobs.js `retryJob` (272-290): re-reads failed entry, appends new attempt with retryCount+1 (284-287), marks old `reason: {reason:'retried'}` (288), respects maxRetries cap (280). Tests pass: "retryJob creates a new attempt, marks the old entry 'retried'...", "retryJob never throws for an unknown or non-failed job". |
| T-08 | Config jobs block (timeout/concurrency/max_retries) resolves with safe defaults; manifest reason field persists and renders in gsd_status | ✓ VERIFIED | lib/state.js: `DEFAULT_JOBS_CONFIG` (32), `resolveJobsConfig` (38-42) degrades empty/partial/non-numeric (probe: empty→{60,2,3}, partial{timeout:5}→{5,2,3}, nonnumeric→{60,2,3}); `_defaultConfig` carries `jobs` block (177). `updateJob` persists caller reason object verbatim (430-440); `appendJob` preserves explicit `started` (418). gsd_status renders via `jobLine` helper (core-tools.js 17-23, 161). Test passes: gsd_status reason test asserts `[reason: timeout]` (tools.test.mjs 624). |

## Score

**8/8** must-have truths verified. 0 behavior-unverified, 0 failed.

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|----------|--------|-------------|-------|
| lib/jobs.js (launchJob, startRun, startSubagentRun, cancelJob, reconcileJobs, scheduleJobs, retryJob) | ✓ | ✓ (291 lines, exports all 5 domain fns) | ✓ imported by core-tools.js |
| lib/job-wrapper.mjs (timeout argv + kill) | ✓ | ✓ (timeout parse, timer, timeout:true marker) | ✓ spawned by startRun with timeout argv |
| lib/state.js (DEFAULT_JOBS_CONFIG, resolveJobsConfig, jobs block, reason/started plumbing) | ✓ | ✓ (exported helper + accessors) | ✓ consumed by jobs.js |
| lib/core-tools.js (gsd_job tool, jobLine) | ✓ | ✓ (full schema + execute, 333 lines) | ✓ registered via defineTool, 13 tools |
| test/jobs.test.mjs (14 tests) | ✓ | ✓ | ✓ pass |
| test/tools.test.mjs (gsd_job + reason tests) | ✓ | ✓ | ✓ pass |
| test/state.test.mjs (config + accessor tests) | ✓ | ✓ | ✓ pass |

## Key Link Verification

| Link | Status |
|------|--------|
| core-tools.js import → jobs.js domain fns | WIRED (line 8) |
| core-tools.js inject = ["gsdState", "tools"] (has ctx to fetch subagents) | WIRED (line 12) |
| gsd_job tool → launchJob/cancelJob/retryJob/reconcileJobs calls | WIRED (290, 294, 302, 310, 320) |
| jobs.js → state.js accessors (appendJob/updateJob/readJobs/readConfig/resolveJobsConfig) — single choke point, no raw node:fs for manifest | WIRED (22-23, jobs.js throughout) |
| job-wrapper.mjs result file `timeout: true` → reconcileJobs reason 'timeout' | WIRED (wrapper 93 ↔ jobs.js 234-235) |
| subagent `.then` → updateJob terminal status+reason (decoupled from reconcile) | WIRED (155-165) |
| cancel subagent flag → `.then` reads `cancelled` and removes live entry | WIRED (192-194 ↔ 159, 167) |
| scheduleJobs called from launchJob + reconcileJobs | WIRED (59, 244) |
| gsd_status Async Jobs → jobLine renders reason | WIRED (core-tools.js 161) |
| mount.test.mjs tool count 13 + EXPECTED_TOOL_NAMES has gsd_job | WIRED (175, 196) |
| ship.test.mjs cwdOf site count = 5 | WIRED (31) |

## Data-Flow Trace

1. **launch (shell)**: gsd_job action=launch → launchJob → appendJob(pending) → scheduleJobs → startRun → spawn(wrapper, detached) → wrapper runs cmd, writes <id>.result.json → reconcileJobs flips done/failed + reason.
2. **launch (subagent)**: launchJob → appendJob(pending) → scheduleJobs → startSubagentRun → subagents.start(job-owned signal) → run.result.then writes result file + updateJob(done/failed + reason) + dispose + live.delete. Not bound to exec.signal (survives the driving turn; not host restart — out of scope, D-01).
3. **status**: gsd_job action=status → reconcileJobs(refresh) → readJobs → jobLine(id) with reason.
4. **cancel**: gsd_job action=cancel → cancelJob — shell: updateJob(failed/cancelled)+kill; subagent: set cancelled flag + abort → `.then` records cancelled + removes live entry.
5. **retry**: gsd_job action=retry → retryJob → appendJob(new attempt) + updateJob(old retried) → scheduleJobs.
6. **gsd_status Async Jobs**: reconcileJobs (line 141) → readJobs → jobLine renders each entry with terminal reason.

## Behavioral Spot-Checks

Ran targeted suites (not the full suite for spot checks; full suite also run for regression):
- `node --test test/jobs.test.mjs` → **14 pass, 0 fail** (subagent run→done, subagent failed/error, shell timeout→'timeout', subagent timeout→'timeout', subagent cancel→'cancelled', cancel no-throw, FIFO concurrency, retry new-attempt/retried/max_retries, retry no-throw, corrupt-file no-throw).
- `node --test test/tools.test.mjs test/state.test.mjs` → **100 pass, 0 fail** (gsd_job launch shell/subagent→done, status not-found, cancel→cancelled, retry→new-attempt/retried, schema enum/properties, gsd_status `[reason: timeout]` rendering).
- `npm test` (full suite) → **280 pass, 0 fail** (69 suites).

## Requirements Coverage

| REQ-ID | Status |
|--------|--------|
| JOBX-01 (subagent background jobs) | ✓ delivered (T-01) |
| JOBX-02 (timeouts + cancellation) | ✓ delivered (T-02, T-03) |
| JOBX-03 (gsd_job tool) | ✓ delivered (T-04, T-05) |
| JOBX-04 (retry + queueing) | ✓ delivered (T-06, T-07) |

All 4 phase requirements covered.

## Anti-Patterns Found

None. No unreferenced TBD/FIXME/XXX/placeholder or skipped tests in the modified files. Grep for TODO/FIXME/XXX in `lib/` returned only comment/prose text in unrelated files (gates.js, _agents.js) — not debt markers.

## Human Verification Required

None. All success criteria are programmatically verifiable via the automated test suite and direct code/behavioural inspection. Subagent launch uses a fake `subagents` service in unit tests (the real host service is exercised at runtime), which is standard for a detached in-process service and does not require a human check.

## Gaps Summary

No gaps. The phase goal was ACTUALLY achieved: subagent background jobs, timeouts/cancellation with distinct reasons, the gsd_job tool, and retry/queueing are all implemented, wired end-to-end, and proven by 280 passing tests.
