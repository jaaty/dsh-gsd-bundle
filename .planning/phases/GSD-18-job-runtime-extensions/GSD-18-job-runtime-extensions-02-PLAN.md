---
phase: 18-job-runtime-extensions
plan: 02
type: execute
wave: 2
depends_on: ["GSD-18-job-runtime-extensions-01"]
files_modified: ["lib/jobs.js", "lib/job-wrapper.mjs", "test/jobs.test.mjs"]
autonomous: true
requirements: ["JOBX-01", "JOBX-02", "JOBX-04"]
---
<objective>Extend the jobs runtime domain (lib/jobs.js + lib/job-wrapper.mjs) to launch background SUBAGENT jobs that report through the same per-job result file as shell jobs (JOBX-01), enforce per-job timeouts and cancellation with distinct `timeout`/`cancelled` reasons (JOBX-02), and drain a real FIFO queue up to a concurrency limit with manual retry (JOBX-04). All manifest writes route through the state.js accessors (DUR-04); the no-throw invariant is preserved on every path (D-09). NOTE: Tasks 1–3 of this plan form ONE implementation pass and land together — Task 1's `startRun` calls the scheduler (`scheduleJobs`, Task 3) and the shell spawn takes the new `timeout` argv (Task 2); these cross-references are resolved in the same pass before the suite is ever run, so Task 1's verify is executed only after Tasks 2–3 have landed.</objective>
<context>
Read first:
- lib/jobs.js — `launchJob` (35-45), `reconcileJobs` (49-72, the no-throw D-06 contract; currently writes only `{ status, result: summary }` and never a `reason`), `WRAPPER`, `truncate`/`firstLine`.
- lib/job-wrapper.mjs — the detached child; argv is `[jobId, resultFile, ...command]` (line 19); needs an optional timeout argv and a timer-kill.
- lib/state.js — `resolveJobsConfig` (added in plan 01), `appendJob`/`updateJob`/`readJobs` accessors (the single choke point).
- lib/_runner.js — `spawnSubagent` (8-32) shows the `subagents.start('spawn', req)` shape and that `run.result` yields `{ output, stopReason, diagnostic, structured }`; `blocksToText` is in lib/_shared.js.
- lib/core-tools.js — `reconcileJobs(ctx, s, cwd)` is called before gsd_status renders the Async Jobs section (line 128).
- .planning/phases/GSD-18-job-runtime-extensions/GSD-18-job-runtime-extensions-RESEARCH.md — the OQ/R resolutions (signal is required — pass a job-owned AbortSignal, not exec.signal; single controller + `timedOut` flag; must `run.dispose()`; new-attempt retry; `started` on promote).
- .planning/phases/GSD-18-job-runtime-extensions/GSD-18-job-runtime-extensions-CONTEXT.md — decisions D-01..D-09.
</context>
<tasks>
<task type="auto">
<name>Task 1 (tracer): subagent background job end-to-end (JOBX-01, D-01/D-02) — shares the pass with Tasks 2–3</name>
<files>lib/jobs.js, test/jobs.test.mjs</files>
<read_first>lib/jobs.js, lib/_runner.js, lib/state.js</read_first>
<action>
Implement subagent background jobs in lib/jobs.js. Import `blocksToText` from "./_shared.js". This task lands in the SAME implementation pass as Tasks 2–3: the `startRun` shell branch invokes the scheduler helper `scheduleJobs` (defined in Task 3) and the shell `spawn` already carries the new `timeout` argv (Task 2). Do NOT run the suite between tasks — run `node --test test/jobs.test.mjs` only after Tasks 2–3 have landed.

Add a module-level `const live = new Map();` mapping `jobId -> { kind, handle }` where for shell it holds the detached child and for subagent it holds `{ controller, timedOut: false, cancelled: false, dispose }`. This is the registry cancelJob/timeout reach into in-flight runs.

Refactor `launchJob(ctx, s, cwd, opts)` into a unified launcher that accepts `opts.kind` of `"shell"` (with `command` argv array, optional `timeout` seconds, optional `jobCwd`) or `"subagent"` (with `prompt` text, `label`, optional `provider`, `outputSchema`, `parent`, optional `timeout` seconds). Preserve the existing `{ kind: 'shell', command: [...] }` call shape so current callers and tests keep working. Store `kind` and, for retry (Task 3), the launch payload (`command` for shell; `prompt`/`label`/`provider` for subagent), `attempts: 1`, and optional `timeout` on the manifest entry via `appendJob(cwd, { kind, status: "pending", ...payload, attempts: 1 })`. Enqueue as `pending`, then call the scheduler `scheduleJobs(ctx, s, cwd)` (Task 3) so an under-capacity launch promotes to running immediately — preserving the existing contract that `launchJob` returns a job whose `status` is `running` when concurrency allows. Resolve per-job timeout and concurrency from `resolveJobsConfig(await s.readConfig(cwd))`.

