---
phase: 09-job-runtime
verified: 2026-08-25
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 9: job-runtime Verification Report

## Goal Achievement

**Goal:** Implement a real background-job runtime: a job runner that actually executes a job asynchronously, tracks its lifecycle (running → done/failed) in the async-jobs manifest, collects and surfaces the result when it finishes, and reflects real async state through gsd_status. Delivers JOB-01, JOB-02.

**Verdict: ACHIEVED.** The registry-only manifest now has a real execution engine behind it. `launchJob` spawns a detached child wrapper that runs a real command and writes a per-job result file; `reconcileJobs` reads those files back to flip running jobs to done/failed with a `completed` timestamp; `gsd_status` reconciles before rendering so the Async Jobs section reflects real state. All verified against the actual code and passing tests — not SUMMARY claims.

## Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | A job launched via `launchJob` appears in `.planning/async-jobs.json` with status `running` and a `JOB-<seq>` id, and the launch returns immediately without awaiting the child | ✓ VERIFIED | `lib/jobs.js:36-44` — `appendJob(cwd, {kind, status:"running"})` then `spawn(process.execPath, [WRAPPER, job.id, resultFile, ...command], {detached:true, stdio:"ignore"})` + `child.unref()`. Test "launchJob records a running job with a JOB-01 id and started timestamp" passes. |
| 2 | A real child process runs and writes `.planning/jobs/<id>.result.json`; `reconcileJobs` flips the job to done (exit 0) or failed (non-zero exit or error) with a completed timestamp | ✓ VERIFIED | `lib/job-wrapper.mjs:51-75` spawns the command (argv array, no shell), captures stdout/stderr/exit, writes the result file. `lib/jobs.js:49-72` reconciles. Tests "a real child runs and reconcile flips a zero-exit job to done" and "a non-zero exit flips to failed with captured stderr" pass (real `node` children, result file polled, `completed` asserted). |
| 3 | A running job whose result file is absent stays running after reconcile; a corrupt result file does not throw and leaves the job running | ✓ VERIFIED | `lib/jobs.js:54-70` — stat-guard (`if (!stat) continue`) and try/catch around parse. Tests "a running job with no result file stays running after reconcile" and "a corrupt result file does not throw and leaves the job running" pass. |
| 4 | gsd_status reflects real asynchronous job state: a running job whose result file exists renders done/failed; a running job with no result file renders running | ✓ VERIFIED | `lib/core-tools.js:8,127` — imports `reconcileJobs` and calls `await reconcileJobs(ctx, s, cwd).catch(() => null)` before `readJobs` (line 128). Tests "a running job whose result file exists renders done/failed" and "a running job with no result file renders running" pass. |
| 5 | gsd_status never throws over a corrupt result file or a corrupt manifest | ✓ VERIFIED | `lib/core-tools.js:127` `.catch(() => null)`; `readJobs` degrades to `{entries:[], corrupt:true}`. Tests "a corrupt result file does not throw and leaves the job running" and "corrupt async-jobs.json renders a warning line, does not throw" pass. |
| 6 | VALIDATION.md exists at the phase root and maps every locked decision D-01..D-05 to its named automated test(s), with a task-coverage record proving no 3-consecutive-task window lacks an automated verify | ✓ VERIFIED | `.planning/phases/GSD-09-job-runtime/VALIDATION.md` (57 lines) — "Nyquist Coverage" heading, Decision→test mapping table covering D-01..D-05, "Task coverage (dimension 8)" table, full-suite gate row. |

## Score

**6/6 must-haves verified.** No truth failed, no artifact missing/stub, no key link unwired, no blocker anti-pattern, no human-verification item.

## Deferred Items

Filtered against later milestone phases — none of the deferred ideas (subagent background jobs, timeouts/cancellation, a `gsd_job` launch tool, retry/queueing) are required by JOB-01/JOB-02 or any later phase in this milestone. Correctly out of scope.

## Required Artifacts

