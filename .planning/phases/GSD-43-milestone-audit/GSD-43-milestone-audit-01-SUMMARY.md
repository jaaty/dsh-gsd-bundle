---
phase: 43
plan: 01
subsystem: milestone-audit
tags: [milestone-audit, close-gate, uat, step, capability, soft-gate]
requires: []
provides:
  - "gsdMilestoneAudit capability (step milestone-audit, role step, order 52)"
  - "gsd_milestone_audit tool"
  - "milestone-scoped AUDIT.md close-gate + cross-phase UAT report"
affects:
  - lib/milestone-audit.js
  - lib/_capabilities.js
  - test/milestone-audit.test.mjs
tech-stack:
  - node:test
  - ESM
metrics:
  duration: 0
  completed: 2026-08-29
status: complete
actuals:
  tasks: 2
  commits: 1
---

# Phase 43 Plan 01: milestone-audit Summary

Implemented the milestone close-gate and cross-phase UAT audits (opengsd /gsd-milestone-audit) as a step tool. The tool aggregates per-phase VERIFICATION.md statuses, milestone REQ-ID completeness, and shipped status to confirm the milestone met its derived definition of done, plus a cross-phase UAT outstanding-items list before close. It is a soft gate — it never blocks the release and does not advance STATE.

## Tasks

- **Task 1** — Implemented `lib/milestone-audit.js`: published the `gsdMilestoneAudit` capability via `ctx.provide('gsdMilestoneAudit', buildCapability('gsdMilestoneAudit'))` and registered the `gsd_milestone_audit` tool via `ctx.tools.register(defineTool({...}))` with inject `['gsdState','tools']`. Exported the pure, unit-testable helpers `aggregateCloseGate`, `classifyMilestoneStatus`, `resolveAuditorOutput`. In `apply()`: fail-fast on baseline guards; ran a deterministic close-gate aggregation (per-phase VERIFICATION.md statuses, milestone REQ-ID completeness, shipped status); emitted a cross-phase UAT outstanding-items list; wrote a milestone-scoped AUDIT.md. Soft gate: never blocks the release, does not advance STATE.
- **Task 2** — Registered the `gsdMilestoneAudit` descriptor row in `lib/_capabilities.js` (step `milestone-audit`, role `step`, tools `['gsd_milestone_audit']`, commands `[]`, order 52, produces `['AUDIT.md']`, consumes `['VERIFICATION.md','ROADMAP.md','REQUIREMENTS.md']`) and appended it to CAPABILITY_KEYS. Created `test/milestone-audit.test.mjs` covering capability descriptor registration, pure helpers, close-gate aggregation, UAT outstanding-items, and soft-gate no-block.

## Known Stubs

None. No TODO/FIXME/placeholder introduced.

## Threat Flags

None. Additive step tool; no new runtime dependency, no security-sensitive surface touched.

## Self-Check: PASSED

- `lib/milestone-audit.js` exists, exports `name, inject, apply, aggregateCloseGate, classifyMilestoneStatus, resolveAuditorOutput`.
- `test/milestone-audit.test.mjs` exists and passes (18 tests).
- `gsdMilestoneAudit` is registered in `lib/_capabilities.js`.
- The tool is a soft gate: it never blocks the release and does not advance STATE.
