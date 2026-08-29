---
phase: 24-composability-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/jobs.js", "lib/core-tools.js", "test/jobs.test.mjs", "test/helpers/mount-harness.mjs", "test/mount.test.mjs"]
autonomous: true
requirements: ["DEGR-06"]
gap_closure: false
user_setup: []
must_haves:
  truths:
    - "Unloading/HMR of core-tools cancels running background jobs: subagent controllers are aborted and shell children are killed, and the async-jobs manifest reflects 'cancelled' for each."
    - "The unload-cancel teardown is best-effort and never throws, even when gsdState is absent or its updateJob fails."
  artifacts:
    - path: "lib/jobs.js"
      provides: "createJobsRuntime() returning { live, cancelAll }; the domain functions (launchJob/cancelJob/reconcileJobs/scheduleJobs/retryJob) accept the runtime as their first parameter instead of a module-level singleton; live records carry s/cwd/timer so cancelAll can write the manifest and clear timers."
      min_lines: 40
      exports: ["createJobsRuntime", "launchJob", "cancelJob", "reconcileJobs", "retryJob", "scheduleJobs"]
    - path: "lib/core-tools.js"
      provides: "creates the jobs runtime in apply, provides it as 'gsdJobsRuntime' via ctx.provide, registers a ctx.effect disposer that calls runtime.cancelAll() on unload/HMR, and passes runtime as the first arg to every jobs.js call."
      min_lines: 40
      exports: ["name", "inject", "apply"]
  key_links:
    - from: "lib/core-tools.js"
      to: "lib/jobs.js"
      via: "core-tools apply calls createJobsRuntime(), provides the result as 'gsdJobsRuntime', registers ctx.effect(() => () => runtime.cancelAll(), 'gsdJobsRuntime.cancelAll'), and passes runtime as the first argument to reconcileJobs/launchJob/cancelJob/retryJob."
      pattern: "createJobsRuntime|gsdJobsRuntime|reconcileJobs\\(runtime|launchJob\\(runtime|cancelJob\\(runtime|retryJob\\(runtime"
