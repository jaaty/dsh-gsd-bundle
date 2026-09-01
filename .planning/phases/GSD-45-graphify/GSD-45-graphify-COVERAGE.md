---
status: covered
gap_ids: []
coverage_pct: 100
phase: 45
generated: "2026-09-01T05:13:56.114Z"
---
# Phase 45: graphify - Coverage

**Generated:** 2026-09-01T05:13:56.114Z

| ID | Source | Text | Covered | Plan(s) | Evidence |
|---|---|---|---|---|---|
| GAP-11 | REQUIREMENTS | A project knowledge graph is built in .planning/graphs/ and… | Y | GSD-45-graphify-01, GSD-45-graphify-02, GSD-45-graphify-03 | GSD-45-graphify-01: both; GSD-45-graphify-02: declared, not elaborated; GSD-45-graphify-03: declared, not elaborated |
| D-01 | CONTEXT | graphify is a full loop-step plugin mirroring lib/learnings… | Y | GSD-45-graphify-01, GSD-45-graphify-02 | GSD-45-graphify-01: body; GSD-45-graphify-02: body |
| D-02 | CONTEXT | The tool signature is gsd_graphify({ action, term }) where … | Y | GSD-45-graphify-01 | GSD-45-graphify-01: body |
| D-03 | CONTEXT | The build is a pure-JS deterministic scan of .planning/ art… | Y | GSD-45-graphify-01 | GSD-45-graphify-01: body |
| D-04 | CONTEXT | The graph model is project-global (mirroring upstream .plan… | Y | GSD-45-graphify-01, GSD-45-graphify-03 | GSD-45-graphify-01: body; GSD-45-graphify-03: body |
| D-05 | CONTEXT | Opt-in via graphify.enabled in config.json, mirroring upstr… | Y | GSD-45-graphify-01 | GSD-45-graphify-01: body |
| D-06 | CONTEXT | Build writes two artefacts under .planning/graphs/: (a) gra… | Y | GSD-45-graphify-01 | GSD-45-graphify-01: body |
| D-07 | CONTEXT | Status reports BOTH freshness measures (upstream parity, th… | Y | GSD-45-graphify-01 | GSD-45-graphify-01: body |
| D-08 | CONTEXT | ship.js gains a best-effort post-PR rebuild of the just-shi… | Y | GSD-45-graphify-01, GSD-45-graphify-03 | GSD-45-graphify-01: body; GSD-45-graphify-03: body |
| D-09 | CONTEXT | The manual gsd_graphify build path also commits the .planni… | Y | GSD-45-graphify-01, GSD-45-graphify-03 | GSD-45-graphify-01: body; GSD-45-graphify-03: body |
| D-10 | CONTEXT | Advisory soft gate, never blocks: graphify does not advance… | Y | GSD-45-graphify-01, GSD-45-graphify-02 | GSD-45-graphify-01: body; GSD-45-graphify-02: body |
| D-11 | CONTEXT | Query behaviour: gsd_graphify({ action: 'query', term }) re… | Y | GSD-45-graphify-01 | GSD-45-graphify-01: body |
| D-12 | CONTEXT | The phase is TDD: unit tests cover (a) gsdGraphify capabili… | Y | GSD-45-graphify-01 | GSD-45-graphify-01: body |
| D-13 | CONTEXT | Exact names of helper functions / files inside lib/graphify… | Y | GSD-45-graphify-01, GSD-45-graphify-03 | GSD-45-graphify-01: body; GSD-45-graphify-03: body |

## Orphan IDs

_IDs mentioned in plans but not in the phase's requirements or CONTEXT (typos, cross-phase, or stale IDs)._

| ID | Plan(s) |
|---|---|
| DEGR-05 | GSD-45-graphify-02, GSD-45-graphify-03 |
| GAP-12 | GSD-45-graphify-01 |
| GSD-45 | GSD-45-graphify-01 |

---

*Phase: 45-graphify*
*Coverage generated: 2026-09-01*