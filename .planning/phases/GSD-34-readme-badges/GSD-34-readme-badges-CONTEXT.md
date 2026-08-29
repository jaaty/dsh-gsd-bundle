# Phase 34: readme-badges - Context

**Gathered:** 2026-08-29T19:39:25.177Z
**Status:** Ready for planning

<domain>
## Phase Boundary
**In scope:** Adding three health/provenance badges (CI, License, npm) to the top of README.md.
**Out of scope:** Adding badges for other metrics (e.g. code coverage) or modifying other documentation.
</domain>

<decisions>
## Decisions
### Visuals & Placement
- **D-01:** Badges placed immediately below the main # dsh-gsd-bundle header.
- **D-02:** Use 'flat-square' style for all badges for a modern engineering look.
### Badge Sources
- **D-03:** CI Status: Linked to .github/workflows/ci.yml via GitHub Actions badge.
- **D-04:** License: MIT license badge.
- **D-05:** npm Version: Linked to @dsh-gsd/bundle.
### Claude's Discretion
- Exact Shields.io URL parameters for the npm version badge (e.g. choosing between 'npm' and 'npm-version' labels).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### README Badges
- `README.md — Target file for badge insertion`
- `.github/workflows/ci.yml — CI workflow for status badge`
- `package.json — npm package name source`
</canonical_refs>

<code_context>
## Code Context
- Standard Markdown badge syntax using Shields.io or GitHub native badges.
</code_context>

<specifics>
## Specifics
- CI-status, license, and npm-version badges.
</specifics>

<deferred>
## Deferred Ideas
- (none)
</deferred>


---

*Phase: 34-readme-badges*
*Context gathered: 2026-08-29*