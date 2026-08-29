---
phase: 24-composability-hardening
plan: 01
subsystem: plugin-composability
tags: [jobs-runtime, effect-scope, cancelAll, unload-cancel, DEGR-06, D-01, D-02, D-03]
dependency_graph:
  requires: []
  provides: ["per-fiber jobs runtime service (gsdJobsRuntime) whose ctx.effect cleanup cancels all running jobs on unload/HMR"]
  affects: ["lib/jobs.js", "lib/core-tools.js", "test/jobs.test.mjs", "test/helpers/mount-harness.mjs", "test/mount.test.mjs"]
tech-stack: [node, cordis, dsh-tools]
key-files:
  created: []
  modified: ["lib/jobs.js", "lib/core-tools.js", "test/jobs.test.mjs", "test/helpers/mount-harness.mjs", "test/mount.test.mjs"]
decisions:
  - "D-01: the background-job live registry is owned by a per-fiber jobs runtime service (createJobsRuntime) provided by core-tools under 'gsdJobsRuntime' (distinct from the gsdJobs capability key); every jobs.js domain function receives the runtime as its first parameter and reads runtime.live instead of a module-level singleton."
  - "D-02: the subagent `.then` remains the ONLY place a subagent entry is removed; cancelAll sets cancelled/aborts/clears timers but never deletes subagent entries."
  - "D-03: the unload-cancel cleanup is best-effort and never throws — it aborts subagent controllers, kills shell children, clears timeout timers, and best-effort writes 'cancelled' to the async-jobs manifest, swallowing failures (unload may be tearing down gsdState)."
  - "The cleanup effect is registered fire-and-forget (void runtime.cancelAll()) because cordis may not await disposer promises on unload (Claude's Discretion per CONTEXT)."
metrics:
  duration: "~15 min"
  completed: "2026-08-29"
  actuals:
    tasks: 3
    commits: 3
status: complete
---

# Phase 24 Plan 01: Effect-Scope the Jobs Live Registry (DEGR-06) — Summary

Replaced the module-level `live` singleton in lib/jobs.js with a per-fiber jobs runtime service owned by core-tools, whose `ctx.effect` cleanup cancels every running job on unload/HMR (abort subagent controllers, kill shell children, clear timeout timers, best-effort 'cancelled' manifest write), and proved it offline with unload-cancel tests.

## Tasks

1. **refactor(24-01): thread jobs runtime service through jobs.js and core-tools** (`c7111f0`) — removed the module-level `const live = new Map()` singleton; added `export function createJobsRuntime()` returning `{ live: new Map() }`; changed every domain function to accept `runtime` as its FIRST parameter (`launchJob(runtime, ctx, s, cwd, opts)`, `startRun`, `startSubagentRun`, `cancelJob`, `reconcileJobs`, `scheduleJobs`, `retryJob`) and read `runtime.live`; threaded `runtime` through all internal calls. core-tools imports `createJobsRuntime`, creates the runtime in `apply()`, provides it as `'gsdJobsRuntime'`, and passes `runtime` as the first arg to every jobs.js call (reconcileJobs ×2, launchJob ×2, cancelJob, retryJob). Updated test/jobs.test.mjs to construct a runtime in `beforeEach` and pass it to all 24 call sites.
2. **feat(24-01): cancel running jobs on unload via jobs runtime cleanup** (`a1d1ae0`) — added `cancelAll()` to the runtime: per live entry, aborts subagent controllers + clears timers, kills shell children, then best-effort writes `{ status: "failed", reason: { reason: "cancelled", detail: "cancelled on unload" } }` via `rec.s.updateJob(rec.cwd, id, ...)` — never deleting subagent entries (D-02) and never throwing (D-03). Extended live records to carry `s`/`cwd` (shell + subagent) and moved the timeout timer onto the subagent record (`rec.timer`). core-tools registers the fire-and-forget cleanup `ctx.effect(() => () => { void runtime.cancelAll(); }, "gsdJobsRuntime.cancelAll")`. The mount harness now records registered effects (`ctx.effects`), and mount.test.mjs asserts `gsdJobsRuntime` is provided, the `gsdJobsRuntime.cancelAll` effect is registered, and invoking its disposer never throws.
3. **test(24-01): prove unload-cancel cancels running jobs (DEGR-06)** (`40ee8ff`) — added three offline tests to test/jobs.test.mjs: (A) a running subagent is aborted and the manifest reflects 'cancelled'; (B) a running shell child is killed and the manifest reflects 'cancelled'; (C) `cancelAll` never throws when the manifest write fails (best-effort teardown).

## Verification

- Task 1 verify: `node --test test/jobs.test.mjs` exits 0 (14 tests). Greps confirmed `createJobsRuntime` def+export, singleton removed, `runtime.live` hits, `gsdJobsRuntime` provide.
- Task 2 verify: `node --test test/mount.test.mjs test/jobs.test.mjs` exits 0 (26 tests). Greps confirmed `cancelAll` def, `rec.timer`, `cancelled on unload`, `void runtime.cancelAll`, `gsdJobsRuntime.cancelAll` effect, `ctx.effects`, `doesNotThrow`.
- Task 3 verify: `node --test test/jobs.test.mjs` exits 0 (17 tests, incl. 3 unload-cancel).
- Full suite: `node --test test/*.test.mjs` exits 0 — 387 tests, 0 fail (resolves the `tools.test.mjs` "live is not defined" failure noted in plan-02's summary).

## Requirements Addressed

- **DEGR-06** — the background-job live registry is effect-scoped to its owning fiber: unloading/HMR of core-tools cancels running jobs (subagent controllers aborted, shell children killed, timeout timers cleared) and the async-jobs manifest reflects 'cancelled' for each, best-effort and never throwing.

## Key Decisions

- D-01 applied: per-fiber jobs runtime service (`createJobsRuntime`) provided as `'gsdJobsRuntime'`, distinct from the `gsdJobs` capability key; domain functions take `runtime` as their first parameter.
- D-02 preserved: `cancelAll` never deletes subagent entries — the subagent `.then` remains the only removal point.
- D-03 applied: best-effort teardown, never a throw; the cleanup effect is fire-and-forget (`void runtime.cancelAll()`) because cordis may not await disposer promises on unload.
- Live records extended to carry `s`/`cwd`/`timer` so `cancelAll` can write the manifest and clear timers (RESEARCH OQ-1/OQ-2).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

The unload-cancel cleanup is a security-relevant teardown (kills child processes, aborts subagents). It is correctly placed in the **domain** tier (jobs.js `cancelAll`) and invoked from the **integration** tier (core-tools' `ctx.effect` disposer); no security-sensitive capability sits in the presentation tier. `cancelAll` swallows all failures (D-03) and never deletes subagent entries (D-02), so it cannot leak or double-remove.

## TDD Gate Compliance

Not a TDD plan (no RED/GREEN/REFACTOR structure required by the plan). The test commit (`40ee8ff`) follows the code commits (`c7111f0`, `a1d1ae0`) as specified by the plan's task order.

## Self-Check: PASSED

- Created/modified files exist: `lib/jobs.js`, `lib/core-tools.js`, `test/jobs.test.mjs`, `test/helpers/mount-harness.mjs`, `test/mount.test.mjs` all present.
- Commits exist: `c7111f0`, `a1d1ae0`, `40ee8ff` (confirmed via `git log`).
- `node --test test/*.test.mjs` passes (387/387).
