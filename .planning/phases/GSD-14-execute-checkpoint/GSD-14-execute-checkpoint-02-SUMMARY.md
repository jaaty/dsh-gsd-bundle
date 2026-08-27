---
phase: 14-execute-checkpoint
plan: 02
subsystem: execute
tags: [refactor, execute, checkpoint, runnable-reuse]
dependency_graph:
  requires: [GSD-14-execute-checkpoint-01]
  provides: [refactored lib/execute.js]
  affects: [lib/execute.js]
tech-stack: [node, esm, node:test]
key-files:
  created: []
  modified: [lib/execute.js]
decisions:
  - D-02: prepare = pre-dispatch path; process = post-dispatch structured return only; SUMMARY-wins cleanup stays inline
  - D-03: strictly behavior-preserving; exact error messages preserved; redundant .filter((p) => !p.has_summary) on line 64 left untouched
  - D-04: reuse planIndex runnable set by intersecting idx.runnable with the wave's plans; no change to state.js planIndex
metrics:
  duration: 2026-08-27
  completed_date: 2026-08-27
  tasks: 3
  commits: 3
status: complete
---

# Phase 14 Plan 02: Wire Checkpoint Helpers into gsd_execute Summary

Wired the extracted `prepareCheckpoint`/`processCheckpoint` helpers into `gsd_execute` and replaced the per-wave runnable re-derivation with the `planIndex` `runnable` set — a strictly behavior-preserving refactor of `lib/execute.js` (D-02, D-03, D-04).

## What was built

- **Prepare path delegates to `prepareCheckpoint`** — the inlined checkpoint read/validate/RESUME-build/awaiting-gate/answer-binding block (execute.js lines 110-164) is replaced by a single `await prepareCheckpoint(s, { cwd, phase, p, answer, decisionId })` call. The awaiting branch still returns the marker-bearing object `{ p, awaiting: true, marker }` so the `runnables.filter((r) => r.awaiting)` collection and marker log loop keep working. The `resumeInstr` spread in the prompt assembly is preserved.
- **Process path delegates to `processCheckpoint`** — the inlined structured-checkpoint validation/persist/job-reconcile block (lines 196-218) is replaced by `return await processCheckpoint(s, { cwd, phase, p, r, job, log, w })`. The non-checkpoint SUMMARY-wins cleanup and its job reconcile stay inline (D-02).
- **Runnable reuse (D-04)** — the per-wave re-derivation `wavePlans.filter((p) => (p.depends_on || []).every((d) => resolvePlanDep(idx.plans, d)?.has_summary))` is replaced by `wavePlans.filter((p) => idx.runnable.includes(p))`. The `blocked` computation and `skipping ...` log line are unchanged. `lib/state.js` planIndex is untouched; no per-wave runnable added.
- **Import cleanup** — the `./_shared.js` import list is trimmed to `zeroPad, matchesGapClosure, nowIso, resolvePlanDep` (the checkpoint-only helpers `parseFrontmatter`, `stringifyFrontmatter`, `decisionIdFor`, `awaitingDecision`, `awaitingMarker` are no longer referenced in execute.js). `resolvePlanDep` remains used by the priorSummaries block. A new `./_checkpoint.js` import line was added.

## Verification

- `node --check lib/execute.js` passes after each task.
- `grep prepareCheckpoint` / `grep processCheckpoint` / `grep 'from "./_checkpoint.js"'` / `grep idx.runnable.includes` / `grep resolvePlanDep` all present in `lib/execute.js`.
- Full suite `npm test` — **199/199 pass** (no regressions), including the `test/tools.test.mjs` gsd_execute integration block (lines 214-509) that pins the resume/awaiting/answer/checkpoint behavior.

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

None. The refactor moves no security-sensitive logic (no secrets, no shell, no new path construction). The `CHECKPOINT-${zeroPad(...)}` suffix construction now lives in `lib/_checkpoint.js` unchanged.

## Self-Check: PASSED

- `lib/execute.js` exists, passes `node --check`, and contains the three required wirings (prepareCheckpoint, processCheckpoint, idx.runnable.includes).
- Three atomic commits created on `main`:
  - `24ad242` refactor(GSD-14-execute-checkpoint-02): delegate prepare path to prepareCheckpoint
  - `6d992af` refactor(GSD-14-execute-checkpoint-02): delegate process path to processCheckpoint
  - `ea69db8` refactor(GSD-14-execute-checkpoint-02): reuse planIndex runnable set in wave loop
