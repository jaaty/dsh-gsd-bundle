---
phase: 26-repo-hygiene
plan: 02
subsystem: repo-hygiene
tags: [gitignore, curate-decision, planning-artefacts, repo-hygiene]
dependency_graph:
  requires: []
  provides: ["curate-decision-applied"]
  affects: [".gitignore", ".planning/"]
tech-stack: [git, markdown]
key-files:
  created: []
  modified: [".gitignore"]
decisions:
  - "D-06: keep durable .planning/ artefacts tracked, gitignore volatile churn"
  - "D-07: apply via .gitignore + git rm --cached only; no GSD tool write-behaviour change"
metrics:
  duration: "~5 min"
  completed: "2026-08-29"
status: complete
---

# Phase 26 Plan 02: Apply the .planning/ Curate Decision Summary

Applied the keep-durable/gitignore-volatile curate decision (D-06/D-07) to the `.planning/` directory: added the four volatile-path entries to `.gitignore` (with a depth-agnostic DISCUSSION-LOG glob) and untracked the already-tracked volatile files via `git rm --cached` so they remain on disk for the GSD tools.

## Tasks Completed

1. **Task 1 — Add .gitignore entries (D-06/D-07):** Added a comment block and the four volatile-path entries to `.gitignore`, preserving the existing `node_modules/` line. The per-phase DISCUSSION-LOG glob is the depth-agnostic `.planning/phases/**/*-DISCUSSION-LOG.md` so it covers both the depth-2 per-phase files and the depth-3 demo-artifacts file, while never matching the durable `-CONTEXT/-RESEARCH/-PLAN/-SUMMARY/-VERIFICATION` files.
2. **Task 2 — Untrack already-tracked volatile files (D-06/D-07):** Ran `git rm --cached -r --ignore-unmatch` on the volatile paths (`.planning/WINDOWS.md`, `.planning/async-jobs.json`, `.planning/quick/`, per-phase `*-DISCUSSION-LOG.md`, and the depth-3 `DEMO-01-demo-DISCUSSION-LOG.md`). The only file actually still tracked at execution time was the depth-3 demo-artifacts file; it was removed from the index while remaining on disk. All durable artefacts (PROJECT/REQUIREMENTS/ROADMAP/STATE/config.json/codebase/ and per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION) remain tracked.

## Commits

- `531c789` — `chore(GSD-26-repo-hygiene-02): gitignore volatile .planning/ churn` (`.gitignore` glob fix + untrack depth-3 DISCUSSION-LOG)

## Verification

- `.gitignore` contains `node_modules/`, `.planning/async-jobs.json`, `.planning/WINDOWS.md`, `.planning/quick/`, and `.planning/phases/**/*-DISCUSSION-LOG.md`.
- `git ls-files .planning/` lists no volatile paths (WINDOWS/async-jobs/quick/DISCUSSION-LOG) and lists durable artefacts (STATE/ROADMAP/config.json/CONTEXT/PLAN/codebase).
- `.planning/WINDOWS.md`, `.planning/async-jobs.json`, and the depth-3 `DEMO-01-demo-DISCUSSION-LOG.md` remain on disk.

## Known Stubs

None.

## Threat Flags

None. No credentials or secrets were introduced; the hygiene rule (D-05) is documented in CONTRIBUTING.md (plan 01).

## Self-Check: PASSED

- `.gitignore` exists and contains the required entries (verified via grep).
- Volatile files untracked, durable files tracked (verified via `git ls-files`).
- Commit `531c789` exists and contains only the intended files.
