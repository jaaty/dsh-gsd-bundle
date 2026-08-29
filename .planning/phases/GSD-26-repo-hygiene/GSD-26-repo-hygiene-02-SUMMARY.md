---
phase: 26-repo-hygiene
plan: 02
subsystem: repo-hygiene
tags: [repo-hygiene, gitignore, curate, planning-artefacts]
dependency_graph:
  requires: []
  provides: [".gitignore curate entries", "volatile .planning/ files untracked"]
  affects: [".planning/ tracking state"]
tech-stack: [git, markdown]
key-files:
  created: []
  modified: [".gitignore"]
decisions:
  - "D-06: keep durable .planning/ artefacts tracked, gitignore volatile churn"
  - "D-07: applied via .gitignore entries + git rm --cached only; no GSD tool write-behaviour change"
metrics:
  duration: "~5 min"
  completed: "2026-08-29"
  actuals:
    tasks: 2
    commits: 2
status: complete
---

# Phase 26 Plan 02: Apply the .planning/ Curate Decision Summary

Applied the curate decision (D-06/D-07): added .gitignore entries for the volatile .planning/ paths and untracked the already-tracked volatile files via `git rm --cached` (keeping them on disk), while leaving all durable artefacts tracked.

## Tasks Completed

1. **Task 1 — Add .gitignore entries (D-06, D-07):** Added a comment block plus the four volatile-path entries to `.gitignore`, preserving the existing `node_modules/` line. Entries: `.planning/async-jobs.json`, `.planning/WINDOWS.md`, `.planning/quick/`, `.planning/phases/*/*-DISCUSSION-LOG.md`. The depth-2 glob matches only `*-DISCUSSION-LOG.md` files and never the durable `-CONTEXT/-RESEARCH/-PLAN/-SUMMARY/-VERIFICATION` files. Committed as `008ff1b`.

2. **Task 2 — Untrack already-tracked volatile files (D-06, D-07):** Ran `git rm --cached -r` on `.planning/WINDOWS.md`, `.planning/async-jobs.json`, `.planning/quick/`, and all `.planning/phases/*/*-DISCUSSION-LOG.md` files, plus the nested depth-3 `demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md`. All volatile files remain on disk (verified via `ls`); all durable artefacts (STATE.md, ROADMAP.md, config.json, codebase/, per-phase CONTEXT/PLAN/SUMMARY/VERIFICATION/RESEARCH) remain tracked. Committed as `d42f4fb`.

## Verification

- `git ls-files .planning/ | grep -E 'WINDOWS|async-jobs|quick/|DISCUSSION-LOG'` → empty (exit 1) ✓
- `git ls-files .planning/ | grep -E 'STATE|ROADMAP|config.json|CONTEXT|PLAN|codebase'` → 112 matches ✓
- `ls .planning/WINDOWS.md` and `ls .planning/async-jobs.json` → succeed (files on disk) ✓
- `.gitignore` contains all four volatile entries plus preserved `node_modules/` ✓

## Known Stubs

None.

## Threat Flags

None. No credentials/tokens were introduced; the durable .planning/ subset remains committed per the curate decision.

## Self-Check: PASSED

- `.gitignore` exists with the four volatile entries (verified via grep) ✓
- Both commits exist: `008ff1b` (Task 1), `d42f4fb` (Task 2) ✓
- All volatile files untracked but on disk; all durable artefacts tracked ✓

## Note

The nested depth-3 file `.planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md` is untracked (satisfying the verify criterion) but is not covered by the plan's exact depth-2 glob `.planning/phases/*/*-DISCUSSION-LOG.md`, so it shows as untracked in `git status`. It remains on disk. This is a minor edge case outside the plan's specified glob; no action taken to avoid deviating from the plan's exact glob.