Write the promotion/spawn logic in a helper `startRun(ctx, s, cwd, entry, jobsCfg)` used by the scheduler: for a shell entry, keep the existing `spawn(process.execPath, [WRAPPER, entry.id, resultFile, entry.timeout ?? "-", ...command])` detached/unref pattern (the timeout argv is added in Task 2; passing `"-"` or an integer string is fine for both old and new calls), record the child in `live`, and `updateJob(cwd, entry.id, { status: 'running', started: nowIso() })`. For a subagent entry, per D-01 construct a JOB-OWNED `const ac = new AbortController()` (do NOT pass `exec.signal` — the RESEARCH confirms `SubagentStartRequest.signal` is required, so pass `ac.signal`); fetch the service via `ctx.get("subagents")` and call `subagents.start(entry.provider || "spawn", { label, prompt: [{ type: "text", text: entry.prompt }], parent: entry.parent, signal: ac.signal, ...(entry.outputSchema ? { outputSchema: entry.outputSchema } : {}) })` — the provider is the FIRST positional arg, defaulting to `"spawn"` unless `entry.provider` overrides (finding 4). Record `{ controller: ac, timedOut: false, cancelled: false, dispose: run.dispose }` in `live`, then register `run.result.then(...)` which, in order: (1) maps per D-02 (`stopReason === 'completed'` → `{ id, exitCode: 0, stdout: blocksToText(result.output), stderr: "" }`; any other stopReason → `{ id, exitCode: 1, stderr: (result.diagnostic || blocksToText(result.output)), error: result.diagnostic || null }`); (2) writes the result file to `.planning/jobs/<id>.result.json` (ensure the parent dir with `node:fs/promises` `mkdir(...,{recursive:true})`, then write via `ctx.fs`); (3) always calls `run.dispose()` after the result settles (OQ-6); (4) records the terminal `status` AND `reason` DIRECTLY via `updateJob(cwd, entry.id, { status, result: summary, reason })` — the `.then` holds `s`/`ctx`, so the subagent reason is decoupled from the shell/reconcileJobs route (finding 4): `stopReason === 'completed'` → `{ status:'done', reason: null }`; otherwise read the live entry's flags in order — `timedOut === true` → `{ status:'failed', reason:{ reason:'timeout', detail: 'exceeded Ns' } }`, `cancelled === true` → `{ status:'failed', reason:{ reason:'cancelled', detail:'cancelled by user' } }`, else → `{ status:'failed', reason:{ reason:'error', detail: (result.diagnostic||null) } }`; (5) removes the `live` entry — this is the ONLY place a subagent entry is removed from `live` (finding 3). The whole `.then` is wrapped so any throw is swallowed (no-throw D-09), including a `live.get(id)` returning `undefined` (already-removed).

`reconcileJobs` needs NO subagent special-casing for status — the subagent `.then` already set the terminal status/reason directly; reconcileJobs only touches entries it transitions, and preserves any existing `reason` (so it never clobbers the subagent `.then`'s or cancelJob's reason). Its generic reason-writing for shell failures is added in Task 2.

In test/jobs.test.mjs, add a subagent test using a fake `subagents` service injected through a `stateCtx`-style ctx whose `get` returns the fake for "subagents": `start` returns `{ result: Promise.resolve({ output: [{ type: 'text', text: 'agent output' }], stopReason: 'completed' }), dispose: spy }`. Assert: the subagent run was started with a job-owned `signal` (defined, not undefined), the first arg to `start` was `"spawn"`, the result file appears after `run.result` settles, the entry reaches `done` with `agent output` in `result` and a `dispose` spy was called. Add a second assertion: a fake returning `stopReason: 'error'` with a `diagnostic` flips the job to `failed` with `reason.reason === 'error'`.
</action>
<verify>node --test test/jobs.test.mjs   (run only after Tasks 2–3 land — the shared pass)</verify>
<acceptance_criteria>
- grep-verifiable string in lib/jobs.js: `new AbortController()` and `run.result.then` and `run.dispose` and `blocksToText`
- grep-verifiable string in lib/jobs.js: `ctx.get("subagents")` and `subagents.start(entry.provider || "spawn"`
- a fake-subagents test asserts the passed `signal` is defined, `start`'s first arg is `"spawn"`, and `dispose` was called
- a fake-subagents error test asserts `reason.reason === 'error'`
- command exit code 0 for `node --test test/jobs.test.mjs`
</acceptance_criteria>
<done>A subagent job launched through jobs.js runs to completion, writes a result file through ctx.fs, is disposed, and its terminal status+reason are recorded directly by the `.then` via updateJob (done / failed with the subagent text and reason surfaced).</done>
</task>
<task type="auto">
<name>Task 2: per-job timeout + cancellation + reconcileJobs reason-writing (JOBX-02, D-03/D-04/D-08)</name>
<files>lib/job-wrapper.mjs, lib/jobs.js, test/jobs.test.mjs</files>
<read_first>lib/job-wrapper.mjs, lib/jobs.js</read_first>
<action>
Per-job timeout with a config default and per-job override (D-03). `resolveJobsConfig` supplies the default (plan 01); `launchJob` passes the effective `timeout` seconds down.

