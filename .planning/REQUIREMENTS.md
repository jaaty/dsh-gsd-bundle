# Requirements

## MOUNT

- [x] MOUNT-01: All 12 plugin subpath exports resolve and every plugin row in cordis.patch.yml activates in a live DSH session.
- [x] MOUNT-02: gsd-persona installs the phase-loop system prompt section and the gsd:state runtime-context provider, and every session orients at the current STATE.md position.
- [x] MOUNT-03: gsd-state registers the gsdState host service; .planning/ artefacts round-trip (write→read) with no data loss.
- [x] MOUNT-04: Every gsd_* phase tool registers with a valid schema and its execute passes a smoke call.
- [x] MOUNT-05: A full phase (Discuss → Plan → Execute → Verify → Ship) completes end-to-end in a live session, producing a PR.
- [x] MOUNT-06: npm test (node --test test/*.test.mjs) passes on a clean checkout.

## DUR

- [x] DUR-01: Executors honor checkpoint:* tasks: return structured checkpoint state and stop, without running later tasks.
- [x] DUR-02: gsd_execute can resume an interrupted phase from a checkpoint (skip completed tasks, continue from the checkpoint) and the phase completes.
- [x] DUR-03: A WINDOWS.md ledger records multi-window execution so a resumed session can reconstruct where the loop is.
- [x] DUR-04: An async-jobs manifest tracks background/scheduled jobs (id, status, result) surfaced through gsd_status.
- [x] DUR-05: The planner writes depends_on with the fully-prefixed plan id (project-code + phase + plan) so wave dependency resolution never misses a completed dependency.
- [x] DUR-06: gsd_quick routes its TASK.md write through the gsdState artefact model (ctx.fs) instead of bypassing it via raw node:fs/promises.

## UAT

- [x] UAT-01: Executors honor checkpoint:decision and checkpoint:human-action tasks: they stop, surface a human-facing question, and do not proceed without a human answer.
- [x] UAT-02: gsd_execute pauses the phase at a decision/human-action checkpoint, waits for and captures the human's answer, and resumes the plan from the checkpoint with that answer applied, then completes.

## CAP

- [x] CAP-01: gsd_ship runs a set of capability gates (security, broken-windows, TDD-audit) before shipping and reports each gate's pass/fail status.
- [x] CAP-02: gsd_ship refuses to ship when any capability gate fails, producing a clear report of which gate failed and why; the phase cannot ship until all required gates pass.

## JOB

- [x] JOB-01: A job can be launched to run asynchronously and its lifecycle tracked through running → done/failed states in the async-jobs manifest.
- [x] JOB-02: The runtime collects and surfaces a job's result when it finishes, and gsd_status reflects real asynchronous job state rather than a registry-only record.

## CBQ

- [x] CBQ-01: A query can be asked against the mapped codebase and answered from the existing .planning/codebase/ map plus the codebase itself, without triggering a full re-scan.
- [x] CBQ-02: The query path is surfaced through gsd_map_codebase (a --query argument) and returns a targeted answer to the question.

## CQ

- [x] CQ-01: The phase directory and base are resolved once per tool invocation and passed down, not re-derived on every artefact access.
- [x] CQ-02: Shared constants (gate names, secret-file list) live in one place and are reused, and cwdOf is routed through the shared helper.
- [x] CQ-03: The gate dispatch uses an explicit dispatcher map, and the commit scope is derived from structured plan fields, not string parsing.
- [x] CQ-04: The checkpoint prepare/process logic in gsd_execute is extracted into helpers with no duplicated validation, and the planIndex runnable set is reused.
- [ ] CQ-05: git/gh calls are async and preflight failures report their real cause.
- [ ] CQ-06: planningContext truncates against a total budget and surfaces truncation, plus small dedup fixes.
- [ ] CQ-07: Each phase runs on its own feature branch (phase-<N>) acquired at the start of gsd_discuss, and every phase tool commits its planning artefacts to that branch, so gsd_ship preflight passes on a clean feature branch without manual intervention.
