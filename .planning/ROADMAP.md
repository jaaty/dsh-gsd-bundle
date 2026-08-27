# Roadmap — code-quality-hardening (v1.6)

17 phase(s) | requirements mapped per phase

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 01 | [x] live-mount | Mount the bundle into a DSH profile and verify all 12 plugin rows activate and the patch merges cleanly over dsh-base. | MOUNT-01 … MOUNT-02 |
| 02 | [x] service-tools | Prove the gsdState service round-trips .planning/ artefacts and every gsd_* phase tool registers with a valid schema and passes a smoke call. | MOUNT-03 … MOUNT-04 |
| 03 | [x] loop-e2e | Run one full phase through the loop (Discuss → Plan → Execute → Verify → Ship) in a live session and capture the produced PR. | MOUNT-05 … MOUNT-06 |
| 04 | [x] checkpoint-resume | Implement checkpoint state capture + resume in gsd_execute so an interrupted phase can be resumed from the last checkpoint (skip completed tasks, continue). | DUR-01 … DUR-02 |
| 05 | [x] window-ledger | Add the WINDOWS.md multi-window ledger and an async-jobs manifest, and surface both through gsd_status. | DUR-03 … DUR-04 |
| 06 | [x] loop-robustness | Fix the planner depends_on project-code-prefix bug and route gsd_quick's TASK.md write through the gsd artefact model. | DUR-05 … DUR-06 |
| 07 | [x] uat-conversation | Implement the conversational UAT loop: an executor stopping at a checkpoint:decision or checkpoint:human-action task surfaces a human-facing question, and gsd_execute pauses the phase, waits for the human's answer, and resumes the checkpointed plan with that answer applied so the phase completes. | UAT-01 … UAT-02 |
| 08 | [x] capability-gates | Implement the capability-gate gatekeeper in gsd_ship: before creating the PR, gsd_ship runs a set of capability gates (security, broken-windows, TDD-audit), reports each gate's pass/fail status, and refuses to ship when any required gate fails with a clear report of what failed and why. | CAP-01 … CAP-02 |
| 09 | [x] job-runtime | Implement a real background-job runtime: a job runner that actually executes a job asynchronously, tracks its lifecycle (running → done/failed) in the async-jobs manifest, collects and surfaces the result when it finishes, and reflects real async state through gsd_status. | JOB-01 … JOB-02 |
| 10 | [x] codebase-query | Implement a query/intel mode for the codebase mapper: a gsd_map_codebase --query path that answers a question against the existing .planning/codebase/ map and the codebase itself without a full re-scan, surfaced through gsd_map_codebase and returning a targeted answer. | CBQ-01 … CBQ-02 |
| 11 | [x] phase-dir-resolution | Resolve the phase directory and base once per tool invocation and pass them down, removing the repeated readRoadmap/readConfig and the duplicated base derivation. | CQ-01 |
| 12 | [x] single-source-constants | Make GATE_NAMES and the secret-file list single-source and route cwdOf through the shared helper. | CQ-02 |
| 13 | [x] gate-dispatch | Replace the gate name condition chain with an explicit dispatcher map and derive the commit scope from structured plan fields. | CQ-03 |
| 14 | [x] execute-checkpoint | Extract the checkpoint prepare/process logic in gsd_execute into helpers and reuse the planIndex runnable set. | CQ-04 |
| 15 | ship-robustness | Make git/gh calls async and report preflight failures with their real cause. | CQ-05 |
| 16 | context-budget | Give planningContext a total truncation budget and surface truncation, plus small dedup fixes. | CQ-06 |
| 17 | phase-branch-isolation | Acquire a per-phase feature branch at gsd_discuss and have each phase tool commit its planning artefacts, so gsd_ship preflight passes on a clean feature branch. | CQ-07 |

## Progress

| # | Phase | Status | Date |
|---|-------|--------|------|
| 01 | live-mount | [x] Complete | 2026-08-27 |
| 02 | service-tools | [x] Complete | 2026-08-27 |
| 03 | loop-e2e | [x] Complete | 2026-08-27 |
| 04 | checkpoint-resume | [x] Complete | 2026-08-27 |
| 05 | window-ledger | [x] Complete | 2026-08-27 |
| 06 | loop-robustness | [x] Complete | 2026-08-27 |
| 07 | uat-conversation | [x] Complete | 2026-08-27 |
| 08 | capability-gates | [x] Complete | 2026-08-27 |
| 09 | job-runtime | [x] Complete | 2026-08-27 |
| 10 | codebase-query | [x] Complete | 2026-08-27 |
| 11 | phase-dir-resolution | [x] Complete | 2026-08-27 |
| 12 | single-source-constants | [x] Complete | 2026-08-27 |
| 13 | gate-dispatch | [x] Complete | 2026-08-27 |
| 14 | execute-checkpoint | [x] Complete | 2026-08-27 |
| 15 | ship-robustness | pending |  |
| 16 | context-budget | pending |  |
| 17 | phase-branch-isolation | pending |  |
