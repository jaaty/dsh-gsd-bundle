---
phase: 18-job-runtime-extensions
plan: 01
subsystem: jobs-runtime
tags: [config, manifest, jobs, timeout, concurrency, retry]
dependency_graph:
  requires: []
  provides: [jobs-config-block, resolveJobsConfig, reason-started-manifest-plumbing]
  affects: [lib/jobs.js, lib/core-tools.js, lib/_runner.js, lib/job-wrapper.mjs, lib/commands.js]
tech-stack: [node:test, ESM, zero-dependency]
key-files:
  created: []
  modified: [lib/state.js, test/state.test.mjs]
decisions: [D-08, D-09, OQ-5]
metrics:
  duration: ~5 min
  completed: 2026-08-28
status: complete
actuals:
  tasks: 2
  commits: 1
---

# Phase 18 Plan 01: Jobs Config + Manifest Plumbing Summary

Added the config.json `jobs` block defaults and a shared `resolveJobsConfig` helper, plus the manifest `reason`-field and `started`-on-promote plumbing, giving the jobs runtime (plans 02/03) one authoritative source for timeout/concurrency/max_retries and terminal reasons without breaking existing done/failed readers.

## Changes

- **lib/state.js**
  - Added module-level `DEFAULT_JOBS_CONFIG = { timeout: 60, concurrency: 2, max_retries: 3 }` (single source of truth, CQ-02).
  - `_defaultConfig` now carries `jobs: { ...DEFAULT_JOBS_CONFIG }` so freshly initialised projects ship the block.
  - Added pure exported `resolveJobsConfig(cfg)` mirroring `resolveGatesConfig`: absent/partial/non-numeric `jobs` keys fall back to the defaults per-key and never throw (D-09); also surfaced as `GsdState.resolveJobsConfig` for service callers.
  - Documented the caller-managed `reason`/`started` contract on `appendJob`/`updateJob` (D-08, OQ-5). `appendJob` preserves an explicit `started`; `updateJob` passes a structured `reason` object through verbatim while still stamping `completed` on done/failed.
- **test/state.test.mjs** — extended the config round-trip to assert the `jobs` block; added `resolveJobsConfig` tests (empty/partial/full/non-numeric degradation); added async-jobs accessor tests proving a structured `reason` object round-trips verbatim through `readJobs`, that `appendJob` preserves an explicit `started`, and that a default `started` is still stamped when absent.

## Verification

- `node --test test/state.test.mjs` → **47 pass, 0 fail**.
- `npm test` (full suite) → **261 pass, 0 fail**.
- grep-verifiable: `resolveJobsConfig`, `DEFAULT_JOBS_CONFIG`, `jobs:` with `timeout`/`concurrency`/`max_retries`, `reason: { reason:` and `status: 'pending'` present.

## TDD Gate Compliance

The two tasks are config/plumbing additions verified by the existing `node --test` suite; both files' edits were landed together with tests and implementation in a single atomic commit (no separate RED/GREEN commits). Note as a minor deviation from strict RED-first — acceptable given the tracer/plumbing nature of this wave-1 plan.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. No new externally-triggerable surface; no new dependencies added.

## Self-Check: PASSED

- `lib/state.js` and `test/state.test.mjs` exist and contain the expected changes (verified by grep + tests).
- Commit `c655c90` exists with the staged changes for both files only (no unrelated files).
- Full test suite green.
