# Phase 33: github-repo-config - Context

**Gathered:** 2026-08-29T19:10:59.986Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Configure the GitHub repository (github.com/jaaty/dsh-gsd-bundle) for discoverability and canonical linking: set a set of searchable topics, set the repo homepage URL to the npm package page, and enable GitHub's private vulnerability reporting repo setting (deferred from phase 32). Add a structural node:test that verifies the repo-level settings via `gh repo view`.
**Out of scope:** No changes to the bundle plugins or runtime code. No README/CHANGELOG/CONTRIBUTING edits. No change to the package.json homepage field (it stays as the GitHub repo URL per npm convention). No CI workflow changes. No new dependencies. No custom domain or docs site.
</domain>

<decisions>
## Decisions
### Homepage URL
- **D-01:** Set the GitHub repo homepage URL to https://www.npmjs.com/package/@dsh-gsd/bundle — the canonical location for a published npm package. The repo itself is already reachable at its GitHub URL, so the homepage points to the npm page for provenance.
### Topics
- **D-02:** Set the following searchable topics on the repo: dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent. These cover the harness ecosystem, the reimplemented core project, the project name, and the plugin/agent nature.
### Deferred setting from phase 32
- **D-03:** Also enable GitHub's private vulnerability reporting repo setting in this phase, closing the deferral recorded in phase 32 (security-policy-templates). This is a repo-level setting applied via gh, consistent with the rest of this phase.
### Verification / error handling
- **D-04:** Verification is structural: add a node:test that shells out to `gh repo view --json repositoryTopics,homepageUrl` (and the private-vuln-reporting setting) and asserts the configured values. Fail loudly with the real cause per the project's fail-fast convention. If gh is unauthenticated or the repo is unreachable, the test reports the real cause rather than silently passing.
### Scope edges
- **D-05:** The package.json homepage field is left unchanged (it points to the GitHub repo URL, the standard npm convention). The GitHub repo homepage (npm page) and the npm package homepage (GitHub repo) are independent and each canonical in its own context.
### Claude's Discretion
- Exact gh command flags used to set topics, homepage, and the private-vuln-reporting setting.
- Exact structure and file location of the structural node:test.
- Whether the structural test lives in a new test file or an existing one.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Package manifest
- `package.json — name @dsh-gsd/bundle, version 2.2.0, homepage field = https://github.com/jaaty/dsh-gsd-bundle (unchanged)`
### Project conventions
- `.planning/codebase/CONVENTIONS.md — real-cause fail-fast, plain ESM no build step, zero runtime dependencies`
### Phase 32 deferral
- `.planning/phases/GSD-32-security-policy-templates/GSD-32-security-policy-templates-CONTEXT.md — records the private-vuln-reporting setting deferred to phase 33`
### Existing structural test pattern
- `test/security-policy.test.mjs — phase 32's structural node:test pattern to mirror`
</canonical_refs>

<code_context>
## Code Context
- gh CLI authenticated as jaaty; repo is github.com/jaaty/dsh-gsd-bundle (public).
- gh repo view currently reports: description set, homepageUrl empty, repositoryTopics null.
- package.json homepage field = https://github.com/jaaty/dsh-gsd-bundle (to remain unchanged).
- Phase 32 added a structural node:test (test/security-policy.test.mjs) that asserts file presence and content — a reusable pattern for this phase's repo-setting assertions.
</code_context>

<specifics>
## Specifics
- Set repo homepage to https://www.npmjs.com/package/@dsh-gsd/bundle.
- Set topics: dsh, deepseek-harness, opengsd, gsd, git-ship-done, plugin, coding-agent.
- Enable GitHub private vulnerability reporting repo setting.
- Add a structural node:test asserting repositoryTopics, homepageUrl, and the private-vuln-reporting setting via gh repo view.
</specifics>

<deferred>
## Deferred Ideas
- README badges (phase 34 readme-badges).
- Any custom domain or dedicated docs site (not chosen).
</deferred>


---

*Phase: 33-github-repo-config*
*Context gathered: 2026-08-29*