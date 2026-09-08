---
status: covered
gap_ids: []
coverage_pct: 100
phase: 58
generated: "2026-09-08T03:50:10.902Z"
---
# Phase 58: node-repair - Coverage

**Generated:** 2026-09-08T03:50:10.902Z

| ID | Source | Text | Covered | Plan(s) | Evidence |
|---|---|---|---|---|---|
| CLH-08 | REQUIREMENTS | Node repair: automatically recover a plan whose verificatio… | Y | GSD-58-node-repair-01, GSD-58-node-repair-02, GSD-58-node-repair-03 | GSD-58-node-repair-01: both; GSD-58-node-repair-02: declared, not elaborated; GSD-58-node-repair-03: declared, not elaborated |
| D-01 | CONTEXT | Node-repair ships as a NEW standalone orchestrator tool `gs… | Y | GSD-58-node-repair-01, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-03: body |
| D-02 | CONTEXT | gsd_verify itself never auto-repairs. Its `gaps_found` rout… | Y | GSD-58-node-repair-01, GSD-58-node-repair-02 | GSD-58-node-repair-01: body; GSD-58-node-repair-02: body |
| D-03 | CONTEXT | gsd_repair accepts { phase, rounds? } where rounds (1..2) o… | Y | GSD-58-node-repair-01, GSD-58-node-repair-02, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-02: body; GSD-58-node-repair-03: body |
| D-04 | CONTEXT | Only verification status `gaps_found` triggers repair round… | Y | GSD-58-node-repair-01, GSD-58-node-repair-02, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-02: body; GSD-58-node-repair-03: body |
| D-05 | CONTEXT | No-op guard: if gsd_repair is invoked and the phase's VERIF… | Y | GSD-58-node-repair-01, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-03: body |
| D-06 | CONTEXT | One repair round = gsd_plan(phase, gaps:true) → gsd_execute… | Y | GSD-58-node-repair-01, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-03: body |
| D-07 | CONTEXT | Hard budget of 2 automatic rounds per invocation (default; … | Y | GSD-58-node-repair-01, GSD-58-node-repair-02, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-02: body; GSD-58-node-repair-03: body |
| D-08 | CONTEXT | Repair delegates to the EXISTING gsd_plan / gsd_execute / g… | Y | GSD-58-node-repair-02 | GSD-58-node-repair-02: body |
| D-09 | CONTEXT | gsd_autonomous is rewired: on `gaps_found` it runs the boun… | Y | GSD-58-node-repair-02 | GSD-58-node-repair-02: body |
| D-10 | CONTEXT | Repair writes/accumulates `<NN>-REPAIR.md` in the phase dir… | Y | GSD-58-node-repair-01, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-03: body |
| D-11 | CONTEXT | Stop-with-cause is the universal failure mode: if gsd_plan … | Y | GSD-58-node-repair-01, GSD-58-node-repair-02, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-02: body; GSD-58-node-repair-03: body |
| D-12 | CONTEXT | No new runtime dependencies — node builtins only; all subpr… | Y | GSD-58-node-repair-01, GSD-58-node-repair-03 | GSD-58-node-repair-01: body; GSD-58-node-repair-03: body |

## Orphan IDs

_IDs mentioned in plans but not in the phase's requirements or CONTEXT (typos, cross-phase, or stale IDs)._

| ID | Plan(s) |
|---|---|
| CQ-03 | GSD-58-node-repair-01 |
| DEGR-03 | GSD-58-node-repair-01 |
| DUR-06 | GSD-58-node-repair-01, GSD-58-node-repair-03 |
| GSD-58 | GSD-58-node-repair-01, GSD-58-node-repair-02, GSD-58-node-repair-03 |
| OQ-1 | GSD-58-node-repair-01 |
| OQ-4 | GSD-58-node-repair-01, GSD-58-node-repair-02, GSD-58-node-repair-03 |
| OQ-5 | GSD-58-node-repair-01, GSD-58-node-repair-02 |
| OQ-6 | GSD-58-node-repair-01 |
| OQ-7 | GSD-58-node-repair-01 |
| OQ-8 | GSD-58-node-repair-02 |
| OQ-9 | GSD-58-node-repair-01 |

---

*Phase: 58-node-repair*
*Coverage generated: 2026-09-08*