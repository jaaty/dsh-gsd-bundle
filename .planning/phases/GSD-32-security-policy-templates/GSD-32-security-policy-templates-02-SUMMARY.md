---
phase: 32-security-policy-templates
plan: 02
subsystem: repository-docs
tags: [security, policy, docs, issue-templates, pr-template, tests]
dependency_graph:
  requires: [GSD-32-security-policy-templates-01]
  provides: [.github/ISSUE_TEMPLATE/*, .github/PULL_REQUEST_TEMPLATE.md, test/security-policy.test.mjs]
  affects: [phase 33 github-repo-config]
tech-stack: [yaml, markdown, node:test]
key-files:
  created: [.github/ISSUE_TEMPLATE/bug_report.yml, .github/ISSUE_TEMPLATE/feature_request.yml, .github/ISSUE_TEMPLATE/config.yml, .github/PULL_REQUEST_TEMPLATE.md, test/security-policy.test.mjs]
  modified: []
decisions: [D-03, D-04, D-06]
metrics:
  duration: 2026-08-29
  completed: 2026-08-29
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 32 Plan 02: GitHub Issue Forms + PR Template + Structural Test Summary

Created the GitHub issue forms and pull-request template so public contributors have structured paths to report bugs, request features, and open PRs, then added a dependency-free structural test that proves every REL-03 deliverable and every D-NN decision is present.

## Tasks Completed

1. **Task 1 — GitHub issue forms (tracer):** Created `.github/ISSUE_TEMPLATE/bug_report.yml` (name/description/title + body with a `type: textarea` description, steps-to-reproduce, expected-behaviour, environment, and a `type: checkboxes` confirmation; label `bug`), `.github/ISSUE_TEMPLATE/feature_request.yml` (name/description/title + body with problem-statement, proposed-solution, alternatives textareas and a confirmation checkbox; label `enhancement`), and `.github/ISSUE_TEMPLATE/config.yml` with `blank_issues_enabled: true` (D-03). All YAML is valid (consistent indentation, no tabs, no unquoted colons); no real credentials/tokens/emails (gitleaks-safe).
2. **Task 2 — Pull-request template:** Created `.github/PULL_REQUEST_TEMPLATE.md` with a `## Summary` section, a `## Checklist` (tests pass, no secrets/credentials, changelog updated under `## [Unreleased]` per Keep-a-Changelog), and a note pointing to CONTRIBUTING.md and the GSD phase loop (D-04).
3. **Task 3 — Structural verification test:** Created `test/security-policy.test.mjs` (127 lines) following the `test/license.test.mjs` / `test/repo-hygiene.test.mjs` pattern (plain `node:test` + `node:assert/strict`, `ROOT` via `new URL("../", import.meta.url).pathname`, `readRepoFile` helper). 11 tests assert: SECURITY.md sections + private-vuln-reporting reference + no email (D-01) + single-maintained-line (D-02); package.json files includes SECURITY.md (D-05); README links SECURITY.md (D-05); both issue forms' name/description/body + textarea (D-03); config.yml blank_issues_enabled (D-03); PR template summary + checklist (tests/secrets/changelog) + CONTRIBUTING/GSD note (D-04). No YAML parser or new dependency added (D-06).

## Verification

- `node --test test/security-policy.test.mjs` exits 0: 11 tests, 0 failures.
- `npm test` passes: 426 tests, 0 failures (was 415 before this plan; +11 new, no regression).
- Task 1 verify: all three files present with required structural keys; `blank_issues_enabled: true` present.
- Task 2 verify: `## Summary`, `CONTRIBUTING.md`, `GSD`, and checklist items (tests/changelog/secrets) all present.
- Task 3 verify: test file auto-discovered by `node --test test/*.test.mjs`; `package.json` `dependencies` stays `{}` (no new dependency).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

No runtime code added. The issue forms and PR template contain no real credentials, tokens, or email addresses, so the gitleaks secret-scan guard on PRs is not triggered. The only security-adjacent note: private vulnerability reporting is referenced (D-01) but the enabling repo setting is deferred to phase 33 (github-repo-config), as agreed.

## Self-Check: PASSED

- `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` exist with required structural keys.
- `.github/PULL_REQUEST_TEMPLATE.md` exists with summary + checklist + CONTRIBUTING/GSD note.
- `test/security-policy.test.mjs` exists (127 lines ≥ 80 min), passes standalone and in `npm test` (426/426).
- No new dependency added (`dependencies` stays `{}`).
- Three atomic commits created: `fa0439d`, `2ae71a9`, `3afdbd1`.
