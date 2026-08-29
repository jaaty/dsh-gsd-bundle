# Phase 34: readme-badges - Context

**Gathered:** 2026-08-29T21:03:12.446Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Add a shields.io badge row to the README right under the `# dsh-gsd-bundle` H1 showing exactly three badges — CI-status, license, npm-version — each rendered via standard shields.io image URLs and linked to an appropriate destination. Add a small structural test asserting the badge image URLs are present and well-formed. Update the `Release status` blurb to reference the currently-released v2.2.0 `public-launch` milestone.
**Out of scope:** No new badges beyond the three named (no npm-downloads badge). No dynamic/latest version badge. No changes to CI workflow, LICENSE, or package.json. No change to the npm-page homepage decision. No rework of the release-status narrative beyond a v2.2.0 reference.
</domain>

<decisions>
## Decisions
### Badge set & scope
- **D-01:** Exactly the three badges named in REL-05: CI-status, license, and npm-version. Do not add an npm-downloads or any other badge.
### CI-status badge
- **D-02:** CI badge targets the whole `CI` workflow via shields.io GitHub-Actions badge for `github/workflows/ci.yml`, on branch `main` (workflow path `.github/workflows/ci.yml`, branch `main`), so it reflects the full workflow status including the PR-only secret-scan job gate.
### npm-version badge
- **D-03:** npm-version badge is a static mirror of the current release (v2.2.0) rendered via shields.io npm-version badge, not a dynamic `latest`.
### Badge destinations (links)
- **D-04:** Badges are clickable: npm-version links to the npm package page (consistent with the phase-33 D-01 homepage decision), license links to the LICENSE file, CI-status links to the CI workflow file.
### Placement & styling
- **D-05:** Place the badge row directly under the `# dsh-gsd-bundle` H1 on line 1, standard shields.io image links in a single line, before the inton paragraph.
### Testability
- **D-06:** Add a small structural test (consistent with the repo's existing test/ structural-test discipline) asserting the three badge image URLs are present in README.md and well-formed — pointing at shields.io and resolving to the expected npm/GitHub targets.
### Release-status narrative
- **D-07:** Update the `Release status` section (and the v2.2.0 reference) so the currently-released milestone `public-launch` v2.2.0 (this 34-phase milestone) is referenced as the latest release alongside the prior v2.1 release note.
### Claude's Discretion
- Exact URL query parameters for each shield (color, label style) — defaults are fine unless a specific style is later requested.
- Naming and exact assertion content of the structural test file, as long as it asserts D-06 coverage.
- Exact wording of the release-status blurb update, within D-07.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### README structure and title placement
- `README.md — H1 on line 1; no existing badge row; Release status on line 11`
### CI workflow identity
- `.github/workflows/ci.yml — workflow name CI, Test job + PR-only Secret scan job`
### Repo identity for badge targets
- `package.json — name @dsh-gsd/bundle, version 2.2.0, license MIT, homepage npm page`
### Existing structural-test discipline
- `test/repo-config.test.mjs — existing structural repo test pattern to mirror for the new badge test`
</canonical_refs>

<code_context>
## Code Context
- README.md first 33 lines — H1 on line 1, Release status section on line 11 currently references v2.1.0.
- .github/workflows/ci.yml — workflow named CI with Test and PR-only Secret scan jobs.
- package.json — @dsh-gsd/bundle v2.2.0, MIT, homepage set to npm page (phase 33, D-01).
- test/repo-config.test.mjs — existing structural test that asserts repo config; good template for a README-badge structural test.
</code_context>

<specifics>
## Specifics
- Exactly three badges (CI-status, license, npm-version), no extras.
- CI badge on the whole workflow, branch main.
- npm-version badge static mirroring v2.2.0.
- All three badges clickable (npm page / LICENSE file / CI workflow).
- Badge row directly under the H1.
- Small structural test asserting the badge links are present and well-formed.
</specifics>

<deferred>
## Deferred Ideas
- npm-downloads badge — deliberately excluded; could be a follow-up.
- Dynamic/latest npm version badge — excluded; static mirror chosen for determinism.
</deferred>


---

*Phase: 34-readme-badges*
*Context gathered: 2026-08-29*