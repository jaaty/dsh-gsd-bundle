# Phase 18: job-runtime-extensions - Context

**Gathered:** 2026-08-28T05:03:50.770Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Extend the Phase 9 background-job runtime to: (JOBX-01) launch background subagent jobs (in-process detached subagent that reports via a result file); (JOBX-02) enforce per-job timeouts and support cancellation; (JOBX-03) expose a single gsd_job tool (launch|status|cancel|retry, kind shell|subagent) so the driving agent can launch jobs interactively; (JOBX-04) add manual retry and a real FIFO job scheduler (pending→running→done/failed) with a concurrency limit. All surfaced through the async-jobs manifest and gsd_status.
**Out of scope:** Subagent jobs that survive a HOST restart (in-process run lives only while the host process lives); automatic retry with backoff; job priority classes; a gsd_job CLI/command layer (tool only this phase); changing the shell-job detached-child mechanism (Phase 9); in-memory-only result collection that doesn't survive context resets.
</domain>

<decisions>
## Decisions
### Subagent background jobs (JOBX-01)
- **D-01:** A subagent job is launched via subagents.start WITHOUT passing exec.signal, so the run is not bound to the driving turn; the job is recorded running, subagents.start returns immediately, and run.result.then() writes the result to .planning/jobs/<id>.result.json asynchronously. It survives as long as the host process (not across a host restart), reusing the same result-file read-back that reconcileJobs uses.
- **D-02:** Subagent result maps onto the EXISTING result-file shape: a successful run's final output text goes to result.stdout with exitCode 0; a failed/aborted run maps exitCode 1 and the error/diagnostic into result.stderr/result.error. reconcileJobs needs no special casing for subagent results.
### Timeout + cancellation (JOBX-02)
- **D-03:** Timeouts are per-job, passed at launch, with a default (config.json jobs.timeout, default 60s); a per-job override wins. On expiry the job is killed and marked failed with reason 'timeout'. For shell jobs the wrapper enforces it (AbortController/timer on the child); for subagent jobs it is enforced via an AbortSignal.
- **D-04:** Cancellation is exposed as gsd_job action=cancel: it kills the shell child / disposes the subagent run and marks the job failed with reason 'cancelled'. Cancelling an already-terminal or unknown job returns a clear no-op message and never throws.
### gsd_job tool (JOBX-03)
- **D-05:** A single gsd_job tool with an action field: launch | status | cancel | retry, plus kind: shell | subagent. launch accepts argv/cwd for shell and prompt/label/provider for subagent, plus an optional timeout. Returns a readable job id + status/result line. Job-not-found or unknown action returns a clear message; the tool never throws over a bad manifest.
### Retry + queueing (JOBX-04)
- **D-06:** Retry is manual: gsd_job action=retry re-runs a failed job's command/prompt, respecting a max_retries cap (config.json jobs.max_retries, default 3), and marks the retried attempt with reason 'retried' on the old entry.
- **D-07:** Queueing is a real FIFO scheduler: the manifest gains a pending→running→done/failed lifecycle drained up to a concurrency limit (config.json jobs.concurrency, default 2). reconcileJobs/scheduler promotes queued pending jobs to running as capacity frees.
### Manifest + error handling
- **D-08:** Terminal outcomes keep status 'done' | 'failed' and add a structured reason field: { reason: 'completed'|'timeout'|'cancelled'|'error'|'retried', detail }. gsd_status shows the reason. Backward-compatible with existing done/failed readers.
- **D-09:** The no-throw invariant of reconcileJobs is preserved: a missing/corrupt result file or a bad manifest leaves the job running and never throws (mirrors Phase 9 D-06). New config.json jobs block { timeout, concurrency, max_retries } reads degrade safely like readConfig.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current job runtime (base to extend)
- `lib/jobs.js — launchJob/reconcileJobs (detached shell-child + result-file read-back, no-throw D-06)`
- `lib/job-wrapper.mjs — the detached child that runs a shell command and writes <id>.result.json`
### Subagent launch primitive (for JOBX-01)
- `lib/_runner.js — spawnSubagent: subagents.start('spawn', req) with exec.signal, awaits run.result then disposes`
### Async-jobs manifest accessors
- `lib/state.js — readJobs/appendJob/updateJob (lines ~371-410) on .planning/async-jobs.json, nextSeq 'JOB', status default 'pending'`
### Tool registration pattern (for gsd_job)
- `lib/core-tools.js — defineTool({name, parameters, output, execute}), gsd_status Async Jobs section (lines 122-151)`
- `lib/commands.js — slash-command layer; gsd_job is tool-only this phase`
### Config precedent
- `lib/state.js readConfig + .planning/config.json — how existing config blocks (gates etc.) are read and degrade`
- `lib/gates.js — resolveGatesConfig pattern for a config sub-block with defaults`
### Host subagents service contract (JOBX-01 feasibility)
- `node_modules/@deepseek-ai/dsh-subagent/lib/types/types.d.ts — SubagentRun {result: Promise<SubagentResult>, dispose()}, SubagentStartRequest {signal} — the signal binds run lifetime`
</canonical_refs>

<code_context>
## Code Context
- lib/jobs.js launchJob spawns a detached child (lib/job-wrapper.mjs) with {detached:true, stdio:'ignore'} + child.unref(); reconcileJobs reads each running job's <id>.result.json via ctx.fs.resolve/stat/readText and flips to done/failed with a truncated summary — the no-throw invariant is the D-06 contract to preserve.
- The manifest accessors (state.js appendJob/updateJob) are the single choke point for .planning/async-jobs.json (DUR-04); job writes route through them, never raw node:fs.
- spawnSubagent (lib/_runner.js) shows the subagents.start('spawn', req) shape (label, promptText, outputSchema, parent, signal) and that the returned run has .result and .dispose(); JOBX-01 must launch it WITHOUT exec.signal and register run.result.then() to write the result file.
- gsd_status (core-tools.js) calls reconcileJobs before rendering the Async Jobs section, then readJobs; it must stay an orientation surface that never throws (missing/corrupt → explicit line).
- config.json already has a gates block read via readConfig; the new jobs { timeout, concurrency, max_retries } block follows the same resolve-and-default pattern.
- The bundle is zero-dependency (package.json dependencies: {}); new work should reuse node:child_process + the host subagents service, not add deps.
</code_context>

<specifics>
## Specifics
- Subagent jobs can be launched to run asynchronously and report their result through the same per-job result file as shell jobs (JOBX-01, D-01/D-02).
- Jobs can be given a timeout and can be cancelled, each recorded distinctly (reason timeout / cancelled) (JOBX-02, D-03/D-04).
- A gsd_job tool lets the driving agent launch shell or subagent jobs and manage them (launch/status/cancel/retry) (JOBX-03, D-05).
- Failed jobs can be retried manually up to a cap, and queued jobs run FIFO under a concurrency limit (JOBX-04, D-06/D-07).
</specifics>

<deferred>
## Deferred Ideas
- Subagent jobs surviving a HOST restart — the in-process run lives only while the host process lives (out of scope, JOBX-01 D-01).
- Automatic retry with backoff — retry is manual this phase (JOBX-04 D-06).
- Job priority classes or a weighted scheduler — FIFO only (JOBX-04 D-07).
- A gsd_job slash-command / CLI layer — tool-only this phase (JOBX-03).
- Changing the Phase 9 shell-job detached-child mechanism — reused as-is.
</deferred>


---

*Phase: 18-job-runtime-extensions*
*Context gathered: 2026-08-28*