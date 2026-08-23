This is a trivial demo phase. I have all the facts I need. Writing the RESEARCH.md.

# DEMO-01-demo — RESEARCH.md

## Domain analysis

This phase is a **single-line documentation edit** to `README.md`. It is the "demo" phase of a throwaway GSD proof-of-project: the entire goal is to prove that the GSD phase loop (Discuss → Plan → Execute → Verify → Ship) runs end-to-end against a real repo with a trivial, non-destructive change.

**Standard stack / mechanics — confidence HIGH [VERIFIED: read of README.md lines 1–125 in this session].**
- Target file is a plain Markdown file: H1 title `# dsh-gsd-bundle` on line 1, a blank line 2, then the body paragraph beginning line 3. [VERIFIED: read README.md L1–L3]
- Appending one line "near the top, right after the H1 title block" (D-01) means inserting a line immediately after the H1 (after L1, i.e. between L1 and the blank L2) or within the first few lines following the title block — exact placement is delegated to executor discretion ("Claude's Discretion").
- No build tooling, no runtime, no tests exist for this phase; the "test" is a `git diff` proving only the intended line was added (D-04). [VERIFIED: git status shows README.md currently unmodified; only `.planning/` is dirty]
- The proposed line (D-02) reuses the `Discuss → Plan → Execute → Verify → Ship` arrow notation already present in the file at L6. [VERIFIED: read README.md L6]
- Non-destructive safety is trivially achievable with `write`/`edit`; only one line changes.

**Pitfalls.**
- **Repetition/styling drift:** the file already documents the GSD loop at length (L5–L9, L82). An extra near-top line must not contradict or duplicate the existing prose confusingly; it is a deliberately separate, self-contained demo-sentinel line, so this is acceptable but worth a one-line wording note (the D-02 text is locked, so no wording change is needed).
- **Placement ambiguity:** "right after the H1 title block" could mean before the blank L2 or after it (before L3). Either satisfies D-01/D-02; the executor's discretion covers it. This is minor and not a blocker.
- **Empty or renamed file:** if README.md lacked an H1 the decision would be ambiguous — not the case here (H1 confirmed at L1). [VERIFIED]

## Package legitimacy

No new dependencies are required for this phase. No registry lookups performed; none needed. The plan should explicitly forbid adding dependencies/build tooling (consistent with D-003). [VERIFIED: CONTEXT.md D-003 "no build tooling or package changes needed"]

## Risks and Open Questions

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-01 | More than one line changes (violates D-004) | Low | Post-edit `git diff -- README.md` must show exactly one added line; gate before commit. |
| R-02 | Line inserted in the wrong location (not near top / not after title) | Low | Executor places within first few lines after the H1; verifier checks placement against D-01. |
| R-03 | Existing README content disturbed | Low | Only `append`-style edit; `git diff` proves it. |

### Open Questions

- **OQ-01: Is exact placement "right after the H1 (between L1 and blank L2)" vs "after the title block including the blank line (after L2, before the body paragraph L3)?"** → **(RESOLVED)** D-01 says "right after the H1 title block, so it is visible and trivially identifiable"; the executor has explicit discretion ("Exact placement within the first few lines of README.md (after the title), as long as it's one clean appended line"). Both are in scope. No ambiguity blocks planning. **(RESOLVED — locked CONTEXT.md discretion)**
- **O-02: Does the demo line risk contradicting the existing README text about the loop?** → **(RESOLVED)** No contradiction: the line is additive metadata about the demo project itself, distinct from the bundle's own documentation prose. No conflict. **(RESOLVED — content inspection)**
- **O-03: Is there a test harness expected for DEMO-01?** → **(RESOLVED)** No. The acceptance criterion is a README mention; the automated proof is the `git diff` check (Validation Architecture below). **(RESOLVED — REQUIREMENTS.md DEMO-01 is purely a README-mention criterion)**

All open questions resolved; planning may proceed.

## Architectural Responsibility Map

| Capability | Tier | Notes |
|---|---|---|
| Append demo line to README | presentation (documentation surface) | It is a change to the doc/surface of the repo, not domain/data/integration logic. |
| Verify only one line added (git diff) | — | A verification-only capability; no tier concern. |

No security-sensitive capability exists in this phase. No tier-assignment blocker. The entire phase is presentation-tier documentation work with no domain, data, or integration layers.

## Validation Architecture

Automated proofs for the acceptance criteria:

| Behaviour | Automated check |
|---|---|
| DEMO-01: README mentions the e2e demo | `grep -n "demo-e2e phase through the full GSD loop" README.md` returns a match. |
| D-01/D-02: line present near top after title | `git diff README.md` shows the added line at the top region (within first ~6 lines). |
| D-004: non-destructive, exactly one line added | `git diff --stat README.md` shows 1 insertion, 0 deletions; `git diff README.md` shows only the intended added line and no other hunks. |
| No tooling/package drift | `git status --short` shows only `README.md` (plus `.planning/` artefacts) modified; no `package.json`/lockfile changes. |

The build/test harness for this phase is the shell commands above run during Verify; there is no automated test suite to add.

## Project Constraints

- GSD phase-loop discipline: Discuss → Plan → Execute → Verify → Ship, driven by the `gsd_*` tools. [VERIFIED: PROJECT.md]
- This is a demo project; the change must be trivial and non-destructive. [VERIFIED: PROJECT.md, CONTEXT.md]
- Decisions D-01…D-04 are LOCKED and must be implemented as-specified (place after title; exact D-02 text; plain file edit; only one line added).
- `README.md` is a plain Markdown file with an H1 at the top; appending a line after the title block is safe. [VERIFIED: read README.md]