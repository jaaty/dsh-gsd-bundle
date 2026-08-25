# Roadmap — job-runtime (v1.4)

9 phase(s) | requirements mapped per phase

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

## Progress

| # | Phase | Status | Date |
|---|-------|--------|------|
| 01 | live-mount | [x] Complete | 2026-08-25 |
| 02 | service-tools | [x] Complete | 2026-08-25 |
| 03 | loop-e2e | [x] Complete | 2026-08-25 |
| 04 | checkpoint-resume | [x] Complete | 2026-08-25 |
| 05 | window-ledger | [x] Complete | 2026-08-25 |
| 06 | loop-robustness | [x] Complete | 2026-08-25 |
| 07 | uat-conversation | [x] Complete | 2026-08-25 |
| 08 | capability-gates | [x] Complete | 2026-08-25 |
| 09 | job-runtime | [x] Complete | 2026-08-25 |
