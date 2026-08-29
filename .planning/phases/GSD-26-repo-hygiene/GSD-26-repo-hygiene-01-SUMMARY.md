---
phase: 26-repo-hygiene
plan: 01
subsystem: repo-docs
tags: [changelog, code-of-conduct, contributing, docs]
dependency_graph:
  requires: []
  provides: [CHANGELOG.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md]
  affects: [README.md (links added in plan 02/03), .gitignore (plan 02)]
tech-stack: [markdown, keep-a-changelog, contributor-covenant]
key-files:
  created:
    - CHANGELOG.md
    - CODE_OF_CONDUCT.md
    - CONTRIBUTING.md
  modified: []
decisions:
  - D-01: CHANGELOG.md uses Keep-a-Changelog format with Unreleased + v2.0.0 + v1.7.0 entries, hand-maintained.
  - D-02: CHANGELOG.md lives at repo root, linked from README.
  - D-03: Contributor Covenant 2.1 at CODE_OF_CONDUCT.md.
  - D-04: CONTRIBUTING.md is full-depth (setup, tests, PR workflow, GSD loop).
  - D-05: CONTRIBUTING.md includes no-credentials-in-.planning hygiene rule.
metrics:
  duration: 2026-08-29
  completed: 2026-08-29
actuals:
  tasks: 3
  commits: 3
status: complete
---

# Phase 26 Plan 01: Repo Documentation Files Summary

Created the three repo-root documentation files required by PUB-03 — CHANGELOG.md (Keep-a-Changelog), CODE_OF_CONDUCT.md (Contributor Covenant 2.1), and CONTRIBUTING.md (full-depth contribution guide) — each committed atomically.

## Tasks completed

1. **CHANGELOG.md** (D-01, D-02) — Keep-a-Changelog format with `# Changelog`, an `## [Unreleased]` section covering the in-progress `public-release-readiness` (v2.1.0) milestone, plus dated `## [2.0.0] - 2026-08-28` (milestone `graceful-removal`, phases 21–24) and `## [1.7.0] - 2026-08-28` (milestone `job-intel-multiwindow`, phases 1–20) sections. Each entry summarizes the correct milestone's shipped phases; no cross-milestone leakage.
2. **CODE_OF_CONDUCT.md** (D-03) — canonical Contributor Covenant 2.1 text with all sections preserved verbatim (Pledge, Standards, Enforcement Responsibilities, Scope, Enforcement, Enforcement Guidelines, Attribution). Placeholders filled: project name `dsh-gsd-bundle`, community contact `https://github.com/jaaty/dsh-gsd-bundle/issues`.
3. **CONTRIBUTING.md** (D-04, D-05) — full-depth guide covering development setup, the test command (`npm test` → `node --test test/*.test.mjs`), the PR/contribution workflow (phase-`<N>` feature branch, `gsd_ship` capability gates, `gh` PR creation), an accurate GSD phase loop explanation (Discuss → UI design (optional) → Plan → Execute → Verify → Ship), and the no-credentials-in-`.planning/` hygiene rule.

## Commits

- `4d37387` docs(26-01): add Keep-a-Changelog CHANGELOG.md
- `e3c696c` docs(26-01): add Contributor Covenant 2.1 CODE_OF_CONDUCT.md
- `1fa3c6d` docs(26-01): add full-depth CONTRIBUTING.md

## Deviation note (concurrency)

Commit `4d37387` (CHANGELOG.md) is **not strictly atomic**: it also swept up the volatile `.planning/` file deletions that plan 02 (GSD-26-repo-hygiene-02) had staged in the shared git index via `git rm --cached` while executing in parallel in the same wave. The net tree state is correct — volatile files are untracked, durable files remain tracked, and all files remain on disk — and plan 02's own commits (`008ff1b`, `d42f4fb`) are intact. This was left as-is rather than rewriting history (forbidden by executor rules and would diverge from plan 02's committed work). Commits `e3c696c` and `1fa3c6d` are clean single-file commits.

## Known Stubs

None. No TODO/FIXME/placeholder markers or skipped tests.

## Threat Flags

None. No secrets, credentials, or tokens were introduced. The CONTRIBUTING.md hygiene rule (D-05) explicitly forbids pasting real credentials into `.planning/` artefacts.

## Self-Check: PASSED

- `CHANGELOG.md` exists (52 lines, ≥40 min) — verified `# Changelog`, `[Unreleased]`, `[2.0.0]`, `[1.7.0]`, `multi-window-topology`, `composability-hardening`, `repo-hygiene`.
- `CODE_OF_CONDUCT.md` exists (133 lines, ≥40 min) — verified `Contributor Covenant`, `2.1`, `dsh-gsd-bundle`, `github.com/jaaty/dsh-gsd-bundle/issues`, `Attribution`.
- `CONTRIBUTING.md` exists (104 lines, ≥40 min) — verified `node --test`, `npm test`, `Discuss`, `Ship`, `credentials`, `.planning/`.
- All three commits exist on `phase-26`.
