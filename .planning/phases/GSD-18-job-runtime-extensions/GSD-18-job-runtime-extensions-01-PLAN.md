---
phase: 18-job-runtime-extensions
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: ["lib/state.js", "test/state.test.mjs"]
autonomous: true
requirements: ["JOBX-02", "JOBX-04"]
---
<objective>Add the config.json `jobs` block defaults and a shared `resolveJobsConfig` helper, plus the manifest `reason`-field and `started`-on-promote plumbing, so the jobs runtime (plans 02/03) has one authoritative source for timeout/concurrency/max_retries and can record terminal reasons without breaking existing done/failed readers.</objective>
<context>
Read first:
- lib/state.js — `_defaultConfig` (lines 145-163, currently has NO `jobs` block), `readConfig` (337-341), `appendJob` (387-398), `updateJob` (400-410, stamps `completed` on done/failed). The accessors are the single choke point for .planning/async-jobs.json (DUR-04); every manifest write must route through them.
- lib/gates.js — `resolveGatesConfig` (lines 211-220) is the config-sub-block-with-defaults pattern to mirror for `resolveJobsConfig`.
- test/state.test.mjs — "initProject->readConfig round-trips the config" (lines 408-426) to extend for the jobs block.
- .planning/phases/GSD-18-job-runtime-extensions/GSD-18-job-runtime-extensions-CONTEXT.md — decisions D-08, D-09.
</context>
<tasks>
<task type="auto">
<name>Task 1 (tracer): jobs config block + shared resolveJobsConfig (D-09)</name>
<files>lib/state.js, test/state.test.mjs</files>
<read_first>lib/state.js, lib/gates.js</read_first>
<action>
In lib/state.js, define a module-level constant `DEFAULT_JOBS_CONFIG = { timeout: 60, concurrency: 2, max_retries: 3 }` (single source of truth for the defaults, per CQ-02). Add a `jobs: { timeout: 60, concurrency: 2, max_retries: 3 }` property to `_defaultConfig` (the same literal referenced from DEFAULT_JOBS_CONFIG) so freshly-initialised projects carry the block.

Add and export a pure helper `resolveJobsConfig(cfg)` that mirrors resolveGatesConfig's shape: read `(cfg && cfg.jobs) || {}`; for each of timeout/concurrency/max_retries, use the value when it is a finite number, otherwise the DEFAULT_JOBS_CONFIG fallback. Return `{ timeout, concurrency, max_retries }`.

Per D-09 this must degrade safely: an absent jobs block, a partial block (e.g. only `{ timeout: 5 }`), and a non-numeric value each yield the defaults for the missing keys and never throw. `readConfig` already returns the full `_defaultConfig` on missing/corrupt config.json, so resolveJobsConfig inherits that safety.

In test/state.test.mjs, extend the config round-trip test to assert `cfg.jobs` equals `{ timeout: 60, concurrency: 2, max_retries: 3 }`. Add tests asserting resolveJobsConfig returns the defaults for an empty/absent cfg, merges a partial block (only `timeout` overrides, concurrency/max_retries stay default), honours all three when present, and falls back per-key for non-numeric values. Export resolveJobsConfig from state.js.
</action>
<verify>node --test test/state.test.mjs</verify>
<acceptance_criteria>
- grep-verifiable string in lib/state.js: `resolveJobsConfig` (exported) and `DEFAULT_JOBS_CONFIG`
- grep-verifiable string in lib/state.js `_defaultConfig`: `jobs:` containing `timeout`, `concurrency`, `max_retries`
- command exit code 0 for `node --test test/state.test.mjs`
</acceptance_criteria>
<done>resolveJobsConfig(cfg) returns `{timeout, concurrency, max_retries}` with defaults for any missing/non-numeric key, `_defaultConfig` carries the jobs block, and the state.test.mjs suite passes.</done>
</task>
<task type="auto">
<name>Task 2: manifest reason-field + started-on-promote plumbing (D-08, OQ-5)</name>
<files>lib/state.js, test/state.test.mjs</files>
<read_first>lib/state.js, lib/_shared.js</read_first>
<action>
D-08 requires terminal outcomes to carry a structured `reason: { reason: 'completed'|'timeout'|'cancelled'|'error'|'retried', detail }` while staying backward-compatible with existing done/failed readers (gsd_status, ship, tests read `status`/`result`, never `reason`).

In lib/state.js, verify `appendJob` (387-398) and `updateJob` (400-410) already pass arbitrary fields through `Object.assign`/`...job` — they do, so no structural change is required for a caller-supplied `reason` object; document this contract in a short comment above updateJob noting that `reason` and `attempts`/`retryCount` are caller-managed optional fields. Ensure `appendJob` does NOT stamp `started` over an explicit caller value (it currently does `started: job.started || nowIso()` — that is correct and lets the scheduler set a real `started` at promotion via updateJob, per OQ-5).

Add tests in test/state.test.mjs under the async-jobs accessors describe block: (a) `updateJob` with `{ status: 'failed', reason: { reason: 'timeout', detail: 'x' } }` persists the reason object verbatim and stamps `completed`; (b) `appendJob` with an explicit `started` preserves that value rather than overwriting with nowIso(); (c) `appendJob` with `status: 'pending'` and no started stamps a default started (existing behaviour, assert it still holds).
</action>
<verify>node --test test/state.test.mjs</verify>
<acceptance_criteria>
- grep-verifiable string in test/state.test.mjs: `reason: { reason:` and a test using `status: 'pending'`
- a persisted `reason` object round-trips verbatim through readJobs
- command exit code 0 for `node --test test/state.test.mjs`
</acceptance_criteria>
<done>appendJob/updateJob persist a structured `reason` object and an explicit `started` untouched; the state.test.mjs suite (config + accessor tests) passes.</done>
</task>
</tasks>
