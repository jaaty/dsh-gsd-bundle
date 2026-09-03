---
status: gaps
gap_ids: [D-13]
coverage_pct: 93
phase: 49
generated: "2026-09-03T03:15:52.732Z"
---
# Phase 49: autonomous - Coverage

**Generated:** 2026-09-03T03:15:52.732Z

> WARNING: uncovered IDs: D-13

| ID | Source | Text | Covered | Plan(s) | Evidence |
|---|---|---|---|---|---|
| GAP-15 | REQUIREMENTS | An autonomous path can drive all remaining phases of a mile… | Y | GSD-49-autonomous-01, GSD-49-autonomous-02, GSD-49-autonomous-03 | GSD-49-autonomous-01: both; GSD-49-autonomous-02: both; GSD-49-autonomous-03: both |
| D-01 | CONTEXT | autonomous is a new step capability gsdAutonomous declared … | Y | GSD-49-autonomous-01 | GSD-49-autonomous-01: body |
| D-02 | CONTEXT | Injectable dependencies: ['gsdState','tools','subagents'] (… | Y | GSD-49-autonomous-01 | GSD-49-autonomous-01: body |
| D-03 | CONTEXT | Per-phase orchestration is a single fresh-context autopilot… | Y | GSD-49-autonomous-02, GSD-49-autonomous-03 | GSD-49-autonomous-02: body; GSD-49-autonomous-03: body |
| D-04 | CONTEXT | Each phase runs discuss → plan → execute → verify. gsd_auto… | Y | GSD-49-autonomous-02, GSD-49-autonomous-03 | GSD-49-autonomous-02: body; GSD-49-autonomous-03: body |
| D-05 | CONTEXT | When a phase has no CONTEXT.md, gsd_autonomous auto-derives… | Y | GSD-49-autonomous-02 | GSD-49-autonomous-02: body |
| D-06 | CONTEXT | The auto-derived minimal CONTEXT.md is written as a plannin… | Y | GSD-49-autonomous-02 | GSD-49-autonomous-02: body |
| D-07 | CONTEXT | Phase discovery reads the active milestone from STATE/ROADM… | Y | GSD-49-autonomous-01, GSD-49-autonomous-02 | GSD-49-autonomous-01: body; GSD-49-autonomous-02: body |
| D-08 | CONTEXT | No --from/--to/--only flags. gsd_autonomous always runs eve… | Y | GSD-49-autonomous-01, GSD-49-autonomous-02 | GSD-49-autonomous-01: body; GSD-49-autonomous-02: body |
| D-09 | CONTEXT | gsd_autonomous stops on hard failure only: a subagent spawn… | Y | GSD-49-autonomous-02, GSD-49-autonomous-03 | GSD-49-autonomous-02: body; GSD-49-autonomous-03: body |
| D-10 | CONTEXT | On a hard failure gsd_autonomous records the stopping conte… | Y | GSD-49-autonomous-01, GSD-49-autonomous-02 | GSD-49-autonomous-01: body; GSD-49-autonomous-02: body |
| D-11 | CONTEXT | gsd_autonomous returns a structured summary: milestone, pha… | Y | GSD-49-autonomous-02 | GSD-49-autonomous-02: body |
| D-12 | CONTEXT | Follow test/*.test.mjs + mount-harness conventions. Cover: … | Y | GSD-49-autonomous-03 | GSD-49-autonomous-03: body |
| D-13 | CONTEXT | Exact autopilot subagent prompt wording and how it resolves… | N | — | — |

## Orphan IDs

_IDs mentioned in plans but not in the phase's requirements or CONTEXT (typos, cross-phase, or stale IDs)._

| ID | Plan(s) |
|---|---|
| GAP-16 | GSD-49-autonomous-02, GSD-49-autonomous-03 |
| GSD-50 | GSD-49-autonomous-02, GSD-49-autonomous-03 |

---

*Phase: 49-autonomous*
*Coverage generated: 2026-09-03*