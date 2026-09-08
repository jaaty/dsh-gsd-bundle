---
status: covered
gap_ids: []
coverage_pct: 100
phase: 59
generated: "2026-09-08T05:25:37.832Z"
---
# Phase 59: review-fix-companion - Coverage

**Generated:** 2026-09-08T05:25:37.832Z

| ID | Source | Text | Covered | Plan(s) | Evidence |
|---|---|---|---|---|---|
| CLH-09 | REQUIREMENTS | Review-fix companion: the gsd_code_review fix flag applies … | Y | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02, GSD-59-review-fix-companion-03 | GSD-59-review-fix-companion-01: declared, not elaborated; GSD-59-review-fix-companion-02: both; GSD-59-review-fix-companion-03: declared, not elaborated |
| D-01 | CONTEXT | Replace the full-file-content fixer contract with a bounded… | Y | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-01: body; GSD-59-review-fix-companion-02: body |
| D-02 | CONTEXT | Rewrite CODE_FIXER_PROMPT (lib/_agents.js) to the anchor-ed… | Y | GSD-59-review-fix-companion-01 | GSD-59-review-fix-companion-01: body |
| D-03 | CONTEXT | Pre-write validation per finding: every `find` anchor must … | Y | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-01: body; GSD-59-review-fix-companion-02: body |
| D-04 | CONTEXT | Keep the one-shot review→fix flow: `--fix` (and `--all`/`--… | Y | GSD-59-review-fix-companion-01 | GSD-59-review-fix-companion-01: body |
| D-05 | CONTEXT | --auto loop semantics unchanged: MAX_ITERATIONS=3, re-revie… | Y | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-01: body; GSD-59-review-fix-companion-02: body |
| D-06 | CONTEXT | Skip-and-continue per finding: a fixer fault on one finding… | Y | GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-02: body |
| D-07 | CONTEXT | Exactly one fixer attempt per finding — no retry within a r… | Y | GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-02: body |
| D-08 | CONTEXT | The existing fail-fast guards stay: --fix with an UNAVAILAB… | Y | GSD-59-review-fix-companion-01 | GSD-59-review-fix-companion-01: body |
| D-09 | CONTEXT | Include the two sibling live-host guards in this phase: wra… | Y | GSD-59-review-fix-companion-03 | GSD-59-review-fix-companion-03: body |
| D-10 | CONTEXT | No new tools, commands, capabilities, or config keys; mount… | Y | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02, GSD-59-review-fix-companion-03 | GSD-59-review-fix-companion-01: body; GSD-59-review-fix-companion-02: body; GSD-59-review-fix-companion-03: body |
| D-11 | CONTEXT | Each --fix run OVERWRITES the phase's REVIEW-FIX.md (no .it… | Y | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-01: body; GSD-59-review-fix-companion-02: body |
| D-12 | CONTEXT | Capture the real commit hash for each per-fix atomic commit… | Y | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-01: body; GSD-59-review-fix-companion-02: body |
| D-13 | CONTEXT | No new dependencies — node builtins only. Reuse the existin… | Y | GSD-59-review-fix-companion-02 | GSD-59-review-fix-companion-02: body |

## Orphan IDs

_IDs mentioned in plans but not in the phase's requirements or CONTEXT (typos, cross-phase, or stale IDs)._

| ID | Plan(s) |
|---|---|
| GSD-58 | GSD-59-review-fix-companion-01 |
| GSD-59 | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02, GSD-59-review-fix-companion-03 |
| N-1 | GSD-59-review-fix-companion-01 |
| OQ-1 | GSD-59-review-fix-companion-02 |
| OQ-10 | GSD-59-review-fix-companion-02 |
| OQ-11 | GSD-59-review-fix-companion-01, GSD-59-review-fix-companion-02 |
| OQ-12 | GSD-59-review-fix-companion-02 |
| OQ-3 | GSD-59-review-fix-companion-02 |
| OQ-4 | GSD-59-review-fix-companion-02 |
| OQ-5 | GSD-59-review-fix-companion-02 |
| OQ-6 | GSD-59-review-fix-companion-01 |
| OQ-7 | GSD-59-review-fix-companion-01 |
| OQ-8 | GSD-59-review-fix-companion-01 |
| OQ-9 | GSD-59-review-fix-companion-01 |

---

*Phase: 59-review-fix-companion*
*Coverage generated: 2026-09-08*