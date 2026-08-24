# Roadmap — loop-durability (v1.1)

6 phase(s) | requirements mapped per phase

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 01 | [x] live-mount | Mount the bundle into a DSH profile and verify all 12 plugin rows activate and the patch merges cleanly over dsh-base. | MOUNT-01 … MOUNT-02 |
| 02 | [x] service-tools | Prove the gsdState service round-trips .planning/ artefacts and every gsd_* phase tool registers with a valid schema and passes a smoke call. | MOUNT-03 … MOUNT-04 |
| 03 | [x] loop-e2e | Run one full phase through the loop (Discuss → Plan → Execute → Verify → Ship) in a live session and capture the produced PR. | MOUNT-05 … MOUNT-06 |
| 04 | [x] checkpoint-resume | Implement checkpoint state capture + resume in gsd_execute so an interrupted phase can be resumed from the last checkpoint (skip completed tasks, continue). | DUR-01 … DUR-02 |
| 05 | window-ledger | Add the WINDOWS.md multi-window ledger and an async-jobs manifest, and surface both through gsd_status. | DUR-03 … DUR-04 |
| 06 | loop-robustness | Fix the planner depends_on project-code-prefix bug and route gsd_quick's TASK.md write through the gsd artefact model. | DUR-05 … DUR-06 |

## Progress

| # | Phase | Status | Date |
|---|-------|--------|------|
| 01 | live-mount | [x] Complete | 2026-08-24 |
| 02 | service-tools | [x] Complete | 2026-08-24 |
| 03 | loop-e2e | [x] Complete | 2026-08-24 |
| 04 | checkpoint-resume | [x] Complete | 2026-08-24 |
| 05 | window-ledger | pending |  |
| 06 | loop-robustness | pending |  |
