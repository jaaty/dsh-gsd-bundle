# Roadmap — bundle-live (v1.0)

3 phase(s) | requirements mapped per phase

| # | Phase | Goal | Requirements |
|---|-------|------|--------------|
| 01 | [x] live-mount | Mount the bundle into a DSH profile and verify all 12 plugin rows activate and the patch merges cleanly over dsh-base. | MOUNT-01 … MOUNT-02 |
| 02 | service-tools | Prove the gsdState service round-trips .planning/ artefacts and every gsd_* phase tool registers with a valid schema and passes a smoke call. | MOUNT-03 … MOUNT-04 |
| 03 | loop-e2e | Run one full phase through the loop (Discuss → Plan → Execute → Verify → Ship) in a live session and capture the produced PR. | MOUNT-05 … MOUNT-06 |

## Progress

| # | Phase | Status | Date |
|---|-------|--------|------|
| 01 | live-mount | [x] Complete | 2026-08-23 |
| 02 | service-tools | pending |  |
| 03 | loop-e2e | pending |  |