In lib/job-wrapper.mjs, change the argv contract to `[jobId, resultFile, timeout, ...command]` where `timeout` is optional (an integer string or the sentinel `"-"`/absent when no timeout — R-1: older in-flight detached children spawned without it must still work, so treat a non-integer as "no timeout"). Parse it as `const timeout = /^\d+$/.test(argv2) ? Number(argv2) : null;`. When set, start a timer `setTimeout` that, on expiry, `child.kill()`s the child and writes a result carrying `{ id, exitCode: null, stdout: "", stderr: "", error: "timeout", timeout: true }`, then `process.exit(0)`. Clear the timer in the `close` handler so a normal finish never triggers a false timeout. Keep the existing argv-array spawn with no interpreter option (no injection surface).

In lib/jobs.js, add `export async function cancelJob(ctx, s, cwd, id)` per D-04: read the entry; if unknown or already terminal (`done`/`failed`) return `{ ok: false, message }` describing it as already-terminal or unknown — NEVER throw. Otherwise branch on kind: for SHELL, `updateJob(cwd, id, { status: 'failed', reason: { reason: 'cancelled', detail: 'cancelled by user' } })`, then `child.kill()` and remove from `live` (shell has no `.then`; the direct reason write is its only writer). For SUBAGENT, do NOT remove from `live` and do NOT set the status here — set the live entry flag `live.get(id).cancelled = true`, then `controller.abort()` and return `{ ok: true }`; the Task-1 `.then` (which holds `s`/`ctx`) reads the `cancelled` flag after the run settles, records `{ status:'failed', reason:{ reason:'cancelled', detail:'cancelled by user' } }` via `updateJob`, and performs the `live` removal itself (finding 3 — this ordering guarantees `live.get(id)` is still present when the `.then` reads the flag). Return `{ ok: true }`.

Extend `reconcileJobs` with generic reason-writing (finding 1): when it transitions a running SHELL entry to `failed` (per `exitCode !== 0 || Boolean(result.error)`) AND the entry does not already carry a `reason`, set `reason` additively (D-08 — `status` stays `'failed'`): if `result.timeout === true` → `reason: { reason: 'timeout', detail: 'exceeded Ns' }`; otherwise → `reason: { reason: 'error', detail: (result.error || null) }`. Preserve any existing `reason` (e.g. a `cancelled` set by cancelJob) — never overwrite it. This is NOT subagent special-casing — it is a generic result-file `timeout` marker read, so it does not contradict Task 1. For subagent entries reconcileJobs does not write a reason (the `.then` already did).

Subagent timeout vs cancel distinction (OQ-2): implement the subagent timeout timer in the launch path — when a per-job `timeout` is set, `setTimeout` that sets `live.get(id).timedOut = true` then `ac.abort()` (and clear the timer once the run settles). The Task-1 `.then` reads `timedOut` (before `cancelled`) and records reason `'timeout'` via `updateJob` directly — it never relies on a result-file `timeout` marker for the subagent route (finding 4, decoupled from reconcileJobs).

