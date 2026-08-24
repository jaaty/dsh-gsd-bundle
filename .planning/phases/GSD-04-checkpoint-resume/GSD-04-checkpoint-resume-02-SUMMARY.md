---
phase: GSD-04-checkpoint-resume
plan: 02
subsystem: lib/execute.js controller (checkpoint capture + resume) + executor prompt contract
tags: [checkpoint, resume, execute, DUR-01, DUR-02]
requires:
  - GSD-04-checkpoint-resume-01
provides:
  - gsd_execute consumes r.structured?.checkpoint and persists <base>-<PP>-CHECKPOINT.md (DUR-01, D-01)
  - gsd_execute resumes a checkpointed plan (tasks 1..N done, begin N+1) with a RESUME instruction + prior context (DUR-02, D-03, D-04)
  - Fail-loud validation of a corrupt/out-of-range CHECKPOINT (D-05)
  - SUMMARY-wins precedence removes a stale CHECKPOINT (D-06)
  - EXECUTOR_PROMPT names the structured checkpoint keys the controller expects (O-4)
affects: [lib/state.js (consumer only), lib/_agents.js]
tech-stack: [ESM, node:test, FakeFs, parseFrontmatter/stringifyFrontmatter]
key-files:
  created: []
  modified:
    - lib/execute.js
    - lib/_agents.js
    - test/tools.test.mjs
decisions:
  - D-01: controller persists the executor's structured checkpoint return as <base>-<PP>-CHECKPOINT.md
  - D-02: a plan is resumable when CHECKPOINT-<PP> exists but SUMMARY-<PP> does not
  - D-03: resume skips by the recorded task index (tasks 1..N done, begin at N+1)
  - D-04: resumed executor prompt carries the prior checkpoint context
  - D-05: corrupt/out-of-range CHECKPOINT fails loud with a named error
  - D-06: a completed SUMMARY wins over and cleans up a stale CHECKPOINT
metrics:
  duration: "~12 min"
  completed_date: 2026-08-24
actuals:
  tasks: 3
  commits: 4
status: complete
---
# Phase GSD-04 Plan 02: Checkpoint capture + resume in gsd_execute Summary

Implemented the controller half of checkpoint-resume: gsd_execute now consumes an executor's structured checkpoint return and persists it as the per-plan CHECKPOINT-<PP> artefact, resumes an interrupted plan from that checkpoint (skipping tasks 1..N and beginning at N+1), fails loud on a corrupt or out-of-range checkpoint, and lets a completed SUMMARY win over (and remove) a stale CHECKPOINT. This delivers DUR-01 and DUR-02.

## Task 1 — Tracer: consume structured checkpoint return and persist CHECKPOINT-<PP> (DUR-01, D-01)

Added `parseFrontmatter`/`stringifyFrontmatter` to the `_shared.js` import in lib/execute.js. In the results handler, after `const r = await thunk()`, captured `const cp = r.structured?.checkpoint`. When it is a non-null object: validated the shape (integer `last_completed_task` with `1 <= N < p.task_count`, else a named `gsd_execute: executor returned invalid checkpoint for plan ...` error), persisted it via `writeArtifact(cwd, args.phase, 'CHECKPOINT-<PP>', stringifyFrontmatter({plan, last_completed_task, checkpoint_reason, committed_hashes}))`, and returned `{ ok: false, checkpointed: true, checkpointed_at, ... }` without writing SUMMARY or marking the plan complete. When `cp` is absent, execution falls through to the unchanged SUMMARY probe. The logging loop emits a distinct `⏸ checkpointed at task N` line. Reworked the fake subagent's `execute` branch in test/tools.test.mjs to be checkpoint-aware and added a capture test asserting CHECKPOINT-01 exists, SUMMARY-01 is absent, output matches /checkpoint/, and STATE stays `execute`.

## Task 02 — Resume from a persisted checkpoint with skip semantics + fail-loud validation (DUR-02, D-03, D-04, D-05)

