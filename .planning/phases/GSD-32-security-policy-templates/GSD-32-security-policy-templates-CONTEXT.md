# Phase 32: security-policy-templates - Context

**Gathered:** 2026-08-29T18:53:53.873Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a SECURITY.md vulnerability-reporting policy and GitHub issue + pull-request templates so public contributors know how to report issues and open PRs: SECURITY.md at repo root referencing GitHub's private vulnerability reporting; two YAML issue forms (bug report, feature request) plus a config.yml keeping blank issues enabled under .github/ISSUE_TEMPLATE/; a single .github/PULL_REQUEST_TEMPLATE.md; add SECURITY.md to the package.json files whitelist; and link SECURITY.md from README.
**Out of scope:** Enabling GitHub's private vulnerability reporting repo setting (deferred to phase 33 github-repo-config). No runtime code changes to the bundle plugins. No CI workflow changes. No new dependencies. No email security contact.
</domain>

<decisions>
## Decisions
### Reporting channel
- **D-01:** SECURITY.md references GitHub's built-in private vulnerability reporting feature (report privately via the repo's Security tab) as the disclosure channel. No email contact is published. Enabling the private-vuln-reporting repo setting itself is deferred to phase 33 (github-repo-config).
### Supported versions
- **D-02:** The SECURITY.md supported-versions policy states that only the most recent published release receives security fixes (single maintained line for a small plugin bundle).
### Issue templates
- **D-03:** Add two YAML issue forms under .github/ISSUE_TEMPLATE/ (bug_report.yml, feature_request.yml) with structured fields, plus a config.yml that keeps blank issues enabled. Modern GitHub issue-form convention.
### PR template
- **D-04:** Add a single .github/PULL_REQUEST_TEMPLATE.md with a summary section, a checklist (tests pass, no secrets, changelog updated), and a note pointing to CONTRIBUTING.md and the GSD phase loop.
### Scope edges
- **D-05:** Add SECURITY.md to the package.json files whitelist so it ships with the npm package, and link it from README (consistent with how CONTRIBUTING.md and CODE_OF_CONDUCT.md are shipped and linked).
### Error handling / verification
- **D-06:** This phase has no runtime code; verification is structural. Add a lightweight node:test that asserts the template files exist at the correct paths, the YAML issue-form front-matter parses, SECURITY.md is present, package.json files whitelist includes SECURITY.md, and README links it. Fail loudly with the real cause per the project's fail-fast convention.
### Claude's Discretion
- Exact wording of SECURITY.md, the issue forms, and the PR template.
- Exact YAML field names and labels in the issue forms.
- Exact placement of the SECURITY.md link in README.
- Whether the structural test lives in an existing test file or a new one.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing contributor guidance
- `CONTRIBUTING.md — existing contributor workflow, 'Reporting issues' section, no-secrets hygiene, GSD phase loop description`
### Existing community docs
- `CODE_OF_CONDUCT.md — existing community doc shipped and linked from README`
- `CHANGELOG.md — existing shipped doc`
- `DISTRIBUTION.md — existing shipped doc`
### Package manifest
- `package.json — files whitelist to extend with SECURITY.md; name @dsh-gsd/bundle, version 2.2.0`
### README
- `README.md — to add a SECURITY.md link alongside CONTRIBUTING/CODE_OF_CONDUCT links`
### CI / secret scan
- `.github/workflows/ci.yml — existing CI with gitleaks secret-scan guard on PRs`
### Project conventions
- `.planning/codebase/CONVENTIONS.md — real-cause fail-fast, plain ESM no build step, zero runtime dependencies`
</canonical_refs>

<code_context>
## Code Context
- Repo root already has CONTRIBUTING.md, CODE_OF_CONDUCT.md, LICENSE, NOTICE, CHANGELOG.md, DISTRIBUTION.md — SECURITY.md will follow the same pattern.
- .github/ currently contains only workflows/ci.yml; there is no ISSUE_TEMPLATE/ or PULL_REQUEST_TEMPLATE yet.
- package.json files whitelist ships README.md, NOTICE, DISTRIBUTION.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, CHANGELOG.md — SECURITY.md will be added.
- README.md already links to CONTRIBUTING.md and CODE_OF_CONDUCT.md; a SECURITY.md link will be added alongside them.
- gh CLI authenticated as jaaty; repo is github.com/jaaty/dsh-gsd-bundle (public).
</code_context>

<specifics>
## Specifics
- SECURITY.md at repo root referencing GitHub private vulnerability reporting.
- .github/ISSUE_TEMPLATE/bug_report.yml and feature_request.yml (YAML issue forms).
- .github/ISSUE_TEMPLATE/config.yml keeping blank issues enabled.
- .github/PULL_REQUEST_TEMPLATE.md with summary + checklist + GSD/CONTRIBUTING note.
- Add SECURITY.md to package.json files whitelist.
- Link SECURITY.md from README.
</specifics>

<deferred>
## Deferred Ideas
- Enabling GitHub's private vulnerability reporting repo setting (phase 33 github-repo-config).
- Any email security contact (not chosen).
</deferred>


---

*Phase: 32-security-policy-templates*
*Context gathered: 2026-08-29*