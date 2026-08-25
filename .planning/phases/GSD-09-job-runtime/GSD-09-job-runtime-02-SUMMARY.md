---
phase: 09-job-runtime
plan: 02
subsystem: job-runtime
tags: [background-jobs, gsd_status, reconcile, async-jobs, nyquist]
requires: [GSD-09-job-runtime-01]
provides: [gsd_status real async state, VALIDATION.md]
affects: [lib/core-tools.js, test/tools.test.mjs]
tech-stack: [node:test, node:child_process]
key-files:
  created: [.planning/phases/GSD-09-job-runtime/VALIDATION.md]
  modified: [lib/core-tools.js, test/tools.test.mjs]
decisions: [D-05, D-06]
metrics:
  duration: 2026-08-25
  completed: 2026-08-25
status: complete
---

# Phase 09 Plan 02: job-runtime — Summary

Surfaced real asynchronous job state through gsd_status: wired `reconcileJobs` into the gsd_status execute so the Async Jobs section reflects actual running/done/failed outcomes instead of a registry-only record, added rendering tests proving gsd_status surfaces real state and never throws over a corrupt result file, and recorded the D-01..D-05 → automated-test mapping in VALIDATION.md (Nyquist gate). Delivers the surfacing half of JOB-02 (D-05).

## What was built

- **`lib/core-tools.js`** — imports `reconcileJobs` from `./jobs.js` and calls `await reconcileJobs(ctx, s, cwd).catch(() => null)` inside the gsd_status execute, immediately after the `isProject` guard and before `s.readJobs(cwd)`. The manifest is reconciled to real done/failed state before it is read, so the existing Async Jobs rendering (`- ${j.id}: ${j.kind} — ${j.status} — ${j.result || j.started || ""}`) now shows real running/done/failed status and the result summary. The `.catch(() => null)` keeps gsd_status an orientation surface that never throws (D-06). The rendering format is unchanged — the reconcile call is the behavioural change.
- **`test/tools.test.mjs`** — three new tests in the `describe("gsd_status", ...)` block: (1) "a running job whose result file exists renders done/failed" — seeds a running job + a valid result file, asserts gsd_status renders `JOB-01` and `done` (reconcile flips it); (2) "a running job with no result file renders running" — seeds a running job with no result file, asserts `JOB-01` and `running`; (3) "a corrupt result file does not throw and leaves the job running" — seeds a running job + a corrupt result file, asserts `assert.doesNotReject` and the job stays `running`.
- **`.planning/phases/GSD-09-job-runtime/VALIDATION.md`** — the Nyquist coverage artefact at the phase root (alongside CONTEXT.md/RESEARCH.md), mirroring the GSD-08 artefact. Contains a "Nyquist Coverage" heading, a Decision → automated-test mapping table covering every locked decision D-01..D-05 (mapped to named tests in `test/jobs.test.mjs` and `test/tools.test.mjs`), the JOB-01/JOB-02 phase-goal truths those tests back, a "Task coverage (dimension 8)" table listing every task across plans 01 and 02 with its verify command (proving no 3-consecutive-task window lacks an automated `node --test` verify), and a full-suite gate row.

## Verification

- `node --check lib/core-tools.js` passes; `import('./lib/core-tools.js')` smoke passes.
- `node --test test/tools.test.mjs` → 35/35 pass (including the 3 new gsd_status rendering tests).
- Full suite `npm test` → 166/166 pass (163 from plan 01 + 3 new), no regressions.
- VALIDATION.md acceptance: `test -f` ok, `grep -cE 'D-0[1-5]'` → 7, `grep "Nyquist"` ok, `grep "node --test test/*.test.mjs"` ok.

## TDD Gate Compliance

`tdd_mode: false` in config — tests written alongside implementation, not strictly before. Every task carried an automated verify (Nyquist). No gate violation.

## Known Stubs

None. No TODO/FIXME/placeholder markers in the new or modified files.

## Threat Flags

- **Arbitrary process execution** (security-sensitive): the spawn boundary lives in the integration tier (`lib/job-wrapper.mjs` from plan 01), a thin child-process boundary. This plan only *reads* result files via `ctx.fs` (stat-guarded) and reconciles the manifest — it adds no new spawn surface. gsd_status never throws over a corrupt result file or manifest (D-06), so a malformed result file cannot crash the orientation surface.
- Detached children may briefly outlive the test process; plan-01 tests poll for the result file with a bounded timeout and use short commands.

## Self-Check: PASSED

- `lib/core-tools.js` exists (241 lines ≥ 236), imports and calls `reconcileJobs` before `readJobs`, wrapped in `.catch(() => null)`.
- `test/tools.test.mjs` exists (691 lines ≥ 657), contains the three new gsd_status rendering tests (`/done/`, `/running/`, `doesNotReject`).
- `.planning/phases/GSD-09-job-runtime/VALIDATION.md` exists (57 lines ≥ 30), maps D-01..D-05, has the Nyquist heading and full-suite gate.
- 3 atomic commits on `phase-9`: `feat(GSD-09-job-runtime-02): reconcile jobs in gsd_status before rendering`, `test(GSD-09-job-runtime-02): gsd_status renders real async job state`, `feat(GSD-09-job-runtime-02): VALIDATION.md Nyquist coverage`.
