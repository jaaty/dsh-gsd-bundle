---
status: gaps
gap_ids: [D-01]
coverage_pct: 88
phase: 51
generated: "2026-09-02T20:25:37.139Z"
---
# Phase 51: drop-clean-branch - Coverage

**Generated:** 2026-09-02T20:25:37.139Z

> WARNING: uncovered IDs: D-01

| ID | Source | Text | Covered | Plan(s) | Evidence |
|---|---|---|---|---|---|
| SHIP-CLEAN-01 | REQUIREMENTS | SHIP-CLEAN-01 | Y | GSD-51-drop-clean-branch-02 | GSD-51-drop-clean-branch-02: declared, not elaborated |
| SHIP-CLEAN-04 | REQUIREMENTS | SHIP-CLEAN-04 | Y | GSD-51-drop-clean-branch-01, GSD-51-drop-clean-branch-02, GSD-51-drop-clean-branch-03 | GSD-51-drop-clean-branch-01: declared, not elaborated; GSD-51-drop-clean-branch-02: both; GSD-51-drop-clean-branch-03: declared, not elaborated |
| D-01 | CONTEXT | This is a removal, not a new plugin: no new capability, no … | N | — | — |
| D-02 | CONTEXT | gsd_ship always PRs the phase-NN branch directly. Remove st… | Y | GSD-51-drop-clean-branch-02 | GSD-51-drop-clean-branch-02: body |
| D-03 | CONTEXT | parseNameStatusZ is shared by lib/undo.js (and test/undo.te… | Y | GSD-51-drop-clean-branch-01 | GSD-51-drop-clean-branch-01: body |
| D-04 | CONTEXT | Remove the no_clean_pr boolean param from gsd_ship's define… | Y | GSD-51-drop-clean-branch-03 | GSD-51-drop-clean-branch-03: body |
| D-05 | CONTEXT | Remove test/pr-branch.test.mjs (the clean-branch core tests… | Y | GSD-51-drop-clean-branch-02, GSD-51-drop-clean-branch-03 | GSD-51-drop-clean-branch-02: body; GSD-51-drop-clean-branch-03: body |
| D-06 | CONTEXT | Exact placement of parseNameStatusZ within lib/_shared.js (… | Y | GSD-51-drop-clean-branch-01 | GSD-51-drop-clean-branch-01: body |

## Orphan IDs

_IDs mentioned in plans but not in the phase's requirements or CONTEXT (typos, cross-phase, or stale IDs)._

| ID | Plan(s) |
|---|---|
| CLEAN-01 | GSD-51-drop-clean-branch-02 |
| CLEAN-04 | GSD-51-drop-clean-branch-01, GSD-51-drop-clean-branch-02, GSD-51-drop-clean-branch-03 |
| D-07 | GSD-51-drop-clean-branch-02 |
| D-08 | GSD-51-drop-clean-branch-02 |
| D-09 | GSD-51-drop-clean-branch-02 |
| GSD-35 | GSD-51-drop-clean-branch-02 |
| R-02 | GSD-51-drop-clean-branch-03 |
| R-2 | GSD-51-drop-clean-branch-03 |
| R-4 | GSD-51-drop-clean-branch-01 |
| W-05 | GSD-51-drop-clean-branch-03 |

---

*Phase: 51-drop-clean-branch*
*Coverage generated: 2026-09-02*