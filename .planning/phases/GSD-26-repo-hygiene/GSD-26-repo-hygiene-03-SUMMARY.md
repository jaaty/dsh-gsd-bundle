---
phase: 26-repo-hygiene
plan: 03
subsystem: repo-docs
tags: [repo-hygiene, readme, verification, curate, planning-artefacts]
dependency_graph:
  requires: [GSD-26-repo-hygiene-01, GSD-26-repo-hygiene-02]
  provides: ["README links to the three new files", "README .planning/ curate note", "test/repo-hygiene.test.mjs"]
  affects: [README.md, test/repo-hygiene.test.mjs, ".planning/ tracking state"]
tech-stack: [markdown, node:test, git]
key-files:
  created:
    - test/repo-hygiene.test.mjs
  modified:
    - README.md
decisions:
  - D-08: README .planning/ artefacts section documents the curate decision (durable tracked, volatile gitignored).
  - D-09: README links CHANGELOG.md, CONTRIBUTING.md, and CODE_OF_CONDUCT.md.
  - D-06/D-07: volatile .planning/ files untracked, durable artefacts tracked.
metrics:
  duration: 2026-08-29
  completed: 2026-08-29
actuals:
  tasks: 2
  commits: 2
status: complete
---

# Phase 26 Plan 03: Wire Phase Outputs Together Summary

Wired the phase outputs together: added README links to the three new files (D-09), documented the `.planning/` curate decision in README's `.planning/ artefacts` section (D-08), and added the full `node --test` verification (`test/repo-hygiene.test.mjs`) proving every phase output is in place — the three files, the README links, the curate note, and the git tracking state.

## Tasks completed

1. **Task 1 — README links + curate note (D-08, D-09):** Edited `README.md` to (a) add a new `## Contributing` section (before `## License`) linking `CHANGELOG.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`, and (b) add a "Curate, don't commit everything" note to the `### .planning/ artefacts` section documenting the curate decision: durable artefacts (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json, codebase/, per-phase CONTEXT/RESEARCH/PLAN/SUMMARY/VERIFICATION) are tracked, while volatile churn (async-jobs.json, WINDOWS.md, quick/ records, per-phase DISCUSSION-LOG.md) is gitignored but stays on disk. The note also carries the no-credentials hygiene rule. The existing `.planning/` tree diagram was left intact. Committed as `b596c9a`.

2. **Task 2 — test/repo-hygiene.test.mjs (D-01..D-09):** Created `test/repo-hygiene.test.mjs` mirroring `test/license.test.mjs` (node:test + assert/strict, `ROOT = new URL("../", import.meta.url).pathname`). Six tests assert: CHANGELOG.md is Keep-a-Changelog with `# Changelog` / `[Unreleased]` / `[2.0.0]` / `[1.7.0]` (D-01/D-02); CODE_OF_CONDUCT.md is Contributor Covenant 2.1 (D-03); CONTRIBUTING.md is full-depth with `node --test`, a PR workflow, the GSD loop, and the no-credentials rule (D-04/D-05); README links all three files (D-09); README documents the curate decision (D-08); and the volatile `.planning/` files are untracked while durable ones remain tracked (D-06/D-07) via `execFileSync("git", ["ls-files", ...])`. All 6 tests pass; full suite is 404 pass / 0 fail. Committed as `d2fd59f`.

## Deviation note (git tracking)

Plan 02 left the depth-3 file `.planning/phases/GSD-03-loop-e2e/demo-artifacts/DEMO-01-demo-DISCUSSION-LOG.md` still tracked (it is outside plan 02's exact depth-2 glob `.planning/phases/*/*-DISCUSSION-LOG.md`). Plan 03's test criterion (6) explicitly requires that no `*-DISCUSSION-LOG.md` be tracked, so this executor ran `git rm --cached` on that file (keeping it on disk) as part of the Task 2 commit. This is consistent with the curate decision (D-06: gitignore volatile DISCUSSION-LOG churn) and makes the plan's own acceptance criterion pass. The file remains on disk and untracked; it is not covered by the depth-2 gitignore glob, so it shows as untracked in `git status` (the same edge case plan 02 documented).

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests.

## Threat Flags

None. No secrets, credentials, or tokens were introduced. The README curate note and CONTRIBUTING.md (plan 01) both carry the no-credentials-in-`.planning/` hygiene rule.

## Self-Check: PASSED

- `README.md` exists and links `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`; its `.planning/ artefacts` section documents the curate decision (verified via grep).
- `test/repo-hygiene.test.mjs` exists (119 lines, ≥60 min), contains `git ls-files`, and passes (`node --test` exit 0; full suite 404 pass / 0 fail).
- Both commits exist on `phase-26`: `b596c9a` (Task 1), `d2fd59f` (Task 2).
- Volatile `.planning/` files untracked; durable artefacts (STATE.md, ROADMAP.md, per-phase CONTEXT.md) remain tracked.
