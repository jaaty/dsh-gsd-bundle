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
- [ ] DUR-05: The planner writes depends_on with the fully-prefixed plan id (project-code + phase + plan) so wave dependency resolution never misses a completed dependency.
- [ ] DUR-06: gsd_quick routes its TASK.md write through the gsdState artefact model (ctx.fs) instead of bypassing it via raw node:fs/promises.
