---
phase: 27-ci-and-security
plan: 01
subsystem: ci-security
tags: [ci, github-actions, npm, gitleaks, security]
requires:
  - package.json (scripts.test = node --test test/*.test.mjs; peerDependencies @deepseek-ai/*)
provides:
  - .github/workflows/ci.yml (CI workflow: test job + gitleaks guard job)
  - package-lock.json (lockfileVersion 3, enables reproducible npm ci)
affects:
  - CI behaviour on pull_request and push to main
tech-stack:
  - GitHub Actions (actions/checkout@v4, actions/setup-node@v4)
  - npm (npm ci, package-lock.json lockfileVersion 3)
  - gitleaks (zricethezav/gitleaks Docker image)
  - Node 24
key-files:
  created:
    - .github/workflows/ci.yml
    - package-lock.json
  modified: []
decisions:
  - D-01 (workflow triggers on pull_request and push to main)
  - D-02 (single Node 24, no matrix)
  - D-03 (npm test runs node --test test/*.test.mjs)
  - D-04 (committed package-lock.json for npm ci)
  - D-05 (gitleaks via zricethezav/gitleaks Docker image)
  - D-07 (lightweight gitleaks CI guard job, PR-only via github.event_name == 'pull_request')
metrics:
  duration: single session
  completed: 2026-08-29
  tasks: 3
  commits: 3
status: complete
---

# Phase 27 Plan 01: CI Workflow + Reproducible Lockfile Summary

Delivered the GitHub Actions CI workflow (test job + gitleaks secret-scan guard) and a committed `package-lock.json` so CI installs reproducibly with `npm ci`.

## What was built

### Task 1 — package-lock.json (D-04)
- Generated `package-lock.json` via `npm install --package-lock-only --ignore-scripts --cache /tmp/npmcache` (the `--cache` flag is required because the default npm cache is read-only in this sandbox).
- `lockfileVersion: 3`; resolves the four `@deepseek-ai/*` peer deps (dsh-tools, schemastery, cordis, dsh-llm). 120 lines.
- Committed: `cca9807 chore(27-01): add package-lock.json for reproducible npm ci installs`.

### Task 2 — ci.yml test job (D-01, D-02, D-03)
- Created `.github/workflows/ci.yml` (the first CI file in the repo).
- Triggers: `pull_request: {}` and `push: { branches: [main] }`.
- `test` job on `ubuntu-latest`: `actions/checkout@v4` → `actions/setup-node@v4` (node-version: 24, cache: npm) → `npm ci` → `npm test`. No test framework added; no matrix.
- Committed: `1dc091d feat(27-01): add GitHub Actions CI workflow with test job`.

### Task 3 — gitleaks guard job (D-05, D-07)
- Added a `secrets` job guarded by `if: github.event_name == 'pull_request'` (no pull_request context on push to main; main is already gated by the PR guard).
- `actions/checkout@v4` with `fetch-depth: 0` so both base and head SHAs are present.
- Runs gitleaks via the `zricethezav/gitleaks` Docker image over a bare revision range `--log-opts="${{ github.event.pull_request.base.sha }}...${{ github.event.pull_request.head.sha }}"`. Uses a bare range (not the invalid `--diff` form). gitleaks exits non-zero on a new secret, failing the guard.
- Committed: `a7d3d75 feat(27-01): add gitleaks secret-scan guard job to CI workflow`.

## Acceptance criteria

All tasks' `<acceptance_criteria>` and `<verify>` checks pass (verified inline before each commit). Workflow is 52 lines (≥40 min_lines); lockfile is 120 lines (≥40 min_lines).

## Deviations

- One comment initially mentioned the `--diff` token, which tripped the "no `--diff`" acceptance check. Reworded the comment to avoid the literal token; behaviour unchanged. Re-verified clean.

## TDD Gate Compliance

Not applicable — this plan is CI configuration (no `test:` task). No TDD gates required.

## Known Stubs

None. No TODO/FIXME/placeholder text in `.github/workflows/ci.yml` or `package-lock.json`.

## Threat Flags

- The gitleaks guard relies on `github.event.pull_request.base.sha`/`head.sha`, which requires `fetch-depth: 0` (provided) so the base commit is present in the checkout. A shallow checkout would break the range scan — mitigated.
- The guard only runs on `pull_request` events; push-to-main is gated upstream by the PR guard. This is within Claude's Discretion per CONTEXT.md and the RESEARCH.md recommendation (OQ-6).
- `package-lock.json` was generated in a sandbox with a custom `--cache` dir; the lockfile content itself is reproducible (lockfileVersion 3, peer-dep resolution) and CI uses the default cache on hosted runners.

## Self-Check: PASSED

- `.github/workflows/ci.yml` exists (52 lines).
- `package-lock.json` exists, tracked, lockfileVersion 3 (120 lines).
- All three plan commits present on branch `phase-27`:
  - `cca9807 chore(27-01): add package-lock.json for reproducible npm ci installs`
  - `1dc091d feat(27-01): add GitHub Actions CI workflow with test job`
  - `a7d3d75 feat(27-01): add gitleaks secret-scan guard job to CI workflow`