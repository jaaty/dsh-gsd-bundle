# Requirements

## MOUNT

- [x] MOUNT-01: All 12 plugin subpath exports resolve and every plugin row in cordis.patch.yml activates in a live DSH session.
- [x] MOUNT-02: gsd-persona installs the phase-loop system prompt section and the gsd:state runtime-context provider, and every session orients at the current STATE.md position.
- [x] MOUNT-03: gsd-state registers the gsdState host service; .planning/ artefacts round-trip (write→read) with no data loss.
- [x] MOUNT-04: Every gsd_* phase tool registers with a valid schema and its execute passes a smoke call.
- [ ] MOUNT-05: A full phase (Discuss → Plan → Execute → Verify → Ship) completes end-to-end in a live session, producing a PR.
- [ ] MOUNT-06: npm test (node --test test/*.test.mjs) passes on a clean checkout.