---
<objective>Effect-scope the background-job live registry to its owning fiber (DEGR-06): replace the module-level `live` singleton in lib/jobs.js with a per-fiber jobs runtime service owned by core-tools, whose ctx.effect cleanup cancels all running jobs on unload/HMR (abort subagent controllers, kill shell children, clear timeout timers, best-effort 'cancelled' manifest write). Prove it offline with unload-cancel tests.</objective>
<context>@lib/jobs.js (module-level `const live = new Map()` at line 33; startRun line 68, startSubagentRun line 90, cancelJob line 182, reconcileJobs line 215, scheduleJobs line 252, retryJob line 272), @lib/core-tools.js (inject line 14, apply line 29, gsd_status reconcileJobs line 180, gsd_job jobs calls lines 345/357/365/375), @lib/state.js (ctx.provide + ctx.effect pattern at lines 667-671), @test/jobs.test.mjs (imports jobs.js functions at line 15, subagentCtx helper line 42, beforeEach line 66), @test/helpers/mount-harness.mjs (ctx.effect at line 113), @test/mount.test.mjs (applyAll inject assertion ~line 208)</context>
<tasks>
  <task type="auto">
    <name>Task 1: create the jobs runtime service and thread it through jobs.js and core-tools (tracer)</name>
    <files>lib/jobs.js, lib/core-tools.js, test/jobs.test.mjs</files>
    <read_first>lib/jobs.js, lib/core-tools.js, test/jobs.test.mjs</read_first>
    <action>In lib/jobs.js: delete the module-level `const live = new Map();` (line 33). Add `export function createJobsRuntime()` that returns `{ live: new Map() }` (cancelAll is added in Task 2). Change every exported domain function to accept `runtime` as its FIRST parameter and use `runtime.live` in place of the module `live`: `launchJob(runtime, ctx, s, cwd, opts)`, `startRun(runtime, ctx, s, cwd, entry, jobsCfg)`, `startSubagentRun(runtime, ctx, s, cwd, entry)`, `cancelJob(runtime, ctx, s, cwd, id)`, `reconcileJobs(runtime, ctx, s, cwd)`, `scheduleJobs(runtime, ctx, s, cwd)`, `retryJob(runtime, ctx, s, cwd, id, opts)`. Replace every `live.` reference with `runtime.live.` (lines 79, 121-122, 128, 153, 167, 170, 190, 199, 201). Update internal calls to pass runtime: launchJob→scheduleJobs(runtime, ...), reconcileJobs→scheduleJobs(runtime, ...), retryJob→scheduleJobs(runtime, ...), scheduleJobs→startRun(runtime, ...). In lib/core-tools.js: import createJobsRuntime from "./jobs.js"; in apply() create `const runtime = createJobsRuntime();` and `ctx.provide("gsdJobsRuntime", runtime);`. Update the jobs.js call sites to pass runtime first: line 180 `reconcileJobs(runtime, ctx, s, cwd)`, line 345 `launchJob(runtime, ctx, s, cwd, {...})`, line 357 `reconcileJobs(runtime, ctx, s, cwd)`, line 365 `cancelJob(runtime, ctx, s, cwd, args.id)`, line 375 `retryJob(runtime, ctx, s, cwd, args.id, {...})`. In test/jobs.test.mjs: import createJobsRuntime; in beforeEach create `const runtime = createJobsRuntime();`; update every jobs.js call to pass runtime as the first argument (launchJob, reconcileJobs, cancelJob, retryJob, scheduleJobs).</action>
    <verify>node --test test/jobs.test.mjs</verify>
    <acceptance_criteria>
      - grep "createJobsRuntime" lib/jobs.js returns a definition and an export
      - grep "const live = new Map()" lib/jobs.js returns nothing (singleton removed)
      - grep "runtime.live" lib/jobs.js returns at least one hit
      - grep "gsdJobsRuntime" lib/core-tools.js returns a ctx.provide hit
      - `node --test test/jobs.test.mjs` exits 0
    </acceptance_criteria>
    <done>jobs.js exposes createJobsRuntime and every domain function takes runtime as its first param; core-tools provides 'gsdJobsRuntime' and passes runtime to all jobs calls; the existing jobs integration suite passes with the new signatures.</done>
  </task>
  <task type="auto">
    <name>Task 2: implement cancelAll, extend live records, register the ctx.effect cleanup, and prove the wiring</name>
    <files>lib/jobs.js, lib/core-tools.js, test/helpers/mount-harness.mjs, test/mount.test.mjs</files>
    <read_first>lib/jobs.js, lib/core-tools.js, test/helpers/mount-harness.mjs, test/mount.test.mjs</read_first>
    <action>In lib/jobs.js: (a) extend the live records so cancelAll can write the manifest and clear timers — shell record becomes `{ kind: "shell", handle: child, s, cwd }` (line 79); subagent record becomes `{ kind: "subagent", handle: rec, s, cwd }` where `rec = { controller: ac, timedOut: false, cancelled: false, dispose: run.dispose, timer: null }` (lines 121-122). (b) In startSubagentRun, store the timeout timer on the record: replace the local `let timeoutTimer = null;` (line 125) with `rec.timer = null;` and assign `rec.timer = setTimeout(...)`; in the settle closure change `if (timeoutTimer) clearTimeout(timeoutTimer)` (line 141) to `if (rec.timer) clearTimeout(rec.timer)`. (c) Add `cancelAll()` to the object returned by createJobsRuntime: iterate `live`, and per `[id, rec]` — for subagent set `rec.handle.cancelled = true; rec.handle.controller.abort(); if (rec.handle.timer) clearTimeout(rec.handle.timer);`; for shell `try { rec.handle.kill(); } catch {}`. Then best-effort manifest write per entry: `try { await rec.s.updateJob(rec.cwd, id, { status: "failed", reason: { reason: "cancelled", detail: "cancelled on unload" } }); } catch {}`. cancelAll must NEVER delete subagent entries (D-02 — the subagent `.then` remains the only removal point) and must NEVER throw (D-03). In lib/core-tools.js: in apply() register the cleanup effect after providing the runtime as a FIRE-AND-FORGET disposer — `ctx.effect(() => () => { void runtime.cancelAll(); }, "gsdJobsRuntime.cancelAll");` — with an inline comment that the returned promise is intentionally not awaited because cordis may not await disposer promises on unload and the manifest write is best-effort (D-03). In test/helpers/mount-harness.mjs: extend ctx.effect to record registered effects — add `const effects = []; ctx.effects = effects;` and in ctx.effect push `{ label, disposer }` (where disposer is the returned function) before returning it. In test/mount.test.mjs: in the applyAll test (around line 208) add assertions that `ctx.provided.has("gsdJobsRuntime")` is true and that `ctx.effects` contains an entry with `label === "gsdJobsRuntime.cancelAll"`; then find that entry's `disposer` and assert `assert.doesNotThrow(() => disposer())` — this exercises the actual un-awaited disposer path (not a direct `await runtime.cancelAll()`), proving the fire-and-forget teardown never throws.</action>
    <verify>node --test test/mount.test.mjs test/jobs.test.mjs</verify>
    <acceptance_criteria>
      - grep "cancelAll" lib/jobs.js returns a definition inside createJobsRuntime
      - grep "rec.timer" lib/jobs.js returns at least one hit
      - grep "cancelled on unload" lib/jobs.js returns a hit
      - grep "void runtime.cancelAll" lib/core-tools.js returns a hit (fire-and-forget disposer)
      - grep "gsdJobsRuntime.cancelAll" lib/core-tools.js returns a ctx.effect hit
      - grep "ctx.effects" test/helpers/mount-harness.mjs returns a hit
      - grep "doesNotThrow" test/mount.test.mjs returns a hit (disposer-invocation assertion)
      - `node --test test/mount.test.mjs test/jobs.test.mjs` exits 0
    </acceptance_criteria>
    <done>cancelAll aborts/kills + clears timers + best-effort writes 'cancelled' without deleting subagent entries or throwing; core-tools registers a fire-and-forget cleanup effect; the harness records effects; mount.test.mjs proves the provide + effect wiring and that invoking the disposer never throws.</done>
  </task>
  <task type="auto">
    <name>Task 3: add offline unload-cancel tests (DEGR-06 Test A/B/C)</name>
    <files>test/jobs.test.mjs</files>
    <read_first>test/jobs.test.mjs</read_first>
    <action>In test/jobs.test.mjs add three tests under the existing describe block, using the existing `subagentCtx` helper (line 42) and the `runtime` created in beforeEach. Test A (subagent unload-cancel): build a subagentCtx whose run never settles on its own and whose signal records an abort (mirror the existing "subagent cancel" test at line 221), launch a subagent job via `launchJob(runtime, ctx, s, tmp, { kind: "subagent", prompt: "x" })`, then `await runtime.cancelAll()`, then read the manifest and assert the job's `reason.reason === "cancelled"`. Test B (shell unload-cancel): launch a shell job with a long-running command (e.g. `["node", "-e", "setTimeout(() => {}, 10000)"]`), `await runtime.cancelAll()`, read the manifest and assert the job's `reason.reason === "cancelled"`. Test C (best-effort no-throw): make the manifest write fail (e.g. replace the live record's `s` with a stub whose updateJob rejects, or otherwise make gsdState unavailable) and assert `await runtime.cancelAll()` does not throw.</action>
    <verify>node --test test/jobs.test.mjs</verify>
    <acceptance_criteria>
      - grep "unload-cancel" test/jobs.test.mjs returns at least three test names
      - grep "runtime.cancelAll" test/jobs.test.mjs returns at least three hits
      - `node --test test/jobs.test.mjs` exits 0
    </acceptance_criteria>
    <done>Three offline tests prove DEGR-06: a running subagent is aborted and the manifest reflects 'cancelled'; a running shell child is killed and the manifest reflects 'cancelled'; cancelAll never throws when the manifest write fails.</done>
  </task>
</tasks>
