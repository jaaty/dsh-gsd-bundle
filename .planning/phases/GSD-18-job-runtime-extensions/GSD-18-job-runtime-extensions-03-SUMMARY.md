---
phase: 18-job-runtime-extensions
plan: 03
subsystem: jobs-runtime
tags: [gsd_job, tool, launch, status, cancel, retry, reason, core-tools]
dependency_graph:
  requires: [GSD-18-job-runtime-extensions-02]
  provides: [gsd-job-tool, status-reason-rendering]
  affects: [lib/core-tools.js, test/tools.test.mjs, test/ship.test.mjs, test/mount.test.mjs]
tech-stack: [node:test, ESM, defineTool, zero-dependency]
key-files:
  created: [.planning/phases/GSD-18-job-runtime-extensions/GSD-18-job-runtime-extensions-03-SUMMARY.md]
  modified: [lib/core-tools.js, test/tools.test.mjs, test/ship.test.mjs, test/mount.test.mjs]
decisions: [JOBX-03, D-01, D-04, D-05, D-08, D-09]
metrics:
  duration: ~30 min
  completed: 2026-08-28
status: complete
actuals:
  tasks: 3
  commits: 1
---

# Phase 18 Plan 03: gsd_job Tool and Async-Jobs Reason Rendering Summary

Exposed a single `gsd_job` tool (launch | status | cancel | retry, kind shell | subagent) in lib/core-tools.js so the driving agent can launch and manage background jobs interactively (JOBX-03), and updated the gsd_status Async Jobs section to render each job's terminal `reason` (and detail) inline (D-08) — with the tool never throwing over a bad manifest on every path (D-04/D-05/D-09).

## Changes

- **lib/core-tools.js**
  - Extended the jobs.js import to `{ reconcileJobs, launchJob, cancelJob, retryJob }`.
  - New module-level `jobLine(j)` helper that renders `- <id>: <kind> — <status> — <result || started || "">` and appends ` [reason: <reason>]` (and `(<detail>)`) when a structured `reason` is present; `status` stays `'done'`/`'failed'` (D-08 backward compatible).
  - Registered the `gsd_job` tool (defineTool) with an `action` enum and `kind`/`argv`/`cwd`/`prompt`/`label`/`provider`/`timeout`/`id`/`max_retries` schema. `execute` delegates to the jobs.js domain:
    - `launch` — shell requires a non-empty argv array passed through verbatim (D-05, no string→argv splitting, no injection); subagent requires a prompt and passes `parent: exec.agent` but NOT `exec.signal` (D-01, so the job-owned AbortSignal binds the run).
    - `status` — calls `reconcileJobs(ctx, s, cwd).catch(() => null)` to refresh real state, then `readJobs` and renders `jobLine(j)` for the requested id; a missing id returns a `not found` message.
    - `cancel` — delegates to `cancelJob`; an `ok` result returns a confirm line, otherwise the clear no-op message; never throws (D-04).
    - `retry` — delegates to `retryJob` (optional `max_retries` override); an `ok` result names the new attempt id, otherwise returns the refusal; never throws (D-05/D-06).
    - The whole execute body is wrapped so any unexpected error returns a message instead of throwing (D-09 no-throw over a bad manifest).
  - gsd_status Async Jobs `else` branch now renders each entry via `jobLine(j)` instead of the raw inline template.
- **test/tools.test.mjs** — added a `gsd_job` describe block (9 tests) plus a `gsd_status` seeded-reason test:
  - Launch subagent (real temp dir + realFsAdapter) records a JOB that reconciles to `done` with the subagent text surfaced via action:status.
  - Launch shell (real temp dir + realFsAdapter) records and completes a shell job; the manifest flips to `done` once action:status reconciles the detached child's result file.
  - status on an unknown id → `not found`, never throws.
  - cancel flips a running job to `failed` with `reason.reason === 'cancelled'`; cancel on an unknown/already-done job → no-op message, never throws.
  - retry creates a new attempt entry and marks the old entry `retried`; retry beyond `max_retries` → refusal, adds no entry.
  - an invalid `action`/`kind` value is rejected by defineTool's schema enum with a clear `must be one of [...]` message (never a runtime throw); the compiled schema exposes the action enum and job properties.
  - gsd_status renders a seeded terminal reason inline (`[reason: timeout] (exceeded 60s)`).
- **test/ship.test.mjs** — bumped the `cwdOf(exec)` site count from 4 → 5 (the gsd_job execute adds a cwd site). Static single-source regression, must track the new tool.
- **test/mount.test.mjs** — bumped the registered-tool counts 12 → 13 and added `"gsd_job"` to `EXPECTED_TOOL_NAMES`. Static mount regression, must track the new tool.

## Verification

- `node --test test/tools.test.mjs` → **53 pass, 0 fail**.
- `npm test` (full suite) → **280 pass, 0 fail** (was 270 before this plan; +10 = 9 gsd_job tests + 1 gsd_status reason test).
- grep-verifiable in lib/core-tools.js: `name: "gsd_job"`, `"launch","status","cancel","retry"`, `"shell","subagent"`, `launchJob(`, `cancelJob(`, `retryJob(` inside the gsd_job execute, and a `jobLine` helper used in both gsd_status and the status action.

## TDD Gate Compliance

This is a wave-3 execute plan whose three tasks (launch/status, cancel/retry, and gsd_status reason rendering) all edit the same two files — lib/core-tools.js and test/tools.test.mjs — and build on each other (Task 1's status action already uses the `jobLine` helper that Task 3 introduces). Committing each task separately would leave the shared files in a broken intermediate state (e.g. gsd_status not yet using jobLine, the tool present before its cancel/retry actions). All work therefore landed together in a single atomic commit, mirroring plan 02's precedent. Note as a deviation from strict RED-first; the full suite was green before the commit.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

- `gsd_job` is a new externally-triggerable launch surface, but shell launch takes an argv array passed through verbatim with no interpreter option and no string→argv splitting — no injection or quoting ambiguity (unchanged Phase 9 contract).
- The tool never throws over a bad manifest (D-09); every non-actionable case returns a clear message. Invalid `action`/`kind` enum values are rejected by defineTool's argument validation before execute.
- Two static mount/ship regression tests (registered-tool count, cwdOf site count) were updated to reflect the new tool — reviewed, not suppressed.
- No new dependencies added (zero-dependency bundle preserved).

## Self-Check: PASSED

- `lib/core-tools.js` registers `gsd_job` and the `jobLine` helper; `test/tools.test.mjs` adds the gsd_job + gsd_status-reason tests; `test/ship.test.mjs` and `test/mount.test.mjs` static counts updated.
- Full test suite green (280 pass).
- Commit `9d4b9a1` contains only the plan-03 files (lib/core-tools.js, test/tools.test.mjs, test/ship.test.mjs, test/mount.test.mjs, and this SUMMARY); the orchestrator-owned `.planning/STATE.md`/ROADMAP/WINDOWS/async-jobs changes were left uncommitted, matching plan 02's executor behaviour.
