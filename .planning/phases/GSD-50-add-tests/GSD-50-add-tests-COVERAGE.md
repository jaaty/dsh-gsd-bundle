---
status: covered
gap_ids: []
coverage_pct: 100
phase: 50
generated: "2026-09-04T01:12:52.268Z"
---
# Phase 50: add-tests - Coverage

**Generated:** 2026-09-04T01:12:52.268Z

| ID | Source | Text | Covered | Plan(s) | Evidence |
|---|---|---|---|---|---|
| GAP-16 | REQUIREMENTS | An add-tests generator creates unit and E2E tests for a com… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02, GSD-50-add-tests-03 | GSD-50-add-tests-01: both; GSD-50-add-tests-02: both; GSD-50-add-tests-03: declared, not elaborated |
| D-01 | CONTEXT | add-tests is an out-of-band step capability gsdAddTests dec… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-02 | CONTEXT | Injectable dependencies: ['gsdState','tools','subagents'] (… | Y | GSD-50-add-tests-01 | GSD-50-add-tests-01: body |
| D-03 | CONTEXT | The E2E (browser) tier from upstream is reinterpreted as In… | Y | GSD-50-add-tests-01 | GSD-50-add-tests-01: body |
| D-04 | CONTEXT | add-tests targets COMPLETED phases only: it requires at lea… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-05 | CONTEXT | Changed-file scope is extracted deterministically from the … | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-06 | CONTEXT | The writer subagent returns a STRUCTURED output object { te… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-07 | CONTEXT | R-5 hard boundary: only relative, non-traversing, TEST-shap… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-08 | CONTEXT | Accepted test files are committed atomically and separately… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-09 | CONTEXT | A single confirmation gate before spawning the writer, mirr… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-10 | CONTEXT | Error handling: fail-fast on no .planning/ project, phase n… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-11 | CONTEXT | Bugs discovered by generated tests are REPORTED (not fixed)… | Y | GSD-50-add-tests-01, GSD-50-add-tests-02 | GSD-50-add-tests-01: body; GSD-50-add-tests-02: body |
| D-12 | CONTEXT | TDD: follow test/*.test.mjs + mount-harness conventions and… | Y | GSD-50-add-tests-02 | GSD-50-add-tests-02: body |
| D-13 | CONTEXT | Exact writer subagent prompt wording and structured schema … | Y | GSD-50-add-tests-01 | GSD-50-add-tests-01: body |

## Orphan IDs

_IDs mentioned in plans but not in the phase's requirements or CONTEXT (typos, cross-phase, or stale IDs)._

| ID | Plan(s) |
|---|---|
| CQ-07 | GSD-50-add-tests-01 |
| DEGR-07 | GSD-50-add-tests-01 |
| GSD-50 | GSD-50-add-tests-01, GSD-50-add-tests-02, GSD-50-add-tests-03 |
| MW-02 | GSD-50-add-tests-01 |
| OQ-1 | GSD-50-add-tests-01 |
| OQ-3 | GSD-50-add-tests-01, GSD-50-add-tests-03 |
| R-2 | GSD-50-add-tests-01 |
| R-5 | GSD-50-add-tests-01 |

---

*Phase: 50-add-tests*
*Coverage generated: 2026-09-04*