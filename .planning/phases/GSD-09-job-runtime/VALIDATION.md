# Phase 09: job-runtime — Validation (Nyquist coverage)

## Nyquist Coverage

`nyquist_validation: true` is set in `.planning/config.json`. Every new behaviour
introduced by this phase (the real background-job runtime: `launchJob` /
`reconcileJobs` in `lib/jobs.js`, the detached `lib/job-wrapper.mjs` child, and
the live async-jobs surfacing in `gsd_status`) has a named automated test, and
no 3-consecutive-task window across plans 01 and 02 lacks an automated verify
command. Every locked decision D-01..D-05 is mapped to the test(s) that prove it
below.

## Decision → automated-test mapping

| Decision | Automated test(s) | File |
|---|---|---|
| **D-01** (background jobs run as real child processes via `node:child_process` spawn — genuinely background, survive the tool call) | "launchJob records a running job with a JOB-01 id and started timestamp" (spawns a real detached child via `spawn(process.execPath, [WRAPPER, ...command], { detached: true })` + `unref`); "a real child runs and reconcile flips a zero-exit job to done" (a real `node` child actually executes and writes its result file). The command is passed as an argv array with no shell option — realized in `lib/job-wrapper.mjs` (integration tier) and exercised by the argv-array `command: ["node", "-e", ...]` launch calls. | `test/jobs.test.mjs` |
| **D-02** (a job is a shell command — argv + cwd — run as a child process) | "launchJob records a running job with a JOB-01 id and started timestamp" and "a real child runs and reconcile flips a zero-exit job to done" (both launch argv-array commands against a real temp dir cwd); "a non-zero exit flips to failed with captured stderr" | `test/jobs.test.mjs` |
| **D-03** (the child writes its result to a per-job result file the runtime reads back) | "a real child runs and reconcile flips a zero-exit job to done" (polls for `.planning/jobs/JOB-01.result.json` to appear, then reconcile reads it back → `done`); "a non-zero exit flips to failed with captured stderr"; "a running job with no result file stays running after reconcile" (missing result file = still running); "a corrupt result file does not throw and leaves the job running"; plan-02 rendering tests "a running job whose result file exists renders done/failed" and "a running job with no result file renders running" | `test/jobs.test.mjs`, `test/tools.test.mjs` |
| **D-04** (lifecycle running → done/failed with started/finished timestamps; non-zero exit or error marks failed) | "launchJob records a running job with a JOB-01 id and started timestamp" (started set); "a real child runs and reconcile flips a zero-exit job to done" (zero exit → `done`, `completed` set); "a non-zero exit flips to failed with captured stderr" (non-zero exit → `failed`, `completed` set, stderr captured) | `test/jobs.test.mjs` |
| **D-05** (gsd_status shows each job's real running/done/failed state) | "a running job whose result file exists renders done/failed" (reconcile flips to `done` before render); "a running job with no result file renders running" (reconcile leaves it `running`); "a corrupt result file does not throw and leaves the job running" (gsd_status never throws over a bad result file) | `test/tools.test.mjs` |

## Phase-goal truths backed by these tests

- **JOB-01** — "a job can be launched to run asynchronously and its lifecycle
  tracked through running → done/failed states in the async-jobs manifest" —
  backed by the `job runtime (real child processes)` suite in `test/jobs.test.mjs`
  (launch records `running` with a `JOB-<seq>` id + `started`; a real child runs;
  reconcile flips to `done`/`failed` with `completed`).
- **JOB-02** — "the runtime collects and surfaces a job's result when it finishes,
  and gsd_status reflects real asynchronous job state rather than a registry-only
  record" — backed by the result-collection tests in `test/jobs.test.mjs` (result
  file read-back → `done`/`failed` with a result summary) and the rendering tests
  in `test/tools.test.mjs` (gsd_status surfaces real `done`/`running` state and
  never throws over a corrupt result file).

## Task coverage (dimension 8)

Every task across the two plans is guarded by an automated `node --test` verify
command, so no 3-consecutive-task window lacks coverage.

| Plan | Task | Verify command |
|---|---|---|
| 01 | Task 1 — detached job-wrapper child script (tracer) | `node --test test/jobs.test.mjs` |
| 01 | Task 2 — jobs runtime domain (launchJob/reconcileJobs) | `node --test test/jobs.test.mjs` |
| 01 | Task 3 — integration suite for the job runtime | `node --test test/jobs.test.mjs` |
| 02 | Task 1 — wire reconcileJobs into gsd_status (tracer) | `node --check lib/core-tools.js` + import smoke |
| 02 | Task 2 — gsd_status rendering tests for real async state | `node --test test/tools.test.mjs` |
| 02 | Task 3 — this VALIDATION.md artefact | `test -f` + D-01..D-05 grep + Nyquist grep + full-suite grep |

## Full-suite gate

The complete bundle suite for this phase is `node --test test/*.test.mjs` (or
`npm test`). It ran green in plan-01 task 3: **163 tests, 163 pass, 0 fail**,
including the new `test/jobs.test.mjs` integration suite. Plan 02 re-ran the
`test/tools.test.mjs` suite (35 tests, 35 pass) after adding the three new
gsd_status rendering tests.