| Artifact | Exists | Substantive | Wired |
|---|---|---|---|
| `lib/job-wrapper.mjs` | ✓ | 83 lines ≥ 50; standalone ESM, spawns argv array with no shell, writes result file | ✓ spawned by `lib/jobs.js` |
| `lib/jobs.js` | ✓ | 73 lines ≥ 60; exports `launchJob`, `reconcileJobs` | ✓ imported by `lib/core-tools.js` |
| `test/jobs.test.mjs` | ✓ | 119 lines ≥ 80; imports from `../lib/jobs.js`, uses `realFsAdapter` + `mkdtemp` | ✓ 5/5 pass |
| `lib/core-tools.js` | ✓ | 242 lines ≥ 236; imports + calls `reconcileJobs` | ✓ wired into gsd_status |
| `test/tools.test.mjs` | ✓ | 691 lines ≥ 657; 3 new gsd_status rendering tests | ✓ 35/35 pass |
| `.planning/phases/GSD-09-job-runtime/VALIDATION.md` | ✓ | 57 lines ≥ 30; D-01..D-05 mapping, Nyquist heading, full-suite gate | ✓ |

## Key Link Verification

| Link | Status | Evidence |
|---|---|---|
| `lib/jobs.js` → `lib/job-wrapper.mjs` | WIRED | `lib/jobs.js:20` `WRAPPER = fileURLToPath(new URL("./job-wrapper.mjs", import.meta.url))`; `:38` spawns it as the detached child passing the absolute result-file path as argv |
| `lib/jobs.js` → `lib/state.js` | WIRED | `lib/jobs.js:36` `s.appendJob(...)`, `:66` `s.updateJob(...)` — persists through the gsdState accessors (state.js:376/387/400) |
| `lib/core-tools.js` → `lib/jobs.js` | WIRED | `lib/core-tools.js:8` `import { reconcileJobs } from "./jobs.js"`; `:127` `await reconcileJobs(ctx, s, cwd).catch(() => null)` before `readJobs` |

## Data-Flow Trace

1. `launchJob(ctx, s, cwd, {kind, command})` → `s.appendJob` records `{id: JOB-<seq>, status: "running", started}` in `.planning/async-jobs.json`.
2. `spawn(process.execPath, [WRAPPER, job.id, resultFile, ...command], {detached:true})` + `child.unref()` → tool call returns immediately; child survives.
3. Wrapper runs the command (argv array, no shell), captures stdout/stderr/exit, writes `.planning/jobs/<id>.result.json` via `node:fs/promises`.
4. `reconcileJobs(ctx, s, cwd)` → `readJobs`, for each `running` job stat-guards + reads its result file via `ctx.fs`, parses, flips to `done`/`failed` via `s.updateJob` (sets `completed` on first terminal transition), builds a truncated result summary.
5. `gsd_status` calls `reconcileJobs` before `readJobs`, so the Async Jobs section renders real `running`/`done`/`failed` state + result summary.

## Behavioral Spot-Checks

- `node --test test/jobs.test.mjs` → **5/5 pass** (real child processes, real temp dir + `realFsAdapter`).
- `node --test test/tools.test.mjs` → **35/35 pass** (including the 3 new gsd_status rendering tests).
- `npm test` (full suite) → **166/166 pass**, 0 fail — no regressions.
- Wrapper direct spot-check: `node lib/job-wrapper.mjs spotjob <resultFile> node -e "console.log('spot-ok'); process.exit(0)"` → wrote `{exitCode:0, stdout:"spot-ok\n", stderr:"", error:null}`. PASSED.

## Requirements Coverage

| REQ | Delivered | Evidence |
|---|---|---|
| JOB-01 — a job can be launched to run asynchronously and its lifecycle tracked through running → done/failed states in the async-jobs manifest | ✓ | `launchJob` records `running`; real child runs; `reconcileJobs` flips to `done`/`failed` with `completed`. Tests 1-3 in `test/jobs.test.mjs`. |
| JOB-02 — the runtime collects and surfaces a job's result when it finishes, and gsd_status reflects real asynchronous job state rather than a registry-only record | ✓ | Result file read-back → result summary in manifest; `gsd_status` reconciles before rendering real state. Tests in `test/jobs.test.mjs` + `test/tools.test.mjs`. |

## Anti-Patterns Found

None. `grep -rn "TBD\|FIXME\|XXX\|TODO"` over `lib/job-wrapper.mjs`, `lib/jobs.js`, `lib/core-tools.js`, `test/jobs.test.mjs` returned no matches. No unreferenced debt markers.

## Human Verification Required

None. All behaviors are programmatically confirmed by passing named tests and direct execution. No visual, real-time, or external verification needed.

## Gaps Summary

No gaps found. Status: **passed**.
