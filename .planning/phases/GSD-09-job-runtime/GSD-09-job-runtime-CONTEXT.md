# Phase 9: job-runtime - Context

**Gathered:** 2026-08-25T05:09:24.379Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Implement a real background-job runtime: a job runner that launches a shell-command job as a child process (node:child_process spawn), records it running in the async-jobs manifest, the process writes its result to a per-job result file (.planning/jobs/<id>.result.json), the runtime reads it back to mark the job done/failed with started/finished timestamps, and gsd_status shows each job's real running/done/failed state. Delivers JOB-01 and JOB-02.
**Out of scope:** Subagent background jobs; job timeouts/cancellation; a dedicated gsd_job launch tool; job retry/queueing; any in-memory-only result collection that doesn't survive context resets.
</domain>

<decisions>
## Decisions
### Async mechanism
- **D-01:** Background jobs run as real child processes via node:child_process spawn — genuinely background, survive the tool call, and write their result to a file the runtime reads back.
### Job kinds
- **D-02:** A job is a shell command (argv + cwd) run as a child process. The runtime records it running, the process writes its stdout/exit to a result file, and the runtime marks it done/failed. No subagent jobs in this phase.
### Result collection
- **D-03:** The child process writes its result (stdout, exit code, error) to a per-job result file (e.g. .planning/jobs/<id>.result.json); the runtime reads it back to mark the job done/failed. Survives the tool call and context resets.
### Lifecycle + errors
- **D-04:** Lifecycle is running → done/failed with started/finished timestamps. A non-zero exit or thrown error marks the job failed with the captured stderr/error. No timeout — jobs run until they exit.
### gsd_status surfacing
- **D-05:** gsd_status reads the manifest and shows each job's real state (running/done/failed) with its id, kind, and result summary — replacing the registry-only 'No jobs' with live async state.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing async-jobs registry + surfacing
- `lib/state.js — async-jobs accessors (readJobs/appendJob/updateJob, lines 371-408) on .planning/async-jobs.json`
- `lib/core-tools.js — gsd_status Async Jobs section (lines 122-139)`
- `lib/execute.js — how gsd_execute currently records jobs (appendJob at 180, updateJob at 216/240)`
### Async primitives available
- `lib/_runner.js — spawnSubagent (subagents.start returns run immediately; current code awaits run.result)`
- `lib/ship.js + lib/map-codebase.js — node:child_process execFileSync usage precedent in the bundle`
### Deferred intent
- `.planning/phases/GSD-05-window-ledger/GSD-05-window-ledger-CONTEXT.md — where the real background-job runtime was deferred to a later milestone`
</canonical_refs>

<code_context>
## Code Context
- The async-jobs manifest (.planning/async-jobs.json) already has readJobs/appendJob/updateJob accessors and a gsd_status 'Async Jobs' section — this phase adds a real execution engine behind it.
- The host subagents service returns a run object immediately (non-blocking) but the current spawnSubagent awaits it; this phase uses node:child_process spawn for shell-command jobs instead.
- node:child_process is already used in the bundle (execFileSync in ship.js and map-codebase.js) — precedent for child-process usage.
- gsd_status reads the manifest via readJobs and renders an Async Jobs section; it will now show real running/done/failed state.
- The bundle runs in the host plane with workspace-write file access — a per-job result file under .planning/jobs/ is writable and survives context resets.
</code_context>

<specifics>
## Specifics
- A job can be launched to run asynchronously and its lifecycle tracked through running → done/failed states in the async-jobs manifest — JOB-01
- The runtime collects and surfaces a job's result when it finishes, and gsd_status reflects real asynchronous job state rather than a registry-only record — JOB-02
</specifics>

<deferred>
## Deferred Ideas
- Subagent background jobs (run a subagent without awaiting) — future extension; this phase is shell-command jobs only.
- Job timeouts / cancellation — future extension; jobs run until they exit.
- A gsd_job tool to launch jobs interactively — the runtime is exercised via the manifest/runner; a dedicated launch tool can come later.
- Job retry / queueing — out of scope.
</deferred>


---

*Phase: 09-job-runtime*
*Context gathered: 2026-08-25*