I have all the research I need. Here is the full RESEARCH.md:

```markdown
# GSD-18-job-runtime-extensions — Research

## Domain analysis

### Subagent background jobs (JOBX-01, D-01/D-02)

The host `subagents` service exposes a one-shot start primitive. `subagents.start('spawn', req)` returns a `SubagentRun` with `.result` (a Promise) and `.dispose()`. The bundle already drives it synchronously in `lib/_runner.js:spawnSubagent`.

**Critical finding — `signal` is REQUIRED, not optional.** On `SubagentStartRequest`, the field is declared `readonly signal: AbortSignal;` with no `?` [VERIFIED: types.d.ts:91-140]. D-01's "WITHOUT passing exec.signal" therefore cannot mean *omitting* `signal` — the service will reject a request with no signal. It means **do not bind the run's lifetime to the driving turn's `exec.signal`**; instead pass a job-owned `AbortSignal` (fresh `AbortController().signal`). The planner must construct this signal at launch and keep a reference to it for timeout/cancel. This is the single most important correctness constraint in the phase.

Confidence: HIGH — read directly from the type contract the bundle compiles against.

The spawn provider is in-process: `SubagentRun.localAgent` is the published child; the run lives only while the host process lives (matches D-01's out-of-scope note). The result shape:
- `SubagentResult.output: ContentBlock[]` — `blocksToText(result.output)` yields the final assistant text (already imported in `_runner.js` from `_shared.js:341`).
- `SubagentResult.diagnostic?: string` — provider failure detail, capped 4096 bytes.
- `SubagentResult.stopReason` ∈ `'completed' | 'aborted' | 'error' | 'max-tokens' | 'refusal'` [VERIFIED: types.d.ts:180-200].

Mapping onto the existing result-file shape (D-02): `stopReason === 'completed'` → `{ exitCode: 0, stdout: blocksToText(output), stderr: '' }`; any non-completed reason → `{ exitCode: 1, stderr/error: diagnostic || blocksToText(output) }`. reconcileJobs already treats `exitCode !== 0 || Boolean(result.error)` as failure, so **no reconcileJobs special-casing is needed** — D-02 is automatically satisfied if the writer follows this shape [VERIFIED: jobs.js:61-65].

**The run must be disposed.** The contract: "Consumers await that result and must always `dispose` to cancel remaining work and reach quiescence" [VERIFIED: types.d.ts:236-265]. The job code must call `run.dispose()` after `run.result` settles (success or failure), and also on the abort/cancel path. Skipping dispose leaks a live child on the cordis context.

Confidence: HIGH.

### Timeout + cancellation (JOBX-02, D-03/D-04)

Two distinct enforcement paths:

- **Shell:** `lib/job-wrapper.mjs` currently parses argv as `[jobId, resultFile, ...command]` [VERIFIED: job-wrapper.mjs:19]. D-03 requires the wrapper to enforce a per-job timeout. Add a `timeout` (seconds/ms) argv and a timer that kills the child and writes a result carrying an explicit timeout marker (`error` or a `reason`-signal field). This is a *modification* to the Phase 9 wrapper, which is allowed (the out-of-scope note is about not changing the detached-child *mechanism* — spawning/stdio/detached semantics — not about refusing to add a timeout). The wrapper stays zero-dependency and writes with `node:fs/promises`.
- **Subagent:** enforcement rides the job-owned `AbortSignal`. `AbortSignal.timeout(ms)` (Node ≥ 17.3) or an `AbortController` + timer. On abort the run resolves with `stopReason: 'aborted'` or rejects.

**Open problem — distinguishing `timeout` from `cancelled`.** Both use the same abort channel (D-03 timeout aborts, D-04 cancel aborts). A bare abort cannot tell which fired. Resolution: keep a job-owned `AbortController`; a timer sets a `timedOut` flag then calls `controller.abort()`; the result-writer reads the flag — `timedOut` → reason `'timeout'`, else `'cancelled'`. (Alternative: two independent signals, but a single controller + flag is simpler and matches the manifest's single-reason field.) Mark this **(RESOLVED: flag-on-abort pattern)**.

Confidence: HIGH on the primitive, MEDIUM on the exact flag approach (planner should adopt the recommendation).

Cancellation (D-04) must be a no-op that never throws for an unknown/already-terminal job — consistent with the existing no-throw philosophy.

### gsd_job tool (JOBX-03, D-05)

Registration pattern is `defineTool({name, parameters, output, execute})` in `lib/core-tools.js` [VERIFIED: core-tools.js:7, 18]. The bundle's tool files declare `inject = ["gsdState", "tools"]` and fetch the host `subagents` service at call time via `ctx.get("subagents")` — the same is done in `execute.js:54` and `plan.js:45` [VERIFIED]. So **`gsd_job` does NOT need a new `inject` entry for `subagents`**; it follows the existing dynamic-fetch pattern. `exec.agent` and `exec.signal` are available on the tool's `exec` (used by `_runner.js:16-17`); D-01 ignores `exec.signal` and substitutes the job-owned signal.

**Where to register:** the canonical ref points at `core-tools.js` as the registration pattern. Registering `gsd_job` there avoids touching `package.json` `exports` + `cordis.patch.yml` (the fixed 12-export list) and any new mount surface. It is a job-surface tool rather than an "orient" tool, but the file already owns `reconcileJobs` import and the Async Jobs section, so it is the natural home. **(RESOLVED: register in core-tools.js)**.

`defineTool` execute returns a string; the tool never throws over a bad manifest (D-05). Job-not-found / unknown action → clear message.

Confidence: HIGH.

### Retry + queueing (JOBX-04, D-06/D-07)

- **Retry (manual):** re-run a failed job's stored `command` (shell) or `prompt` (subagent), respecting a per-config cap `jobs.max_retries` (default 3). D-06 "marks the retried attempt with reason 'retried' on the old entry" implies the retry is a **new attempt entry** (new `JOB-NN` id via `appendJob`) and the *old* terminal entry is annotated `reason.reason: 'retried'`. **(RESOLVED: new attempt entry, old marked retried.)**
- **Queue (FIFO):** manifest lifecycle becomes `pending → running → done/failed`. A scheduler promotes `pending` entries to `running` up to `jobs.concurrency` (default 2) as capacity frees. The natural promotion point is the reconcile pass (`reconcileJobs`), which `gsd_status` already calls before rendering [VERIFIED: core-tools.js:128]. The scheduler must run on every promotion opportunity (reconcile + cancel + retry), not just at launch.

Manifest accessors `appendJob`/`updateJob` are the single choke point [VERIFIED: state.js:387-410]; the scheduler must route all transitions through them, never raw `node:fs`.

Confidence: HIGH.

### Manifest + error handling (D-08/D-09)

- `updateJob` already stamps `completed` when a job reaches `done`/`failed` [VERIFIED: state.js:405-407]. D-08 adds a structured `reason` field: `{ reason: 'completed'|'timeout'|'cancelled'|'error'|'retried', detail }`. `gsd_status`'s Async Jobs line (`core-tools.js:149`) must render the reason.
- Note: `appendJob` stamps `started` at append time [VERIFIED: state.js:393-394]. For *queued* jobs, `started` arguably belongs at promotion-to-running time; the planner should decide whether to reset `started` on promotion (recommend: yes, set it on promote via `updateJob`).
- Config: `_defaultConfig` currently has **no `jobs` block** [VERIFIED: state.js:145-163]. Add `jobs: { timeout: 60, concurrency: 2, max_retries: 3 }` to `_defaultConfig`, and a `resolveJobsConfig` helper mirroring `resolveGatesConfig` [VERIFIED: gates.js:211-220] that degrades safely via `readConfig`'s existing try/catch-default [VERIFIED: state.js:337-341]. D-09.
- The no-throw invariant: `reconcileJobs` already swallows read/parse errors and leaves the job `running` [VERIFIED: jobs.js:49-72]. Subagent result read-back reuses this exact path, so it inherits the invariant automatically. The scheduler must likewise never throw on a corrupt manifest.

Confidence: HIGH.

## Package legitimacy

No new dependencies are proposed. `package.json` is zero-dependency (`"dependencies": {}`) [VERIFIED: package.json]. All work reuses:
- `node:child_process` `spawn` — Node built-in [VERIFIED: jobs.js:15, job-wrapper.mjs:14].
- `node:fs/promises` — Node built-in [VERIFIED: job-wrapper.mjs:15].
- The host `subagents` service (`@deepseek-ai/dsh-subagent` + `@deepseek-ai/dsh-subagent-spawn-in-process`) — already a peer/host service the bundle consumes via `ctx.get("subagents")`; not a new install [VERIFIED: _runner.js:9-12, execute.js:54].
- `@deepseek-ai/dsh-tools` `defineTool` — existing peer dependency [VERIFIED: package.json peerDependencies, core-tools.js:7].

No third-party packages to vet. `AbortSignal.timeout` is a platform API (Node ≥ 17.3), no package.

## Risks and Open Questions

| # | Risk / Open Question | Status |
|---|---|---|
| OQ-1 | `SubagentStartRequest.signal` is required; "without exec.signal" means pass a job-owned AbortSignal, not omit it. | **(RESOLVED)** — verified in types.d.ts:91-140; planner must construct `new AbortController().signal` at launch. |
| OQ-2 | Distinguishing `timeout` vs `cancelled` reasons when both go through the same abort channel. | **(RESOLVED)** — single controller + `timedOut` flag set by the timer before `abort()`. |
| OQ-3 | Where `gsd_job` is registered. | **(RESOLVED)** — register in `lib/core-tools.js`; avoids package.json/cordis export churn; `subagents` fetched dynamically like execute.js/plan.js. |
| OQ-4 | Retry semantics — new attempt entry vs reusing id. | **(RESOLVED)** — new `JOB-NN` attempt via `appendJob`; old entry annotated `reason.reason: 'retried'` per D-06 wording. |
| OQ-5 | `started` timestamp on queued jobs promoted to running. | **(RESOLVED)** — set `started` at promotion via `updateJob` so it reflects actual run start. |
| OQ-6 | Subagent run leak if not disposed. | **(RESOLVED)** — must `run.dispose()` after `result` settles AND on abort/cancel (contract requires it). |
| R-1 | Adding a timeout argv to `job-wrapper.mjs` changes its argv contract; any older in-flight detached children spawned without the arg must still work (make timeout optional). | Mitigate: timeout arg optional, default no timeout. |
| R-2 | In-process subagent jobs do not survive host restart — D-01 scopes them out; a running entry in the manifest would look stuck after restart. Acceptable (matches Phase 9 "still running" semantics; no-throw). | Accepted. |
| R-3 | Concurrency promotion must not double-launch. Guard promote with a check that the entry is still `pending` at promotion time. | Mitigate: read-modify-write through `updateJob`; only promote `pending`. |
| R-4 | `dispose()` aborts the run too — so cancel-by-`abort()` and cleanup-dispose are the same channel; ensure the flag logic still yields `'cancelled'` not `'timeout'`. | Mitigate: timer cleared on any terminal path before dispose. |

## Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| `gsd_job` tool surface (launch/status/cancel/retry, arg validation, no-throw messages) | **presentation** | defineTool in core-tools.js; string returns; never throws. |
| Queue scheduler (promote `pending→running` up to concurrency) | **domain** | pure-ish orchestration over manifest accessors; call from reconcile + cancel + retry. |
| Shell detached launch + wrapper timeout kill | **integration** | node:child_process + detached wrapper (job-wrapper.mjs); standalone child. |
| Subagent launch / result write / dispose | **integration** | host `subagents.start('spawn')`; `run.result.then()` writes result file via ctx.fs. |
| Timeout/cancel signal wiring (flag-on-abort) | **domain** | maps abort source → reason `timeout`/`cancelled`. |
| Manifest persistence (append/update + `reason` field, `started` on promote) | **data** | state.js accessors — the single choke point (DUR-04); never raw node:fs. |
| Config `jobs {timeout, concurrency, max_retries}` resolution | **data** | `_defaultConfig` + `resolveJobsConfig` (mirrors resolveGatesConfig). |

No security-sensitive capability sits in the wrong tier. The only externally-triggerable surface is `gsd_job` shell launch, which already uses an argv array with no interpreter/string interpolation (no injection surface) — unchanged from Phase 9 [VERIFIED: job-wrapper.mjs:10-12].

## Validation Architecture

Follow the existing patterns: `test/jobs.test.mjs` (real child processes, realFsAdapter) and `test/tools.test.mjs` (fake `subagents` + FakeFs, direct `.execute()` calls).

1. **Subagent launch → result file (JOBX-01):** fake `subagents.start` returns `{ result: Promise.resolve({output:[{type:'text',text}], stopReason:'completed'}), dispose: spy }`; assert the job is recorded `running`, a result file appears, and `reconcileJobs` flips it to `done` with the subagent text in `result`. Assert `dispose` was called. Also assert non-completed stopReason → `failed`.
2. **Shell timeout (JOBX-02):** launch a long-lived shell command with a tiny timeout via the wrapper; assert the child is killed and reconcile marks the job `failed` with `reason.reason === 'timeout'`.
3. **Subagent timeout/cancel (JOBX-02):** fake `subagents.start` captures the passed `signal`; fire `controller.abort()` (cancel) vs timer flag (timeout) → assert `reason` `'cancelled'` vs `'timeout'`.
4. **gsd_job tool (JOBX-03):** call `execute({action:'launch', kind:'shell'|'subagent',...})`, `action:'status'`, `action:'cancel'`, `action:'retry'`; assert manifest state transitions and that unknown action / unknown job returns a message and never throws.
5. **Retry (JOBX-04):** a failed job retried → a new attempt entry; old entry has `reason.reason:'retried'`; exceeding `max_retries` returns a clear refusal.
6. **Queue FIFO + concurrency (JOBX-04):** append 3 jobs with concurrency 1; assert only one is `running`, the rest `pending`; promote on reconcile as capacity frees; FIFO order preserved.
7. **No-throw + config degrade (D-09):** corrupt/missing result file leaves job `running` (extend existing corrupt-file test); missing/partial `jobs` config block yields the defaults; `gsd_status` renders the `reason`.
8. **`npm test` (MOUNT-06):** full suite passes on a clean checkout.

## Project Constraints

- **Zero-dependency bundle** [VERIFIED: package.json]: reuse `node:child_process`, `node:fs/promises`, and the host `subagents` service only — no new packages.
- **No-throw invariant** (D-06 / D-09): every job/runtime path — reconcile, scheduler, gsd_job, status — must degrade gracefully over a missing/corrupt manifest or result file.
- **Manifest writes route through the gsdState accessors** (`appendJob`/`updateJob`), never raw `node:fs` (DUR-04) — except the detached wrapper, which has no `ctx` and legitimately uses `node:fs/promises` (Phase 9 D-03).
- **Single choke point / shared constants** (CQ-02): the `jobs` config defaults and the manifest `reason` vocab should live in one shared place.
- **Backward compatibility** (D-08): existing `done`/`failed` readers (gsd_status, ship, tests) must keep working; the new `reason` field is additive.
- **Feature branch discipline** (CQ-07): every phase tool commits its artefacts to the `phase-18` branch; new/edited tests and `lib/*.js` changes commit atomically per plan.
```
</content>