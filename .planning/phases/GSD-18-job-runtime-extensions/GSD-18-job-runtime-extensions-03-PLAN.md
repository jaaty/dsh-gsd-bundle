---
phase: 18-job-runtime-extensions
plan: 03
type: execute
wave: 3
depends_on: ["GSD-18-job-runtime-extensions-02"]
files_modified: ["lib/core-tools.js", "test/tools.test.mjs"]
autonomous: true
requirements: ["JOBX-03"]
---
<objective>Expose a single `gsd_job` tool (launch | status | cancel | retry, kind shell | subagent) in lib/core-tools.js so the driving agent can launch and manage background jobs interactively, and render each job's terminal `reason` in the gsd_status Async Jobs section. The tool never throws over a bad manifest (D-05/D-09).</objective>
<context>
Read first:
- lib/core-tools.js — the `defineTool` registration pattern (gsd_init/gsd_status/gsd_progress, lines 18-241), the `inject = ["gsdState", "tools"]` (line 12), the Async Jobs section of gsd_status (lines 144-151, calls `reconcileJobs` at line 128 then `readJobs`), and the dynamic `subagents` fetch style (in this phase's caller the tool fetches via `ctx.get("subagents")` at call time, mirroring lib/execute.js:54 / lib/plan.js:45).
- lib/jobs.js — the domain API added in plan 02: `launchJob(ctx, s, cwd, opts)`, `scheduleJobs`, `cancelJob(ctx, s, cwd, id)`, `retryJob(ctx, s, cwd, id, opts)`, `reconcileJobs`. Import these into core-tools.js.
- lib/_runner.js — `cwdOf(exec)` (line 98) and how `exec.agent`/`exec.signal` are available on the tool's exec; D-01 requires NOT passing `exec.signal` to a subagent job — pass `parent: exec.agent` only, so the job-owned AbortSignal (built in jobs.js) binds the run.
- .planning/phases/GSD-18-job-runtime-extensions/GSD-18-job-runtime-extensions-CONTEXT.md — decisions D-04, D-05, D-08.
</context>
<tasks>
<task type="auto">
<name>Task 1 (tracer): gsd_job tool — launch + status (JOBX-03, D-05)</name>
<files>lib/core-tools.js, test/tools.test.mjs</files>
<read_first>lib/core-tools.js, lib/jobs.js</read_first>
<action>
In lib/core-tools.js, add the import `import { launchJob, cancelJob, retryJob, reconcileJobs } from "./jobs.js";` (extend the existing `reconcileJobs` import on line 8). Register a new tool with `ctx.tools.register(defineTool({...}))` named `gsd_job`, using the same `output: { schema: { type: "string" }, render: (_a, v) => [{ type: "text", text: v }] }` and `presentCall` pattern as the other tools.

Its `parameters` schema (JSON-Schema, matching the defineTool style used in this file): `action` (required string, enum ["launch","status","cancel","retry"]), `kind` (string, enum ["shell","subagent"]), `argv` (array of strings, REQUIRED for shell launch — argv-only, matching D-05 exactly; there is NO `command` string convenience so no string→argv splitting path exists and no quotes/embedded-whitespace ambiguity can arise), `cwd` (string, optional shell working dir), `prompt` (string, for subagent launch), `label` (string, optional subagent label), `provider` (string, optional subagent provider), `timeout` (number, optional per-job seconds, D-03), `id` (string, required for status/cancel/retry).

`execute(args, exec)` resolves `cwd = cwdOf(exec)` and `s = gsd()`. For `action: 'launch'`: require a valid `kind`; for `kind: 'shell'` require a non-empty `argv` and call `launchJob(ctx, s, cwd, { kind: 'shell', command: args.argv, timeout: args.timeout, jobCwd: args.cwd })` (the argv array is passed through verbatim — never shell-interpreted); for `kind: 'subagent'` require a non-empty `prompt` and call `launchJob(ctx, s, cwd, { kind: 'subagent', prompt: args.prompt, label: args.label, provider: args.provider, parent: exec.agent, timeout: args.timeout })` — do NOT pass `exec.signal` (D-01). Return a readable line with the new job id and its status. For `action: 'status'`: require `id`, call `reconcileJobs(ctx, s, cwd).catch(() => null)` to refresh real state, then `readJobs` and render a single line for the requested job: `JOB-03: subagent — done — <result> [reason: completed]` (see Task 3 for the reason rendering helper). If the id is not found, return a clear `job not found` message — NEVER throw. Wrap the whole execute body so any unexpected error returns a message instead of throwing (D-05 no-throw over a bad manifest).

In test/tools.test.mjs, add a `gsd_job` describe block using the existing `registerTool("core-tools", "gsd_job")` helper with the `makeCtx` fake whose `get('subagents')` returns the existing `makeSubagents()` fake (extend it to also handle a `gsd-job-` label that returns a completed subagent result). Add tests: (a) `action:'status'` on an unknown id returns a `not found` message and never throws; (b) `action:'launch', kind:'subagent', prompt:'...'` records a job (JOB-NN) that reconciles to `done` with the subagent text surfaced; (c) `action:'launch', kind:'shell', argv:[...]` records and completes a shell job; (d) the tool's compiled schema exposes the `action` enum and the `kind`/`id`/`prompt`/`argv`/`timeout` properties.
</action>
<verify>node --test test/tools.test.mjs</verify>
<acceptance_criteria>
- grep-verifiable string in lib/core-tools.js: `name: "gsd_job"` and `"launch","status","cancel","retry"` and `"shell","subagent"`
- a `launch subagent` tool test asserts a job reconciles to `done`; a `status` unknown-id test asserts a `not found` message and no throw
- command exit code 0 for `node --test test/tools.test.mjs`
</acceptance_criteria>
<done>gsd_job registers in core-tools.js and launches shell/subagent jobs and reports status by id, returning messages (never throwing) for a missing id.</done>
</task>
<task type="auto">
<name>Task 2: gsd_job cancel + retry actions (D-04/D-06/D-05)</name>
<files>lib/core-tools.js, test/tools.test.mjs</files>
<read_first>lib/core-tools.js, lib/jobs.js</read_first>
<action>
In the `gsd_job` execute, implement the remaining actions by delegating to the domain functions:
- `action: 'cancel'`: require `id`; call `cancelJob(ctx, s, cwd, id)`; if `ok` return `cancelled <id>` with its reason, else return the no-op message from cancelJob (e.g. already-terminal or unknown) — never throw (D-04).
- `action: 'retry'`: require `id`; call `retryJob(ctx, s, cwd, id, { maxRetries: args.max_retries })` (add optional `max_retries` number to the schema); if `ok` return a line naming the new attempt id and that the old entry was marked retried, else return the refusal/no-op message (unknown, not-failed, or max_retries exceeded) — never throw (D-05/D-06).

Ensure `action` is validated up front: an unknown action value returns a clear `unknown action` message rather than falling through (D-05).

In test/tools.test.mjs add: (a) `action:'cancel'` on a running job flips it to `failed` with `reason.reason === 'cancelled'` and returns a confirm line; (b) `action:'cancel'` on an already-done or unknown job returns a no-op message and never throws; (c) `action:'retry'` on a failed job creates a new attempt entry (the manifest has two JOB entries) and the old one carries `reason.reason === 'retried'`; (d) `action:'retry'` beyond `max_retries` returns a refusal and adds no entry; (e) an unknown `action` value returns an `unknown action` message and never throws.
</action>
<verify>node --test test/tools.test.mjs</verify>
<acceptance_criteria>
- grep-verifiable string in lib/core-tools.js: `cancelJob(` and `retryJob(` inside the gsd_job execute
- a cancel test asserts the job is `failed` with `reason.cancelled`; a retry test asserts a new attempt id and the old entry marked `retried`
- an unknown-action and an unknown-id test each return a message and never throw
- command exit code 0 for `node --test test/tools.test.mjs`
</acceptance_criteria>
<done>gsd_job supports cancel and retry by delegating to cancelJob/retryJob, returning messages for all non-actionable cases and never throwing.</done>
</task>
<task type="auto">
<name>Task 3: gsd_status Async Jobs renders the terminal reason (D-08)</name>
<files>lib/core-tools.js, test/tools.test.mjs</files>
<read_first>lib/core-tools.js, lib/state.js</read_first>
<action>
Update the gsd_status Async Jobs rendering (lib/core-tools.js lines 144-151) so each job line includes its terminal `reason` when present. Extract a small module-level helper `jobLine(j)` in core-tools.js that renders `- <id>: <kind> — <status> — <result || started || "">` and, when `j.reason && j.reason.reason` exists, appends ` [reason: <reason>]` (and the `detail` when present as `(<detail>)`). Use it in the `else` branch that currently pushes the raw line at line 149. Keep the corrupt/empty section handling unchanged, and keep the section never-throwing.

Per D-08, `status` remains `'done'`/`'failed'` and the `reason` is additive — existing readers (tests asserting `/JOB-01/` and `/done/`) must keep passing.

In test/tools.test.mjs add a gsd_status test that seeds a job with `{ kind: 'subagent', status: 'failed', result: 'x', reason: { reason: 'timeout', detail: 'exceeded' } }`, calls gsd_status, and asserts the rendered Async Jobs line contains `[reason: timeout]` and `exceeded`, and that the line still shows `failed`. Confirm the existing gsd_status Async Jobs tests still pass unchanged.
</action>
<verify>node --test test/tools.test.mjs</verify>
<acceptance_criteria>
- grep-verifiable string in lib/core-tools.js: `reason` appended to the Async Jobs line and a `jobLine` helper
- a seeded-reason test asserts gsd_status renders `[reason: timeout]` and the detail
- all pre-existing gsd_status Async Jobs tests still pass (status done/failed lines unchanged)
- command exit code 0 for `node --test test/tools.test.mjs`
</acceptance_criteria>
<done>gsd_status renders each job's terminal `reason` (and detail) inline while keeping the done/failed status and all existing Async Jobs rendering intact.</done>
</task>
</tasks>
