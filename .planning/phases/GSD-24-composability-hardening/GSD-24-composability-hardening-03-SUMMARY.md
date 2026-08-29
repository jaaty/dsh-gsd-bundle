---
phase: 24-composability-hardening
plan: 03
subsystem: plugin-composability
tags: [coeffect, subagents, sub-fiber, gsd_job, DEGR-07, D-05, reactive]
dependency_graph:
  requires: ["GSD-24-composability-hardening-01", "GSD-24-composability-hardening-02"]
  provides: ["subagents coeffect scoped to core-tools' gsd_job tool's sub-fiber; harness ctx.inject represents subagents presence; reactive activation/deactivation test; VALIDATION.md"]
  affects: ["lib/core-tools.js", "test/helpers/mount-harness.mjs", "test/coeffect.test.mjs", "test/tools.test.mjs", "test/service-tools.test.mjs", "test/mount.test.mjs", "VALIDATION.md"]
tech-stack: [node, cordis, dsh-tools]
key-files:
  created: ["VALIDATION.md"]
  modified: ["lib/core-tools.js", "test/helpers/mount-harness.mjs", "test/coeffect.test.mjs", "test/tools.test.mjs", "test/service-tools.test.mjs", "test/mount.test.mjs"]
decisions:
  - "D-05: core-tools scopes the subagents coeffect to the gsd_job tool's sub-fiber via ctx.inject(['subagents'], ...) — only gsd_job deactivates when subagents is absent; gsd_init/gsd_status/gsd_progress/gsd_new_milestone and the gsdOrient/gsdJobs capabilities stay active (graceful degradation per phase-22 D-03)."
  - "The gsd_job execute closure keeps referencing the OUTER ctx (gsdState, cwdOf) and the runtime created in apply — it does not switch to subCtx."
  - "The fake harness ctx.inject represents subagents presence: an explicitly supplied subagents service is added to the provided store (activating a ['subagents'] sub-fiber); subagents: null leaves it absent (sub-fiber inactive); the omitted default keeps subagents out of provided so existing tests are unaffected."
  - "Necessary test-harness updates (tools.test.mjs, service-tools.test.mjs, mount.test.mjs) provide ctx.inject / supply subagents so the gsd_job sub-fiber wrap keeps the full suite green — a deviation from the plan's files_modified list, required by the plan's own Test G gate."
metrics:
  duration: "~20 min"
  completed: "2026-08-29"
  actuals:
    tasks: 4
    commits: 4
status: complete
---

# Phase 24 Plan 03: Subagents Coeffect on the gsd_job Sub-Fiber — Summary

Scoped the subagents coeffect to core-tools' gsd_job tool's sub-fiber (DEGR-07 / D-05) so only gsd_job deactivates when the subagents host service is absent, extended the fake harness so ctx.inject can represent subagents presence, and proved the reactive activation/deactivation with an offline test plus a behaviour-to-test VALIDATION.md.

## Tasks

