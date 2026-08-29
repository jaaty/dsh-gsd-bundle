---
phase: 33-github-repo-config
plan: 01
subsystem: repository-config
tags: [github, repo-config, topics, homepage, vulnerability-reporting, tests]
dependency_graph:
  requires: []
  provides: [test/repo-config.test.mjs]
  affects: [phase 34 readme-badges]
tech-stack: [gh-cli, node:test]
key-files:
  created: [test/repo-config.test.mjs]
  modified: []
decisions: [D-01, D-02, D-03, D-04, D-05]
metrics:
  duration: 2026-08-29
  completed: 2026-08-29
status: complete
actuals:
  tasks: 3
  commits: 3
---

# Phase 33 Plan 01: GitHub Repo Configuration Summary

Configured the GitHub repository `jaaty/dsh-gsd-bundle` for discoverability and canonical linking: set the homepage URL to the npm package page, set seven searchable topics, made the repo public, and enabled GitHub private vulnerability reporting — all proven by a structural `node:test` that shells out to `gh` and asserts the resulting repo state.

## Tasks Completed

1. **Task 1 — Homepage URL (tracer, D-01, D-05):** Ran `gh repo edit --homepage https://www.npmjs.com/package/@dsh-gsd/bundle` to set the repo homepage to the npm package page (the canonical location for a published npm package). Created `test/repo-config.test.mjs` mirroring the phase-32 structural pattern, with a `ghRepoView(fields)` helper that wraps `execFileSync("gh", ["repo", "view", "--json", fields])` so a non-zero exit throws an Error carrying the real gh stderr (D-04 fail-loudly). Tests assert the repo homepage URL equals the npm page (D-01) and that the `package.json` homepage field is unchanged at the GitHub URL (D-05).
2. **Task 2 — Seven searchable topics (D-02):** Ran `gh repo edit --add-topic dsh --add-topic deepseek-harness --add-topic opengsd --add-topic gsd --add-topic git-ship-done --add-topic plugin --add-topic coding-agent`. Extended the test with a topics assertion that checks `gh repo view --json repositoryTopics` contains all seven.
3. **Task 3 — Visibility + private vulnerability reporting (D-03, OQ-1):** The repo was initially PRIVATE, but GitHub private vulnerability reporting is only available on public repositories (the live `GET /repos/.../private-vulnerability-reporting` returned 404). The human authorized making the repo public. Ran `gh repo edit --visibility public --accept-visibility-change-consequences`, then `gh api -X PUT repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting -f enabled=true`. Extended the test with two assertions: `gh repo view --json isPrivate` returns `false` (OQ-1 prerequisite) and `gh api .../private-vulnerability-reporting --jq .enabled` returns `true` (D-03). NOTE: this setting is NOT exposed by `gh repo view --json` — it MUST be queried via the REST API, per the RESEARCH.md correction to D-04's phrasing.

## Verification

- `node --test test/repo-config.test.mjs` exits 0: 5 tests, 0 failures.
- `npm test` passes: 431 tests, 0 failures (was 426 before this plan; +5 new, no regression).
- `gh repo view --json homepageUrl` returns `https://www.npmjs.com/package/@dsh-gsd/bundle` (D-01).
- `gh repo view --json repositoryTopics` contains all of dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent (D-02).
- `gh repo view --json isPrivate` returns `false` (repo is public, OQ-1).
- `gh api repos/jaaty/dsh-gsd-bundle/private-vulnerability-reporting --jq .enabled` returns `true` (D-03).
- `package.json` homepage field unchanged at `https://github.com/jaaty/dsh-gsd-bundle` (D-05).

## Known Stubs

None. No TODO/FIXME/placeholder/skipped tests introduced.

## Threat Flags

No runtime code added. The repo was made public (a deliberate, human-authorized visibility change) to satisfy D-03. The structural test shells out to `gh` (already a project tool used by `lib/ship.js` and `lib/map-codebase.js`); no credentials or tokens are embedded. The gitleaks secret-scan guard on PRs is not triggered.

## Self-Check: PASSED

- `test/repo-config.test.mjs` exists (150 lines ≥ 40 min), passes standalone and in `npm test` (431/431).
- Repo homepage URL, all seven topics, public visibility, and private vulnerability reporting are all set and asserted.
- `package.json` homepage field unchanged (D-05).
- No new dependency added (`dependencies` stays `{}`).
- Three atomic commits created: `c8da95e` (homepage test, D-01/D-05), `82dbb82` (topics test, D-02), and the Task 3 commit (visibility + vuln assertions, D-03/OQ-1).
