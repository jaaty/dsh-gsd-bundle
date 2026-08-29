# Phase 24: composability-hardening — Validation

Behaviour-to-test mapping for Tests A–G (DEGR-06 / DEGR-07). Each behaviour is
proven offline (FakeFs + fake-ctx, no live DSH boot, no LLM/git/gh).

## Test A — subagent controller aborted on unload (DEGR-06)

**Behaviour:** invoking the jobs-runtime cleanup disposer aborts a running
subagent's job-owned AbortController and the async-jobs manifest reflects
`'cancelled'`.

**Proven by:** `test/jobs.test.mjs` — the unload-cancel suite (plan 01, Task 3):
"a running subagent is aborted and the manifest reflects 'cancelled'".

## Test B — shell child killed on unload (DEGR-06)

**Behaviour:** invoking the cleanup disposer kills a running detached shell child
and the manifest reflects `'cancelled'`.

**Proven by:** `test/jobs.test.mjs` — the unload-cancel suite (plan 01, Task 3):
"a running shell child is killed and the manifest reflects 'cancelled'".

## Test C — best-effort teardown, never throws (DEGR-06 D-03)

**Behaviour:** the unload-cancel cleanup swallows all failures (manifest write
may fail while gsdState is tearing down) and never throws.

**Proven by:**
- `test/jobs.test.mjs` — the unload-cancel suite (plan 01, Task 3): "cancelAll
  never throws when the manifest write fails".
- `test/mount.test.mjs` — "applies all 12 plugins in patch order without
  throwing": invokes the `gsdJobsRuntime.cancelAll` disposer and asserts
  `doesNotThrow`.

## Test D — static inject assertions (DEGR-07 D-04)

**Behaviour:** the six subagent-driven plugins (plan, execute, verify, quick,
ui, map-codebase) declare `'subagents'` as a hard required coeffect in their
inject arrays, retaining `gsdState` and `tools`.

**Proven by:** `test/coeffect.test.mjs` — "subagents coeffect on subagent-driven
plugins (DEGR-07 / D-04)": one test per plugin asserting
`mod.inject.includes("subagents")` plus the `gsdState`/`tools` guards.

## Test E — reactive sub-fiber activation/deactivation (DEGR-07 D-05)

**Behaviour:** core-tools scopes the subagents coeffect to the `gsd_job` tool's
sub-fiber. When subagents is present, `gsd_job` is registered; when absent,
`gsd_job` deactivates while `gsd_init`/`gsd_status`/`gsd_progress`/
`gsd_new_milestone` and the `gsdOrient`/`gsdJobs` capabilities stay active
(graceful degradation per phase-22 D-03).

**Proven by:** `test/coeffect.test.mjs` — "core-tools gsd_job sub-fiber coeffect
(DEGR-07 / D-05)": two tests, one with `subagents: makeSubagents()` (gsd_job
present) and one with `subagents: null` (gsd_job absent, other surfaces active).
The harness's `ctx.inject` represents subagents presence via the provided store
(`test/helpers/mount-harness.mjs`).

## Test F — jobs.test.mjs updated for new signatures (regression)

**Behaviour:** the jobs integration suite (real child processes) was updated for
the jobs-runtime refactor (plan 01) and still passes.

**Proven by:** `test/jobs.test.mjs` — the full jobs suite passes under
`node --test test/jobs.test.mjs`.

## Test G — full offline suite (regression, MOUNT-06)

**Behaviour:** the complete offline suite passes on the finished phase, catching
any interaction between the jobs-runtime refactor (plan 01), the inject
declarations (plan 02), and the gsd_job sub-fiber wrap + harness change (plan 03),
including `test/removal.test.mjs` (DEGR-05).

**Proven by:** `node --test test/*.test.mjs` exits 0 — 389 tests, 0 fail.