In test/jobs.test.mjs add: (a) a shell timeout test — launch a long-lived command (`node -e "setTimeout(()=>{}, 10000)"`) through `launchJob` with a tiny `timeout` (e.g. 1s), wait for the result file, assert the job flips to `failed` with `reason.reason === 'timeout'` (this exercises the reconcileJobs reason-writing); (b) a subagent timeout/cancel test — fake `subagents.start` captures the passed signal; a timeout timer aborts → assert `reason === 'timeout'`; calling `cancelJob` on a running subagent → assert the job is `failed` with `reason.reason === 'cancelled'` and that `cancelJob` did not remove the live entry before the `.then` settled; (c) a cancel no-throw test — `cancelJob` on an unknown id and on an already-done job returns a message and never throws.
</action>
<verify>node --test test/jobs.test.mjs</verify>
<acceptance_criteria>
- grep-verifiable string in lib/job-wrapper.mjs: `timeout` argv parse and `child.kill()` and `timeout: true`
- grep-verifiable string in lib/jobs.js: `export async function cancelJob`
- grep-verifiable string in lib/jobs.js: `result.timeout === true` inside reconcileJobs and `reason: { reason: 'timeout'` 
- grep-verifiable string in lib/jobs.js: `.cancelled = true` on the live entry (not a live removal inside cancelJob for subagent)
- a shell-timeout test asserts `reason.reason === 'timeout'`; a subagent cancel test asserts `reason.reason === 'cancelled'`; cancel never throws for unknown/terminal
- command exit code 0 for `node --test test/jobs.test.mjs`
</acceptance_criteria>
<done>Shell jobs time out via the wrapper timer-kill (reconcileJobs records reason 'timeout'); subagent jobs time out via a job-owned AbortSignal with a `timedOut` flag whose `.then` records 'timeout' directly; cancelJob for subagent sets a `cancelled` flag and aborts (the `.then` removes it), for shell kills and records 'cancelled'; reconcileJobs writes additive failure reasons without clobbering existing ones.</done>
</task>
<task type="auto">
<name>Task 3: FIFO scheduler + manual retry (JOBX-04, D-06/D-07)</name>
<files>lib/jobs.js, test/jobs.test.mjs</files>
<read_first>lib/jobs.js, lib/state.js</read_first>
<action>
Implement `export async function scheduleJobs(ctx, s, cwd)` — the FIFO queue drain (D-07). Read the manifest via `s.readJobs(cwd)`; count entries with `status === 'running'`; resolve `jobsCfg = resolveJobsConfig(await s.readConfig(cwd))`. Iterate the entries in array order (FIFO); for each entry whose `status === 'pending'` while `runningCount < jobsCfg.concurrency`: `updateJob(cwd, entry.id, { status: 'running', started: nowIso() })` (sets `started` at actual run start per OQ-5), call the Task-1 `startRun` helper to actually spawn/start it, increment `runningCount`. Guard promotion so only `pending` entries are promoted (R-3). Wrap the whole thing in try/catch so a corrupt manifest leaves pending entries pending and never throws (D-09).

Wire the scheduler into the existing flows so capacity frees promote: call `scheduleJobs(ctx, s, cwd)` (a) at the end of `launchJob` (after enqueueing pending — this is the call Task 1's startRun shell branch already references, landing in the same pass), and (b) at the end of `reconcileJobs` (after terminal jobs free running capacity — gsd_status already calls reconcileJobs so this drains automatically). `updateJob`/`appendJob` remain the only manifest writers (DUR-04).

Implement `export async function retryJob(ctx, s, cwd, id, opts)` per D-06 (manual retry, new attempt entry): read the entry; if unknown or not `failed`, return `{ ok: false, message }` (no throw). Read `retryCount` from the entry (default 0) and `maxRetries = opts.maxRetries ?? resolveJobsConfig(await s.readConfig(cwd)).max_retries` (default 3). If `retryCount >= maxRetries` return `{ ok: false, message: 'max_retries exceeded' }`. Otherwise mark the OLD entry `updateJob(cwd, id, { reason: { reason: 'retried', detail: 'retried as <NEWID>' } })` and enqueue a NEW attempt via `appendJob(cwd, { kind: entry.kind, status: 'pending', ...(shell ? { command: entry.command } : { prompt: entry.prompt, label: entry.label, provider: entry.provider }), attempts: 1, retryCount: (entry.retryCount || 0) + 1, timeout: entry.timeout })`, then `scheduleJobs(...)`. Return `{ ok: true, newId }`. `attempts` on the entry is the attempt sequence (for display); `retryCount` is the cap counter.

In test/jobs.test.mjs add: (a) FIFO concurrency — with a config `jobs.concurrency = 1` (write `.planning/config.json` via the real fs in the temp dir before launching), append three shell jobs (short commands that sleep so they overlap) via `appendJob` + `scheduleJobs`; assert exactly one is `running` and the rest `pending`, then reconcile frees capacity and the next pending promotes in FIFO order; (b) retry — a failed shell job retried via `retryJob` yields a new `JOB-NN` attempt entry, the old entry has `reason.reason === 'retried'`, and retrying beyond `max_retries` returns the refusal without a new entry.
</action>
<verify>node --test test/jobs.test.mjs</verify>
<acceptance_criteria>
- grep-verifiable string in lib/jobs.js: `export async function scheduleJobs` and `export async function retryJob`
- grep-verifiable string in lib/jobs.js: `scheduleJobs(ctx, s, cwd)` called from `launchJob` and from `reconcileJobs`
- a concurrency test asserts at most `concurrency` jobs are `running` at once and FIFO order is preserved
- a retry test asserts a new attempt id and the old entry's `reason.reason === 'retried'`
- command exit code 0 for `node --test test/jobs.test.mjs`
</acceptance_criteria>
<done>scheduleJobs drains `pending→running` up to the concurrency limit at launch and reconcile, setting `started` on promote; retryJob re-runs a failed job as a new attempt entry (old marked `retried`) up to `max_retries`, never throwing.</done>
</task>
</tasks>
