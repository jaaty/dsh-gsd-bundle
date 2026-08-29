# Phase 27: ci-and-security - Context

**Gathered:** 2026-08-29T04:52:12.837Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a GitHub Actions workflow (.github/workflows/ci.yml) that runs the test suite on pull requests and on push to main; commit a package-lock.json so CI can install deps reproducibly with npm ci; run a full-history gitleaks secret scan of the git history and document the result confirming no credentials or tokens are exposed; add a lightweight gitleaks CI guard job that fails if a new secret is introduced, preventing future leaks.
**Out of scope:** Distribution research (npm publish vs clone-and-install) — phase 28; any functional changes to the GSD tools themselves; remediating any secrets the scan might find (handled if found, not a deliverable); configuring GitHub's native secret scanning.
</domain>

<decisions>
## Decisions
### CI workflow
- **D-01:** A GitHub Actions workflow is added at .github/workflows/ci.yml that runs the test suite. It triggers on pull_request and on push to main, so PRs are gated and main is always verified.
- **D-02:** CI runs on a single Node version, 24 (matching local dev), via actions/setup-node@v4. No version matrix.
- **D-03:** The test step runs `npm test`, which executes `node --test test/*.test.mjs` (Node's built-in runner). No test framework is added.
### Dependency install
- **D-04:** A package-lock.json is committed to the repo so CI can run `npm ci` for reproducible installs. None exists today; `dependencies` is empty and only peer deps (@deepseek-ai/*) are present.
### Secret scan
- **D-05:** The full-history secret scan uses gitleaks (Docker image zricethezav/gitleaks), scanning the entire git history for credentials and tokens.
- **D-06:** The full-history scan is a one-time audit run during this phase; its result (no credentials or tokens exposed) is documented in the phase artefacts (e.g. a scan report / VERIFICATION.md).
- **D-07:** A lightweight gitleaks CI guard job is added to the workflow that scans the PR's commits and fails if a new secret is introduced, preventing future leaks. The full-history scan itself is not a per-PR gate.
### Documentation
- **D-08:** The CI workflow and the secret-scan guard are documented in README (and CONTRIBUTING.md where it describes the test suite) so contributors know tests run in CI and secrets are scanned.
### Claude's Discretion
- Exact workflow YAML structure, job names, and step ordering.
- Exact gitleaks invocation (Docker container vs gitleaks action) and any gitleaks config.
- Whether the CI guard scans the full repo or only the PR diff.
- Exact wording and placement of the README/CONTRIBUTING documentation.
- Whether a CHANGELOG entry is added for this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Test command and dependency metadata the CI workflow must use
- `.planning/../package.json — scripts.test = `node --test test/*.test.mjs`; dependencies empty; peerDependencies @deepseek-ai/dsh-tools, schemastery, cordis, dsh-llm; no engines field`
### Test suite the workflow runs
- `.planning/../test/ — *.test.mjs files run by the built-in runner`
### Where the workflow file is added
- `.planning/../.github/ — does not exist yet; workflow goes at .github/workflows/ci.yml`
### Lockfile to add for npm ci
- `.planning/../package-lock.json — does not exist yet; must be generated and committed`
### Tracked file the secret scan must cover
- `.planning/../cordis.patch.yml — tracked, mode 600, a candidate the scan should check`
### Docs to extend with CI/security notes
- `.planning/../README.md — existing Features/Contributing sections`
- `.planning/../CONTRIBUTING.md — describes the test suite and PR workflow`
- `.planning/../CHANGELOG.md — Keep-a-Changelog, hand-maintained`
</canonical_refs>

<code_context>
## Code Context
- package.json scripts.test runs `node --test test/*.test.mjs`; no test framework, no engines field.
- No .github/ directory exists yet; the workflow is the first CI file.
- No package-lock.json exists; dependencies is empty and only peer deps are present (installed in node_modules).
- cordis.patch.yml is tracked (mode 600) and is a candidate the secret scan should check.
- Local dev runs Node v24.15.0; tests pass locally.
</code_context>

<specifics>
## Specifics
- CI trigger: 'PRs + push to main'.
- Node version: 'Single Node 24'.
- Dependency install: 'Add a lockfile, use npm ci'.
- Secret-scan tool: 'gitleaks'.
- Secret scan role: 'One-time audit + lightweight CI guard'.
</specifics>

<deferred>
## Deferred Ideas
- Distribution research (npm publish vs clone-and-install) — phase 28 (publish-research).
- GitHub native secret scanning configuration — not used; gitleaks covers the requirement.
</deferred>


---

*Phase: 27-ci-and-security*
*Context gathered: 2026-08-29*