In the runnables map, before building each prompt, computed `cpSuffix = CHECKPOINT-<PP>` and checked `s.hasArtifact`. When present, read the artefact, parsed its frontmatter, and validated `last_completed_task` against `p.task_count` (fail-loud `gsd_execute: invalid CHECKPOINT-<PP> artefact for plan ...` on a non-integer or out-of-range value — no silent re-run from task 1). When valid, built `resumeInstr = 'RESUME from checkpoint: tasks 1..N are done; begin at task N+1. Prior checkpoint context:\n<cpText>'` and appended it (conditionally) to the executor prompt array so the resumed executor receives the full planning_context plus the resume directive. Added a resume test asserting the captured prompt contains /RESUME from checkpoint/ and /begin at task 2/ and that the plan completes (/01-auth-01 ✓/), plus a fail-loud test seeding an out-of-range checkpoint and asserting `assert.rejects(..., /invalid CHECKPOINT-01/)`.

## 03 — SUMMARY-wins precedence + stale cleanup + name checkpoint keys in EXECUTOR_PROMPT (D-06, O-4)

In the completion path (`if (ok)`), before `markPlanSummary`, added: if `s.hasArtifact(CHECKPOINT-<PP>)` then `s.removeArtifact(...)` so a completed SUMMARY removes any stale checkpoint (D-06). Refined EXECUTOR_PROMPT (lib/_agents.js) so a `checkpoint:*` task stops and returns a structured checkpoint object with exactly the keys the controller consumes — plan, last_completed_task, checkpoint_reason, committed_hashes — and the final return line names those same keys. The `autonomous: false` rule is unchanged. Added a D-06 test: seeds PLAN-01 + CHECKPOINT-01, spies on `svc.removeArtifact`, and asserts the executor spawns exactly once, SUMMARY wins, the plan completes, and the cleanup path was invoked. Also added a header comment in lib/execute.js documenting the checkpoint-resume flow (bringing the file to 184 lines ≥ the 180 must-have).

## Verification

- `node --test test/tools.test.mjs test/state.test.mjs` → 39 pass / 0 fail.
- `npm test` full suite → 62 pass / 0 fail (baseline 58 from plan 01 + 4 new checkpoint tests).
- lib/execute.js 184 lines (must_have ≥ 180), exports `apply` + `name`; lib/_agents.js 300 lines (≥ 300), exports `EXECUTOR_PROMPT`; test/tools.test.mjs 355 lines (≥ 320).
- Key links wired: `r.structured?.checkpoint` consumed (execute.js:132), `s.removeArtifact` called on the SUMMARY-wins path (execute.js:150), `readArtifact(cwd, args.phase, cpSuffix)` resume read (execute.js:105).
- 4 atomic commits on branch `phase-4`: `cf27b19` (capture), `5f2bd3b` (resume), `3c1e01a` (D-06 + prompt keys), `702a6ab` (docs header).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The checkpoint payload (plan id, task index, commit SHAs) is not security-bearing; validation and cleanup stay in the domain layer. `removeArtifact` is scoped to `.planning/` artefacts under the given cwd (added in plan 01). The executor prompt references only the four checkpoint keys the controller parses; no external input is interpolated into shell/CLI.

## Self-Check: PASSED

- `lib/execute.js` modified, 184 lines ≥ 180, exports `apply`/`name`, `structured?.checkpoint` consumed, `removeArtifact` in SUMMARY-wins path, resume + fail-loud branches present.
- `lib/_agents.js` modified, 300 lines ≥ 300, EXECUTOR_PROMPT names `committed_hashes` and the checkpoint keys.
- `test/tools.test.mjs` modified, 355 lines ≥ 320, capture/resume/fail-loud/D-06 tests present and passing.
- 4 commits exist on branch `phase-4`: `cf27b19`, `5f2bd3b`, `3c1e01a`, `702a6ab`.
- Full suite 62 pass / 0 fail.
