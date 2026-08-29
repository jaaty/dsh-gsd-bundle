# Phase 24: composability-hardening - Context

**Gathered:** 2026-08-29T01:56:08.163Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Effect-scope the background-job live registry to its owning fiber (a jobs runtime service owned by core-tools) so unload/HMR cancels running jobs — abort subagent controllers, kill shell children, best-effort 'cancelled' manifest write. Declare the subagents coeffect in every consuming plugin: hard required inject on the subagent-driven plugins (plan/execute/verify/quick/ui/map-codebase) and a sub-fiber coeffect on core-tools' gsd_job tool only. Add offline tests proving both the unload-cancel behaviour and the coeffect activation/deactivation.
**Out of scope:** Changing the .planning/ artefact model, the STATE.md step machine, or milestone/phase/requirement tracking. Live-booting a DSH host (offline FakeFs + fake-ctx only). Modifying the subagents host service itself (DSH-owned). Retiring/adding patch rows. Enforcing top-level plugin inject in the fake mount harness (static assertions + the existing ctx.inject sub-fiber enforcement suffice).
</domain>

<decisions>
## Decisions
### Registry ownership (DEGR-06)
- **D-01:** Introduce a jobs runtime service object (mirroring the gsdState pattern) that owns the background-job live registry. It is provided by core-tools (the plugin owning the gsd_job surface) via ctx.provide under a stable key distinct from the gsdJobs capability (exact key is the executor's call, e.g. gsdJobsRuntime), and its apply registers a ctx.effect cleanup that cancels all running jobs on unload/HMR. jobs.js becomes a domain module that receives the runtime service (or its live map) as a parameter instead of holding a module-level singleton.
- **D-02:** The runtime service's live map is the single in-flight registry (jobId -> {kind, handle}); shell entries hold the detached child, subagent entries hold {controller, timedOut, cancelled, dispose}. The subagent `.then` remains the ONLY place a subagent entry is removed, preserving the existing flag-read invariant (the flag read inside the `.then` always finds its live record).
### Unload-cancel semantics (DEGR-06)
- **D-03:** On unload/HMR, the cleanup effect cancels every running job: abort subagent controllers and kill shell children, clear timeout timers, and best-effort write 'cancelled' to the persisted async-jobs manifest for each (swallowing failures — unload may be tearing down gsdState). This is a best-effort teardown, never a throw.
### Subagents coeffect (DEGR-07)
- **D-04:** The subagent-driven plugins (plan, execute, verify, quick, ui, map-codebase) declare 'subagents' as a hard required coeffect in their inject array, so their fiber stays inactive when the subagents host service is absent (reactive coeffect activation/deactivation holds). These plugins are entirely subagent-driven, so a hard coeffect is safe.
- **D-05:** core-tools scopes the subagents coeffect to the gsd_job tool's sub-fiber (ctx.inject) rather than the whole plugin, so only gsd_job deactivates when subagents is absent; gsd_init/gsd_status/gsdOrient/gsdJobs stay active (preserving graceful degradation per phase-22 D-03).
### Testability
- **D-06:** Tests stay offline (FakeFs + fake-ctx, no live DSH boot). DEGR-06 is proven by capturing the runtime service's ctx.effect disposer and invoking it, then asserting running jobs are cancelled (subagent controller aborted / shell child killed) and the manifest reflects 'cancelled'. DEGR-07 is proven by static assertions that each consuming plugin's inject includes 'subagents' (and core-tools' gsd_job sub-fiber declares it), plus a reactive test that a consuming plugin's fiber stays inactive when subagents is absent (reusing the harness's ctx.inject sub-fiber enforcement).
### Claude's Discretion
- Exact service key name for the jobs runtime (e.g. gsdJobsRuntime) and the precise jobs.js signature refactor to receive the runtime service.
- How the ctx.effect cleanup iterates and cancels the live map (order of abort/kill vs manifest write).
- Whether the static inject assertions live in a new test file or extend an existing suite.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DEGR-06 / DEGR-07 requirements
- `REQUIREMENTS.md — DEGR-06 effect-scope the live registry; DEGR-07 declare the subagents coeffect`
### Job runtime domain
- `lib/jobs.js — module-level `const live = new Map()` (line 33), startSubagentRun, cancelJob, reconcileJobs, retryJob, scheduleJobs`
### core-tools plugin (owns gsd_job)
- `lib/core-tools.js — inject (line 14), apply, gsd_job tool (~line 310) delegating to jobs.js launchJob/cancelJob/retryJob/reconcileJobs`
### Subagent path
- `lib/_runner.js — spawnSubagent reads ctx.get('subagents')`
- `lib/plan.js, execute.js, verify.js, quick.js, ui.js, map-codebase.js — inject arrays + subagents usage`
### Service + effect-cleanup pattern to mirror
- `lib/state.js — ctx.provide('gsdState', svc) + ctx.effect(() => () => svc._cache.clear(), ...) (line 670)`
### Test harness
- `test/helpers/mount-harness.mjs — makeMountCtx (ctx.effect invokes callback synchronously and returns the disposer; ctx.inject enforces sub-fiber coeffects), mountSubset`
- `test/removal.test.mjs — removal suite + fake subagents stub`
### Cordis reactivity model
- `.planning/phases/GSD-22-reactive-loop-rendering/GSD-22-reactive-loop-rendering-CONTEXT.md — inject = coeffect; phase-22 D-03 graceful-degradation rationale`
</canonical_refs>

<code_context>
## Code Context
- lib/jobs.js `const live = new Map()` module-level singleton (line 33) — the thing to effect-scope into a per-fiber runtime service.
- lib/core-tools.js inject = ['gsdState', 'tools'] (line 14); gsd_job tool delegates to jobs.js launchJob/cancelJob/retryJob/reconcileJobs (~line 310-350).
- lib/_runner.js spawnSubagent reads ctx.get('subagents') — the subagent path used by plan/execute/verify/quick/ui/map-codebase.
- lib/state.js ctx.provide('gsdState', svc) + ctx.effect(() => () => svc._cache.clear(), ...) (line 670) — the service + effect-cleanup pattern to mirror for the jobs runtime.
- The 6 subagent-driven plugins' inject arrays (all currently ['gsdState', 'tools']).
- test/helpers/mount-harness.mjs ctx.effect invokes the callback synchronously and returns the disposer (R-3); ctx.inject enforces sub-fiber coeffects (missing key => callback never runs).
</code_context>

<specifics>
## Specifics
- Effect-scope the background-job live registry to its owning fiber so unloading/HMR cancels running jobs (DEGR-06).
- Declare the subagents coeffect in every consuming plugin so reactive coeffect activation/deactivation holds (DEGR-07).
- User interview: jobs runtime service mirroring gsdState; best-effort 'cancelled' manifest write on unload; hard required coeffect on the subagent-driven plugins; sub-fiber coeffect on core-tools' gsd_job only.
</specifics>

<deferred>
## Deferred Ideas
- Enforcing top-level plugin inject in the fake mount harness (static assertions + the existing ctx.inject sub-fiber enforcement suffice for this phase).
- Retiring/adding patch rows at runtime or live-booting a DSH host.
</deferred>


---

*Phase: 24-composability-hardening*
*Context gathered: 2026-08-29*