1. **test(24-03): harness ctx.inject represents subagents presence** (`da2e99a`) — in `makeMountCtx`, computed a single `subagentsSvc` value and added it to the provided store only when the caller explicitly supplied a subagents value (`subagents !== undefined && subagents !== null`); changed the `ctx.get('subagents')` special-case to return `subagentsSvc`. This makes `ctx.inject`'s `provided.has('subagents')` check reflect real presence: an explicitly supplied service activates a `['subagents']` sub-fiber, `subagents: null` leaves it absent, and the omitted default keeps subagents out of provided so existing tests are unaffected.
2. **feat(24-03): scope subagents coeffect to gsd_job sub-fiber (DEGR-07 D-05)** (`27ac409`) — wrapped ONLY the gsd_job tool registration in `ctx.inject(["subagents"], (subCtx) => subCtx.tools.register(...))`; the execute closure keeps referencing the outer `ctx` and `runtime`. gsd_init/gsd_status/gsd_progress/gsd_new_milestone and the gsdOrient/gsdJobs provides stay unconditional. Updated three test harnesses that lacked `ctx.inject` (tools.test.mjs, service-tools.test.mjs) or needed subagents supplied to keep gsd_job registered (mount.test.mjs) — a necessary consequence of the wrap to keep the full suite green.
3. **test(24-03): reactive gsd_job sub-fiber activation/deactivation (DEGR-07 Test E)** (`eed5118`) — added a describe block to test/coeffect.test.mjs: with `subagents: makeSubagents()` gsd_job is registered and gsd_init/gsd_status/gsd_progress/gsd_new_milestone + gsdOrient/gsdJobs are present; with `subagents: null` gsd_job is absent while the other surfaces stay active.
4. **docs(24-03): VALIDATION.md behaviour-to-test mapping (Tests A-G)** (`8f329cc`) — ran the full offline suite (`node --test test/*.test.mjs`, 389/389) and wrote VALIDATION.md at the phase root mapping each behaviour (unload-cancel, static inject, reactive sub-fiber, jobs suite update, full-suite regression) to its test.

## Verification

- Task 1 verify: greps for `subagentsSvc`, `provided.set("subagents"`, `subagents !== undefined` all hit; `node --test test/mount.test.mjs test/removal.test.mjs test/coeffect.test.mjs` exits 0.
- Task 2 verify: `ctx.inject(["subagents"]` returns exactly one hit; `name: "gsd_job"` sits inside the inject block; gsd_init/gsd_status/gsd_progress/gsd_new_milestone sit outside; `node --check lib/core-tools.js` passes.
- Task 3 verify: `gsd_job` assertions (≥2) and `subagents: null` present; `node --test test/coeffect.test.mjs test/removal.test.mjs` exits 0 (13 tests).
- Task 4 verify: `node --test test/*.test.mjs` exits 0 — 389 tests, 0 fail; VALIDATION.md contains "Test A"–"Test G" and references all four test files.

## Requirements Addressed

- **DEGR-07** — the subagents coeffect is scoped to the gsd_job tool's sub-fiber (D-05): gsd_job activates when subagents is present and deactivates when absent, while the non-subagent core-tools surfaces (gsd_init/gsd_status/gsd_progress/gsd_new_milestone, gsdOrient/gsdJobs) stay active — graceful degradation per phase-22 D-03.

## Key Decisions

- D-05 applied verbatim: sub-fiber coeffect on gsd_job only, via `ctx.inject(['subagents'], ...)`.
- The gsd_job execute closure keeps the outer `ctx`/`runtime` references (not subCtx).
- Harness `ctx.inject` now represents subagents presence through the provided store (explicit-supply gate), preserving the default-omitted behaviour.
- Deviation from the plan's files_modified list: test/tools.test.mjs, test/service-tools.test.mjs, and test/mount.test.mjs were updated to provide `ctx.inject` / supply subagents — required by the plan's own Test G full-suite gate after the gsd_job sub-fiber wrap.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

The change adds a sub-fiber coeffect scoping gsd_job's registration; no new process/child handling, no new surface. The gsd_job execute path is unchanged (still delegates to jobs.js domain API). No security-sensitive capability is added or moved.

## TDD Gate Compliance

Not a TDD plan (no RED/GREEN/REFACTOR structure required by the plan). The test commits (`da2e99a`, `eed5118`) and the code commit (`27ac409`) follow the plan's task order.

## Self-Check: PASSED

- Created files exist: `VALIDATION.md` present.
- Modified files exist: `lib/core-tools.js`, `test/helpers/mount-harness.mjs`, `test/coeffect.test.mjs`, `test/tools.test.mjs`, `test/service-tools.test.mjs`, `test/mount.test.mjs` all present.
- Commits exist: `da2e99a`, `27ac409`, `eed5118`, `8f329cc` (confirmed via `git log`).
- `node --test test/*.test.mjs` passes (389/389).
